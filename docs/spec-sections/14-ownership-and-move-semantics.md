## 14. Ownership & Move Semantics

Section 14 is the home section for Delta's ownership model: how values are classified as copyable, cloneable, or unique; the three non-overlapping ways to obtain another usable value (`assignment`, `move`, `clone`); how generic tier bounds determine body discipline; how move state flows through branches, loops, and revival; why partial moves out of aggregates are forbidden; how `return` acts as the one implicit transfer boundary; and how ownership interacts with pending fallible results. The recurring principles are **duplication is never hidden for owned resources**, **ownership has exactly one owner**, and **the compiler proves move state statically**.

---

### 14.1 The Ownership Tier Classifier

**Proposal.** Every type falls into exactly one of three ownership tiers:

- **Copyable** - duplicated by plain assignment and by-value passing. Copying has no ownership effect on the source.
- **Cloneable** - not copyable, but explicitly duplicable with `clone`. Cloning may allocate.
- **Unique** - neither copyable nor cloneable. A unique value can only be moved or referenced.

Only `unique` is explicitly declared, with `unique class Name`. Copyability and cloneability are structurally inferred from fields for every other type. There is no `uses Copyable` or `uses Cloneable` ownership marker in this model.

The classifier is recursive:

- The copyable base set includes primitive numeric types, `bool`, `char`, enums, the `Wrap<T>` / `Saturate<T>` tags, read-only references (`&T`), and view values such as `Slice<T>`, `stringview`, and `cstringview`.
- A `type` record, fixed array, tagged union, or non-unique class is copyable iff every stored field, element, or variant payload is copyable.
- A type is cloneable iff it is not copyable, is not unique, and every stored field, element, or variant payload is copyable or cloneable.
- `heap T` is cloneable iff `T` is copyable or cloneable. It is never copyable, because copying the heap handle would duplicate ownership of one allocation.
- A `unique class` is unique. Any aggregate containing a unique field is unique by structure.
- A stored mutable reference (`edit &T`) is a unique capability. Any aggregate containing one is unique; a class containing one must be declared `unique class`.

`dispose()` is permitted only on `unique class`. Writing a `dispose()` hook on a non-unique class is a compile error. A unique class may omit `dispose()` if it has no custom cleanup beyond field disposal.

**Reason.** The split is about visibility of duplication and cleanup. Copyable values can be duplicated silently because no ownership is duplicated. Cloneable values own resources that can be independently duplicated, but that duplication is visible at the call site through `clone`. Unique values represent resources or capabilities that cannot be duplicated safely.

Making only `unique` explicit puts the burden on the dangerous case. A class with only copyable fields is copyable by structure. A class with cloneable owned fields is cloneable by structure. A class that owns a non-duplicable resource says so up front with `unique class`.

**Examples.**
```ts
// copyable - every field is copyable
type Vec3 = { x: float32; y: float32; z: float32; };
type Span = { text: stringview; len: uintsize; };

class Counter {
  private value: int32;
}
// Counter is copyable by structure.

// cloneable - owns cloneable storage
type Doc = { title: string; body: string; };
class Buffer {
  private bytes: Array<uint8>;
}
// Doc and Buffer are cloneable by structure.

// unique - explicitly non-duplicable
unique class File {
  private fd: FileDescriptor;

  dispose(): void {
    os.close(this.fd);
  }
}

type Session = { conn: File; id: uint64; };
// Session is unique because it contains File.
```

Invalid `dispose()`:
```ts
class BadCounter {
  private value: int32;

  dispose(): void { }                 // ERROR - dispose requires unique class
}
```

Mutable reference field:
```ts
@lifetime(db)
unique class Transaction {
  private db: edit &Database;
  private committed: bool;

  dispose(): void {
    if (!this.committed) {
      this.db.rollbackRaw();
    }
  }
}
```

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

