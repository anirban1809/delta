import type {
    AssignmentStatement,
    ExpressionStatement,
    ForStatement,
    IfStatement,
    ReturnStatement,
    Statement,
    SwitchStatement,
    WhileStatement,
} from "../../ast/types.js";
import type { Diagnostics } from "../../diagnostics/diagnostics.js";
import type { BlockContext } from "../analyzer.js";
import type { Scope } from "../scope.js";
import { AssignmentStatementAnalyzer } from "./assignment_statement.js";
import { BlockStatementAnalyzer } from "./block_statement.js";
import { ControlFlowStatementAnalyzer } from "./control_flow_statement.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";
import { ExpressionStatementAnalyzer } from "./expression_statement.js";
import { ForStatementAnalyzer } from "./for_statement.js";
import { IfStatementAnalyzer } from "./if_statement.js";
import { ReturnStatementAnalyzer } from "./return_statement.js";
import { SwitchStatementAnalyzer } from "./switch_statement.js";
import { TypeAnalyzer } from "../type_analyzer.js";
import { VariableDeclarationStatementAnalyzer } from "./variable_declaration.js";
import { WhileStatementAnalyzer } from "./while_statement.js";

/** Dispatches each statement kind to its dedicated semantic analyzer. */
export class StatementAnalyzer {
    private expressionAnalyzer: ExpressionAnalyzer;
    private variableAnalyzer: VariableDeclarationStatementAnalyzer;
    private assignmentAnalyzer: AssignmentStatementAnalyzer;
    private whileAnalyzer: WhileStatementAnalyzer;
    private forAnalyzer: ForStatementAnalyzer;
    private expressionStatementAnalyzer: ExpressionStatementAnalyzer;
    private switchAnalyzer: SwitchStatementAnalyzer;
    private ifAnalyzer: IfStatementAnalyzer;
    private returnAnalyzer: ReturnStatementAnalyzer;
    private controlFlowAnalyzer: ControlFlowStatementAnalyzer;
    private blockAnalyzer: BlockStatementAnalyzer;

    constructor(public diagnostics: Diagnostics) {
        const typeAnalyzer = new TypeAnalyzer(diagnostics);
        this.expressionAnalyzer = new ExpressionAnalyzer(diagnostics);
        this.blockAnalyzer = new BlockStatementAnalyzer(diagnostics, (statement, context, scope) =>
            this.analyze(statement, context, scope),
        );
        this.variableAnalyzer = new VariableDeclarationStatementAnalyzer(diagnostics);
        this.assignmentAnalyzer = new AssignmentStatementAnalyzer(diagnostics);
        this.whileAnalyzer = new WhileStatementAnalyzer(diagnostics, this.expressionAnalyzer);
        this.forAnalyzer = new ForStatementAnalyzer(
            diagnostics,
            this.expressionAnalyzer,
            this.blockAnalyzer,
            (statement, context, scope) => this.analyze(statement, context, scope),
        );
        this.expressionStatementAnalyzer = new ExpressionStatementAnalyzer(
            diagnostics,
            this.expressionAnalyzer,
        );
        this.switchAnalyzer = new SwitchStatementAnalyzer(
            diagnostics,
            this.expressionAnalyzer,
            typeAnalyzer,
            this.blockAnalyzer,
        );
        this.ifAnalyzer = new IfStatementAnalyzer(
            diagnostics,
            this.expressionAnalyzer,
            this.blockAnalyzer,
        );
        this.returnAnalyzer = new ReturnStatementAnalyzer(
            diagnostics,
            this.expressionAnalyzer,
            typeAnalyzer,
        );
        this.controlFlowAnalyzer = new ControlFlowStatementAnalyzer(diagnostics);
    }

    analyze(s: Statement, context: BlockContext, scope: Scope) {
        switch (s.kind) {
            case "variable_declaration_statement":
                this.variableAnalyzer.analyze(s, scope);
                return;
            case "assignment_statement":
                this.assignmentAnalyzer.analyze(s as AssignmentStatement, context, scope);
                return;
            case "while_statement":
                this.whileAnalyzer.analyze(s as WhileStatement, context, scope);
                return;
            case "switch_statement":
                this.switchAnalyzer.analyze(s as SwitchStatement, context, scope);
                return;
            case "if_statement":
                this.ifAnalyzer.analyze(s as IfStatement, context, scope);
                return;
            case "for_statement":
                this.forAnalyzer.analyze(s as ForStatement, context, scope);
                return;
            case "break_statement":
            case "continue_statement":
                this.controlFlowAnalyzer.analyze(s, context);
                return;
            case "return_statement":
                this.returnAnalyzer.analyze(s as ReturnStatement, context, scope);
                return;
            case "expression_statement":
                this.expressionStatementAnalyzer.analyze(s as ExpressionStatement, scope);
                return;
        }
        return;
    }

    /** Analyzes every statement in a block using the composed statement analyzers. */
    analyzeBlock(
        b: import("../../ast/types.js").BlockStatement,
        context: BlockContext,
        scope: Scope,
    ) {
        this.blockAnalyzer.analyze(b, context, scope);
        return;
    }
}
