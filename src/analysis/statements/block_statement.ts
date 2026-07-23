import { type BlockStatement, type Statement } from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
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
        let unreachable = false;
        b.statements.forEach((statement) => {
            if (unreachable) {
                this.diagnostics.addError(
                    Error(this.diagnostics.fileName, "semantic", statement.position, "unreachable code"),
                );
                return;
            }
            this.analyzeStatement(statement, context, scope);
            unreachable = this.statementDiverges(statement);
        });
        return;
    }

    blockDiverges(block: BlockStatement): boolean {
        return block.statements.some((statement) => this.statementDiverges(statement));
    }

    statementDiverges(statement: Statement): boolean {
        if (["return_statement", "return_error_statement"].includes(statement.kind)) return true;
        if (statement.kind == "break_statement" || statement.kind == "continue_statement") {
            return statement.validDivergence === true;
        }
        if (statement.kind == "block_statement") return this.blockDiverges(statement);
        if (statement.kind == "if_statement") {
            return !!statement.elseBlock && this.blockDiverges(statement.thenBlock) && this.blockDiverges(statement.elseBlock);
        }
        if (statement.kind == "switch_statement") {
            const casesReturn = statement.cases.every((item) => this.blockDiverges({ ...item.body, kind: "block_statement" }));
            const exhaustiveEnum = statement.scrutinee.expressionType?.kind == "enum" &&
                statement.cases.reduce((count, item) => count + item.labels.length, 0) >= (statement.scrutinee.expressionType.variants?.length ?? Infinity);
            return casesReturn && (exhaustiveEnum || (!!statement.default && this.blockDiverges({ ...statement.default.body, kind: "block_statement" })));
        }
        return false;
    }
}
