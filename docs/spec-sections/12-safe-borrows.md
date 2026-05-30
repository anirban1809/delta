## 12. Safe Borrows (`borrowed`, `mod borrowed`)

Section 12 defines Delta's MVP borrow model: explicit, non-owning, non-null access to existing storage for the duration of a call. The recurring principles are **visible access capability** (`borrowed x` and `mod borrowed x` at owner call sites), **many readers or one writer** (read-only aliases may coexist; mutable access is exclusive), and **no hidden lifetimes** (borrow operands must be named storage paths, not temporaries or expression results). Full lifetime syntax, stored borrows, borrowed returns, closure capture, and disjoint-place analysis are deliberately deferred.

---

### 12.1 Borrow Kinds and Scope

**Proposal.** Delta has two borrow types:

- **`borrowed T`** — a read-only borrow.
- **`mod borrowed T`** — a mutable borrow.

Both are non-owning references to existing storage. In MVP, borrows are limited to **function parameters and call arguments**. They may not be returned, stored in fields, assigned to local borrow bindings, placed in globals, or otherwise made to outlive the call/body in which they are used. Borrowing is available for all first-class value types, including primitive types.

**Reason.** Borrows provide zero-copy access without raw pointers, nullability, pointer arithmetic, or ownership transfer. Limiting MVP borrows to call scope preserves the memory-safety story without introducing lifetime parameters before the language has settled its ownership surface.

**Examples.**
```ts
function length(v: borrowed Vec3): float32 {
  return sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function translate(pos: mod borrowed Vec3, amount: Vec3): void {
  pos.x += amount.x;
  pos.y += amount.y;
  pos.z += amount.z;
}

length(borrowed position);
translate(mod borrowed position, delta);
```

Borrowing primitives is legal:
```ts
function increment(n: mod borrowed int32): void {
  n += 1;
}

let count: int32 = 41;
increment(mod borrowed count);        // count is now 42
```

Escaping borrows are not part of MVP:
```ts
function bad(v: borrowed Vec3): borrowed Vec3 {
  return v;                            // ERROR - borrowed returns require lifetime rules
}

type Holder = {
  value: borrowed Vec3;                // ERROR - borrows in fields require lifetime rules
};
```

**Conclusion.** `borrowed T` and `mod borrowed T` are MVP parameter/call-scope capabilities. They apply uniformly to all value types. Borrow escape is post-MVP. Because borrows are confined to call scope and cannot be stored, the entire exclusivity check reduces in MVP to inspecting a single call's borrow set (its arguments and receiver) — the precise scope and its limits are given in [§12.4](#124-exclusivity-and-root-locking).

---

### 12.2 Explicit Borrow Creation and Forwarding

**Proposal.** Creating a borrow from an owned value at a call site is explicit:

```ts
read(borrowed value);
mutate(mod borrowed value);
```

An existing borrow-typed parameter may be forwarded without repeating `borrowed`; its type already carries the borrow capability. A `mod borrowed T` may be passed to a `borrowed T` parameter by implicit capability weakening. The reverse is not allowed.

**Reason.** Explicit borrow creation keeps ownership and access capability visible at the boundary where an owned value is loaned out. Forwarding an already-borrowed parameter is not a new borrow from owned storage; requiring another `borrowed` marker there would be noise. Weakening mutable access to read-only access is safe and avoids duplicate read-only overloads.

**Examples.**
```ts
function read(v: borrowed Vec3): void { /* ... */ }
function mutate(v: mod borrowed Vec3): void { /* ... */ }

let value: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };

read(value);                            // ERROR - owner call site must say `borrowed`
read(borrowed value);                   // OK
mutate(mod borrowed value);             // OK
```

Forwarding:
```ts
function wrapper(v: borrowed Vec3): void {
  read(v);                              // OK - already borrowed
  mutate(v);                            // ERROR - cannot upgrade read-only to mutable
}

function wrapper2(v: mod borrowed Vec3): void {
  read(v);                              // OK - implicit weakening to borrowed
  mutate(v);                            // OK
}
```

