import {
    TypeDeclKind,
    TypeValue,
    type Declaration,
    type EnumDecl,
    type FunctionDeclaration,
    type Module,
    type StructDecl,
    type Type,
    type TypeAlias,
    type TypeDeclaration,
    type UnionDecl,
    type VariableDeclarationStatement,
} from "../ast/types.js";
import { Error, type Diagnostics } from "../diagnostics/diagnostics.js";
import { BlockKind, SymbolKind, type BlockContext, type FunctionSignature } from "./analyzer.js";
import { Scope } from "./scope.js";
import { StatementAnalyzer } from "./statements/statement.js";
import { TypeAnalyzer } from "./type_analyzer.js";
import { VariableDeclarationStatementAnalyzer } from "./statements/variable_declaration.js";

/** Analyzes module-level functions, type declarations, and file-level variables. */
export class DeclarationAnalyzer {
    private statementAnalyzer: StatementAnalyzer;
    private typeAnalyzer: TypeAnalyzer;
    private variableAnalyzer: VariableDeclarationStatementAnalyzer;

    constructor(
        private ast: Module,
        private diagnostics: Diagnostics,
        private globalScope: Scope,
    ) {
        this.statementAnalyzer = new StatementAnalyzer(diagnostics);
        this.typeAnalyzer = new TypeAnalyzer(diagnostics);
        this.variableAnalyzer = new VariableDeclarationStatementAnalyzer(diagnostics);
    }

