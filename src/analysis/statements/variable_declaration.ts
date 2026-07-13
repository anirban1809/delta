import { string, TokenKind } from "../../ast/tokens.js";
import {
    TypeValue,
    type IntegerLiteral,
    type Type,
    type VariableDeclarationStatement,
} from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import { SymbolKind } from "../analyzer.js";
import type { Scope } from "../scope.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";
import { TypeAnalyzer } from "../type_analyzer.js";

export class VariableDeclarationStatementAnalyzer {
    typeAnalyzer: TypeAnalyzer;
    expr: ExpressionAnalyzer;

    constructor(public diagnostics: Diagnostics) {
        this.typeAnalyzer = new TypeAnalyzer(diagnostics);
        this.expr = new ExpressionAnalyzer(diagnostics);
    }

    analyze(s: VariableDeclarationStatement, scope: Scope) {
        // Rule: declarations cannot reuse a name visible from this scope.
        if (scope.getSymbol(s.name.name)) {
            this.addError(s, "duplicate identifier " + s.name.name + " in this scope");
            return;
        }

        // Rule: an explicitly named custom type must resolve before use.
        let wantT = this.resolveDeclaredType(s, scope);
        if (!wantT) {
            return;
        }

        // Rule: only `let` may omit an initializer; its explicit type is retained.
        if (!s.value) {
            this.register(s, scope, wantT);
            return;
        }

        // Rule: analyze the initializer before comparing it with the declared type.
        const haveT = this.expr.analyze(s.value, scope);
        if (this.typeAnalyzer.isInvalidType(haveT)) {
            // Expression analysis has already emitted the relevant diagnostic.
            return;
        }

        // Rule: custom types produced by an initializer must also resolve.
        if (this.typeAnalyzer.isCustomType(haveT) && !scope.getSymbol(haveT.name.name)) {
            this.addError(s, "unknown type identifier: " + haveT.name.name);
            return;
        }

        // Rule: an omitted annotation is inferred from the initializer.
        if (this.typeAnalyzer.isInvalidType(wantT)) {
            wantT = haveT;
            s.type = haveT;
        }

        this.register(s, scope, wantT);

        if (!this.isValidEnumInitializer(s, wantT)) {
            return;
        }

        // Rule: matching types are valid, subject to integer literal checks.
        if (this.typeAnalyzer.typesMatch(wantT, haveT)) {
            this.checkMatchingIntegerInitializer(s, wantT, haveT, scope);
            return;
        }

        // Rule: numeric literal assignments are allowed when the literal fits.
        if (this.typeAnalyzer.isInteger(haveT) && this.typeAnalyzer.isInteger(wantT)) {
            this.checkIntegerConversion(s, wantT);
            return;
        }

        // Rule: float literals may target either float type, and integer/float pairs are accepted.
        if (
            (this.typeAnalyzer.isFloat(haveT) &&
                this.typeAnalyzer.isFloat(wantT) &&
                s.value.kind == "float_literal") ||
            (this.typeAnalyzer.isInteger(haveT) && this.typeAnalyzer.isFloat(wantT)) ||
            (this.typeAnalyzer.isFloat(haveT) && this.typeAnalyzer.isInteger(wantT))
        ) {
            return;
        }

        // Rule: aliases are compatible with their underlying type; unions accept their variants.
        if (
            this.typeAnalyzer.isAliasOf(wantT, haveT, scope) ||
            this.typeAnalyzer.isAliasOf(haveT, wantT, scope) ||
            (wantT.kind == "union" && this.typeAnalyzer.isUnionVariant(wantT, haveT))
        ) {
            return;
        }

        // Rule: all remaining conversions require an explicit cast.
        this.addConversionError(s, wantT, haveT);
    }

    private resolveDeclaredType(s: VariableDeclarationStatement, scope: Scope): Type | undefined {
        if (!this.typeAnalyzer.isCustomType(s.type)) {
            return s.type;
        }

        const type = scope.getSymbol(s.type.name.name)?.type;
        if (!type) {
            this.addError(s, "unknown type identifier " + s.type.name.name);
            return;
        }

        s.type = type;
        return type;
    }