**Conclusion.** Borrow creation from owned values is explicit. Existing borrow parameters forward by type; `mod borrowed T` weakens to `borrowed T` when passed onward.

---

### 12.3 Binding Capability

**Proposal.** A `const` binding may produce only `borrowed T`. A `let` binding may produce either `borrowed T` or `mod borrowed T`, subject to the exclusivity rules in [§12.4](#124-exclusivity-and-root-locking). Borrowing does not permanently change the binding's capability after the call returns.

Field-path borrow capability is determined by the root access path. MVP has no field-level mutability modifiers.

**Reason.** `const` is read-only and non-consuming through its normal access paths ([§11](#11-mutability-model-const-vs-let)), so it cannot produce mutable access. `let` is the single owned binding form that permits mutation, reassignment, mutable borrowing, and moving.

**Examples.**
```ts
const frozen: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let live: Vec3 = { x: 4.0, y: 5.0, z: 6.0 };

read(borrowed frozen);                  // OK
mutate(mod borrowed frozen);            // ERROR - const cannot produce mutable borrow

read(borrowed live);                    // OK
mutate(mod borrowed live);              // OK

live.x = 10.0;                          // OK after the borrow call has returned
```

For fields:
```ts
let user: User = makeUser();
const archived: User = makeUser();

updateProfile(mod borrowed user.profile);      // OK - root is mutable
updateProfile(mod borrowed archived.profile);  // ERROR - root is const
readProfile(borrowed archived.profile);        // OK
```

**Conclusion.** Read-only borrows may come from `const` or `let`; mutable borrows require a mutable root. Borrowing is temporal and does not downgrade a `let` after the call.

---

### 12.4 Exclusivity and Root Locking

**Proposal.** Delta uses the standard rule: many read-only borrows may coexist, or one mutable borrow may exist, but not both. For MVP, exclusivity is checked at the **root binding** level. Any `mod borrowed` derived from a root locks that entire root for the duration of the call. Field-disjoint mutable borrows are not recognized in MVP.

The same rule forbids combining a move from a root with any borrow derived from that root in the same call.

A non-owning view binds to its own root, so syntactic root-checking cannot relate it to the storage it aliases. To keep root-checking sound without instance-level provenance, a view type declares the storage type it aliases with `uses View of S` ([§9.1](#91-core-model)), and the rule extends by **viewed type**: a `View of S` value may not be passed as a borrow in any call that also takes a `mod borrowed S`. This is conservative — it triggers on type match and cannot tell two distinct `S` values apart — but it is sound and needs no provenance analysis. Soundness depends on the marker being present; an aliasing type that omits `uses View of S` is trusted to own its storage, exactly as a type that omits `Copyable` is trusted to be move-only.

**Reason.** Mutable access can replace fields (including whole-value replacement, which disposes the old value — [§12.6](#126-mutation-replacement-and-moving)), trigger disposal of owned storage, reallocate internal buffers, or otherwise invalidate derived views. Root-level checking is conservative, but it is simple and sound before the lifetime and place-analysis design exists.

For example, owner-plus-view aliasing can become a real use-after-free:
```ts
function clearThenRead(xs: mod borrowed Array<uint8>, view: borrowed Slice<uint8>): uint8 {
  xs.clearAndFreeCapacity();             // may free the backing buffer
  return view[0];                        // would read freed storage if view came from xs
}

let xs: Array<uint8> = [10, 20, 30];
const view: Slice<uint8> = xs.slice();      // Slice<uint8> is `uses View of Array<uint8>`
clearThenRead(mod borrowed xs, borrowed view);
// ERROR - `view` is a `View of Array<uint8>` and this call also takes
//         `mod borrowed Array<uint8>`; MVP cannot prove they are disjoint
```

**Examples.**
```ts
readBoth(borrowed x, borrowed x);        // OK
mix(mod borrowed x, borrowed x);         // ERROR
swap(mod borrowed x, mod borrowed x);    // ERROR - same root
```

Root-checking rejects the *syntactic* same-root call above. It does not see aliasing through distinct bindings (two `heap` handles reaching the same node, or graph edges), which is why a function like `swap` may still need a runtime `same(a, b)` guard ([§8.10](#810-identity-via-same)) for the aliasing the compiler cannot prove away.

Whole-root MVP conservatism:
```ts
type Pair = {
  left: Buffer;
  right: Buffer;
};

function fillTwo(a: mod borrowed Buffer, b: mod borrowed Buffer): void { /* ... */ }

let pair: Pair = makePair();
fillTwo(mod borrowed pair.left, mod borrowed pair.right);
// ERROR - both mutable borrows derive from root `pair`
```

Move-plus-borrow is also rejected:
```ts
consumeAndLog(move s, borrowed s);       // ERROR - cannot borrow `s` while moving `s`
archive(move file, borrowed file.meta);  // ERROR - same root
```

**Scope of the check.** MVP exclusivity is checked over the borrows bound to a *single callee's own parameters* (plus its receiver, [§12.7](#127-member-access-methods-and-reborrowing)), by syntactic root and viewed type. Borrows created by a *nested* call inside the argument list are not part of the outer call's set: under eager evaluation the inner call completes — and its borrows end — before the outer call is invoked:
```ts
mix(mod borrowed x, borrowed x);       // ERROR - both are mix's own parameters, coexist
f(mod borrowed x, g(borrowed x));      // OK - g's borrow of `x` ends before f is invoked
```

Because borrows cannot be stored and calls are synchronous, two borrows of one root never coexist across statements either — the owner's next statement always runs after the call returns:
```ts
mutate(mod borrowed live);             // borrow exists only for this call
live.x = 10.0;                         // OK - the borrow above is already gone
```

The check does **not** see aliasing reached through the object graph, a global, or a field. A function holding `mod borrowed` of one root can still reach the same storage by another path, and MVP will not diagnose it:
```ts
let g: Array<uint8> = [1, 2, 3];       // module-reachable storage

function append(xs: mod borrowed Array<uint8>): void {
  xs.push(readFromGlobal(g));          // if `xs` and `g` are the same storage,
}                                      // MVP cannot prove or forbid the overlap
```
Detecting such cross-binding aliasing is the post-MVP lifetime/place-analysis work; MVP relies on the runtime `same(...)` guard ([§8.10](#810-identity-via-same)) where it matters.

**Conclusion.** MVP borrow checking is root-based and per-call: within one call, multiple `borrowed` aliases are allowed; one `mod borrowed` excludes every other borrow or move from the same root (and any `View of` that root's type) for that call. The "many readers or one writer" rule is enforced at call argument lists, not as a whole-program aliasing invariant — it does not track aliasing across statements, globals, fields, or the object graph. Closing that gap is part of the post-MVP lifetime and place-analysis design.

---

### 12.5 Borrow Operands and Addressability

**Proposal.** Borrow operands must be explicit addressable paths rooted in bindings. In MVP, the allowed forms are:

- `binding`
- `binding.field`
- `binding.field.subfield`
- the same field paths through `heap T` auto-deref when the root is a binding

Borrowing a binding of type `heap T` **auto-derefs to the pointee** on borrow creation, exactly as read access does ([§8.8](#88-borrows-on-type-values-borrowed-t)): `borrowed h` and `mod borrowed h` for `h: heap T` produce `borrowed T` and `mod borrowed T`, a borrow of the pointed-to value, not of the heap box. There is no MVP form that borrows the box (the pointer-bearing storage) itself; storage identity of the box is observed only through `same(...)` ([§8.10](#810-identity-via-same)), which takes the `heap T` value directly.

Borrow operands may not be temporaries, function calls, operators, ternaries, literals, method-returned values, indexed elements, or slice expressions.

The operand's root binding must additionally be **live** at the borrow site: definitely initialized and not moved-from on every path that reaches the borrow, under the same definite-assignment tracking that governs disposal and moves ([§9.7](#97-disposal-and-disposable), [§11.5](#115-whole-value-initialization-only)). Borrowing an uninitialized or moved-from binding is an error — there is no live storage for the borrow to reference.

**Reason.** Delta avoids hidden temporary lifetime extension. If a value backs a borrow, the source should show the owner whose lifetime makes the borrow valid. Indexing and slicing are excluded in MVP because they resolve to produced values or views and require additional place/range analysis to borrow directly.

**Examples.**
```ts
read(borrowed value);                  // OK
read(borrowed pair.left);              // OK
read(borrowed tree.left.value);        // OK - heap auto-deref along field path
read(borrowed heapVec);                // OK - h: heap Vec3 auto-derefs to borrowed Vec3

read(borrowed makeVec3());             // ERROR - temporary
read(borrowed (cond ? a : b));         // ERROR - expression result
read(borrowed (a + b));                // ERROR - expression result
read(borrowed getUser().profile);      // ERROR - call result is temporary
read(borrowed xs[i]);                  // ERROR in MVP
read(borrowed xs.slice(0, 10));        // ERROR - bind the view first
```

The root must be live:
```ts
let s = makeThing();
consume(move s);
read(borrowed s);                      // ERROR - `s` is moved-from

let v: Vec3;                           // uninitialized (§11.5)
read(borrowed v);                      // ERROR - no live storage to borrow
```

Bind produced values explicitly:
```ts
const user = getUser() as result;
check result { return 1; }
readProfile(borrowed user.profile);

const view = xs.slice(0, 10);
process(view);                         // OK if parameter expects stringview/Slice value
```

**Conclusion.** Borrow operands are named storage paths, not arbitrary expressions. MVP allows binding and field paths only.

---

### 12.6 Mutation, Replacement, and Moving

**Proposal.** A `mod borrowed T` permits mutation through the borrow and whole-value assignment to the borrowed referent. Assigning to a `mod borrowed T` parameter replaces the caller's value; it does not re-point the local borrow. Replacement follows the same ownership rules as `let` reassignment and field replacement: Copyable right-hand sides copy, move-only right-hand sides require `move`, and the old value is disposed before the new value is installed.

Moving out of a borrowed referent's fields, indexed elements, or subobjects is not allowed in MVP. A borrowed referent must remain complete unless replaced as a whole.

Because whole-value replacement disposes the old value before installing the new one ([§9.8](#98-field-mutation-and-replacement)), it is a storage-invalidating event in the same way an explicit free is — it can invalidate any `View of` the referent's type. This is why the exclusivity rule in [§12.4](#124-exclusivity-and-root-locking) keys off *any* `mod borrowed S` in a call, not only calls to methods that explicitly release storage.

**Reason.** Mutable borrow means mutable access to the referent, including replacement. But moving out of subobjects would leave the caller's value partially uninitialized and require partial-move tracking through borrows, which is out of MVP scope.

**Examples.**
```ts
function reset(v: mod borrowed Vec3): void {
  v = { x: 0.0, y: 0.0, z: 0.0 };       // replaces caller's Vec3
}

let pos: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
reset(mod borrowed pos);
```

Owned replacement:
```ts
function replace(box: mod borrowed FileBox, next: FileBox): void {
  box = move next;                       // disposes old caller value, installs next
}
```

Field replacement is allowed; field move-out is not:
```ts
function replaceFile(box: mod borrowed FileBox, next: File): void {
  box.file = move next;                  // OK - replacement
}

function takeFile(box: mod borrowed FileBox): File {
  return move box.file;                  // ERROR - cannot move out through a borrow
}
```

Read-only borrows cannot assign:
```ts
function bad(v: borrowed Vec3): void {
  v = { x: 0.0, y: 0.0, z: 0.0 };        // ERROR - read-only borrow
}
```

**Conclusion.** `mod borrowed` supports mutation and whole-referent replacement. It does not support moving out through the borrow.

---

### 12.7 Member Access, Methods, and Reborrowing

**Proposal.** Borrowed values use normal field access and method-call syntax. Receiver capability follows the borrow type:

| Receiver | Can read fields? | Can write fields? | Can call non-`mod` methods? | Can call `mod` methods? |
|---|---:|---:|---:|---:|
| `borrowed T` | Yes | No | Yes | No |
| `mod borrowed T` | Yes | Yes | Yes | Yes |

Code may create derived borrows from borrowed parameters for subcalls, subject to the same root-exclusivity rule.

The **receiver of a method call is itself a member of that call's borrow set**, with the capability its `mod`-ness implies: a non-`mod` method borrows its receiver as `borrowed`, a `mod` method as `mod borrowed`. It is checked against the argument borrows under the same root rule as everything else ([§12.4](#124-exclusivity-and-root-locking)). The common read idiom survives because many `borrowed` aliases coexist; only mutable aliasing of the receiver's own storage is rejected:
```ts
obj.inspect(borrowed obj.field);       // OK   - non-mod receiver (reader) + reader arg
obj.mutate(mod borrowed obj.field);    // ERROR - mod receiver (writer) + writer arg, root `obj`
obj.read(mod borrowed obj.field);      // ERROR - reader receiver + writer arg, root `obj`
```
As with §12.4's field-disjoint conservatism, this rejects some safe-in-fact calls (receiver and argument touching disjoint fields); the workaround is to have the method operate on its own field directly rather than receive it as a borrow.

**Reason.** Borrows should feel like safe references to the underlying value, not like a separate object that needs manual dereference. Reborrowing is necessary for helper functions on fields, while the root rule prevents simultaneous mutable derived borrows from becoming an aliasing hole.

**Examples.**
```ts
class Counter {
  private value: int32;

  public get(): int32 { return this.value; }
  public mod increment(): void { this.value += 1; }
}

function inspect(c: borrowed Counter): int32 {
  return c.get();                       // OK
}

function bad(c: borrowed Counter): void {
  c.increment();                        // ERROR - mod method on read-only borrow
}

function bump(c: mod borrowed Counter): void {
  c.get();                              // OK
  c.increment();                        // OK
}
```

Derived borrows:
```ts
type Line = {
  start: Vec3;
  end: Vec3;
};

function length(v: borrowed Vec3): float32 { /* ... */ }
function normalize(v: mod borrowed Vec3): void { /* ... */ }
function normalizePair(a: mod borrowed Vec3, b: mod borrowed Vec3): void { /* ... */ }

function lineLength(line: borrowed Line): float32 {
  return length(line.start);            // OK - field is already reached through a borrow
}

function normalizeLine(line: mod borrowed Line): void {
  normalize(line.start);                // OK
  normalize(line.end);                  // OK - sequential
}

function normalizeLineBad(line: mod borrowed Line): void {
  normalizePair(line.start, line.end);  // ERROR in MVP - two mod borrows from root `line`
}
```

**Conclusion.** Borrowed values support ordinary member access with capability checks. Derived sub-borrows are allowed for subcalls, but simultaneous mutable derived borrows from one root are rejected in MVP.

---

### 12.8 Borrowed Values Are Not Owned Values

**Proposal.** A `borrowed T` or `mod borrowed T` value cannot *implicitly* satisfy a by-value `T` parameter, cannot be moved from, and cannot be implicitly copied into an owned `T`. It may be passed onward to compatible borrow-typed parameters. An **explicit** `clone x` on a borrowed value is allowed where `T` is cloneable ([§11.3](#113-methods-copying-cloning-and-moving), [§14.4](#144-the-clone-operator)): cloning reads the referent and produces independent owned storage, so it is the sanctioned way to obtain an owned value from a borrow.

**Reason.** A borrow is an access capability, not ownership. Letting borrowed values silently satisfy by-value parameters would hide copies for Copyable types and impossible ownership transfers for move-only types. The ban is on *implicit* conversion to owned; an explicit `clone x` is visible at the call site and allocates its own storage, so it carries none of that hidden cost.

**Examples.**
```ts
function read(v: borrowed Vec3): void { /* ... */ }
function mutate(v: mod borrowed Vec3): void { /* ... */ }
function take(v: Vec3): void { /* by-value copy */ }

function wrapper(v: borrowed Vec3): void {
  read(v);                              // OK
  mutate(v);                            // ERROR
  take(v);                              // ERROR - borrow is not a by-value Vec3
}

function wrapper2(v: mod borrowed Vec3): void {
  read(v);                              // OK - weakening
  mutate(v);                            // OK
  take(v);                              // ERROR
}
```

Explicit `clone` is the way out to an owned value:
```ts
function snapshot(doc: borrowed Document): Document | AllocError {
  const owned = clone doc as result;    // OK - explicit, allocates, produces owned Document
  check result { return error as AllocError { code: "alloc.clone", message: result.error.message }; }
  return owned;                         // OK - returning an owned value, not the borrow
}
```

Move-only example:
```ts
function consume(file: File): void { /* owns file */ }

function bad(file: borrowed File): void {
  consume(file);                        // ERROR - borrowed value is not owned
  consume(move file);                   // ERROR - cannot move from a borrow
}
```

**Conclusion.** Borrowed values forward only as borrows. They do not copy, move, or satisfy by-value ownership.

---

### 12.9 Derived Views and Escape

**Proposal.** A method or coercion may produce a view derived from visible storage. For MVP, the full fresh-derived-view escape rule lives in [§13.6](#136-fresh-derived-view-lifetimes): a view freshly derived from an owned local, an owned by-value parameter, a borrowed parameter, or a field path rooted in any of those may be used locally, but it may not escape the function body by return, field storage, global storage, or capture by an escaping closure. Lambda capture rules are deferred to [§44](#44-function-types--lambdas).

This section's borrow-specific rule is the most common case: a method called on a borrowed parameter may produce a view derived from that borrowed storage for local use, but that view cannot escape.

**Reason.** A derived view may point into storage owned by a source whose lifetime ends before the returned/stored view would be used. Returning or storing it would smuggle a reference-like value out of the compiler-visible lifetime. Local use keeps common read APIs ergonomic without requiring lifetime syntax.

**Examples.**
```ts
class Document {
  private text: string;

  public viewText(): stringview {
    return this.text;
  }
}

function print(doc: borrowed Document): void {
  const text: stringview = doc.viewText();    // OK - local derived view
  console.writeLine(text);
}

function leak(doc: borrowed Document): stringview {
  return doc.viewText();                      // ERROR - derived view escapes
}

function save(doc: borrowed Document, cache: mod borrowed Cache): void {
  cache.lastText = doc.viewText();            // ERROR if cache may outlive this call
}
```

The same rule applies to views freshly derived from owned locals and owned by-value parameters:
```ts
function bad(): stringview {
  const s = string.from("hello") as result;
  check result { return "fallback"; }
  return s;                                  // ERROR - fresh view of local owned string escapes
}

function passThrough(v: stringview): stringview {
  return v;                                  // OK - pass-through view parameter
}
```

**Conclusion.** Fresh-derived views are local-only in MVP. Pass-through view values remain ordinary values. Full lifetime-tracked views require the future lifetime design.

---

### 12.10 Diagnostics

**Proposal.** Borrow diagnostics should name:

- the root binding,
- the requested capability (`borrowed`, `mod borrowed`, or `move`),
- the conflicting action,
- and any MVP limitation involved.

**Reason.** MVP borrow checking is intentionally conservative, especially around whole-root locking. Diagnostics must explain the root-level conflict so users do not mistake conservative rejection for arbitrary behavior.

**Examples.**
```ts
mix(mod borrowed x, borrowed x);
```

Diagnostic shape:
```txt
error: cannot borrow `x` as read-only because it is already mutably borrowed for this call
```

Whole-root limitation:
```ts
fillTwo(mod borrowed pair.left, mod borrowed pair.right);
```

Diagnostic shape:
```txt
error: cannot create multiple mutable borrows from root `pair` in one call
note: MVP borrow checking is root-based; field-disjoint borrows are not yet supported
```

Move conflict:
```ts
consumeAndLog(move s, borrowed s);
```

Diagnostic shape:
```txt
error: cannot borrow `s` in the same call where it is moved
```

Temporary:
```ts
inspect(borrowed makeVec3());
```

Diagnostic shape:
```txt
error: cannot borrow from a temporary expression
hint: bind the value first: `const value = makeVec3();`
```

**Conclusion.** Borrow errors should report the root and the capability conflict, and should explicitly call out MVP root-based limitations.

---

### 12.11 Explicit Non-Goals for Section 12

The following are deliberately out of scope for MVP or permanently excluded:

- **Borrowed return values** — deferred to the lifetime design.
- **Borrow fields in `type` or `class` declarations** — deferred; requires lifetime annotations on enclosing values.
- **Local borrow bindings** (`const b: borrowed T = borrowed x`) — out of scope for MVP.
- **Borrowing from temporaries or arbitrary expressions** — never in MVP. Bind a value first.
- **Borrowing indexed elements or slice expressions directly** — out of scope for MVP.
- **Field-disjoint mutable borrows** — out of scope for MVP. Root-level exclusivity is the MVP rule.
- **Moving out through a borrow** — out of scope for MVP.
- **Borrow escape through fresh-derived views** — rejected in MVP by the local provenance rule in [§13.6](#136-fresh-derived-view-lifetimes).
- **Closure capture of borrows** — deferred to [§44](#44-function-types--lambdas).
- **Raw pointer arithmetic, nullable borrows, or null borrow values** — never. Borrows are safe, non-null access capabilities.
- **Implicit borrow creation from owned values at call sites** — out of scope for MVP. Owner call sites spell `borrowed x` or `mod borrowed x`.

**Views are not borrows.** The "no stored borrows" restrictions above (no borrowed returns, no borrow fields, no local borrow bindings) apply to the `borrowed T` / `mod borrowed T` *types* — call-scoped access capabilities the compiler lifetime-checks. They do **not** apply wholesale to **view value types** such as `Slice<T>` and `stringview`, which are ordinary values that happen to alias foreign storage. A pass-through view may be bound to a local, stored, and returned like any value, because in MVP its lifetime is not fully tracked. The compiler does, however, reject views freshly derived inside the current function from local owned storage, owned parameters, borrowed parameters, or their fields when those views would escape ([§13.6](#136-fresh-derived-view-lifetimes)). MVP reconciles views with memory safety through three rules: the `uses View of S` marker and call-level exclusivity ([§12.4](#124-exclusivity-and-root-locking)), the local fresh-derived-view escape check ([§12.9](#129-derived-views-and-escape), [§13.6](#136-fresh-derived-view-lifetimes)), and the explicit admission that full lifetime-tracked views are post-MVP.

**Conclusion.** Section 12 specifies the small, explicit MVP borrow surface. More precise place analysis, lifetime-bearing borrows, borrowed returns, and closure capture rules are post-MVP work.

---

### 12.12 Cross-Section Alignment

This section is aligned with the following rules elsewhere in the spec:

- **§3.3** — borrow operands begin from named bindings or field paths, consistent with the "single named binding" ownership discipline.
- **§8.8** — `borrowed T` and `mod borrowed T` are the borrow type forms; there is no `readonly` keyword.
- **§9.1** — the `uses View of S` marker declares a non-owning type that aliases storage of type `S`; §12.4's exclusivity rule keys off it.
- **§13.5 / §13.6** — view types are non-owning, may not be `Disposable`, and fresh-derived views cannot escape local visible storage.
- **§9.5** — method callability follows receiver capability: `borrowed T` can call non-`mod`; `mod borrowed T` can call both. The receiver is a member of the call's borrow set (§12.7).
- **§9.8** — field replacement is allowed through mutable receiver capability; moving fields out is not MVP. Whole-value replacement is a storage-invalidating event for `View of` purposes (§12.6).
- **§11** — `const` cannot produce `mod borrowed`; `let` can.
- **§14** — borrows do not own, copy, move, or extend lifetime.
- **§44** — closure capture of borrows is intentionally deferred.

---
