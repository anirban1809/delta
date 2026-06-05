# Plan: Phase I — Multi-file Modules (v0.5)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: the v0 baseline ([compiler-status.md](../../compiler-status.md)). Phase I is the **first** phase of v0.5a.
Successor: Phase D depends on this landing because `std/log` (Phase J) imports `extern "c"`, and Phases A/B/C/E all benefit from being able to factor code across files.
Spec basis: [spec-sections/01-source-file-convention.md](../../spec-sections/01-source-file-convention.md), [spec-sections/02-compilation-pipeline.md](../../spec-sections/02-compilation-pipeline.md).

## Goal

Promote the compiler from "single .delta file in, single binary out" to "a graph of .delta files in, single binary out." After Phase I:

```bash
$ delta build main.delta    # main.delta imports ./util.delta
$ ./build/main
```

…works for any acyclic graph of user modules connected by `./relative` import paths. The `std/...` resolver is wired so future phases can drop stdlib modules in with no further plumbing, but no stdlib modules ship yet (`std/log` lands in Phase J).

## In-scope language surface

- `export` modifier on top-level `function` and `const` declarations. Non-`export` decls are module-private.
- `import { Name1, Name2 } from "./relative/path";` — relative paths only, must start with `./` or `../`.
- `import { Name } from "std/...";` — resolves against the embedded stdlib FS (the resolver lands here; Phase J populates the content).
- Module identity tied to file path relative to the project root (the directory of the entry file passed to `delta build`).
- Cycle detection in the module graph (error with cycle trace).
- Importing a non-exported name is a structured diagnostic.
- Importing a name that does not exist in the source module is a structured diagnostic.
- Bare paths (anything not starting with `./`, `../`, or `std/`) are rejected with "unknown import root."

## Explicitly out of scope for Phase I

| Feature | Reason | Eventual home |
|---|---|---|
| `import { Name as Local }` rename form | Goal-doc non-goal. | Post-v0.5. |
| `import * as ns from "..."` namespace form | Goal-doc non-goal. | Post-v0.5. |
| Re-exports (`export { Name } from "...";`) | Goal-doc non-goal. | Post-v0.5. |
| `delta.json` manifest, custom project roots | Entry-file discovery is the only project mode. | Post-v0.5 (manifest pass tracked in compiler-status.md). |
| Third-party package roots (`npm:...`, vendored deps) | Only `./...`, `../...`, and `std/...`. | Far post-v0.5. |
| Incremental compilation, persistent module cache | Every build re-parses every module. | §2.7. |
| Actual stdlib content | Just the resolver in Phase I. | Phase J. |
| `export` on `class` / `type` declarations | Those declarations don't exist yet. | Folded into Phase E (`class`) and the later type-decl phase. |

## What's missing today

- Tokenizer has no `import`, `export`, or `from` keywords.
- Parser has no `ImportDeclaration` node, no `Exported` flag on top-level decls.
- `pipeline.Compile(name, contents)` operates on a single in-memory buffer. There's no module graph, no cross-file symbol table, no visibility check.
- Codegen emits one .c file per build. Function `foo` lowers to C `foo` — no mangling. The clang invocation in `internal/toolchain` takes one source file.
- `cmd/delta` reads one file from disk.
- There is no `internal/project/`, no `internal/stdlib/`, no concept of "project root."

## Decisions

1. **Module ID = file path relative to project root, separators replaced with `__`.** `./sub/util.delta` → module ID `sub__util`. The TU filename is `build/c/sub__util.c`. Module IDs are computed once during graph construction and threaded through codegen for mangling.
2. **Entry-file-relative root.** The directory of the file passed to `delta build` is the project root. All relative imports resolve against the importing file's directory; the project root only matters for module-ID computation. Once `delta.json` arrives, the manifest's `srcRoot` will override this.
3. **Stdlib lives in an embedded FS.** Phase I adds the `std/...` resolver wired against a `go:embed` directive pointing at a `stdlib/` directory in the repo. The directory is empty in Phase I; Phase J populates it. Imports against `std/...` that resolve to no file produce "unknown stdlib module" — same diagnostic shape as missing relative imports.
4. **One C TU per Delta module, name-mangled exports, single clang invocation.** Module-private decls are emitted `static`; exported decls get `delta__<module_id>__<name>` prefix. All TUs are passed to clang in one call: `clang <flags> -o build/<entry> build/c/main.c build/c/sub__util.c …`.
5. **Cross-module references use forward declarations inside each TU.** When module A imports `foo` from module B, A's generated TU opens with `extern T delta__b__foo(...)`. No header files; each TU is self-contained. Header files become useful when we want one TU to consume struct layouts from another — that's Phase E's problem.
6. **Cycle detection at graph-build time.** A back-edge during DFS produces "import cycle: a.delta → b.delta → a.delta", one file per arrow.
7. **`export` is parsed as a modifier, not a separate declaration form.** Same approach as TypeScript: a flag on the top-level decl AST node. Not exporting a name leaves it module-private.
8. **Imports must appear before any other top-level declaration.** This is a syntactic restriction with no semantic consequence — but it makes scanning the imports cheap for tooling and keeps the file readable. A diagnostic guides offenders.
9. **The single-file LSP path stays single-file.** `pipeline.Compile` for the language server continues to analyze a buffer in isolation. Cross-module references in an LSP buffer are reported as "unresolved" diagnostics. The "real" LSP module-aware story is post-v0.5.

