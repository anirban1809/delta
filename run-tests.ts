#!/usr/local/bin/node
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import type { Outcome, TestCase } from "./test-worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = path.join(process.cwd(), "test-source", "tests");
const WORKER_PATH = path.join(__dirname, "test-worker.js");
const TEST_TIMEOUT_MS = 10_000;

const isTTY = process.stdout.isTTY === true;
const color = (code: string, s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);

function discoverSuites(): string[] {
    return fs
        .readdirSync(TEST_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((name) => fs.existsSync(path.join(TEST_ROOT, name, "tests.json")))
        .sort();
}

function loadSuite(name: string): TestCase[] {
    const p = path.join(TEST_ROOT, name, "tests.json");
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * Runs one test case in its own child process. Each test gets a fresh V8
 * heap and a wall-clock timeout, so a compiler bug that hangs or OOMs on one
 * fixture is reported as a single failure instead of taking the whole suite
 * down with it.
 */
function runInWorker(tc: TestCase, suiteDir: string): Outcome {
    const payload = Buffer.from(JSON.stringify({ tc, suiteDir })).toString("base64");
    try {
        const stdout = execFileSync(process.execPath, ["--max-old-space-size=512", WORKER_PATH, payload], {
            timeout: TEST_TIMEOUT_MS,
            stdio: ["ignore", "pipe", "pipe"],
        });
        return JSON.parse(stdout.toString());
    } catch (e: any) {
        if (e.killed) {
            return {
                pass: false,
                reason: `compiler did not finish within ${TEST_TIMEOUT_MS}ms (killed with ${e.signal}) - possible infinite loop`,
            };
        }
        if (e.signal === "SIGABRT") {
            return { pass: false, reason: "compiler crashed: ran out of memory (possible unbounded loop/recursion)" };
        }
        if (e.signal) {
            return { pass: false, reason: `compiler crashed with signal ${e.signal}` };
        }
        const stderr = (e.stderr ?? "").toString().trim();
        const firstLine = stderr.split("\n").find((l: string) => l.trim().length > 0) ?? e.message;
        return { pass: false, reason: `compiler crashed: ${firstLine}` };
    }
}

function main() {
    const requested = process.argv[2];
    const suites = discoverSuites();

    if (requested && !suites.includes(requested)) {
        console.error(`unknown test suite "${requested}"\navailable suites: ${suites.join(", ")}`);
        process.exit(1);
    }

    const targets = requested ? [requested] : suites;

    let totalPass = 0;
    let totalFail = 0;

    for (const suite of targets) {
        const suiteDir = path.join(TEST_ROOT, suite);
        const cases = loadSuite(suite);
        console.log(`\n${color("1", suite)} (${cases.length} tests)`);

        for (const tc of cases) {
            const label = tc.name ?? tc.file;
            const outcome = runInWorker(tc, suiteDir);

            if (outcome.pass) {
                totalPass++;
                console.log(`  ${color("32", "PASS")} ${label}`);
            } else {
                totalFail++;
                console.log(
                    `  ${color("31", "FAIL")} ${label}${outcome.reason ? color("2", ` - ${outcome.reason}`) : ""}`,
                );
            }
        }
    }

    console.log(`\n${totalPass} passed, ${totalFail} failed, ${totalPass + totalFail} total`);
    process.exit(totalFail > 0 ? 1 : 0);
}

main();
