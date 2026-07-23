# Plan: Delta C Codegen v0

Date drafted: 2026-06-02
Status: planning, not started.
Predecessor: the semantic analyzer in [internal/semantics/](../../internal/semantics/) — return-coverage analysis and annotation-driven inference are the last gates this plan depends on.

## Goal

Turn a single-file Delta program that passes semantic analysis into a runnable executable by emitting C and invoking Clang. The deliverable is:

```bash
$ delta build hello.delta
$ ./build/hello
$ echo $?
42
```

…where `42` is whatever the user's `main()` returned. That's the entire success criterion. No optimization story, no multi-file, no name mangling, no fallible-return shape, no ownership lowering. v0 is a probe that proves the back end can produce a working binary at all and lights the path for the larger story in [§2 of the spec](../spec-sections/02-compilation-pipeline.md).

Done correctly, v0 also doubles as the executable proof that the front end's types are sound: the only reason a passing-analyzer program could fail to compile under Clang is a codegen bug, which surfaces as an internal compiler error.

## In-scope language surface (what the analyzer accepts today)

- File-scope `const` with primitive initializer.
- `function` declarations with parameters and a single declared return type (`int32`, `bool`, or `void`).
- Local `const` and `let` with annotated or inferred type.
- `if`/`else` and `while` blocks.
- `return` of a single value (or no value, for `void`).
- Assignment to `let` bindings.
- Integer and boolean literal expressions.
- Identifier references (locals, params, file consts, function names as call targets).
- Unary `!`, `-`.
- Binary arithmetic (`+`, `-`, `*`, `/`), comparison (`<`, `<=`, `>`, `>=`, `==`, `!=`), and logical (`&&`, `||`).
- Function calls in expression and statement position, including calls of void-returning functions.

This is exactly the subset the existing `test-source/tests/typecheck/` and `test-source/tests/basic/` suites exercise.

## Explicitly out of scope for v0

| Feature | Reason | Eventual home |
|---|---|---|
| Multi-return functions | Analyzer rejects in expression position; can't be observed today. Plumbing struct returns now would be wasted. | A later codegen pass once destructuring or `as result` lands. |
| Declared error types (`int32 \| IOError`) | Analyzer parses them but does not validate them. Codegen rejects them as "not yet supported." | After error-state analysis ([§2.1](../spec-sections/02-compilation-pipeline.md) stage 5). |
| `string`, `char` literals at runtime | No operations exist on them; no observable use case. | When string/array support lands. |
| Bundled Clang | [§2.2](../spec-sections/02-compilation-pipeline.md) — defer until we have a release process. | Post-MVP. |
| Name mangling | [§2.3](../spec-sections/02-compilation-pipeline.md) — no symbol collisions possible in a single TU with a unique-name analyzer. | When modules / multi-file lands. |
| Incremental compilation, parallel codegen, `.delta-meta` | Single file, single TU. Nothing to incrementalize. | [§2.7](../spec-sections/02-compilation-pipeline.md), [§2.11](../spec-sections/02-compilation-pipeline.md). |
| LTO, release/debug modes, sanitizers, determinism flags | Premature — first we need a binary at all. | Post-v0, before any "real" build story. |
| Floating-point | Not in the type system today. | Phase 5 follow-up. |
| Standard library, `print`, I/O | Nothing exists to call. | After the FFI / extern-C story. |

If the user's program uses any out-of-scope construct that the analyzer happens to accept, codegen emits a structured "unsupported in codegen v0" diagnostic at the offending position and fails the build *before* invoking Clang.

## What's missing today

- No codegen package exists. `internal/codegen/` is empty.
- `pipeline.Compile` returns `Result{File, ErrorBag}` and stops there. There is no `Build` entry point.
- `cmd/delta/main.go` handles `delta build <file>` by running the pipeline and printing the AST. That behavior has to move to a new `delta dump-ast <file>` subcommand or be removed.
- The test runner under `delta test <suite>` checks front-end pass/fail with `contains` / `error_count`. It has no notion of "compile this, run the binary, check the exit code." A small extension to the test JSON schema is part of this plan.
- There is no place to find Clang — no toolchain probe, no PATH search, no error message for the missing-clang case.

## Decisions already made

