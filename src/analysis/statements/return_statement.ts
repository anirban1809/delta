import { TypeValue, type ReturnStatement } from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import type { BlockContext } from "../analyzer.js";
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
        const exprT = this.expr.analyze(s.expression, scope);
        if (exprT.value == TypeValue.TypeInvalid) return;

        const retT = context.function.signature?.returnTypes[0];
        if (!this.typeAnalyzer.typesMatch(exprT, retT!)) {
            if (this.typeAnalyzer.isAliasOf(retT!, exprT, scope)) {
                context.returns = true;
                return;
            }
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    `mismatched types in return statement, want ${retT?.name.name}, got ${exprT.name.name}`,
                ),
            );
        }
        context.returns = true;
        return;
    }
}
