#!/usr/local/bin/node
import assert from "assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { compileSource } from "./src/compiler/pipeline.js";
import { Diagnostics, Error as CompilerError } from "./src/diagnostics/diagnostics.js";
import { SourceIndex, symbolMarkdown } from "./src/lsp/source-index.js";

function testCurrentSignatureIndexing() {
    const source = `function identity<T>(value: Box<T>): T | ParseError, OverflowError {
    return error as { };
}`;
    const index = new SourceIndex(source, "file:///identity.delta");
    const identity = index.root.symbols.get("identity");
    assert(identity);
    assert.deepEqual(identity.typeParameters, ["T"]);
    assert.deepEqual(identity.errorTypes, ["ParseError", "OverflowError"]);
    assert.match(identity.signature ?? "", /identity<T>/);
    assert.match(identity.signature ?? "", /Box<T>/);
    assert.match(identity.signature ?? "", /ParseError, OverflowError/);
}

function testDocumentationCommentIndexing() {
    const source = `/**
 * A reusable **record**.
 *
 * Its value can contain \`inline code\`.
 */
type struct Box = { value: int32 };

/// Adds **one** to a value.
///
/// - Preserves Markdown lists.
function increment(value: int32): int32 { return value + 1; }

/** The [default value](https://example.com/default). */
const defaultValue: int32 = 41;

/// This is detached.

function undocumented(): int32 { return 0; }

/// This is interrupted.
// An ordinary comment breaks documentation attachment.
const alsoUndocumented: int32 = 0;

function main(): uint8 { return uint8(increment(defaultValue)); }`;
    const index = new SourceIndex(source, "file:///documentation.delta");

    const box = index.resolveAt(source.indexOf("Box") + 1);
    assert.equal(
        box?.documentation,
        "A reusable **record**.\n\nIts value can contain `inline code`.",
    );

    const incrementUse = source.lastIndexOf("increment") + 1;
    const increment = index.resolveAt(incrementUse);
    assert.equal(
        increment?.documentation,
        "Adds **one** to a value.\n\n- Preserves Markdown lists.",
    );
    assert.equal(
        symbolMarkdown(increment!),
        `\`\`\`delta
function increment(value: int32): int32
\`\`\`

Adds **one** to a value.

- Preserves Markdown lists.`,
    );

    const defaultValueUse = source.lastIndexOf("defaultValue") + 1;
    assert.equal(
        index.resolveAt(defaultValueUse)?.documentation,
        "The [default value](https://example.com/default).",
    );
    assert.equal(index.resolveAt(source.indexOf("undocumented") + 1)?.documentation, undefined);
    assert.equal(index.resolveAt(source.indexOf("alsoUndocumented") + 1)?.documentation, undefined);

    const result = compileSource(source, "documentation.delta");
    assert.deepEqual(result.diagnostics, []);
    const declarations = result.ast?.declarations ?? [];
    assert.equal(
        declarations.find((declaration) => declaration.name.name === "Box")?.documentation,
        "A reusable **record**.\n\nIts value can contain `inline code`.",
    );
    assert.equal(
        declarations.find((declaration) => declaration.name.name === "increment")?.documentation,
        "Adds **one** to a value.\n\n- Preserves Markdown lists.",
    );
    assert.equal(
        declarations.find((declaration) => declaration.name.name === "defaultValue")?.documentation,
        "The [default value](https://example.com/default).",
    );
}

function testErrorResultIndexing() {
    const source = `type struct ParseError = { };
function parse<T>(value: T): T | ParseError { return value; }
function main(): uint8 {
    const value = parse<int32>(1) as result;
    check result as ParseError { return 1; }
    return uint8(value);
}`;
    const index = new SourceIndex(source, "file:///result.delta");
    const resultUse = source.indexOf("result as ParseError") + 1;
    const result = index.resolveAt(resultUse);
    assert.equal(result?.name, "result");
    assert.equal(result?.type, "result<T | ParseError>");
}

function testObjectLiteralFieldDefinitions() {
    const source = `type struct Box<T> = { value: T };
type struct Wrapper = { inner: Box<int32> };
function main(): uint8 {
    const named = Box<int32> { value: 1 };
    const anonymous: Wrapper = { inner: { value: 2 } };
    return 0;
}`;
    const index = new SourceIndex(source, "file:///objects.delta");
    const declarationOffset = source.indexOf("value");
    const namedOffset = source.indexOf("value: 1") + 1;
    const nestedOffset = source.indexOf("value: 2") + 1;
    assert.equal(index.resolveAt(namedOffset)?.token.start, declarationOffset);
    assert.equal(index.resolveAt(nestedOffset)?.token.start, declarationOffset);
    const innerUse = source.indexOf("inner: {") + 1;
    const innerDeclaration = source.indexOf("inner:");
    assert.equal(index.resolveAt(innerUse)?.token.start, innerDeclaration);
}

