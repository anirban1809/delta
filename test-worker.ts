#!/usr/local/bin/node
// Runs a single test case and prints its {pass, reason} outcome as JSON on
// stdout. Invoked as a child process (see run-tests.ts) so that a compiler
// bug in one test case -- an infinite loop, an OOM, an uncaught exception --
// can't take down the rest of the run.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { Tokenizer } from "./src/ast/tokenizer.js";
import { Parser } from "./src/ast/parser.js";
import { Diagnostics, type Error as CompilerError } from "./src/diagnostics/diagnostics.js";
import { Analyzer } from "./src/analysis/analyzer.js";
import { Emitter } from "./src/codegen/emitter.js";

export type TestCase = {
    file: string;
    name?: string;
    expect: "pass" | "fail" | "codegen_match" | "trap";
    contains?: string;
    not_contains?: string;
    error_count?: number;
    panic_contains?: string;
    panic_at?: string;
    note?: string;
};

export type Outcome = { pass: boolean; reason?: string };

type CompileResult = {
    errors: CompilerError[];
    emitted?: string;
};

/** Runs the lex -> parse -> analyze -> emit pipeline, stopping early on errors (mirrors main.ts's build()). */
function compile(content: string, filepath: string): CompileResult {
    const tokenizer = new Tokenizer(content);
    const tokens = tokenizer.tokenize();
    const diagnostics = new Diagnostics();
    const parser = new Parser(filepath, diagnostics);

    const ast = parser.parse(tokens);
    if (!ast) {
        return { errors: diagnostics.errors };
    }

    const analyzer = new Analyzer(ast, diagnostics);
    analyzer.analyze();

    if (diagnostics.errors.length > 0) {
        return { errors: diagnostics.errors };
    }

    const emitter = new Emitter(ast);
    return { errors: [], emitted: emitter.emit() };
}

/** Compiles emitted C to a binary with the system `cc` and runs it, capturing exit code and stderr. */
function runTrap(cSource: string): {
    compileError?: string;
    exitCode: number;
    stdout: string;
    stderr: string;
} {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delta-test-"));
    const cPath = path.join(dir, "out.c");
    const binPath = path.join(dir, "out.bin");
    fs.writeFileSync(cPath, cSource);

    try {
        try {
            execFileSync("cc", [cPath, "-o", binPath], { stdio: ["ignore", "pipe", "pipe"] });
        } catch (e: any) {
            return {
                compileError: (e.stderr ?? e.message ?? "").toString(),
                exitCode: -1,
                stdout: "",
                stderr: "",
            };
        }

        try {
            const stdout = execFileSync(binPath, [], { stdio: ["ignore", "pipe", "pipe"] });
            return { exitCode: 0, stdout: stdout.toString(), stderr: "" };
        } catch (e: any) {
            return {
                exitCode: typeof e.status === "number" ? e.status : -1,
                stdout: e.stdout ? e.stdout.toString() : "",
                stderr: e.stderr ? e.stderr.toString() : "",
            };
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

export function evaluate(tc: TestCase, suiteDir: string): Outcome {
    const deltaPath = path.join(suiteDir, tc.file);
    const content = fs.readFileSync(deltaPath, "utf8");
    const result = compile(content, deltaPath);

    if (tc.expect === "pass") {
        if (result.errors.length > 0) {
            return {
                pass: false,
                reason: `expected no errors, got ${result.errors.length}: ${result.errors[0]!.message}`,
            };
        }
        return { pass: true };
    }

    if (tc.expect === "fail") {
        if (result.errors.length === 0) {
            return { pass: false, reason: "expected a compile error, got none" };
        }
        if (tc.error_count !== undefined && result.errors.length !== tc.error_count) {
            return {
                pass: false,
                reason: `expected ${tc.error_count} error(s), got ${result.errors.length}`,
            };
        }
        if (tc.contains && !result.errors.some((e) => e.message.includes(tc.contains!))) {
            return { pass: false, reason: `no error message contains "${tc.contains}"` };
        }
        if (tc.not_contains && result.errors.some((e) => e.message.includes(tc.not_contains!))) {
            return {
                pass: false,
                reason: `an error message unexpectedly contains "${tc.not_contains}"`,
            };
        }
        return { pass: true };
    }

    if (tc.expect === "codegen_match") {
        if (result.errors.length > 0) {
            return {
                pass: false,
                reason: `unexpected compile error(s): ${result.errors.map((e) => e.message).join("; ")}`,
            };
        }
        const expectedPath = deltaPath.replace(/\.delta$/, ".expected.c");
        if (!fs.existsSync(expectedPath)) {
            return { pass: false, reason: `missing fixture ${path.basename(expectedPath)}` };
        }
        const expected = fs.readFileSync(expectedPath, "utf8").trim();
        const actual = (result.emitted ?? "").trim();
        if (actual !== expected) {
            return { pass: false, reason: "emitted C does not match expected.c" };
        }
        return { pass: true };
    }

    // tc.expect === "trap"
    if (result.errors.length > 0) {
        return {
            pass: false,
            reason: `unexpected compile error(s): ${result.errors.map((e) => e.message).join("; ")}`,
        };
    }
    const run = runTrap(result.emitted ?? "");
    if (run.compileError !== undefined) {
        return { pass: false, reason: `C compile failed: ${run.compileError.trim()}` };
    }
    if (run.exitCode === 0) {
        return { pass: false, reason: "expected a runtime trap, program exited normally" };
    }
    if (tc.panic_contains && !run.stderr.includes(tc.panic_contains)) {
        return {
            pass: false,
            reason: `stderr did not contain "${tc.panic_contains}" (stderr: ${run.stderr.trim()})`,
        };
    }
    if (tc.panic_at && !run.stderr.includes(tc.panic_at)) {
        return { pass: false, reason: `stderr did not contain location "${tc.panic_at}"` };
    }
    return { pass: true };
}

function main() {
    const payload = JSON.parse(Buffer.from(process.argv[2]!, "base64").toString("utf8")) as {
        tc: TestCase;
        suiteDir: string;
    };

    let outcome: Outcome;
    try {
        outcome = evaluate(payload.tc, payload.suiteDir);
    } catch (e: any) {
        outcome = { pass: false, reason: `runner threw: ${e?.message ?? e}` };
    }

    process.stdout.write(JSON.stringify(outcome));
}

main();
