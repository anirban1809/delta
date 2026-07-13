import { type BlockStatement } from "../../ast/types.js";
import type { Diagnostics } from "../../diagnostics/diagnostics.js";
import type { BlockContext } from "../analyzer.js";
import type { Scope } from "../scope.js";
import type { AnalyzeStatement } from "./statement_context.js";

/** Analyzes every statement in a block with the shared block context. */
export class BlockStatementAnalyzer {
    constructor(
        public diagnostics: Diagnostics,
        private analyzeStatement: AnalyzeStatement,
    ) {}

    analyze(b: BlockStatement, context: BlockContext, scope: Scope) {
        b.statements.forEach((statement) => {
            this.analyzeStatement(statement, context, scope);
        });
        return;
    }
}
