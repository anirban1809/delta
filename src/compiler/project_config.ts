import * as fs from "fs";
import * as path from "path";

export const STANDARD_LIBRARY_ALIAS = "@std";

export type PathAliases = ReadonlyMap<string, string>;
export type ProjectKind = "executable" | "static" | "dynamic";

export type DeltaManifest = {
    name?: string;
    version?: string;
    entry?: string;
    kind: ProjectKind;
    dependencies: Map<string, string>;
    external: Map<string, string>;
};

export type ImportPathResolution =
    | { kind: "file"; filePath: string }
    | { kind: "standard"; modulePath: string; reason?: string }
    | { kind: "unknown" };

const dependencyNamePattern = /^@[A-Za-z][A-Za-z0-9_-]*$/;
const externalPackageNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Reads and validates the project fields currently consumed by the compiler. */
export function readDeltaManifest(manifestPath: string): DeltaManifest {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        name?: unknown;
        version?: unknown;
        entry?: unknown;
        kind?: unknown;
        dependencies?: unknown;
        external?: unknown;
    };
    const kind = parsed.kind ?? "executable";
    if (!["executable", "static", "dynamic"].includes(kind as string)) {
        throw new Error("delta.json kind must be one of `executable`, `static`, or `dynamic`");
    }
    const dependencies = new Map<string, string>();
    const external = new Map<string, string>();
    if (parsed.dependencies !== undefined) {
        if (
            !parsed.dependencies ||
            typeof parsed.dependencies !== "object" ||
            Array.isArray(parsed.dependencies)
        ) {
            throw new Error("delta.json dependencies must be an object");
        }
        for (const [name, target] of Object.entries(parsed.dependencies)) {
            if (name === STANDARD_LIBRARY_ALIAS) {
                throw new Error(
                    `dependency \`${STANDARD_LIBRARY_ALIAS}\` is reserved for the standard library`,
                );
            }
            if (!dependencyNamePattern.test(name)) {
                throw new Error(
                    `invalid dependency \`${name}\`: import dependencies must have the form \`@name\``,
                );
            }
            if (typeof target !== "string" || target.trim().length === 0) {
                throw new Error(`dependency \`${name}\` must map to a non-empty string`);
            }
            if (path.isAbsolute(target)) {
                throw new Error(`dependency \`${name}\` must be relative to the project root`);
            }
            dependencies.set(name, target);
        }
    }
    if (parsed.external !== undefined) {
        if (
            !parsed.external ||
            typeof parsed.external !== "object" ||
            Array.isArray(parsed.external)
        ) {
            throw new Error("delta.json external must be an object");
        }
        for (const [name, specification] of Object.entries(parsed.external)) {
            if (!externalPackageNamePattern.test(name)) {
                throw new Error(
                    `invalid external package name \`${name}\`: package names may contain letters, numbers, underscores, and hyphens`,
                );
            }
            const separator = typeof specification == "string" ? specification.indexOf(":") : -1;
            if (
                typeof specification !== "string" ||
                separator <= 0 ||
                separator == specification.length - 1
            ) {
                throw new Error(
                    `external package \`${name}\` must have the form \`<version>:<archive-path>\``,
                );
            }
            external.set(name, specification);
        }
    }
    return {
        name: typeof parsed.name === "string" ? parsed.name : undefined,
        version: typeof parsed.version === "string" ? parsed.version : undefined,
        entry: typeof parsed.entry === "string" ? parsed.entry : undefined,
        kind: kind as ProjectKind,
        dependencies,
        external,
    };
}

/** Finds the closest manifest that owns a source file. */
export function findNearestDeltaManifest(startDirectory: string): string | undefined {
    let directory = path.resolve(startDirectory);
    while (true) {
        const candidate = path.join(directory, "delta.json");
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
        const parent = path.dirname(directory);
        if (parent === directory) return undefined;
        directory = parent;
    }
}

function resolveDeltaFile(filePath: string): string {
    if (filePath.endsWith(".delta")) return filePath;
    const sourcePath = `${filePath}.delta`;
    if (fs.existsSync(sourcePath)) return sourcePath;
    const interfacePath = `${filePath}.ffi.delta`;
    return fs.existsSync(interfacePath) ? interfacePath : sourcePath;
}

/** Resolves relative, configured-alias, and reserved standard-library imports. */
export function resolveImportSpecifier(
    importer: string,
    importPath: string,
    projectRoot: string,
    aliases: PathAliases,
): ImportPathResolution {
    if (importPath === "std" || importPath.startsWith("std/")) {
        return { kind: "standard", modulePath: importPath };
    }
    if (
        importPath === STANDARD_LIBRARY_ALIAS ||
        importPath.startsWith(`${STANDARD_LIBRARY_ALIAS}/`)
    ) {
        const configuredRoot = process.env.DELTA_STD_LIB?.trim();
        if (configuredRoot) {
            const suffix = importPath.slice(STANDARD_LIBRARY_ALIAS.length).replace(/^\//, "");
            const resolved = suffix
                ? path.resolve(configuredRoot, suffix)
                : path.resolve(configuredRoot);
            return { kind: "file", filePath: resolveDeltaFile(resolved) };
        }
        return {
            kind: "standard",
            modulePath: `std${importPath.slice(STANDARD_LIBRARY_ALIAS.length)}`,
            reason: "DELTA_STD_LIB is not set",
        };
    }
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
        return {
            kind: "file",
            filePath: resolveDeltaFile(path.resolve(path.dirname(importer), importPath)),
        };
    }

    const separator = importPath.indexOf("/");
    const alias = separator < 0 ? importPath : importPath.slice(0, separator);
    const target = aliases.get(alias);
    if (!target) return { kind: "unknown" };
    const suffix = separator < 0 ? "" : importPath.slice(separator + 1);
    const resolved = suffix
        ? path.resolve(projectRoot, target, suffix)
        : path.resolve(projectRoot, target);
    return { kind: "file", filePath: resolveDeltaFile(resolved) };
}

/** Returns the shortest configured alias spelling for an existing source path. */
export function aliasSpecifierForPath(
    targetPath: string,
    projectRoot: string,
    aliases: PathAliases,
): string | undefined {
    const normalizedTarget = path.resolve(targetPath);
    const candidates: string[] = [];
    for (const [alias, configuredTarget] of aliases) {
        const aliasTarget = path.resolve(projectRoot, configuredTarget);
        if (resolveDeltaFile(aliasTarget) === normalizedTarget) {
            candidates.push(alias);
            continue;
        }
        const relative = path.relative(aliasTarget, normalizedTarget);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
        candidates.push(
            `${alias}/${relative.replaceAll(path.sep, "/").replace(/(?:\.ffi)?\.delta$/i, "")}`,
        );
    }
    return candidates.sort((left, right) => left.length - right.length)[0];
}
