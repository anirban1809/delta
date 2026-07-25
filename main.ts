#!/usr/local/bin/node
import * as path from "path";
import { Formatter } from "./src/ast/formatter.js";
import { Diagnostics } from "./src/diagnostics/diagnostics.js";
import { buildProject, scaffoldProject } from "./src/compiler/project.js";
import { startLanguageServer } from "./src/lsp/server.js";
import { installExternalPackages, installPackage, packageProject } from "./src/compiler/package.js";
import { parseBindgenCliArguments, writeFfiBindings } from "./src/compiler/bindgen.js";

/** Builds an entry file or the manifest-backed project in the current directory. */
function build(entry?: string, debug = false): boolean {
    const result = buildProject(entry, { debug });
    for (const error of result.diagnostics) {
        console.error(new Diagnostics(error.filepath).format(error));
    }
    if (result.error) {
        console.error(result.error);
    }
    if (debug && result.diagnostics.length == 0) {
        for (const ast of result.asts) {
            new Formatter(ast).dump();
        }
        for (const codegen of result.generatedCode) {
            console.log(codegen);
        }
        return !result.error;
    }
    if (!result.artifactPath || result.diagnostics.length > 0 || result.error) {
        return false;
    }

    console.log(`Built ${result.artifactPath}`);
    return true;
}

/** Creates `delta.json`, `.gitignore`, and a buildable `src/main.delta`. */
function scaffold(name: string, parentDirectory: string): boolean {
    try {
        const projectRoot = scaffoldProject(name, parentDirectory);
        console.log(`Created Delta project at ${projectRoot}`);
        return true;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return false;
    }
}

function usage(): void {
    console.log(
        "usage:\n  delta build [filename.delta | project-directory]\n  delta build --debug <filename.delta | project-directory>\n  delta bindgen <header> [symbol list] -o <file.ffi.delta>\n  delta package [project-directory]\n  delta install [package.tar]\n  delta init projectname\n  delta lsp",
    );
}

function main(): void {
    const command = process.argv[2];
    if (!command) {
        usage();
        process.exitCode = 1;
        return;
    }

    switch (command) {
        case "lsp":
            startLanguageServer();
            return;
        case "build": {
            const debug = process.argv[3] == "--debug";
            const input = process.argv[debug ? 4 : 3];
            if (debug && !input) {
                console.error("usage: delta build --debug <filename.delta | project-directory>");
                process.exitCode = 1;
                return;
            }
            const resolvedInput = input ? path.resolve(input) : undefined;
            if (!build(resolvedInput, debug)) {
                process.exitCode = 1;
            }
            return;
        }
        case "bindgen": {
            try {
                const args = parseBindgenCliArguments(process.argv.slice(3));
                const result = writeFfiBindings(args.header, args.symbols, args.outputPath);
                console.log(
                    `Generated ${result.outputPath} (${result.symbols.length} symbol${result.symbols.length == 1 ? "" : "s"})`,
                );
                if (result.skippedSymbols.length) {
                    console.error(
                        `Skipped ${result.skippedSymbols.length} declaration${result.skippedSymbols.length == 1 ? "" : "s"} with unsupported C signatures`,
                    );
                }
            } catch (error) {
                console.error(error instanceof Error ? error.message : String(error));
                console.error("usage: delta bindgen <header> [symbol list] -o <file.ffi.delta>");
                process.exitCode = 1;
            }
            return;
        }
        case "package": {
            const input = path.resolve(process.argv[3] ?? process.cwd());
            const result = packageProject(input);
            if (result.error || !result.archivePath) {
                console.error(result.error ?? "package creation failed");
                process.exitCode = 1;
                return;
            }
            console.log(`Packaged ${result.archivePath}`);
            console.log(`SHA-256 ${result.archiveSha256}`);
            return;
        }
        case "install": {
            const archive = process.argv[3];
            if (!archive) {
                const result = installExternalPackages(process.cwd());
                if (result.error) {
                    console.error(result.error);
                    process.exitCode = 1;
                    return;
                }
                if (!result.installed.length) {
                    console.log("No external packages to install");
                    return;
                }
                for (const installed of result.installed) {
                    console.log(
                        `Installed ${installed.packageName}@${installed.version} to ${installed.installedPath}`,
                    );
                }
                return;
            }
            const result = installPackage(path.resolve(archive), process.cwd());
            if (result.error || !result.installedPath) {
                console.error(result.error ?? "package installation failed");
                process.exitCode = 1;
                return;
            }
            console.log(
                `Installed ${result.packageName}@${result.version} to ${result.installedPath}`,
            );
            console.log(`SHA-256 ${result.archiveSha256}`);
            return;
        }
        case "init": {
            const projectName = process.argv[3];
            if (!projectName) {
                console.error("usage: delta init projectname");
                process.exitCode = 1;
                return;
            }
            if (!scaffold(projectName, process.cwd())) {
                process.exitCode = 1;
            }
            return;
        }
        default:
            usage();
            process.exitCode = 1;
    }
}

main();
