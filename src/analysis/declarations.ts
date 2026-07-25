import {
    TypeDeclKind,
    TypeValue,
    type Declaration,
    type EnumDecl,
    type FunctionDeclaration,
    type Identifier,
    type InterfaceDeclaration,
    type InterfaceMethodRequirement,
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
import { validateSpecializationCapability } from "./expression_analyzer.js";
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
    registerInterfaces() {
        for (const declaration of this.ast.declarations) {
            if (declaration.kind != "interface_declaration") continue;
            if (this.globalScope.getSymbol(declaration.name.name)) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        declaration.name.position ?? declaration.position,
                        `interface \`${declaration.name.name}\` is declared more than once`,
                    ),
                );
                continue;
            }
            this.globalScope.addSymbol({
                name: declaration.name.name,
                kind: SymbolKind.SymbolInterfaceDecl,
                declaration,
            });
        }
        for (const declaration of this.ast.declarations) {
            if (declaration.kind != "interface_declaration") continue;
            for (const method of declaration.methods) {
                this.validateTypeParameterBounds(method.typeParameters, method.position);
            }
        }
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
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        receiver.position,
                        "method receiver must be a reference (`&T` or `edit &T`)",
                    ),
                );
                continue;
            }
            let receiverType = this.globalScope.getSymbol(receiver.type.name.name);
            while (receiverType?.kind == SymbolKind.SymbolTypsAliasDecl && receiverType.type) {
                receiverType = this.globalScope.getSymbol(receiverType.type.name.name);
            }
            if (receiverType?.kind != SymbolKind.SymbolTypeStructDecl || !receiverType.type) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        receiver.position,
                        `method receiver must be a record type, got ${receiver.type.name.name}`,
                    ),
                );
                continue;
            }
            const recordName = receiverType.name;
            if (
                receiverType.type.fields?.some((field) => field.name.name == declaration.name.name)
            ) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        declaration.name.position ?? declaration.position,
                        `method ${declaration.name.name} collides with field ${declaration.name.name} on type ${recordName}`,
                    ),
                );
                continue;
            }
            if (declaration.name.name == "dispose") {
                const typeDeclaration =
                    receiverType.declaration?.kind == "type_declaration"
                        ? receiverType.declaration
                        : undefined;
                if (!typeDeclaration?.unique)
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            declaration.name.position ?? declaration.position,
                            `dispose method is allowed only on an explicit unique type ${recordName}`,
                        ),
                    );
                if (!receiver.type.edit)
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            receiver.position,
                            `dispose receiver must be an editable reference; use edit &${recordName}`,
                        ),
                    );
                if (declaration.parameters.length)
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            declaration.parameters[0]!.position,
                            "parameters in dispose method are not allowed",
                        ),
                    );
                if (declaration.errorTypes.length)
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            declaration.errorTypes[0]!.position ?? declaration.position,
                            "dispose method cannot have an error channel",
                        ),
                    );
                if (declaration.returnTypes.length)
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            declaration.returnTypes[0]!.position ?? declaration.position,
                            "dispose method must be void",
                        ),
                    );
                if (declaration.exported || this.ast.exportModule)
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            declaration.name.position ?? declaration.position,
                            "dispose method cannot be exported",
                        ),
                    );
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
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        declaration.name.position ?? declaration.position,
                        `duplicate method ${declaration.name.name} on type ${recordName}`,
                    ),
                );
            }
        }
    }

    /** Validates every explicit `implements` clause after methods are registered. */
    validateImplementations() {
        for (const declaration of this.ast.declarations) {
            if (
                declaration.kind != "type_declaration" ||
                declaration.declKind != TypeDeclKind.Struct
            ) {
                continue;
            }
            const record = declaration.declaration as StructDecl;
            const implemented = record.implementedInterfaces ?? [];
            const requirementsByName = new Map<
                string,
                { requirement: InterfaceMethodRequirement; interfaceName: string }
            >();
            for (const interfaceType of implemented) {
                const symbol = this.globalScope.getSymbol(interfaceType.name.name);
                if (!symbol) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            interfaceType.position ?? declaration.position,
                            `unknown interface \`${interfaceType.name.name}\``,
                        ),
                    );
                    continue;
                }
                if (
                    symbol.kind != SymbolKind.SymbolInterfaceDecl ||
                    symbol.declaration?.kind != "interface_declaration"
                ) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            interfaceType.position ?? declaration.position,
                            `\`${interfaceType.name.name}\` is not an interface`,
                        ),
                    );
                    continue;
                }
                const interfaceDeclaration = symbol.declaration as InterfaceDeclaration;
                let valid = true;
                for (const requirement of interfaceDeclaration.methods) {
                    const previous = requirementsByName.get(requirement.name.name);
                    if (
                        previous &&
                        !this.interfaceRequirementsMatch(previous.requirement, requirement)
                    ) {
                        this.diagnostics.addError(
                            Error(
                                this.ast.fileName,
                                "semantic",
                                requirement.name.position ?? requirement.position,
                                `interfaces \`${previous.interfaceName}\` and \`${interfaceType.name.name}\` require incompatible overloads of \`${requirement.name.name}\``,
                            ),
                        );
                        valid = false;
                        continue;
                    }
                    requirementsByName.set(requirement.name.name, {
                        requirement,
                        interfaceName: interfaceType.name.name,
                    });
                    const method = this.globalScope.getMethod(
                        declaration.name.name,
                        requirement.name.name,
                    );
                    if (!method) {
                        this.diagnostics.addError(
                            Error(
                                this.ast.fileName,
                                "semantic",
                                interfaceType.position ?? declaration.position,
                                `type \`${declaration.name.name}\` declares that it implements \`${interfaceType.name.name}\` but is missing method \`${requirement.name.name}\``,
                            ),
                        );
                        valid = false;
                        continue;
                    }
                    if (
                        !this.methodSatisfiesRequirement(
                            declaration.name.name,
                            interfaceType.name.name,
                            method,
                            requirement,
                        )
                    ) {
                        valid = false;
                    }
                    const publicConformance =
                        (declaration.exported || !!this.ast.exportModule) &&
                        (interfaceDeclaration.exported ||
                            !!interfaceDeclaration.external ||
                            !!this.ast.exportModule);
                    if (
                        publicConformance &&
                        !method.declaration?.exported &&
                        !method.declaration?.external &&
                        !this.ast.exportModule
                    ) {
                        this.diagnostics.addError(
                            Error(
                                this.ast.fileName,
                                "semantic",
                                method.declaration?.name.position ??
                                    method.declaration?.position ??
                                    requirement.position,
                                `method \`${declaration.name.name}.${requirement.name.name}\` must be exported because it provides public conformance to \`${interfaceType.name.name}\``,
                            ),
                        );
                        valid = false;
                    }
                }
                if (valid) {
                    this.globalScope.addImplementation(
                        declaration.name.name,
                        interfaceType.name.name,
                    );
                }
            }
        }
    }

    /**
     * Checks the specializations that were requested before their callee's body
     * had been analyzed. Running these after every body in the module keeps
     * receiver-capability validation independent of declaration order.
     */
    validateDeferredSpecializations() {
        for (const declaration of this.ast.declarations) {
            if (declaration.kind != "function_declaration") continue;
            const pending = declaration.deferredSpecializations ?? [];
            declaration.deferredSpecializations = undefined;
            for (const request of pending) {
                validateSpecializationCapability(
                    declaration,
                    request.typeParameter,
                    request.concrete,
                    this.globalScope,
                    this.diagnostics,
                    request.fileName,
                    request.position,
                );
            }
        }
    }

    private interfaceRequirementsMatch(
        left: InterfaceMethodRequirement,
        right: InterfaceMethodRequirement,
    ): boolean {
        if (
            left.parameters.length != right.parameters.length ||
            left.returnTypes.length != right.returnTypes.length ||
            left.errorTypes.length != right.errorTypes.length ||
            !this.typeParametersMatch(left.typeParameters, right.typeParameters)
        ) {
            return false;
        }
        const bindings = new Map<string, Type>();
        (left.typeParameters ?? []).forEach((parameter, index) => {
            const target = right.typeParameters?.[index];
            if (target) bindings.set(parameter.name.name, target);
        });
        const matches = (a: Type, b: Type) =>
            this.typeAnalyzer.arrayTypesMatch(this.typeAnalyzer.substituteType(a, bindings), b);
        return (
            left.parameters.every(
                (parameter, index) =>
                    !!parameter.variadic == !!right.parameters[index]!.variadic &&
                    matches(parameter.type, right.parameters[index]!.type),
            ) &&
            left.returnTypes.every((type, index) => matches(type, right.returnTypes[index]!)) &&
            left.errorTypes.every((type) =>
                right.errorTypes.some((candidate) => matches(type, candidate)),
            )
        );
    }

    private methodSatisfiesRequirement(
        concreteName: string,
        interfaceName: string,
        method: FunctionSignature,
        requirement: InterfaceMethodRequirement,
    ): boolean {
        if (method.parameters.length != requirement.parameters.length) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    requirement.position,
                    `method \`${concreteName}.${requirement.name.name}\` does not satisfy \`${interfaceName}.${requirement.name.name}\`: parameter count must be ${requirement.parameters.length}, got ${method.parameters.length}`,
                ),
            );
            return false;
        }
        if (!this.typeParametersMatch(requirement.typeParameters, method.typeParameters)) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    requirement.position,
                    `method \`${concreteName}.${requirement.name.name}\` does not satisfy \`${interfaceName}.${requirement.name.name}\`: generic parameter bounds or variadic shape differ`,
                ),
            );
            return false;
        }
        const bindings = new Map<string, Type>();
        (requirement.typeParameters ?? []).forEach((parameter, index) => {
            const target = method.typeParameters?.[index];
            if (target) bindings.set(parameter.name.name, target);
        });
        const required = (type: Type) => this.typeAnalyzer.substituteType(type, bindings);
        for (let index = 0; index < requirement.parameters.length; index++) {
            const want = required(requirement.parameters[index]!.type);
            const have = method.parameters[index]!.type;
            if (
                !!requirement.parameters[index]!.variadic != !!method.parameters[index]!.variadic ||
                !this.typeAnalyzer.arrayTypesMatch(want, have)
            ) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        method.parameters[index]!.position,
                        `method \`${concreteName}.${requirement.name.name}\` does not satisfy \`${interfaceName}.${requirement.name.name}\`: parameter ${index + 1} must be \`${this.typeAnalyzer.displayName(want)}\`, got \`${this.typeAnalyzer.displayName(have)}\``,
                    ),
                );
                return false;
            }
        }
        if (method.returnTypes.length != requirement.returnTypes.length) {
            this.addRequirementReturnError(concreteName, interfaceName, method, requirement);
            return false;
        }
        for (let index = 0; index < requirement.returnTypes.length; index++) {
            if (
                !this.typeAnalyzer.arrayTypesMatch(
                    required(requirement.returnTypes[index]!),
                    method.returnTypes[index]!,
                )
            ) {
                this.addRequirementReturnError(concreteName, interfaceName, method, requirement);
                return false;
            }
        }
        const requiredErrors = requirement.errorTypes.map(required);
        if (
            method.errorTypes.length != requiredErrors.length ||
            !requiredErrors.every((type) =>
                method.errorTypes.some((candidate) =>
                    this.typeAnalyzer.arrayTypesMatch(type, candidate),
                ),
            )
        ) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    method.declaration?.position ?? requirement.position,
                    `method \`${concreteName}.${requirement.name.name}\` does not satisfy \`${interfaceName}.${requirement.name.name}\`: error set differs`,
                ),
            );
            return false;
        }
        return true;
    }

    private typeParametersMatch(left?: Type[], right?: Type[]): boolean {
        if ((left?.length ?? 0) != (right?.length ?? 0)) return false;
        return (left ?? []).every((parameter, index) => {
            const candidate = right![index]!;
            const bounds = parameter.interfaceBounds ?? [];
            const candidateBounds = candidate.interfaceBounds ?? [];
            return (
                !!parameter.variadic == !!candidate.variadic &&
                bounds.length == candidateBounds.length &&
                bounds.every((bound) =>
                    candidateBounds.some(
                        (candidateBound) => candidateBound.name.name == bound.name.name,
                    ),
                )
            );
        });
    }

    private validateTypeParameterBounds(
        typeParameters: Type[] | undefined,
        position: Type["position"] | FunctionDeclaration["position"],
    ): void {
        for (const parameter of typeParameters ?? []) {
            for (const bound of parameter.interfaceBounds ?? []) {
                const symbol = this.globalScope.getSymbol(bound.name.name);
                if (symbol?.kind == SymbolKind.SymbolInterfaceDecl) continue;
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        bound.position ?? position!,
                        symbol
                            ? `generic bound \`${bound.name.name}\` is not an interface`
                            : `unknown interface bound \`${bound.name.name}\``,
                    ),
                );
            }
        }
    }

    private addRequirementReturnError(
        concreteName: string,
        interfaceName: string,
        method: FunctionSignature,
        requirement: InterfaceMethodRequirement,
    ): void {
        const want = requirement.returnTypes.length
            ? requirement.returnTypes.map((type) => this.typeAnalyzer.displayName(type)).join(", ")
            : "void";
        const have = method.returnTypes.length
            ? method.returnTypes.map((type) => this.typeAnalyzer.displayName(type)).join(", ")
            : "void";
        this.diagnostics.addError(
            Error(
                this.ast.fileName,
                "semantic",
                method.declaration?.position ?? requirement.position,
                `method \`${concreteName}.${requirement.name.name}\` does not satisfy \`${interfaceName}.${requirement.name.name}\`: return type must be \`${want}\`, got \`${have}\``,
            ),
        );
    }

    /** Second pass: analyze a top-level type, variable, or function declaration. */
    analyze(decl: Declaration) {
        switch (decl.kind) {
            case "import_declaration":
            case "interface_declaration":
                return;
            case "type_declaration":
                return;
            case "variable_declaration_statement":
                if (decl.external?.abi == "delta" && !decl.external.moduleName) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            decl.position,
                            'a `.ffi.delta` file declaring prebuilt Delta symbols must specify `ffi module "<abi-name>";`',
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
                // Set on every path out of the body analysis, including the
                // early returns for extern and malformed declarations, so the
                // constrained calls recorded on `decl` are known to be complete.
                decl.bodyAnalyzed = true;
        }
    }

    /** Validates a function signature and delegates its body to the statement layer. */
    private analyzeFunctionDeclaration(decl: FunctionDeclaration) {
        this.validateTypeParameterBounds(decl.typeParameters, decl.position);
        if (decl.external?.abi == "delta" && !decl.external.moduleName) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.position,
                    'a `.ffi.delta` file declaring prebuilt Delta functions must specify `ffi module "<abi-name>";`',
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
        functionScope.activeFunction = decl;
        let methodSignature: FunctionSignature | undefined;
        if (decl.receiver) {
            const receiverSymbol = this.globalScope.getSymbol(decl.receiver.type.name.name);
            const recordName =
                receiverSymbol?.kind == SymbolKind.SymbolTypsAliasDecl
                    ? receiverSymbol.type?.name.name
                    : decl.receiver.type.name.name;
            methodSignature = recordName
                ? this.globalScope.getMethod(recordName, decl.name.name)
                : undefined;
            if (methodSignature?.receiverType) {
                functionScope.addSymbol({
                    name: decl.receiver.name.name,
                    kind: methodSignature.receiverEdit
                        ? SymbolKind.SymbolLocalLet
                        : SymbolKind.SymbolLocalConst,
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

        decl.returnTypes.forEach((type, index) => {
            if (
                this.isValidFunctionSignatureType(
                    type,
                    decl,
                    type.position ?? decl.position,
                    "return",
                )
            ) {
                return;
            }
            // Mark the rejected type invalid, the way an invalid parameter type
            // is recorded, so the body's return checks do not report a second
            // failure against a type whose declaration was already rejected.
            decl.returnTypes[index] = { ...type, value: TypeValue.TypeInvalid };
        });
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
        if (
            !decl.receiver &&
            decl.name.name == "main" &&
            !this.verifyMainFunctionSignature(symbol?.signature!)
        ) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.name.position ?? decl.position,
                    "`main` must be declared at top level as `function main(): uint8`",
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
            if (this.reportInterfaceAsValueType(type, position!)) {
                return false;
            }
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

    /** Checks the required zero-argument, non-error `uint8` main signature. */
    private verifyMainFunctionSignature(signature: FunctionSignature): boolean {
        return (
            signature.parameters.length == 0 &&
            signature.errorTypes.length == 0 &&
            signature.returnTypes.length == 1 &&
            signature.returnTypes[0]?.value == TypeValue.Type_UInt8
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

        this.rejectDeclarationTypeParameterBounds(decl);

        if (decl.declKind == TypeDeclKind.Union) {
            const value = decl.declaration as UnionDecl;
            for (const variant of value.variants) {
                const unknownType = this.findUnknownDeclaredType(variant, value.typeParameters);
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
                    const position = field.type.position ?? field.name.position ?? decl.position;
                    if (!this.reportInterfaceAsValueType(field.type, position)) {
                        this.diagnostics.addError(
                            Error(
                                this.ast.fileName,
                                "semantic",
                                position,
                                "unknown type identifier: " + field.type.name.name,
                            ),
                        );
                    }
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

        if (!isTypeParameter && !this.typeAnalyzer.isValidPrimitiveType(type) && !isDeclaredType) {
            return type;
        }

        for (const argument of type.typeParameters ?? []) {
            const unknownType = this.findUnknownDeclaredType(argument, typeParameters);
            if (unknownType) return unknownType;
        }
        return undefined;
    }

    /**
     * Rejects an interface bound written on a type declaration's own type
     * parameter. Bounds are only honoured on functions and receiver functions,
     * so accepting one here would silently promise a constraint that is never
     * checked at instantiation.
     */
    private rejectDeclarationTypeParameterBounds(decl: TypeDeclaration): void {
        const declaration = decl.declaration as { typeParameters?: Type[] };
        for (const parameter of declaration.typeParameters ?? []) {
            for (const bound of parameter.interfaceBounds ?? []) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        bound.position ?? parameter.position ?? decl.position,
                        `interface bound \`${bound.name.name}\` is not supported on a type declaration's type parameter \`${parameter.name.name}\`; place the bound on the function that requires it`,
                    ),
                );
            }
        }
    }

    /**
     * Reports a named interface used where a value type is expected, and says
     * so in those terms rather than claiming the name is undeclared. Returns
     * whether the diagnostic was emitted.
     */
    private reportInterfaceAsValueType(
        type: Type,
        position: NonNullable<Type["position"]>,
    ): boolean {
        if (this.globalScope.getSymbol(type.name.name)?.kind != SymbolKind.SymbolInterfaceDecl) {
            return false;
        }
        this.diagnostics.addError(
            Error(
                this.ast.fileName,
                "semantic",
                position,
                `interface \`${type.name.name}\` is a compile-time constraint and cannot be used as a value type`,
            ),
        );
        return true;
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
                declaration.kind == "type_declaration" && declaration.name.name == type.name.name,
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
                declaration.kind == "type_declaration" && declaration.name.name == inner.name.name,
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
            if (declaration.kind == "type_declaration")
                declarations.set(declaration.name.name, declaration);
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
                    .filter(
                        (field) =>
                            !this.typeAnalyzer.isIndirection(field.type) && !field.type.reference,
                    )
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
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            declaration.name.position ?? declaration.position,
                            `type cycle has infinite size: ${cycle.join(" -> ")}; use owned<T> to break the cycle`,
                        ),
                    );
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
            if (symbol?.kind == SymbolKind.SymbolTypsAliasDecl && symbol.type)
                return resolve(symbol.type.name.name);
            if (
                declaration?.kind != "type_declaration" ||
                declaration.declKind != TypeDeclKind.Struct
            )
                return [];
            resolving.add(name);
            const struct = declaration.declaration as StructDecl;
            for (const composition of struct.compositions ?? []) {
                const operand = this.globalScope.getSymbol(composition.name.name);
                const isRecord =
                    operand?.kind == SymbolKind.SymbolTypeStructDecl ||
                    operand?.kind == SymbolKind.SymbolTypsAliasDecl;
                if (!isRecord) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            composition.position ?? declaration.position,
                            `non struct type ${composition.name.name} cannot be used in composition`,
                        ),
                    );
                }
            }
            const fields = [
                ...(struct.compositions ?? []).flatMap((composition) =>
                    resolve(composition.name.name),
                ),
                ...struct.fields,
            ];
            resolving.delete(name);
            const duplicate = fields.find(
                (field, index) =>
                    fields.findIndex((other) => other.name.name == field.name.name) != index,
            );
            if (duplicate) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        duplicate.name.position ?? declaration.position,
                        `duplicate field collision in composition: ${duplicate.name.name}`,
                    ),
                );
            }
            cache.set(name, fields);
            struct.fields = fields;
            if (symbol?.type) symbol.type.fields = fields;
            return structuredClone(fields);
        };
        for (const declaration of this.ast.declarations) {
            if (
                declaration.kind == "type_declaration" &&
                declaration.declKind == TypeDeclKind.Struct
            )
                resolve(declaration.name.name);
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
                "duplicate " +
                    noun +
                    "(s) detected: " +
                    duplicates.map((name) => name.name).join(", "),
            ),
        );
        return true;
    }
}
