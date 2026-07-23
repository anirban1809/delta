import { createHash } from "crypto";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    TypeDeclKind,
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
import { Parser } from "../ast/parser.js";
import { Tokenizer } from "../ast/tokenizer.js";
import { AnalyzerCore } from "../analysis/core.js";
import { Diagnostics } from "../diagnostics/diagnostics.js";
import { buildProject, moduleName } from "./project.js";
import { readDeltaManifest, type ProjectKind } from "./project_config.js";

const packageNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export type PackageResult = {
    archivePath?: string;
    archiveSha256?: string;
    packageName?: string;
    version?: string;
    error?: string;
};

export type InstallResult = {
    installedPath?: string;
    archiveSha256?: string;
    packageName?: string;
    version?: string;
    error?: string;
};

export type InstallAllResult = {
    installed: InstallResult[];
    error?: string;
};

export type InstallOptions = {
    record?: boolean;
    expectedPackageName?: string;
    expectedVersion?: string;
};

function sha256(filePath: string): string {
    return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function typeSource(type: Type): string {
    const qualifier = type.reference ? `${type.edit ? "edit " : ""}&` : "";
    const arguments_ = type.typeParameters?.length
        ? `<${type.typeParameters.map(typeSource).join(", ")}>`
        : "";
    const arrays = (type.arrayLengths ?? []).map((length) => `[${length}]`).join("");
    const slice = type.slice ? "[]" : "";
    return `${qualifier}${type.name.name}${arguments_}${arrays}${slice}`;
}

function typeParametersSource(types?: Type[]): string {
    return types?.length ? `<${types.map((type) => type.name.name).join(", ")}>` : "";
}

function functionSource(declaration: FunctionDeclaration): string {
    if (declaration.typeParameters?.length) {
        throw new Error(
            `cannot package exported generic function \`${declaration.name.name}\`: prebuilt generic ABI specializations are not supported`,
        );
    }
    const receiver = declaration.receiver
        ? `(${declaration.receiver.name.name}: ${typeSource(declaration.receiver.type)}) `
        : "";
    const parameters = declaration.parameters
        .map((parameter) => `${parameter.name.name}: ${typeSource(parameter.type)}`)
        .join(", ");
    const returns = declaration.returnTypes.length
        ? `: ${declaration.returnTypes.map(typeSource).join(", ")}`
        : "";
    const errors = declaration.errorTypes.length
        ? ` | ${declaration.errorTypes.map(typeSource).join(", ")}`
        : "";
    return `export function ${receiver}${declaration.name.name}(${parameters})${returns}${errors};`;
}

function typeDeclarationSource(declaration: TypeDeclaration): string {
    const unique = declaration.unique ? "unique " : "";
    switch (declaration.declKind) {
        case TypeDeclKind.Alias:
            return `export ${unique}type ${declaration.name.name} = ${typeSource((declaration.declaration as TypeAlias).target)};`;
        case TypeDeclKind.Struct: {
            const record = declaration.declaration as StructDecl;
            const fields = record.fields
                .map((field) => `${field.name.name}: ${typeSource(field.type)}`)
                .join(", ");
            return `export ${unique}type struct ${declaration.name.name}${typeParametersSource(record.typeParameters)} = { ${fields} };`;
        }
        case TypeDeclKind.Enum: {
            const enumeration = declaration.declaration as EnumDecl;
            const variants = enumeration.variants
                .map((variant) => `${variant.name.name}: ${variant.value.value}`)
                .join(", ");
            return `export type enum ${declaration.name.name} = { ${variants} };`;
        }
        case TypeDeclKind.Union: {
            const union = declaration.declaration as UnionDecl;
            return `export type union ${declaration.name.name}${typeParametersSource(union.typeParameters)} = ${union.variants.map(typeSource).join(" | ")};`;
        }
    }
}

function declarationSource(declaration: Declaration): string | undefined {
    if (declaration.kind == "function_declaration") {
        if (declaration.external) return;
        return functionSource(declaration);
    }
    if (declaration.kind == "variable_declaration_statement") {
        const variable = declaration as VariableDeclarationStatement;
        if (variable.external) return;
        return `export const ${variable.name.name}: ${typeSource(variable.type)};`;
    }
    if (declaration.kind == "type_declaration") {
        return typeDeclarationSource(declaration);
    }
    return;
}

type PackageDeclaration = {
    declaration: Declaration;
    moduleName: string;
};

function resolveExportedDeclaration(
    ast: Module,
    exportName: string,
    asts: Module[],
    seen = new Set<string>(),
): { declaration: Declaration; ast: Module } | undefined {
    const key = `${path.resolve(ast.fileName)}:${exportName}`;
    if (seen.has(key)) return;
    seen.add(key);
    const local = ast.declarations.find(
        (declaration) =>
            declaration.kind != "import_declaration" &&
            declaration.name.name == exportName &&
            (!!declaration.exported || !!ast.exportModule),
    );
    if (local) return { declaration: local, ast };
    if (!ast.exportModule) return;
    for (const imported of ast.declarations) {
        if (imported.kind != "import_declaration") continue;
        if (imported.namespace) {
            const namespaceName =
                imported.namespace.alias?.name ?? imported.namespace.module.name;
            if (namespaceName == exportName) {
                throw new Error(
                    `cannot package re-exported module namespace \`${exportName}\`; namespace interface exports are not supported yet`,
                );
            }
            continue;
        }
        if (!imported.specifiers.some((specifier) => specifier.name.name == exportName)) {
            continue;
        }
        const dependency = asts.find(
            (candidate) =>
                imported.resolvedPath &&
                path.resolve(candidate.fileName) == path.resolve(imported.resolvedPath),
        );
        if (!dependency) return;
        return resolveExportedDeclaration(dependency, exportName, asts, seen);
    }
}

function collectPackageDeclarations(
    entryAst: Module,
    asts: Module[],
    projectRoot: string,
): PackageDeclaration[] {
    const declarations: PackageDeclaration[] = [];
    const added = new Set<string>();
    const add = (declaration: Declaration, owner: Module) => {
        if (declaration.kind == "import_declaration") return;
        if (
            declaration.kind == "function_declaration" &&
            declaration.external?.abi == "c"
        ) {
            throw new Error(
                `cannot package re-exported C extern \`${declaration.name.name}\` as a Delta library symbol`,
            );
        }
        const declaredExternalModule =
            declaration.kind == "function_declaration" &&
            declaration.external?.abi == "delta"
                ? declaration.external.moduleName
                : (declaration.kind == "variable_declaration_statement" ||
                      declaration.kind == "type_declaration") &&
                    declaration.external?.abi == "delta"
                  ? declaration.external.moduleName
                  : undefined;
        const ownerModule =
            declaredExternalModule ?? moduleName(projectRoot, owner.fileName);
        const receiver =
            declaration.kind == "function_declaration"
                ? declaration.receiver?.type.name.name ?? ""
                : "";
        const key = `${ownerModule}:${receiver}:${declaration.name.name}`;
        if (added.has(key)) return;
        added.add(key);
        declarations.push({ declaration, moduleName: ownerModule });
        if (declaration.kind == "type_declaration") {
            for (const method of owner.declarations) {
                if (
                    method.kind == "function_declaration" &&
                    method.receiver?.type.name.name == declaration.name.name
                ) {
                    add(method, owner);
                }
            }
        }
    };

    const exportAll = !!entryAst.exportModule;
    for (const declaration of entryAst.declarations) {
        if (declaration.kind == "import_declaration") {
            if (!exportAll) continue;
            if (declaration.namespace) {
                const namespaceName =
                    declaration.namespace.alias?.name ??
                    declaration.namespace.module.name;
                throw new Error(
                    `cannot package re-exported module namespace \`${namespaceName}\`; namespace interface exports are not supported yet`,
                );
            }
            const dependency = asts.find(
                (candidate) =>
                    declaration.resolvedPath &&
                    path.resolve(candidate.fileName) ==
                        path.resolve(declaration.resolvedPath),
            );
            if (!dependency) continue;
            for (const specifier of declaration.specifiers) {
                const resolved = resolveExportedDeclaration(
                    dependency,
                    specifier.name.name,
                    asts,
                );
                if (!resolved) {
                    throw new Error(
                        `cannot resolve re-exported symbol \`${specifier.name.name}\` while generating the package interface`,
                    );
                }
                add(resolved.declaration, resolved.ast);
            }
            continue;
        }
        if (exportAll || !!declaration.exported) add(declaration, entryAst);
    }
    return declarations;
}

function generateInterface(
    declarations: PackageDeclaration[],
    libraryKind: Exclude<ProjectKind, "executable">,
    libraryFileName: string,
    publicModuleName?: string,
): string {
    const groups = new Map<string, string[]>();
    for (const entry of declarations) {
        const source = declarationSource(entry.declaration);
        if (!source) continue;
        const group = groups.get(entry.moduleName) ?? [];
        group.push(source);
        groups.set(entry.moduleName, group);
    }
    if (!groups.size) {
        throw new Error("package entry module does not export any packageable Delta symbols");
    }
    const source = [`ffi ${libraryKind} "./build/${libraryFileName}";`, ""];
    for (const [moduleName, moduleDeclarations] of groups) {
        source.push(`ffi module "${moduleName}";`, ...moduleDeclarations, "");
    }
    if (publicModuleName) source.push(`export module ${publicModuleName};`, "");
    return source.join("\n");
}

function validateGeneratedInterface(source: string, filePath: string): void {
    const diagnostics = new Diagnostics(filePath);
    const ast = new Parser(filePath, diagnostics).parse(new Tokenizer(source).tokenize());
    if (ast) new AnalyzerCore(ast, diagnostics).analyze();
    if (diagnostics.errors.length) {
        throw new Error(
            `generated package interface is invalid: ${diagnostics.errors
                .map((diagnostic) => diagnostic.message)
                .join("; ")}`,
        );
    }
}

/** Builds a library project and packages its generated interface, artifact, and metadata. */
export function packageProject(input: string = process.cwd()): PackageResult {
    const root = path.resolve(input);
    const manifestPath = path.join(root, "delta.json");
    if (!fs.existsSync(manifestPath)) {
        return { error: `cannot find delta.json in ${root}` };
    }

    try {
        const manifest = readDeltaManifest(manifestPath);
        if (!manifest.name || !packageNamePattern.test(manifest.name)) {
            return { error: "packaged projects require a manifest name containing only letters, numbers, underscores, and hyphens" };
        }
        if (!manifest.version || !versionPattern.test(manifest.version)) {
            return { error: "packaged projects require a non-empty manifest version" };
        }
        if (manifest.kind == "executable") {
            return { error: "delta package requires a project with kind `static` or `dynamic`" };
        }
        if (!manifest.entry) return { error: "delta.json is missing the entry field" };

        const build = buildProject(root);
        if (build.diagnostics.length || build.error || !build.artifactPath) {
            return {
                error:
                    build.diagnostics.map((diagnostic) => diagnostic.message).join("; ") ||
                    build.error ||
                    "library build did not produce an artifact",
            };
        }

        const entryPath = path.resolve(root, manifest.entry);
        const entryAst = build.asts.find((ast) => path.resolve(ast.fileName) == entryPath);
        if (!entryAst) return { error: "package entry module was not present in the build graph" };

        const packageRoot = path.join(root, "build", "package");
        const stagedPackage = path.join(packageRoot, manifest.name);
        fs.rmSync(stagedPackage, { recursive: true, force: true });
        fs.mkdirSync(path.join(stagedPackage, "build"), { recursive: true });

        const libraryFileName = path.basename(build.artifactPath);
        fs.copyFileSync(build.artifactPath, path.join(stagedPackage, "build", libraryFileName));
        const interfaceSource = generateInterface(
            collectPackageDeclarations(entryAst, build.asts, root),
            manifest.kind,
            libraryFileName,
            entryAst.exportModule?.name.name,
        );
        const interfacePath = path.join(stagedPackage, `${manifest.name}.ffi.delta`);
        validateGeneratedInterface(interfaceSource, interfacePath);
        fs.writeFileSync(interfacePath, interfaceSource);

        const metadata = {
            name: manifest.name,
            version: manifest.version,
            kind: manifest.kind,
            entry: `${manifest.name}.ffi.delta`,
            dependencies: {},
            external: Object.fromEntries(manifest.external),
            package: {
                formatVersion: 1,
                archiveSha256: null,
            },
        };
        fs.writeFileSync(
            path.join(stagedPackage, "delta.json"),
            `${JSON.stringify(metadata, null, 2)}\n`,
        );

        const archivePath = path.join(root, "build", `${manifest.name}-${manifest.version}.tar`);
        fs.rmSync(archivePath, { force: true });
        execFileSync("tar", [
            "-cf",
            archivePath,
            "-C",
            packageRoot,
            manifest.name,
        ]);
        return {
            archivePath,
            archiveSha256: sha256(archivePath),
            packageName: manifest.name,
            version: manifest.version,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function validateArchiveEntries(archivePath: string): string[] {
    const entries = execFileSync("tar", ["-tf", archivePath], { encoding: "utf8" })
        .split(/\r?\n/)
        .filter(Boolean);
    if (!entries.length) throw new Error("package archive is empty");
    for (const entry of entries) {
        const normalized = path.posix.normalize(entry);
        if (
            path.posix.isAbsolute(entry) ||
            normalized == ".." ||
            normalized.startsWith("../")
        ) {
            throw new Error(`unsafe path in package archive: ${entry}`);
        }
    }
    return entries;
}

function rejectLinks(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        const stat = fs.lstatSync(entryPath);
        if (stat.isSymbolicLink()) throw new Error("package archives may not contain symbolic links");
        if (!stat.isDirectory() && !stat.isFile()) {
            throw new Error("package archives may contain only regular files and directories");
        }
        if (stat.isDirectory()) rejectLinks(entryPath);
    }
}

function safePackagePath(packageRoot: string, relativePath: string): string {
    if (path.isAbsolute(relativePath)) throw new Error("package metadata paths must be relative");
    const resolved = path.resolve(packageRoot, relativePath);
    if (resolved != packageRoot && !resolved.startsWith(`${packageRoot}${path.sep}`)) {
        throw new Error("package metadata path escapes the package directory");
    }
    return resolved;
}

function manifestArchivePath(projectRoot: string, archivePath: string): string {
    const relative = path.relative(projectRoot, archivePath);
    const selected = path.isAbsolute(relative) ? archivePath : relative || path.basename(archivePath);
    return selected.split(path.sep).join("/");
}

function recordExternalPackage(
    projectRoot: string,
    packageName: string,
    version: string,
    archivePath: string,
): void {
    const manifestPath = path.join(projectRoot, "delta.json");
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, any>;
    const external =
        parsed.external &&
        typeof parsed.external == "object" &&
        !Array.isArray(parsed.external)
            ? parsed.external
            : {};
    external[packageName] = `${version}:${manifestArchivePath(projectRoot, archivePath)}`;
    parsed.external = external;
    const temporaryManifest = path.join(
        projectRoot,
        `.delta.json.install-${process.pid}-${Date.now()}`,
    );
    fs.writeFileSync(temporaryManifest, `${JSON.stringify(parsed, null, 2)}\n`);
    fs.renameSync(temporaryManifest, manifestPath);
}

/** Installs one package archive into `<project>/external/<package-name>`, replacing any version. */
export function installPackage(
    archiveInput: string,
    projectInput: string = process.cwd(),
    options: InstallOptions = {},
): InstallResult {
    const projectRoot = path.resolve(projectInput);
    const projectManifest = path.join(projectRoot, "delta.json");
    if (!fs.existsSync(projectManifest)) {
        return { error: `cannot find delta.json in ${projectRoot}` };
    }
    try {
        readDeltaManifest(projectManifest);
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
    const archivePath = path.resolve(archiveInput);
    if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isFile()) {
        return { error: `package archive does not exist: ${archivePath}` };
    }

    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "delta-install-"));
    try {
        const entries = validateArchiveEntries(archivePath);
        execFileSync("tar", ["-xf", archivePath, "-C", temporary]);
        rejectLinks(temporary);

        const topLevels = new Set(
            entries
                .map((entry) => path.posix.normalize(entry).replace(/^\.\//, "").split("/")[0])
                .filter(Boolean),
        );
        if (topLevels.size != 1) {
            throw new Error("package archive must contain exactly one package directory");
        }
        const packageName = [...topLevels][0]!;
        if (!packageNamePattern.test(packageName)) throw new Error("invalid package name");
        const extractedPackage = path.join(temporary, packageName);
        const metadataPath = path.join(extractedPackage, "delta.json");
        if (!fs.existsSync(metadataPath)) throw new Error("package is missing delta.json");
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as any;
        readDeltaManifest(metadataPath);
        if (metadata.name != packageName) throw new Error("package directory and metadata name do not match");
        if (!versionPattern.test(metadata.version ?? "")) throw new Error("package metadata has an invalid version");
        if (!["static", "dynamic"].includes(metadata.kind)) throw new Error("package metadata has an invalid library kind");
        if (
            options.expectedPackageName &&
            metadata.name != options.expectedPackageName
        ) {
            throw new Error(
                `external entry \`${options.expectedPackageName}\` resolved to package \`${metadata.name}\``,
            );
        }
        if (options.expectedVersion && metadata.version != options.expectedVersion) {
            throw new Error(
                `external package \`${metadata.name}\` expected version ${options.expectedVersion}, found ${metadata.version}`,
            );
        }
        if (metadata.entry != `${packageName}.ffi.delta`) throw new Error("package metadata has an invalid interface entry");
        const interfacePath = safePackagePath(extractedPackage, metadata.entry);
        if (!fs.existsSync(interfacePath)) {
            throw new Error("package interface file is missing");
        }
        const interfaceDiagnostics = new Diagnostics(interfacePath);
        const interfaceAst = new Parser(interfacePath, interfaceDiagnostics).parse(
            new Tokenizer(fs.readFileSync(interfacePath, "utf8")).tokenize(),
        );
        if (!interfaceAst || interfaceDiagnostics.errors.length) {
            throw new Error("package interface file is invalid");
        }
        if (!interfaceAst.ffiModuleName) {
            throw new Error("package interface is missing its Delta ABI module");
        }
        const interfaceLibraries = interfaceAst.ffiLibraries ?? [];
        if (
            interfaceLibraries.length != 1 ||
            interfaceLibraries[0]!.kind != metadata.kind
        ) {
            throw new Error(
                "package interface must declare exactly one library matching the package kind",
            );
        }
        const libraryPath = path.resolve(
            path.dirname(interfacePath),
            interfaceLibraries[0]!.path,
        );
        if (
            libraryPath != extractedPackage &&
            !libraryPath.startsWith(`${extractedPackage}${path.sep}`)
        ) {
            throw new Error("package interface library path escapes the package directory");
        }
        if (!fs.existsSync(libraryPath) || !fs.statSync(libraryPath).isFile()) {
            throw new Error("package library artifact is missing");
        }

        const archiveSha256 = sha256(archivePath);
        metadata.package ??= { formatVersion: 1 };
        metadata.package.archiveSha256 = archiveSha256;
        fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

        const externalRoot = path.join(projectRoot, "external");
        fs.mkdirSync(externalRoot, { recursive: true });
        const stagedInstall = fs.mkdtempSync(path.join(externalRoot, `.${packageName}-install-`));
        fs.rmSync(stagedInstall, { recursive: true, force: true });
        fs.cpSync(extractedPackage, stagedInstall, { recursive: true });
        const installedPath = path.join(externalRoot, packageName);
        fs.rmSync(installedPath, { recursive: true, force: true });
        fs.renameSync(stagedInstall, installedPath);
        if (options.record !== false) {
            recordExternalPackage(
                projectRoot,
                packageName,
                metadata.version,
                archivePath,
            );
        }
        return {
            installedPath,
            archiveSha256,
            packageName,
            version: metadata.version,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
}

/** Installs every `<version>:<archive-path>` entry from the project's `external` map. */
export function installExternalPackages(
    projectInput: string = process.cwd(),
): InstallAllResult {
    const projectRoot = path.resolve(projectInput);
    const manifestPath = path.join(projectRoot, "delta.json");
    if (!fs.existsSync(manifestPath)) {
        return { installed: [], error: `cannot find delta.json in ${projectRoot}` };
    }
    try {
        const manifest = readDeltaManifest(manifestPath);
        const installed: InstallResult[] = [];
        for (const [packageName, specification] of manifest.external) {
            const separator = specification.indexOf(":");
            const version = specification.slice(0, separator);
            const archiveReference = specification.slice(separator + 1);
            if (!versionPattern.test(version) || !archiveReference) {
                return {
                    installed,
                    error: `external package \`${packageName}\` must have the form \`<version>:<archive-path>\``,
                };
            }
            const archivePath = path.isAbsolute(archiveReference)
                ? archiveReference
                : path.resolve(projectRoot, archiveReference);
            const result = installPackage(archivePath, projectRoot, {
                record: false,
                expectedPackageName: packageName,
                expectedVersion: version,
            });
            if (result.error) return { installed, error: result.error };
            installed.push(result);
        }
        return { installed };
    } catch (error) {
        return {
            installed: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
