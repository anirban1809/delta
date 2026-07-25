import * as fs from "fs";
import * as path from "path";
import { AnalyzerCore } from "../analysis/core.js";
import type { Scope } from "../analysis/scope.js";
import { Scope as AnalysisScope } from "../analysis/scope.js";
import { Parser } from "../ast/parser.js";
import { Tokenizer } from "../ast/tokenizer.js";
import type { Declaration, ImportDeclaration, Module, Position } from "../ast/types.js";
import {
    Diagnostics,
    Error as CompilerDiagnostic,
    type Error as CompilerError,
} from "../diagnostics/diagnostics.js";
import {
    bindExport,
    bindingRequiresUnsafe,
    buildExportTable,
    namespaceBinding,
    type ExportBinding,
    type ImportedSymbolReference,
} from "./module_bindings.js";
import {
    findNearestDeltaManifest,
    readDeltaManifest,
    resolveImportSpecifier,
    type ImportPathResolution,
} from "./project_config.js";

/** The in-memory compiler entry point shared by the CLI-facing editor server. */
export type CompileResult = {
    ast?: Module;
    diagnostics: CompilerError[];
    globalScope?: Scope;
};

/** Runs Delta's existing tokenize → parse → semantic-analysis pipeline. */
export function compileSource(source: string, fileName: string): CompileResult {
    const diagnostics = new Diagnostics(fileName);
    const ast = new Parser(fileName, diagnostics).parse(new Tokenizer(source).tokenize());
    if (!ast) return { diagnostics: diagnostics.errors };

    const globalScope = new AnalyzerCore(ast, diagnostics).analyze();
    return { ast, diagnostics: diagnostics.errors, globalScope };
}

type ModuleAnalysisNode = {
    fileName: string;
    ast: Module;
    diagnostics: Diagnostics;
    imports: ImportDeclaration[];
    importedSymbols: Map<string, ImportedSymbolReference>;
    importedBindings: Map<string, ExportBinding>;
    exports: Map<string, ExportBinding>;
    scope?: Scope;
};

export type SourceReader = (fileName: string) => string | undefined;
export type ImportResolver = (importer: string, importPath: string) => ImportPathResolution;

const defaultSourceReader: SourceReader = (fileName) => {
    try {
        return fs.readFileSync(fileName, "utf8");
    } catch {
        return undefined;
    }
};

const defaultImportResolver: ImportResolver = (importer, importPath) => {
    const manifestPath = findNearestDeltaManifest(path.dirname(importer));
    if (!manifestPath) {
        return resolveImportSpecifier(importer, importPath, path.dirname(importer), new Map());
    }
    try {
        const manifest = readDeltaManifest(manifestPath);
        return resolveImportSpecifier(
            importer,
            importPath,
            path.dirname(manifestPath),
            manifest.dependencies,
        );
    } catch {
        return { kind: "unknown" };
    }
};

function importedDeclarations(ast: Module): ImportDeclaration[] {
    return ast.declarations.filter(
        (declaration): declaration is ImportDeclaration => declaration.kind == "import_declaration",
    );
}

function topLevelDeclaration(ast: Module, name: string): Declaration | undefined {
    return ast.declarations.find(
        (declaration) => declaration.kind != "import_declaration" && declaration.name.name == name,
    );
}

/**
 * Runs the compiler analysis used by the editor over a file and its complete
 * relative-import graph. The caller may overlay unsaved document contents via
 * `readSource`; no files are generated and no external compiler is invoked.
 */
