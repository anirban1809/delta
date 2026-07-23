# Delta Compiler Goal — v0.5

Date drafted: 2026-06-03
Status: target, not started.
Predecessor: [compiler-status.md](compiler-status.md) — the v0 baseline this goal extends.
Spec basis: [main-spec.md](main-spec.md) plus the section files under [spec-sections/](spec-sections/), in particular §1, §3, §5, §6, §9, §11, §12, §13, §14.

> **Update (2026-06-21) — classes dropped.** Delta's user-defined object model is `type` records (Phase K) plus receiver functions (Phase L). Resource ownership is inferred, not declared: `heap T`, `string`, `Array<T>`, and similar built-ins are ownership roots, and any record containing an owner becomes non-Copyable transitively. Every non-Unique record remains Cloneable. There is no `owned type` keyword. `unique type` is the sole explicit ownership-related marker, uniqueness propagates through Unique members, and only an explicitly Unique record may define the compiler-invoked receiver hook `function (x: edit &T) dispose(): void`. Borrows use `&T` / `edit &T`; slices and strings are borrowed as `&T[]` / `&string`, with concrete `viewing <source>` clauses where source elision is ambiguous. See [the revised Phase F plan](plans/goal-v0.5/phase-f-ownership-and-move.md). Phase E is retained for historical context only.

## Goal

A user can write a **multi-file** Delta project that:

1. Splits across modules using `import` and `export`, with at least one user module and one standard library module.
2. Defines `type` and `unique type` record types with data fields and attaches behavior with receiver methods (`function (t: &T) m()` / `function (t: edit &T) m()`).
3. Mutates values through `edit &` borrows and reads them through `&` borrows.
4. Transfers ownership with `move` and copies cloneable state with `clone`.
5. Performs trapping numeric computation across the full primitive type set from §5–§6.
6. Recovers from fallible operations with `as result` and `check`.
7. Emits diagnostic output through the standard library logging module (`std/log`), which is itself written in Delta and shipped with the compiler.

…and the compiler enforces, at compile time:

- Definite assignment.
- Return coverage on non-`void` functions.
- Cross-scope shadowing rejection.
- Move-state tracking (no use-after-move; no conditional moves).
- Reference exclusivity at call sites.
- Receiver-method capability rules (a `const` binding or `&T` reference cannot call an `edit`-receiver method).
- Import/export visibility (a non-`export` declaration is invisible to importers).

This is the smallest milestone past the v0 baseline that commits the compiler to Delta's safety identity *and* establishes the module system the rest of the spec depends on. It excludes the full string family, generics, interfaces, decorators, tagged unions, arrays, and slices — those are later milestones.

## Acceptance program

The acceptance program is a three-file project. If `delta build main.delta` produces a runnable executable, the executable prints the expected output, and the negative variants listed under "Success criteria" are all rejected with clear diagnostics, the goal is met.

### `counter.delta`

```delta
// `value` is heap-backed so Counter is cloneable (non-copyable) and the `move` /
// use-after-move criteria below stay meaningful. A plain `type Counter = { value: int64; }`
// would be *copyable* by structure (no `string`/`Array` exist yet in v0.5 to make a
// data record move-only). See Phase L's "records are copyable by default" note.
export type Counter = { value: heap int64; };

export function makeCounter(start: int64): Counter {
    return { value: start };
}

export function (c: &Counter) get(): int64 {
    return c.value;                 // heap auto-deref
}

export function (c: edit &Counter) add(amount: int64): void | OverflowError {
    c.value = c.value + amount as result;
    check result {
        return error as OverflowError { };
    }
    // c.value is now valid (committed only on fall-through past the check block)
    return;
}
```

### `main.delta`

```delta
import { Counter, makeCounter } from "./counter";   // methods travel with the type
import { info } from "std/log";

function bump(c: edit &Counter, amount: int64): void | OverflowError {
    c.add(amount) as result;
    check result {
        return error as OverflowError { };
    }
    return;
}

function readSum(a: &Counter, b: &Counter): int64 {
    return a.get() + b.get();
}

function consume(c: Counter): int64 {
    return c.get();
}

function main(): int8 {
    let a = makeCounter(10);
    let b = makeCounter(20);

    bump(a, 5) as result;             // auto-borrows `a` as `edit &Counter`
    check result {
        return 1;
    }
    bump(a, 7) as result;
    check result {
        return 1;
    }

    const total = readSum(a, b);       // auto-borrows both as `&Counter`
    info("total", total);

    const finalValue = consume(move a);
    info("final", finalValue);
    return 0;
}
```

### `std/log.delta` (shipped with the compiler)

