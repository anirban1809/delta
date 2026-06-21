# Delta Compiler Goal — Self-Hosting Bootstrap (v1.0)

Date drafted: 2026-06-20
Status: target, not started. The milestone *after* [compiler-goal-v0.5.md](compiler-goal-v0.5.md).
Predecessors: [compiler-status.md](compiler-status.md) (v0 baseline) → [compiler-goal-v0.5.md](compiler-goal-v0.5.md) (v0.5a/b) → **this**.
Spec basis: [main-spec.md](main-spec.md), authoritatively **§53 (MVP Compiler Scope)**, plus §7, §9, §10, §16–18, §37, §38, §39, §40–42, §44, §49, §51, §54.

## Goal

The Delta compiler is rewritten **in Delta** and compiles itself. Concretely, after this milestone the toolchain reaches a **bootstrap fixpoint**: a Delta-written compiler, compiled by a previous generation of itself, reproduces its own source-to-C output byte-for-byte and passes the entire existing test suite. The Go compiler is demoted from "the compiler" to "stage-0 bootstrap seed," kept only to rebuild the chain from scratch.

This is the convergence milestone — it is reached only once the language is expressive enough to write a non-trivial compiler in, and the standard library is rich enough to read files, build data structures, format output, and drive clang.

## What "self-hosted" means here — the bootstrap fixpoint

The acceptance is the classic three-stage bootstrap:

- **Stage 0** — `deltac-go`, the current Go compiler ([cmd/delta](../cmd/delta), [internal/](../internal)). The reference oracle.
- **Stage 1** — Stage 0 compiles the Delta-written compiler source (`compiler/*.delta`) → generated C → clang → `deltac-1`.
- **Stage 2** — `deltac-1` compiles the *same* Delta source → `deltac-2`.
- **Stage 3** — `deltac-2` compiles the *same* Delta source → `deltac-3`.

The milestone is met when:

1. `deltac-2` and `deltac-3` emit **byte-identical generated C** (and identical binaries under a fixed clang). This is the fixpoint: a compiler built by itself reproduces itself. Stage 1 may differ from Stage 2 (different host compiler), but Stage 2 ≡ Stage 3 must hold.
2. `deltac-2` runs the full [test-source/tests/](../test-source/tests) suite and produces **the same diagnostics and the same generated C as `deltac-go`** for every fixture (a parity gate against the oracle).
3. Stage 1 and Stage 2 both build from a clean checkout with only `deltac-go` + clang present.

Reproducible generated C is the load-bearing requirement: it forces codegen to be deterministic (stable iteration order, no map-iteration nondeterminism, no embedded timestamps/paths), which is also why the self-hosted compiler avoids hash-map iteration in codegen-visible positions.

## Authoritative scope — spec §53

§53 already pins the bootstrap feature set and, importantly, what it leaves out:

> *"The MVP scope is deliberately the minimum needed to write non-trivial programs in Delta — and crucially, the minimum needed to begin self-hosting the compiler. **Generics, tagged unions, and variant dispatch (`switch type`) are deferred because they're not required for that bootstrap.**"*

This milestone adopts that scope verbatim. The two consequences below shape the entire self-hosted codebase and are non-negotiable design constraints, not preferences.

### Consequence 1 — the AST is object-oriented, not a tagged union

The Go compiler models `Expression`/`Statement`/`Declaration` as Go interfaces with `switch v := node.(type)` dispatch — i.e. sum types + variant dispatch. Delta's bootstrap subset has **neither tagged unions (§30) nor `switch type` (§31)**. So the self-hosted AST must be expressed with **structural interfaces (§10)** and **classes (§9)** using **virtual method dispatch** (a visitor / double-dispatch or per-node `accept`/`emit`/`check` methods). Every "type switch" in the Go compiler becomes a virtual call in the Delta compiler. This is the single biggest architectural difference and must be designed before the rewrite starts.

### Consequence 2 — no user generics and no `std/map` in the bootstrap

§53 defers **user-defined generics**; §38/§54 keep `std/map`/`std/set` out of the MVP stdlib. `Array<T>`, `FixedArray<T,N>`, and `Slice<T>` exist, but as **compiler-blessed built-in generics** (the compiler special-cases and monomorphizes them — §49), not as something user code can author. Therefore the symbol tables, ref maps, and conversion maps the Go compiler builds with `map[K]V` must be re-expressed as:

- `Array<Entry>` with linear scan (fine at compiler scale for most tables), or
- a **hand-rolled string-keyed hash table** built on `Array` + `heap T` (a single concrete `SymbolTable` type, not a generic `HashMap<K,V>`).

Both are acceptable; neither needs user generics.

## Feature surface, by readiness

### Already done in v0 (see compiler-status.md)
- Lexer, parser (with recovery), diagnostics.
- Full primitive numerics, trapping arithmetic, conversions (§5/§6).
- `const`/`let`, functions, multi-return, control flow + definite-assignment + return-coverage (§3).
- Error model: fallible signatures, `as result`, `check`, `return error as` (§20–24, v0 slice).
- Single-TU C codegen + clang invocation (§49, partial).
- Record `type` declarations (bonus, ahead of plan).

