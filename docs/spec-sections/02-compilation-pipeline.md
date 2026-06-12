## 2. Compilation Pipeline

Section 2 covers how Delta source becomes a runnable binary: the named stages, the toolchain that performs lowering, how generated C is partitioned and located, how the import graph drives execution order, how incremental compilation works, how source locations and build outputs are kept reproducible and debuggable, how errors propagate through the pipeline, and what build artifacts the MVP produces. Each sub-feature below follows the Proposal / Reason / Examples / Conclusion structure.

### 2.1 Pipeline Stages

**Proposal.** Delta compiles in eight well-defined stages:

1. lex
2. parse
3. typed AST (semantic analysis)
4. ownership & lifetime analysis
5. checked error-state analysis
6. C codegen
7. invoke Clang (compile)
8. invoke Clang (link)

Each stage is a pure function from its input to its output. No stage mutates shared global state, and every stage's output is a value that can be serialized, cached, or fed to alternate downstream consumers (a future LSP, formatter, or linter).

**Reason.** Three properties drop out of the stage shape:

- **Independent testability.** Separating ownership analysis and error-state analysis from generic semantic analysis makes them independently testable and replaceable — bugs in one don't poison the others, and a future redesign of (say) the ownership checker doesn't require rewriting the type-checker.
- **Optimizer maturity.** Targeting C (instead of LLVM IR directly) lets Delta inherit the maturity of Clang's optimizer, supports many platforms for free once cross-compilation lands, and produces inspectable artifacts for debugging codegen.
- **Composability.** The "pure function per stage" discipline is what makes incremental compilation ([§2.7](#27-incremental-compilation)), parallel execution ([§2.6](#26-parallel-pipeline-execution)), and future library/LSP embedding ([§2.13](#213-compiler-architecture-for-future-tooling)) all tractable — none of them are bolt-on features; they're consequences of the stage shape.

**Examples.**
```
.delta sources
   │
   ▼  lex
token streams
   │
   ▼  parse
untyped ASTs (one per file)
   │
   ▼  semantic analysis (DAG-ordered)
typed ASTs + ModuleInterface per module
   │
   ▼  ownership & lifetime analysis
ownership-checked typed ASTs
   │
   ▼  checked error-state analysis
fully-checked typed ASTs
   │
   ▼  C codegen
.c files in build/<mode>/c/
   │
   ▼  clang -c   (parallel)
.o files in build/<mode>/obj/
   │
   ▼  clang link
executable in build/<mode>/bin/
```

**Conclusion.** Commit to the eight-stage pipeline with C as the lowering target and Clang as the toolchain. The named stages double as the compiler's module boundaries.

---

### 2.2 Toolchain (Bundled Clang)

**Proposal.** Delta ships its own pinned Clang under `~/.delta/toolchain/`.

- The toolchain is downloaded once on first run (or bundled into the installer for offline installs).
- The system `cc` is not invoked unless the user explicitly opts in via the `DELTA_CC` environment variable or a `delta.json` toolchain override.
- The bundled toolchain includes Clang, its runtime libraries (compiler-rt, libunwind), and the libc headers needed for the host triple.

**Reason.** Targeting C means every `delta build` requires a working C toolchain. Depending on whatever `cc` happens to be on `PATH` inherits "works on my machine" forever — Apple Clang, LLVM Clang, and GCC differ in default `-std`, available `-fsanitize=` options, LTO behavior, and even diagnostic phrasing.

A pinned Clang guarantees:

- **Consistent diagnostics** — when codegen bugs leak through, the user always sees the same error format.
- **Known support for the flags we rely on** — `-flto=thin`, `-frandom-seed=`, `-fdebug-prefix-map=`.
- **Reproducible builds** across machines.
- **Offline-capable installs** once the toolchain is downloaded.

The cost is install size (≈100 MB) and a one-time download — the same trade made by Go, Zig, Swift, and Rust. The `DELTA_CC` escape hatch exists for Linux distro packagers and CI environments that require a specific toolchain, but it is never the default.

**Examples.**
```bash
# fresh install — first run fetches the toolchain
$ delta build src/main.delta
delta: downloading toolchain (clang 18.1, ~95 MB)... done
delta: compiling...

# subsequent runs use the cached toolchain
$ delta build src/main.delta
delta: compiling...

# opt-in override for users who need a system toolchain
$ DELTA_CC=/usr/bin/clang-17 delta build src/main.delta
```

```
~/.delta/
  toolchain/
    clang-18.1.0/
      bin/   { clang, lld, ... }
      lib/   { compiler-rt, libunwind, ... }
      include/
  std-cache/    # see section 2.12
```

**Conclusion.** Bundle a pinned Clang. System `cc` is opt-in via `DELTA_CC`, never the default.

---

### 2.3 Generated C as Internal IR

**Proposal.** The `.c` files emitted under `build/<mode>/c/` are an **internal intermediate representation**. They are visible and inspectable for debugging codegen, but their shape — name mangling, struct layout, helper-function naming, partitioning into files, fallible-return representation — carries no stability guarantee and may change between any two compiler versions, including patch releases. Users who need a stable C-facing API use the FFI / `@extern "C"` interop layer (sections 39–40), not the codegen output.

**Reason.** "Inspectable" is a debugging affordance; "stable" is a compatibility promise. Conflating them is how a project ends up with users depending on `Array_i32` being spelled exactly that way, after which name-mangling changes become breaking changes.

Treating generated C as an internal IR keeps codegen free to evolve:

- Shorter mangled names.
- Restructured helpers.
- Alternative fallible-return shapes.

All without a deprecation cycle.

The cost is that a user who wants to "compile Delta to C and ship the C" portably can't do so across compiler versions — they would have to pin a Delta toolchain. That's not a target use case; the rare user who needs it can vendor the generated C at a pinned compiler version. [§48](#48-c-code-generation-strategy) commits to *readability* of generated C as a quality bar enforced through codegen design and review — that bar exists for debuggability, not for API stability.

**Examples.**
```c
/* build/debug/c/auth_login.c — internal IR; shape may change */

#line 1 "src/auth/login.delta"
#include "delta_runtime.h"

typedef struct {
  bool is_error;
  union {
    Session  ok;
    AuthError error;
  };
} Login_Return;

#line 12 "src/auth/login.delta"
Login_Return login_LU3a8(DeltaString user) {
  /* ... */
}
```

Inspecting the generated C to understand what codegen produced is supported. Writing user code that depends on the symbol `login_LU3a8` existing, or on `Login_Return` being laid out a particular way, is not supported and will break.

**Conclusion.** Generated C is internal. Inspect freely; do not depend on its shape across versions.

---

### 2.4 Translation Unit Partitioning

**Proposal.** Codegen produces:

- **One `.c` file per Delta source file**, matching the "one file = one module" rule ([§1.4](#14-module-to-file-mapping)).
- **A single content-addressed `__generics.c`** containing monomorphized generic instances used by more than one module.

Additional rules:

- Cross-module inlining is recovered in release builds via `-flto=thin`.
- Monomorphized generic instances are keyed on `(mangled name)`, written byte-deterministically ([§2.9](#29-build-determinism)), and deduplicated by content hash so multiple modules instantiating `Array<i32>` produce a single shared definition.

**Reason.** Per-file partitioning aligns the compilation cache key with the user's mental model: edit `auth/login.delta`, recompile `auth_login.c` and re-link. It also parallelizes naturally — most projects have tens to low-hundreds of modules, `clang -c` invocations dominate wall time, and they scale across cores — and gives clean incremental rebuilds ([§2.7](#27-incremental-compilation)).

The alternatives are worse:

- **"One giant TU"** would maximize the optimizer's view but kill parallelism and force whole-program rebuilds.
- **"One TU per generic instantiation"** would bloat object sizes and risk ODR drift across instantiations.

The shared `__generics.c` localizes cross-module monomorphizations: it grows with the project but is mostly small inlinable functions Clang handles quickly. Content-addressing the instances guarantees byte-identical output for the same `(generic body, type args)` pair, which is what makes the deduplication safe and makes incremental caching work.

**Examples.**
```
src/
  main.delta
  auth/
    login.delta
    session.delta
  util/
    array.delta          # defines a generic helper

build/debug/c/
  main.c
  auth_login.c
  auth_session.c
  util_array.c
  __generics.c           # holds Array_i32, Result_Session_AuthError, etc.

build/debug/obj/
  main.o
  auth_login.o
  auth_session.o
  util_array.o
  __generics.o

build/debug/bin/
  my-app
```

**Conclusion.** One `.c` per `.delta`, one shared `__generics.c` for cross-module monomorphizations. LTO recovers cross-module inlining in release.

---

### 2.5 Import DAG and Execution Order

**Proposal.** Imports between Delta modules must form a **directed acyclic graph**.

- Cyclic imports are a compile error, naming each module in the cycle.
- Mutually-recursive declarations live in the same file (which is the unit of mutual visibility anyway, per [§1.4](#14-module-to-file-mapping)).
- Semantic analysis processes the DAG in topological order — a module is type-checked only after all of its transitive imports have been type-checked.
- Lex, parse, codegen, `clang -c`, and link impose no ordering constraints among themselves and run in whatever order the scheduler chooses.

**Reason.** TypeScript permits import cycles and pays for it with partially-initialized-export footguns, hoisting subtleties, and bundler special cases. Delta's "TS-shaped on the surface, stricter where it earns safety" stance argues against importing that complexity.

Forbidding cycles produces concrete wins:

- Removes the need for fixpoint iteration in the type-checker.
- Gives a clean topological schedule for both the type-checker and the incremental cache.
- The escape hatch for genuinely mutually-recursive code — put both declarations in the same file — is already the language's unit of mutual visibility, so the workaround is natural rather than contrived.

Lex/parse/codegen don't depend on import order because they don't need cross-file type information; ordering them topologically would only serialize the pipeline without correctness benefit.

**Examples.**
```ts
// auth/login.delta
import { Session } from "./session";   // OK — login depends on session

// auth/session.delta
import { login } from "./login";       // ERROR — cycle: login → session → login
```

```
$ delta build
error: import cycle detected
  auth/login.delta imports auth/session.delta
  auth/session.delta imports auth/login.delta
hint: declarations that must reference each other should live in the same file
```

**Conclusion.** Imports form a DAG. Cycles are a hard error. Semantic analysis is topological; everything else is order-free.

---

### 2.6 Parallel Pipeline Execution

**Proposal.** Within a single `delta build` invocation, the pipeline parallelizes wherever the import DAG allows it.

- Lex and parse run fully in parallel across all source files (no cross-file dependencies).
- Type-checking and semantic analysis run as a work-stealing pool: as soon as a file's transitive imports have finished type-checking, the file is eligible to be scheduled. Sibling files at the same DAG depth type-check concurrently.
- Ownership analysis, error-state analysis, and codegen run per-file in the same pool.
- `clang -c` invocations run in parallel, capped at the number of available CPU cores.
- Link is a single serial step at the end.

Diagnostics emitted from parallel workers are buffered and printed sorted by `(file, line, column)` so output is identical across runs regardless of scheduling order.

**Reason.** Per-file translation units ([§2.4](#24-translation-unit-partitioning)) and the bundled Clang ([§2.2](#22-toolchain-bundled-clang)) only pay off if the pipeline actually parallelizes — otherwise per-file partitioning is strictly slower than monolithic TUs without LTO. The DAG gives a natural partial order; siblings parallelize.

The cost is real concurrency inside the compiler:

- Shared interners and symbol tables need locking or per-thread partitioning.
- Diagnostic output needs sorting before emission.

These are solvable engineering problems with well-known patterns. Sorted diagnostic output matters for predictability, CI log diffing, and avoiding spurious test failures driven by scheduling jitter.

**Examples.**
```
delta build progress (8 cores):

  [parse]    main.delta auth/login.delta auth/session.delta util/array.delta  (parallel, all 4)
  [check]    util/array.delta                                                  (no deps, scheduled first)
  [check]    auth/session.delta                                                (deps satisfied; parallel with main if it had no auth deps)
  [check]    auth/login.delta                                                  (waits for session)
  [check]    main.delta                                                        (waits for auth/login)
  [codegen]  *.delta                                                           (parallel, all 4)
  [clang-c]  *.c                                                               (parallel, capped at 8)
  [link]     my-app                                                            (serial)
```

```
# diagnostic output is sorted, regardless of which thread produced what
$ delta build
error: auth/login.delta:8:14: cannot move out of & `user`
error: auth/login.delta:23:5: missing return in fallible function `login`
error: util/array.delta:42:1: unused import `core/iter`
```

**Conclusion.** Parallelize where the DAG allows; serialize only at link. Sort diagnostics for stable output.

---

### 2.7 Incremental Compilation

**Proposal.** MVP ships **Tier 2 incremental compilation**: per-module caching keyed on `(source hash, compiler version, build mode, public-interface hashes of all transitive imports)`.

The mechanism:

- The type-checker produces, for each module, a serializable `ModuleInterface` value — exports, exported types' full structure, function signatures, exported constants' values, exported generic definitions (signatures and bodies).
- The `ModuleInterface` is hashed canonically; that hash is what downstream modules' cache keys depend on.

Invalidation behavior:

- **Editing a comment or private helper** changes the *source* hash so the module is recompiled, but does not change the *public-interface* hash, so importers are not re-type-checked.
- **Editing an exported signature** changes the public hash, so importers are re-type-checked.
- **Exported generic bodies** are included in the public-interface hash (slight over-invalidation in exchange for much simpler bookkeeping than per-instantiation tracking).
- **Const generics** whose values are exported are part of the hash by value, not just by type.

Cache mechanics:

- Lives under `build/<mode>/cache/`.
- Entries are content-addressed.
- Cache misses are logged at `--verbose`.
- Users can wipe the cache with `delta build --no-cache` or `rm -rf build/<mode>/cache/`.

**Reason.** Per-file partitioning ([§2.4](#24-translation-unit-partitioning)) was justified partly by clean incremental rebuilds — that justification only pays off if incremental actually works.

Why Tier 2 specifically:

- **Tier 1** ("file changed? recompile it") is half a day's work but is silently wrong on importer changes — downstream files keep using stale signatures.
- **Tier 2** is the smallest correct design.

The risk is that incremental compilers are historically a major source of subtle bugs — stale-cache bugs where the program runs but is built from a mix of old and new code are nightmarish to debug. So the design has to be conservative (over-invalidate rather than under-invalidate) and the cache key has to include everything that can change codegen: compiler version, build mode, the full transitive set of public-interface hashes, and the contents of `delta.json` flags affecting codegen.

Generic bodies being included in the public hash is a deliberate over-invalidation: tracking per-instantiation dependencies is precise but adds significant bookkeeping; including bodies in the hash invalidates downstream when a generic body changes, which is rare enough in practice that the over-invalidation is barely measurable.

**Examples.**
```
# first build — everything is cold
$ delta build
delta: compiling main.delta, auth/login.delta, auth/session.delta, util/array.delta
delta: cache: 0 hits, 4 misses
delta: done in 2.1s

# edit a comment in auth/session.delta — source hash changes, public hash does not
$ delta build
delta: compiling auth/session.delta
delta: cache: 3 hits, 1 miss   # main.delta, auth/login.delta, util/array.delta reused
delta: done in 0.4s

# change an exported signature in auth/session.delta — public hash changes
$ delta build
delta: compiling auth/session.delta, auth/login.delta, main.delta
delta: cache: 1 hit, 3 misses  # only util/array.delta unaffected
delta: done in 1.2s
```

**Conclusion.** Tier 2 incremental in MVP, conservatively over-invalidating. The same `ModuleInterface` value powers both the cache and the `.delta-meta` sidecar (section 2.11).

---

### 2.8 Source Mapping

**Proposal.** Generated `.c` files emit `#line N "path/to/source.delta"` preprocessor directives at every statement boundary. As a result, all user-facing source references point at `.delta` files and Delta line numbers — never the intermediate `.c` files. This applies to:

- Clang compile errors (when codegen bugs leak through).
- DWARF debug information in the resulting binary.
- Debugger source-stepping.
- Profiler attribution.
- Runtime backtraces.

Additional rules:

- Embedded paths in `#line` directives are project-relative (not absolute) to preserve build determinism ([§2.9](#29-build-determinism)). DWARF absolute paths are reconstructed at the debug-info-generation stage via Clang's `-fdebug-prefix-map=`.
- Compiler-emitted code with no user-source origin — bounds-check trampolines, drop glue, monomorphization headers, generic-instance prologues — maps to a synthetic `<delta-runtime>` location so a crash inside such helpers is not misattributed to an innocent user line that happened to be the previous `#line`.

**Reason.** [§2.3](#23-generated-c-as-internal-ir) commits to generated C being an internal IR; users should not have to navigate into `build/<mode>/c/` for normal debugging. That promise only holds if every user-facing source reference — error messages, backtraces, debugger panes — points at `.delta` source.

`#line` directives are the standard mechanism: used by Cython, Nim, early C++ frontends, Bison, and Yacc; nearly free at codegen time; propagate through Clang's diagnostic and DWARF pipelines without special handling.

The synthetic `<delta-runtime>` location for compiler-emitted glue prevents the most common source of confusing backtraces, where a crash inside (say) a bounds-check helper appears to come from an unrelated previous user line.

**Examples.**
```c
/* build/debug/c/auth_login.c */
#line 1 "src/auth/login.delta"
#include "delta_runtime.h"

#line 12 "src/auth/login.delta"
Login_Return login_LU3a8(DeltaString user) {
#line 13 "src/auth/login.delta"
  Session_Return r = Session_create(user);
#line 14 "src/auth/login.delta"
  if (r.is_error) { return wrap_error(r); }
#line 15 "src/auth/login.delta"
  return ok(r.value0);
}

#line 0 "<delta-runtime>"
static inline void __delta_bounds_panic(size_t idx, size_t len) { /* ... */ }
```

```
# runtime crash backtrace — references .delta, not .c
$ ./build/debug/bin/my-app
delta: panic at src/auth/login.delta:14: error propagated from Session_create
  at src/main.delta:7 in main
```

**Conclusion.** `#line` directives at every statement boundary. User-facing source references always point at `.delta`. Compiler glue maps to `<delta-runtime>`.

---

### 2.9 Build Determinism

**Proposal.** Builds are **deterministic by default**: same source + same compiler version + same build mode → byte-identical `.c`, `.o`, `.a`, and executable output, regardless of which machine, user, or working directory the build runs in. The only sanctioned source of non-determinism is opt-in via `delta build --embed-build-info`, which bakes in commit hashes, timestamps, or hostnames for users who want them in `--version` output. Default builds embed none of those.

The implementation discipline required to achieve this:

- Codegen iterates over symbol tables, type definitions, and import lists in sorted order, never in hash-map insertion order.
- No timestamps (`__DATE__`, `__TIME__`), hostnames, PIDs, or random nonces are emitted into generated C or passed to Clang.
- Temp filenames are content-addressed or sequentially numbered, not based on PID or RNG.
- File paths in `#line` directives are project-relative; absolute paths are reconstructed in DWARF at the Clang stage via `-fdebug-prefix-map=`.
- Clang is invoked with `-frandom-seed=<deterministic value>` and `-Wno-builtin-macro-redefined -D__DATE__= -D__TIME__=` to prevent it from embedding nonces of its own.

**Reason.** Several earlier decisions implicitly depend on determinism:

- The content-addressed `__generics.c` ([§2.4](#24-translation-unit-partitioning)) only deduplicates correctly if instantiations of `Array<i32>` are byte-identical across runs.
- The Tier 2 incremental cache ([§2.7](#27-incremental-compilation)) only stays consistent if cached `.o` files are interchangeable with freshly compiled ones.
- The strict version-matching for `.delta-meta` ([§2.11](#211-build-artifacts-and-delta-meta)) only fails cleanly if metadata serialization is canonical.

Beyond those internal motivations, reproducible builds have become table stakes for security-conscious users — supply-chain attacks, binary transparency, and verified builds all rely on the property that two independent builds of the same source produce the same bytes. Bolting determinism on after the fact is the expensive path; building it in from day one is mostly engineering discipline at codegen time.

**Examples.**
```bash
# build twice from clean — bytes match
$ delta build && sha256sum build/release/bin/my-app
a1b2c3d4...  build/release/bin/my-app

$ rm -rf build && delta build && sha256sum build/release/bin/my-app
a1b2c3d4...  build/release/bin/my-app

# build on a different machine, different user, different working directory
alice@host1:~/projects/my-app$ delta build && sha256sum build/release/bin/my-app
a1b2c3d4...  build/release/bin/my-app

bob@host2:/tmp/build/my-app$ delta build && sha256sum build/release/bin/my-app
a1b2c3d4...  build/release/bin/my-app

# opt-in nondeterminism for CLI version strings
$ delta build --release --embed-build-info
$ ./build/release/bin/my-app --version
my-app 1.0.0 (commit a1b2c3, built 2026-05-26T14:32:07Z)
```

**Conclusion.** Deterministic by default; opt-in non-determinism via `--embed-build-info`.

---

### 2.10 Error Recovery

**Proposal.** Recovery is layered:

- **Within a stage**, the compiler continues past the first error and reports as many diagnostics as it can in a single invocation.
- **At stage boundaries**, the compiler hard-stops for affected files:
  - A file with lex errors does not advance to parse.
  - A file with parse errors does not advance to type-check.
  - A file with type errors does not advance to ownership analysis.
  - A file with ownership errors does not advance to error-state analysis.
- **Files that don't transitively depend on the failing file** continue through the pipeline normally and report their own diagnostics.

Two additional rules:

- Within type-checking, an unresolved name produces a `?error` placeholder type that suppresses only direct-cascade diagnostics (operations on that specific name) and does not poison unrelated parts of the same file.
- Codegen and Clang invocations should never fail on valid Delta — if they do, it is treated as an **internal compiler error** (ICE) with a "please report this" prompt, not as a user-facing error.

**Reason.** The dominant complaint about compilers that bail at the first error is the "fix one thing, recompile, hit the next thing, recompile" treadmill. Every modern compiler — rustc, tsc, clang, swiftc — does some form of recovery, and it is one of the highest-leverage UX investments a compiler can make.

The design balances aggression and sanity:

- **Stage-boundary hard-stop** keeps recovery sane — running ownership analysis on an AST that didn't type-check produces cascades of "this variable has unknown type, so we can't tell if it's moved" that drown the real diagnostics.
- **Per-file suppression** (rather than killing the whole build) preserves diagnostic output from files that compiled cleanly.
- **`?error` placeholder** is a well-trodden trick from tsc and rustc; the cost is that every type operation must propagate `?error` as a fixed point without re-reporting — one extra case in each unification rule.
- **ICE on codegen/Clang failure** forces the compiler authors to *fix* codegen bugs rather than letting users see raw C error messages.

**Examples.**
```
# multiple type errors in one file, all reported
$ delta build
error: src/auth/login.delta:7:14: type mismatch: expected `Session`, found `string`
error: src/auth/login.delta:15:5: cannot call `validate` on value of type `?error`
note: `validate` is suppressed because its receiver had a prior error
error: src/util/array.delta:22:9: unused mutable binding `tmp`
error: src/main.delta:4:1: function `main` must return `i32`, found `void`

4 errors reported. compilation aborted.
```

```
# stage-boundary hard-stop — ownership analysis skipped for files with type errors
$ delta build
error: src/auth/session.delta:18:7: type mismatch in field `userId`
note: skipping ownership analysis for src/auth/session.delta due to prior errors
note: src/util/array.delta passed all stages; no diagnostics

1 error reported. compilation aborted.
```

```
# codegen ICE — treated as a compiler bug, not a user error
$ delta build
internal compiler error: codegen failed for src/auth/login.delta:42
  while lowering generic instantiation Array<HashMap<string, i32>>
please report this at https://github.com/.../issues with the source above
```

**Conclusion.** Continue past errors within a stage; hard-stop at stage boundaries. `?error` type prevents single-name cascades. Codegen/Clang failures on valid input are ICE.

---

### 2.11 Build Artifacts and `.delta-meta`

**Proposal.** MVP produces two artifact kinds: **executables** and **static libraries (`.a`)**.

- The artifact kind is declared in `delta.json` via `"kind": "executable" | "static-lib"` (default `"executable"`).
- An executable project requires a `main` entry (per [§1.5](#15-entry-point)).
- A static-library project has no `main` and instead exposes its `export`ed declarations as the library surface.

Static libraries are **Delta-to-Delta consumable**, not just C-extern-callable:

- Each `.a` is paired with a `.delta-meta` sidecar containing the producer's `ModuleInterface` values plus serialized generic bodies sufficient for the consumer to monomorphize generic instantiations on demand.
- A Delta consumer of `libfoo.a` writes `import { ... } from "foo"` with full Delta-flavored types (generics, structured errors, classes, ownership-managed types).
- No `@extern "C"` facade is required for Delta-to-Delta linkage.

`.delta-meta` is **strictly version-matched** in MVP:

- The file's header embeds the producer's exact compiler version, build mode, and format version.
- A mismatch on consume is a hard error with the message `rebuild libfoo.a with delta X.Y.Z or upgrade your local toolchain`.
- The format is **designed to support future cross-version compatibility** — the header reserves space for a forward-compatibility map and the body uses a self-describing encoding — but cross-version consume is explicitly out of scope for MVP.
- There is no automatic recompilation; the producer's build system is responsible for rebuilds.

Dynamic libraries (`.so`, `.dylib`, `.dll`), cross-compilation, and cross-version `.delta-meta` consume are deferred to [§2.14](#214-explicit-non-goals-for-section-2) / post-MVP.

**Reason.** A C-callable-only static-library model would be much simpler — consumers would just declare `@extern "C"` and link the `.a` — but it forces library authors to write a C-shaped facade for every public function, losing generics, fallible returns with structured errors, ownership-managed types, and classes. That's an ergonomics tax exactly where it hurts most: on the people writing reusable code.

Delta-to-Delta linkage with sidecar metadata is more work to design (essentially most of Rust's rlib problem), but it preserves the language's full surface across the library boundary, which is the right long-term shape.

Strict version-matching in MVP earns its keep:

- Avoids committing to a stable on-disk format prematurely — the format can evolve freely during 0.x.
- Still usable in the dominant case (local monorepos and vendored libraries where producer and consumer share a toolchain).
- The forward-compatibility hooks in the header keep the option open for a stable format later, without forcing the design now.

**Examples.**
```json
// delta-math/delta.json
{
  "schemaVersion": 1,
  "name": "delta-math",
  "version": "0.1.0",
  "kind": "static-lib"
}
```

```ts
// delta-math/src/vec.delta — no @extern needed for Delta-to-Delta consumers
export function dot(a: f64[], b: f64[]): f64 {
  let sum: f64 = 0;
  for (let i = 0; i < a.length; i++) { sum += a[i] * b[i]; }
  return sum;
}

export function clamp<T: Numeric>(x: T, lo: T, hi: T): T {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
```

```
# producer build
$ cd delta-math && delta build --release
$ ls build/release/lib/
libdelta-math.a
libdelta-math.delta-meta
```

```ts
// my-app/src/main.delta — full Delta API, generics work
import { dot, clamp } from "delta-math";

function main(): i32 {
  let a: f64[] = [1.0, 2.0, 3.0];
  let b: f64[] = [4.0, 5.0, 6.0];
  print(dot(a, b));
  print(clamp(42, 0, 100));   // Delta consumer monomorphizes clamp<i32> using .delta-meta
  return 0;
}
```

```
# version mismatch on consume
$ delta build
error: cannot consume libdelta-math.delta-meta
  produced by: delta 0.3.1
  consumer:    delta 0.4.0
hint: rebuild libdelta-math.a with delta 0.4.0, or downgrade your local toolchain to 0.3.1
```

**Conclusion.** Executables and Delta-to-Delta-consumable static libraries in MVP. `.delta-meta` sidecar carries `ModuleInterface` + generic bodies. Strict version match for MVP; format reserved for future cross-version compatibility.

---

### 2.12 Standard Library Distribution

**Proposal.** The standard library is **shipped as Delta source** under `<toolchain-root>/std/`.

- On first use, the compiler builds the modules needed by the current project into a per-`(compiler version, build mode, target triple)` cache at `~/.delta/std-cache/<compiler-version>/<build-mode>/<triple>/`.
- Subsequent builds across any project reuse the cached `.o` files and `.delta-meta` sidecars.
- Wiping the cache (`rm -rf ~/.delta/std-cache/...`) is always safe; it only loses the first-build amortization.
- Std goes through exactly the same pipeline as user code — there is no privileged "std codegen" path.

The only privileges std has:

- Implicit availability without a `delta.json` dependency entry.
- Access to compiler-recognized built-in declarations that define the public standard-library surface.

Std Delta source does **not** get raw-pointer or trusted-Delta privileges in MVP. Any pointer-bearing machinery needed to implement arrays, strings, slices, or runtime services lives below the Delta language boundary in generated/runtime C ([§13.2](#132-no-raw-pointers-in-delta-source)).

**Reason.** Shipping prebuilt `libstd.a` + `libstd.delta-meta` for every (build mode × triple) combination would be simpler at first-build time but lock the bundled std into a single configuration — a user who wants to build std with different overflow-check settings, or with a custom allocator, would be stuck.

Source-shipped + cached is more flexible and architecturally cleaner:

- Std is the canonical "Delta library that works end-to-end through the static-library pipeline" ([§2.11](#211-build-artifacts-and-delta-meta)).
- If std needs a feature, that feature must work in user libraries too, which dogfoods the whole library system.

The cost is a one-time first-build delay on a fresh toolchain (a few seconds for the std modules a typical project uses), which is acceptable because subsequent builds across any project are cache hits.

**Examples.**
```
<toolchain-root>/
  std/
    core/      # source modules
    error/
    array/
    string/
    io/
    fs/
    ...

~/.delta/std-cache/
  0.3.1/
    debug/
      aarch64-darwin/
        std_core.o   std_core.delta-meta
        std_error.o  std_error.delta-meta
        ...
    release/
      aarch64-darwin/
        ...
```

```
# first build on a new toolchain — std modules compile, then cache
$ delta build
delta: building std modules: core, error, array, io   (~3s)
delta: compiling project...
delta: done in 4.1s

# subsequent build — std modules served from cache
$ delta build
delta: compiling project...
delta: done in 1.1s
```

**Conclusion.** Std ships as source, builds on first use into a per-version cache, and goes through the same pipeline as user code.

---

### 2.13 Compiler Architecture for Future Tooling

**Proposal.** MVP ships only the `delta` CLI binary. There is no `libdelta` library, no LSP server, no formatter, no linter, no watch mode, and no REPL in MVP. However, the compiler's internals are **structured from day one as if a library API were the consumer**:

- No global mutable state. Every stage takes its inputs and returns its outputs explicitly.
- Diagnostics are structured values (file, range, severity, message, optional fix-its). The CLI is the only place that formats them to terminal text; future consumers can render them however they want.
- No `process::exit()` calls deep in passes. Errors propagate up the call stack and are handled at the CLI boundary.
- A `should_stop` cancellation token is threaded through long-running stages so that a future LSP can cancel a stale compilation when the user keeps typing.
- The `ModuleInterface` value (section 2.7) and its serialized form (section 2.11) are the same data the future LSP will consume for go-to-definition, hover, and autocomplete.

**Reason.** A real LSP is a substantial project — not "expose the compiler functions as a library." Demand-driven compilation, incremental diagnostics across unsaved edits, cancellation, and stale-result handling all add up to months of work that is appropriately out of MVP scope.

But the worst possible outcome is shipping a CLI-shaped compiler (global state, direct stderr writes, `exit(1)` in passes) and then ripping it apart later to add tooling. That is the rustc → rust-analyzer split, which the Rust ecosystem paid years of pain for.

The discipline of "no global state, structured diagnostics, return errors up the stack, cancellation tokens" costs essentially nothing during MVP development — it is what well-written code does anyway — and pays off enormously when LSP and formatter work begins. Treating that discipline as a hard rule from the first commit is the cheapest time to enforce it.

**Examples.**
```rust
// Conceptual shape of the compiler's internal API — not a stable public API,
// but the structure that makes a future libdelta possible.

fn type_check(
  module: &ParsedModule,
  imports: &[&ModuleInterface],
  cancel: &CancellationToken,
) -> Result<TypeCheckedModule, Vec<Diagnostic>> { ... }

// CLI is the only layer that formats diagnostics for humans
fn render_diagnostics_for_terminal(diags: &[Diagnostic]) -> String { ... }
```

**Conclusion.** CLI-only in MVP, but every stage is a pure function over structured inputs and outputs. The library-shaped internals are what make post-MVP tooling affordable.

---

### 2.14 Explicit Non-Goals for Section 2

The following are deliberately out of scope for MVP, either deferred to a later release or excluded permanently:

- **Cross-compilation** (`delta build --target <triple>`) — post-MVP. The bundled Clang is already a cross-compiler; the missing piece is bundling or fetching destination sysroots and validating each target triple. MVP builds for the host triple only.
- **Dynamic libraries** (`.so`, `.dylib`, `.dll`) — post-MVP. Adds questions around exported-symbol ABI, generics across dynamic boundaries, name-mangling stability, and library versioning that are not designed in MVP.
- **Sanitizers in `--debug`** (UBSan-by-default, opt-in ASan) — post-MVP. Bundled Clang already supports them; deferred until the FFI surface stabilizes and the team chooses defaults.
- **LSP server** (`delta-lsp`) — post-MVP. Editor integration in MVP is "syntax highlighting via a TextMate grammar" only.
- **Formatter** (`delta fmt`) — post-MVP.
- **Linter** — post-MVP.
- **Watch mode** (`delta build --watch`) — post-MVP.
- **REPL** — post-MVP.
- **Public `libdelta` library API** — post-MVP. The internal architecture is library-shaped (section 2.13), but no stable embedding API is exposed in MVP.
- **Cross-version `.delta-meta` compatibility** — post-MVP. The format reserves the hooks; the MVP enforces strict version matching.
- **Stable generated-C output as a public artifact** — never. Generated C is internal IR (section 2.3) and may change shape between any two compiler versions. Stable C interop is exposed via `@extern "C"` and FFI-safe types (sections 39–40), not via codegen output.
- **Whole-program single-TU "C amalgamation" output** (SQLite-style) — never. Per-file TUs are the design (section 2.4).
- **Pluggable C backends** (GCC, MSVC, TCC) — never. The toolchain is Clang; alternative C compilers are out of scope.
- **`#line`-less codegen** — never. Source mapping (section 2.8) is unconditional.
- **Non-deterministic builds as the default** — never. Determinism (section 2.9) is unconditional; `--embed-build-info` is the only sanctioned opt-out.

---
