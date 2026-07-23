#!/usr/local/bin/node
import assert from "assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { compileModuleSource, compileSource } from "./src/compiler/pipeline.js";
import { buildProject } from "./src/compiler/project.js";
import { Diagnostics, Error as CompilerError } from "./src/diagnostics/diagnostics.js";
import { SourceIndex } from "./src/lsp/source-index.js";
import { WorkspaceIndex } from "./src/lsp/workspace-index.js";

function testCurrentSignatureIndexing() {
    const source = `export function identity<T>(value: Box<T>): T | ParseError, OverflowError {
    return error as { };
}`;
    const index = new SourceIndex(source, "file:///identity.delta");
    const identity = index.exportedSymbols().find((symbol) => symbol.name === "identity");
    assert(identity);
    assert.deepEqual(identity.typeParameters, ["T"]);
    assert.deepEqual(identity.errorTypes, ["ParseError", "OverflowError"]);
    assert.match(identity.signature ?? "", /identity<T>/);
    assert.match(identity.signature ?? "", /Box<T>/);
    assert.match(identity.signature ?? "", /ParseError, OverflowError/);
}

function testErrorResultIndexing() {
    const source = `type struct ParseError = { };
function parse<T>(value: T): T | ParseError { return value; }
function main(): int8 {
    const value = parse<int32>(1) as result;
    check result as ParseError { return 1; }
    return int8(value);
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
function main(): int8 {
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
function main(): int8 {
    const holder: Holder = Holder { counter: new Counter { value: 1 } };
    return int8(holder.counter.get());
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
    const source = `function main(): int8 {
    const doubleQuoted = "Anirban";
    const singleQuoted = 'Anirban';
    const empty = '';
    const character = 'A';
    const byteLength = singleQuoted.length;
    return int8(0);
}`;
    const index = new SourceIndex(source, "file:///strings.delta");

    const resolve = (name: string) => index.resolveAt(source.indexOf(name) + 1);
    assert.equal(resolve("doubleQuoted")?.type, "string");
    assert.equal(resolve("singleQuoted")?.type, "string");
    assert.equal(resolve("empty")?.type, "string");
    assert.equal(resolve("character")?.type, "char");
    assert.equal(resolve("byteLength")?.type, "uintsize");

    const compiled = compileSource(source, "strings.delta");
    assert.deepEqual(compiled.diagnostics, []);
}

function testWorkspaceImports(root: string) {
    const mathPath = path.join(root, "math.delta");
    const mainPath = path.join(root, "main.delta");
    fs.writeFileSync(
        mathPath,
        `export type struct Box<T> = { value: T };
export function identity<T>(value: T): T { return value; }
export const answer: int32 = 42;`,
    );
    fs.writeFileSync(mainPath, "function main(): int8 { return 0; }\n");

    const workspace = new WorkspaceIndex([root]);
    workspace.scan();
    const candidates = workspace.autoImports(mainPath);
    assert(candidates.some((candidate) => candidate.symbol.name === "identity"));
    assert(candidates.some((candidate) => candidate.symbol.name === "Box"));
    assert(candidates.some((candidate) => candidate.symbol.name === "answer"));

    const main = workspace.get(mainPath)!;
    assert.deepEqual(main.autoImportEdit("identity", "./math"), {
        start: 0,
        end: 0,
        newText: `import { identity } from "./math";\n`,
    });

    const importedSource = `import { Box } from "./math";
function main(): int8 {
    const value = identity<int32>(1);
    return int8(value);
}`;
    const imported = workspace.update(mainPath, importedSource);
    const edit = imported.autoImportEdit("identity", "./math");
    assert(edit);
    assert.equal(edit.newText, ", identity");

    const linkedSource = `import { identity } from "./math";
function main(): int8 { return int8(identity<int32>(1)); }`;
    const linked = workspace.update(mainPath, linkedSource);
    const useOffset = linkedSource.lastIndexOf("identity") + 1;
    const resolved = linked.resolveAt(useOffset);
    assert.equal(resolved?.name, "identity");
    assert.equal(resolved?.uri, new URL(`file://${mathPath}`).toString());
    assert.match(resolved?.signature ?? "", /identity<T>/);

    const objectSource = `import { Box } from "./math";
function main(): int8 {
    const box = Box<int32> { value: 1 };
    return 0;
}`;
    const objectIndex = workspace.update(mainPath, objectSource);
    const field = objectIndex.resolveAt(objectSource.indexOf("value: 1") + 1);
    assert.equal(field?.name, "value");
    assert.equal(field?.uri, new URL(`file://${mathPath}`).toString());
    assert.equal(field?.token.start, fs.readFileSync(mathPath, "utf8").indexOf("value"));
}

