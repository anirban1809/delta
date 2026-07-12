import { convert } from "@catalystic/json-to-yaml";
import type {
    AssignmentStatement,
    BlockStatement,
    Declaration,
    EnumDecl,
    Expression,
    ExpressionStatement,
    ForStatement,
    FunctionDeclaration,
    FunctionParameter,
    Identifier,
    IfStatement,
    Module,
    ReturnStatement,
    Statement,
    StructDecl,
    SwitchCase,
    SwitchStatement,
    Type,
    TypeDeclaration,
    UnionDecl,
} from "./types.js";
import { TypeDeclKind } from "./types.js";

/**
 * Renders a parsed {@link Module} into a simplified, human-readable tree.
 *
 * The formatter walks the AST and rebuilds each node as a plain object that
 * drops compiler-internal detail (notably source {@link Position}s), producing
 * a stable shape suitable for printing as YAML when inspecting or snapshotting
 * the parser's output.
 */
export class Formatter {
    ast: Module;

    constructor(ast: Module) {
        this.ast = ast;
    }

    formatAssignmentStatement(e: AssignmentStatement) {
        return {
            kind: "assignment_statement",
            root: this.formatExpression(e.root),
            target: this.formatExpression(e.target),
        };
    }

    formatForStatement(e: ForStatement): any {
        return {
            kind: "for_statement",
            ...(e.declaration ? { declaration: this.formatStatement(e.declaration) } : {}),
            ...(e.condition ? { condition: this.formatExpression(e.condition) } : {}),
            ...(e.modifier ? { modifier: this.formatExpression(e.modifier) } : {}),
            body: this.formatBlockStatement(e.body),
        };
    }

    formatIfStatement(e: IfStatement): any {
        return {
            kind: "if_statement",
            condition: this.formatExpression(e.condition),
            thenBlock: this.formatBlockStatement(e.thenBlock),
            ...(e.elseBlock ? { elseBlock: this.formatBlockStatement(e.elseBlock) } : {}),
        };
    }

    /** Formats a single `case`/`default` arm: its labels and body statements. */
    formatSwitchCase(c: SwitchCase): any {
        return {
            labels: c.labels.map((x) => this.formatExpression(x)),
            body: c.body.statements.map((x) => this.formatStatement(x)),
        };
    }

    formatSwitchStatement(e: SwitchStatement): any {
        return {
            kind: "switch_statement",
            scrutinee: this.formatExpression(e.scrutinee),
            cases: e.cases.map((x) => this.formatSwitchCase(x)),
            ...(e.default ? { default: this.formatSwitchCase(e.default) } : {}),
        };
    }

    /** Formats a single expression node. */
    formatExpression(e?: Expression): any {
        if (!e) {
            return {};
        }
        switch (e.kind) {
            case "identifier":
                return this.formatIdentifier(e);
            case "integer_literal":
                return {
                    kind: "integer_literal",
                    value: e.value,
                };
            case "float_literal":
                return {
                    kind: "float_literal",
                    value: e.value,
                };
            case "boolean_literal":
                return {
                    kind: "boolean_literal",
                    value: e.value,
                };
            case "function_call_expression":
                return {
                    kind: "function_call_expression",
                    conversion: e.conversion,
                    callee: this.formatIdentifier(e.callee),
                    arguments: e.arguments.map((x) => this.formatExpression(x)),
                };
            case "unary_expression":
                return {
                    kind: "unary_expression",
                    operator: e.operator,
                    operand: this.formatExpression(e.operand),
                };
            case "binary_expression":
                return {
                    kind: "binary_expression",
                    left: this.formatExpression(e.left),
                    operator: e.operator,
                    right: this.formatExpression(e.right),
                };
        }
    }

