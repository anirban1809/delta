## 12. Safe References

Section 12 defines Delta's MVP reference model: explicit, non-owning, non-null access to existing storage for the duration of a call. The recurring principles are **visible access capability** (`&x` and `edit &x` at owner call sites), **many readers or one writer** (read-only aliases may coexist; mutable access is exclusive), and **no hidden lifetimes** (reference operands must be named storage paths, not temporaries or expression results). Full lifetime syntax, stored references, referenced returns, closure capture, and disjoint-place analysis are deliberately deferred.

---

### 12.1 Reference Kinds and Scope

**Proposal.** Delta has two reference types:

- **`&T`** — a read-only reference.
- **`edit &T`** — a mutable reference.

Both are non-owning references to existing storage. In MVP, references are limited to **function parameters and call arguments**. They may not be returned, stored in fields, assigned to local reference bindings, placed in globals, or otherwise made to outlive the call/body in which they are used. Referencing is available for all first-class value types, including primitive types.

**Reason.** References provide zero-copy access without raw pointers, nullability, pointer arithmetic, or ownership transfer. Limiting MVP references to call scope preserves the memory-safety story without introducing lifetime parameters before the language has settled its ownership surface.

**Examples.**
```ts
function length(v: &Vec3): float32 {
  return sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function translate(pos: edit &Vec3, amount: Vec3): void {
  pos.x += amount.x;
  pos.y += amount.y;
  pos.z += amount.z;
}

length(&position);
translate(edit &position, delta);
```

Referencing primitives is legal:
```ts
function increment(n: edit &int32): void {
  n += 1;
}

let count: int32 = 41;
increment(edit &count);        // count is now 42
```

Escaping references are not part of MVP:
```ts
function bad(v: &Vec3): &Vec3 {
  return v;                            // ERROR - reference returns require lifetime rules
}

type Holder = {
  value: &Vec3;                // ERROR - references in fields require lifetime rules
};
```

**Conclusion.** `&T` and `edit &T` are MVP parameter/call-scope capabilities. They apply uniformly to all value types. Reference escape is post-MVP. Because references are confined to call scope and cannot be stored, the entire exclusivity check reduces in MVP to inspecting a single call's reference set (its arguments and receiver) — the precise scope and its limits are given in [§12.4](#124-exclusivity-and-root-locking).

---

### 12.2 Explicit Reference Creation and Forwarding

**Proposal.** Creating a reference from an owned value at a call site is explicit:

```ts
read(&value);
mutate(edit &value);
```

An existing reference-typed parameter may be forwarded without repeating `&`; its type already carries the reference capability. An `edit &T` may be passed to a `&T` parameter by implicit capability weakening. The reverse is not allowed.

**Reason.** Explicit reference creation keeps ownership and access capability visible at the boundary where an owned value is loaned out. Forwarding an already-referenced parameter is not a new reference from owned storage; requiring another `&` marker there would be noise. Weakening mutable access to read-only access is safe and avoids duplicate read-only overloads.

**Examples.**
```ts
function read(v: &Vec3): void { /* ... */ }
function mutate(v: edit &Vec3): void { /* ... */ }

let value: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };

read(value);                            // ERROR - owner call site must say `&`
read(&value);                   // OK
mutate(edit &value);             // OK
```

Forwarding:
```ts
function wrapper(v: &Vec3): void {
  read(v);                              // OK - already &
  mutate(v);                            // ERROR - cannot upgrade read-only to mutable
}

function wrapper2(v: edit &Vec3): void {
  read(v);                              // OK - implicit weakening to &
  mutate(v);                            // OK
}
```

**Conclusion.** Reference creation from owned values is explicit. Existing reference parameters forward by type; `edit &T` weakens to `&T` when passed onward.

---

### 12.3 Binding Capability

