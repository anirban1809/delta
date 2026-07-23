## 14. Ownership & Move Semantics

Section 14 is the home section for Delta's ownership model: how values are classified as copyable, cloneable, or unique; the three ways to obtain another usable value (copy, clone, move) and how a bare use dispatches among them by tier; how generic tier bounds determine body discipline; how move state flows through branches, loops, and revival; why partial moves out of aggregates are forbidden; how `return` transfers; and how ownership interacts with pending fallible results. The recurring principles are **the compiler picks the duplication a value's tier permits**, **ownership has exactly one owner**, and **use-after-move is a static error**.

> **Revised 2026-07-16 — duplication is now implicit.** Bare assignment and bare by-value
> passing of a cloneable or unique value were previously hard errors that demanded an explicit
> `move` or `clone`. They are now legal and dispatch on tier: copy, deep clone, or transfer.
> Runtime **drop flags** were adopted in the same decision, so conditional moves compile.
> Both reversals are recorded at their sites below ([§14.2](#142-the-three-operations),
> [§14.5](#145-move-state-at-control-flow-joins), [§14.12](#1412-explicit-non-goals-for-section-14)).
> The implementation plan is `docs/plans/goal-v0.5/phase-f-ownership-and-move.md`.

---

### 14.1 The Ownership Tier Classifier

**Proposal.** Every type falls into exactly one of three ownership tiers:

- **Copyable** - duplicated by a bit-for-bit copy. Copying has no ownership effect on the source.
- **Cloneable** - not copyable, but independently duplicable by a recursive deep clone. Cloning may allocate.
- **Unique** - neither copyable nor cloneable. A unique value can only be transferred or referenced.

The tier is what a bare use dispatches on ([§14.2](#142-the-three-operations)): a bare use of a copyable value copies, of a cloneable value clones, of a unique value transfers. The tier is therefore semantically load-bearing at every use site, even though nothing in the source names it.

Only `unique` is explicitly declared, with `unique type Name`. Copyability and cloneability are structurally inferred from fields for every other type. There is no `uses Copyable` or `uses Cloneable` ownership marker in this model.

The classifier is recursive:

- The copyable base set includes primitive numeric types, `bool`, `char`, enums, the `Wrap<T>` / `Saturate<T>` tags, read-only references (`&T`), and view values such as `Slice<T>`, `stringview`, and `cstringview`.
- A `type` record, fixed array, or tagged union is copyable iff every stored field, element, or variant payload is copyable.
- A type is cloneable iff it is not copyable, is not unique, and every stored field, element, or variant payload is copyable or cloneable.
- `heap T` is cloneable iff `T` is copyable or cloneable. It is never copyable, because copying the heap handle would duplicate ownership of one allocation.
- A `unique type` is unique. Any aggregate containing a unique field is unique by structure.
- A stored mutable reference (`edit &T`) is a unique capability. Any aggregate containing one is unique by structure.

A `dispose` receiver function is permitted only on a `unique type`. Writing one for a non-unique record is a compile error — including for a record that is unique *by structure*, since custom cleanup requires the explicit `unique` declaration as an auditable promise. A `unique type` may omit `dispose` if it has no custom cleanup beyond field disposal.

**Reason.** The split is about what duplication *costs* and whether it is *possible*, not about whether it is visible. Copyable values are free to duplicate. Cloneable values own resources that can be independently duplicated, at the cost of an allocation. Unique values represent resources or capabilities that cannot be duplicated safely at any price.

Making only `unique` explicit puts the declaration burden on the dangerous case. A record with only copyable fields is copyable by structure. A record with cloneable owned fields is cloneable by structure. A record that owns a non-duplicable resource says so up front with `unique type`.

Since the 2026-07-16 revision the tier no longer determines what the author must *write* — a bare use is legal in every tier. It determines what the compiler *does*, which makes the classifier's correctness more important rather than less: it is now the only thing standing between `let b = a;` and a double free.

**Examples.**
```ts
// copyable - every field is copyable
type Vec3 = { x: float32; y: float32; z: float32; };
type Span = { text: stringview; len: uintsize; };
type Counter = { value: int32; };

// cloneable - owns cloneable storage
type Doc = { title: string; body: string; };
type Buffer = { bytes: Array<uint8>; };

// unique - explicitly non-duplicable
unique type File = { fd: FileDescriptor; };

function (file: edit &File) dispose(): void {
  os.close(file.fd);
}

type Session = { conn: File; id: uint64; };
// Session is unique because it contains File. It needs no `unique` marker of its own.
```

Invalid `dispose`:
```ts
type BadCounter = { value: int32; };

function (c: edit &BadCounter) dispose(): void { }   // ERROR - dispose requires `unique type`
```

Mutable reference field:
```ts
@lifetime(db)
unique type Transaction = {
  db: edit &Database;
  committed: bool;
};

function (tx: edit &Transaction) dispose(): void {
  if (!tx.committed) {
    tx.db.rollbackRaw();
  }
}
```

`Transaction` is unique by structure because it stores an `edit &Database`. The explicit
`unique` marker is still required here, because it defines `dispose`.

Generic tier bounds are also part of the ownership classifier:

- `<T>` accepts only copyable `T`.
- `<clone T>` accepts only cloneable `T`.
- `<unique T>` accepts only unique `T`.

The bound determines body discipline directly. Signatures do not change per instantiation.

```ts
function copyTwice<T>(x: T): Pair<T> {
  return { left: x, right: x };        // OK - T is copyable
}

function snapshot<clone T>(x: T): T {
  return clone x;                      // OK - explicit duplicate, aborts on OOM
}

function consumeUnique<unique T>(x: T): void {
  sink(move x);                        // OK - explicit transfer
}
```

> ⚠️ **Undecided after the 2026-07-16 revision.** The two "bare reuse is forbidden" rules
> below are the generic-bound analogue of exactly the rule that revision reversed for concrete
> types. Whether a `<clone T>` body should now implicitly clone on bare use — or whether
> generic bodies should keep the explicit discipline *precisely because* the concrete tier is
> unknown inside the body, so the compiler cannot dispatch and the reader cannot predict the
> cost — has **not** been decided. The rules are preserved here as written. Generics are
> post-v0.5 and out of the Phase F plan entirely, so nothing depends on the answer yet;
> settle it when generic tier bounds are specified.

For `<clone T>`, bare reuse is forbidden; the body must choose `&x`, `move x`, or `clone x` / `clone x as result`. There is no last-use-is-implicit-move exception:

```ts
function bad<clone T>(x: T): void {
  sink(x);                             // ERROR - cloneable bare-pass forbidden
}

function ok<clone T>(x: T): void {
  sink(clone x);                       // OK - duplicate, aborts on OOM
  inspect(&x);                         // OK - reference
  sink(move x);                        // OK - transfer
}
```

For `<unique T>`, bare reuse is also forbidden; the body may use `&x` or `move x`, but never `clone x`. A `<unique T>` body has access to unique-tier semantics: values are automatically disposed at ownership end, can satisfy APIs that require unique resources, and still cannot call `dispose()` manually.

```ts
function badUnique<unique T>(x: T): void {
  sink(x);                             // ERROR - unique bare-pass forbidden
  sink(clone x);                       // ERROR - unique values cannot clone
}

function okUnique<unique T>(x: T): void {
  inspect(&x);                         // OK
  sink(move x);                        // OK
}
```

Container declarations are tier-specific. `Array<T>`, `Array<clone T>`, and `Array<unique T>` are separate standard-library declarations. There is no tier-polymorphic `<any T>` escape hatch in MVP.

**Conclusion.** Delta has three tiers: copyable, cloneable, and unique. Only `unique type` is explicit. Copyability and cloneability are inferred structurally; the tier decides what a bare use does; and generic bounds choose one tier at a time.

---

### 14.2 The Three Operations

**Proposal.** There are exactly three ways to obtain another usable value from an existing one — copy, clone, and move — and **a bare use performs whichever one the operand's tier permits.** A bare use is a plain assignment, a by-value argument, or a `return`.

| Tier of `x` | `let b = x;` / `f(x)` | Source after |
|---|---|---|
| **Copyable** | copy | live |
| **Cloneable** | recursive deep clone (aborts on allocation failure) | live |
| **Unique** | transfer | **moved-from** |

Ordinary code therefore names no ownership operation. The keywords remain, and each retains a job a bare use cannot do:

- **`move x`** transfers a binding and invalidates the source. On a unique value it restates the default. On a **cloneable** value it is the opt-out from implicit cloning — the way to say "transfer this buffer, do not duplicate it." This is its most important role. On a copyable value it still invalidates the source ([§14.3](#143-the-move-operator)).
- **`clone x`** duplicates a copyable or cloneable value. On a cloneable value it restates the default. Its load-bearing form is **`clone x as result`**, the only way to handle allocation failure: every other clone form, implicit or explicit, aborts ([§14.4](#144-the-clone-operator)).

There is no `copy` operator and no `copy` keyword: copying is what a bare use of a copyable value already does.

```ts
g(b);                                 // OK - cloneable: implicit deep clone, b stays live
g(move b);                            // OK - transfer instead of cloning
g(&b);                                // OK - reference
g(clone b);                           // OK - explicit spelling of the default
g(clone b as result);                 // OK - recoverable clone
check result { return; }
```

For unique values:

```ts
use(file);                            // OK - transfer; file is now moved-from
use(move file);                       // OK - identical, transfer spelled out
use(&file);                           // OK - reference
use(clone file);                      // ERROR - unique values cannot clone
```

`clone` of a unique value is the only remaining hard error among the ownership operations.

**Reason.** *(Revised 2026-07-16 — this reverses the previous rule that bare use of a cloneable or unique value was a compile error.)* The old rule made the type system's classification the author's paperwork: the compiler already knew which operation was correct at every site and refused to perform it, demanding the author write down the answer. That is a good trade when the answer is surprising and a bad one when it is forced — and it is forced at every site, because each tier permits exactly one operation. Tier dispatch has the compiler perform the operation it already proved was the only sound one.

What this costs is real and accepted: an implicit clone allocates and can abort, and nothing at the use site says so. Three things bound it. Auto-borrowing outranks by-value passing for non-copyable arguments (§12), so `f(doc)` borrows whenever the callee offers a `&T` alternative and implicit clone fires only when a callee genuinely demands ownership. `move x` converts any implicit clone into a transfer at zero cost. And the tier follows from fields the author chose. The residue — a by-value ownership-taking callee in a loop, silently cloning per iteration — is a real footgun, deliberately accepted, with a lint rather than a language rule as the intended mitigation.

What this does **not** cost is safety. Every tier's bare use is checked exactly as its explicit spelling was: use-after-move is still a static error, unique values still cannot be duplicated, and cleanup still runs exactly once.

**Examples.**
```ts
let v: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let w = v;                            // OK - Vec3 is copyable; v stays live

let doc = makeDoc();                  // Doc is cloneable
let doc2 = doc;                       // OK - implicit deep clone; doc stays live
let doc3 = clone doc;                 // OK - identical to the line above
let doc4 = move doc;                  // OK - transfer; doc is now moved-from
```

```ts
let file = File.open(path) as result;
check result { return; }

let file2 = file;                     // OK - File is unique: transfer
inspect(&file);                       // ERROR - use after move
let file3 = clone file;               // ERROR - File is unique
```

Note that `let doc2 = doc;` and `let file2 = file;` are the same syntax with opposite effects on the source. This is deliberate, and it is the design's sharpest edge: the tier is not visible at the use site. Editor affordances (tier shown on hover or as an inlay hint) are the intended mitigation and are part of the language's usability story, not an IDE nicety.

**Conclusion.** A bare use copies, clones, or transfers according to tier. `move` opts a cloneable value out of implicit cloning; `clone x as result` is the only way to handle allocation failure. No `copy` operator exists.

---

### 14.3 The `move` Operator

**Proposal.** A transfer moves a live binding and invalidates the source. After the transfer, `x` is moved-from: reading, mutating, referencing, moving, or cloning it is a compile error until it is revived ([§14.6](#146-revival-by-reassignment)).

A transfer happens two ways, with identical semantics and identical lowering:

- **implicitly**, at a bare use of a unique value ([§14.2](#142-the-three-operations));
- **explicitly**, by writing `move x`, which transfers regardless of tier — including a copyable `x`.

The operand of a transfer is restricted to a live owned binding referenced by its whole name: a local `let` binding or an owned by-value parameter. The following are rejected:

- `move x.field` - partial move out of an aggregate ([§14.8](#148-no-partial-moves-out-of-aggregates)).
- `move arr[i]` - indexed element.
- `move makeFile()` - a temporary; the call result is already yours.
- `move constX` - `const` is non-consuming.

These restrictions bind the implicit form too. A bare use of a unique *field path* — `g(x.handle)` — is a partial-move error, not an implicit move; the whole-binding rule is not relaxed just because no keyword was written.

`move` on a copyable value is permitted but unnecessary — a bare use already copies it ([§14.2](#142-the-three-operations)). When you do write `move`, the source is invalidated like any other binding; there is no copyable exception and no warning-and-stay-live behavior. A developer who wants the source to remain live should simply not write `move`.

`move` never converts a reference into ownership of its referent. A value of type `&T` is a non-owning reference value. Moving or copying that value only moves or copies the reference itself; it never moves the `T`.

**Reason.** Restricting the operand to a whole owned binding keeps move state simple: a binding is either live, moved-from, or absent. Partial moves would make aggregate values half-alive.

Since the 2026-07-16 revision the keyword no longer exists to make transfer visible — a bare use of a unique value transfers without it. It exists to **opt a cloneable value out of implicit cloning**, and to let an author restate a transfer at a site where a reader benefits from seeing it. The first of those is load-bearing: without `move`, a cloneable value could not be transferred at all.

**Examples.**
```ts
let f = File.open("a.txt") as result;
check result { return 1; }

consume(f);                           // ownership transferred - File is unique
inspect(&f);                          // ERROR - use after move

let pair: Pair = makePair();
consume(move pair.left);              // ERROR - partial move out of aggregate
consume(pair.left);                   // ERROR - same; bare use of a unique field path
consume(move makeFile());             // ERROR - temporary has no owning binding

function archive(doc: Doc): void {    // owned by-value parameter
  store(move doc);                    // OK - transfer, not a clone
}
```

`move` as the clone opt-out:
```ts
let doc = makeDoc();                  // Doc is cloneable
store(doc);                           // deep clone; doc stays live
store(move doc);                      // transfer; no allocation, doc is moved-from
```

Copyable values are invalidated too:
```ts
let v: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let w = v;                            // OK - copyable, v stays live
let u = move v;                       // v is now moved-from
print(v);                             // ERROR - use after move
```

**Conclusion.** A transfer takes a whole live binding and invalidates the source. It happens implicitly at a bare use of a unique value, and explicitly via `move` in any tier — copyable, cloneable, and unique alike. It never moves out of fields, elements, temporaries, or references, whether or not the keyword is written.

---

### 14.4 The `clone` Operator

**Proposal.** Cloning produces an independent duplicate of a copyable or cloneable value. For cloneable values it performs a recursive deep clone; for copyable values it is redundant and, when written explicitly, emits a warning.

Cloning happens two ways:

- **implicitly**, at a bare use of a cloneable value ([§14.2](#142-the-three-operations));
- **explicitly**, by writing `clone x`.

Allocation failure policy:

- Bare `clone x` aborts on allocation failure. It does not add `AllocError` to the surrounding function signature and does not require `as result`.
- **An implicit clone always takes the aborting form.** `let b = doc;` is exactly `let b = clone doc;`, abort edge included.
- `clone x as result` opts into recoverable allocation failure. The result is consumed with `check result`, `forward result`, or another ordinary result-handling form.

There is deliberately no implicit *fallible* clone. `as result` is a statement-level wrapper, and an implicit clone can occur at an argument position buried inside an expression, where no statement-level wrapper can attach. Code that must survive allocation failure writes `clone x as result` explicitly — which is the reason the keyword still exists after tier dispatch made every other one of its uses optional.

The old rule "fallible expression must be handled" does not apply to bare or implicit `clone`. Clone follows the same policy as bounds and overflow checks: panic/abort by default, recoverable when explicitly requested.

The operand of `clone` is any readable path:

- a `const` or `let` binding,
- an owned by-value parameter,
- a reference parameter (`&T` or `edit &T`), cloning the referent,
- field paths through any of the above, with `heap T` auto-deref.

Temporaries are rejected for readability: bind the value first.

Derived clone is structural and recursive. Copyable fields are copied, cloneable fields are recursively cloned, and `heap T` fields allocate fresh boxes around cloned `T` values. Clone is transactional on the recoverable `as result` path: if a per-field clone fails, already-created cloned fields are disposed before `AllocError` is returned. On the bare path, allocation failure aborts and no partially-built value becomes visible.

There is no `uses Cloneable` marker in this model. Cloneability is inferred from fields.

**Reason.** Making bare clone abort-on-OOM optimizes the common systems-programming path: most application code treats allocation failure like other local deterministic traps. Arena, embedded, or service code that needs graceful exhaustion handling can opt into `clone x as result`.

That policy is what makes an implicit clone tolerable. Because bare clone already aborts rather than infecting signatures with `AllocError`, an implicit clone changes no function's type and forces no ceremony on its callers — it only adds an abort edge that bare `clone` already had. Had clone been uniformly fallible, implicit cloning would have been unimplementable: every bare use would need a `check`.

The broad readable operand grammar matters because cloning reads; it does not consume. Cloning through a reference is the common shape for snapshot APIs.

**Examples.**
```ts
let original = string.from("hello") as result;
check result { return 1; }

let dup = clone original;             // OK - aborts on OOM
log(original);                        // OK - original remains live
log(dup);
```

Recoverable clone:
```ts
let dup = clone original as result;
check result {
  return error as AllocError {
    code: "alloc.clone",
    message: result.error.message,
  };
}
```

Forwarding recoverable allocation failure:
```ts
function duplicateDoc(doc: &Document): Document | AllocError {
  const copy = clone doc as result;
  forward result;
  return copy;
}
```

Cloning through a reference:
```ts
function snapshot(doc: &Document): Document {
  return clone doc;                    // OK - clone the referenced document
}
```

Field-path clone:
```ts
const titleCopy = clone doc.title;     // OK if doc.title is cloneable
```

Implicit and explicit clone are the same operation:
```ts
const a = doc;                         // implicit deep clone; aborts on OOM
const b = clone doc;                   // identical - same helper, same abort edge
```

Redundant and impossible clones:
```ts
const w = clone v;                     // WARNING - Vec3 is copyable; use assignment
const f2 = clone file;                 // ERROR - File is unique
```

**Conclusion.** Cloning duplicates copyable and cloneable values, implicitly at a bare use of a cloneable value and explicitly with `clone`. Both abort on allocation failure; `clone x as result` is the only form that opts into recovery. Cloneability is structural, recursive, and unavailable for unique values.

---

### 14.5 Move State at Control-Flow Joins

**Proposal.** A binding's move state is tracked per path over four states: `Uninitialized`, `Live`, `Moved`, and `MaybeMoved`. At a control-flow merge the join is by state:

- `Live ⊔ Live = Live`
- `Moved ⊔ Moved = Moved` — moved on every reaching path; nothing to clean up, no flag
- `Live ⊔ Moved = MaybeMoved` — moved on some but not all reaching paths

A path that diverges before the merge (`return`, `panic`, `break`, `continue`, `process.exit`, `unreachable`) does not reach it and does not join its state.

**A `MaybeMoved` binding may be cleaned up but not used.**

- Any read, mutation, reference, clone, or move of a `MaybeMoved` binding is a compile error. Uses require `Live`.
- Cleanup of a `MaybeMoved` binding is gated on a **drop flag**: a hidden `bool`, local to the function, that each transfer clears and each cleanup site tests.

Drop flags are emitted **only** for bindings that are `MaybeMoved` at some cleanup point. A binding whose state is known at every exit — the overwhelming majority — is cleaned up statically, with no flag and no branch. A flag never enters a record layout, never crosses a function boundary, and is never consulted inside a `_drop` helper; gating happens entirely at the cleanup site.

**Reason.** *(Revised 2026-07-16 — this reverses the previous rule, which rejected conditional moves outright in order to avoid drop flags.)*

The old rule made the common `if (cond) { consume(f); }` a compile error whose fix was to restructure control flow so the moving branch diverged. That was defensible while every transfer was spelled `move`: the error pointed at a keyword the author had written, and the restructuring was a visible trade for a visible operation. Tier dispatch removes that footing. A transfer is now an ordinary-looking call, so the error would fire on code containing no ownership syntax at all, and the suggested fix would be to reshape control flow around a transfer the author never wrote. Implicit move and no-drop-flags are each defensible alone and hostile together.

The cost is bounded and local: one stack byte and one predictable branch per genuinely ambiguous binding, nearly always eliminated by the C optimizer because the flag is provably constant along each path. In exchange, ownership stops leaking into control-flow structure.

The line the flag does **not** cross is use. A flag answers "must this be disposed?" — a question the runtime can answer cheaply and locally. It does not answer "is this a valid value?" — a question the type system must answer statically or not at all. Delta answers the first at runtime and the second at compile time, and never confuses them. This is why adopting drop flags does not make `MaybeMoved` usable, and why no runtime use-after-move detection follows from it ([§14.12](#1412-explicit-non-goals-for-section-14)).

**Examples.**
```ts
let f = File.open("a.txt") as result;
check result { return 1; }

if (cond) {
  consume(f);
}
// OK - f is MaybeMoved; a drop flag decides disposal at scope exit
```

```ts
if (cond) {
  consume(f);
}
inspect(&f);                          // ERROR - use of maybe-moved f
```

```ts
if (cond) {
  consume(f);
  return 0;                           // diverges; the merge below never sees f
}
inspect(&f);                          // OK - f is unambiguously Live here
```

```ts
if (cond) { consume(f); }
else      { archive(f); }
inspect(&f);                          // ERROR - moved on all reaching paths; ordinary use-after-move
```

Diverging the moving branch is now an idiom for keeping a binding unambiguously `Live`, not a requirement for compiling a conditional move.

**Conclusion.** Move state is path-sensitive. Conditional moves compile: a `MaybeMoved` binding is disposed under a drop flag, and every other binding is disposed statically. Using a `MaybeMoved` binding remains a compile error — flags make it disposable, not usable.

---

### 14.6 Revival by Reassignment

**Proposal.** A moved-from `let` binding may be revived by whole-value assignment. After revival, it is fully live again: readable, mutable, referenceable, movable, and clonable. Partial revival through a field is forbidden.

A `MaybeMoved` binding may also be revived, and revival is the one operation a `MaybeMoved` binding permits — it writes the binding rather than reading it, so it does not depend on the ambiguous state. After revival the binding is unambiguously `Live` and its drop flag, if it has one, is set.

`const` bindings cannot be revived because they cannot be moved from.

**Reason.** Revival keeps consume-then-reuse patterns ergonomic without weakening the complete-value invariant. A binding is absent, moved-from, or holds a complete value; it is never half-valid.

**Examples.**
```ts
let f = File.open("a.txt") as result;
check result { return 1; }

consume(f);                           // f is moved-from
inspect(&f);                          // ERROR

f = File.open("b.txt") as result;     // revival by whole-value assignment
check result { return 1; }
inspect(&f);                          // OK
```

Reviving out of `MaybeMoved`:
```ts
if (cond) { consume(f); }             // f is MaybeMoved here
f = File.open("c.txt") as result;     // OK - revival writes, it does not read
check result { return 1; }
inspect(&f);                          // OK - unambiguously Live
```

**Conclusion.** Whole-value assignment revives a moved-from `let` binding. Partial revival is forbidden.

---

### 14.7 Moves in Loops

**Proposal.** A loop back-edge is treated as a control-flow merge. For a binding declared outside the loop, moving it in the loop body and then *using* it in the next iteration without reviving it is a compile error. A binding declared inside the loop body is fresh on each iteration, so moving it is legal.

The back-edge may carry `Moved` or `MaybeMoved` state. What it may not do is deliver a non-`Live` binding to a use. Cleanup at loop exit for a binding that is `MaybeMoved` there is flag-gated like any other ambiguous cleanup ([§14.5](#145-move-state-at-control-flow-joins)).

**Reason.** The next iteration would otherwise read a moved-from outer binding. Inner bindings do not have carried-over state. The restriction is on the *use*, not on the state: an outer binding that is moved in the loop and never touched again is well-defined, and rejecting it would be the same category error as rejecting a conditional move to avoid a drop flag.

**Examples.**
```ts
let f = File.open("log.txt") as result;
check result { return 1; }

for (const path of paths) {
  consume(f);                         // ERROR - f moved in a previous iteration
}

for (const path of paths) {
  const item = build(path) as result;  // fresh each iteration
  check result { continue; }
  consume(item);                      // OK
}

for (const path of paths) {
  consume(f);
  f = File.open(path) as result;      // revived before back-edge
  check result { break; }
}
```

**Conclusion.** An outer binding moved in a loop must be revived before the next iteration *uses* it; the back-edge may otherwise carry moved state. Inner-binding moves are fresh per iteration.

---

### 14.8 No Partial Moves Out of Aggregates

**Proposal.** Moving a field, element, or subobject out of an aggregate is forbidden. `move x.field`, `move arr[i]`, and moving out through a reference are compile errors. A binding is moved as a whole or not at all. To extract one owned field, either clone it if cloneable or move the whole aggregate into a consuming helper.

**The rule binds implicit transfers identically.** A bare use of a *unique field path* is a partial-move error, not an implicit move. Tier dispatch chooses which operation a legal bare use performs; it does not make an illegal one legal.

**Reason.** A partial move would leave an aggregate half-alive and force per-field move/disposal tracking. Delta keeps aggregate state whole.

**Examples.**
```ts
type Pair = { left: Buffer; right: Buffer; };
let pair: Pair = makePair();

consume(move pair.left);              // ERROR - partial move out of aggregate
consume(pair.left);                   // OK - Buffer is cloneable: implicit clone of the field
const l = clone pair.left;            // OK - identical to the line above

consume(pair);                        // OK - Pair is cloneable: implicit clone of the whole aggregate
consume(move pair);                   // OK - whole aggregate transfer
```

With a unique field, the bare field use is an error rather than a transfer:
```ts
type Holder = { handle: File; id: uint64; };   // unique by structure
let h: Holder = makeHolder();

consume(h.handle);                    // ERROR - partial move out of aggregate
consume(h);                           // OK - whole aggregate transfer
```

**Conclusion.** No partial moves, implicit or explicit. Move the whole aggregate, or clone the field you need.

---

### 14.9 Return Transfers and Clone Elision

**Proposal.** Returning an owned local binding or owned by-value parameter transfers it to the caller. This applies to cloneable and unique values alike, and only to owned locals and by-value parameters — not to fields, indexed elements, references, globals, or captured variables.

A returned copyable value is copied.

For a **cloneable** value, this is a *clone elision*: `return` is a bare use, and a bare use of a cloneable value would otherwise deep-clone ([§14.2](#142-the-three-operations)). When the returned operand is a whole local binding or owned by-value parameter, the clone is elided and the value transfers instead. No diagnostic is emitted; `return move doc` is accepted and means the same thing.

The elision is sound without any last-use analysis. A `return` *is* the end of the binding's life — no code in the function can observe the source afterward, on any path — so "transfer" and "clone, then discard the original" are indistinguishable except in cost. This is why `return` can elide while an ordinary bare use cannot ([§14.12](#1412-explicit-non-goals-for-section-14) — last-use-is-implicit-move remains rejected).

**Reason.** `return` already exits the current ownership context, so transfer is expected there. The exclusions preserve the no-partial-move and no-reference-to-owned-value invariants.

Clone elision at `return` is not an optimization; it is required for the tier-dispatch model to be a net gain. Without it, every ownership-returning factory — the most common ownership shape in the language — would deep-copy a local that is about to be destroyed, and authors would have to write `return move x` throughout to avoid it. That would reintroduce mandatory ownership syntax at precisely the site the old model already got right.

**Examples.**
```ts
function identity(file: File): File {
  return file;                        // OK - owned parameter transfers out
}

function makeDoc(): Doc {
  const d = buildDoc();               // Doc is cloneable
  return d;                           // OK - transfers; the clone is elided
}

function makeDocExplicit(): Doc {
  const d = buildDoc();
  return move d;                      // OK - identical; the elision makes this unnecessary
}

function leakField(box: FileBox): File {
  return box.file;                    // ERROR - partial move out of box
}

function leakRef(file: &File): File {
  return file;                        // ERROR - reference is not ownership
}
```

**Conclusion.** `return` transfers owned locals and by-value parameters, eliding the clone a cloneable value would otherwise incur. Fields, references, indexed elements, globals, and captures are excluded.

---

### 14.10 Ownership of Pending Fallible Values

**Proposal.** A binding produced by a fallible call and bound with `as result` is pending until its `check` block has run. A pending binding cannot be read, mutated, referenced, moved, or cloned. After the `check` block exits, the success value is a normal owned binding.

A **bare use of a pending binding is an error too**, in every tier. Tier dispatch selects among copy, clone, and move for a usable value; a pending binding is not yet a value, so there is nothing to dispatch on. The diagnostic reports the unchecked result, not the tier.

This rule applies to `clone x as result` as well. The clone result is pending until checked. Bare `clone x` — and therefore any implicit clone — does not create a pending result, because it aborts on allocation failure rather than producing one.

**Reason.** A pending value may actually be in the error state. Ownership operations must wait until the value exists.

**Examples.**
```ts
const f = File.open(p) as result;
consume(f);                           // ERROR - f is unchecked
consume(move f);                      // ERROR - f is unchecked
inspect(&f);                          // ERROR - f is unchecked
check result { return 1; }
consume(f);                           // OK
```

Recoverable clone result:
```ts
const copy = clone doc as result;
inspect(&copy);                       // ERROR - copy is unchecked
check result { return 1; }
inspect(&copy);                       // OK
```

**Conclusion.** Pending fallible results cannot participate in ownership or reference operations until `check` has run. Bare clone is not pending; recoverable clone is.

---

### 14.11 Redundant-Operation Diagnostics

**Proposal.** Ownership operators emit diagnostics when a tier makes the operation pointless or impossible:

- `move` on a copyable value is permitted and is **not** diagnosed: it transfers and invalidates the source like any other `move`. It is unnecessary on a copyable value — a bare use already copies — but it is a deliberate, meaningful operation, not a redundant one, so it neither warns nor leaves the source live.
- `clone` on a copyable value is a warning. Use a bare assignment instead.
- `clone` on a unique value is a hard error. This is the only hard error among the ownership operations.
- `move` on a unique value and `clone` on a cloneable value are **not** diagnosed. Each restates its tier's default exactly; writing one for clarity at a transfer or duplication site is encouraged, not penalized.

*(Revised 2026-07-16 — the previous fourth rule, "bare assignment or by-value passing of cloneable or unique values is a hard error," is deleted. That situation no longer exists: a bare use dispatches on tier. Diagnostic `E0706` is retired outright, and its hint — "use `move x` to transfer it or `clone x` to duplicate it" — has nowhere to migrate, because the compiler now performs whichever operation the hint used to demand.)*

**Reason.** Diagnostics should teach the tier model at the exact site where the author chose the wrong operation — and should stay silent where the author chose a *right* one, whether or not it was necessary. The surviving warning marks a genuine mistake: `clone v` on a copyable `v` says the author expected duplication to cost something, which for a copyable value is a misunderstanding worth naming.

**Examples.**
```ts
let v: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let w = move v;                       // OK - transfers; v is now moved-from
print(v);                             // ERROR - use after move

let v2: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let u = clone v2;                     // WARNING - clone redundant; use assignment

let doc = makeDoc();                  // Doc is cloneable
let d2 = clone doc;                   // OK - no warning; restates the default

let s: Session = makeSession();       // Session is unique
let c = clone s;                      // ERROR - Session is unique
use(s);                               // OK - transfer
use(move s);                          // ERROR - use after move (s was transferred above)
```

**Conclusion.** `clone` on a copyable value warns. `move` on a copyable value is a real transfer, not a redundant operation, so it does not warn and invalidates the source. Restating a tier's default never warns. Cloning a unique value is the one impossible operation, and it errors.

---

### 14.12 Explicit Non-Goals for Section 14

The following are deliberately out of scope for MVP or permanently excluded:

- **A `copy` operator or `copy` keyword** - never. A bare use of a copyable value already copies.
- **Last-use-is-implicit-move** - never. Tier dispatch is position-independent: a bare use of a unique value transfers whether or not it is the last use, and a bare use of a cloneable value clones even when the source is never touched again. Move state never depends on later code. The one construct that looks like an exception, clone elision at `return` ([§14.9](#149-return-transfers-and-clone-elision)), is not one: a `return` ends the binding's life by definition, so no analysis of subsequent uses is involved.
- **Partial moves out of fields, elements, or subobjects** - never, implicit or explicit.
- **Use of a `MaybeMoved` binding** - never. Drop flags make such a binding disposable, not usable.
- **Runtime use-after-move detection** - never. Use-after-move is a compile-time error. Drop flags do not weaken this: they answer "must this be disposed?", never "is this still valid?"
- **A tier-polymorphic `<any T>` generic bound** - out of scope for MVP.
- **`uses Copyable`, `uses Cloneable`, or `uses Disposable` ownership markers** - replaced by structural copy/clone inference, `unique type`, and `dispose` only on unique types.
- **Custom clone hooks** - out of scope for this ownership model. Clone is structurally derived.
- **An allocation capability marker for clone** - unnecessary because bare clone aborts on OOM and `clone x as result` opts into recovery.
- **Refcounting or tracing GC** - never. Drop flags are the only runtime ownership mechanism, and they carry no per-object metadata.

**Reversed on 2026-07-16.** Two entries formerly on this list are now core rules. They are recorded here rather than deleted, because the arguments that put them here were sound at the time and the reasons they no longer apply are worth keeping:

- **Implicit move in assignment or function arguments** - formerly "never; `return` is the only implicit transfer boundary." Now the defined behavior for unique values ([§14.2](#142-the-three-operations)). The old rule treated visible transfer as the point; the current model treats the compiler's ability to *prove* the transfer sound as the point, and makes the syntax follow the proof rather than duplicate it.
- **Drop flags / conditional-disposal bookkeeping** - formerly "never; move state is statically uniform at every merge." Now emitted for `MaybeMoved` bindings ([§14.5](#145-move-state-at-control-flow-joins)). Move state is *still* statically known at every merge — what changed is that a merge with genuinely disagreeing predecessors resolves disposal at runtime instead of rejecting the program. The "statically uniform" phrasing described the old remedy, not an invariant worth keeping.

---

### 14.13 Cross-Section Alignment

This section is aligned with the following rules elsewhere in the spec:

- **§5.6** - `Wrap<T>` / `Saturate<T>` are transparent tags over copyable integers and are themselves copyable.
- **§6.9 / §6.10** - `clone` and `move` are reserved value-level operators; move-state analysis recognizes diverging terminators.
- **§7** - `string` / `cstring` are cloneable owned types; `stringview` / `cstringview` / `Slice<T>` are copyable views.
- **§8.7 / §8.9** - `heap T` is cloneable iff `T` is copyable or cloneable; aggregate clone is structural.
- **§8** - records become unique only with `unique type`; `dispose` is a receiver function, legal only on a `unique type`, and is compiler-invoked.
- **§11** - `const` is read-only and non-consuming; `let` is movable and revivable.
- **§12 / §15** - references do not own their referents; `move` cannot turn a reference into owned storage, and `clone` may read through a reference. **§12's auto-borrow ranking is load-bearing for this section**: auto-borrow outranks by-value passing for non-copyable arguments, which is what confines implicit cloning to callees that genuinely demand ownership ([§14.2](#142-the-three-operations)).
- **§13.5 / §13.8** - single-owner disposal and allocation-failure policy build on the move/clone rules here. §13.8's abort-by-default policy is a precondition for implicit cloning, not merely compatible with it.

**Conclusion.** Ownership stays single-owner. A bare use copies, deep-clones, or transfers according to the operand's tier; unique values can only ever move.

---

### Known-stale cross-references

Two migrations are pending elsewhere in the spec and were deliberately **not** performed in
this revision, to keep it reviewable as a single decision:

- **`class` → `type` + receiver functions.** Classes were dropped from the implementation
  (~Jun 2026). §14's own prose and examples are converted, but **§9 is still a classes
  section**, and the §14.13 line above now points at §8 for a rule §9 may still claim. Verify
  against `test-source/tests/` before trusting either.
- **`heap T` → `owned<T>`.** The indirection type was renamed (`heap` → `box` → `owned`).
  §14 still says `heap T` to stay consistent with §8.7 / §8.9, which also still say it; the
  Phase F and Phase H plans already say `owned<T>`. Rename all three together or none.

---