    /** Formats a single statement, dispatching on its `kind`. */
    formatStatement(b: Statement): any {
        switch (b.kind) {
            case "if_statement":
                return this.formatIfStatement(b as IfStatement);
            case "for_statement":
                return this.formatForStatement(b as ForStatement);
            case "switch_statement":
                return this.formatSwitchStatement(b as SwitchStatement);
            case "expression_statement":
                return {
                    kind: "expression_statement",
                    expression: this.formatExpression((b as ExpressionStatement).expression),
                };
            case "assignment_statement":
                return this.formatAssignmentStatement(b as AssignmentStatement);
            case "return_statement":
                return {
                    kind: "return_statement",
                    expression: this.formatExpression((b as ReturnStatement).expression),
                };
            case "variable_declaration_statement":
                return {
                    kind: "variable_declaration_statement",
                    name: b.name.name,
                    type: b.type.name.name,
                    value: this.formatExpression(b.value),
                };
        }
    }

    /** Formats a block as the list of its formatted statements. */
    formatBlockStatement(b: BlockStatement): any[] {
        return b.statements.map((x) => this.formatStatement(x));
    }

    /** Formats an identifier node. */
    formatIdentifier(i: Identifier) {
        return {
            kind: i.kind,
            name: i.name,
        };
    }

    /** Formats a type reference, including its name and resolved value. */
    formatType(t: Type) {
        return {
            kind: t.kind,
            name: this.formatIdentifier(t.name),
            value: t.value,
        };
    }

    /** Formats a function parameter as its name and type. */
    formatFunctionParameter(p: FunctionParameter) {
        return {
            name: this.formatIdentifier(p.name),
            type: this.formatType(p.type),
        };
    }

    /** Formats a function declaration: signature, parameters, and body. */
    formatFunctionDeclaration(f: FunctionDeclaration) {
        const body = this.formatBlockStatement(f.body as BlockStatement);
        const parameters = f.parameters.map((x) => this.formatFunctionParameter(x));
        return {
            kind: "function_declaration",
            name: f.name,
            parameters,
            returnTypes: f.returnTypes.map((x) => this.formatType(x)),
            errorType: f.errorTypes.map((x) => this.formatType(x)),
            body,
        };
    }

    /**
     * Formats a type declaration, dispatching on its `declKind` so each of the
     * three forms — `struct`, `enum`, `union` — renders its own body shape.
     */
    formatTypeDeclaration(d: TypeDeclaration): any {
        const base = {
            kind: "type_declaration",
            name: this.formatIdentifier(d.name),
            declKind: TypeDeclKind[d.declKind],
        };

        switch (d.declKind) {
            case TypeDeclKind.Struct: {
                const decl = d.declaration as StructDecl;
                return {
                    ...base,
                    fields: decl.fields.map((f) => ({
                        name: this.formatIdentifier(f.name),
                        type: this.formatType(f.type),
                    })),
                };
            }
            case TypeDeclKind.Enum: {
                const decl = d.declaration as EnumDecl;
                return {
                    ...base,
                    variants: decl.variants.map((v) => ({
                        name: v.name,
                        value: v.value,
                    })),
                };
            }
            case TypeDeclKind.Union: {
                const decl = d.declaration as UnionDecl;
                return {
                    ...base,
                    variants: decl.variants.map((v) => ({
                        type: this.formatType(v),
                    })),
                };
            }
        }
    }

    /** Formats a top-level declaration, dispatching on its `kind`. */
    formatDeclaration(d: Declaration) {
        switch (d.kind) {
            // case "variable_declaration_statement":
            //     return this.formatVar;
            case "function_declaration":
                return this.formatFunctionDeclaration(d as FunctionDeclaration);
            case "type_declaration":
                return this.formatTypeDeclaration(d as TypeDeclaration);
        }
    }

    /** Formats the whole module into a `{ file, declarations }` tree. */
    format() {
        const declarations = this.ast.declarations.map((x) => this.formatDeclaration(x));
        return {
            file: this.ast.fileName,
            declarations,
        };
    }

    /** Formats the module and prints it to stdout as YAML. */
    dump() {
        const formatResult = this.format();
        console.log(convert(formatResult));
    }
}
