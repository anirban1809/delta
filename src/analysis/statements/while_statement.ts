import { TypeValue, type WhileStatement } from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import type { BlockContext } from "../analyzer.js";
import type { Scope } from "../scope.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";
import { Scope as AnalysisScope } from "../scope.js";
import { BlockStatementAnalyzer } from "./block_statement.js";

/** Ensures that a while-loop condition evaluates to `bool`. */
export class WhileStatementAnalyzer {
    constructor(
        public diagnostics: Diagnostics,
        private expressionAnalyzer: ExpressionAnalyzer,
        private blockAnalyzer: BlockStatementAnalyzer,
    ) {}

    analyze(statement: WhileStatement, context: BlockContext, scope: Scope) {
        const conditionType = this.expressionAnalyzer.dereferenceOwnedValue(
            statement.condition,
            this.expressionAnalyzer.analyze(statement.condition, scope),
        );
        if (
            conditionType.value != TypeValue.TypeInvalid &&
            conditionType.value != TypeValue.Type_Bool
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    statement.condition.position,
                    "condition inside while statment must evaluate to a boolean",
                ),
            );
        }
        const outer = scope.visibleSymbols();
        const before = new Map(outer.map((symbol) => [symbol, { moved: symbol.moved ?? "active", assigned: symbol.assigned }] as const));
        const loopContext = { ...context, loopDepth: context.loopDepth + 1 };
        this.blockAnalyzer.analyze(statement.body, loopContext, new AnalysisScope(scope));
        for (const symbol of outer) {
            const previous = before.get(symbol)!;
            if (previous.moved == "active" && symbol.moved != "active" && symbol.moved !== undefined) {
                this.diagnostics.addError(Error(this.diagnostics.fileName, "semantic", symbol.movePosition ?? statement.position, `\`${symbol.name}\` may have been moved on a previous loop iteration; revive it before the loop back-edge`));
            }
            symbol.moved = previous.moved;
            symbol.assigned = previous.assigned;
        }
        return;
    }
}