- **Generate one `.c` per `.delta` source.** Aligns with [§2.4](../spec-sections/02-compilation-pipeline.md), even though v0 only ever has one file. Same shape now means no rewrite later.
- **Output under `build/c/` next to the source's project root.** Spec uses `build/<mode>/c/`; v0 hardcodes a single mode (call it `debug`) and skips the mode subdirectory. Final binary lands at `build/<basename>`.
- **No name mangling.** The Delta function `foo` becomes C `foo`. Safe because v0 has one TU and the analyzer rejects duplicate identifiers. Reserved for the day modules arrive.
- **Use host Clang from `PATH`.** No `DELTA_CC` env var yet — just look up `clang` once at build time and fail with a clear "Clang not found on PATH" error if missing. The bundled-toolchain story in [§2.2](../spec-sections/02-compilation-pipeline.md) is deferred whole.
- **Emit `#line` directives at statement boundaries.** [§2.8](../spec-sections/02-compilation-pipeline.md) is unconditional in the spec, and skipping it now means every Clang error during codegen-development debugging points at the wrong file. Cheap to do at codegen time; expensive to retrofit through DWARF later.
- **Fail closed on unsupported constructs.** If codegen sees a multi-return signature, an error-typed signature, or any expression form it doesn't handle, it emits a structured diagnostic at the source position and aborts the build. Never silently emit `// TODO` C that mysteriously compiles into something wrong.
- **The current `delta build <file>` AST-print behavior moves to `delta dump-ast <file>`.** Anyone scripting against AST output gets a one-line migration; everyone else gets the build behavior they'd expect from `delta build`.
- **Treat Clang's failure on valid-Delta input as an ICE.** Matches [§2.10](../spec-sections/02-compilation-pipeline.md). If clang exits non-zero on codegen output, surface clang's stderr verbatim along with a "this is a codegen bug, please report" header.

## Architecture

```
              ┌──────────────────────┐
delta build ─▶│ cmd/delta/main.go    │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ pipeline.Build       │
              │  1. Compile (lex,    │
              │     parse, semantic) │
              │  2. Codegen          │
              │  3. WriteC           │
              │  4. InvokeClang      │
              │  5. ReturnBinary     │
              └──────────┬───────────┘
                         │
              ┌──────────┼────────────┐
              ▼          ▼            ▼
        ┌─────────┐ ┌─────────┐ ┌──────────┐
        │ semantics│ │ codegen │ │ toolchain│
        │ Analyzer │ │ Emitter │ │  Clang   │
        └─────────┘ └─────────┘ └──────────┘
```