    private register(s: VariableDeclarationStatement, scope: Scope, type: Type) {
        scope.addSymbol({
            name: s.name.name,
            kind: s.mutable ? SymbolKind.SymbolLocalLet : SymbolKind.SymbolLocalConst,
            type,
            assigned: !!s.value,
        });
    }

    private isValidEnumInitializer(s: VariableDeclarationStatement, wantT: Type): boolean {
        if (wantT.kind != "enum" || !s.value) {
            return true;
        }

        // Rule: an enum integer literal must name one of the enum's declared values.
        if (s.value.kind == "integer_literal") {
            const literal = s.value;
            const variant = wantT.variants?.find((x) => x.value.value == literal.value);
            if (variant) {
                return true;
            }

            this.addError(
                s,
                "illegal member variant value " + literal.value + " for enum " + wantT.name.name,
            );
            return false;
        }

        // Rule: a bare identifier cannot establish which enum variant is intended.
        if (s.value.kind == "identifier") {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.value.position,
                    "cannot determine valid literal member variant for enum " + wantT.name.name,
                ),
            );
            return false;
        }

        return true;
    }

    private checkMatchingIntegerInitializer(
        s: VariableDeclarationStatement,
        wantT: Type,
        haveT: Type,
        scope: Scope,
    ) {
        if (
            !this.typeAnalyzer.isInteger(haveT) ||
            !this.typeAnalyzer.isInteger(wantT) ||
            !s.value
        ) {
            return;
        }

        // Rule: unary minus cannot be applied to an unsigned operand.
        if (
            s.value.kind == "unary_expression" &&
            s.value.operator == string(TokenKind.Symbol_Minus)
        ) {
            const operandType = this.expr.analyze(s.value.operand, scope);
            if (operandType.value.startsWith("Type_U")) {
                this.addError(
                    s,
                    "unary - is not allowed on unsigned type " + operandType.name.name,
                    s.value.position,
                );
            }
            return;
        }

        // Rule: integer literals must fit the declared integer type.
        if (
            s.value.kind == "integer_literal" &&
            !this.typeAnalyzer.checkIntegerRange(wantT, s.value)
        ) {
            this.addIntegerRangeError(s, wantT, s.value);
        }
    }

    private checkIntegerConversion(s: VariableDeclarationStatement, wantT: Type) {
        if (!s.value || (s.value.kind != "integer_literal" && s.value.kind != "unary_expression")) {
            return;
        }

        if (s.value.kind == "integer_literal") {
            if (!this.typeAnalyzer.checkIntegerRange(wantT, s.value)) {
                this.addIntegerRangeError(s, wantT, s.value);
            }
            return;
        }

        if (s.value.operand.kind != "integer_literal") {
            return;
        }

        // Rule: a negative literal is checked using its signed value, not its magnitude.
        const negativeLiteral = {
            ...s.value.operand,
            value: "-" + s.value.operand.value,
        };
        if (!this.typeAnalyzer.checkIntegerRange(wantT, negativeLiteral)) {
            this.addIntegerRangeError(s, wantT, s.value.operand);
        }
    }

    private addConversionError(s: VariableDeclarationStatement, wantT: Type, haveT: Type) {
        const message =
            wantT.value == TypeValue.Type_Bool
                ? `no implicit conversion from \`${haveT.name.name}\` to \`${wantT.name.name}\`;`
                : `no implicit conversion from \`${haveT.name.name}\` to \`${wantT.name.name}\`; ` +
                  `use an explicit cast \`${wantT.name.name}(x)\``;
        this.addError(s, message, s.type.position);
    }

    private addIntegerRangeError(
        s: VariableDeclarationStatement,
        type: Type,
        literal: IntegerLiteral,
    ) {
        this.addError(
            s,
            `integer literal \`${literal.value}\` does not fit in \`${type.name.name}\``,
            s.value?.position,
        );
    }

    private addError(s: VariableDeclarationStatement, message: string, position = s.position) {
        this.diagnostics.addError(Error(this.diagnostics.fileName, "semantic", position, message));
    }
}
