import { TypeValue, type WhileStatement } from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import type { BlockContext } from "../analyzer.js";
import type { Scope } from "../scope.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";

/** Ensures that a while-loop condition evaluates to `bool`. */
export class WhileStatementAnalyzer {
    constructor(
        public diagnostics: Diagnostics,
        private expressionAnalyzer: ExpressionAnalyzer,
    ) {}

    analyze(statement: WhileStatement, _context: BlockContext, scope: Scope) {
        if (
            this.expressionAnalyzer.analyze(statement.condition, scope).value != TypeValue.Type_Bool
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    statement.position,
                    "condition inside while statment must evaluate to a boolean",
                ),
            );
        }
        return;
    }
}
