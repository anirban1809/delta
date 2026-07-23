import { type Statement } from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import type { BlockContext } from "../analyzer.js";

/** Validates the placement of `break` and `continue` statements. */
export class ControlFlowStatementAnalyzer {
    constructor(public diagnostics: Diagnostics) {}

    analyze(s: Statement, context: BlockContext) {
        if (s.kind == "break_statement") {
            s.validDivergence = context.loopDepth != 0;
            if (s.validDivergence) return;
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    "break outside a loop statement is not allowed",
                ),
            );
            return;
        }

        if (s.kind == "continue_statement") {
            s.validDivergence = context.loopDepth != 0;
            if (context.loopDepth == 0) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        s.position,
                        "continue outside a loop is not allowed",
                    ),
                );
            }
        }
        return;
    }
}