function testModuleAwareDiagnostics(root: string) {
    const errorsPath = path.join(root, "errors.delta");
    const mainPath = path.join(root, "program.delta");
    fs.writeFileSync(
        errorsPath,
        `export type struct MathError = { };
export function identity<T>(value: T): T | MathError { return value; }`,
    );
    const source = `import { MathError, identity } from "./errors";
function use(): int32 {
    const value = identity<int32>(1) as result;
    check result as MathError { return 0; }
    return value;
}
function main(): int8 { return int8(use()); }`;
    fs.writeFileSync(mainPath, source);
    const result = compileModuleSource(source, mainPath);
    assert.deepEqual(
        result.diagnostics.map((diagnostic) => diagnostic.message),
        [],
    );
}

function testExportModuleResolution(root: string) {
    const geometryPath = path.join(root, "geometry-implementation.delta");
    const toolkitPath = path.join(root, "toolkit-implementation.delta");
    const flatToolkitPath = path.join(root, "flat-toolkit.delta");
    const mainPath = path.join(root, "module-program.delta");
    fs.writeFileSync(
        geometryPath,
        `type Point = { x: int32; y: int32; };
function sum(point: &Point): int32 { return point.x + point.y; }
function (point: &Point) total(): int32 { return point.x + point.y; }
export module geometry;`,
    );
    fs.writeFileSync(
        toolkitPath,
        `import geometry as shapes from "./geometry-implementation";
function version(): int32 { return 1; }
export module toolkit;`,
    );
    fs.writeFileSync(
        flatToolkitPath,
        `import { Point, sum } from "./geometry-implementation";
export module calculations;`,
    );

    const aliased = `import geometry as shapes from "./geometry-implementation";
function main(): int8 {
    const point: shapes.Point = shapes.Point { x: 20, y: 22 };
    return int8(shapes.sum(&point));
}`;
    assert.deepEqual(
        compileModuleSource(aliased, mainPath).diagnostics.map((error) => error.message),
        [],
    );

    const direct = `import geometry from "./geometry-implementation";
function main(): int8 {
    const point: geometry.Point = geometry.Point { x: 20, y: 22 };
    return int8(point.total());
}`;
    assert.deepEqual(
        compileModuleSource(direct, mainPath).diagnostics.map((error) => error.message),
        [],
    );

    const selective = `import { Point, sum } from "./geometry-implementation";
function main(): int8 {
    const point: Point = Point { x: 20, y: 22 };
    return int8(sum(&point));
}`;
    assert.deepEqual(
        compileModuleSource(selective, mainPath).diagnostics.map((error) => error.message),
        [],
    );

    const nested = `import toolkit as tools from "./toolkit-implementation";
function main(): int8 {
    const point: tools.shapes.Point = tools.shapes.Point { x: 20, y: 22 };
    return int8(tools.shapes.sum(&point));
}`;
    assert.deepEqual(
        compileModuleSource(nested, mainPath).diagnostics.map((error) => error.message),
        [],
    );

    const flat = `import calculations as api from "./flat-toolkit";
function main(): int8 {
    const point: api.Point = api.Point { x: 20, y: 22 };
    return int8(api.sum(&point));
}`;
    assert.deepEqual(
        compileModuleSource(flat, mainPath).diagnostics.map((error) => error.message),
        [],
    );

    const mismatch = `import arithmetic from "./geometry-implementation";
function main(): int8 { return 0; }`;
    assert(
        compileModuleSource(mismatch, mainPath).diagnostics.some((error) =>
            error.message.includes("does not match declared module `geometry`"),
        ),
    );

    const explicitOnlyPath = path.join(root, "explicit-only.delta");
    fs.writeFileSync(explicitOnlyPath, "export function value(): int32 { return 1; }");
    const missingDeclaration = `import values from "./explicit-only";
function main(): int8 { return 0; }`;
    assert(
        compileModuleSource(missingDeclaration, mainPath).diagnostics.some((error) =>
            error.message.includes("module namespace import requires"),
        ),
    );

    assert(
        compileSource(
            "export module misplaced;\nfunction main(): int8 { return 0; }",
            "misplaced-module.delta",
        ).diagnostics.some((error) => error.message.includes("must be the final")),
    );

    const unknownMember = `import geometry from "./geometry-implementation";
function main(): int8 { return int8(geometry.missing()); }`;
    assert(
        compileModuleSource(unknownMember, mainPath).diagnostics.some((error) =>
            error.message.includes("has no exported member `missing`"),
        ),
    );

    const moduleValue = `import geometry from "./geometry-implementation";
function main(): int8 { const value = geometry; return 0; }`;
    assert(
        compileModuleSource(moduleValue, mainPath).diagnostics.some((error) =>
            error.message.includes("is not a runtime value"),
        ),
    );
}

