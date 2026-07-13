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
        if (s.declaration) this.analyzeStatement(s.declaration, context, scope);
        if (
            s.condition &&
            this.expressionAnalyzer.analyze(s.condition, loopScope).value != TypeValue.Type_Bool
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    "condition in for loop must evaluate to a bool",
                ),
            );
        }
        if (s.modifier) this.expressionAnalyzer.analyze(s.modifier, scope);
        if (
            s.modifier?.kind == "unary_expression" &&
            [string(TokenKind.Symbol_Increment), string(TokenKind.Symbol_Decrement)].includes(
                s.modifier.operator,
            ) &&
            s.declaration &&
            !s.declaration.mutable
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.declaration.position,
                    "loop variable " +
                        s.declaration.name.name +
                        " is a const and hence not mutable",
                ),
            );
        }
        const loopContext = context;
        loopContext.loopDepth += 1;
        this.blockAnalyzer.analyze(s.body, loopContext, scope);
        loopContext.loopDepth -= 1;
        return;
    }
}