function testReceiverFunctionIndexing() {
    const source = `type struct Counter = { value: int32 };
type struct Holder = { counter: owned<Counter> };
function (counter: &Counter) get(): int32 { return counter.value; }
function main(): uint8 {
    const holder: Holder = Holder { counter: new Counter { value: 1 } };
    return uint8(holder.counter.get());
}`;
    const index = new SourceIndex(source, "file:///receivers.delta");
    const methodUse = source.lastIndexOf("get") + 1;
    const methodDeclaration = source.indexOf("get");
    assert.equal(index.resolveAt(methodUse)?.kind, "method");
    assert.equal(index.resolveAt(methodUse)?.token.start, methodDeclaration);

    const receiverUse = source.indexOf("counter.value") + 1;
    assert.equal(index.resolveAt(receiverUse)?.kind, "parameter");
    const members = index.fieldsFor("owned<Counter>");
    assert(members.some((member) => member.name === "value" && member.kind === "field"));
    assert(members.some((member) => member.name === "get" && member.kind === "method"));
}

function testStringLiteralIndexing() {
    const source = `function main(): uint8 {
    const doubleQuoted = "Anirban";
    const singleQuoted = 'Anirban';
    const empty = '';
    const character = 'A';
    const byteLength = singleQuoted.length;
    const combined = singleQuoted + " value";
    return uint8(0);
}`;
    const index = new SourceIndex(source, "file:///strings.delta");

    const resolve = (name: string) => index.resolveAt(source.indexOf(name) + 1);
    assert.equal(resolve("doubleQuoted")?.type, "string");
    assert.equal(resolve("singleQuoted")?.type, "string");
    assert.equal(resolve("empty")?.type, "string");
    assert.equal(resolve("character")?.type, "char");
    assert.equal(resolve("byteLength")?.type, "uintsize");
    assert.equal(resolve("combined")?.type, "string");

    const compiled = compileSource(source, "strings.delta");
    assert.deepEqual(compiled.diagnostics, []);
}

function assertDiagnosticSpan(source: string, needle: string, message: RegExp) {
    const result = compileSource(source, "diagnostic-test.delta");
    const diagnostic = result.diagnostics.find((candidate) => message.test(candidate.message));
    assert(diagnostic, `missing diagnostic matching ${message}`);
    assert.equal(source.slice(diagnostic.position.start, diagnostic.position.end), needle);
    const before = source.slice(0, diagnostic.position.start);
    assert.equal(diagnostic.position.line, before.split(/\r?\n/).length);
    assert.equal(
        diagnostic.position.column,
        diagnostic.position.start - Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r")),
    );
}

function testDiagnosticPositions(root: string) {
    assertDiagnosticSpan(
        "function main(): uint8 { return missing; }",
        "missing",
        /unknown identifier/,
    );
    assertDiagnosticSpan(
        "function main(): uint8 { const value: int32 = true; return 0; }",
        "true",
        /type mismatch/,
    );
    assertDiagnosticSpan(
        "function test(): bool { return 1 && 2; } function main(): uint8 { return 0; }",
        "&&",
        /expects bool operands/,
    );
    assertDiagnosticSpan(
        "type Box = { value: int32; }; function main(): uint8 { const box: Box = { value: true }; return 0; }",
        "true",
        /value of member value/,
    );
    assertDiagnosticSpan(
        "type Box = { value: int32; }; function main(): uint8 { const box: Box = { value: 1, extra: 2 }; return 0; }",
        "extra",
        /unknown fields/,
    );
    assertDiagnosticSpan(
        "type Box = { value: int32; }; function read(box: &Box): int32 { return box.missing; } function main(): uint8 { return 0; }",
        "missing",
        /has no member/,
    );
    assertDiagnosticSpan(
        "function main(): uint8 { let value int32 = 1; return 0; }",
        "int32",
        /: expected/,
    );

    const otherPath = path.join(root, "other.delta");
    const collectorPath = path.join(root, "collector.delta");
    fs.writeFileSync(otherPath, "bad token\n");
    fs.writeFileSync(collectorPath, "unrelated\n");
    const formatted = new Diagnostics(collectorPath).format(
        CompilerError(otherPath, "semantic", { line: 1, column: 5, start: 4, end: 9 }, "bad"),
    );
    assert.match(formatted, /bad token/);
    assert.doesNotMatch(formatted, /unrelated/);
}

function main() {
    testCurrentSignatureIndexing();
    testDocumentationCommentIndexing();
    testErrorResultIndexing();
    testObjectLiteralFieldDefinitions();
    testReceiverFunctionIndexing();
    testStringLiteralIndexing();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "delta-lsp-"));
    try {
        testDiagnosticPositions(root);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
    console.log("LSP tests passed");
}

main();
