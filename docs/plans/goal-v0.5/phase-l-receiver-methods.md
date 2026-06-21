# Plan: Phase L — Receiver Methods on Records (classes deferred)

Date drafted: 2026-06-21
Status: planning, not started.
Predecessor: Phase **K** (records) provides the `type` declaration, `MemberAccessExpression`, and struct codegen this phase attaches behavior to. Phase **G** (`&T` / `edit &T` references) provides the receiver forms and the call-site reference machinery. Phase **F** (ownership/move) and Phase **C** (error model) are assumed landed where the acceptance program exercises them; Phase **H** (`heap T`) is needed only for the move-demonstration variant.
Successor: a future, post-v0.5 **classes** phase reintroduces invariant-protected, move-only, custom-`dispose` types. Nothing in v0.5 depends on it.
Spec basis: [spec-sections/08-type-declarations.md](../../spec-sections/08-type-declarations.md) §8.5 (**amended** — see "Spec changes"), [spec-sections/09-classes.md](../../spec-sections/09-classes.md) §9.4–§9.5 (method/`edit`/capability rules, lifted onto records), [spec-sections/14-ownership-and-move-semantics.md](../../spec-sections/14-ownership-and-move-semantics.md) §14.1 (structural tiers), [spec-sections/15-lifetimes.md](../../spec-sections/15-lifetimes.md) (`@lifetime` on receiver-returning methods).

## Why this phase exists

The v0.5 goal originally landed user-defined behavior through **classes** (Phase E). This phase replaces that plan for the MVP: **classes are deferred to post-v0.5**, and their day-to-day role is split between two features that are individually smaller and that the rest of the compiler already needs:

- **Data + composition** → `type` records (Phase K, already designed).
- **Behavior + mutation marking** → Go-style **receiver methods** (this phase).

The motivation is the memory-management model. In Delta's decided ownership model (§14.1, structural-tier inference, only `unique class` explicit), almost the entire memory story is *structural* and applies to `type` records identically to classes: the three tiers (copyable / cloneable / unique-by-structure), the three operations (`assignment` copies / `move` / `clone`), automatic LIFO field disposal, and the reference/lifetime system. The **only** things classes carry that records do not are:

1. user-authored custom cleanup (`dispose()`), and
2. the ability to declare a *leaf* resource `unique` (records become unique only by *containing* something already unique).

Both are deferred with classes. Leaf resources that need custom teardown (file handles, sockets, locks) are **stdlib-provided** types in v0.5 — compiler-known, with built-in disposal — so user code never needs to author a destructor. See "Memory-management model without classes" below.

Receiver methods recover the *ergonomic* half of classes (behavior, `edit` mutation marking, capability-based dispatch) without reintroducing invariant-protected construction, `unique` declaration, or destructors. They also directly serve the self-hosting goal: an AST expressed as records with `node.accept()` / `expr.typeOf()` methods reads far better than free functions over tagged data.

## Goal

A user can attach methods to a `type` record with a receiver clause, in two reference-only forms, and call them with `value.method(args)`:

```ts
function (t: &T) m(): R { ... }        // read-only receiver  (t behaves as &T)
function (t: edit &T) m(): R { ... }   // mutable receiver    (t behaves as edit &T)
```

There is **no by-value receiver**: a by-value receiver on a non-copyable record would silently consume it on an ordinary-looking `x.m()`, exactly the hidden ownership move §14 forbids, and "consuming `this`" is already a spec non-goal (§9.11).

After Phase L, this three-file project compiles, runs, and prints the expected output:

### `counter.delta`

```delta
// `value` is heap-backed so Counter is cloneable (non-copyable) and the
// `move` / use-after-move story below is meaningful. A plain
// `type Counter = { value: int64; }` would be *copyable* by structure
// (see "Consequence: records are copyable by default").
export type Counter = { value: heap int64; };

export function makeCounter(start: int64): Counter {
    return { value: start };
}

export function (c: &Counter) get(): int64 {
    return c.value;                 // heap auto-deref (Phase H)
}

export function (c: edit &Counter) add(amount: int64): void | OverflowError {
    c.value = c.value + amount as result;
    check result {
        return error as OverflowError { };
    }
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

function main(): int32 {
    let a = makeCounter(10);
    let b = makeCounter(20);

    bump(edit &a, 5) as result;
    check result { return 1; }
    bump(edit &a, 7) as result;
    check result { return 1; }

    const total = readSum(&a, &b);     // 22 + 20
    info("total", total);

    const finalValue = consume(move a);
    info("final", finalValue);
    return 0;
}
```