The standard library module that backs the `info`/`warn`/`error` calls above. It is plain Delta source, embedded in the compiler binary and resolved when an import path begins with `std/`.

```delta
extern "c" {
    function fprintf(stream: cstringview, fmt: cstringview, ...args): int32;
    function stderr(): cstringview;
}

export function info(message: cstringview, value: int64): void {
    fprintf(stderr(), "[INFO] %s: %lld\n", message, value);
}

export function warn(message: cstringview, value: int64): void {
    fprintf(stderr(), "[WARN] %s: %lld\n", message, value);
}

export function error(message: cstringview, value: int64): void {
    fprintf(stderr(), "[ERROR] %s: %lld\n", message, value);
}
```

(The `stderr()` accessor is a thin wrapper because `stderr` is a macro/global in C; the compiler ships a one-line C shim with the stdlib. The exact shape of the shim is an implementation detail of Phase J.)

## In-scope language surface

The full feature surface required for the acceptance program, grouped by spec section. Items already implemented in v0 (see [compiler-status.md](compiler-status.md)) are listed first; everything below them is new work for v0.5.

### Already working in v0

- `function` declarations with parameters and return types.
- `const` / `let` local bindings.
- `if` / `else` / `while`.
- Integer and boolean literals.
- `int32`, `bool`, `void`.
- Unary `!`/`-`, arithmetic `+ - * /`, comparison, equality, logical operators.
- Single-return function calls.
- Name resolution and scope rules over the v0 surface.
- C codegen and clang invocation to a runnable binary.

### Phase A — Primitive type surface (§5, §6)

- Full integer set: `int8`, `int16`, `int64`, `uint8`, `uint16`, `uint32`, `uint64`, `intsize`, `uintsize`.
- `float32` and `float64`, plus floating-point literals.
- `%` (truncated division), bitwise `&` `|` `^` `~` `<<` `>>`.
- Compound assignment: `+=` `-=` `*=` `/=` `%=` `&=` `|=` `^=` `<<=` `>>=`.
- Hex (`0x...`) and binary (`0b...`) integer literals; underscore separators.
- Trapping arithmetic semantics in codegen: overflow on `+`/`-`/`*`, divide-by-zero, `int_MIN / -1`, shift count out of range, narrowing and sign-flip casts.
- `T(x)` and `T.from(x)` conversions for numeric types.
- `char` (32-bit Unicode scalar) with codepoint comparison operators only.

### Phase B — Control flow and flow analysis (§3, §6)

- `for i in lo..=hi { ... }` and `for i in lo..hi { ... }` counted loops (range form only — no `for...of`).
- `break` and `continue`.
- Definite-assignment analysis for `let name: T;` followed by later whole-value assignment.
- Return-coverage analysis on non-`void` functions.
- Cross-scope shadowing rejection per §3.4.
- Structured codegen diagnostics in `*ErrorBag` and fail-closed guards on out-of-scope constructs (the pending Phase 7 work from [compiler-status.md](compiler-status.md)).

### Phase C — Error model (§3)

- End-to-end handling of fallible signatures `T | ErrorType` and `T, U | ErrorType, OtherError`.
- `expr as resultName` binding form — runs the fallible expression; success values are bound but marked *pending* by the compiler until the matching `check` block proves the error path diverges.
- `check resultName { ... }` block — runs only when the result is in the error state. Inside the block, `resultName.error` is readable. Every control-flow path inside the block must exit via `return`, `panic`, `break`, `continue`, `process.exit`, or `unreachable`. There is no `else`. After the block, the pending success bindings become valid.
- `return error as ErrorType { ... }` — the only way to propagate an error from within a `check` block (or to produce an error from a fallible function in general).
- Codegen lowering: fallible returns become a tagged result struct in C; `as result` writes into a hidden `result` value carrying tag + success-bindings + error; `check resultName { ... }` lowers to `if (result.tag != 0) { ... }`; the analyzer guarantees the block's body diverges so fall-through past the block sees the success state.
- Built-in numeric error types tied to trap sites: `OverflowError`, `DivideByZeroError`, `NarrowingError`, `ShiftCountError`.

### Phase D — Minimal C interop for visible output (§3)

- `extern "c" { ... }` block parsing and codegen passthrough (declarations only — no body).
- Variadic parameter syntax `...args` for extern declarations only.
- `cstringview` *just enough* to pass a `"..."` literal to a C variadic — literals lower to `const char*` with a trailing NUL. The full string family (`string`, `stringview`, template literals, `StringBuilder`, `.slice()`, `ByteOffset`) is out of scope.

### Phase E — Classes (§9, §11) — *deferred to post-v0.5*

