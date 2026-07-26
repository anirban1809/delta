# Delta

**NOTE**: This is the experimental branch of Delta, and should only be used for testing on non-critical data. This branch is prone to frequent breaking changes,
and may diverge from the main branch eventually.

A statically-typed, AOT-compiled systems programming language with TypeScript-like syntax. Delta lowers to inspectable C through Clang, and pairs ownership-based memory safety with a channel-style error model — no exceptions, no `Result<T, E>` wrappers, no hidden control flow.

> **Status:** pre-1.0, actively moving. The compiler runs the full pipeline end to end — a `.delta` file or project becomes a native executable, static library, or shared library. Records, receiver methods, generics, interfaces, ownership/borrow checking, the error channel, modules, C interop, packaging, and an LSP server all work today. See [Current status](#current-status).

---

## Design at a glance

| Area           | Delta's choice                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Surface syntax | TypeScript-like (`function`, `const`, `let`, `interface`, `switch`)                                               |
| Compilation    | AOT; lowers to C17, compiled and linked with `clang`                                                              |
| Types          | `type struct` records, `type enum` (i32-backed), `type union` (named payload variants), aliases                   |
| Memory         | Three ownership tiers inferred structurally; `move` / `clone`; `&T` and `edit &T` borrows; `owned<T>` indirection |
| Errors         | `Success \| ErrorType` returns, `as result` binding, `check` block, `forward` propagation                         |
| Interfaces     | Nominal `implements`, verified at compile time, monomorphized to direct C calls — no vtables                      |
| Generics       | Monomorphized type parameters, interface bounds (`<W: Writer>`), variadic type packs (`<...Args>`)                |
| Mutability     | Single axis — `const` vs `let`; borrow capability follows the binding                                             |
| Modules        | `import`/`export`, `export module` namespaces, `delta.json` manifest with path aliases                            |
| C interop      | `extern "c"`, `delta bindgen` over real headers, generated `.ffi.delta` interfaces                                |
| Toolchain      | `clang` from `PATH` (`-std=c17`); generated C is kept under `build/codegen/` for inspection                       |

The full design lives in [`docs/main-spec.md`](docs/main-spec.md), with expanded treatments under [`docs/spec-sections/`](docs/spec-sections/) and per-feature plans under [`docs/plans/`](docs/plans/).

---

## A taste of Delta

```delta
type struct ioerror = {
    code: int32
};

interface writer {
    function write(text: string): void | ioerror;
}

type struct counting_writer = {
    writes: int32
} implements writer;

function (w: edit &counting_writer) write(text: string): void | ioerror {
    w.writes = w.writes + 1;
    return;
}

function write_twice<W: writer>(w: edit &W, text: string): void | ioerror {
    w.write(text) as first;
    forward first;

    w.write(text) as second;
    forward second;
    return;
}

function main(): uint8 {
    let sink = counting_writer { writes: 0 };
    write_twice(sink, "delta") as result;
    check result {
        return 1;
    }
    return uint8(sink.writes);
}
```

Key things on display:

- **Interfaces are compile-time constraints.** `write_twice` states the behavior it needs (`W: writer`) instead of naming a concrete type. There is no interface value and no dynamic dispatch: the call compiles to a direct `delta__counting_writer_write(...)` inside a monomorphized `write_twice__counting_writer`.
- **Behavior attaches through receiver functions.** `function (w: edit &counting_writer) write(...)` declares its own receiver capability; the interface requirement does not.
- **Errors travel on a dedicated channel.** `| ioerror` sits after the success type. A fallible call must be bound with `as result`, then either discharged in a `check` block or propagated with `forward`.
- **Mutation is explicit.** `edit &` is the only way to write through a borrow, and a `const` binding cannot supply one.

---

## The compilation pipeline

Delta is designed around eight stages, each a pure function from its input to its output:

```
.delta sources
   │  1. lex
   ▼
token streams
   │  2. parse
   ▼
untyped ASTs
   │  3. semantic analysis  (typed AST + module interfaces)
   ▼
typed ASTs
   │  4. ownership & lifetime analysis
   ▼
ownership-checked ASTs
   │  5. checked error-state analysis
   ▼
fully-checked ASTs
   │  6. C codegen
   ▼
.c / .h under build/codegen/
   │  7. clang -c
   ▼
.o under build/obj/
   │  8. clang link  (or ar, for static libraries)
   ▼
artifact under build/
```

Stages 3–5 are currently implemented as a single analyzer pass rather than three separate passes: name resolution, type checking, ownership/move/borrow checking, and error-channel checking all run inside `src/analysis/`. Splitting them out is tracked in [`docs/plans/compiler-rule-architecture.md`](docs/plans/compiler-rule-architecture.md).

Targeting C (rather than LLVM IR directly) buys mature optimization, broad platform support, and inspectable codegen for debugging. Migrating to LLVM after 1.0 is the stated plan; the AST→codegen boundary is kept clean so that change stays additive.

---

## Current status

Working today, each covered by its own suite under [`test-source/tests/`](test-source/tests/):

- **Primitives** — full numeric set with trapping conversions, `bool`, `char`, `string`, floats.
- **Control flow** — `if`/`else`, `while`, `for`, `switch`, definite assignment, return coverage.
- **Records and behavior** — `type struct`/`enum`/`union`, spread/intersection composition, receiver methods with capability dispatch.
- **Ownership** — structural copyable/cloneable/unique tiers, `move`, `clone`, drop flags, `unique type` with `dispose`, `&T` / `edit &T` borrows with exclusivity checks, `owned<T>` heap indirection (older `heap<T>` spelling still accepted).
- **Errors** — `Success | ErrorType`, `as result`, `check`, `forward`, exhaustive handling checks.
- **Generics** — monomorphized functions and records, inference, interface bounds, variadic type packs.
- **Interfaces** — declared conformance, conformance diagnostics, bounded generic dispatch, per-specialization receiver-capability checks, erasure to direct C calls.
- **Arrays and slices** — fixed-size arrays, slices, indexing.
- **Modules** — multi-file graphs, selective and namespace imports, `export module`, manifest path aliases, and `@std/...` resolution against the directory named by the `DELTA_STD_LIB` environment variable.
- **C interop and packaging** — `extern "c"`, `delta bindgen` over C headers, generated `.ffi.delta` interfaces, static and dynamic library projects, `delta package` / `delta install`.
- **Tooling** — LSP server (`delta lsp`) with a bundled VS Code extension.

Not yet implemented:

- Dynamic dispatch (`dynamic Writer` interface objects, vtables, boxing) — deliberately deferred; see [`docs/plans/interfaces.md`](docs/plans/interfaces.md) §16.
- Generic type parameters on receiver methods (no inference or substitution yet), which also blocks interface bounds on receiver functions.
- Exporting generic functions through prebuilt packages (no generic ABI story yet).
- A standard library. No `std` modules ship with the compiler yet; `@std/...` imports resolve against whatever directory `DELTA_STD_LIB` points at. Collections, I/O, and allocator plans are drafts.
- The raw-pointer FFI story — `rawptr<T>` and the `unsafe` boundary are designed in [`docs/plans/interoperability-with-c.md`](docs/plans/interoperability-with-c.md) but not built; today's C interop goes through `extern "c"` and `delta bindgen`.
- Refinement types, `distinct` newtypes, `has states`, and units — see [`docs/plans/expressive-type-layer.md`](docs/plans/expressive-type-layer.md).
- The separate ownership/lifetime and error-state pipeline passes, plus the AST optimizer.

A feature-by-feature checkpoint lives in [`docs/compiler-status.md`](docs/compiler-status.md), but be aware that it predates the current compiler and still describes an earlier Go implementation. Parts of `docs/main-spec.md` are likewise behind — it still describes interfaces as _structural_ constraints spelled `extends`, whereas what shipped is nominal `implements` per [`docs/plans/interfaces.md`](docs/plans/interfaces.md). Where a plan document and the older spec text disagree, the plan and the test corpus are current.

### Roadmap

| Milestone                                                                     | Where it is specified                                                                                                          | Status                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| v0.5 — multi-file projects, records, receiver methods, ownership, error model | [`docs/compiler-goal-v0.5.md`](docs/compiler-goal-v0.5.md)                                                                     | largely landed                               |
| Interfaces with static dispatch                                               | [`docs/plans/interfaces.md`](docs/plans/interfaces.md)                                                                         | implemented; docs and LSP polish outstanding |
| Standard library — collections, I/O, memory                                   | [`std-collections`](docs/plans/std-collections.md), [`std-io`](docs/plans/std-io.md), [`std-memory`](docs/plans/std-memory.md) | draft                                        |
| Expressive type layer                                                         | [`docs/plans/expressive-type-layer.md`](docs/plans/expressive-type-layer.md)                                                   | draft / experimental                         |
| Rule-based analyzer architecture, AST optimizer                               | [`compiler-rule-architecture`](docs/plans/compiler-rule-architecture.md), [`ast-optimizer`](docs/plans/ast-optimizer.md)       | proposed                                     |
| v1.0 — self-hosting bootstrap                                                 | [`docs/compiler-goal-self-hosting.md`](docs/compiler-goal-self-hosting.md)                                                     | target                                       |

---

## Building and running

The compiler is written in TypeScript and runs on Node.js. `clang` must be on `PATH`.

```bash
npm install
npm run build          # tsc -> dist/
```

Compile a Delta program, then run the binary it produces under `build/`:

```bash
node dist/main.js build test-source/tests/errors/acceptance_program_ok.delta
```

The full CLI:

```
delta build [filename.delta | project-directory]
delta build --debug <filename.delta | project-directory>
delta bindgen <header> [symbol list] -o <file.ffi.delta>
delta package [project-directory]
delta install [package.tar]
delta init projectname
delta lsp
```

Tests:

```bash
make test              # every suite (619 tests) plus the bindgen suite
make test interfaces   # one suite by name
npm run test:lsp       # language-server tests
```

Formatting and the language server:

```bash
npm run format         # prettier
npm run lsp            # run the language server directly
npm run build:vscode   # bundle the server for the VS Code extension
```

A single `.delta` file builds on its own. A directory build expects a `delta.json` manifest — `name`, `version`, `entry`, `kind` (`executable`, `static`, or `dynamic`), `dependencies` (path aliases such as `@mylib`), and `external` (prebuilt native libraries). `delta init` scaffolds one alongside a buildable `src/main.delta`.

---

## Repository layout

```
main.ts                     CLI entry point (build, bindgen, package, install, init, lsp)
src/ast/                    Tokenizer, parser, AST types, formatter
src/analysis/               Semantic analysis: scopes, declarations, types, expressions, statements
src/codegen/                C emitter
src/compiler/               Pipeline, project/manifest resolution, modules, packaging, bindgen
src/diagnostics/            Shared diagnostic bag and CLI rendering
src/lsp/                    Language server and workspace index
extensions/delta-vscode/    VS Code extension
test-source/tests/          Suite-per-feature test corpus, driven by tests.json
examples/                   Feature walkthroughs (parts of this tree predate recent syntax changes)
docs/main-spec.md           Top-level language spec
docs/spec-sections/         Expanded per-feature design documents
docs/plans/                 Implementation plans, one per feature or milestone
docs/compiler-status.md     Implementation checkpoint
```

The test corpus is the most reliable description of what the language accepts today: each suite directory holds `.delta` fixtures plus a `tests.json` declaring whether each one should pass, fail with a given diagnostic, emit particular C, or run to a specific exit code.

---

## Contributing

The language design is still being shaped. Feature proposals are written in the Proposal → Reason → Examples → Conclusion format used throughout `docs/spec-sections/`, and larger features get a plan document under `docs/plans/` before implementation. When proposing or implementing a feature, please reference the relevant numbered section in `docs/main-spec.md` so the design conversation and the implementation stay in sync, and add fixtures to the matching suite under `test-source/tests/`.
