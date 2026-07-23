import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import {
    aliasSpecifierForPath,
    findNearestDeltaManifest,
    readDeltaManifest,
    resolveImportSpecifier,
    type ImportPathResolution,
    type PathAliases,
} from "../compiler/project_config.js";
import { SourceIndex, type IndexedSymbol, type StructInfo } from "./source-index.js";

export type AutoImportCandidate = {
    symbol: IndexedSymbol;
    importPath: string;
};

const ignoredDirectories = new Set([".git", "build", "node_modules", "dist"]);

function isWithin(root: string, fileName: string): boolean {
    const relative = path.relative(root, fileName);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Workspace-wide exported-symbol and module index used by editor features. */
export class WorkspaceIndex {
    private readonly files = new Map<string, SourceIndex>();
    private readonly manifests = new Map<string, PathAliases>();

    constructor(private roots: string[] = []) {
        this.roots = roots.map((root) => path.resolve(root));
    }

    setRoots(roots: string[]) {
        this.roots = roots.map((root) => path.resolve(root));
        for (const fileName of this.files.keys()) {
            const retained = this.roots.some((root) => isWithin(root, fileName));
            if (!retained) this.files.delete(fileName);
        }
        for (const root of this.manifests.keys()) {
            if (!this.roots.some((workspaceRoot) => isWithin(workspaceRoot, root))) {
                this.manifests.delete(root);
            }
        }
        this.linkAllImports();
    }

    scan() {
        for (const root of this.roots) this.scanDirectory(root);
        this.linkAllImports();
    }

    private scanDirectory(directory: string) {
        if (!fs.existsSync(directory)) return;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
            const fileName = path.join(directory, entry.name);
            if (entry.isDirectory()) this.scanDirectory(fileName);
            else if (entry.isFile() && entry.name.endsWith(".delta")) this.load(fileName);
            else if (entry.isFile() && entry.name === "delta.json") this.loadManifest(fileName);
        }
    }

    private loadManifest(fileName: string) {
        const root = path.dirname(path.resolve(fileName));
        try {
            this.manifests.set(root, readDeltaManifest(fileName).dependencies);
        } catch {
            this.manifests.delete(root);
        }
    }

    private manifestFor(fileName: string): { root: string; dependencies: PathAliases } | undefined {
        const manifestPath = findNearestDeltaManifest(path.dirname(fileName));
        if (!manifestPath) return undefined;
        const root = path.dirname(manifestPath);
        if (!this.manifests.has(root)) this.loadManifest(manifestPath);
        const dependencies = this.manifests.get(root);
        return dependencies ? { root, dependencies } : undefined;
    }

    private load(fileName: string): SourceIndex | undefined {
        const normalized = path.resolve(fileName);
        try {
            const index = new SourceIndex(
                fs.readFileSync(normalized, "utf8"),
                pathToFileURL(normalized).toString(),
            );
            this.files.set(normalized, index);
            return index;
        } catch {
            return undefined;
        }
    }

    update(fileName: string, source: string): SourceIndex {
        const normalized = path.resolve(fileName);
        const index = new SourceIndex(source, pathToFileURL(normalized).toString());
        this.files.set(normalized, index);
        this.linkAllImports();
        return index;
    }

    refresh(fileName: string) {
        if (path.basename(fileName) === "delta.json") this.loadManifest(fileName);
        else this.load(fileName);
        this.linkAllImports();
    }

    remove(fileName: string) {
        const normalized = path.resolve(fileName);
        if (path.basename(normalized) === "delta.json") {
            this.manifests.delete(path.dirname(normalized));
        } else {
            this.files.delete(normalized);
        }
        this.linkAllImports();
    }

    get(fileName: string): SourceIndex | undefined {
        return this.files.get(path.resolve(fileName));
    }

    readSource = (fileName: string): string | undefined => {
        const indexed = this.get(fileName);
        if (indexed) return indexed.source;
        try {
            return fs.readFileSync(fileName, "utf8");
        } catch {
            return undefined;
        }
    };

    resolveImport = (importer: string, importPath: string): ImportPathResolution => {
        const manifest = this.manifestFor(importer);
        return resolveImportSpecifier(
            importer,
            importPath,
            manifest?.root ?? path.dirname(importer),
            manifest?.dependencies ?? new Map(),
        );
    };

    private resolvePath(importer: string, importPath: string): string | undefined {
        const resolution = this.resolveImport(importer, importPath);
        return resolution.kind === "file" ? resolution.filePath : undefined;
    }

    private external(
        importer: string,
        importPath: string,
        name: string,
    ): { symbol: IndexedSymbol; struct?: StructInfo } | undefined {
        const targetPath = this.resolvePath(importer, importPath);
        if (!targetPath) return undefined;
        const target = this.files.get(targetPath) ?? this.load(targetPath);
        const symbol = target?.exportedSymbols().find((candidate) => candidate.name === name);
        if (!target || !symbol) return undefined;
        return { symbol, struct: target.structs.get(symbol.name) };
    }

    private externalModule(
        importer: string,
        importPath: string,
        moduleName: string,
    ):
        | {
              symbols: IndexedSymbol[];
              structs: Map<string, StructInfo>;
              namespaces: Map<string, IndexedSymbol[]>;
              declaration?: IndexedSymbol;
          }
        | undefined {
        const targetPath = this.resolvePath(importer, importPath);
        if (!targetPath) return undefined;
        const target = this.files.get(targetPath) ?? this.load(targetPath);
        if (!target || target.exportModuleName !== moduleName) return undefined;
        return {
            symbols: target.exportedSymbols(),
            structs: target.structs,
            namespaces: target.namespaces,
            declaration: target.moduleDeclaration,
        };
    }

    private linkAllImports() {
        for (const [fileName, index] of this.files) {
            index.linkImports(
                (importPath, name) => this.external(fileName, importPath, name),
                (importPath, moduleName) => this.externalModule(fileName, importPath, moduleName),
            );
        }
    }

    autoImports(fileName: string): AutoImportCandidate[] {
        const normalized = path.resolve(fileName);
        const current = this.files.get(normalized);
        if (!current) return [];
        const visible = new Set(
            current.completions(current.source.length).map((symbol) => symbol.name),
        );
        const candidates: AutoImportCandidate[] = [];
        for (const [candidatePath, candidateIndex] of this.files) {
            if (candidatePath === normalized) continue;
            for (const symbol of candidateIndex.exportedSymbols()) {
                if (visible.has(symbol.name)) continue;
                candidates.push({
                    symbol,
                    importPath: this.moduleSpecifier(normalized, candidatePath),
                });
            }
        }
        return candidates;
    }

    private moduleSpecifier(importer: string, target: string): string {
        const manifest = this.manifestFor(importer);
        const alias = manifest
            ? aliasSpecifierForPath(target, manifest.root, manifest.dependencies)
            : undefined;
        if (alias) return alias;
        let relative = path.relative(path.dirname(importer), target).replaceAll(path.sep, "/");
        relative = relative.replace(/\.delta$/i, "");
        return relative.startsWith(".") ? relative : `./${relative}`;
    }
}