**Conclusion.** Delta has three tiers: copyable, cloneable, and unique. Only `unique class` is explicit. Copyability and cloneability are inferred structurally, and generic bounds choose one tier at a time.

---

### 14.2 Three Operations, No `copy` Operator

**Proposal.** There are exactly three ways to obtain another usable value or binding from an existing one:

- **Plain assignment / by-value passing** copies only copyable values.
- **`move x`** transfers a binding and invalidates the source; the source becomes moved-from. This applies to any tier — for cloneable and unique values it is the only way to transfer, and for copyable values it still invalidates the source (use plain assignment if you want the source to stay live).
- **`clone x`** duplicates a copyable or cloneable value. For cloneable values this is a deep duplicate; for copyable values it is redundant and warns.

There is no `copy` operator and no `copy` keyword.

For cloneable and unique values, bare assignment and bare by-value passing are compile errors. The call site must spell the chosen ownership action:

```ts
g(b);                                 // ERROR - cloneable bare-pass forbidden
g(move b);                            // OK - transfer
g(&b);                                // OK - reference
g(clone b);                           // OK - duplicate, aborts on OOM
g(clone b as result);                 // OK - recoverable clone
check result { return; }
```

For unique values:

```ts
use(file);                            // ERROR - unique bare-pass forbidden
use(clone file);                      // ERROR - unique values cannot clone
use(&file);                           // OK - reference
use(move file);                       // OK - transfer
```

**Reason.** Assignment should never hide ownership transfer or heap allocation. Copyable values are the only values cheap and safe enough for silent duplication. Cloneable values can be duplicated, but only with visible `clone`. Unique values cannot be duplicated at all.

**Examples.**
```ts
let v: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let w = v;                            // OK - Vec3 is copyable

let doc = makeDoc();                  // Doc is cloneable
let doc2 = doc;                       // ERROR - cloneable assignment forbidden
let doc2 = clone doc;                 // OK - duplicate, aborts on OOM
let doc3 = move doc;                  // OK - ownership transfer
```

```ts
let file = File.open(path) as result;
check result { return; }

let file2 = file;                     // ERROR - File is unique
let file2 = clone file;               // ERROR - File is unique
let file2 = move file;                // OK
```

**Conclusion.** Assignment copies only copyable values. `move` transfers ownership. `clone` explicitly duplicates cloneable values. No `copy` operator exists.

---

### 14.3 The `move` Operator

