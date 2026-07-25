import {
    CreateType,
    TypeValue,
    type AsResultBinding,
    type AssignmentStatement,
    type BlockStatement,
    type CheckBlockStatement,
    type Expression,
    type ExpressionStatement,
    type ForwardStatement,
    type ForStatement,
    type IfStatement,
    type ReturnErrorStatement,
    type ReturnStatement,
    type Statement,
    type SwitchStatement,
    type Type,
    type WhileStatement,
} from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import type { BlockContext, PendingResult } from "../analyzer.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";
import { Scope } from "../scope.js";
import { TypeAnalyzer } from "../type_analyzer.js";
import { AssignmentStatementAnalyzer } from "./assignment_statement.js";
import { BlockStatementAnalyzer } from "./block_statement.js";
import { ControlFlowStatementAnalyzer } from "./control_flow_statement.js";
import { ExpressionStatementAnalyzer } from "./expression_statement.js";
import { ForStatementAnalyzer } from "./for_statement.js";
import { IfStatementAnalyzer } from "./if_statement.js";
import { ReturnStatementAnalyzer } from "./return_statement.js";
import { SwitchStatementAnalyzer } from "./switch_statement.js";
import { VariableDeclarationStatementAnalyzer } from "./variable_declaration.js";
import { WhileStatementAnalyzer } from "./while_statement.js";

