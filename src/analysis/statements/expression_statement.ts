import { type ExpressionStatement } from "../../ast/types.js";
import type { Diagnostics } from "../../diagnostics/diagnostics.js";
import type { Scope } from "../scope.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";

/** Analyzes an expression used solely for its side effects. */
export class ExpressionStatementAnalyzer {
    constructor(
        public diagnostics: Diagnostics,
        private expressionAnalyzer: ExpressionAnalyzer,
    ) {}

    analyze(s: ExpressionStatement, scope: Scope) {
        this.expressionAnalyzer.analyze(s.expression, scope);
        return;
    }
}