function testExportModuleCodegen(root: string) {
    const projectRoot = path.join(root, "module-codegen");
    fs.mkdirSync(projectRoot);
    const geometryPath = path.join(projectRoot, "geometry-implementation.delta");
    const toolkitPath = path.join(projectRoot, "toolkit-implementation.delta");
    const mainPath = path.join(projectRoot, "main.delta");
    fs.writeFileSync(
        geometryPath,
        `type Point = { x: int32; y: int32; };
function sum(point: &Point): int32 { return point.x + point.y; }
export module geometry;`,
    );
    fs.writeFileSync(
        toolkitPath,
        `import geometry as shapes from "./geometry-implementation";
export module toolkit;`,
    );
    fs.writeFileSync(
        mainPath,
        `import toolkit from "./toolkit-implementation";
function main(): int8 {
    const point: toolkit.shapes.Point = toolkit.shapes.Point { x: 20, y: 22 };
    return int8(toolkit.shapes.sum(&point));
}`,
    );
    const result = buildProject(mainPath);
    assert.deepEqual(
        result.diagnostics.map((error) => error.message),
        [],
    );
    assert.equal(result.error, undefined);
    assert(result.binaryPath);
    let exitCode = 0;
    try {
        execFileSync(result.binaryPath);
    } catch (error: any) {
        exitCode = error.status;
    }
    assert.equal(exitCode, 42);
}

function testGenericFallibleMethodProjectCodegen(root: string) {
    const projectRoot = path.join(root, "generic-fallible-method");
    fs.mkdirSync(projectRoot);
    const mainPath = path.join(projectRoot, "main.delta");
    fs.writeFileSync(
        mainPath,
        `type struct List<T> = { data: T[]; length: uintsize; };
type struct OutOfRangeError = {};
function (list: &List<T>) at<T>(index: uintsize): T | OutOfRangeError {
    if (index >= list.length) { return error as OutOfRangeError{}; }
    return list.data[index];
}
function main(): int8 {
    const values: int32[] = [1, 2, 4, 5];
    const list = List<int32>{ data: values, length: values.length };
    const value = list.at(uintsize(3)) as result;
    check result { return int8(-1); }
    return int8(value);
}`,
    );
    const result = buildProject(mainPath);
    assert.deepEqual(
        result.diagnostics.map((error) => error.message),
        [],
    );
    assert.equal(result.error, undefined);
    assert(result.binaryPath);
    let exitCode = 0;
    try {
        execFileSync(result.binaryPath);
    } catch (error: any) {
        exitCode = error.status;
    }
    assert.equal(exitCode, 5);
}

