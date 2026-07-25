import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { AnalyzerCore } from "../analysis/core.js";
import { Scope } from "../analysis/scope.js";
import { Parser } from "../ast/parser.js";
import { Tokenizer } from "../ast/tokenizer.js";
import type { Declaration, ImportDeclaration, Module, Position } from "../ast/types.js";
import { Emitter, type ModuleEmitOptions } from "../codegen/emitter.js";
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
    type PathAliases,
    type ProjectKind,
} from "./project_config.js";

type ResolvedProject = {
    root: string;
    entryPath: string;
    outputName: string;
    kind: ProjectKind;
    dependencies: PathAliases;
};

type ModuleNode = {
    filePath: string;
    moduleName: string;
    ast: Module;
    diagnostics: Diagnostics;
    imports: ImportDeclaration[];
    importedSymbols: Map<string, ImportedSymbolReference>;
    importedBindings: Map<string, ExportBinding>;
    exports: Map<string, ExportBinding>;
    scope?: Scope;
};

export type ProjectBuildResult = {
    diagnostics: CompilerError[];
    asts: Module[];
    generatedCode: string[];
    binaryPath?: string;
    /** Final executable, static archive, or shared-library path. */
    artifactPath?: string;
    artifactKind?: ProjectKind;
    cFiles: string[];
    headerFiles: string[];
    objectFiles: string[];
    libraryFiles: string[];
    error?: string;
};

export type ProjectBuildOptions = {
    debug?: boolean;
};

const fallbackPosition: Position = { line: 1, column: 1, start: 0, end: 1 };

/** Turns a source path into a deterministic C-safe module identity. */
export function moduleName(projectRoot: string, filePath: string): string {
    const relative = path.relative(projectRoot, filePath).replace(/\.delta$/i, "");
    return relative
        .split(path.sep)
        .map((part) => part.replace(/[^A-Za-z0-9_]/g, "_"))
        .join("__");
}

/** Resolves a direct entry file or a scaffolded project's `delta.json`. */
function resolveProject(input?: string): ResolvedProject {
    const requested = path.resolve(input ?? process.cwd());
    if (fs.existsSync(requested) && fs.statSync(requested).isFile()) {
        if (path.extname(requested) != ".delta") {
            throw new Error(`build entry must be a .delta file: ${requested}`);
        }
        const manifestPath = findNearestDeltaManifest(path.dirname(requested));
        const manifest = manifestPath ? readDeltaManifest(manifestPath) : undefined;
        return {
            root: manifestPath ? path.dirname(manifestPath) : path.dirname(requested),
            entryPath: requested,
            outputName: path.basename(requested, ".delta"),
            kind: manifest?.kind ?? "executable",
            dependencies: manifest?.dependencies ?? new Map(),
        };
    }

    const root = requested;
    const manifestPath = path.join(root, "delta.json");
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`cannot find delta.json in ${root}`);
    }
    const manifest = readDeltaManifest(manifestPath);
    if (!manifest.entry) {
        throw new Error(`delta.json is missing the entry field`);
    }
    const entryPath = path.resolve(root, manifest.entry);
    if (!fs.existsSync(entryPath)) {
        throw new Error(`project entry does not exist: ${entryPath}`);
    }
    return {
        root,
        entryPath,
        outputName: manifest.name || path.basename(entryPath, ".delta"),
        kind: manifest.kind,
        dependencies: manifest.dependencies,
    };
}

function importsOf(ast: Module): ImportDeclaration[] {
    return ast.declarations.filter(
        (declaration): declaration is ImportDeclaration => declaration.kind == "import_declaration",
    );
}

