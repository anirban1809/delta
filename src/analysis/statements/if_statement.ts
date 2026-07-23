import { TypeValue, type IfStatement } from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import { BlockKind, type BlockContext } from "../analyzer.js";
import { Scope } from "../scope.js";
import { BlockStatementAnalyzer } from "./block_statement.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";

/** Checks an if condition and combines the control-flow result of both branches. */
export class IfStatementAnalyzer {
    constructor(
        public diagnostics: Diagnostics,
        private expressionAnalyzer: ExpressionAnalyzer,
        private blockAnalyzer: BlockStatementAnalyzer,
    ) {}

    analyze(s: IfStatement, context: BlockContext, scope: Scope) {
        const conditionType = this.expressionAnalyzer.dereferenceOwnedValue(
            s.condition,
            this.expressionAnalyzer.analyze(s.condition, scope),
        );
        if (
            conditionType.value != TypeValue.TypeInvalid &&
            conditionType.value != TypeValue.Type_Bool
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.condition.position,
                    "condition inside if statement must evaluate to a bool",
                ),
            );
        }

        const symbols = scope.visibleSymbols();
        const before = new Map(symbols.map((symbol) => [symbol, { moved: symbol.moved ?? "active", assigned: symbol.assigned }] as const));
        const ifContext = { ...context, kind: BlockKind.IfBlock, scopedAssignments: [] };
        this.blockAnalyzer.analyze(s.thenBlock, ifContext, new Scope(scope));
        const thenState = new Map(symbols.map((symbol) => [symbol, { moved: symbol.moved ?? "active", assigned: symbol.assigned }] as const));
        symbols.forEach((symbol) => {
            symbol.moved = before.get(symbol)!.moved;
            symbol.assigned = before.get(symbol)!.assigned;
        });
        let elseState = before;
        if (s.elseBlock) {
            this.blockAnalyzer.analyze(s.elseBlock, { ...ifContext, scopedAssignments: [] }, new Scope(scope));
            elseState = new Map(symbols.map((symbol) => [symbol, { moved: symbol.moved ?? "active", assigned: symbol.assigned }] as const));
        }
        const thenDiverges = this.blockAnalyzer.blockDiverges(s.thenBlock);
        const elseDiverges = !!s.elseBlock && this.blockAnalyzer.blockDiverges(s.elseBlock);
        for (const symbol of symbols) {
            const left = thenState.get(symbol)!;
            const right = elseState.get(symbol)!;
            if (thenDiverges && !elseDiverges) {
                symbol.moved = right.moved;
                symbol.assigned = right.assigned;
            } else if (elseDiverges && !thenDiverges) {
                symbol.moved = left.moved;
                symbol.assigned = left.assigned;
            } else {
                symbol.moved = left.moved == right.moved ? left.moved : "maybe";
                symbol.assigned = !!left.assigned && !!right.assigned;
            }
        }
        return;
    }
}