function testNamespaceImportIndexing(root: string) {
    const modulePath = path.join(root, "namespace-math.delta");
    const toolkitPath = path.join(root, "namespace-toolkit.delta");
    const mainPath = path.join(root, "namespace-main.delta");
    fs.writeFileSync(
        modulePath,
        `function add(a: int32, b: int32): int32 { return a + b; }
export module math;`,
    );
    fs.writeFileSync(
        toolkitPath,
        `import math as arithmetic from "./namespace-math";
export module toolkit;`,
    );
    const source = `import math as numbers from "./namespace-math";
function main(): int8 { return int8(numbers.add(20, 22)); }`;
    fs.writeFileSync(mainPath, source);
    const workspace = new WorkspaceIndex([root]);
    workspace.scan();
    const index = workspace.get(mainPath)!;
    const memberOffset = source.lastIndexOf("add") + 1;
    assert.equal(index.resolveAt(memberOffset)?.name, "add");
    const bindingOffset = source.lastIndexOf("numbers.add") + 1;
    assert.equal(index.resolveAt(bindingOffset)?.signature, "export module math");
    assert.equal(index.resolveAt(bindingOffset)?.token.value, "math");
    assert.equal(index.resolveAt(bindingOffset)?.uri?.endsWith("namespace-math.delta"), true);
    const completionOffset = source.indexOf("numbers.") + "numbers.".length;
    assert(index.completions(completionOffset).some((symbol) => symbol.name === "add"));

    const unaliasedSource = `import math from "./namespace-math";
function main(): int8 { return int8(math.add(20, 22)); }`;
    const unaliased = workspace.update(mainPath, unaliasedSource);
    const unaliasedBindingOffset = unaliasedSource.lastIndexOf("math.add") + 1;
    assert.equal(unaliased.resolveAt(unaliasedBindingOffset)?.signature, "export module math");
    assert(
        unaliased
            .completions(unaliasedSource.indexOf("math.") + "math.".length)
            .some((symbol) => symbol.name === "add"),
    );

    const nestedSource = `import toolkit as tools from "./namespace-toolkit";
function main(): int8 { return int8(tools.arithmetic.add(20, 22)); }`;
    const nested = workspace.update(mainPath, nestedSource);
    const nestedMemberOffset = nestedSource.lastIndexOf("add") + 1;
    assert.equal(nested.resolveAt(nestedMemberOffset)?.name, "add");
}

