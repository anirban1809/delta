#!/usr/local/bin/node
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { Formatter } from "./src/ast/formatter.js";
import { Diagnostics } from "./src/diagnostics/diagnostics.js";
import { Emitter } from "./src/codegen/emitter.js";
import { compileSource } from "./src/compiler/pipeline.js";
import { startLanguageServer } from "./src/lsp/server.js";

/** Renders the compiler's own output for a failed native (clang) invocation. */
function compilerOutput(error: unknown): string {
    if (typeof error == "object" && error && "stderr" in error) {
        return String((error as { stderr?: unknown }).stderr ?? error);
    }
    return error instanceof Error ? error.message : String(error);
}

/**
 * Compiles one `.delta` file: lex → parse → analyze → emit C, then hands the
 * generated translation unit to clang. Returns false if any stage failed.
 */
function build(entry: string, debug = false): boolean {
    if (path.extname(entry) != ".delta") {
        console.error(`build entry must be a .delta file: ${entry}`);
        return false;
    }
    if (!fs.existsSync(entry) || !fs.statSync(entry).isFile()) {
        console.error(`build entry does not exist: ${entry}`);
        return false;
    }

    const source = fs.readFileSync(entry, "utf8");
    const result = compileSource(source, entry);
    for (const error of result.diagnostics) {
        console.error(new Diagnostics(error.filepath).format(error));
    }
    if (!result.ast || result.diagnostics.length > 0) {
        return false;
    }

    const generatedCode = new Emitter(result.ast).emit();
    if (debug) {
        new Formatter(result.ast).dump();
        console.log(generatedCode);
        return true;
    }

    const outputDirectory = path.join(path.dirname(entry), "build");
    const outputName = path.basename(entry, ".delta");
    const cPath = path.join(outputDirectory, `${outputName}.c`);
    const binaryPath = path.join(outputDirectory, outputName);
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(cPath, generatedCode);

    try {
        execFileSync("clang", ["-std=c17", cPath, "-lm", "-o", binaryPath]);
    } catch (error) {
        console.error(`native build failed:\n${compilerOutput(error)}`);
        return false;
    }

    console.log(`Built ${binaryPath}`);
    return true;
}

function usage(): void {
    console.log(
        "usage:\n  delta build <filename.delta>\n  delta build --debug <filename.delta>\n  delta lsp",
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
            if (!input) {
                console.error("usage: delta build [--debug] <filename.delta>");
                process.exitCode = 1;
                return;
            }
            if (!build(path.resolve(input), debug)) {
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
