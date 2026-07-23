import { SymbolKind, type FunctionSignature, type Symbol } from "../analysis/analyzer.js";
import { Scope } from "../analysis/scope.js";
import { TypeValue, type Module, type Position, type Type } from "../ast/types.js";

export type ImportedSymbolReference = {
    moduleName: string;
    sourceName: string;
    linkName?: string;
};

export type SymbolExportBinding = {
    kind: "symbol";
    name: string;
    sourceName: string;
    moduleName: string;
    symbol: Symbol;
    scope: Scope;
};

export type NamespaceExportBinding = {
    kind: "namespace";
    name: string;
    declaredName: string;
    exports: Map<string, ExportBinding>;
};

export type ExportBinding = SymbolExportBinding | NamespaceExportBinding;

export type BindingDiagnostic = (position: Position, message: string) => void;

/** Whether importing this binding exposes at least one raw C entry point. */
export function bindingRequiresUnsafe(binding: ExportBinding): boolean {
    if (binding.kind == "symbol") return binding.symbol.signature?.external?.abi == "c";
    return [...binding.exports.values()].some(bindingRequiresUnsafe);
}

function renamed(binding: ExportBinding, name: string): ExportBinding {
    return binding.kind == "symbol" ? { ...binding, name } : { ...binding, name };
}

function rewriteType(type: Type | undefined, names: Map<string, string>): Type | undefined {
    if (!type) return;
    const rewritten = structuredClone(type);
    const replacement = names.get(rewritten.name.name);
    if (replacement && rewritten.value == TypeValue.TypeCustom) {
        rewritten.name.name = replacement;
    }
    rewritten.typeParameters = rewritten.typeParameters?.map(
        (argument) => rewriteType(argument, names)!,
    );
    rewritten.fields = rewritten.fields?.map((field) => ({
        name: field.name,
        type: rewriteType(field.type, names)!,
    }));
    rewritten.unionVariants = rewritten.unionVariants?.map(
        (variant) => rewriteType(variant, names)!,
    );
    return rewritten;
}

function rewriteSignature(
    signature: FunctionSignature | undefined,
    names: Map<string, string>,
): FunctionSignature | undefined {
    if (!signature) return;
    return {
        ...signature,
        parameters: signature.parameters.map((parameter) => ({
            ...parameter,
            type: rewriteType(parameter.type, names)!,
        })),
        returnTypes: signature.returnTypes.map((type) => rewriteType(type, names)!),
        errorTypes: signature.errorTypes.map((type) => rewriteType(type, names)!),
        typeParameters: signature.typeParameters?.map((type) => rewriteType(type, names)!),
        receiverType: rewriteType(signature.receiverType, names),
    };
}

function namespaceTypeNames(
    prefix: string,
    exports: Map<string, ExportBinding>,
): Map<string, string> {
    const names = new Map<string, string>();
    for (const [exportName, binding] of exports) {
        if (binding.kind != "symbol" || !binding.symbol.type) continue;
        if (
            ![
                SymbolKind.SymbolTypeStructDecl,
                SymbolKind.SymbolTypeEnumDecl,
                SymbolKind.SymbolTypeUnionDecl,
                SymbolKind.SymbolTypsAliasDecl,
            ].includes(binding.symbol.kind)
        ) {
            continue;
        }
        names.set(binding.sourceName, `${prefix}.${exportName}`);
    }
    return names;
}

function cloneSymbol(symbol: Symbol, name: string, typeNames: Map<string, string>): Symbol {
    return {
        ...symbol,
        name,
        type: rewriteType(symbol.type, typeNames),
        signature: rewriteSignature(symbol.signature, typeNames),
    };
}

function copyMethods(
    target: Scope,
    targetTypeName: string,
    binding: SymbolExportBinding,
    typeNames: Map<string, string>,
) {
    const methods = binding.scope.methods.get(binding.sourceName);
    if (!methods) return;
    for (const [methodName, signature] of methods) {
        target.addMethod(targetTypeName, methodName, rewriteSignature(signature, typeNames)!);
    }
}

/** Binds one symbol or namespace tree into a module's compile-time scope. */
export function bindExport(
    target: Scope,
    localName: string,
    binding: ExportBinding,
    importedSymbols: Map<string, ImportedSymbolReference>,
    position: Position,
    diagnostic: BindingDiagnostic,
): boolean {
    if (target.symbols.has(localName)) {
        diagnostic(position, `imported name \`${localName}\` is declared more than once`);
        return false;
    }

    if (binding.kind == "namespace") {
        target.addSymbol({
            name: localName,
            kind: SymbolKind.SymbolModule,
            assigned: true,
        });
        const typeNames = namespaceTypeNames(localName, binding.exports);
        for (const [memberName, member] of binding.exports) {
            const qualifiedName = `${localName}.${memberName}`;
            if (member.kind == "namespace") {
                bindExport(target, qualifiedName, member, importedSymbols, position, diagnostic);
                continue;
            }
            const symbol = cloneSymbol(member.symbol, qualifiedName, typeNames);
            target.addSymbol(symbol);
            importedSymbols.set(qualifiedName, {
                moduleName: member.moduleName,
                sourceName: member.sourceName,
                linkName:
                    member.symbol.signature?.external?.abi == "c"
                        ? member.symbol.signature.external.linkName
                        : undefined,
            });
            copyMethods(target, qualifiedName, member, typeNames);
        }
        return true;
    }

    const typeNames = new Map([[binding.sourceName, localName]]);
    target.addSymbol(cloneSymbol(binding.symbol, localName, typeNames));
    importedSymbols.set(localName, {
        moduleName: binding.moduleName,
        sourceName: binding.sourceName,
        linkName:
            binding.symbol.signature?.external?.abi == "c"
                ? binding.symbol.signature.external.linkName
                : undefined,
    });
    copyMethods(target, localName, binding, typeNames);
    return true;
}

/** Creates the public export table after a module has completed semantic analysis. */
export function buildExportTable(
    ast: Module,
    scope: Scope,
    moduleName: string,
    importedBindings: Map<string, ExportBinding>,
): Map<string, ExportBinding> {
    const exports = new Map<string, ExportBinding>();
    const exportAll = !!ast.exportModule;

    for (const declaration of ast.declarations) {
        if (declaration.kind == "import_declaration") continue;
        if (!exportAll && !declaration.exported) continue;
        const symbol = scope.symbols.get(declaration.name.name);
        if (!symbol) continue;
        const externalModule =
            symbol.signature?.external?.abi == "delta"
                ? symbol.signature.external.moduleName
                : symbol.declaration?.kind == "variable_declaration_statement" ||
                    symbol.declaration?.kind == "type_declaration"
                  ? symbol.declaration.external?.moduleName
                  : undefined;
        exports.set(declaration.name.name, {
            kind: "symbol",
            name: declaration.name.name,
            sourceName: declaration.name.name,
            moduleName: externalModule ?? moduleName,
            symbol,
            scope,
        });
    }

    if (exportAll) {
        for (const [name, binding] of importedBindings) {
            if (!exports.has(name)) exports.set(name, renamed(binding, name));
        }
    }
    return exports;
}

export function namespaceBinding(
    name: string,
    declaredName: string,
    exports: Map<string, ExportBinding>,
): NamespaceExportBinding {
    return { kind: "namespace", name, declaredName, exports };
}