> Retained for historical context only. The `class` keyword is not part of v0.5; its role is filled by Phase K (records) + Phase L (receiver methods). The surface below describes what a future classes phase reintroduces.

- `class Name { ... }` declarations.
- Fields private by default; explicit `public` / `private` access modifiers.
- Class literal `Name { field: value; ... }` legal **only inside the class body** (§9).
- Static functions: `public static name(...)` for construction and utilities.
- Instance methods with implicit `this`.
- `edit` method marker for mutating receivers.
- Method dispatch rules: a `const` binding may only call non-`edit` methods; a `let` binding or an `edit &` reference may call both.
- Recursive read-only-ness of `const` bindings through fields, per §11.
- Single namespace per class — no name collision between fields and methods; overloading within methods is allowed.
- Automatic field disposal at scope exit, emitted by the compiler.
- Excluded from v0.5, per spec: inheritance, nested classes, static fields, constructors, `==` operator, `uses Disposable` custom dispose hook, `uses Copyable`/`uses Cloneable` user-supplied hooks.

### Phase F — Ownership and move semantics (§13, §14)

- Resource ownership is inferred transitively from built-in ownership roots; there is no `owned type` keyword. Every resource-owning record is non-Copyable.
- Every non-Unique record is Cloneable. A record is Copyable iff every member is Copyable; Unique is declared with `unique type` or propagated from Unique members.
- Tier-directed implicit duplication: a bare assignment or by-value argument copies a Copyable value, deep-clones an Owned value, and transfers a Unique value. Ordinary code names no ownership operation.
- `move x` expression — whole-name only, live owned binding. Required nowhere; its job is opting an Owned value out of implicit cloning, and restating a Unique transfer for the reader.
- Use-after-move as a compile error with source location.
- Move-state tracking per binding across straight-line code, `if`/`else`, `while`, and `for`.
- Conditional moves compile via runtime drop flags: a binding moved on some paths but not all is disposed under a hidden `bool` at cleanup points. Flags are emitted only where the state is genuinely ambiguous. *Using* such a binding remains a compile error — flags make it disposable, not usable.
- Revival of a moved-from binding via whole-value reassignment.
- Implicit `return` move of owned locals and owned by-value parameters, including clone elision for Owned returns.
- `clone x as result` expression for cloneable types — explicitly fallible, and the only way to handle allocation failure; every other clone form aborts.
- Auto-borrow outranks by-value for non-Copyable arguments, confining implicit clone to callees that genuinely demand ownership.
- Auto-derived clone for non-Copyable Cloneable records (recursive, transactional); Copyable records clone by plain copy.
- Unique values cannot clone.
- Receiver-based custom cleanup only on explicitly Unique records: `function (x: edit &T) dispose(): void`; it is compiler-invoked and cannot be called manually.
- Automatic reverse-order field disposal for all owned records, with moved-from owners skipped.
- Disposal of `const`-bound owned values at scope exit, emitted by the compiler.
- Excluded from v0.5: user-supplied copy/clone hooks, partial moves, and implicit last-use moves.

### Phase G — Safe borrows and views (§12, §15)

- `&T` and `edit &T` borrow types.
- Contextual auto-borrowing at calls: a bare addressable `T` argument satisfies `&T` or `edit &T` according to the selected parameter type. Explicit `&x` / `edit &x` remains available for disambiguation and non-call borrow expressions.
- Capability rule: a `const` binding produces `&` only; a `let` binding produces both.
- Many overlapping `&` borrows or one exclusive `edit &` borrow; a live borrow also excludes moving its source.
- Views are borrows: `&T[]`, `edit &T[]`, and `&string`; no separate `Slice<T>` / `stringview` ownership category.
- Returned and stored borrows are tied to concrete sources. Inferable cases use elision; ambiguous cases use `viewing <source>` rather than abstract lifetime variables.
- Borrows cannot satisfy by-value parameters and never own, move, clone, or dispose their source.

### Phase H — `heap T` indirection (§8, §9, §13) — narrow slice

- `heap T` parameter and field types (no top-level `heap T` locals required for v0.5).
- Heap allocation in codegen as single-owner; not reference-counted.
- Auto-deref of `heap T` when accessing fields and calling methods.
- Owner disposal frees the heap allocation at scope exit; field disposal cascades.
- *Use case for v0.5:* enables a record to own a large value or a recursive field without yet introducing arrays or generic collections.

### Phase I — Multi-file modules (§1)