export function compileModuleSource(
    source: string,
    fileName: string,
    readSource: SourceReader = defaultSourceReader,
    resolveImport: ImportResolver = defaultImportResolver,
): CompileResult {
    const nodes = new Map<string, ModuleAnalysisNode>();
    const visiting = new Set<string>();
    const ordered: ModuleAnalysisNode[] = [];

    const visit = (currentFile: string, currentSource?: string): ModuleAnalysisNode | undefined => {
        const normalized = path.resolve(currentFile);
        if (nodes.has(normalized)) return nodes.get(normalized);

        const text = currentSource ?? readSource(normalized);
        if (text === undefined) return undefined;
        const diagnostics = new Diagnostics(normalized);
        const ast = new Parser(normalized, diagnostics).parse(new Tokenizer(text).tokenize());
        if (!ast) return undefined;

        const node: ModuleAnalysisNode = {
            fileName: normalized,
            ast,
            diagnostics,
            imports: importedDeclarations(ast),
            importedSymbols: new Map(),
            importedBindings: new Map(),
            exports: new Map(),
        };
        nodes.set(normalized, node);
        visiting.add(normalized);

        for (const declaration of node.imports) {
            const resolution = resolveImport(normalized, declaration.path);
            if (resolution.kind === "standard") {
                diagnostics.addError(
                    CompilerDiagnostic(
                        normalized,
                        "semantic",
                        declaration.pathPosition,
                        resolution.reason
                            ? `cannot resolve standard library import \`${declaration.path}\`: ${resolution.reason}`
                            : `unknown standard library module \`${declaration.path}\``,
                    ),
                );
                continue;
            }
            if (resolution.kind === "unknown") {
                diagnostics.addError(
                    CompilerDiagnostic(
                        normalized,
                        "semantic",
                        declaration.pathPosition,
                        `unknown import root \`${declaration.path}\``,
                    ),
                );
                continue;
            }
            const dependencyPath = resolution.filePath;
            declaration.resolvedPath = dependencyPath;
            if (visiting.has(dependencyPath)) {
                diagnostics.addError(
                    CompilerDiagnostic(
                        normalized,
                        "semantic",
                        declaration.pathPosition,
                        `import cycle detected through \`${declaration.path}\``,
                    ),
                );
                continue;
            }
            if (!visit(dependencyPath)) {
                diagnostics.addError(
                    CompilerDiagnostic(
                        normalized,
                        "semantic",
                        declaration.pathPosition,
                        `cannot find module \`${declaration.path}\``,
                    ),
                );
            }
        }

        visiting.delete(normalized);
        ordered.push(node);
        return node;
    };

    const entry = visit(fileName, source);
    if (!entry) return { diagnostics: [] };

    for (const node of ordered) {
        const importedScope = new AnalysisScope();
        const addImportDiagnostic = (position: Position, message: string) =>
            node.diagnostics.addError(
                CompilerDiagnostic(node.fileName, "semantic", position, message),
            );
        for (const declaration of node.imports) {
            if (!declaration.resolvedPath) continue;
            const dependency = nodes.get(path.resolve(declaration.resolvedPath));
            if (!dependency?.scope) continue;

            if (declaration.namespace) {
                const declared = dependency.ast.exportModule;
                if (!declared) {
                    addImportDiagnostic(
                        declaration.namespace.module.position ?? declaration.position,
                        `module namespace import requires \`export module ${declaration.namespace.module.name};\` in \`${declaration.path}\``,
                    );
                    continue;
                }
                if (declared.name.name != declaration.namespace.module.name) {
                    addImportDiagnostic(
                        declaration.namespace.module.position ?? declaration.position,
                        `imported module name \`${declaration.namespace.module.name}\` does not match declared module \`${declared.name.name}\``,
                    );
                    continue;
                }
                const localName =
                    declaration.namespace.alias?.name ?? declaration.namespace.module.name;
                const binding = namespaceBinding(localName, declared.name.name, dependency.exports);
                if (bindingRequiresUnsafe(binding) && !declaration.unsafe) {
                    addImportDiagnostic(
                        declaration.position,
                        `extern C module \`${declaration.path}\` requires an unsafe import`,
                    );
                    continue;
                }
                if (
                    bindExport(
                        importedScope,
                        localName,
                        binding,
                        node.importedSymbols,
                        declaration.namespace.alias?.position ??
                            declaration.namespace.module.position ??
                            declaration.position,
                        addImportDiagnostic,
                    )
                ) {
                    node.importedBindings.set(localName, binding);
                }
                continue;
            }

            for (const specifier of declaration.specifiers) {
                const binding = dependency.exports.get(specifier.name.name);
                if (!binding) {
                    const declared = topLevelDeclaration(dependency.ast, specifier.name.name);
                    addImportDiagnostic(
                        specifier.position,
                        declared
                            ? `\`${specifier.name.name}\` is not exported by \`${declaration.path}\``
                            : `\`${specifier.name.name}\` is not declared by \`${declaration.path}\``,
                    );
                    continue;
                }
                if (bindingRequiresUnsafe(binding) && !declaration.unsafe) {
                    addImportDiagnostic(
                        specifier.position,
                        `extern C symbol \`${specifier.name.name}\` requires an unsafe import`,
                    );
                    continue;
                }
                if (
                    bindExport(
                        importedScope,
                        specifier.name.name,
                        binding,
                        node.importedSymbols,
                        specifier.position,
                        addImportDiagnostic,
                    )
                ) {
                    node.importedBindings.set(specifier.name.name, binding);
                }
            }
        }
        node.scope = new AnalyzerCore(node.ast, node.diagnostics, importedScope).analyze();
        const physicalName = node.fileName.replace(/\.delta$/i, "").replace(/[^A-Za-z0-9_]/g, "_");
        node.exports = buildExportTable(
            node.ast,
            node.scope,
            node.ast.ffiModuleName ?? physicalName,
            node.importedBindings,
        );
    }

    return {
        ast: entry.ast,
        diagnostics: entry.diagnostics.errors,
        globalScope: entry.scope,
    };
}
