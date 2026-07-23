import { string, TokenKind } from "../../ast/tokens.js";
import {
    CreateType,
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

        if (this.typeAnalyzer.isIndirection(s.type) && s.value?.kind != "new_expression") {
            this.addError(
                s,
                "indirection types are only permitted in record fields and function parameters; a local staging handle must be initialized directly with `new`",
                s.type.position,
            );
            return;
        }

        // Rule: an explicitly named custom type must resolve before use.
        let wantT = this.resolveDeclaredType(s, scope);
        if (!wantT) {
            // Keep the declared binding in scope so later uses do not produce
            // an unrelated "unknown identifier" cascade.
            this.register(s, scope, CreateType("invalid", TypeValue.TypeInvalid));
            return;
        }

        // Rule: only `let` may omit an initializer; its explicit type is retained.
        if (!s.value) {
            this.register(s, scope, wantT);
            return;
        }

        if (
            s.value.kind == "object_literal" &&
            !s.value.type.name.name &&
            !this.typeAnalyzer.isInvalidType(wantT)
        ) {
            s.value.type = structuredClone(wantT);
        }

        // Rule: analyze the initializer before comparing it with the declared type.
        let haveT = this.expr.analyze(
            s.value,
            scope,
            this.typeAnalyzer.isInvalidType(wantT) ? undefined : wantT,
        );
        if (s.value.kind == "new_expression" && this.typeAnalyzer.isIndirection(wantT)) {
            const expectedInner = wantT.typeParameters?.[0];
            const actualInner = haveT.typeParameters?.[0];
            if (
                expectedInner &&
                actualInner &&
                (this.typeAnalyzer.typesMatch(expectedInner, actualInner) ||
                    this.typeAnalyzer.isAliasOf(expectedInner, actualInner, scope))
            ) {
                haveT = structuredClone(wantT);
                s.value.expressionType = haveT;
            }
        }
        if (
            s.value.kind != "new_expression" &&
            s.value.kind != "move_expression" &&
            s.value.kind != "clone_expression" &&
            this.typeAnalyzer.isIndirection(haveT)
        ) {
            const pointee = haveT.typeParameters?.[0];
            if (
                pointee &&
                (this.typeAnalyzer.isInvalidType(wantT) ||
                    this.typeAnalyzer.typesMatch(wantT, pointee) ||
                    this.typeAnalyzer.isAliasOf(wantT, pointee, scope))
            ) {
                haveT = this.expr.dereferenceOwnedValue(s.value, haveT);
            }
        }
        if (this.typeAnalyzer.isInvalidType(haveT)) {
            // Expression analysis has already emitted the relevant diagnostic.
            this.register(s, scope, wantT);
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

        if (
            ["identifier", "member_access_expression", "index_expression"].includes(
                s.value.kind,
            )
        ) {
            const tier = this.typeAnalyzer.ownershipTier(haveT, scope);
            if (tier != "copyable") {
                this.addError(
                    s,
                    tier == "unique"
                        ? `type ${haveT.name.name} is unique and cannot be copied; move a whole mutable binding instead`
                        : `type ${haveT.name.name} is non-copyable; use move on a whole binding or clone this value`,
                    s.value.position,
                );
                this.register(s, scope, wantT);
                return;
            }
        }

        this.register(s, scope, wantT);

        if (!this.isValidEnumInitializer(s, wantT)) {
            return;
        }
        if (wantT.kind == "enum") return;

        // Static-array dimensions are part of the type. Both the element type
        // and every dimension must match, including for nested literals.
        if (wantT.arrayLengths?.length || haveT.arrayLengths?.length) {
            if (this.typeAnalyzer.arrayTypesMatch(wantT, haveT)) {
                return;
            }

            if (!this.typeAnalyzer.arrayDimensionsMatch(wantT, haveT)) {
                this.addError(
                    s,
                    "length of array literal value does not match with declared type",
                    s.value.position,
                );
                return;
            }

            // Integer literals adopt the annotated integer element type.
            if (this.typeAnalyzer.isInteger(haveT) && this.typeAnalyzer.isInteger(wantT)) {
                // Rule: numeric literal assignments are allowed when the literal fits.
                this.checkIntegerConversion(s, wantT);
                return;
            }
            this.addError(
                s,
                "type of array literal does not match with the declared type",
                s.value.position,
            );
            return;
        }

        // Rule: matching types are valid, subject to integer literal checks.
        if (this.typeAnalyzer.typesMatch(wantT, haveT)) {
            this.checkMatchingIntegerInitializer(s, wantT, haveT, scope);
            return;
        }

        if (this.typeAnalyzer.isInteger(haveT) && this.typeAnalyzer.isInteger(wantT)) {
            // Rule: numeric literal assignments are allowed when the literal fits.
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
        if (s.type.arrayLengths?.some((length) => length == 0)) {
            this.addError(s, "zero length arrays types are not allowed!", s.type.position);
            return;
        }

        if (this.typeAnalyzer.isIndirection(s.type)) {
            return this.validateIndirectionType(s.type, s, scope) ? s.type : undefined;
        }

        if (!this.typeAnalyzer.isCustomType(s.type)) {
            return s.type;
        }

        const typeArguments = s.type.typeParameters;
        let type = scope.getSymbol(s.type.name.name)?.type;
        if (!type) {
            if (s.type.value != TypeValue.TypeGeneric) {
                this.addError(s, "unknown type identifier " + s.type.name.name, s.type.position);
                return;
            } else {
                type = s.type;
            }
        }

        const declaredTypeParameters = type.typeParameters ?? [];
        if (declaredTypeParameters.length != (typeArguments?.length ?? 0)) {
            this.addError(
                s,
                `mismatched type argument count, want ${declaredTypeParameters.length}, got ${typeArguments?.length ?? 0}`,
                s.type.position,
            );
            return;
        }

        const bindings = new Map<string, Type>();
        declaredTypeParameters.forEach((parameter, index) => {
            bindings.set(parameter.name.name, typeArguments![index]!);
        });
        const resolvedType = this.typeAnalyzer.substituteType(type, bindings);
        resolvedType.arrayLengths = s.type.arrayLengths ?? resolvedType.arrayLengths;
        resolvedType.slice = s.type.slice ?? resolvedType.slice;
        resolvedType.typeParameters = typeArguments;
        s.type = resolvedType;
        return resolvedType;
    }

    private validateIndirectionType(
        type: Type,
        statement: VariableDeclarationStatement,
        scope: Scope,
    ): boolean {
        const arguments_ = type.typeParameters ?? [];
        if (arguments_.length != 1) {
            this.addError(
                statement,
                `${type.name.name}<T> requires exactly one type argument`,
                type.position,
            );
            return false;
        }
        const inner = arguments_[0]!;
        if (inner.name.name == "void") {
            this.addError(statement, "cannot allocate void", inner.position ?? type.position);
            return false;
        }
        if (this.typeAnalyzer.isIndirection(inner)) {
            return this.validateIndirectionType(inner, statement, scope);
        }
        if (
            inner.value != TypeValue.TypeGeneric &&
            !this.typeAnalyzer.isValidPrimitiveType(inner) &&
            !scope.getSymbol(inner.name.name)
        ) {
            this.addError(
                statement,
                "unknown type identifier: " + inner.name.name,
                inner.position ?? type.position,
            );
            return false;
        }
        return true;
    }

    private register(s: VariableDeclarationStatement, scope: Scope, type: Type) {
        scope.addSymbol({
            name: s.name.name,
            kind: s.file
                ? SymbolKind.SymbolFileConst
                : s.mutable
                  ? SymbolKind.SymbolLocalLet
                  : SymbolKind.SymbolLocalConst,
            type,
            assigned: !!s.value || !!s.external,
            value: s.value,
            declaration: s,
            moved: "active",
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
                ? `type mismatch: no implicit conversion from \`${this.typeAnalyzer.displayName(haveT)}\` to \`${this.typeAnalyzer.displayName(wantT)}\`;`
                : `type mismatch: no implicit conversion from \`${this.typeAnalyzer.displayName(haveT)}\` to \`${this.typeAnalyzer.displayName(wantT)}\`; ` +
                  `use an explicit cast \`${this.typeAnalyzer.displayName(wantT)}(x)\``;
        this.addError(s, message, s.value?.position);
    }

    private addIntegerRangeError(
        s: VariableDeclarationStatement,
        type: Type,
        literal: IntegerLiteral,
    ) {
        this.addError(
            s,
            `integer literal \`${literal.value}\` does not fit in \`${type.name.name}\``,
            literal.position,
        );
    }

    private addError(s: VariableDeclarationStatement, message: string, position = s.position) {
        this.diagnostics.addError(Error(this.diagnostics.fileName, "semantic", position, message));
    }
}
