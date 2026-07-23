import { string, TokenKind } from "../../ast/tokens.js";
import { TypeValue, type ForStatement } from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import type { BlockContext } from "../analyzer.js";
import { Scope } from "../scope.js";
import { BlockStatementAnalyzer } from "./block_statement.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";
import type { AnalyzeStatement } from "./statement_context.js";

/** Validates a for loop's declaration, condition, modifier, and body flow. */
export class ForStatementAnalyzer {
    constructor(
        public diagnostics: Diagnostics,
        private expressionAnalyzer: ExpressionAnalyzer,
        private blockAnalyzer: BlockStatementAnalyzer,
        private analyzeStatement: AnalyzeStatement,
    ) {}

    analyze(s: ForStatement, context: BlockContext, scope: Scope) {
        const loopScope = new Scope(scope);
        if (s.declaration) this.analyzeStatement(s.declaration, context, loopScope);
        const conditionType = s.condition
            ? this.expressionAnalyzer.dereferenceOwnedValue(
                  s.condition,
                  this.expressionAnalyzer.analyze(s.condition, loopScope),
              )
            : undefined;
        if (
            s.condition &&
            conditionType?.value != TypeValue.TypeInvalid &&
            conditionType?.value != TypeValue.Type_Bool
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.condition.position,
                    "condition in for loop must evaluate to a bool",
                ),
            );
        }
        if (s.modifier) this.expressionAnalyzer.analyze(s.modifier, loopScope);
        const outer = scope.visibleSymbols();
        const before = new Map(outer.map((symbol) => [symbol, { moved: symbol.moved ?? "active", assigned: symbol.assigned }] as const));
        const loopContext = { ...context, loopDepth: context.loopDepth + 1 };
        this.blockAnalyzer.analyze(s.body, loopContext, loopScope);
        for (const symbol of outer) {
            const previous = before.get(symbol)!;
            if (previous.moved == "active" && symbol.moved != "active" && symbol.moved !== undefined) {
                this.diagnostics.addError(Error(this.diagnostics.fileName, "semantic", symbol.movePosition ?? s.position, `\`${symbol.name}\` may have been moved on a previous loop iteration; revive it before the loop back-edge`));
            }
            symbol.moved = previous.moved;
            symbol.assigned = previous.assigned;
        }
        return;
    }
}