### Delivered by v0.5 (prerequisite — must land first)
v0.5a: **modules + visibility (§44, Phase I)**, **`extern "c"` (§41, Phase D)**, **`std/log` delivery mechanism (Phase J)**, **classes (§9, Phase E)**.
v0.5b: **ownership / `move` / `clone` (§13/§14, Phase F)**, **safe references `&`/`edit &` (§12, Phase G)**, **`heap T` (§37, Phase H)**.

After v0.5 the compiler can: split across files, define classes with `edit` methods, move/clone/borrow class instances safely, own heap values, call into C, and ship embedded Delta stdlib modules. That is most of the language a compiler needs — but not the collections, strings, interfaces, or stdlib I/O.

### New work for self-hosting (this milestone)

| Phase | Feature | Spec | Why the compiler needs it |
|---|---|---|---|
| **S1** | Structural **interfaces** + virtual dispatch | §10 | Polymorphic AST without tagged unions (Consequence 1). |
| **S2** | **Fixed arrays** `T[N]`, **dynamic `Array<T>`**, **`Slice<T>`**, bounds checks | §16–18, §39 | Token streams, AST child lists, byte buffers, symbol tables. |
| **S3** | **Full string family**: `string` (owned UTF-8), `stringview`, `char` ops, `StringBuilder` | §7 | Lexing source, building generated C, diagnostics. |
| **S4** | **Bootstrap stdlib** modules (Delta source, embedded): `std/core`, `std/error`, `std/mem`, `std/array`, `std/string`, `std/fmt`, `std/io`, `std/fs`, `std/c` | §51/§54 | Collections, formatting, file read/write, panic/assert/exit, allocator. |
| **S5** | **Self-host driver capability**: read source files, write `.c`, **invoke clang**, read `argv`, exit codes | §40–42, §44 | Everything [cmd/delta/main.go](../cmd/delta/main.go) does, expressible in Delta. |
| **S6** | **The rewrite**: port lexer → parser → analyzer → codegen → driver into Delta | — | The actual self-hosted compiler. |
| **S7** | **Bootstrap fixpoint + parity gate** | §49 | Stage 2 ≡ Stage 3, byte-identical; full-suite parity vs `deltac-go`. |

### Deliberately excluded (per §53; post-bootstrap)
User-defined generics (§32), const generics (§33); tagged unions (§30) and `switch type` (§31); nullable `T?` (§19 — absence is handled by fallible signatures instead); advanced ownership, lifetime-tracked views, and arena lifetimes (§15, §37); concurrency/atomics (§43); the full FFI surface beyond `extern "c"` declarations (§41/§42); package manager / `delta.json` (§52); decorators (§47); `std/map`, `std/set`, and every stdlib tier above the bootstrap set (§54). The self-hosted compiler must be writable **without any of these**; if the rewrite finds it cannot, that is a finding to feed back into the spec, not a license to pull a deferred feature into the bootstrap.

## The C / runtime boundary (§40)

Per §40, Delta source — including stdlib source — stays on the safe surface; raw pointers and unsafe machinery live **below** the Delta boundary in handwritten runtime C and compiler-generated C. The self-hosted compiler reaches the OS the same way: through `extern "c"` declarations wrapped in safe Delta APIs in `std/fs`, `std/io`, and `std/c`. Two driver capabilities need an explicit decision in S5:

1. **Process spawn for clang.** `std/process` is post-MVP (§54 Tier 3). Options: (a) a minimal `extern "c"` binding to `posix_spawn`/`system` wrapped in a tiny safe shim shipped with the bootstrap stdlib, or (b) keep a thin **non-Delta driver** (shell or the retained Go `cmd/delta`) that calls clang on the `.c` the Delta compiler emits. **Recommendation: (b) for the first fixpoint** — let the self-hosted compiler be "`.delta` in, `.c` out," and keep clang invocation in a thin stage-0-provided driver. This shrinks S5 to file I/O only and defers process-spawn safety design. Promote to (a) once `std/process` is specified.
2. **CLI args.** Either `extern "c"` `main(argc, argv)` glue in `std/c`, or a minimal `std/os.args()`. The former is smaller and sufficient for bootstrap.

## Bootstrap standard library (minimum set)

From §54's MVP promotion (`core`, `error`, `array`, `string`, `io`, `fs`, plus `mem` and `fmt`), trimmed to what the compiler actually calls:

- **`std/core`** — `panic`, `assert`, `unreachable`, `process.exit`; the closed trait set (`Copyable`, `Disposable`, `View of S`); `Ordering`; `Allocator` interface.
- **`std/error`** — shared error base + the variants the compiler surfaces (`IoError`, `OutOfMemory`, `Overflow`).
- **`std/mem`** — allocator plumbing, `heap T` support, `copy`/`set`/`swap`.
- **`std/array`** — `Array<T>`, `FixedArray<T,N>`, `Slice<T>` (built-in generics).
- **`std/string`** — `string`, `stringview`, `StringBuilder`, char/codepoint helpers.
- **`std/fmt`** — typed formatting / number→string (no `printf`); used pervasively in codegen and diagnostics.
- **`std/io`** + **`std/fs`** — read a source file to a `string`, write generated C to a path; `stderr` for diagnostics.
- **`std/c`** — `extern "c"` glue, `cstring` ↔ `string`, argv access.

