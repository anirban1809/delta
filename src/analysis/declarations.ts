import {
    TypeDeclKind,
    TypeValue,
    type Declaration,
    type EnumDecl,
    type FunctionDeclaration,
    type Identifier,
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

    /** Registers every named type before signatures and bodies are resolved. */
    registerTypes() {
        this.ast.declarations.forEach((decl) => {
            if (decl.kind == "type_declaration") this.analyzeTypeDeclaration(decl);
        });
    }

    /** Runs graph-wide validation that requires all type names to be known. */
    finish() {
        this.detectTypeCycles();
        this.flattenCompositions();
    }

    /** First pass: make every function signature visible for recursive calls. */
    registerFunctions() {
        this.ast.declarations.forEach((decl) => {
            if (decl.kind != "function_declaration") return;
            if (decl.receiver) return;
            if (this.globalScope.getSymbol(decl.name.name)) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        decl.name.position ?? decl.position,
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
                    declaration: decl,
                    typeParameters: decl.typeParameters,
                    external: decl.external,
                },
            });
        });
    }

    /** Registers and validates receiver functions after record shapes are complete. */
    registerMethods() {
        for (const declaration of this.ast.declarations) {
            if (declaration.kind != "function_declaration" || !declaration.receiver) continue;
            const receiver = declaration.receiver;
            if (!receiver.type.reference) {
                this.diagnostics.addError(Error(this.ast.fileName, "semantic", receiver.position, "method receiver must be a reference (`&T` or `edit &T`)"));
                continue;
            }
            let receiverType = this.globalScope.getSymbol(receiver.type.name.name);
            while (receiverType?.kind == SymbolKind.SymbolTypsAliasDecl && receiverType.type) {
                receiverType = this.globalScope.getSymbol(receiverType.type.name.name);
            }
            if (receiverType?.kind != SymbolKind.SymbolTypeStructDecl || !receiverType.type) {
                this.diagnostics.addError(Error(this.ast.fileName, "semantic", receiver.position, `method receiver must be a record type, got ${receiver.type.name.name}`));
                continue;
            }
            const recordName = receiverType.name;
            if (receiverType.type.fields?.some((field) => field.name.name == declaration.name.name)) {
                this.diagnostics.addError(Error(this.ast.fileName, "semantic", declaration.name.position ?? declaration.position, `method ${declaration.name.name} collides with field ${declaration.name.name} on type ${recordName}`));
                continue;
            }
            if (declaration.name.name == "dispose") {
                const typeDeclaration = receiverType.declaration?.kind == "type_declaration" ? receiverType.declaration : undefined;
                if (!typeDeclaration?.unique) this.diagnostics.addError(Error(this.ast.fileName, "semantic", declaration.name.position ?? declaration.position, `dispose method is allowed only on an explicit unique type ${recordName}`));
                if (!receiver.type.edit) this.diagnostics.addError(Error(this.ast.fileName, "semantic", receiver.position, `dispose receiver must be an editable reference; use edit &${recordName}`));
                if (declaration.parameters.length) this.diagnostics.addError(Error(this.ast.fileName, "semantic", declaration.parameters[0]!.position, "parameters in dispose method are not allowed"));
                if (declaration.errorTypes.length) this.diagnostics.addError(Error(this.ast.fileName, "semantic", declaration.errorTypes[0]!.position ?? declaration.position, "dispose method cannot have an error channel"));
                if (declaration.returnTypes.length) this.diagnostics.addError(Error(this.ast.fileName, "semantic", declaration.returnTypes[0]!.position ?? declaration.position, "dispose method must be void"));
                if (declaration.exported || this.ast.exportModule) this.diagnostics.addError(Error(this.ast.fileName, "semantic", declaration.name.position ?? declaration.position, "dispose method cannot be exported"));
            }
            const resolvedReceiver = structuredClone(receiverType.type);
            resolvedReceiver.reference = true;
            resolvedReceiver.edit = !!receiver.type.edit;
            const signature: FunctionSignature = {
                name: declaration.name.name,
                returnTypes: declaration.returnTypes,
                errorTypes: declaration.errorTypes,
                parameters: declaration.parameters,
                declaration,
                typeParameters: declaration.typeParameters,
                receiverType: resolvedReceiver,
                receiverName: receiver.name.name,
                receiverEdit: !!receiver.type.edit,
                external: declaration.external,
            };
            if (!this.globalScope.addMethod(recordName, declaration.name.name, signature)) {
                this.diagnostics.addError(Error(this.ast.fileName, "semantic", declaration.name.position ?? declaration.position, `duplicate method ${declaration.name.name} on type ${recordName}`));
            }
        }
    }

    /** Second pass: analyze a top-level type, variable, or function declaration. */
    analyze(decl: Declaration) {
        switch (decl.kind) {
            case "import_declaration":
                return;
            case "type_declaration":
                return;
            case "variable_declaration_statement":
                if (
                    decl.external?.abi == "delta" &&
                    !decl.external.moduleName
                ) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            decl.position,
                            "a `.ffi.delta` file declaring prebuilt Delta symbols must specify `ffi module \"<abi-name>\";`",
                        ),
                    );
                }
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
        if (decl.external?.abi == "delta" && !decl.external.moduleName) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.position,
                    "a `.ffi.delta` file declaring prebuilt Delta functions must specify `ffi module \"<abi-name>\";`",
                ),
            );
        }
        if (decl.external?.abi == "delta" && decl.typeParameters?.length) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.position,
                    "prebuilt Delta generic functions require explicit ABI specializations and are not supported yet",
                ),
            );
        }
        const functionScope = new Scope(this.globalScope);
        let methodSignature: FunctionSignature | undefined;
        if (decl.receiver) {
            const receiverSymbol = this.globalScope.getSymbol(decl.receiver.type.name.name);
            const recordName = receiverSymbol?.kind == SymbolKind.SymbolTypsAliasDecl
                ? receiverSymbol.type?.name.name
                : decl.receiver.type.name.name;
            methodSignature = recordName ? this.globalScope.getMethod(recordName, decl.name.name) : undefined;
            if (methodSignature?.receiverType) {
                functionScope.addSymbol({
                    name: decl.receiver.name.name,
                    kind: methodSignature.receiverEdit ? SymbolKind.SymbolLocalLet : SymbolKind.SymbolLocalConst,
                    type: methodSignature.receiverType,
                    assigned: true,
                    moved: "active",
                });
            }
        }
        if (decl.receiver && !methodSignature) return;
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
                !this.isValidFunctionSignatureType(
                    parameter.type,
                    decl,
                    parameter.position,
                    "parameter",
                )
            ) {
                functionScope.addSymbol({
                    name: parameter.name.name,
                    kind: SymbolKind.SymbolParameter,
                    type: { ...parameter.type, value: TypeValue.TypeInvalid },
                    assigned: true,
                    moved: "active",
                });
                return;
            }
            functionScope.addSymbol({
                name: parameter.name.name,
                kind: SymbolKind.SymbolParameter,
                type: parameter.type,
                assigned: true,
                moved: "active",
            });
        });

        decl.returnTypes.forEach((type) =>
            this.isValidFunctionSignatureType(type, decl, type.position ?? decl.position, "return"),
        );
        const normalizedErrors: Type[] = [];
        decl.errorTypes.forEach((type) => {
            if (this.typeAnalyzer.isValidPrimitiveType(type)) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        type.position!,
                        `error type \`${type.name.name}\` must be a declared record type`,
                    ),
                );
                return;
            }

            const errorSymbol = this.globalScope.getSymbol(type.name.name);
            if (!errorSymbol) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        type.position!,
                        "unknown type identifier: " + type.name.name,
                    ),
                );
                return;
            }
            if (errorSymbol.kind != SymbolKind.SymbolTypeStructDecl) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        type.position!,
                        `error type \`${type.name.name}\` must be a declared record type`,
                    ),
                );
                return;
            }
            if (!normalizedErrors.some((entry) => entry.name.name == type.name.name)) {
                normalizedErrors.push({ ...type, kind: "struct" });
            }
        });
        decl.errorTypes = normalizedErrors;

        // Extern declarations have no Delta body; their implementation is
        // supplied by the C linker after the signature has been validated.
        if (decl.external) return;

        const symbol = decl.receiver
            ? { name: decl.name.name, kind: SymbolKind.SymbolFuncDecl, signature: methodSignature }
            : this.globalScope.getSymbol(decl.name.name);
        if (symbol?.signature) symbol.signature.errorTypes = normalizedErrors;
        if (!decl.receiver && decl.name.name == "main" && !this.verifyMainFunctionSignature(symbol?.signature!)) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.name.position ?? decl.position,
                    "`main` must be declared at top level as `function main(): int8`",
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
            pendingResults: new Map(),
        };
        this.statementAnalyzer.analyzeBlock(decl.body, context, functionScope);
        for (const pending of context.pendingResults.values()) {
            const missing = pending.errorTypes
                .map((type) => type.name.name)
                .filter((name) => !pending.handledErrorTypes.has(name));
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    pending.position,
                    `fallible result \`${pending.name}\` is not fully handled; missing check${missing.length == 1 ? "" : "s"} for ${missing.map((name) => `\`${name}\``).join(", ")}`,
                ),
            );
        }
        if (decl.returnTypes.length > 0 && !this.statementAnalyzer.blockDiverges(decl.body)) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.name.position ?? decl.position,
                    `missing return: function ${decl.name.name} must return a value on all reachable paths`,
                ),
            );
        }
        return;
    }

    /**
     * Validates a type that appears in a function signature. Named types must
     * resolve to a type declaration, whereas generic types must be declared by
     * this function's own type-parameter list.
     */
    private isValidFunctionSignatureType(
        type: Type,
        decl: FunctionDeclaration,
        position: Type["position"] | FunctionDeclaration["position"],
        usage: "parameter" | "return",
    ): boolean {
        if (this.typeAnalyzer.isCType(type)) {
            if (decl.external?.abi != "c") {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        type.position ?? position!,
                        "C ABI types are only permitted in extern declarations",
                    ),
                );
                return false;
            }
            if (this.typeAnalyzer.isValidCType(type)) return true;
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    type.position ?? position!,
                    `unsupported C ABI type: ${type.name.name}`,
                ),
            );
            return false;
        }
        if (this.typeAnalyzer.isIndirection(type)) {
            if (usage == "return") {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        type.position ?? position!,
                        "indirection types are only permitted in record fields and function parameters",
                    ),
                );
                return false;
            }
            return this.validateIndirectionType(type, type.position ?? position!);
        }
        if (this.typeAnalyzer.isValidPrimitiveType(type)) {
            return true;
        }

        if (type.value == TypeValue.TypeGeneric) {
            const declared = decl.typeParameters?.some(
                (typeParameter) => typeParameter.name.name == type.name.name,
            );
            if (declared) {
                return true;
            }

            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    position!,
                    "undeclared type parameter: " + type.name.name,
                ),
            );
            return false;
        }

        if (type.value == TypeValue.TypeCustom) {
            const symbol = this.globalScope.getSymbol(type.name.name);
            const isTypeDeclaration =
                symbol !== undefined &&
                [
                    SymbolKind.SymbolTypeStructDecl,
                    SymbolKind.SymbolTypeEnumDecl,
                    SymbolKind.SymbolTypeUnionDecl,
                    SymbolKind.SymbolTypsAliasDecl,
                ].includes(symbol.kind);

            if (isTypeDeclaration) {
                return true;
            }

            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    position!,
                    "unknown type identifier: " + type.name.name,
                ),
            );
            return false;
        }

        this.diagnostics.addError(
            Error(
                this.ast.fileName,
                "semantic",
                position!,
                `invalid ${usage} type: ` + type.name.name,
            ),
        );
        return false;
    }

    /** Checks the required zero-argument, non-error `int8` main signature. */
    private verifyMainFunctionSignature(signature: FunctionSignature): boolean {
        return (
            signature.parameters.length == 0 &&
            signature.errorTypes.length == 0 &&
            signature.returnTypes.length == 1 &&
            signature.returnTypes[0]?.value == TypeValue.Type_Int8
        );
    }

    /** Registers union, enum, struct, and alias declarations in the global scope. */
    private analyzeTypeDeclaration(decl: TypeDeclaration) {
        if (this.globalScope.getSymbol(decl.name.name)) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.name.position ?? decl.position,
                    "duplicate type declaration: " + decl.name.name,
                ),
            );
            return;
        }

        if (decl.declKind == TypeDeclKind.Union) {
            const value = decl.declaration as UnionDecl;
            for (const variant of value.variants) {
                const unknownType = this.findUnknownDeclaredType(
                    variant,
                    value.typeParameters,
                );
                if (unknownType) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            unknownType.position ?? decl.position,
                            "unknown type identifier: " + unknownType.name.name,
                        ),
                    );
                    return;
                }
            }
            if (
                this.hasDuplicates(
                    value.variants.map((variant) => variant.name),
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
                    typeParameters: value.typeParameters,
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
                    value.variants.map((variant) => variant.name),
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
            for (const field of value.fields) {
                if (
                    this.typeAnalyzer.isIndirection(field.type) &&
                    !this.validateIndirectionType(
                        field.type,
                        field.type.position ?? field.name.position ?? decl.position,
                    )
                ) {
                    return;
                }
                if (!this.isDeclaredFieldType(field.type, value.typeParameters)) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            field.type.position ?? field.name.position ?? decl.position,
                            "unknown type identifier: " + field.type.name.name,
                        ),
                    );
                    return;
                }
                if (field.type.arrayLengths?.some((length) => length == 0)) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            field.type.position ?? field.name.position ?? decl.position,
                            "zero length arrays types are not allowed!",
                        ),
                    );
                    return;
                }
                if (field.type.name.name == "void") {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            field.type.position ?? field.name.position ?? decl.position,
                            "void is not a valid struct field type",
                        ),
                    );
                    return;
                }
            }
            if (
                this.hasDuplicates(
                    value.fields.map((field) => field.name),
                    decl,
                    "field",
                )
            )
                return;
            this.globalScope.addSymbol({
                name: decl.name.name,
                kind: SymbolKind.SymbolTypeStructDecl,
                declaration: decl,
                type: {
                    name: value.name,
                    fields: value.fields,
                    typeParameters: value.typeParameters,
                    kind: "struct",
                    custom: true,
                    value: TypeValue.TypeCustom,
                },
            });
            return;
        }

        const value = decl.declaration as TypeAlias;
        this.globalScope.addSymbol({
            name: decl.name.name,
            kind: SymbolKind.SymbolTypsAliasDecl,
            declaration: decl,
            type: value.target,
        });
    }

    /** Finds the first undeclared name in a union variant and its type arguments. */
    private findUnknownDeclaredType(type: Type, typeParameters?: Type[]): Type | undefined {
        const isTypeParameter = typeParameters?.some(
            (parameter) => parameter.name.name == type.name.name,
        );
        const symbol = this.globalScope.getSymbol(type.name.name);
        const isDeclaredTypeSymbol =
            symbol !== undefined &&
            [
                SymbolKind.SymbolTypeStructDecl,
                SymbolKind.SymbolTypeEnumDecl,
                SymbolKind.SymbolTypeUnionDecl,
                SymbolKind.SymbolTypsAliasDecl,
            ].includes(symbol.kind);
        const isDeclaredType =
            isDeclaredTypeSymbol ||
            this.ast.declarations.some(
                (declaration) =>
                    declaration.kind == "type_declaration" &&
                    declaration.name.name == type.name.name,
            );

        if (
            !isTypeParameter &&
            !this.typeAnalyzer.isValidPrimitiveType(type) &&
            !isDeclaredType
        ) {
            return type;
        }

        for (const argument of type.typeParameters ?? []) {
            const unknownType = this.findUnknownDeclaredType(argument, typeParameters);
            if (unknownType) return unknownType;
        }
        return undefined;
    }

    private isDeclaredFieldType(type: Type, typeParameters?: Type[]): boolean {
        if (this.typeAnalyzer.isIndirection(type)) return true;
        if (this.typeAnalyzer.isValidPrimitiveType(type)) return true;
        if (
            type.value == TypeValue.TypeGeneric &&
            typeParameters?.some((parameter) => parameter.name.name == type.name.name)
        ) {
            return true;
        }
        return this.ast.declarations.some(
            (declaration) =>
                declaration.kind == "type_declaration" &&
                declaration.name.name == type.name.name,
        );
    }

    private validateIndirectionType(type: Type, position: NonNullable<Type["position"]>): boolean {
        const arguments_ = type.typeParameters ?? [];
        if (arguments_.length != 1) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    position,
                    `${type.name.name}<T> requires exactly one type argument`,
                ),
            );
            return false;
        }
        const inner = arguments_[0]!;
        if (inner.name.name == "void") {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    inner.position ?? position,
                    "cannot allocate void",
                ),
            );
            return false;
        }
        if (this.typeAnalyzer.isIndirection(inner)) {
            return this.validateIndirectionType(inner, inner.position ?? position);
        }
        const declared = this.ast.declarations.some(
            (declaration) =>
                declaration.kind == "type_declaration" &&
                declaration.name.name == inner.name.name,
        );
        if (
            inner.value != TypeValue.TypeGeneric &&
            !this.typeAnalyzer.isValidPrimitiveType(inner) &&
            !declared
        ) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    inner.position ?? position,
                    "unknown type identifier: " + inner.name.name,
                ),
            );
            return false;
        }
        return true;
    }

    private detectTypeCycles() {
        const declarations = new Map<string, TypeDeclaration>();
        for (const declaration of this.ast.declarations) {
            if (declaration.kind == "type_declaration") declarations.set(declaration.name.name, declaration);
        }
        const state = new Map<string, 0 | 1 | 2>();
        const stack: string[] = [];
        const reported = new Set<string>();
        const edges = (declaration: TypeDeclaration): string[] => {
            if (declaration.declKind == TypeDeclKind.Alias) {
                return [(declaration.declaration as TypeAlias).target.name.name];
            }
            if (declaration.declKind != TypeDeclKind.Struct) return [];
            const struct = declaration.declaration as StructDecl;
            return [
                ...struct.fields
                    .filter((field) => !this.typeAnalyzer.isIndirection(field.type) && !field.type.reference)
                    .map((field) => field.type.name.name),
                ...(struct.compositions ?? []).map((type) => type.name.name),
            ];
        };
        const visit = (name: string) => {
            const declaration = declarations.get(name);
            if (!declaration || state.get(name) == 2) return;
            if (state.get(name) == 1) {
                const start = stack.indexOf(name);
                const cycle = [...stack.slice(start), name];
                const key = [...new Set(cycle)].sort().join("|");
                if (!reported.has(key)) {
                    reported.add(key);
                    this.diagnostics.addError(Error(this.ast.fileName, "semantic", declaration.name.position ?? declaration.position, `type cycle has infinite size: ${cycle.join(" -> ")}; use owned<T> to break the cycle`));
                }
                return;
            }
            state.set(name, 1);
            stack.push(name);
            edges(declaration).forEach(visit);
            stack.pop();
            state.set(name, 2);
        };
        declarations.forEach((_, name) => visit(name));
    }

    private flattenCompositions() {
        const resolving = new Set<string>();
        const cache = new Map<string, StructDecl["fields"]>();
        const resolve = (name: string): StructDecl["fields"] => {
            if (cache.has(name)) return structuredClone(cache.get(name)!);
            if (resolving.has(name)) return [];
            const symbol = this.globalScope.getSymbol(name);
            const declaration = symbol?.declaration;
            if (symbol?.kind == SymbolKind.SymbolTypsAliasDecl && symbol.type) return resolve(symbol.type.name.name);
            if (declaration?.kind != "type_declaration" || declaration.declKind != TypeDeclKind.Struct) return [];
            resolving.add(name);
            const struct = declaration.declaration as StructDecl;
            for (const composition of struct.compositions ?? []) {
                const operand = this.globalScope.getSymbol(composition.name.name);
                const isRecord = operand?.kind == SymbolKind.SymbolTypeStructDecl || operand?.kind == SymbolKind.SymbolTypsAliasDecl;
                if (!isRecord) {
                    this.diagnostics.addError(Error(this.ast.fileName, "semantic", composition.position ?? declaration.position, `non struct type ${composition.name.name} cannot be used in composition`));
                }
            }
            const fields = [
                ...(struct.compositions ?? []).flatMap((composition) => resolve(composition.name.name)),
                ...struct.fields,
            ];
            resolving.delete(name);
            const duplicate = fields.find((field, index) => fields.findIndex((other) => other.name.name == field.name.name) != index);
            if (duplicate) {
                this.diagnostics.addError(Error(this.ast.fileName, "semantic", duplicate.name.position ?? declaration.position, `duplicate field collision in composition: ${duplicate.name.name}`));
            }
            cache.set(name, fields);
            struct.fields = fields;
            if (symbol?.type) symbol.type.fields = fields;
            return structuredClone(fields);
        };
        for (const declaration of this.ast.declarations) {
            if (declaration.kind == "type_declaration" && declaration.declKind == TypeDeclKind.Struct) resolve(declaration.name.name);
        }
    }

    private hasDuplicates(names: Identifier[], decl: TypeDeclaration, noun: string): boolean {
        const duplicates = names.filter(
            (name, index) => names.findIndex((candidate) => candidate.name == name.name) != index,
        );
        if (duplicates.length == 0) return false;
        this.diagnostics.addError(
            Error(
                this.ast.fileName,
                "semantic",
                duplicates[0]!.position ?? decl.name.position ?? decl.position,
                "duplicate " + noun + "(s) detected: " + duplicates.map((name) => name.name).join(", "),
            ),
        );
        return true;
    }
}