function resolveImportPath(
    importer: ModuleNode,
    declaration: ImportDeclaration,
    project: ResolvedProject,
): string | undefined {
    const resolution = resolveImportSpecifier(
        importer.filePath,
        declaration.path,
        project.root,
        project.dependencies,
    );
    if (resolution.kind === "standard") {
        importer.diagnostics.addError(
            CompilerDiagnostic(
                importer.filePath,
                "semantic",
                declaration.pathPosition,
                resolution.reason
                    ? `cannot resolve standard library import \`${declaration.path}\`: ${resolution.reason}`
                    : `unknown standard library module \`${declaration.path}\``,
            ),
        );
        return;
    }
    if (resolution.kind === "unknown") {
        importer.diagnostics.addError(
            CompilerDiagnostic(
                importer.filePath,
                "semantic",
                declaration.pathPosition,
                `unknown import root \`${declaration.path}\``,
            ),
        );
        return;
    }

    const resolved = resolution.filePath;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        importer.diagnostics.addError(
            CompilerDiagnostic(
                importer.filePath,
                "semantic",
                declaration.pathPosition,
                `cannot find module \`${declaration.path}\` (${resolved} does not exist)`,
            ),
        );
        return;
    }
    return resolved;
}

function topLevelDeclaration(ast: Module, name: string): Declaration | undefined {
    return ast.declarations.find(
        (declaration) => declaration.kind != "import_declaration" && declaration.name.name == name,
    );
}

function compilerOutput(error: unknown): string {
    if (typeof error == "object" && error && "stderr" in error) {
        return String((error as { stderr?: unknown }).stderr ?? error);
    }
    return error instanceof Error ? error.message : String(error);
}

/**
 * Parses and analyzes the complete import graph, writes one C/header pair per
 * module, compiles every C file to an object, then links the entry executable.
 */
