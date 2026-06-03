# Delta Compiler Goal — v0.5

Date drafted: 2026-06-03
Status: target, not started.
Predecessor: [compiler-status.md](compiler-status.md) — the v0 baseline this goal extends.
Spec basis: [main-spec.md](main-spec.md) plus the section files under [spec-sections/](spec-sections/), in particular §3, §5, §6, §9, §11, §12, §13, §14.

## Goal

A user can write a single-file Delta program that:

1. Defines classes with private state and public methods.
2. Mutates instances through `mod borrowed` references and reads them through `borrowed` references.
3. Transfers ownership with `move` and copies cloneable state with `clone`.
4. Performs trapping numeric computation across the full primitive type set from §5–§6.
5. Recovers from fallible operations with `as result` and `check`.
6. Prints results to stdout via `extern "c"` interop with `printf`.

…and the compiler enforces, at compile time:

- Definite assignment.
- Return coverage on non-`void` functions.
- Cross-scope shadowing rejection.
- Move-state tracking (no use-after-move; no conditional moves).
- Borrow exclusivity at call sites.
- Class capability rules (`const` binding cannot call `mod` methods).

This is the smallest milestone past the v0 baseline that commits the compiler to Delta's safety identity. It deliberately stays inside the single-file, single-TU world and excludes modules, the full string family, generics, interfaces, decorators, tagged unions, arrays, and slices — those are later milestones.

## Acceptance program

The following program is the success criterion. If it compiles under `delta build`, runs to completion, prints `42` and then `22`, **and** a variant that uses `a` after `move a` is rejected at compile time with a clear diagnostic, the goal is met.

```delta
extern "c" {
    function printf(fmt: cstringview, ...args): int32;
}

class Counter {
    private value: int64;

    public static new(start: int64): Counter {
        return Counter { value: start };
    }

    public get(): int64 {
        return this.value;
    }

    public mod add(delta: int64): void | OverflowError {
        this.value = check (this.value + delta) as result;
    }
}

function bump(c: mod borrowed Counter, amount: int64): void | OverflowError {
    check c.add(amount);
}

function readSum(a: borrowed Counter, b: borrowed Counter): int64 {
    return a.get() + b.get();
}

function consume(c: Counter): int64 {
    return c.get();
}

function main(): int32 {
    let a = Counter.new(10);
    let b = Counter.new(20);

    check bump(mod borrowed a, 5);
    check bump(mod borrowed a, 7);

    const total = readSum(borrowed a, borrowed b);
    printf("%lld\n", total);

    const final = consume(move a);
    printf("%lld\n", final);
    return 0;
}
```

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
- `expr as result` expression — produces a pending fallible value.
- `check expr` expression and `check { ... }` block — unwraps or propagates.
- Codegen lowering: fallible returns become a tagged result struct in C; `check` becomes a branch that either continues or returns the error.
- Built-in numeric error types tied to trap sites: `OverflowError`, `DivideByZeroError`, `NarrowingError`, `ShiftCountError`.

### Phase D — Minimal C interop for visible output (§3)

- `extern "c" { ... }` block parsing and codegen passthrough (declarations only — no body).
- Variadic parameter syntax `...args` for extern declarations only.
- `cstringview` *just enough* to pass a `"..."` literal to a C variadic — literals lower to `const char*` with a trailing NUL. The full string family (`string`, `stringview`, template literals, `StringBuilder`, `.slice()`, `ByteOffset`) is out of scope.

### Phase E — Classes (§9, §11)

- `class Name { ... }` declarations.
- Fields private by default; explicit `public` / `private` access modifiers.
- Class literal `Name { field: value; ... }` legal **only inside the class body** (§9).
- Static functions: `public static name(...)` for construction and utilities.
- Instance methods with implicit `this`.
- `mod` method marker for mutating receivers.
- Method dispatch rules: a `const` binding may only call non-`mod` methods; a `let` binding or a `mod borrowed` reference may call both.
- Recursive read-only-ness of `const` bindings through fields, per §11.
- Single namespace per class — no name collision between fields and methods; overloading within methods is allowed.
- Automatic field disposal at scope exit, emitted by the compiler.
- Excluded from v0.5, per spec: inheritance, nested classes, static fields, constructors, `==` operator, `uses Disposable` custom dispose hook, `uses Copyable`/`uses Cloneable` user-supplied hooks.

### Phase F — Ownership and move semantics (§13, §14)