Expected stderr: `[INFO] total: 42` then `[INFO] final: 22`, exit `0`.

## In-scope language surface

- **Receiver clause** on a function declaration: `function (name: &T) m(...)` and `function (name: edit &T) m(...)`. The receiver is a normal `name: Type` binding whose type is a reference (`&T` / `edit &T`) to a **record** type.
- **Named receiver replaces `this`.** The method body refers to the receiver by its declared name (`c`, `self`, etc.); `this` is not introduced for record methods.
- **Call form** `value.m(args)` and `ref.m(args)`, with **auto-referencing** of the receiver at the call site:
  - `x.m()` for a `&T`-receiver method forms `&x` implicitly.
  - `x.m()` for an `edit &T`-receiver method forms `edit &x` implicitly (requires `x` mutable).
  - When the receiver expression is already a reference (`r.m()` where `r: &T` / `edit &T`), that reference is used directly.
- **Capability dispatch** (lifted from §9.5):

  | Receiver storage | May call `&T`-receiver methods | May call `edit &T`-receiver methods |
  |---|---:|---:|
  | `let x` | yes | yes |
  | `const x` | yes | no |
  | `edit &T` | yes | yes |
  | `&T` | yes | no |

- **Methods travel with the type.** A method on type `T` must be declared in the **same module** as `T` ("no orphan methods"). Importing `T` makes its exported methods callable through any `T` value/reference; method names are **not** imported separately.
- **Per-method `export`.** `export function (c: &Counter) get()` is callable from importing modules; an unexported method is module-private (callable only within `T`'s module). This mirrors §9.4's "exporting a class exports its public member surface," adapted to top-level declarations.
- **Method/field namespace.** A method name may not collide with a field name of the same record (§9.4 single-namespace rule). Methods may **overload** by signature under the existing free-function overload rules (§3.7) — no new overload machinery.
- **`@lifetime` on receiver methods.** A method returning a reference/view into the receiver gets a compiler-generated `@lifetime(...)` that names the **receiver** (`@lifetime(c)` / `@lifetime(lexeme: c.source)`), replacing §15's special `this` / `this.source` casing. Lands with / after Phase G+§15.

## Explicitly out of scope for Phase L

| Feature | Reason | Eventual home |
|---|---|---|
| `class` keyword and class declarations | Deferred for MVP; this phase is the records-based substitute. | Post-v0.5 classes phase. |
| By-value receivers (`function (t: T) m()`) | Would consume a non-copyable receiver on a plain `x.m()`; "consuming `this`" is a §9.11 non-goal. | Never (by design). |
| Custom cleanup / `dispose()` on records | Records have no destructor hook; resources with custom teardown are stdlib-provided in v0.5. | Post-v0.5 classes / `unique`. |
| User-declared `unique` records (`unique type`) | Records are unique only *by structure*; no leaf-unique declaration without classes. | Post-v0.5 classes / `unique`. |
| Static methods (`function T.create()`) | Construction stays object literals (Phase K) + free factory functions. | Never for records. |
| Private-by-default fields / invariant-protected construction | Records are transparent (Phase K, §8.5); encapsulation comes from module privacy + factory functions. | Classes. |
| First-class / bound method values (`x.m` as a value) | Receiver-capture + lifetime questions belong to the closure design (§9.5 non-goal). | Post-v0.5. |
| Moving the receiver out / consuming methods | Receiver is a non-owning reference; cannot move out (§9.8 / §14). | Classes. |
| `==` derived from methods | Record `==` is the structural operator from Phase K (§8.9); methods don't change it. | n/a. |

## Memory-management model without classes

This is the section the decision turns on. With only records + receiver methods + functions:

**Fully intact (structural, applies to records exactly as to classes):**
- **Tiers** — a record is copyable iff all fields are, cloneable iff it owns cloneable storage (`heap T`, and later `string` / `Array`), unique-by-structure if it contains a unique field or `edit &T` (§14.1).
- **The three operations** — assignment copies copyable records; `move` transfers cloneable/unique records; `clone` deep-copies cloneable records. Plus all discipline (no partial moves, revival, move-state at joins, pending fallible results) — all structural (Phase F).
- **Automatic disposal** — reverse-declaration-order field teardown + LIFO across bindings, for every owned value. A record holding `heap T` (and later `string` / `Array`) is freed automatically with no `dispose`.
- **References & lifetimes** — `&T` / `edit &T` / views and `@lifetime(...)` are reference features, not class features; records carry them fully (§15 already says "Classes **and `type` records** may contain reference fields").

**Deferred with classes:**
- **User-authored custom cleanup** (`dispose`) — no user-defined RAII for non-memory resources.
- **User-declared leaf `unique` resources** — covered by **stdlib-provided** resource types (compiler-known, built-in disposal, unique by construction). User code that needs a file/socket/lock uses the stdlib type; it does not author a destructor.

**Net:** any program whose resources are *memory* (managed by `heap T` and the stdlib owning types) is fully and safely handled in v0.5 with zero `dispose` and zero `unique` declarations.

### Consequence: records are copyable by default

A plain `type Counter = { value: int64; }` is **copyable** by structure, so `move` is redundant on it and use-after-move does not apply. The original class-based acceptance program relied on classes being move-only by default. To keep the move / use-after-move success criteria meaningful in v0.5 (no `string` / `Array` yet — those are deferred), the acceptance `Counter` owns a `heap int64`, which makes it cloneable (non-copyable). This is a deliberate, documented shift from the class version, not an accident.

## Spec changes

- **§8.5** currently states behavior lives in free functions or classes and that `type` declarations carry **no methods**. This phase **amends** §8.5: a `type` record may have associated receiver methods declared as top-level `function (recv: &T | edit &T) name(...)` forms. The "no methods *inside* the `{ ... }` body" rule from Phase K is unchanged — methods are external, receiver-style, never written in the field list.
- **§9.5** method semantics (the `edit` marker, capability matrix, auto-deref through `heap T`) are reused for records, with the receiver named explicitly instead of an implicit `this`.
- **§15** receiver provenance in `@lifetime(...)` uses the receiver name; the `this` / `this.source` special forms become ordinary named-source paths.

## Tokenizer changes

None. `function`, `&`, `edit`, `:`, `.`, and `(` `)` already exist (`edit` from §15/Phase G; `&` is the reference marker in type position). The receiver clause reuses existing tokens.

## Parser changes

- **Receiver clause.** After `function`, if the next token is `(`, parse a receiver parameter `name : ReferenceType` and a closing `)`, then the method name, then the ordinary parameter list. Disambiguation is by lookahead: `function (` → method-with-receiver; `function NAME(` → ordinary free function.
- **AST.** Add an optional receiver to the existing function-declaration node:
  ```go
  type ReceiverParam struct {
      Name     string
      Type     TypeReference   // must resolve to &Record or edit &Record
      Position Position
  }

  type FunctionDeclaration struct {
      Receiver *ReceiverParam   // nil for free functions
      Name     string
      Params   []Parameter
      // ... existing fields (return types, body, Exported, Position)
  }
  ```
- The receiver type reuses Phase G's reference-type parsing (`&T`, `edit &T`). A receiver whose type is not a reference, or whose referent is not a record, is rejected in the analyzer (parser accepts the shape).
- No change to the call grammar: `expr.identifier(args)` already parses as a call on a `MemberAccessExpression` (Phase K). Whether that member is a field or a method is resolved in the analyzer.

## Semantic analyzer changes

- **Method registration.** During declaration registration, a `FunctionDeclaration` with a non-nil `Receiver` is recorded in a per-record method table keyed by `(record *UserRecord, methodName)`, carrying the receiver mutability (`&` vs `edit &`), parameter/return signature, and `Exported` flag. Overloads accumulate under one name (existing overload-set machinery).
- **Receiver validation.**
  - Receiver type must resolve to `&R` or `edit &R` where `R` is a `TypeUserRecord` → else "method receiver must be `&Record` or `edit &Record`".
  - `R` must be declared in the **same module** as the method → else "orphan method: `R` is defined in another module" (the no-orphan rule).
  - Method name must not collide with a field of `R` → else "method `m` collides with field `m` on `R`" (§9.4).
- **Body checking.** The receiver name is bound in the method's top scope as a `&R` / `edit &R` local. Inside the body, `c.field` reads/writes go through the reference (writes require an `edit &R` receiver, reusing Phase G's L-value-through-reference rules). An `edit &R`-receiver method may mutate fields; a `&R`-receiver method may not (the existing read-only-reference check).
- **Method-call resolution.** For a `MemberAccessExpression` `recv.m` in call position:
  1. Resolve `recv`'s type to a record `R` (following references/`heap` auto-deref).
  2. If `m` is a method of `R` (visible: same module, or `Exported` for cross-module) → method call. Otherwise fall back to field access (Phase K) → and if `m` is neither field nor method, "type `R` has no field or method `m`".
  3. **Auto-reference + capability.** Form the receiver reference required by the resolved overload: `&recv` for a `&R` method, `edit &recv` for an `edit &R` method. If the method needs `edit &` but `recv` is `const` / a `&R` reference, reject with the capability diagnostic ("cannot call `edit`-receiver method `m` through a read-only receiver"). If `recv` is already a reference, use it directly (and check its mutability).
  4. Exclusivity: the auto-formed `edit &recv` participates in Phase G's call-argument exclusivity check exactly like an explicit `edit &` argument.