    /** First pass: make every function signature visible for recursive calls. */
    registerFunctions() {
        this.ast.declarations.forEach((decl) => {
            if (decl.kind != "function_declaration") return;
            if (this.globalScope.getSymbol(decl.name.name)) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        decl.position,
                        "`" + decl.name.name + "` is declared more than once",
                    ),
                );
                return;
            }
            this.globalScope.addSymbol({
                name: decl.name.name,
                kind: SymbolKind.SymbolFuncDecl,
                signature: {
                    name: decl.name.name,
                    returnTypes: decl.returnTypes,
                    errorTypes: decl.errorTypes,
                    parameters: decl.parameters,
                },
            });
        });
    }

    /** Second pass: analyze a top-level type, variable, or function declaration. */
    analyze(decl: Declaration) {
        switch (decl.kind) {
            case "type_declaration":
                this.analyzeTypeDeclaration(decl);
                return;
            case "variable_declaration_statement":
                this.variableAnalyzer.analyze(
                    decl as VariableDeclarationStatement,
                    this.globalScope,
                );
                return;
            case "function_declaration":
                this.analyzeFunctionDeclaration(decl);
        }
    }

    /** Validates a function signature and delegates its body to the statement layer. */
    private analyzeFunctionDeclaration(decl: FunctionDeclaration) {
        const functionScope = new Scope(this.globalScope);
        decl.parameters.forEach((parameter) => {
            if (functionScope.getSymbol(parameter.name.name)) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        parameter.position,
                        "redeclared parameter " + parameter.name.name,
                    ),
                );
                return;
            }
            if (
                parameter.type.value != TypeValue.TypeCustom &&
                !this.typeAnalyzer.isValidPrimitiveType(parameter.type)
            ) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        parameter.position,
                        "invalid parameter type: " + parameter.type.name.name,
                    ),
                );
                return;
            }
            functionScope.addSymbol({
                name: parameter.name.name,
                kind: SymbolKind.SymbolParameter,
                type: parameter.type,
            });
        });

        decl.returnTypes.forEach((type) => {
            if (this.typeAnalyzer.isValidPrimitiveType(type) || type.value == TypeValue.TypeCustom)
                return;
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    type.position!,
                    "invalid return type: " + type.name.name,
                ),
            );
        });
        decl.errorTypes.forEach((type) => {
            if (!this.typeAnalyzer.isValidPrimitiveType(type)) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        type.position!,
                        "invalid error type: " + type.name.name,
                    ),
                );
            }
        });

        const symbol = this.globalScope.getSymbol(decl.name.name);
        if (decl.name.name == "main" && !this.verifyMainFunctionSignature(symbol?.signature!)) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.position,
                    "`main` must be declared at top level as `function main(): int32`",
                ),
            );
            return;
        }

        const context: BlockContext = {
            kind: BlockKind.FunctionBlock,
            function: symbol!,
            returns: false,
            loopDepth: 0,
            switch: false,
            scopedAssignments: [],
        };
        this.statementAnalyzer.analyzeBlock(decl.body, context, functionScope);
        return;
    }

    /** Checks the required zero-argument, non-error `int32` main signature. */
    private verifyMainFunctionSignature(signature: FunctionSignature): boolean {
        return (
            signature.parameters.length == 0 &&
            signature.errorTypes.length == 0 &&
            signature.returnTypes[0]?.value == TypeValue.Type_Int32
        );
    }

    /** Registers union, enum, struct, and alias declarations in the global scope. */
    private analyzeTypeDeclaration(decl: TypeDeclaration) {
        if (this.globalScope.getSymbol(decl.name.name)) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.position,
                    "duplicate type declaration: " + decl.name.name,
                ),
            );
            return;
        }

        if (decl.declKind == TypeDeclKind.Union) {
            const value = decl.declaration as UnionDecl;
            if (
                this.hasDuplicates(
                    value.variants.map((variant) => variant.name.name),
                    decl,
                    "variant",
                )
            ) {
                return;
            }
            this.globalScope.addSymbol({
                name: decl.name.name,
                kind: SymbolKind.SymbolTypeUnionDecl,
                type: {
                    name: value.name,
                    unionVariants: value.variants,
                    kind: "union",
                    custom: true,
                    value: TypeValue.TypeCustom,
                },
            });
            return;
        }
        if (decl.declKind == TypeDeclKind.Enum) {
            const value = decl.declaration as EnumDecl;
            if (
                this.hasDuplicates(
                    value.variants.map((variant) => variant.name.name),
                    decl,
                    "variant",
                )
            )
                return;
            this.globalScope.addSymbol({
                name: decl.name.name,
                kind: SymbolKind.SymbolTypeEnumDecl,
                type: {
                    name: value.name,
                    variants: value.variants,
                    kind: "enum",
                    custom: true,
                    value: TypeValue.TypeCustom,
                },
            });
            return;
        }
        if (decl.declKind == TypeDeclKind.Struct) {
            const value = decl.declaration as StructDecl;
            if (
                this.hasDuplicates(
                    value.fields.map((field) => field.name.name),
                    decl,
                    "field",
                )
            )
                return;
            this.globalScope.addSymbol({
                name: decl.name.name,
                kind: SymbolKind.SymbolTypeStructDecl,
                type: {
                    name: value.name,
                    fields: value.fields,
                    kind: "struct",
                    custom: true,
                    value: TypeValue.TypeCustom,
                },
            });
            return;
        }

        const value = decl.declaration as TypeAlias;
        const target = this.globalScope.getSymbol(value.target.name.name);
        if (!target) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.position,
                    "cannot create alias of `" + value.target.name.name + "` unknown identifier",
                ),
            );
            return;
        }
        this.globalScope.addSymbol({
            name: decl.name.name,
            kind: SymbolKind.SymbolTypsAliasDecl,
            type: target.type,
        });
    }

    private hasDuplicates(names: string[], decl: TypeDeclaration, noun: string): boolean {
        const duplicates = names.filter((name, index) => names.indexOf(name) != index);
        if (duplicates.length == 0) return false;
        this.diagnostics.addError(
            Error(
                this.ast.fileName,
                "semantic",
                decl.position,
                "duplicate " + noun + "(s) detected: " + duplicates.join(", "),
            ),
        );
        return true;
    }
}