/** Dispatches statements and owns the cross-statement Phase C pending-result state. */
export class StatementAnalyzer {
    private typeAnalyzer: TypeAnalyzer;
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
        this.typeAnalyzer = typeAnalyzer;
        this.expressionAnalyzer = new ExpressionAnalyzer(diagnostics);
        this.blockAnalyzer = new BlockStatementAnalyzer(diagnostics, (statement, context, scope) =>
            this.analyze(statement, context, scope),
        );
        this.variableAnalyzer = new VariableDeclarationStatementAnalyzer(diagnostics);
        this.assignmentAnalyzer = new AssignmentStatementAnalyzer(diagnostics);
        this.whileAnalyzer = new WhileStatementAnalyzer(diagnostics, this.expressionAnalyzer, this.blockAnalyzer);
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
            case "variable_declaration_statement": {
                this.variableAnalyzer.analyze(s, scope);
                if (s.asResult && s.value) {
                    this.bindResult(
                        s.asResult,
                        s.value,
                        scope.getSymbol(s.name.name)?.type,
                        [s.name.name],
                        context,
                        scope,
                    );
                } else if (s.value) {
                    this.rejectUnboundFallible(s.value, scope);
                }
                return;
            }
            case "assignment_statement": {
                this.assignmentAnalyzer.analyze(s, context, scope);
                if (s.asResult) {
                    const successType =
                        s.target.expressionType ?? this.expressionAnalyzer.analyze(s.target, scope);
                    const root = this.rootName(s.root);
                    this.bindResult(
                        s.asResult,
                        s.target,
                        successType,
                        root ? [root] : [],
                        context,
                        scope,
                    );
                } else {
                    this.rejectUnboundFallible(s.target, scope);
                }
                return;
            }
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
            case "return_error_statement":
                this.analyzeReturnError(s, context, scope);
                return;
            case "check_block_statement":
                this.analyzeCheck(s, context, scope);
                return;
            case "forward_statement":
                this.analyzeForward(s, context, scope);
                return;
            case "expression_statement":
                this.expressionStatementAnalyzer.analyze(s as ExpressionStatement, scope);
                if (s.asResult) {
                    const successType =
                        s.expression.expressionType ??
                        this.expressionAnalyzer.analyze(s.expression, scope);
                    this.bindResult(s.asResult, s.expression, successType, [], context, scope);
                } else {
                    this.rejectUnboundFallible(s.expression, scope);
                }
                return;
        }
    }

    analyzeBlock(b: BlockStatement, context: BlockContext, scope: Scope) {
        this.blockAnalyzer.analyze(b, context, scope);
    }

    private bindResult(
        binding: AsResultBinding,
        expression: Expression,
        successType: Type | undefined,
        bindings: string[],
        context: BlockContext,
        scope: Scope,
    ) {
        const errorTypes = this.fallibleErrorTypes(expression, scope);
        if (!errorTypes.length) {
            this.addError(binding.position, "this expression cannot fail; remove `as result`");
            return;
        }
        if (context.pendingResults.has(binding.resultName.name)) {
            this.addError(
                binding.position,
                `result name \`${binding.resultName.name}\` is already live`,
            );
            return;
        }

        binding.successType = successType;
        binding.errorTypes = errorTypes;
        const pending: PendingResult = {
            name: binding.resultName.name,
            position: binding.position,
            bindings,
            successType,
            errorTypes,
            handledErrorTypes: new Set(),
        };
        context.pendingResults.set(binding.resultName.name, pending);
        bindings.forEach((name) => {
            const symbol = scope.getSymbol(name);
            if (symbol) symbol.pendingResult = binding.resultName.name;
        });
    }

    private fallibleErrorTypes(expression: Expression, scope: Scope): Type[] {
        if (expression.kind == "new_expression") {
            return [CreateType("AllocError", TypeValue.TypeCustom, expression.position)];
        }
        if (expression.kind == "clone_expression") {
            const clonedType = expression.expressionType ?? expression.source.expressionType;
            return clonedType && this.typeAnalyzer.ownershipTier(clonedType, scope) == "cloneable"
                ? [CreateType("AllocError", TypeValue.TypeCustom, expression.position)]
                : [];
        }
        if (expression.kind == "function_call_expression") {
            if (expression.resolvedErrorTypes?.length) return expression.resolvedErrorTypes;
            const calleeName = expression.callee.kind == "identifier" ? expression.callee.name : "";
            const called = calleeName ? scope.getSymbol(calleeName) : undefined;
            if (called?.signature?.errorTypes.length) return called.signature.errorTypes;
            if (expression.conversion && this.isTrappingConversion(expression.conversion)) {
                return [CreateType("NarrowingError", TypeValue.TypeCustom, expression.position)];
            }
            return [];
        }
        if (expression.kind == "binary_expression") {
            if (expression.constantStringValue !== undefined) return [];
            const name = ["/", "%"].includes(expression.operator)
                ? "DivideByZeroError"
                : ["<<", ">>"].includes(expression.operator)
                  ? "ShiftCountError"
                  : ["+", "-", "*"].includes(expression.operator)
                    ? "OverflowError"
                    : undefined;
            return name ? [CreateType(name, TypeValue.TypeCustom, expression.position)] : [];
        }
        return [];
    }

    private isTrappingConversion(conversion: { fromType: string; toType: string }): boolean {
        const fromFloat = conversion.fromType.startsWith("float");
        const toFloat = conversion.toType.startsWith("float");
        if (fromFloat && !toFloat) return true;
        if (!fromFloat && toFloat) return false;

        const fromWidth = this.primitiveWidth(conversion.fromType);
        const toWidth = this.primitiveWidth(conversion.toType);
        const fromUnsigned = conversion.fromType.startsWith("uint");
        const toUnsigned = conversion.toType.startsWith("uint");
        return toWidth < fromWidth || fromUnsigned != toUnsigned;
    }

    private primitiveWidth(name: string): number {
        if (name == "intsize" || name == "uintsize") return 64;
        const match = name.match(/(8|16|32|64)$/);
        return match ? Number(match[1]) : 32;
    }

    private rejectUnboundFallible(expression: Expression, scope: Scope) {
        // Bare clone/new use the aborting allocation form; only explicit
        // `as result` turns allocation failure into the error channel.
        if (expression.kind != "function_call_expression") return;
        if (expression.resolvedErrorTypes?.length) {
            const methodName = expression.callee.kind == "member_access_expression" ? expression.callee.member.name : "method";
            this.addError(expression.position, `fallible call to \`${methodName}\` must be followed by \`as result\``);
            return;
        }
        const calleeName = expression.callee.kind == "identifier" ? expression.callee.name : "";
        const signature = calleeName ? scope.getSymbol(calleeName)?.signature : undefined;
        if (!signature?.errorTypes.length) return;
        this.addError(
            expression.position,
            `fallible call to \`${calleeName}\` must be followed by \`as result\``,
        );
    }

    private analyzeCheck(statement: CheckBlockStatement, context: BlockContext, scope: Scope) {
        const pending = context.pendingResults.get(statement.resultName.name);
        if (!pending) {
            this.addError(
                statement.position,
                `check \`${statement.resultName.name}\` has no matching \`as result\` binding`,
            );
            return;
        }

        const errorNames = pending.errorTypes.map((type) => type.name.name);
        const selected = statement.errorType?.name.name;
        if (errorNames.length > 1 && !selected) {
            this.addError(
                statement.position,
                `result \`${pending.name}\` can return multiple errors; use one typed check per error, such as \`check ${pending.name} as ${errorNames[0]} { ... }\``,
            );
            return;
        }
        if (selected && !errorNames.includes(selected)) {
            this.addError(
                statement.errorType!.position ?? statement.position,
                `\`${selected}\` is not an error returned by result \`${pending.name}\``,
            );
            return;
        }
        if (selected && pending.handledErrorTypes.has(selected)) {
            this.addError(
                statement.errorType!.position ?? statement.position,
                `error \`${selected}\` is already checked for result \`${pending.name}\``,
            );
            return;
        }
        this.blockAnalyzer.analyze(statement.body, context, new Scope(scope));
        if (!this.blockDiverges(statement.body)) {
            this.addError(statement.position, "every path in a check block must diverge");
            return;
        }
        if (selected) pending.handledErrorTypes.add(selected);
        else pending.errorTypes.forEach((type) => pending.handledErrorTypes.add(type.name.name));

        statement.dischargesResult = pending.errorTypes.every((type) =>
            pending.handledErrorTypes.has(type.name.name),
        );
        if (statement.dischargesResult) this.discharge(pending, context, scope);
    }

    private analyzeForward(statement: ForwardStatement, context: BlockContext, scope: Scope) {
        const pending = context.pendingResults.get(statement.resultName.name);
        if (!pending) {
            this.addError(
                statement.position,
                `forward \`${statement.resultName.name}\` has no matching \`as result\` binding`,
            );
            return;
        }
        const enclosing = context.function.signature?.errorTypes ?? [];
        const remaining = pending.errorTypes.filter(
            (errorType) => !pending.handledErrorTypes.has(errorType.name.name),
        );
        const missing = remaining.find(
            (errorType) => !enclosing.some((allowed) => allowed.name.name == errorType.name.name),
        );
        if (missing) {
            this.addError(
                statement.position,
                `cannot forward \`${missing.name.name}\`; it is not in this function's error set`,
            );
            return;
        }
        this.discharge(pending, context, scope);
    }

    private discharge(pending: PendingResult, context: BlockContext, scope: Scope) {
        pending.bindings.forEach((name) => {
            const symbol = scope.getSymbol(name);
            if (symbol?.pendingResult == pending.name) symbol.pendingResult = undefined;
        });
        context.pendingResults.delete(pending.name);
    }

    private analyzeReturnError(
        statement: ReturnErrorStatement,
        context: BlockContext,
        scope: Scope,
    ) {
        const allowed = context.function.signature?.errorTypes ?? [];
        if (!allowed.length) {
            this.addError(
                statement.position,
                "cannot return error: enclosing function has no declared error set",
            );
            return;
        }
        const values = statement.values ?? [statement.value];
        if (values.length != 1) {
            this.addError(statement.position, `error return arity mismatch: expected 1 value, got ${values.length}`);
            return;
        }
        const value = values[0]!;
        let match: Type | undefined;
        if (value.kind == "object_literal") {
            const actualFields = value.elements
                .filter((element) => element.kind == "field_init")
                .map((element) => element.field.name.name)
                .sort();
            match = allowed.find((candidate) => {
                const fields = (scope.getSymbol(candidate.name.name)?.type?.fields ?? [])
                    .map((field) => field.name.name)
                    .sort();
                return fields.length == actualFields.length && fields.every((field, index) => field == actualFields[index]);
            });
            if (match) {
                value.type = structuredClone(match);
                this.expressionAnalyzer.analyze(value, scope);
            }
        } else {
            const actual = this.expressionAnalyzer.analyze(value, scope);
            match = allowed.find(
                (candidate) =>
                    this.typeAnalyzer.typesMatch(candidate, actual) ||
                    this.typeAnalyzer.isAliasOf(candidate, actual, scope),
            );
        }
        if (!match) {
            this.addError(value.position, "returned error value does not match any type in the function's error set");
            return;
        }
        statement.resolvedErrorType = match;
        statement.resolvedErrorTypes = [match];
        context.returns = true;
    }

    blockDiverges(block: BlockStatement): boolean {
        for (const statement of block.statements) {
            if (this.statementDiverges(statement)) return true;
        }
        return false;
    }

    private statementDiverges(statement: Statement): boolean {
        if (["return_statement", "return_error_statement"].includes(statement.kind)) return true;
        if (statement.kind == "break_statement" || statement.kind == "continue_statement") {
            return statement.validDivergence === true;
        }
        if (statement.kind == "block_statement") return this.blockDiverges(statement);
        if (statement.kind == "if_statement") {
            return (
                !!statement.elseBlock &&
                this.blockDiverges(statement.thenBlock) &&
                this.blockDiverges(statement.elseBlock)
            );
        }
        if (statement.kind == "switch_statement") {
            const casesReturn = statement.cases.every((item) => this.blockDiverges({ ...item.body, kind: "block_statement" }));
            const exhaustiveEnum = statement.scrutinee.expressionType?.kind == "enum" &&
                statement.cases.reduce((count, item) => count + item.labels.length, 0) >= (statement.scrutinee.expressionType.variants?.length ?? Infinity);
            return casesReturn && (exhaustiveEnum || (!!statement.default && this.blockDiverges({ ...statement.default.body, kind: "block_statement" })));
        }
        return false;
    }

    private rootName(expression: Expression): string {
        if (expression.kind == "identifier") return expression.name;
        if (
            expression.kind == "member_access_expression" ||
            expression.kind == "index_expression"
        ) {
            return this.rootName(expression.receiver);
        }
        return "";
    }

    private addError(position: import("../../ast/types.js").Position, message: string) {
        this.diagnostics.addError(Error(this.diagnostics.fileName, "semantic", position, message));
    }
}