`std/map`, `std/set`, `std/iter`, `std/fmt` adapters beyond the basics, and everything in §54 tiers 2–9 are **not** required and stay out until after the fixpoint.

## Recommended phasing

These ride strictly on top of a completed v0.5 (both a and b). Each phase is independently testable against the Go compiler before any rewrite begins.

1. **S1 — Interfaces & dispatch.** Structural interface declarations and conformance (§10), virtual method tables in codegen. Validate with fixtures exercising polymorphic dispatch. *Gate:* an interface-typed value dispatches to the right class method through generated C vtables.
2. **S2 — Collections.** `T[N]`, `Array<T>`, `Slice<T>`, bounds checking with `as result` recovery (§39). Monomorphization + name mangling per §49 (`Array_int32`, …). *Gate:* a Delta program builds/grows an `Array`, slices it, and indexes it safely.
3. **S3 — Strings.** `string`/`stringview`/`StringBuilder` end-to-end through codegen. *Gate:* read-build-emit a string round-trips through generated C.
4. **S4 — Bootstrap stdlib.** Author the modules above as embedded Delta source (extends the Phase J delivery mechanism). *Gate:* a Delta program reads a file, formats numbers, and writes a file using only `std/*`.
5. **S5 — Driver capability.** File read/write from Delta; decide the clang-invocation boundary (recommend the thin stage-0 driver). *Gate:* a Delta program reproduces `delta build`'s file-shuffling for a single module.
6. **S6 — The rewrite.** Port the compiler into `compiler/*.delta`, **stage by stage against the oracle**: lexer first (token-stream parity), then parser (AST-dump parity), then analyzer (diagnostic parity), then codegen (generated-C parity). Each stage is green against `deltac-go` before the next starts. The OO-AST design (Consequence 1) is settled here, up front.
7. **S7 — Fixpoint.** Stand up the three-stage bootstrap harness; drive Stage 2 ≡ Stage 3 to byte-identical; run the full-suite parity gate. Demote `deltac-go` to stage-0 seed.

S1–S3 are language work; S4–S5 are library/runtime work; S6 is the bulk of the effort; S7 is the proof.

## Success criteria

The milestone is reached when, on a clean checkout with only `deltac-go` and clang available:

1. The Delta-written compiler in `compiler/*.delta` compiles via `deltac-go` to `deltac-1` with no diagnostics.
2. `deltac-1` compiles the same source to `deltac-2`, and `deltac-2` compiles it to `deltac-3`.
3. The generated C from Stage 2 and Stage 3 is **byte-identical**; under a pinned clang, so are the binaries.
4. `deltac-2` runs the entire [test-source/tests/](../test-source/tests) suite and matches `deltac-go` on every fixture's diagnostics **and** generated C (the parity gate).
5. The self-hosted compiler uses **no** excluded feature (no user generics, tagged unions, `switch type`, `T?`, `std/map`) — verifiable because those features are not implemented.
6. Bringing up the whole chain from scratch needs only the stage-0 seed + clang, documented in a single `bootstrap` script/skill.

## Risks and open questions

- **OO-AST ergonomics.** Rewriting every `type switch` as virtual dispatch may make some passes (especially the analyzer's cross-cutting checks) awkward without a visitor framework. Prototype the AST + one full pass (the formatter) in Delta early in S6 to de-risk before porting the analyzer.
- **Determinism for the fixpoint.** Any map-iteration order, pointer-address-derived ordering, or path/timestamp leakage in codegen breaks Stage 2 ≡ Stage 3. Codegen-visible iteration must be over ordered `Array`s, not hash tables. This is why §54's `std/map` staying out of the bootstrap is convenient, not just acceptable.
- **The oracle must stay honest.** `deltac-go` is the only reference until S7 passes; it must not be retired or allowed to drift from the spec during S1–S6. Every new language feature lands in `deltac-go` *first* (with fixtures), then in the Delta rewrite.
- **Subset verbosity.** Without generics/maps, symbol tables and collections are hand-written and repetitive. Accept the verbosity for the first fixpoint; generic-ize post-bootstrap once `std/map` and user generics exist.
- **clang invocation boundary.** Choosing the thin stage-0 driver (recommended) means the *very first* self-hosted compiler is "`.delta` → `.c`," not "`.delta` → binary." Decide explicitly whether that counts as "self-hosted" for this milestone (it does, under criteria 1–4) or whether process-spawn-from-Delta is required (defers the fixpoint until `std/process`).

After this milestone, the deferred features (user generics, tagged unions, `switch type`, the rest of the stdlib) can be added to the self-hosted compiler in Delta itself — the Go seed never needs to grow them.