**Proposal.** A `const` binding may produce only `&T`. A `let` binding may produce either `&T` or `edit &T`, subject to the exclusivity rules in [§12.4](#124-exclusivity-and-root-locking). Referencing does not permanently change the binding's capability after the call returns.

Field-path reference capability is determined by the root access path. MVP has no field-level mutability modifiers.

**Reason.** `const` is read-only and non-consuming through its normal access paths ([§11](#11-mutability-model-const-vs-let)), so it cannot produce mutable access. `let` is the single owned binding form that permits mutation, reassignment, mutable referencing, and moving.

**Examples.**
```ts
const frozen: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let live: Vec3 = { x: 4.0, y: 5.0, z: 6.0 };

read(&frozen);                  // OK
mutate(edit &frozen);            // ERROR - const cannot produce mutable reference

read(&live);                    // OK
mutate(edit &live);              // OK

live.x = 10.0;                          // OK after the reference call has returned
```

For fields:
```ts
let user: User = makeUser();
const archived: User = makeUser();

updateProfile(edit &user.profile);      // OK - root is mutable
updateProfile(edit &archived.profile);  // ERROR - root is const
readProfile(&archived.profile);        // OK
```

**Conclusion.** Read-only references may come from `const` or `let`; mutable references require a mutable root. Referencing is temporal and does not downgrade a `let` after the call.

---

### 12.4 Exclusivity and Root Locking

**Proposal.** Delta uses the standard rule: many read-only references may coexist, or one mutable reference may exist, but not both. For MVP, exclusivity is checked at the **root binding** level. Any `edit &` derived from a root locks that entire root for the duration of the call. Field-disjoint mutable references are not recognized in MVP.

The same rule forbids combining a move from a root with any reference derived from that root in the same call.

A non-owning view binds to its own root, so syntactic root-checking cannot relate it to the storage it aliases. To keep root-checking sound without instance-level provenance, a view type declares the storage type it aliases with `uses View of S` ([§9.1](#91-core-model)), and the rule extends by **viewed type**: a `View of S` value may not be passed as a reference in any call that also takes an `edit &S`. This is conservative — it triggers on type match and cannot tell two distinct `S` values apart — but it is sound and needs no provenance analysis. Soundness depends on the marker being present; an aliasing type that omits `uses View of S` is trusted to own its storage, exactly as a type that omits `Copyable` is trusted to be move-only.

**Reason.** Mutable access can replace fields (including whole-value replacement, which disposes the old value — [§12.6](#126-mutation-replacement-and-moving)), trigger disposal of owned storage, reallocate internal buffers, or otherwise invalidate derived views. Root-level checking is conservative, but it is simple and sound before the lifetime and place-analysis design exists.

For example, owner-plus-view aliasing can become a real use-after-free:
```ts
function clearThenRead(xs: edit &Array<uint8>, view: &Slice<uint8>): uint8 {
  xs.clearAndFreeCapacity();             // may free the backing buffer
  return view[0];                        // would read freed storage if view came from xs
}

let xs: Array<uint8> = [10, 20, 30];
const view: Slice<uint8> = xs.slice();      // Slice<uint8> is `uses View of Array<uint8>`
clearThenRead(edit &xs, &view);
// ERROR - `view` is a `View of Array<uint8>` and this call also takes
//         `edit &Array<uint8>`; MVP cannot prove they are disjoint
```

**Examples.**
```ts
readBoth(&x, &x);        // OK
mix(edit &x, &x);         // ERROR
swap(edit &x, edit &x);    // ERROR - same root
```

Root-checking rejects the *syntactic* same-root call above. It does not see aliasing through distinct bindings (two `heap` handles reaching the same node, or graph edges), which is why a function like `swap` may still need a runtime `same(a, b)` guard ([§8.10](#810-identity-via-same)) for the aliasing the compiler cannot prove away.

Whole-root MVP conservatism:
```ts
type Pair = {
  left: Buffer;
  right: Buffer;
};

function fillTwo(a: edit &Buffer, b: edit &Buffer): void { /* ... */ }

let pair: Pair = makePair();
fillTwo(edit &pair.left, edit &pair.right);
// ERROR - both mutable references derive from root `pair`
```

Move-plus-reference is also rejected:
```ts
consumeAndLog(move s, &s);       // ERROR - cannot reference `s` while moving `s`
archive(move file, &file.meta);  // ERROR - same root
```

**Scope of the check.** MVP exclusivity is checked over the references bound to a *single callee's own parameters* (plus its receiver, [§12.7](#127-member-access-methods-and-re-referencing)), by syntactic root and viewed type. References created by a *nested* call inside the argument list are not part of the outer call's set: under eager evaluation the inner call completes — and its references end — before the outer call is invoked:
```ts
mix(edit &x, &x);       // ERROR - both are mix's own parameters, coexist
f(edit &x, g(&x));      // OK - g's reference of `x` ends before f is invoked
```

Because references cannot be stored and calls are synchronous, two references of one root never coexist across statements either — the owner's next statement always runs after the call returns:
```ts
mutate(edit &live);             // reference exists only for this call
live.x = 10.0;                         // OK - the reference above is already gone
```

The check does **not** see aliasing reached through the object graph, a global, or a field. A function holding `edit &` of one root can still reach the same storage by another path, and MVP will not diagnose it:
```ts
let g: Array<uint8> = [1, 2, 3];       // module-reachable storage

function append(xs: edit &Array<uint8>): void {
  xs.push(readFromGlobal(g));          // if `xs` and `g` are the same storage,
}                                      // MVP cannot prove or forbid the overlap
```
Detecting such cross-binding aliasing is the post-MVP lifetime/place-analysis work; MVP relies on the runtime `same(...)` guard ([§8.10](#810-identity-via-same)) where it matters.

**Conclusion.** MVP reference checking is root-based and per-call: within one call, multiple `&` aliases are allowed; one `edit &` excludes every other reference or move from the same root (and any `View of` that root's type) for that call. The "many readers or one writer" rule is enforced at call argument lists, not as a whole-program aliasing invariant — it does not track aliasing across statements, globals, fields, or the object graph. Closing that gap is part of the post-MVP lifetime and place-analysis design.

---

### 12.5 Reference Operands and Addressability

**Proposal.** Reference operands must be explicit addressable paths rooted in bindings. In MVP, the allowed forms are:

- `binding`
- `binding.field`
- `binding.field.subfield`
- the same field paths through `heap T` auto-deref when the root is a binding

Referencing a binding of type `heap T` **auto-derefs to the pointee** on reference creation, exactly as read access does ([§8.8](#88-references-on-type-values)): `&h` and `edit &h` for `h: heap T` produce `&T` and `edit &T`, a reference of the pointed-to value, not of the heap box. There is no MVP form that references the box (the pointer-bearing storage) itself; storage identity of the box is observed only through `same(...)` ([§8.10](#810-identity-via-same)), which takes the `heap T` value directly.

Reference operands may not be temporaries, function calls, operators, ternaries, literals, method-returned values, indexed elements, or slice expressions.

The operand's root binding must additionally be **live** at the reference site: definitely initialized and not moved-from on every path that reaches the reference, under the same definite-assignment tracking that governs disposal and moves ([§9.7](#97-disposal-and-disposable), [§11.5](#115-whole-value-initialization-only)). Referencing an uninitialized or moved-from binding is an error — there is no live storage for the reference to reference.

**Reason.** Delta avoids hidden temporary lifetime extension. If a value backs a reference, the source should show the owner whose lifetime makes the reference valid. Indexing and slicing are excluded in MVP because they resolve to produced values or views and require additional place/range analysis to reference directly.

**Examples.**
```ts
read(&value);                  // OK
read(&pair.left);              // OK
read(&tree.left.value);        // OK - heap auto-deref along field path
read(&heapVec);                // OK - h: heap Vec3 auto-derefs to &Vec3

read(&makeVec3());             // ERROR - temporary
read(& (cond ? a : b));         // ERROR - expression result
read(& (a + b));                // ERROR - expression result
read(&getUser().profile);      // ERROR - call result is temporary
read(&xs[i]);                  // ERROR in MVP
read(&xs.slice(0, 10));        // ERROR - bind the view first
```

The root must be live:
```ts
let s = makeThing();
consume(move s);
read(&s);                      // ERROR - `s` is moved-from

let v: Vec3;                           // uninitialized (§11.5)
read(&v);                      // ERROR - no live storage to reference
```

Bind produced values explicitly:
```ts
const user = getUser() as result;
check result { return 1; }
readProfile(&user.profile);

const view = xs.slice(0, 10);
process(view);                         // OK if parameter expects stringview/Slice value
```

**Conclusion.** Reference operands are named storage paths, not arbitrary expressions. MVP allows binding and field paths only.

---

### 12.6 Mutation, Replacement, and Moving

**Proposal.** An `edit &T` permits mutation through the reference and whole-value assignment to the referenced referent. Assigning to an `edit &T` parameter replaces the caller's value; it does not re-point the local reference. Replacement follows the same ownership rules as `let` reassignment and field replacement: Copyable right-hand sides copy, move-only right-hand sides require `move`, and the old value is disposed before the new value is installed.

Moving out of a referenced referent's fields, indexed elements, or subobjects is not allowed in MVP. A referenced referent must remain complete unless replaced as a whole.

Because whole-value replacement disposes the old value before installing the new one ([§9.8](#98-field-mutation-and-replacement)), it is a storage-invalidating event in the same way an explicit free is — it can invalidate any `View of` the referent's type. This is why the exclusivity rule in [§12.4](#124-exclusivity-and-root-locking) keys off *any* `edit &S` in a call, not only calls to methods that explicitly release storage.

**Reason.** Mutable reference means mutable access to the referent, including replacement. But moving out of subobjects would leave the caller's value partially uninitialized and require partial-move tracking through references, which is out of MVP scope.

**Examples.**
```ts
function reset(v: edit &Vec3): void {
  v = { x: 0.0, y: 0.0, z: 0.0 };       // replaces caller's Vec3
}

let pos: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
reset(edit &pos);
```

Owned replacement:
```ts
function replace(box: edit &FileBox, next: FileBox): void {
  box = move next;                       // disposes old caller value, installs next
}
```

Field replacement is allowed; field move-out is not:
```ts
function replaceFile(box: edit &FileBox, next: File): void {
  box.file = move next;                  // OK - replacement
}

function takeFile(box: edit &FileBox): File {
  return move box.file;                  // ERROR - cannot move out through a reference
}
```

Read-only references cannot assign:
```ts
function bad(v: &Vec3): void {
  v = { x: 0.0, y: 0.0, z: 0.0 };        // ERROR - read-only reference
}
```

**Conclusion.** `edit &` supports mutation and whole-referent replacement. It does not support moving out through the reference.

---

### 12.7 Member Access, Methods, and Re-referencing

**Proposal.** Referenced values use normal field access and method-call syntax. Receiver capability follows the reference type:

| Receiver | Can read fields? | Can write fields? | Can call non-`edit` methods? | Can call `edit` methods? |
|---|---:|---:|---:|---:|
| `&T` | Yes | No | Yes | No |
| `edit &T` | Yes | Yes | Yes | Yes |

Code may create derived references from referenced parameters for subcalls, subject to the same root-exclusivity rule.

The **receiver of a method call is itself a member of that call's reference set**, with the capability its `edit`-ness implies: a non-`edit` method references its receiver as `&`, an `edit` method as `edit &`. It is checked against the argument references under the same root rule as everything else ([§12.4](#124-exclusivity-and-root-locking)). The common read idiom survives because many `&` aliases coexist; only mutable aliasing of the receiver's own storage is rejected:
```ts
obj.inspect(&obj.field);       // OK   - non-edit receiver (reader) + reader arg
obj.mutate(edit &obj.field);    // ERROR - edit receiver (writer) + writer arg, root `obj`
obj.read(edit &obj.field);      // ERROR - reader receiver + writer arg, root `obj`
```
As with §12.4's field-disjoint conservatism, this rejects some safe-in-fact calls (receiver and argument touching disjoint fields); the workaround is to have the method operate on its own field directly rather than receive it as a reference.

**Reason.** References should feel like safe references to the underlying value, not like a separate object that needs manual dereference. Re-referencing is necessary for helper functions on fields, while the root rule prevents simultaneous mutable derived references from becoming an aliasing hole.

**Examples.**
```ts
class Counter {
  private value: int32;

  public get(): int32 { return this.value; }
  public edit increment(): void { this.value += 1; }
}

function inspect(c: &Counter): int32 {
  return c.get();                       // OK
}

function bad(c: &Counter): void {
  c.increment();                        // ERROR - edit method on read-only reference
}

function bump(c: edit &Counter): void {
  c.get();                              // OK
  c.increment();                        // OK
}
```

Derived references:
```ts
type Line = {
  start: Vec3;
  end: Vec3;
};

function length(v: &Vec3): float32 { /* ... */ }
function normalize(v: edit &Vec3): void { /* ... */ }
function normalizePair(a: edit &Vec3, b: edit &Vec3): void { /* ... */ }

function lineLength(line: &Line): float32 {
  return length(line.start);            // OK - field is already reached through a reference
}

function normalizeLine(line: edit &Line): void {
  normalize(line.start);                // OK
  normalize(line.end);                  // OK - sequential
}

function normalizeLineBad(line: edit &Line): void {
  normalizePair(line.start, line.end);  // ERROR in MVP - two edit references from root `line`
}
```

**Conclusion.** Referenced values support ordinary member access with capability checks. Derived sub-references are allowed for subcalls, but simultaneous mutable derived references from one root are rejected in MVP.

---

### 12.8 Referenced Values Are Not Owned Values

**Proposal.** A `&T` or `edit &T` value cannot *implicitly* satisfy a by-value `T` parameter, cannot be moved from, and cannot be implicitly copied into an owned `T`. It may be passed onward to compatible reference-typed parameters. An **explicit** `clone x` on a referenced value is allowed where `T` is cloneable ([§11.3](#113-methods-copying-cloning-and-moving), [§14.4](#144-the-clone-operator)): cloning reads the referent and produces independent owned storage, so it is the sanctioned way to obtain an owned value from a reference.

**Reason.** A reference is an access capability, not ownership. Letting referenced values silently satisfy by-value parameters would hide copies for Copyable types and impossible ownership transfers for move-only types. The ban is on *implicit* conversion to owned; an explicit `clone x` is visible at the call site and allocates its own storage, so it carries none of that hidden cost.

**Examples.**
```ts
function read(v: &Vec3): void { /* ... */ }
function mutate(v: edit &Vec3): void { /* ... */ }
function take(v: Vec3): void { /* by-value copy */ }

function wrapper(v: &Vec3): void {
  read(v);                              // OK
  mutate(v);                            // ERROR
  take(v);                              // ERROR - reference is not a by-value Vec3
}

function wrapper2(v: edit &Vec3): void {
  read(v);                              // OK - weakening
  mutate(v);                            // OK
  take(v);                              // ERROR
}
```

Explicit `clone` is the way out to an owned value:
```ts
function snapshot(doc: &Document): Document | AllocError {
  const owned = clone doc as result;    // OK - explicit, allocates, produces owned Document
  check result { return error as AllocError { code: "alloc.clone", message: result.error.message }; }
  return owned;                         // OK - returning an owned value, not the reference
}
```

Move-only example:
```ts
function consume(file: File): void { /* owns file */ }

function bad(file: &File): void {
  consume(file);                        // ERROR - referenced value is not owned
  consume(move file);                   // ERROR - cannot move from a reference
}
```

**Conclusion.** Referenced values forward only as references. They do not copy, move, or satisfy by-value ownership.

---

### 12.9 Derived Views and Escape

**Proposal.** A method or coercion may produce a view derived from visible storage. For MVP, the full fresh-derived-view escape rule lives in [§13.6](#136-fresh-derived-view-lifetimes): a view freshly derived from an owned local, an owned by-value parameter, a referenced parameter, or a field path rooted in any of those may be used locally, but it may not escape the function body by return, field storage, global storage, or capture by an escaping closure. Lambda capture rules are deferred to [§44](#44-function-types--lambdas).

This section's reference-specific rule is the most common case: a method called on a referenced parameter may produce a view derived from that referenced storage for local use, but that view cannot escape.

**Reason.** A derived view may point into storage owned by a source whose lifetime ends before the returned/stored view would be used. Returning or storing it would smuggle a reference-like value out of the compiler-visible lifetime. Local use keeps common read APIs ergonomic without requiring lifetime syntax.

**Examples.**
```ts
class Document {
  private text: string;

  public viewText(): stringview {
    return this.text;
  }
}

function print(doc: &Document): void {
  const text: stringview = doc.viewText();    // OK - local derived view
  console.writeLine(text);
}

function leak(doc: &Document): stringview {
  return doc.viewText();                      // ERROR - derived view escapes
}

function save(doc: &Document, cache: edit &Cache): void {
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

**Proposal.** Reference diagnostics should name:

- the root binding,
- the requested capability (`&`, `edit &`, or `move`),
- the conflicting action,
- and any MVP limitation involved.

**Reason.** MVP reference checking is intentionally conservative, especially around whole-root locking. Diagnostics must explain the root-level conflict so users do not mistake conservative rejection for arbitrary behavior.

**Examples.**
```ts
mix(edit &x, &x);
```

Diagnostic shape:
```txt
error: cannot reference `x` as read-only because it is already mutably &for this call
```

Whole-root limitation:
```ts
fillTwo(edit &pair.left, edit &pair.right);
```

Diagnostic shape:
```txt
error: cannot create multiple mutable references from root `pair` in one call
note: MVP reference checking is root-based; field-disjoint references are not yet supported
```

Move conflict:
```ts
consumeAndLog(move s, &s);
```

Diagnostic shape:
```txt
error: cannot reference `s` in the same call where it is moved
```

Temporary:
```ts
inspect(&makeVec3());
```

Diagnostic shape:
```txt
error: cannot reference from a temporary expression
hint: bind the value first: `const value = makeVec3();`
```

**Conclusion.** Reference errors should report the root and the capability conflict, and should explicitly call out MVP root-based limitations.

---

### 12.11 Explicit Non-Goals for Section 12

The following are deliberately out of scope for MVP or permanently excluded:

- **Referenced return values** — deferred to the lifetime design.
- **Reference fields in `type` or `class` declarations** — deferred; requires lifetime annotations on enclosing values.
- **Local reference bindings** (`const b: &T = &x`) — out of scope for MVP.
- **Referencing from temporaries or arbitrary expressions** — never in MVP. Bind a value first.
- **Referencing indexed elements or slice expressions directly** — out of scope for MVP.
- **Field-disjoint mutable references** — out of scope for MVP. Root-level exclusivity is the MVP rule.
- **Moving out through a reference** — out of scope for MVP.
- **Reference escape through fresh-derived views** — rejected in MVP by the local provenance rule in [§13.6](#136-fresh-derived-view-lifetimes).
- **Closure capture of references** — deferred to [§44](#44-function-types--lambdas).
- **Raw pointer arithmetic, nullable references, or null reference values** — never. References are safe, non-null access capabilities.
- **Implicit reference creation from owned values at call sites** — out of scope for MVP. Owner call sites spell `&x` or `edit &x`.

**Views are not references.** The "no stored references" restrictions above (no referenced returns, no reference fields, no local reference bindings) apply to the `&T` / `edit &T` *types* — call-scoped access capabilities the compiler lifetime-checks. They do **not** apply wholesale to **view value types** such as `Slice<T>` and `stringview`, which are ordinary values that happen to alias foreign storage. A pass-through view may be bound to a local, stored, and returned like any value, because in MVP its lifetime is not fully tracked. The compiler does, however, reject views freshly derived inside the current function from local owned storage, owned parameters, referenced parameters, or their fields when those views would escape ([§13.6](#136-fresh-derived-view-lifetimes)). MVP reconciles views with memory safety through three rules: the `uses View of S` marker and call-level exclusivity ([§12.4](#124-exclusivity-and-root-locking)), the local fresh-derived-view escape check ([§12.9](#129-derived-views-and-escape), [§13.6](#136-fresh-derived-view-lifetimes)), and the explicit admission that full lifetime-tracked views are post-MVP.

**Conclusion.** Section 12 specifies the small, explicit MVP reference surface. More precise place analysis, lifetime-bearing references, referenced returns, and closure capture rules are post-MVP work.

---

### 12.12 Cross-Section Alignment

This section is aligned with the following rules elsewhere in the spec:

- **§3.3** — reference operands begin from named bindings or field paths, consistent with the "single named binding" ownership discipline.
- **§8.8** — `&T` and `edit &T` are the reference type forms; there is no `readonly` keyword.
- **§9.1** — the `uses View of S` marker declares a non-owning type that aliases storage of type `S`; §12.4's exclusivity rule keys off it.
- **§13.5 / §13.6** — view types are non-owning, may not be `Disposable`, and fresh-derived views cannot escape local visible storage.
- **§9.5** — method callability follows receiver capability: `&T` can call non-`edit`; `edit &T` can call both. The receiver is a member of the call's reference set (§12.7).
- **§9.8** — field replacement is allowed through mutable receiver capability; moving fields out is not MVP. Whole-value replacement is a storage-invalidating event for `View of` purposes (§12.6).
- **§11** — `const` cannot produce `edit &`; `let` can.
- **§14** — references do not own, copy, move, or extend lifetime.
- **§44** — closure capture of references is intentionally deferred.

---