- Move-only by default for class instances.
- `move x` expression — whole-name only, live owned binding.
- Use-after-move as a compile error with source location.
- Move-state tracking per binding across straight-line code, `if`/`else`, `while`, and `for`.
- Conditional-move rejection: a binding moved on some paths but not all is an error at the merge point; diverging paths (those that `return`, `break`, `continue`, `panic`, or `process.exit`) are exempt.
- Revival of a moved-from binding via whole-value reassignment.
- Implicit `return` move of owned locals and owned by-value parameters.
- `clone x` expression for cloneable types — fallible, consumed via `as result`.
- Auto-derived clone for class instances whose fields are all copyable or cloneable (recursive, transactional).
- Copyable tier for primitives, `bool`, `char`, and views: plain assignment copies.
- Disposal of `const`-bound owned values at scope exit, emitted by the compiler.
- Excluded from v0.5: user-supplied `uses Cloneable` and `uses Disposable` hooks.

### Phase G — Safe borrows (§12)

- `borrowed T` and `mod borrowed T` parameter types.
- `borrowed x` and `mod borrowed x` at call sites — named storage paths only (binding or `binding.field` chain). No temporaries, no expressions.
- Capability rule: a `const` binding produces `borrowed` only; a `let` binding produces both.
- Root-based exclusivity check across a single call's argument list: many `borrowed` references or one `mod borrowed` reference on overlapping roots, never both.
- Method dispatch through borrows respects capability — `borrowed Counter` cannot call `mod` methods.
- Borrows cannot satisfy by-value parameters.
- Borrows cannot escape: no returning them, no storing them in fields, no binding them to outer-scope `let`s.

### Phase H — `heap T` indirection (§8, §9, §13) — narrow slice

- `heap T` parameter and field types (no top-level `heap T` locals required for v0.5).
- Heap allocation in codegen as single-owner; not reference-counted.
- Auto-deref of `heap T` when accessing fields and calling methods.
- Owner disposal frees the heap allocation at scope exit; field disposal cascades.
- *Use case for v0.5:* enables a class to own a large value or a recursive field without yet introducing arrays or generic collections.

## Out of scope (deferred)

- Full string family (`string`, `stringview`, `cstring`, template literals, `StringBuilder`, `.slice()`, `ByteOffset`).
- Modules, imports, exports, multi-file translation units, `delta.json` manifests.
- `Wrap<T>` and `Saturate<T>` numeric tags.
- Generics, interfaces, decorators.
- Tagged unions (`type U = A | B`) and `switch type`.
- `type` record declarations.
- `for...of`, arrays, slices, object literals (beyond class literals).
- User-supplied `uses Disposable`, `uses Copyable`, `uses Cloneable` hooks.
- Inheritance, nested classes, static fields, user-defined `==`.
- Incremental compilation, name mangling, release/debug modes, sanitizers, bundled clang.

## Recommended phasing

Implementing all of A–H in one pass is too large to land cleanly. The recommendation is to split along the line where the error model ends and the ownership story begins:

### v0.5a — Numeric breadth, classes as inline values, error model

Phases **A, B, C, D, E**. At the end of v0.5a:

- The full primitive type surface is type-checked and lowered correctly.
- Definite assignment, return coverage, and shadowing are enforced.
- Fallible signatures and `check` / `as result` are end-to-end, including the tagged-result C lowering.
- Classes work as inline value types with public/private members, static functions, and `mod` methods.
- `extern "c"` allows printing through `printf`.

The intentionally-unsound gap at the end of v0.5a: passing a class by value emits a plain struct copy. There is no `move`, no `clone`, no borrow checker yet, so the compiler does not stop you from using a "moved-from" binding. v0.5b closes this gap.

### v0.5b — Ownership, borrows, heap indirection

Phases **F, G, H**. At the end of v0.5b:

- Move state is tracked per binding; use-after-move is a compile error.
- `move x` and `clone x` are the only ways to transfer or duplicate move-only values.
- `borrowed` and `mod borrowed` parameters work, with root-based exclusivity at call sites.
- `heap T` enables owning indirection with automatic disposal.
- The struct-copy hole from v0.5a becomes a compile error and is replaced by the real ownership story.

Each sub-milestone is independently demonstrable: v0.5a can run a numeric program that prints via `printf`; v0.5b can run the full acceptance program above with all safety guarantees enforced.

## Success criteria

The goal is reached when, on a clean checkout:

1. `delta build acceptance.delta` produces `build/acceptance` with no diagnostics.
2. `./build/acceptance` prints exactly:

   ```text
   42
   22
   ```

3. A variant of the program that reads `a` after `consume(move a)` fails `delta build` with a diagnostic that names the moved binding and points at both the `move` site and the use site.
4. A variant that calls `c.add(...)` through a `borrowed Counter` (instead of `mod borrowed Counter`) fails with a capability diagnostic.
5. A variant that passes `mod borrowed a` and `borrowed a` to the same call fails with a borrow-exclusivity diagnostic.
6. A variant that omits `check` on a fallible call fails with an unhandled-fallible diagnostic.

After v0.5, the remaining sections of the spec (full string family, modules, generics, tagged unions, arrays/slices, interfaces) can be added one pass at a time without restructuring the compiler.
