import { TypeValue, type ReturnStatement } from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import { SymbolKind, type BlockContext } from "../analyzer.js";
import type { Scope } from "../scope.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";
import { TypeAnalyzer } from "../type_analyzer.js";

/** Checks a return expression against the enclosing function's declared return type. */
export class ReturnStatementAnalyzer {
    constructor(
        public diagnostics: Diagnostics,
        private expr: ExpressionAnalyzer,
        private typeAnalyzer: TypeAnalyzer,
    ) {}

    analyze(s: ReturnStatement, context: BlockContext, scope: Scope) {
        const values = s.expressions ?? (s.expression ? [s.expression] : []);
        const returnTypes = context.function.signature?.returnTypes ?? [];
        if (values.length != returnTypes.length) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    `return arity mismatch: expected ${returnTypes.length} value(s), got ${values.length}`,
                ),
            );
            context.returns = true;
            return;
        }

        values.forEach((expression, index) => {
            let retT = returnTypes[index]!;
            if (
                retT.value == TypeValue.TypeInvalid ||
                (retT.value == TypeValue.TypeCustom && !scope.getSymbol(retT.name.name))
            ) return;
            if (expression.kind == "object_literal" && !expression.type.name.name) {
                expression.type = structuredClone(retT);
            }
            let exprT = this.expr.analyze(expression, scope, retT);
            if (exprT.value == TypeValue.TypeInvalid) return;
            if (this.typeAnalyzer.isIndirection(exprT)) {
                const pointee = exprT.typeParameters?.[0];
                if (
                    pointee &&
                    (this.typeAnalyzer.typesMatch(retT, pointee) ||
                        this.typeAnalyzer.isAliasOf(retT, pointee, scope))
                ) {
                    exprT = this.expr.dereferenceOwnedValue(expression, exprT);
                }
            }
            if (expression.kind == "function_call_expression" && expression.resolvedErrorTypes?.length) {
                this.diagnostics.addError(Error(this.diagnostics.fileName, "semantic", expression.position, "fallible method call must be handled with `as result` before return"));
                return;
            }

            if (
                expression.kind == "identifier" &&
                this.typeAnalyzer.ownershipTier(exprT, scope) != "copyable"
            ) {
                const symbol = scope.getSymbol(expression.name);
                if (symbol?.kind == SymbolKind.SymbolFileConst) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            expression.position,
                            `cannot transfer non-copyable global ${expression.name}; return a clone instead`,
                        ),
                    );
                    return;
                }
            }

            if (
                (expression.kind == "member_access_expression" ||
                    expression.kind == "index_expression") &&
                this.typeAnalyzer.ownershipTier(exprT, scope) != "copyable"
            ) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        expression.position,
                        "cannot transfer a non-copyable field or indexed element; return `clone` of the value instead",
                    ),
                );
                return;
            }
            if (retT.value == TypeValue.TypeCustom) {
                const typeSymbol = scope.getSymbol(retT.name.name);
                if (typeSymbol?.type) {
                    const bindings = new Map<string, import("../../ast/types.js").Type>();
                    typeSymbol.type.typeParameters?.forEach((parameter, argumentIndex) => {
                        const argument = retT.typeParameters?.[argumentIndex];
                        if (argument) bindings.set(parameter.name.name, argument);
                    });
                    retT = this.typeAnalyzer.substituteType(typeSymbol.type, bindings);
                }
            }
            if (
                !this.typeAnalyzer.typesMatch(exprT, retT) &&
                !this.typeAnalyzer.isAliasOf(retT, exprT, scope) &&
                !(retT.kind == "union" && this.typeAnalyzer.isUnionVariant(retT, exprT)) &&
                !(
                    expression.kind == "integer_literal" &&
                    this.typeAnalyzer.isInteger(retT) &&
                    this.typeAnalyzer.isInteger(exprT) &&
                    this.typeAnalyzer.checkIntegerRange(retT, expression)
                )
            ) {
                this.diagnostics.addError(
                    Error(this.diagnostics.fileName, "semantic", expression.position, `mismatched types in return statement, want ${retT.name.name}, got ${exprT.name.name}`),
                );
            }
        });
        context.returns = true;
        return;
    }
}