## Tokenizer changes

- New reserved keywords: `import`, `export`, `from`. Add to the keyword table in [internal/token/token.go](../../../internal/token/token.go) and [internal/tokenizer/tokenizer.go](../../../internal/tokenizer/tokenizer.go).
- No new operators or literal forms.

## Parser changes

- New top-level node `ImportDeclaration`:
  ```go
  type ImportDeclaration struct {
      Specifiers []ImportSpecifier // each carries Name string + Position
      Path       string            // string literal value, quotes stripped
      Position   Position
  }
  ```
- `FunctionDeclaration` and `ConstDeclaration` grow an `Exported bool` flag.
- Parsing rule: top-level statements beginning with `import` produce `ImportDeclaration`; encountering an `import` after any non-import top-level declaration is a structured diagnostic "imports must precede other declarations."
- Top-level statements beginning with `export` produce a regular declaration with `Exported = true`. Only `function` and `const` may be exported in Phase I.

## `internal/project/` (new package)

Small package that owns project-root resolution and module-ID computation:

- `func Resolve(entryPath string) (*Project, error)` — verifies the entry is `.delta`, computes the project root, returns a `Project` whose `Root` and `EntryRelative` fields seed the graph walker.
- `func ModuleID(projectRoot, absPath string) string` — deterministic path-to-ID mapping; safe to use as a C identifier component (only `[a-zA-Z0-9_]`).

## `internal/stdlib/` (new package, scaffold only)

- `//go:embed stdlib/*` against a `stdlib/` directory at the repo root.
- `func Resolve(path string) (content []byte, found bool)` — looks up `std/foo` → `stdlib/foo.delta` in the embedded FS.
- Phase I ships an empty `stdlib/` directory; the package compiles but resolves nothing. Phase J populates it.

## Semantic analyzer changes

[internal/semantics/](../../../internal/semantics/) becomes module-aware:

- New top-level pass: `ModuleGraph` builder.
  - Input: entry file path.
  - For each unseen file, parse + run the existing single-file analyzer (which produces a `Module` value with its symbol table).
  - Resolve each `import` declaration to its source module by:
    1. Relative paths: resolved against the importer's directory.
    2. `std/...` paths: routed through `internal/stdlib.Resolve`.
    3. Anything else: "unknown import root."
  - Bind imported names into the importer's top scope as `SymbolImport` (pointing back to the source symbol).
  - Detect cycles via DFS coloring (white/gray/black). On a back-edge, report the full cycle path.
  - Result: an ordered `Project` value with all modules in topological order plus the per-module analyzer outputs.
- New symbol kind: `SymbolImport{Source Symbol; LocalName string; ImportPosition Position}`.
- Visibility check: when binding an `import`, look up the name in the source module's top scope; reject if not found or if `!Exported`.
- The existing `pipeline.Compile(name, contents)` keeps working for the LSP single-buffer path; a new `pipeline.CompileProject(entryPath)` is the entry for builds.

## Codegen changes

[internal/codegen/](../../../internal/codegen/):

- `Emit` becomes per-module. It takes a `Project` and a target module ID, emits that module's TU to a `[]byte`.
- Each TU opens with:
  - Standard includes (same as v0).
  - One forward declaration per imported function/const, using the mangled name.
  - Forward declarations for the module's own exported functions, mangled.
  - Forward declarations for the module's own private functions, unmangled but `static`.
- Definitions follow: file-scope consts, then function bodies.
- Mangling rule:
  - Exported: `delta__<module_id>__<name>` — e.g. `delta__counter__add`. Class methods/fields get more structure once Phase E lands.
  - Module-private: emitted with `static` storage class. The Delta-side name stays the same because `static` makes the C-level collision impossible across TUs.
- Entry shim: exactly one module in the graph may define `main`. Zero or two+ are structured errors. The chosen module's TU emits the C-level `int main()` wrapper around `delta_main`.

## Pipeline changes