**Proposal.** `move x` transfers a live binding and invalidates the source. After the move, `x` is moved-from: reading, mutating, referencing, moving, or cloning it is a compile error until it is revived ([§14.6](#146-revival-by-reassignment)). This holds regardless of tier — `move` invalidates the source even when `x` is copyable.

The operand of `move` is restricted to a live owned binding referenced by its whole name: a local `let` binding or an owned by-value parameter. The following are rejected:

- `move x.field` - partial move out of an aggregate ([§14.8](#148-no-partial-moves-out-of-aggregates)).
- `move arr[i]` - indexed element.
- `move makeFile()` - a temporary; the call result is already yours.
- `move constX` - `const` is non-consuming.

`move` on a copyable value is permitted but unnecessary — plain assignment or by-value passing already copies it ([§14.2](#142-three-operations-no-copy-operator)). When you do write `move`, the source is invalidated like any other binding; there is no copyable exception and no warning-and-stay-live behavior. A developer who wants the source to remain live should simply not write `move`.

`move` never converts a reference into ownership of its referent. A value of type `&T` is a non-owning reference value. Moving or copying that value only moves or copies the reference itself; it never moves the `T`.

**Reason.** Keyword-prefix `move` makes transfer visible. Restricting the operand to a whole owned binding keeps move state simple: a binding is either live, moved-from, or absent. Partial moves would make aggregate values half-alive.

**Examples.**
```ts
let f = File.open("a.txt") as result;
check result { return 1; }

consume(move f);                      // ownership transferred
inspect(&f);                          // ERROR - use after move

let pair: Pair = makePair();
consume(move pair.left);              // ERROR - partial move out of aggregate
consume(move makeFile());             // ERROR - temporary has no owning binding

function archive(doc: Doc): void {    // owned by-value parameter
  store(move doc);                    // OK
}
```

Copyable values are invalidated too:
```ts
let v: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let w = v;                            // OK - copyable, v stays live
let u = move v;                       // v is now moved-from
print(v);                             // ERROR - use after move
```

**Conclusion.** `move x` transfers from a whole live binding and invalidates the source in every tier — copyable, cloneable, and unique alike. It never moves out of fields, elements, temporaries, or references.

---

### 14.4 The `clone` Operator

**Proposal.** `clone x` produces an independent duplicate of a copyable or cloneable value. For cloneable values, it performs a recursive deep clone. For copyable values, it is redundant and emits a warning.

Allocation failure policy:

- Bare `clone x` aborts on allocation failure. It does not add `AllocError` to the surrounding function signature and does not require `as result`.
- `clone x as result` opts into recoverable allocation failure. The result is consumed with `check result`, `forward result`, or another ordinary result-handling form.

The old rule "fallible expression must be handled" does not apply to bare `clone`. Clone follows the same policy as bounds and overflow checks: panic/abort by default, recoverable when explicitly requested.

The operand of `clone` is any readable path:

- a `const` or `let` binding,
- an owned by-value parameter,
- a reference parameter (`&T` or `edit &T`), cloning the referent,
- field paths through any of the above, with `heap T` auto-deref.

Temporaries are rejected for readability: bind the value first.

Derived clone is structural and recursive. Copyable fields are copied, cloneable fields are recursively cloned, and `heap T` fields allocate fresh boxes around cloned `T` values. Clone is transactional on the recoverable `as result` path: if a per-field clone fails, already-created cloned fields are disposed before `AllocError` is returned. On the bare path, allocation failure aborts and no partially-built value becomes visible.

There is no `uses Cloneable` marker in this model. Cloneability is inferred from fields.

**Reason.** `clone` is the visible operation for duplicating owned data. Making bare clone abort-on-OOM optimizes the common systems-programming path: most application code treats allocation failure like other local deterministic traps. Arena, embedded, or service code that needs graceful exhaustion handling can opt into `clone x as result`.

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

Redundant and impossible clones:
```ts
const w = clone v;                     // WARNING - Vec3 is copyable; use assignment
const f2 = clone file;                 // ERROR - File is unique
```

**Conclusion.** `clone x` is explicit duplication. Bare clone aborts on allocation failure; `clone x as result` opts into recovery. Cloneability is structural, recursive, and unavailable for unique values.

---

### 14.5 Move State at Control-Flow Joins

**Proposal.** A binding's move state is tracked per path. At a control-flow merge, a binding is moved-from if it is moved on any path reaching the merge. Consequently:

- A use of the binding after the merge must be statically safe on all reaching paths.
- Moving a binding on some-but-not-all paths that reach a merge is a compile error.
- A path that diverges before the merge (`return`, `panic`, `break`, `continue`, `process.exit`, `unreachable`) does not reach the merge, so a move on that path is fine.

**Reason.** This removes runtime drop flags. The compiler always knows whether a binding is live or moved-from at every program point.

**Examples.**
```ts
let f = File.open("a.txt") as result;
check result { return 1; }

if (cond) {
  consume(move f);
}
inspect(&f);                          // ERROR - f may have been moved

if (cond) {
  consume(move f);
  return 0;                           // diverges
}
inspect(&f);                          // OK - only non-moved path reaches here

if (cond) { consume(move f); }
else      { archive(move f); }
inspect(&f);                          // ERROR - moved on all reaching paths
```

**Conclusion.** Move state is path-sensitive and statically known at merges. Conditional moves that rejoin are rejected; diverging paths are exempt. No drop flags.

---

### 14.6 Revival by Reassignment

**Proposal.** A moved-from `let` binding may be revived by whole-value assignment. After revival, it is fully live again: readable, mutable, referenceable, movable, and clonable. Partial revival through a field is forbidden.

`const` bindings cannot be revived because they cannot be moved from.

**Reason.** Revival keeps consume-then-reuse patterns ergonomic without weakening the complete-value invariant. A binding is absent, moved-from, or holds a complete value; it is never half-valid.

**Examples.**
```ts
let f = File.open("a.txt") as result;
check result { return 1; }

consume(move f);                      // f is moved-from
inspect(&f);                          // ERROR

f = File.open("b.txt") as result;     // revival by whole-value assignment
check result { return 1; }
inspect(&f);                          // OK
```

**Conclusion.** Whole-value assignment revives a moved-from `let` binding. Partial revival is forbidden.

---

### 14.7 Moves in Loops

**Proposal.** A loop back-edge is treated as a control-flow merge. For a binding declared outside the loop, moving it in the loop body and not reviving it before the next iteration reaches a use is a compile error. A binding declared inside the loop body is fresh on each iteration, so moving it is legal.

**Reason.** The next iteration would otherwise observe a moved-from outer binding. Inner bindings do not have carried-over state.

**Examples.**
```ts
let f = File.open("log.txt") as result;
check result { return 1; }

for (const path of paths) {
  consume(move f);                    // ERROR - f moved in a previous iteration
}

for (const path of paths) {
  const item = build(path) as result;  // fresh each iteration
  check result { continue; }
  consume(move item);                 // OK
}

for (const path of paths) {
  consume(move f);
  f = File.open(path) as result;      // revived before back-edge
  check result { break; }
}
```

**Conclusion.** Outer-binding moves in a loop require revival before the next iteration; inner-binding moves are fresh per iteration.

---

### 14.8 No Partial Moves Out of Aggregates

**Proposal.** Moving a field, element, or subobject out of an aggregate is forbidden. `move x.field`, `move arr[i]`, and moving out through a reference are compile errors. A binding is moved as a whole or not at all. To extract one owned field, either clone it if cloneable or move the whole aggregate into a consuming helper.

**Reason.** A partial move would leave an aggregate half-alive and force per-field move/disposal tracking. Delta keeps aggregate state whole.

**Examples.**
```ts
type Pair = { left: Buffer; right: Buffer; };
let pair: Pair = makePair();

consume(move pair.left);              // ERROR - partial move out of aggregate
const l = clone pair.left;            // OK if Buffer is cloneable

consume(move pair);                   // OK - whole aggregate move
```

**Conclusion.** No partial moves. Move the whole aggregate, or clone the field you need.

---

### 14.9 Return as the Implicit Transfer Boundary

**Proposal.** `return` is the one place where ownership transfers without explicit `move`. Returning an owned local binding or owned by-value parameter transfers it to the caller, including cloneable and unique values. This implicit transfer applies only to owned locals and by-value parameters. It does not apply to fields, indexed elements, references, globals, or captured variables.

A returned copyable value is copied.

**Reason.** `return` already exits the current ownership context, so transfer is expected there. The exclusions preserve the no-partial-move and no-reference-to-owned-value invariants.

**Examples.**
```ts
function identity(file: File): File {
  return file;                        // OK - owned parameter transfers out
}

function makeDoc(): Doc {
  const d = buildDoc();
  return d;                           // OK - owned local transfers out
}

function leakField(box: FileBox): File {
  return box.file;                    // ERROR - partial move out of box
}

function leakRef(file: &File): File {
  return file;                        // ERROR - reference is not ownership
}
```

**Conclusion.** `return` transfers owned locals and by-value parameters implicitly. Fields, references, indexed elements, globals, and captures are excluded.

---

### 14.10 Ownership of Pending Fallible Values

**Proposal.** A binding produced by a fallible call and bound with `as result` is pending until its `check` block has run. A pending binding cannot be read, mutated, referenced, moved, or cloned. After the `check` block exits, the success value is a normal owned binding.

This rule applies to `clone x as result` as well. The clone result is pending until checked. Bare `clone x` does not create a pending result because it aborts on allocation failure.

**Reason.** A pending value may actually be in the error state. Ownership operations must wait until the value exists.

**Examples.**
```ts
const f = File.open(p) as result;
consume(move f);                      // ERROR - f is unchecked
inspect(&f);                          // ERROR - f is unchecked
check result { return 1; }
consume(move f);                      // OK
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

- `move` on a copyable value is permitted and is **not** diagnosed: it transfers and invalidates the source like any other `move`. It is unnecessary on a copyable value — assignment already copies — but it is a deliberate, meaningful operation, not a redundant one, so it neither warns nor leaves the source live.
- `clone` on a copyable value is a warning. Use assignment instead.
- `clone` on a unique value is a hard error.
- Bare assignment or by-value passing of cloneable or unique values is a hard error.

**Reason.** Diagnostics should teach the tier model at the exact site where the author chose the wrong operation.

**Examples.**
```ts
let v: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let w = move v;                       // OK - transfers; v is now moved-from
print(v);                             // ERROR - use after move

let v2: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let u = clone v2;                     // WARNING - clone redundant; use assignment

let s: Session = makeSession();
let c = clone s;                      // ERROR - Session is unique
use(s);                               // ERROR - unique bare-pass forbidden
use(move s);                          // OK
```

**Conclusion.** `clone` on a copyable value warns. `move` on a copyable value is a real transfer, not a redundant operation, so it does not warn and invalidates the source. Impossible duplication of unique values and bare use of non-copyable values error.

---

### 14.12 Explicit Non-Goals for Section 14

The following are deliberately out of scope for MVP or permanently excluded:

- **A `copy` operator or `copy` keyword** - never.
- **Implicit move in assignment or function arguments** - never. `return` is the only implicit transfer boundary.
- **Last-use-is-implicit-move** - never. Cloneable and unique bodies still require explicit `move`.
- **Drop flags / conditional-disposal bookkeeping** - never. Move state is statically uniform at every merge.
- **Partial moves out of fields, elements, or subobjects** - never.
- **A tier-polymorphic `<any T>` generic bound** - out of scope for MVP.
- **`uses Copyable`, `uses Cloneable`, or `uses Disposable` ownership markers** - replaced by structural copy/clone inference, `unique class`, and `dispose()` only on unique classes.
- **Custom clone hooks** - out of scope for this ownership model. Clone is structurally derived.
- **An allocation capability marker for clone** - unnecessary because bare clone aborts on OOM and `clone x as result` opts into recovery.
- **Runtime use-after-move detection** - never. Use-after-move is a compile-time error.

---

### 14.13 Cross-Section Alignment

This section is aligned with the following rules elsewhere in the spec:

- **§5.6** - `Wrap<T>` / `Saturate<T>` are transparent tags over copyable integers and are themselves copyable.
- **§6.9 / §6.10** - `clone` and `move` are reserved value-level operators; move-state analysis recognizes diverging terminators.
- **§7** - `string` / `cstring` are cloneable owned types; `stringview` / `cstringview` / `Slice<T>` are copyable views.
- **§8.7 / §8.9** - `heap T` is cloneable iff `T` is copyable or cloneable; aggregate clone is structural.
- **§9** - classes become unique only with `unique class`; `dispose()` is legal only on unique classes.
- **§11** - `const` is read-only and non-consuming; `let` is movable and revivable.
- **§12 / §15** - references do not own their referents; `move` cannot turn a reference into owned storage, and `clone` may read through a reference.
- **§13.5 / §13.8** - single-owner disposal and allocation-failure policy build on the move/clone rules here.

**Conclusion.** Ownership stays single-owner. Copyable values copy, cloneable values duplicate only through visible `clone`, and unique values move only.

---
