## 14. Ownership & Move Semantics

Section 14 is the home section for Delta's ownership model: how values are classified as copyable, cloneable, or move-only; the three non-overlapping duplication operations (plain assignment, `move`, `clone`) and the deliberate absence of a `copy` operator; the operand grammar of `move` and `clone`; how move state flows through branches, loops, and revival; why partial moves out of aggregates are forbidden; how `return` acts as the one implicit transfer boundary; and how ownership interacts with the pending state of fallible results. The recurring principles are **duplication is never silent and never half-done** (every owned duplication is either a visible `clone`, or it is a plain copy the compiler has proven costs nothing), **ownership has exactly one owner** (a moved-from binding is dead until revived, and is never disposed twice), and **the compiler proves move state, it never guesses** (no drop flags, no conditional-move bookkeeping — a binding's state at any point is statically known on every path). Each sub-feature below follows the Proposal / Reason / Examples / Conclusion structure.

---

### 14.1 The Copyability Classifier

**Proposal.** Every type falls into exactly one of three tiers, derived bottom-up from its structure:

- **Copyable** — duplicated by plain assignment and by-value passing, at zero cost. The copyable base set is: all primitive numeric types, `bool`, `char`, enums ([§28](#28-enums)), the `Wrap<T>` / `Saturate<T>` tags ([§5.6](#56-wrapt-and-saturatet-type-tags)), and all view types (`stringview`, `cstringview`, `Slice<T>`, any class marked `uses View of S`). An aggregate — a `type` record, a fixed array `T[N]`, or a tagged union — is copyable **iff every field, element, and variant is copyable**. A class is **never** copyable by structure; it is copyable only if it explicitly declares `uses Copyable` ([§9.6](#96-copy-and-move-semantics)).
- **Cloneable** — not copyable, but deep-copyable via the explicit `clone` operator ([§14.4](#144-the-clone-operator)). A type is cloneable iff it is **not `Disposable`** and **every field is copyable or cloneable**. `heap T` is cloneable iff `T` is copyable or cloneable. `string`, `cstring`, `Array<T>`, `Buffer`, `StringBuilder` and similar std owned types are cloneable. Derivation is **markerless** for both `type` records and classes; `uses Cloneable` is an *optional* opt-in that supplies custom clone behavior ([§14.4](#144-the-clone-operator)), never a requirement for clone to exist.
- **Move-only, non-cloneable** — anything `Disposable`, or any aggregate containing a `Disposable` (or otherwise non-cloneable) field. These values can be `move`d but never duplicated. `File`, a `Logger` that owns a `File`, an arena, a lock guard — all live here.

The classifier is recursive with the base set as its fixed point; the three tiers partition every type.

**Reason.** The split is driven by *cost and safety visibility*. Copyable values cost nothing to duplicate, so plain assignment may do it silently. Cloneable values cost an allocation, so duplication must be the visible, fallible `clone` operator — never silent. Move-only-non-cloneable values cannot be safely duplicated at all: duplicating a `File` would create two owners of one OS handle and double-close it.

The Disposable exclusion is the load-bearing safety rule. It is what lets clone derivation be markerless without reintroducing the resource-duplication bug that makes `Copyable` opt-in for classes ([§9.6](#96-copy-and-move-semantics)): a type that owns a resource must mark `uses Disposable` to release it, and `Disposable` is excluded from cloneable, so resource owners are never cloneable. The residual sharp edge — a class that hides an *untracked* resource in a bare copyable field without marking `Disposable` would be silently cloneable — is accepted, with the standing guidance "model every owned resource as `Disposable`."

The asymmetry between `Copyable` (opt-in for classes) and `Cloneable` (markerless for classes) is principled, not an oversight: `Copyable` enables *implicit* duplication through ordinary assignment, which is accident-prone and therefore gated behind an explicit opt-in to protect invariants; `clone` is *always explicit* at the call site and can never fire by accident, and its one dangerous case is already excluded by the Disposable rule — so it needs no gate.

**Examples.**
```ts
// copyable — every field copyable
type Vec3 = { x: float32; y: float32; z: float32; };     // copyable
type Span = { text: stringview; len: uintsize; };        // copyable (view + primitive)

// cloneable — not copyable, but no resource and all fields copyable/cloneable
type Doc = { title: string; body: string; };             // cloneable (owns strings)
type Tree = { value: int32; left: heap Tree; right: heap Tree; };  // cloneable

// move-only, non-cloneable — owns a resource
class File uses Disposable { /* ... */ }                  // not cloneable (Disposable)
type Session = { conn: File; id: uint64; };               // not cloneable (field `conn` is Disposable)

// classes: copyable only by opt-in; cloneable markerlessly when qualified
class Counter uses Copyable { private value: int32; }     // copyable
class Buffer { private bytes: Array<uint8>; }             // cloneable (markerless), not copyable
```

**Conclusion.** Three tiers — copyable, cloneable, move-only-non-cloneable — derived bottom-up. Copyable base set is fixed; aggregates inherit the weakest tier of their parts; classes are copyable only via `uses Copyable` but cloneable markerlessly when not `Disposable` and every field is copyable/cloneable.

---

### 14.2 Three Operations, No `copy` Operator

**Proposal.** There are exactly three ways to get a second usable value or binding from an existing one, and they do not overlap:

- **Plain assignment / by-value passing** (`let b = a;`, `f(a)`) **copies** when `a`'s type is copyable, and is a **compile error** when `a`'s type is move-only (cloneable or non-cloneable). Assignment never moves implicitly and never deep-copies implicitly.
- **`move x`** transfers ownership of an owned value; the source binding becomes invalid ([§14.3](#143-the-move-operator)).
- **`clone x`** produces an independent deep copy of a copyable-or-cloneable value; it allocates and is therefore fallible, consumed with `as result` ([§14.4](#144-the-clone-operator)).

There is **no `copy` operator** and no `copy` keyword. For copyable values, plain assignment already produces an independent copy; for owned values, duplication is never a trivial bitwise act, so it is the explicit `clone`.

**Reason.** A `copy x` operator would carry no meaning that assignment does not already provide for copyable values, and for owned values it would either be a footgun (silently shallow-copying a heap owner) or a redundant spelling of `clone`. Collapsing to three non-overlapping operations — assignment copies, `move` transfers, `clone` deep-copies — leaves no redundant keyword and one obvious choice at every site.

**Examples.**
```ts
let v: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let w = v;                          // OK — copy (Vec3 is copyable)

let d: Doc = makeDoc();
let e = d;                          // ERROR — Doc is move-only; assignment cannot copy it
let e = clone d as result;          // OK — explicit deep copy (fallible)
check result { return 1; }
let g = move d;                     // OK — ownership transfer; `d` invalid afterward
```

**Conclusion.** Assignment copies copyable values, `move` transfers ownership, `clone` deep-copies owned values. No `copy` operator exists.

---

### 14.3 The `move` Operator

**Proposal.** `move x` transfers ownership of the value bound to `x`. After the move, `x` is **moved-from**: reading, mutating, borrowing, moving, or cloning it is a compile error until it is revived ([§14.6](#146-revival-by-reassignment)). Use-after-move is always a compile error, never a runtime check.

The operand of `move` is restricted to a **live, owned binding referenced by its whole name** — a local `let` binding or an owned by-value parameter. The following are rejected:

- `move x.field` — partial move out of an aggregate ([§14.8](#148-no-partial-moves-out-of-aggregates)).
- `move arr[i]` — indexed element.
- `move makeFile()` — a temporary; the call result is already yours, nothing owns it.
- `move constX` — `const` is non-consuming ([§11.1](#111-binding-capabilities)).
- `move borrowedX` — a borrow does not own its referent ([§12.8](#128-borrowed-values-are-not-owned-values)).

The operand must also be **live** (definitely initialized and not already moved-from) on every path reaching the `move`, under the same definite-assignment tracking that governs disposal and reads ([§11.5](#115-whole-value-initialization-only)).

**Reason.** Keyword-prefix `move` makes ownership transfer visible at the start of the expression, where review cannot skim past it. Restricting the operand to a whole named binding mirrors the borrow-operand rule ([§12.5](#125-borrow-operands-and-addressability)): if a value's ownership is transferred, the source shows exactly which named storage is being emptied. Temporaries are excluded because there is nothing to invalidate; `const` and borrows because they do not own.

**Examples.**
```ts
let f = File.open("a.txt") as result;
check result { return 1; }

consume(move f);                    // ownership transferred
console.writeLine(f.path);          // ERROR — use after move

let pair: Pair = makePair();
consume(move pair.left);            // ERROR — partial move out of aggregate
consume(move makeFile());           // ERROR — temporary has no owning binding

function archive(doc: Doc): void {  // owned by-value parameter
  store(move doc);                  // OK — params are owned bindings
}
```

**Conclusion.** `move x` transfers ownership and invalidates the source. Operand is a live, owned binding (local or by-value parameter), whole-name only. Use-after-move is a compile error.

---

### 14.4 The `clone` Operator

**Proposal.** `clone x` produces an independent deep copy of a copyable-or-cloneable value. Because cloning allocates, it is a **fallible expression**: `clone x` has type `T | AllocError`, and like every fallible expression it must be handled — bound with `as result` and resolved by `check`, or discarded with `ignore` ([§26](#26-explicit-error-ignoring-ignore)). A bare unhandled `clone x;` is the compile error **"Fallible expression must be handled."** As a prefix operator, `clone x as result` parses as `(clone x) as result`.

The operand of `clone` is any **readable** path — broader than `move`, because `clone` only reads its source and never invalidates it:

- a binding, whether `const` or `let`;
- an owned by-value parameter, or a `borrowed` / `mod borrowed` parameter;
- field paths through any of the above (`clone doc.title`), with `heap T` auto-deref;
- a temporary is still rejected (`clone makeDoc()`) — bind it first, for the same readability reason borrows reject temporaries ([§12.5](#125-borrow-operands-and-addressability)).

**Derivation and customization.** Clone is auto-derived markerlessly for every cloneable type. Derived clone is **recursive**: copyable fields are copied, cloneable fields are recursively cloned, and a `heap T` field allocates a fresh box around a cloned `T`. A class may declare `uses Cloneable` to supply **custom** clone behavior through a compiler-recognized `clone()` hook (signature `clone(): Self | <Error>`); user code never calls the hook directly — the `clone x` operator dispatches to it, exactly as disposal dispatches to `dispose()` ([§9.7](#97-disposal-and-disposable)). The `uses Cloneable` marker is mutually exclusive with `uses Disposable` and is never required for clone to exist on a qualifying type.

**Transactional cleanup.** Derived clone is **transactional**: if a per-field clone fails partway through, every field already cloned is disposed (reverse declaration order, LIFO) before the `AllocError` is returned. The partially-built value never becomes visible; the caller's `check` sees a clean failure with nothing leaked. A custom `uses Cloneable` hook is responsible for its own cleanup; the derived path is transactional by construction.

`clone` on a copyable value is a redundant-clone **warning** (use plain assignment instead). `clone` on a non-cloneable type is a hard **error** naming the field that blocks cloneability (e.g. "type `Session` is not cloneable: field `conn: File` is `Disposable`").

**Reason.** A `clone` operator (rather than a `.clone()` method) gives clean symmetry with `move`: the two ways to derive another value from `x` are `move x` (transfer) and `clone x` (duplicate), both prefix, both reading as exactly what they do. Fallibility is mandatory because the allocation can fail, and routing it through the existing `as result` machinery means readers who learned error handling for I/O get clone-failure handling for free. The broad readable-operand grammar reflects that clone is a pure read of its source — the most common case is `clone` of a `borrowed` parameter (`snapshot(doc: borrowed Document)` → `clone doc`), which a move-style restriction would wrongly forbid. Transactional cleanup is what keeps a failed clone from being a leak channel.

**Examples.**
```ts
// deep copy of an owned value — fallible
let original = string.from("hello") as result;
check result { return 1; }
let dup = clone original as result;
check result { return 1; }
// `original` still valid; `dup` is an independent buffer

// clone through a borrowed parameter (the common case)
function snapshot(doc: borrowed Document): Document | AllocError {
  const copy = clone doc as result;
  check result { return error as AllocError { code: "alloc.clone", message: result.error.message }; }
  return copy;
}

// field-path clone with as result
const titleCopy = clone doc.title as result;
check result { return 1; }

// unhandled clone — error
clone original;                     // ERROR — "Fallible expression must be handled"

// redundant / impossible clones
const w = clone v as result;        // WARNING — Vec3 is copyable; use assignment
const s = clone session as result;  // ERROR — Session is not cloneable (field `conn: File` is Disposable)
```

```ts
// custom clone via uses Cloneable
class RingBuffer uses Cloneable {
  private data: Array<uint8>;
  private head: uintsize;

  clone(): RingBuffer | AllocError {
    const copied = clone this.data as result;   // hook is responsible for its own cleanup
    check result { return error as AllocError { code: "alloc.clone", message: result.error.message }; }
    return RingBuffer { data: move copied, head: this.head };
  }
}

let rb2 = clone rb as result;       // operator dispatches to the custom hook
check result { return 1; }
```

**Conclusion.** `clone x` is the fallible deep-copy operator. Auto-derived markerlessly and recursively for cloneable types, customizable via the `uses Cloneable` `clone()` hook, transactional on partial failure. Operand is any readable path; copyable clone warns, non-cloneable clone errors.

---

### 14.5 Move State at Control-Flow Joins

**Proposal.** A binding's move state is tracked per path. At a control-flow merge, a binding is **moved-from** if it is moved on **any** path reaching the merge. Consequently:

- A use of the binding after the merge must be statically safe on **all** reaching paths; reading a binding that was moved on some path is a compile error.
- Moving a binding on **some-but-not-all** paths that reach the merge is itself a compile error. Code must move the binding on **every** reaching path or **none** — there is no conditional-move bookkeeping and no runtime drop flag.
- The exception: a path that **diverges** before the merge (`return`, `panic`, `break`, `continue`, `process.exit`, `unreachable` — the terminators of [§6.9](#69-exit-path-terminators)) does not reach the merge, so a `move` on a diverging path is fine. The rule is "every path that *reaches the merge* agrees on the binding's state."

**Reason.** Forbidding conditional moves removes the need for drop flags — hidden per-binding booleans that track at runtime whether a value still needs disposal. That machinery is a classic source of subtle codegen bugs and makes disposal non-obvious. Requiring agreement at the merge keeps a binding's state statically known everywhere, which is what makes use-after-move and double-dispose pure compile-time properties. The divergence exception costs nothing — a returning branch never rejoins, so its move cannot reach later code.

**Examples.**
```ts
// moved on some-but-not-all paths reaching the merge — error
let f = File.open("a.txt") as result;
check result { return 1; }
if (cond) {
  consume(move f);
}
log(f.path);                        // ERROR — `f` may have been moved

// moved on a diverging path — OK (never reaches the merge)
if (cond) {
  consume(move f);
  return 0;                         // diverges
}
log(f.path);                        // OK — only the non-moved path reaches here

// moved on every reaching path — OK (binding is uniformly dead after)
if (cond) { consume(move f); }
else      { archive(move f); }
log(f.path);                        // ERROR — moved on both paths, uniformly moved-from
```

**Conclusion.** Moved-on-any-path means moved-from at the merge. Conditional moves (some-but-not-all reaching paths) are a compile error; move on all reaching paths or none. Diverging paths are exempt. No drop flags.

---

### 14.6 Revival by Reassignment

**Proposal.** A moved-from binding may be **revived** by whole-value assignment, after which it is fully live again — readable, mutable, borrowable, movable, clonable. Revival uses the same machinery as initializing a `let x: T;` declared without an initializer ([§11.5](#115-whole-value-initialization-only)). Partial revival through a field (`f.field = ...`) is forbidden; only whole-value assignment revives.

`const` bindings cannot be revived because they cannot be moved-from in the first place (moving from `const` is forbidden, [§11.3](#113-methods-copying-cloning-and-moving)).

**Reason.** Without revival, every consume-then-reuse pattern would force the author to invent fresh names (`f2`, `f3`), which reads as accidental duplication. Allowing revival by whole-value assignment keeps the name stable while preserving the "a binding is either uninitialized/moved-from or holds a complete value" invariant — the same state machine §11.5 already enforces. Partial revival is excluded for the same reason partial initialization is: it would create half-valid values.

**Examples.**
```ts
let f = File.open("a.txt") as result;
check result { return 1; }

consume(move f);                    // `f` now moved-from
f.close();                          // ERROR — moved-from binding
f = File.open("b.txt") as result;  // revival by whole-value assignment
check result { return 1; }
f.close();                          // OK — `f` is live again
```

**Conclusion.** Whole-value assignment revives a moved-from binding. Partial revival is forbidden; `const` bindings are never moved-from and so never revived.

---

### 14.7 Moves in Loops

**Proposal.** A loop back-edge is treated as a control-flow merge ([§14.5](#145-move-state-at-control-flow-joins)). For a binding declared **outside** the loop, moving it in the loop body and not reviving it before the next iteration reaches the use is a compile error ("`x` moved in a previous iteration"). A binding declared **inside** the loop body is fresh on each iteration, so moving it is always legal.

**Reason.** The back-edge carries "moved on the previous iteration" to the top of the next one, so iteration 2 would otherwise read a moved-from value. Treating the back-edge as a merge reuses the §14.5 analysis with no new machinery. Inner-declared bindings escape the rule naturally: each iteration constructs them anew, so there is no carried-over moved-from state.

**Examples.**
```ts
let f = File.open("log.txt") as result;
check result { return 1; }

for (const path of paths) {
  consume(move f);                  // ERROR — `f` moved in a previous iteration
}

for (const path of paths) {
  const item = build(path) as result;  // fresh each iteration
  check result { continue; }
  consume(move item);               // OK — inner binding, fresh per iteration
}

for (const path of paths) {
  consume(move f);                  // moved...
  f = File.open(path) as result;    // ...then revived before the back-edge
  check result { break; }
}                                   // OK — revived each iteration
```

**Conclusion.** Outer-binding moves in a loop require revival before the next iteration; inner-binding moves are always fine.

---

### 14.8 No Partial Moves Out of Aggregates

**Proposal.** Moving a single field, element, or subobject out of an aggregate is forbidden, uniformly for both `type` records and classes. `move x.field`, `move arr[i]`, and moving out through a borrow ([§12.6](#126-mutation-replacement-and-moving)) are all compile errors. A binding is moved as a **whole** or not at all. To extract one owned field, either `clone` it (if cloneable) or `move` the whole aggregate into a function that consumes it.

**Reason.** A partial move would leave the aggregate in a half-alive state — one field dead, the rest live — and force the compiler to track which fields remain initialized across every subsequent operation, plus which still need disposal. That per-field liveness bookkeeping is exactly the complexity §9.8 already declines for classes; applying the same rule to records keeps the model uniform and keeps every aggregate value either whole or wholly moved.

**Examples.**
```ts
type Pair = { left: Buffer; right: Buffer; };
let pair: Pair = makePair();

consume(move pair.left);            // ERROR — partial move out of aggregate
const l = clone pair.left as result;  // OK — clone the field instead
check result { return 1; }

consume(move pair);                 // OK — whole-aggregate move
```

**Conclusion.** No partial moves. Move the whole aggregate, or `clone` the field you need.

---

### 14.9 Return as the Implicit Transfer Boundary

**Proposal.** `return` is the **one** place where ownership transfers without an explicit `move`. Returning an owned local binding or an owned by-value parameter transfers it to the caller, including for move-only types. This implicit transfer applies **only** to owned locals and by-value parameters; it does **not** apply to fields, indexed elements, borrowed values, globals, or captured variables — returning any of those by value is a compile error (a borrowed value is not owned; a field would be a partial move).

A returned copyable value is simply copied out; a returned move-only value is transferred.

**Reason.** `return` already leaves the current ownership context, so transferring an owned local to the caller is unsurprising there — requiring `return move x` would be noise at the one site where the transfer is implied by the control flow itself. The exclusions preserve the other invariants: fields can't be partially moved ([§14.8](#148-no-partial-moves-out-of-aggregates)), borrows aren't owned ([§12.8](#128-borrowed-values-are-not-owned-values)), and views freshly derived from local/borrowed storage can't escape ([§13.6](#136-fresh-derived-view-lifetimes)).

**Examples.**
```ts
function identity(file: File): File {
  return file;                      // OK — owned by-value parameter transfers to caller
}

function makeDoc(): Doc {
  const d = buildDoc();
  return d;                         // OK — owned local transfers out
}

function leakField(box: FileBox): File {
  return box.file;                  // ERROR — would be a partial move out of `box`
}

function leakBorrow(file: borrowed File): File {
  return file;                      // ERROR — borrowed value is not owned
}
```

**Conclusion.** `return` transfers owned locals and by-value parameters implicitly. Fields, borrows, indexed elements, globals, and captures are excluded.

---

### 14.10 Ownership of Pending Fallible Values

**Proposal.** A binding produced by a fallible call and bound with `as result` is **pending** until its `check` block has run ([§22](#22-consuming-fallible-calls-as-result)). A pending binding cannot be read, mutated, borrowed, **moved**, or **cloned**. `move r` or `clone r` on a still-pending `r` is a compile error ("`r` is unchecked"). After the `check` block exits, the success value is a normal owned binding and `move` / `clone` work.

**Reason.** A pending value may actually be in the error state; consuming it before the error path is handled would transfer or duplicate a value that does not validly exist. Gating `move` and `clone` behind the same `check` that gates ordinary reads keeps the rule uniform — there is exactly one point at which a fallible result becomes a usable owned value, and every ownership operation respects it.

**Examples.**
```ts
const f = File.open(p) as result;
consume(move f);                    // ERROR — `f` is unchecked
check result { return 1; }
consume(move f);                    // OK — `f` is a normal owned binding after the check
```

**Conclusion.** Pending fallible results cannot be moved or cloned until `check` has run; afterward they behave as ordinary owned bindings.

---

### 14.11 Redundant-Operation Diagnostics

**Proposal.** The two ownership operators emit diagnostics when applied to a value whose tier makes them pointless or impossible:

- **`move` on a copyable value** is a **warning**, not an error. Semantically it acts as a copy: the source stays live (a copyable value has no moved-from state to enter). The warning reads "`move` is redundant here; `T` is copyable."
- **`clone` on a copyable value** is a **warning**: "redundant `clone`; `T` is copyable — use assignment."
- **`clone` on a non-cloneable type** is a hard **error** naming the blocking field or marker (`Disposable`, or a non-cloneable field).

**Reason.** Copyable types have no moved-from state, so `move` on them cannot mean what it means for owned types; rather than silently diverging the semantics, the operator degrades to a copy and the compiler flags the redundancy. Keeping these as warnings (not errors) avoids breaking generic-shaped code that may be instantiated at both copyable and move-only types, while still steering authors toward plain assignment.

**Examples.**
```ts
let v: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let w = move v;                     // WARNING — move redundant; Vec3 is copyable; `v` stays live
let u = clone v as result;          // WARNING — clone redundant; use assignment
check result { return 1; }

let s: Session = makeSession();
let c = clone s as result;          // ERROR — Session not cloneable (field `conn: File` is Disposable)
```

**Conclusion.** `move`/`clone` on copyable values warn (and `move` degrades to a copy); `clone` on a non-cloneable type errors.

---

### 14.12 Explicit Non-Goals for Section 14

The following are deliberately out of scope for MVP or permanently excluded:

- **A `copy` operator or `copy` keyword** — never. Assignment copies copyable values; `move` transfers; `clone` deep-copies ([§14.2](#142-three-operations-no-copy-operator)).
- **Drop flags / conditional-disposal bookkeeping** — never. Move state is statically uniform at every merge; conditional moves are a compile error ([§14.5](#145-move-state-at-control-flow-joins)).
- **Partial moves out of fields, elements, or subobjects** — never. Aggregates move as a whole ([§14.8](#148-no-partial-moves-out-of-aggregates)).
- **Moving out through a borrow** — out of scope for MVP ([§12.6](#126-mutation-replacement-and-moving)).
- **Implicit move in assignment or function arguments** — never. `return` is the only implicit transfer ([§14.9](#149-return-as-the-implicit-transfer-boundary)).
- **A `.clone()` method form** — replaced by the `clone x` operator. There is one duplication spelling, not two.
- **Custom `Copyable` implementations** — out of scope for MVP; `Copyable` is compiler-derived only ([§9.6](#96-copy-and-move-semantics)).
- **`uses Cloneable` combined with `uses Disposable`, or cloning any `Disposable` type** — never. Resource owners are not cloneable.
- **Runtime use-after-move detection** — never. Use-after-move is a pure compile-time error.
- **Lifetime-tracked borrowed returns and stored borrows** — deferred to the post-MVP lifetime design ([§12.11](#1211-explicit-non-goals-for-section-12)).

---

### 14.13 Cross-Section Alignment

This section is the home of the ownership model; it is aligned with the following rules elsewhere in the spec:

- **§5.6** — `Wrap<T>` / `Saturate<T>` are transparent tags over copyable integers and are themselves copyable.
- **§6.9 / §6.10** — `clone` joins `move` as a reserved value-level operator keyword; the move-state analysis recognizes the §6.9 terminators as diverging paths.
- **§7** — `string` / `cstring` are cloneable, move-only owned types; `stringview` / `cstringview` / `Slice<T>` are copyable views. Deep copy is `clone x` (fallible), not a `.clone()` method.
- **§8.7 / §8.9** — `heap T` is cloneable iff `T` is; derived `clone` parallels derived `==` in being markerless and structural for `type` records.
- **§9.1 / §9.6 / §9.7** — classes are copyable only via `uses Copyable`, cloneable markerlessly when not `Disposable`, with `uses Cloneable` supplying an optional custom `clone()` hook; `Copyable`, `Cloneable`, and `Disposable` markers are mutually constrained (`Disposable` excludes both `Copyable` and `Cloneable`).
- **§11** — `const` is read-only and non-consuming (no `move`, no `mod borrowed`), but a non-consuming `clone` of a `const` is allowed; `let` is mutable, movable, and revivable.
- **§12** — borrows do not own; `move` cannot take a borrow, and `clone` may read through one. Move-plus-borrow of the same root in one call is rejected by §12.4.
- **§13.5 / §13.6 / §13.8** — single-owner disposal, fresh-derived-view escape, and allocation-failure recovery all build on the move/clone rules here.

---
