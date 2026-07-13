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
        if (this.expressionAnalyzer.analyze(s.condition, scope).value != TypeValue.Type_Bool) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    "condition inside if statement must evaluate to a bool",
                ),
            );
            return;
        }

        const ifScope = new Scope(scope);
        const ifContext = context;
        ifContext.kind = BlockKind.IfBlock;
        this.blockAnalyzer.analyze(s.thenBlock, ifContext, ifScope);
        if (s.elseBlock) {
            this.blockAnalyzer.analyze(s.elseBlock, ifContext, ifScope);
        }
        return;
    }
}
