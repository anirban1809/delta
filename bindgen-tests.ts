#!/usr/local/bin/node
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    generateFfiBindings,
    parseBindgenCliArguments,
    writeFfiBindings,
} from "./src/compiler/bindgen.js";
import { Tokenizer } from "./src/ast/tokenizer.js";
import { Parser } from "./src/ast/parser.js";
import { Diagnostics } from "./src/diagnostics/diagnostics.js";
import { AnalyzerCore } from "./src/analysis/core.js";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "delta-bindgen-test-"));

try {
    fs.writeFileSync(
        path.join(temporary, "sample.h"),
        "int open(const char *, int, ...);\nint close(int fd);\n",
    );

    assert.deepEqual(
        parseBindgenCliArguments(["<sample.h>", "[open, close]", "-o", "sample.ffi.delta"]),
        {
            header: "<sample.h>",
            symbols: ["open", "close"],
            outputPath: "sample.ffi.delta",
        },
    );

    const generated = generateFfiBindings('"sample.h"', ["open"], { cwd: temporary });
    assert.equal(
        generated.source,
        `ffi header '"sample.h"';

extern {
    /// int open(const char *, int, ...);
    function open(path: c.ptr<c.const<c.void>>, flags: c.int);
}

export module sample;
`,
    );
    const diagnostics = new Diagnostics("sample.ffi.delta");
    const ast = new Parser("sample.ffi.delta", diagnostics).parse(
        new Tokenizer(generated.source).tokenize(),
    );
    assert.ok(ast);
    new AnalyzerCore(ast!, diagnostics).analyze();
    assert.deepEqual(
        diagnostics.errors.map((error) => error.message),
        [],
    );

    const result = writeFfiBindings('"sample.h"', ["close"], "generated.ffi.delta", {
        cwd: temporary,
    });
    assert.equal(
        fs.readFileSync(result.outputPath, "utf8"),
        `ffi header '"sample.h"';

extern {
    /// int close(int);
    function close(fd: c.int): c.int;
}

export module sample;
`,
    );

    assert.throws(
        () => generateFfiBindings('"sample.h"', ["missing"], { cwd: temporary }),
        /symbol not found/,
    );
    assert.throws(
        () => parseBindgenCliArguments(["<sample.h>", "[open]", "sample.ffi.delta"]),
        /requires exactly one/,
    );

    console.log("bindgen tests passed");
} finally {
    fs.rmSync(temporary, { recursive: true, force: true });
}