- One file = one module; file path determines module identity.
- `export` modifier on top-level `function`, `class`, and `const` declarations. A non-`export` declaration is module-private and invisible to importers.
- `import { Name, Other } from "./relative/path";` resolves to `./relative/path.delta` relative to the importing file's directory. Path is required to begin with `./` or `../` for relative imports; bare paths are reserved for the standard library and (later) third-party packages.
- `import { Name } from "std/...";` resolves against the embedded standard library (see Phase J).
- Renaming form `import { Name as Local } from "...";` is **out of scope** for v0.5 — only the bare form is required.
- Module graph construction at build time: starting from the file passed to `delta build`, the compiler discovers transitively imported files, parses and analyzes each once, and detects cycles (rejected with a diagnostic naming the cycle path).
- Cross-module name resolution: an `import` binds the named symbol into the importing file's top scope. Importing a name that the source module did not `export` is a diagnostic.
- Codegen produces one C translation unit per Delta module: `build/c/<module-id>.c`. All TUs are passed to clang in a single invocation, plus the user's entry point becomes the program's `main`.
- Name mangling: every exported symbol is prefixed with a stable module identifier (e.g. `delta__counter__Counter_get`) to avoid collisions across TUs. Module-private symbols are emitted `static` in their TU and need no mangling beyond a per-file disambiguator.
- `delta.json` manifest is **out of scope** for v0.5 — entry-file discovery is the only project mode. Tracking issue for the manifest mode remains in `compiler-status.md`'s pending list.
- Build-output layout extends naturally: `build/c/main.c`, `build/c/counter.c`, `build/c/std__log.c`, `build/<basename>`.

### Phase J — Standard library: `std/log` (§1, new)

The standard library is plain Delta source shipped with the compiler. v0.5 includes exactly one module — `std/log` — to prove the delivery mechanism and give Delta programs a way to emit diagnostic output without writing their own `extern "c"` block.

- Stdlib sources are **embedded** in the `delta` binary at build time (Go `embed.FS`).
- Import paths beginning with `std/` resolve against the embedded FS. Any other bare path is currently a diagnostic ("unknown import root"); third-party package roots are future work.
- The embedded stdlib participates in module-graph construction exactly like user code: it is parsed, analyzed, codegen'd to a TU, and linked into the final binary. There is no privileged path.
- The compiler ships a minimal C support shim (one `.c` file with the `stderr()` accessor) co-located with the embedded `std/log.delta` source. The shim is linked in whenever `std/log` is reachable in the module graph.
- v0.5 `std/log` surface (final, minimal):
  - `export function info(message: cstringview, value: int64): void`
  - `export function warn(message: cstringview, value: int64): void`
  - `export function error(message: cstringview, value: int64): void`
  - Each writes to stderr with a level prefix (`[INFO] `, `[WARN] `, `[ERROR] `), followed by the message, `: `, the value, and a newline.
- Deliberately excluded from v0.5 logging surface: log-level filtering (compile-time or runtime), structured fields, formatters, sinks other than stderr, timestamps, message-only overloads (the `(message, value)` shape is the only form until templates land). These are straightforward additions once the string family arrives.

### Phase K — Custom record types (`type`) (§8)

- `type Name = { f1: T1; ... };` nominal record declarations, aliases (`type Y = X;`), and composition (`...` spread, `&` intersection).
- Object literals pinned by typed context; field read/write; compiler-derived structural `==`.
- The records-based substitute for class *data*. Detailed in [plans/goal-v0.5/phase-k-record-types.md](plans/goal-v0.5/phase-k-record-types.md). (Already partially landed — see commit history.)

### Phase L — Receiver methods (§8.5 amended, §9.5, §15)

- Receiver methods on records in two borrow-only forms: `function (t: &T) m(...)` (read-only) and `function (t: edit &T) m(...)` (mutable). No by-value receiver.
- Named receiver replaces `this`; call form `value.m(args)` with auto-referencing of the receiver; capability dispatch (a `const` binding or `&T` cannot call an `edit`-receiver method).
- Methods travel with the type across modules (importing `T` makes its exported methods callable); per-method `export`; method/field single namespace; same-module ("no orphan") rule.
- The records-based substitute for class *behavior*. Detailed in [plans/goal-v0.5/phase-l-receiver-methods.md](plans/goal-v0.5/phase-l-receiver-methods.md).

## Out of scope (deferred)