- **Cross-module visibility.** An `import { R } from "..."` binds `R` and makes its `Exported` methods callable. Method names are not separately importable; an attempt to `import { get }` for a method name is "`get` is a method of `Counter`, not an importable symbol; import `Counter`."
- **`@lifetime` (with Phase G/§15).** A method returning a reference/view derived from the receiver gets the compiler-generated annotation naming the receiver. Drift between body and generated annotation is the standard §15 error.

## Codegen changes

- **Method lowering.** A receiver method lowers to a free C function whose first parameter is the receiver pointer:
  ```c
  // function (c: &Counter) get(): int64
  int64_t delta__counter__Counter_get(const delta__counter__Counter* c) { ... }

  // function (c: edit &Counter) add(amount: int64): ...
  /* result struct */ delta__counter__Counter_add(delta__counter__Counter* c, int64_t amount) { ... }
  ```
  `&R` → `const delta__...*`, `edit &R` → `delta__...*`. Mangling reuses Phase I's module-prefixed scheme (`delta__<module>__<Record>_<method>`); module-private methods are emitted `static`.
- **Call lowering.** `x.m(args)` → `delta__..._m(&x, args)` for a `&` method, `delta__..._m(&x, args)` with a non-const pointer for an `edit &` method (the C `&x` is the same; constness differs at the parameter). When the receiver is already a reference, pass it through. Field auto-deref through `heap T` reuses Phase H's lowering.
- **Body lowering.** `c.field` inside a method → `c->field` (receiver is a pointer), with `heap T` field auto-deref unchanged from Phase H.
- No new struct/equality machinery — those are Phase K's.

