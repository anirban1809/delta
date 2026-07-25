import { convert } from "@catalystic/json-to-yaml";
import type {
    AssignmentStatement,
    BlockStatement,
    CheckBlockStatement,
    Declaration,
    EnumDecl,
    Expression,
    ExpressionStatement,
    ForStatement,
    ForwardStatement,
    FunctionDeclaration,
    FunctionParameter,
    Identifier,
    IfStatement,
    ImportDeclaration,
    InterfaceDeclaration,
    InterfaceMethodRequirement,
    Module,
    ObjectLiteralElement,
    ObjectLiteralExpression,
    ReturnStatement,
    ReturnErrorStatement,
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
            ...(e.asResult ? { asResult: e.asResult.resultName.name } : {}),
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

    /** Formats an object-literal field or spread while dropping source positions. */
    formatObjectLiteralElement(element: ObjectLiteralElement): any {
        switch (element.kind) {
            case "field_init":
                return {
                    kind: "field_init",
                    field: {
                        name: this.formatIdentifier(element.field.name),
                        value: this.formatExpression(element.field.value),
                    },
                };
            case "spread_element":
                return {
                    kind: "spread_element",
                    source: this.formatExpression(element.source),
                };
        }
    }

    /** Formats a record/object literal and recursively formats its elements. */
    formatObjectLiteralExpression(expression: ObjectLiteralExpression): any {
        return {
            kind: "object_literal",
            type: this.formatType(expression.type),
            ...(expression.genericTypes?.length
                ? { typeArguments: expression.genericTypes.map((type) => this.formatType(type)) }
                : {}),
            elements: expression.elements.map((element) =>
                this.formatObjectLiteralElement(element),
            ),
        };
    }

    /** Formats a single expression node. */
    formatExpression(e?: Expression): any {
        if (!e) {
            return {};
        }
        switch (e.kind) {
            case "new_expression":
                return {
                    kind: "new_expression",
                    expression: this.formatExpression(e.expression),
                };
            case "object_literal":
                return this.formatObjectLiteralExpression(e);
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
            case "char_literal":
                return {
                    kind: "char_literal",
                    value: e.value,
                };
            case "string_literal":
                return {
                    kind: "string_literal",
                    value: e.value,
                };
            case "array_literal_expression":
                return {
                    kind: "array_literal_expression",
                    elements: e.elements.map((x) => this.formatExpression(x)),
                };
            case "index_expression":
                return {
                    kind: "index_expression",
                    receiver: this.formatExpression(e.receiver),
                    index: this.formatExpression(e.index),
                };
            case "function_call_expression":
                return {
                    kind: "function_call_expression",
                    conversion: e.conversion,
                    callee: this.formatExpression(e.callee),
                    ...(e.genericTypes?.length
                        ? { typeArguments: e.genericTypes.map((x) => this.formatType(x)) }
                        : {}),
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
                    ...(b.asResult ? { asResult: b.asResult.resultName.name } : {}),
                };
            case "assignment_statement":
                return this.formatAssignmentStatement(b as AssignmentStatement);
            case "return_statement":
                return {
                    kind: "return_statement",
                    expression: this.formatExpression((b as ReturnStatement).expression),
                };
            case "return_error_statement":
                return {
                    kind: "return_error_statement",
                    value: this.formatExpression((b as ReturnErrorStatement).value),
                };
            case "check_block_statement":
                return {
                    kind: "check_block_statement",
                    resultName: (b as CheckBlockStatement).resultName.name,
                    ...((b as CheckBlockStatement).errorType
                        ? { errorType: (b as CheckBlockStatement).errorType!.name.name }
                        : {}),
                    body: this.formatBlockStatement((b as CheckBlockStatement).body),
                };
            case "forward_statement":
                return {
                    kind: "forward_statement",
                    resultName: (b as ForwardStatement).resultName.name,
                };
            case "variable_declaration_statement":
                return {
                    kind: "variable_declaration_statement",
                    name: b.name.name,
                    type: b.type.name.name,
                    ...(b.type.arrayLengths?.length ? { arrayLengths: b.type.arrayLengths } : {}),
                    ...(b.type.slice ? { slice: true } : {}),
                    value: this.formatExpression(b.value),
                    ...(b.asResult ? { asResult: b.asResult.resultName.name } : {}),
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
    formatType(t: Type): any {
        return {
            kind: t.kind,
            name: this.formatIdentifier(t.name),
            value: t.value,
            ...(t.arrayLengths?.length ? { arrayLengths: t.arrayLengths } : {}),
            ...(t.slice ? { slice: true } : {}),
            ...(t.variadic ? { variadic: true } : {}),
            ...(t.interfaceBounds?.length
                ? { interfaceBounds: t.interfaceBounds.map((x) => this.formatType(x)) }
                : {}),
            ...(t.typeParameters?.length
                ? { typeParameters: t.typeParameters.map((x) => this.formatType(x)) }
                : {}),
        };
    }

    /** Formats a function parameter as its name and type. */
    formatFunctionParameter(p: FunctionParameter) {
        return {
            name: this.formatIdentifier(p.name),
            type: this.formatType(p.type),
            ...(p.variadic ? { variadic: true } : {}),
        };
    }

    /** Formats a function declaration: signature, parameters, and body. */
    formatFunctionDeclaration(f: FunctionDeclaration) {
        const body = this.formatBlockStatement(f.body as BlockStatement);
        const parameters = f.parameters.map((x) => this.formatFunctionParameter(x));
        return {
            kind: "function_declaration",
            name: f.name,
            ...(f.typeParameters?.length
                ? { typeParameters: f.typeParameters.map((x) => this.formatType(x)) }
                : {}),
            ...(f.receiver ? { receiver: this.formatFunctionParameter(f.receiver) } : {}),
            parameters,
            returnTypes: f.returnTypes.map((x) => this.formatType(x)),
            errorType: f.errorTypes.map((x) => this.formatType(x)),
            ...(f.external ? { external: f.external } : {}),
            ...(f.exported ? { exported: true } : {}),
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
                    ...(decl.implementedInterfaces?.length
                        ? {
                              implementedInterfaces: decl.implementedInterfaces.map((type) =>
                                  this.formatType(type),
                              ),
                          }
                        : {}),
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

    formatInterfaceMethod(method: InterfaceMethodRequirement) {
        return {
            kind: method.kind,
            name: this.formatIdentifier(method.name),
            ...(method.typeParameters?.length
                ? {
                      typeParameters: method.typeParameters.map((type) => this.formatType(type)),
                  }
                : {}),
            parameters: method.parameters.map((parameter) =>
                this.formatFunctionParameter(parameter),
            ),
            returnTypes: method.returnTypes.map((type) => this.formatType(type)),
            errorTypes: method.errorTypes.map((type) => this.formatType(type)),
        };
    }

    formatInterfaceDeclaration(declaration: InterfaceDeclaration) {
        return {
            kind: declaration.kind,
            name: this.formatIdentifier(declaration.name),
            methods: declaration.methods.map((method) => this.formatInterfaceMethod(method)),
            ...(declaration.exported ? { exported: true } : {}),
            ...(declaration.external ? { external: declaration.external } : {}),
        };
    }

    /** Formats a top-level declaration, dispatching on its `kind`. */
    formatDeclaration(d: Declaration) {
        switch (d.kind) {
            case "import_declaration": {
                const declaration = d as ImportDeclaration;
                return {
                    kind: declaration.kind,
                    ...(declaration.unsafe ? { unsafe: true } : {}),
                    ...(declaration.namespace
                        ? {
                              module: declaration.namespace.module.name,
                              ...(declaration.namespace.alias
                                  ? { alias: declaration.namespace.alias.name }
                                  : {}),
                          }
                        : { specifiers: declaration.specifiers.map((x) => x.name.name) }),
                    path: declaration.path,
                };
            }
            // case "variable_declaration_statement":
            //     return this.formatVar;
            case "function_declaration":
                return this.formatFunctionDeclaration(d as FunctionDeclaration);
            case "interface_declaration":
                return this.formatInterfaceDeclaration(d as InterfaceDeclaration);
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
            ...(this.ast.exportModule ? { exportModule: this.ast.exportModule.name.name } : {}),
            ...(this.ast.ffiHeaders?.length ? { ffiHeaders: this.ast.ffiHeaders } : {}),
            ...(this.ast.ffiModuleName ? { ffiModule: this.ast.ffiModuleName } : {}),
            ...(this.ast.ffiLibraries?.length
                ? { ffiLibraries: this.ast.ffiLibraries.map(({ kind, path }) => ({ kind, path })) }
                : {}),
        };
    }

    /** Formats the module and prints it to stdout as YAML. */
    dump() {
        const formatResult = this.format();
        console.log(convert(formatResult));
    }
}