- Full string family (`string`, `stringview`, `cstring`, template literals, `StringBuilder`, `.slice()`, `ByteOffset`).
- `delta.json` manifest mode; only entry-file discovery is supported.
- `import { Name as Local }` rename form; `import * as ns from "..."` namespace form; re-exports.
- Third-party package roots (anything besides `./...`, `../...`, and `std/...`).
- Standard library modules beyond `std/log` (no `std/io`, no `std/collections`, no `std/unicode` for v0.5).
- Log-level filtering, structured fields, custom sinks, timestamps — anything beyond the three `(message, value)` functions.
- `Wrap<T>` and `Saturate<T>` numeric tags.
- Generics, interfaces, decorators.
- Tagged unions (`type U = A | B`) and `switch type`.
- `for...of`, arrays, slices.
- The `class` keyword and everything class-only: invariant-protected construction, user-authored `dispose()`, user-declared `unique` leaf resources, static methods, private-by-default fields, inheritance, nested classes, static fields, user-defined `==`. Deferred to post-v0.5; records (Phase K) + receiver methods (Phase L) cover the MVP. Leaf resources needing custom teardown are stdlib-provided.
- Incremental compilation, release/debug modes, sanitizers, bundled clang. (Name mangling *is* in scope — see Phase I.)

## Recommended phasing

Implementing all of A–J in one pass is too large to land cleanly. The recommendation is to split along the line where the error model ends and the ownership story begins. Modules and the standard library land **early in v0.5a** because every later phase benefits from being able to factor code across files, and `std/log` is the cleanest way to give Delta programs visible output without each one re-declaring `printf`.

### v0.5a — Modules, numeric breadth, records, error model

Phases **I (modules), D (extern), J (std/log), A, B, C, K** — roughly in that order. At the end of v0.5a:

- Multi-file projects build: `delta build main.delta` discovers and compiles transitively imported `.delta` files, emits one C TU per module, and links them through a single clang invocation.
- The embedded `std/log` module is importable and works as the canonical way to emit diagnostic output.
- The full primitive type surface is type-checked and lowered correctly.
- Definite assignment, return coverage, and shadowing are enforced.
- Fallible signatures and `check` / `as result` are end-to-end, including the tagged-result C lowering.
- `type` records work as inline value types with fields, composition, object literals, and structural `==`.
- `extern "c"` allows declaring C functions for use by stdlib and (where needed) user code.

The intentionally-unsound gap at the end of v0.5a: passing a record by value emits a plain struct copy. There is no `move`, no `clone`, no reference checker yet, so the compiler does not stop you from using a "moved-from" binding. v0.5b closes this gap. (Phase K records hold only primitives until `heap T` lands, so the gap is silent rather than unsound at this point.)

### v0.5b — Ownership, references, receiver methods, heap indirection

Phases **F (ownership), G (references), L (receiver methods), H (`heap T`)**. At the end of v0.5b:

- Move state is tracked per binding; use-after-move is a compile error.
- `move x` and `clone x` are the only ways to transfer or duplicate move-only values.
- `&` and `edit &` parameters auto-borrow bare addressable arguments, with root-based exclusivity at call sites.
- Receiver methods attach behavior to records, with capability-checked `&` / `edit &` receivers and auto-borrowing at call sites.
- `heap T` enables owning indirection with automatic disposal.
- The struct-copy hole from v0.5a becomes a compile error and is replaced by the real ownership story.

Each sub-milestone is independently demonstrable: v0.5a can run a multi-file numeric program that logs via `std/log`; v0.5b can run the full acceptance program above with all safety guarantees enforced.

## Success criteria

The goal is reached when, on a clean checkout, with `main.delta` and `counter.delta` from the acceptance program above placed in a project directory:

1. `delta build main.delta` produces `build/main` with no diagnostics, after discovering and compiling `counter.delta` and the embedded `std/log` module.
2. `./build/main` writes exactly the following to **stderr**:

   ```text
   [INFO] total: 42
   [INFO] final: 22
   ```

   and exits with status `0`.
3. A variant of the program that reads `a` after `consume(move a)` fails `delta build` with a diagnostic that names the moved binding and points at both the `move` site and the use site.
4. A variant that calls `c.add(...)` through a `&Counter` (instead of `edit &Counter`) fails with a capability diagnostic.
5. A variant that passes `a` twice to parameters `(edit &Counter, &Counter)` fails with a borrow-exclusivity diagnostic after contextual auto-borrowing.
6. A variant that omits `check` on a fallible call fails with an unhandled-fallible diagnostic.
7. A variant that imports a symbol `counter.delta` does **not** `export` fails with a visibility diagnostic.
8. A variant that creates an import cycle between two user modules fails with a diagnostic naming the cycle path.
9. A variant that imports from `"foo/bar"` (bare path, not `./...` or `std/...`) fails with an "unknown import root" diagnostic.

After v0.5, the remaining sections of the spec (full string family, generics, tagged unions, arrays/slices, interfaces, additional stdlib modules, `delta.json` manifests) can be added one pass at a time without restructuring the compiler.