## Testing strategy

New fixtures under `test-source/tests/codegen/methods/`.

**Read-only receiver (3)**
- `method_read_ok` — `function (c: &Counter) get()` called on a `let` and a `const` binding.
- `method_read_through_ref_ok` — called through a `&Counter` parameter.
- `method_chain_ok` — `a.get() + b.get()`.

**Mutable receiver (3)**
- `method_edit_ok` — `function (c: edit &Counter) add()` mutates through a `let` binding.
- `method_edit_through_editref_ok` — called through an `edit &Counter` parameter.
- `method_auto_edit_ref_ok` — `c.add(1)` auto-forms `edit &c` (no explicit `edit &`).

**Capability rejections (3)**
- `method_edit_on_const_err` — `edit`-receiver method on a `const` binding rejected.
- `method_edit_through_readonly_ref_err` — `edit`-receiver method through a `&Counter` rejected.
- `method_edit_ref_exclusivity_err` — auto-`edit &` receiver collides with another `&`/`edit &` arg in the same call.

**Resolution / namespace (4)**
- `method_vs_field_collision_err` — method name equals a field name.
- `orphan_method_err` — method whose receiver record is defined in another module.
- `unknown_member_err` — `x.nope()` where `nope` is neither field nor method.
- `by_value_receiver_err` — `function (c: Counter) m()` rejected ("receiver must be a reference").