- New `pipeline.BuildProject(entryPath) (*BuildResult, *ErrorBag)`:
  1. Resolve entry path → project root via `internal/project`.
  2. Build module graph (parse + analyze each file, detect cycles, check visibility).
  3. For each module in topological order, run codegen → write `build/c/<module-id>.c`.
  4. Locate clang via the existing toolchain probe.
  5. Invoke clang once with every generated .c file: `clang <flags> -o build/<entry-basename> build/c/*.c`.
  6. Return the binary path or surface diagnostics.

## Toolchain changes

`internal/toolchain.InvokeClang` accepts a slice of source files instead of one. The flag set is unchanged from v0.

## CLI changes

`delta build <file>` now treats `<file>` as the project entry. Behavior changes only for projects with imports — single-file projects produce the same artifact as v0. `delta dump-ast <file>` continues to dump a single file's AST. `delta lsp` continues to use the single-buffer `pipeline.Compile`.

## Filesystem layout

```
project/                        project/
  main.delta                      main.delta
  counter.delta                   sub/
  build/                            util.delta
    c/                            build/
      main.c                        c/
      counter.c                       main.c
    main                              sub__util.c
                                    main
```

## Testing strategy

New fixture format under `test-source/tests/codegen/projects/`. Each project is a directory:

```
test-source/tests/codegen/projects/two_module_ok/
  main.delta
  util.delta
  expected.json   # { "expect": "pass", "exit_code": 7 }
```

The runner walks the directory, runs `delta build main.delta`, and asserts on the result.

Initial fixtures:

- `two_module_ok/` — main imports an exported function from util, calls it.
- `nested_dir_ok/` — main imports `./sub/util`, exercises path normalization and module-ID encoding.
- `cycle_err/` — a.delta imports b.delta, b.delta imports a.delta; expect cycle diagnostic.
- `non_exported_err/` — util declares `add` without `export`; main imports it; expect visibility diagnostic.
- `missing_name_err/` — main imports a name util does not declare; expect "name not exported."
- `bare_path_err/` — main imports `"foo/bar"`; expect "unknown import root."
- `std_unknown_err/` — main imports `"std/nonexistent"`; expect "unknown stdlib module."
- `same_name_collision_ok/` — two modules each define a private `helper`; no collision because `static`.
- `import_after_decl_err/` — `function f() {}` then `import {...}`; expect "imports must precede other declarations."

## Stage-by-stage implementation order

1. **Tokenizer + parser**: keywords, `ImportDeclaration`, `Exported` flag on decls. Parser tests for accepted/rejected forms.
2. **`internal/project/`**: project-root resolution + module-ID computation. Unit-test deterministic module IDs for nested paths.
3. **Module graph builder** in `internal/semantics/`: parse + analyze each file once, resolve imports, detect cycles. No codegen yet; expose the project as a value.
4. **Cross-module symbol resolution**: `SymbolImport`, visibility check.
5. **Codegen rework**: per-module TU emission, mangling, forward declarations for cross-module references.
6. **Pipeline + CLI**: `BuildProject` entry point, clang invocation with multiple TUs.
7. **`internal/stdlib/` scaffold**: `go:embed` of an empty `stdlib/` directory, `std/...` path resolver.
8. **Fixture suite**: land all nine project fixtures.

Steps 1–2 are mechanical. Step 3 is the structural milestone (the analyzer becomes module-aware). Steps 4–6 ride on top.

## Risks and open questions

- **`pipeline.Compile` vs `BuildProject` divergence.** The LSP path stays single-file; the build path is project-aware. Risk that the two drift in invariants over time. Mitigation: `BuildProject` calls `pipeline.Compile` per file under the hood, so the inner loop is shared.
- **Symbol mangling stability.** Module IDs are derived from paths; renaming a directory changes the mangled name. Fine for v0.5 — we don't ship binaries across builds. Add a `// not ABI-stable across renames` comment to the codegen output.
- **Two private symbols sharing a name across TUs.** Both are `static`, so clang's linker never sees them. Tested by `same_name_collision_ok`.
- **Topological-order codegen.** Strictly speaking the order doesn't matter because every TU forward-declares what it references. Emit in topological order anyway so generated .c diffs are stable.
- **`SymbolImport` chains.** Re-exports aren't supported, but an `import` of an `import` is — does the chain bottom out? The visibility check resolves to the *original* declaration; if any link in the chain is non-exported, the import fails at that link.

## Definition of done

- `delta build` against a multi-file project produces a runnable binary whose exit code matches the fixture's expected value.
- All nine project fixtures pass.
- Single-file v0 fixtures continue to pass unchanged.
- Importing a non-exported, missing, or bare-path name yields a precise diagnostic with file:line:col.
- A cycle of any length is detected and reported with one file per arrow.
- The Phase D plan can begin without revisiting any module-graph decision.