`Emitter` is the only new package. It depends on `ast` (for the tree) and `semantics` (for resolved types on expressions, so it doesn't have to re-infer). It does **not** depend on the analyzer's `Refs` map — every identifier the emitter sees is being emitted into a TU where it'll resolve by name, so position-keyed maps aren't needed. The analyzer's role is just to have already filtered out everything codegen can't handle.

## Type mapping

| Delta type | C type | Header |
|---|---|---|
| `int32` | `int32_t` | `<stdint.h>` |
| `bool` | `bool` | `<stdbool.h>` |
| `void` | `void` | — |
| `string`, `char` | rejected by codegen v0 | — |

No typedefs or runtime header in v0 — every generated `.c` file gets:

```c
#include <stdint.h>
#include <stdbool.h>
```

…and nothing else. A `delta_runtime.h` arrives the first time we need a helper that can't be inlined trivially.

## Statement mapping

| Delta | C |
|---|---|
| `const x: T = expr;` (local) | `const T x = expr;` |
| `let x: T = expr;` (local) | `T x = expr;` |
| `x = expr;` | `x = expr;` |
| `return expr;` | `return expr;` |
| `return;` (void function) | `return;` |
| `if (c) { ... } else { ... }` | `if (c) { ... } else { ... }` |
| `while (c) { ... }` | `while (c) { ... }` |
| `BlockStatement` | `{ ... }` |
| Comment | dropped from output (debug-builds may keep them later) |
| Expression statement | `expr;` |

The body of every function is wrapped in `{ ... }` regardless of statement count — never elide braces.

## Expression mapping

| Delta | C |
|---|---|
| Integer literal `42` | `42` (no suffix; analyzer guarantees it fits `int32_t`) |
| Boolean literal `true` / `false` | `true` / `false` |
| Identifier `x` | `x` |
| `-x`, `!x` | `(-x)`, `(!x)` |
| `a op b` (binary) | `(a op b)` |
| `f(a, b)` | `f(a, b)` |

Always parenthesize unary and binary expressions. Even though the analyzer already preserves Delta-side precedence in the AST shape, emitting parentheses everywhere costs nothing and removes any C-side precedence ambiguity (`<<` vs `<`, `==` vs `=` typos, etc).

## File-scope const lowering

```delta
const limit: int32 = 100;
const enabled: bool = true;
```

becomes:

```c
static const int32_t limit = 100;
static const bool enabled = true;
```

`static` so the symbol doesn't leak across TUs once multi-file lands; `const` so Clang treats it as a real constant and folds reads.

Const initializers in v0 must be either a literal or a binary/unary expression over literals and other file consts — the analyzer already constrains this. A reference to a function in an initializer slot would be caught by the analyzer (functions aren't values), so codegen doesn't have to defend against it.

## Function lowering

```delta
function add(a: int32, b: int32): int32 {
    return a + b;
}
```

becomes:

```c
int32_t add(int32_t a, int32_t b);   /* forward declaration */

int32_t add(int32_t a, int32_t b) {
    return (a + b);
}
```

Forward declarations for every function are emitted in source order at the top of the `.c` file, *before* file-scope consts and bodies. This makes definition order irrelevant — the analyzer's forward-reference support stays meaningful at codegen time.

A function declared `void` returns `void` in C and is permitted to omit a trailing `return;`.

## Entry point

The user's `function main(): int8` becomes:

```c
int32_t delta_main(void);

int main(void) {
    return (int)delta_main();
}

int32_t delta_main(void) {
    /* user body */
}
```

The wrapper exists because (a) `int` and `int32_t` are not the same type on every platform and (b) it gives the runtime a place to inject startup/teardown later without rewriting user code. The user's `main` is renamed `delta_main` only at the C level — Delta source sees `main`.

If the source has no `main`, or `main` has parameters, or `main` does not return `int8`, codegen emits a diagnostic and stops. The exact validation rules belong in the analyzer eventually ([§1.5](../spec-sections/01-source-file-convention.md)) but v0 codegen enforces them at the codegen boundary.

## Source mapping (`#line`)

Every statement is preceded by `#line N "src.delta"` where `N` is the statement's line number and the path is project-relative. Function and const definitions get a `#line` directive on their declaration line. The file opens with `#line 1 "src.delta"` for headers / preamble that has no Delta origin.

This is enough for Clang errors during codegen development to point at Delta source. DWARF integration and `-fdebug-prefix-map=` plumbing is deferred until the toolchain is bundled.

## CLI behavior

After v0:

- `delta build <file>` → runs the pipeline, emits C under `build/c/`, invokes Clang, writes the executable to `build/<basename>`. Prints front-end diagnostics on failure. On success, prints nothing.
- `delta dump-ast <file>` → the old `delta build` behavior. Runs the pipeline and prints the AST on success.
- `delta test <suite>` → unchanged for front-end suites; extended schema described below for the codegen suite.
- `delta lsp` → unchanged.

`delta build` exits 0 on success, 1 on any pipeline or Clang failure.

## Filesystem layout

```
project/
  hello.delta
  build/
    c/
      hello.c            # generated, internal
    hello                # final executable
```

`build/` is the only directory codegen writes to. Cleaning is `rm -rf build/`.

## Testing strategy

Add a new test suite `test-source/tests/codegen/` that exercises the full pipeline through to a running binary. The test runner extension:

```json
{
  "file": "return_const_ok.delta",
  "expect": "pass",
  "exit_code": 42,
  "note": "main returns a file-scope const"
}
```

Semantics:

- `"expect": "pass"` plus `"exit_code": N` means: build must succeed and the produced binary must exit with code N.
- `"expect": "fail"` with `"contains"` keeps its current meaning (front-end diagnostic).
- A new `"expect": "build_fail"` plus `"contains"` covers the codegen-rejects-unsupported-construct case (analyzer says OK, codegen says no).

Initial fixtures to land with the implementation:

| File | Notes |
|---|---|
| `return_literal_ok.delta` | `function main(): int8 { return 42; }` → exit 42 |
| `arith_ok.delta` | `return 10 + 20 * 2 - 5;` → exit 45 |
| `if_else_ok.delta` | `if (true) { return 1; } else { return 2; }` → exit 1 |
| `while_sum_ok.delta` | sum 1..10 with a while loop → exit 55 |
| `call_ok.delta` | main calls helper functions → exit known value |
| `file_const_ok.delta` | file-scope const referenced in main → exit value of const |
| `bool_branch_ok.delta` | bool param, logical ops, branching → exit value |
| `void_helper_ok.delta` | void-returning helper invoked for its effect (assignment) → exit value |
| `multi_return_codegen_err.delta` | analyzer-clean multi-return function → codegen rejects |
| `error_sig_codegen_err.delta` | analyzer-clean error-typed signature → codegen rejects |

Each test compiles, runs the resulting binary, and asserts on exit code. No stdout assertions yet (nothing to print).

## Stage-by-stage implementation order

1. **Toolchain probe.** New file `internal/toolchain/clang.go`: locates `clang` on `PATH`, caches the result, returns a structured error if missing. No tests beyond a smoke test on the host.
2. **Codegen skeleton.** New package `internal/codegen/`. Entry point `Emit(file ast.File, sig SymbolTable) ([]byte, *ErrorBag)`. First milestone: emit a valid empty TU containing only `#include`s and a `main` stub. Verify it compiles with Clang.
3. **Function lowering, no statements.** Add forward decls and empty-body functions. Confirm the analyzer's recorded signatures match what the emitter produces.
4. **Return statements + integer expressions.** Now `function main(): int8 { return 42; }` compiles and runs end-to-end. This is the milestone where the rest of the work is just filling in more node types.
5. **All remaining expressions and statements** in the order: literals, identifiers, unary, binary, function calls, var decls + assignments, if/else, while.
6. **File-scope consts.**
7. **Source mapping (`#line`).** Easy to add once everything else works; deliberately last so debugging earlier stages doesn't get crowded with directive noise.
8. **Pipeline integration.** Add `pipeline.Build` that chains `Compile → Emit → write file → invoke Clang`. Wire it into `cmd/delta/main.go`. Move the AST-print path to `delta dump-ast`.
9. **Test-runner extension.** Add `exit_code` and `build_fail` support to the existing harness.
10. **Codegen test suite.** Land the fixtures listed above.
11. **Unsupported-construct rejection.** Add the codegen-side guards (multi-return, error-typed signatures, string/char literals) with structured diagnostics, plus their negative tests.

Steps 1–4 are the risky milestone; steps 5–11 are mechanical fill-in.

## Risks and open questions

- **Which Clang flags?** v0 needs the bare minimum: `-std=c11`, `-Wall`, `-Werror=implicit-function-declaration` (catches missing forward-decls early during development), `-o <output>`. No `-O` level — debug builds default to `-O0`. Open: do we want `-Werror` globally? Probably not — a Clang warning on our generated C is a codegen bug, but turning it into a hard failure means every Clang version drift is a release-blocker. Argue: warnings-to-stderr, no -Werror, file an issue against the codegen.
- **What does the `bool` ABI actually look like?** `_Bool` and `<stdbool.h>`'s `bool` are not always the same width across platforms; comparing `bool` return values to `0` should work, but if we ever pass `bool` through generic helpers we'll need to be careful. v0 only uses `bool` as locals and return values, so the issue is contained.
- **Integer overflow on `int32_t`.** Delta's spec ([§5](../spec-sections/05-primitive-numeric-types.md)) commits to defined wrapping semantics, but C signed-integer overflow is UB. The right answer is `-fwrapv` on the Clang command line — cheap and correct. Worth confirming the spec before committing.
- **Should `delta build` rebuild `build/c/<file>.c` if it's already up to date?** No — v0 is unconditional. Incremental work is [§2.7](../spec-sections/02-compilation-pipeline.md).
- **How do we test on machines without Clang?** The codegen unit tests run without Clang (they assert on emitted bytes). The codegen integration suite is opt-out: if Clang isn't on `PATH`, the suite skips with a warning rather than failing CI.
- **Where do the source `#line` paths point — relative to project root, or relative to CWD?** Project-relative, per [§2.9](../spec-sections/02-compilation-pipeline.md). For v0 with a single file passed on the command line, "project root" is the directory containing the source file. That generalizes cleanly when `delta.json` arrives.
- **What's the long-term home of the entry-point shim?** Today it's emitted into the user's generated `.c`. When the runtime header lands, the wrapper moves into `delta_runtime.c` and the user's TU only exports `delta_main`.

## Definition of done for v0

- `delta build hello.delta` produces an executable for any program in `test-source/tests/typecheck/*_ok.delta` and `test-source/tests/basic/*_ok.delta`, and the executable's exit code matches the user's `main` return value.
- All codegen-suite tests pass on a machine with Clang on `PATH`.
- Programs that pass the analyzer but use unsupported codegen constructs fail with a clear diagnostic — never silently produce wrong code.
- A Clang failure on valid Delta input surfaces as an ICE with the generated source preserved under `build/c/` for inspection.

That's the v0 contract. Anything else — debug info, multi-file, runtime, generics, ownership — is a deliberate non-goal and tracked in [§2 of the spec](../spec-sections/02-compilation-pipeline.md).