**Cross-module (2)**
- `imported_type_methods_ok` — import `Counter`, call `.get()` / `.add()` from another module.
- `import_method_name_err` — `import { get } from "./counter"` rejected.

**Lifetime (1, gated on Phase G/§15)**
- `method_returns_receiver_ref_ok` — `@lifetime(c)`-annotated method returning `&c.field`.

**End-to-end (1)**
- `acceptance_counter_ok` — the three-file program above builds, runs, prints the two `[INFO]` lines, exits `0`.

All earlier-phase fixtures continue to pass.

## Stage-by-stage implementation order

1. Parser: receiver clause + `ReceiverParam` AST, `function (` lookahead disambiguation. Confirm free-function parsing is unchanged.
2. Analyzer: method registration table, receiver validation (reference-to-record, same-module, no field collision).
3. Analyzer: method body checking — bind receiver name, route field read/write through the reference, enforce `edit` requirement for mutation.
4. Analyzer: method-call resolution on `MemberAccessExpression` — method-vs-field disambiguation, auto-reference, capability + exclusivity checks.
5. Analyzer: cross-module visibility (methods travel with the type; reject method-name imports).
6. Codegen: method lowering (receiver pointer param, mangling), call-site lowering with auto-`&` / `edit &`, body `c->field` lowering.
7. Analyzer/codegen: `@lifetime` on receiver-returning methods (gate on Phase G/§15; can land in a follow-up if G is not yet in).
8. Fixture suite, including the end-to-end acceptance program.

Steps 1 and 4 are the load-bearing ones: the `function (` lookahead and the method-vs-field call resolution with auto-referencing.

## Risks and open questions

- **`function (` lookahead.** The parser must distinguish a receiver clause from a parenthesized return/expression context. Mitigation: the receiver clause is only legal immediately after `function`, before the method name, so the lookahead is local (`function` `(` `ident` `:` …). A focused parser test covers `function (c: &T) m()` vs `function m()`.
- **Auto-reference vs explicit `edit &`.** Auto-forming `edit &recv` for an `edit` method must feed the *same* exclusivity checker as an explicit `edit &` argument, or a method call could alias around the reference rules. Mitigation: lower the auto-reference into the identical Phase G call-argument path; reuse its fixtures.
- **Method-vs-field ambiguity at call position.** `x.m()` where `m` is a field of function type is not possible in v0.5 (no first-class functions / function-typed fields), so `x.m(...)` is unambiguously a method call and `x.m` (no call) is unambiguously a field read. Note this assumption so it is revisited if function-typed fields ever land.
- **Copyable-default `Counter`.** Reviewers expecting the class-era move-only `Counter` will be surprised the plain-record version is copyable. Mitigation: the acceptance program uses a `heap int64` field and the "Consequence" note explains why; the goal doc carries the same note.
- **Encapsulation gap.** Transparent records expose fields even when methods exist; a caller can bypass a method and write `c.value` directly. v0.5 accepts this — module privacy (unexported record + exported factory) is the available mitigation, and full invariant protection returns with classes. Flag in docs so it is a known, intentional limitation rather than a surprise.
- **`@lifetime` ordering.** If Phase G/§15 has not fully landed, receiver-returning methods are out of scope until it does; the rest of the phase (value-returning and `void` methods) is independent of lifetimes. Mitigation: gate step 7 separately.

## Definition of done

- The three-file acceptance program builds with no diagnostics, runs, writes `[INFO] total: 42` and `[INFO] final: 22` to stderr, and exits `0`.
- All Phase L fixtures pass; all earlier-phase fixtures continue to pass.
- Receiver methods lower to module-prefixed free C functions taking a receiver pointer (`const T*` for `&`, `T*` for `edit &`); call sites auto-form the correct reference.
- The analyzer rejects every out-of-scope construct in the table with a structured diagnostic: by-value receiver, orphan method, method/field collision, `edit`-method on a read-only receiver, and method-name imports.
- The goal overview ([compiler-goal-v0.5.md](../../compiler-goal-v0.5.md)) reflects the deferral of classes and the substitution of records (Phase K) + receiver methods (Phase L).