export function buildProject(
    input?: string,
    options: ProjectBuildOptions = {},
): ProjectBuildResult {
    const result: ProjectBuildResult = {
        diagnostics: [],
        asts: [],
        generatedCode: [],
        cFiles: [],
        headerFiles: [],
        objectFiles: [],
        libraryFiles: [],
        artifactKind: "executable",
    };

    let project: ResolvedProject;
    try {
        project = resolveProject(input);
        result.artifactKind = project.kind;
    } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        return result;
    }

    const nodes = new Map<string, ModuleNode>();
    const states = new Map<string, "visiting" | "visited">();
    const ordered: ModuleNode[] = [];

    const visit = (filePath: string, stack: string[]): ModuleNode | undefined => {
        const state = states.get(filePath);
        if (state == "visited") {
            return nodes.get(filePath);
        }
        if (state == "visiting") {
            return nodes.get(filePath);
        }

        const diagnostics = new Diagnostics(filePath);
        const source = fs.readFileSync(filePath, "utf8");
        const ast = new Parser(filePath, diagnostics).parse(new Tokenizer(source).tokenize());
        if (!ast) {
            result.diagnostics.push(...diagnostics.errors);
            return;
        }
        const node: ModuleNode = {
            filePath,
            moduleName: moduleName(project.root, filePath),
            ast,
            diagnostics,
            imports: importsOf(ast),
            importedSymbols: new Map(),
            importedBindings: new Map(),
            exports: new Map(),
        };
        nodes.set(filePath, node);
        states.set(filePath, "visiting");

        for (const declaration of node.imports) {
            const dependencyPath = resolveImportPath(node, declaration, project);
            if (!dependencyPath) {
                continue;
            }
            declaration.resolvedPath = dependencyPath;
            declaration.moduleName = moduleName(project.root, dependencyPath);

            if (states.get(dependencyPath) == "visiting") {
                const cycleStart = stack.indexOf(dependencyPath);
                const cycle = [...stack.slice(cycleStart), dependencyPath]
                    .map((item) => path.basename(item))
                    .join(" → ");
                diagnostics.addError(
                    CompilerDiagnostic(
                        filePath,
                        "semantic",
                        declaration.pathPosition,
                        `import cycle detected: ${cycle}`,
                    ),
                );
                continue;
            }
            visit(dependencyPath, [...stack, dependencyPath]);
        }

        states.set(filePath, "visited");
        ordered.push(node);
        result.diagnostics.push(...diagnostics.errors);
        return node;
    };

    const entry = visit(project.entryPath, [project.entryPath]);
    if (!entry || result.diagnostics.length > 0) {
        return result;
    }
    result.asts.push(...ordered.map((node) => node.ast));

    for (const node of ordered) {
        const scope = new Scope();
        const addImportDiagnostic = (position: Position, message: string) =>
            node.diagnostics.addError(
                CompilerDiagnostic(node.filePath, "semantic", position, message),
            );
        for (const declaration of node.imports) {
            if (!declaration.resolvedPath || !declaration.moduleName) {
                continue;
            }
            const dependency = nodes.get(declaration.resolvedPath);
            if (!dependency?.scope) {
                continue;
            }

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
                        scope,
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
                    const sourceDeclaration = topLevelDeclaration(
                        dependency.ast,
                        specifier.name.name,
                    );
                    addImportDiagnostic(
                        specifier.position,
                        sourceDeclaration
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
                        scope,
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

        if (node.diagnostics.errors.length > 0) {
            result.diagnostics.push(...node.diagnostics.errors);
            continue;
        }

        node.scope = new AnalyzerCore(node.ast, node.diagnostics, scope).analyze();
        node.exports = buildExportTable(
            node.ast,
            node.scope,
            node.ast.ffiModuleName ?? node.moduleName,
            node.importedBindings,
        );
        result.diagnostics.push(...node.diagnostics.errors);
    }

    if (result.diagnostics.length > 0) {
        return result;
    }
    const mainDeclaration = topLevelDeclaration(entry.ast, "main");
    if (
        project.kind == "executable" &&
        (!mainDeclaration || mainDeclaration.kind != "function_declaration")
    ) {
        result.diagnostics.push(
            CompilerDiagnostic(
                project.entryPath,
                "semantic",
                entry.ast.declarations[0]?.position ?? fallbackPosition,
                "entry module must declare function main(): uint8",
            ),
        );
        return result;
    }

    if (options.debug) {
        for (const node of ordered) {
            const importedHeaders = node.imports
                .map((declaration) => declaration.moduleName)
                .filter((name): name is string => !!name);
            const emitOptions: ModuleEmitOptions = {
                moduleName: node.moduleName,
                abiModuleName: node.ast.ffiModuleName,
                importedSymbols: node.importedSymbols,
                importedHeaders,
                entry: project.kind == "executable" && node.filePath == project.entryPath,
                exportAll: !!node.ast.exportModule,
            };
            const emitter = new Emitter(node.ast, emitOptions);
            result.generatedCode.push(emitter.emitHeader(), emitter.emit());
        }
        return result;
    }

    const buildDir = path.join(project.root, "build");
    const codegenDir = path.join(buildDir, "codegen");
    const objectDir = path.join(buildDir, "obj");
    const sourceFileForGeneratedC = new Map<string, string>();
    const staticLibraries: string[] = [];
    const dynamicLibraries: string[] = [];
    const dynamicLibraryDirectories = new Set<string>();
    for (const node of ordered) {
        for (const library of node.ast.ffiLibraries ?? []) {
            const libraryPath = path.resolve(path.dirname(node.filePath), library.path);
            if (!fs.existsSync(libraryPath) || !fs.statSync(libraryPath).isFile()) {
                node.diagnostics.addError(
                    CompilerDiagnostic(
                        node.filePath,
                        "semantic",
                        library.position,
                        `prebuilt ${library.kind} library does not exist: ${libraryPath}`,
                    ),
                );
                continue;
            }
            if (library.kind == "static") {
                staticLibraries.push(libraryPath);
            } else {
                dynamicLibraries.push(libraryPath);
                dynamicLibraryDirectories.add(path.dirname(libraryPath));
            }
            result.libraryFiles.push(libraryPath);
        }
    }
    if (ordered.some((node) => node.diagnostics.errors.length > 0)) {
        result.diagnostics.push(
            ...ordered
                .flatMap((node) => node.diagnostics.errors)
                .filter((error) => !result.diagnostics.includes(error)),
        );
        return result;
    }
    fs.mkdirSync(codegenDir, { recursive: true });
    fs.mkdirSync(objectDir, { recursive: true });

    for (const node of ordered) {
        const importedHeaders = node.imports
            .map((declaration) => declaration.moduleName)
            .filter((name): name is string => !!name);
        const emitOptions: ModuleEmitOptions = {
            moduleName: node.moduleName,
            abiModuleName: node.ast.ffiModuleName,
            importedSymbols: node.importedSymbols,
            importedHeaders,
            entry: project.kind == "executable" && node.filePath == project.entryPath,
            exportAll: !!node.ast.exportModule,
        };
        const headerPath = path.join(codegenDir, `delta_${node.moduleName}.h`);
        const cPath = path.join(codegenDir, `${node.moduleName}.c`);
        fs.writeFileSync(headerPath, new Emitter(node.ast, emitOptions).emitHeader());
        fs.writeFileSync(cPath, new Emitter(node.ast, emitOptions).emit());
        sourceFileForGeneratedC.set(cPath, node.filePath);
        result.headerFiles.push(headerPath);
        result.cFiles.push(cPath);
    }

    try {
        for (const cPath of result.cFiles) {
            const sourcePath = sourceFileForGeneratedC.get(cPath) ?? cPath;
            console.log(`Building ${path.relative(project.root, sourcePath)}`);
            const objectPath = path.join(
                objectDir,
                `${path.basename(cPath, path.extname(cPath))}.o`,
            );
            const compileArguments = ["-std=c17", "-I", codegenDir];
            if (project.kind == "dynamic") compileArguments.push("-fPIC");
            execFileSync("clang", [...compileArguments, "-c", cPath, "-o", objectPath]);
            result.objectFiles.push(objectPath);
        }

        if (project.kind == "static") {
            result.artifactPath = path.join(buildDir, `lib${project.outputName}.a`);
            console.log(`Archiving ${path.relative(project.root, result.artifactPath)}`);
            execFileSync("ar", ["rcs", result.artifactPath, ...result.objectFiles]);
        } else {
            const dynamicName =
                process.platform == "darwin"
                    ? `lib${project.outputName}.dylib`
                    : process.platform == "win32"
                      ? `${project.outputName}.dll`
                      : `lib${project.outputName}.so`;
            result.artifactPath =
                project.kind == "dynamic"
                    ? path.join(buildDir, dynamicName)
                    : path.join(buildDir, project.outputName);
            const action = project.kind == "dynamic" ? "Linking shared library" : "Linking";
            console.log(`${action} ${path.relative(project.root, result.artifactPath)}`);
            const rpaths = [...dynamicLibraryDirectories].map(
                (directory) => `-Wl,-rpath,${directory}`,
            );
            const libraryMode =
                project.kind != "dynamic"
                    ? []
                    : process.platform == "darwin"
                      ? [
                            "-dynamiclib",
                            `-Wl,-install_name,@rpath/${path.basename(result.artifactPath)}`,
                        ]
                      : ["-shared"];
            execFileSync("clang", [
                ...libraryMode,
                ...result.objectFiles,
                ...[...new Set(staticLibraries)],
                ...[...new Set(dynamicLibraries)],
                ...rpaths,
                "-lm",
                "-o",
                result.artifactPath,
            ]);
            if (project.kind == "executable") result.binaryPath = result.artifactPath;
        }
    } catch (error) {
        result.error = `native build failed:\n${compilerOutput(error)}`;
    }
    return result;
}

/** Creates a manifest-backed Delta project without overwriting an existing path. */
export function scaffoldProject(name: string, parentDirectory: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
        throw new Error("project name may contain only letters, numbers, underscores, and hyphens");
    }
    const projectRoot = path.join(parentDirectory, name);
    if (fs.existsSync(projectRoot)) {
        throw new Error(`refusing to overwrite existing path: ${projectRoot}`);
    }

    fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    fs.writeFileSync(
        path.join(projectRoot, "delta.json"),
        `${JSON.stringify(
            {
                name,
                version: "0.1.0",
                schemaVersion: 1,
                kind: "executable",
                entry: "src/main.delta",
                dependencies: {},
                target: { backend: "c", standard: "c17", compiler: "clang" },
            },
            null,
            2,
        )}\n`,
    );
    fs.writeFileSync(path.join(projectRoot, ".gitignore"), "/build\n");
    fs.writeFileSync(
        path.join(projectRoot, "src", "main.delta"),
        `function main(): uint8 {
    return 0;
}
`,
    );
    return projectRoot;
}