function testImportPathAliases(root: string) {
    const projectRoot = path.join(root, "alias-project");
    const sourceRoot = path.join(projectRoot, "src");
    const libraryRoot = path.join(sourceRoot, "library");
    const manifestPath = path.join(projectRoot, "delta.json");
    const mathPath = path.join(libraryRoot, "arithmetic.delta");
    const mainPath = path.join(sourceRoot, "main.delta");
    fs.mkdirSync(libraryRoot, { recursive: true });
    fs.writeFileSync(
        manifestPath,
        JSON.stringify(
            {
                name: "alias-project",
                entry: "src/main.delta",
                dependencies: {
                    "@library": "src/library",
                    "@arithmetic": "src/library/arithmetic",
                },
            },
            null,
            2,
        ),
    );
    fs.writeFileSync(
        mathPath,
        `function add(left: int32, right: int32): int32 { return left + right; }
export module math;`,
    );
    const source = `import math as numbers from "@library/arithmetic";
function main(): int8 { return int8(numbers.add(20, 22)); }`;
    fs.writeFileSync(mainPath, source);

    const result = buildProject(projectRoot);
    assert.deepEqual(
        result.diagnostics.map((diagnostic) => diagnostic.message),
        [],
    );
    assert.equal(result.error, undefined);
    assert(result.binaryPath);
    let exitCode = 0;
    try {
        execFileSync(result.binaryPath);
    } catch (error: any) {
        exitCode = error.status;
    }
    assert.equal(exitCode, 42);

    const exactAlias = `import math from "@arithmetic";
function main(): int8 { return int8(math.add(20, 22)); }`;
    assert.deepEqual(
        compileModuleSource(exactAlias, mainPath).diagnostics.map(
            (diagnostic) => diagnostic.message,
        ),
        [],
    );
    const namedAlias = `import { add } from "@arithmetic";
function main(): int8 { return int8(add(20, 22)); }`;
    assert.deepEqual(
        compileModuleSource(namedAlias, mainPath).diagnostics.map(
            (diagnostic) => diagnostic.message,
        ),
        [],
    );

    const workspace = new WorkspaceIndex([projectRoot]);
    workspace.scan();
    const index = workspace.get(mainPath)!;
    assert.equal(index.resolveAt(source.lastIndexOf("add") + 1)?.name, "add");
    const completionPath = path.join(sourceRoot, "completion.delta");
    fs.writeFileSync(completionPath, "function main(): int8 { return 0; }\n");
    workspace.refresh(completionPath);
    assert(
        workspace
            .autoImports(completionPath)
            .some(
                (candidate) =>
                    candidate.symbol.name === "add" && candidate.importPath === "@arithmetic",
            ),
    );
    fs.writeFileSync(
        manifestPath,
        JSON.stringify({
            name: "alias-project",
            entry: "src/main.delta",
            dependencies: {
                "@library": "src/library",
                "@math": "src/library/arithmetic",
            },
        }),
    );
    workspace.refresh(manifestPath);
    assert(
        workspace
            .autoImports(completionPath)
            .some(
                (candidate) => candidate.symbol.name === "add" && candidate.importPath === "@math",
            ),
    );

    const stdSource = `import { missing } from "@std/missing";
function main(): int8 { return 0; }`;
    assert(
        compileModuleSource(stdSource, mainPath).diagnostics.some((diagnostic) =>
            diagnostic.message.includes("unknown standard library module `@std/missing`"),
        ),
    );
    const unknownSource = `import { missing } from "@unknown/missing";
function main(): int8 { return 0; }`;
    assert(
        compileModuleSource(unknownSource, mainPath).diagnostics.some((diagnostic) =>
            diagnostic.message.includes("unknown import root `@unknown/missing`"),
        ),
    );

    const reservedRoot = path.join(root, "reserved-alias-project");
    fs.mkdirSync(path.join(reservedRoot, "src"), { recursive: true });
    fs.writeFileSync(
        path.join(reservedRoot, "delta.json"),
        JSON.stringify({
            entry: "src/main.delta",
            dependencies: { "@std": "src/stdlib" },
        }),
    );
    fs.writeFileSync(
        path.join(reservedRoot, "src", "main.delta"),
        "function main(): int8 { return 0; }\n",
    );
    assert.match(buildProject(reservedRoot).error ?? "", /dependency `@std` is reserved/);
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
        "function main(): int8 { return missing; }",
        "missing",
        /unknown identifier/,
    );
    assertDiagnosticSpan(
        "function main(): int8 { const value: int32 = true; return 0; }",
        "true",
        /type mismatch/,
    );
    assertDiagnosticSpan(
        "function test(): bool { return 1 && 2; } function main(): int8 { return 0; }",
        "&&",
        /expects bool operands/,
    );
    assertDiagnosticSpan(
        "type Box = { value: int32; }; function main(): int8 { const box: Box = { value: true }; return 0; }",
        "true",
        /value of member value/,
    );
    assertDiagnosticSpan(
        "type Box = { value: int32; }; function main(): int8 { const box: Box = { value: 1, extra: 2 }; return 0; }",
        "extra",
        /unknown fields/,
    );
    assertDiagnosticSpan(
        "type Box = { value: int32; }; function read(box: &Box): int32 { return box.missing; } function main(): int8 { return 0; }",
        "missing",
        /has no member/,
    );
    assertDiagnosticSpan(
        "function main(): int8 { let value int32 = 1; return 0; }",
        "int32",
        /: expected/,
    );

    const modulePath = path.join(root, "missing-import.delta");
    const importSource = 'import { value } from "./missing";\nfunction main(): int8 { return 0; }';
    const missingModule = compileModuleSource(importSource, modulePath, () => undefined);
    const importDiagnostic = missingModule.diagnostics.find((diagnostic) =>
        diagnostic.message.includes("cannot find module"),
    );
    assert(importDiagnostic);
    assert.equal(
        importSource.slice(importDiagnostic.position.start, importDiagnostic.position.end),
        '"./missing"',
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
    testErrorResultIndexing();
    testObjectLiteralFieldDefinitions();
    testReceiverFunctionIndexing();
    testStringLiteralIndexing();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "delta-lsp-"));
    try {
        testWorkspaceImports(root);
        testModuleAwareDiagnostics(root);
        testExportModuleResolution(root);
        testExportModuleCodegen(root);
        testGenericFallibleMethodProjectCodegen(root);
        testNamespaceImportIndexing(root);
        testImportPathAliases(root);
        testDiagnosticPositions(root);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
    console.log("LSP tests passed");
}

main();
