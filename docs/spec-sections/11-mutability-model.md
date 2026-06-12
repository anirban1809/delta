## 11. Mutability Model (`const` vs `let`)

Section 11 defines the binding-capability model for owned values: `const` is read-only and non-consuming through the binding's normal access paths; `let` is mutable and reassignable. This section also pins down how that capability composes with methods, fields, indexed element access, `heap T`, ownership transfer, replacement, disposal, file-scope constants, and deferred reference/interior-mutability questions. The recurring principle is **local capability, not global immutability**: `const` says what this binding may do, not that no other alias can ever observe or perform mutation.

---

### 11.1 Binding Capabilities

**Proposal.** Delta has two owned binding forms:

- **`const`** creates a read-only, non-consuming owned binding. The binding cannot be reassigned, mutated through, passed as `edit &`, or moved from by user code.
- **`let`** creates a mutable owned binding. The binding may be reassigned, mutated through, passed as `edit &`, and moved from, subject to the ordinary ownership rules.

`const` / `let` apply to **owned bindings**. Non-owning parameter access uses `&T` (read-only) and `edit &T` (mutable), specified in [§8.8](#88-references-on-type-values), [§12](#12-safe-references), and [§14](#14-ownership--move-semantics). Local reference bindings are out of scope for MVP and deferred to the lifetime design.

**Reason.** TypeScript's `const` only freezes the name, not the value reachable through the name. That is too weak for Delta: readers need to know that `const user` cannot be used to change `user.profile.name`, call a mutating method, or consume the value via `move`. At the same time, `const` should not claim more than the compiler can locally prove; if a separate mutable access path to the same backing storage exists, alias/lifetime rules decide whether that access is legal.

Keeping `let` as the single "mutable binding + mutable receiver" form avoids introducing separate binding flavors for "reassignable but internally read-only" or "not reassignable but internally mutable." Those distinctions can be modeled later with explicit library abstractions if they prove necessary.

**Examples.**
```ts
const frozen = Counter.create(0);
frozen.get();                         // OK - non-mutating method
frozen.increment();                   // ERROR - `edit` method on const receiver
mutate(edit &frozen);          // ERROR - cannot take mutable reference from const
consume(move frozen);                 // ERROR - cannot move from const

let counter = Counter.create(0);
counter.increment();                  // OK
mutate(edit &counter);         // OK
consume(move counter);                // OK - counter invalid afterward
```

**Conclusion.** `const` is read-only and non-consuming; `let` is mutable and reassignable. Reference capabilities are expressed with `&T` / `edit &T`, not with `const &T`.

---

### 11.2 Access Paths and Recursive Read-Only

**Proposal.** A normal access path rooted at a `const` binding is read-only. The rule applies through:

- direct field access,
- nested inline fields,
- `heap T` auto-deref,
- indexed element access on arrays and mutable containers,
- view values, for mutation attempted through that view.

The rule is a local capability rule: it forbids mutation **through the const-rooted access path**. It does not assert that the underlying storage has no mutable aliases elsewhere, unless the reference/lifetime rules separately establish that.

**Reason.** If `const` only prevented reassignment of the top-level name, Delta would inherit the TypeScript object-mutation footgun. Nested state and heap-stored state must be read-only through the binding for the guarantee to matter. Views are the subtle case: a const view cannot mutate its backing storage through the view, but the view's existence is not itself a global immutability proof.

**Examples.**
```ts
type Address = { city: stringview; };
type User = { id: uint64; address: Address; };

const user: User = {
  id: 1,
  address: { city: "Kolkata" },
};

user.id = 2;                         // ERROR
user.address.city = "Delhi";         // ERROR

let mutableUser: User = {
  id: 1,
  address: { city: "Kolkata" },
};
mutableUser.address.city = "Delhi";  // OK
```

```ts
const h: heap Counter = Counter.create(0);
h.value = 1;                         // ERROR - const freezes through heap auto-deref
h.increment();                       // ERROR - `edit` method on const heap receiver
h.get();                             // OK
```

```ts
const fixed: int32[3] = [1, 2, 3];
fixed[0] = 9;                        // ERROR

let fixed2: int32[3] = [1, 2, 3];
fixed2[0] = 9;                       // OK
```

```ts
let values: Array<int32> = [1, 2, 3];
const view: Slice<int32> = values.slice();

view[0] = 42;                        // ERROR - cannot mutate through const view
values[0] = 99;                      // governed by reference/lifetime rules, not by `view`
```

**Conclusion.** `const` recursively makes ordinary access paths read-only, including nested fields, heap auto-deref, and element access. The guarantee is local to that access path; alias exclusivity belongs to the reference/lifetime model.

---

### 11.3 Methods, Copying, Cloning, and Moving

**Proposal.** A `const` receiver may call non-`edit` methods. It may not call `edit` methods. A `const` binding may be copied from if its type is Copyable; it may not be moved from. The `clone` operator may be applied to a `const` binding because cloning reads the source and produces a new owned value without consuming the original ([§14.4](#144-the-clone-operator)).

Cloneability is a property of the type, not of `const`: a type is cloneable iff it is not `Disposable` and every field is copyable or cloneable ([§14.1](#141-the-copyability-classifier)). Resource-owning types such as `File` are `Disposable` and therefore not cloneable.

**Reason.** Banning all method calls on `const` would force users to declare values as `let` merely to read through methods or make an explicit owned copy. That weakens `let` as a signal. The real boundary is mutation or consumption: `edit` methods and `move` are forbidden; non-mutating reads and explicit clones are allowed where the type supports them.

**Examples.**
```ts
const p: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
const q = p;                         // OK if Vec3 is Copyable
const r = move p;                    // ERROR - cannot move from const
```

```ts
const s: string = "hello";

const copy = clone s as result;      // OK - clone reads `s`, does not consume it
check result { return 1; }

log(s);                              // OK - s is still valid
consume(move copy);                  // OK - copy is a separate owned value
```

```ts
const f = File.open("log.txt") as result;
check result { return 1; }

const f2 = clone f as result;        // ERROR - File is Disposable, not cloneable
consume(move f);                     // ERROR - cannot move from const
```

**Conclusion.** `const` permits reads, non-`edit` methods, Copyable copies, and explicit non-mutating clones. It forbids `edit` methods and `move`.

---

### 11.4 `let` Reassignment and Field Replacement

**Proposal.** `let` permits whole-binding reassignment and field/element replacement through mutable receiver capability. Replacement is still governed by ownership:

- Copyable right-hand sides may be assigned normally.
- Move-only right-hand sides require `move`.
- Replacing an initialized owned binding or field disposes the old value before installing the new one.
- If a `let` binding is uninitialized, whole-value assignment initializes it without disposing anything first.

Field assignment to a move-only field is replacement, not implicit copy or implicit move.

**Reason.** Mutability answers whether the receiver may be changed; ownership answers how the new value arrives and what happens to the old value. Collapsing those questions would either permit hidden moves or leak overwritten resources.

**Examples.**
```ts
let f = File.open("a.txt") as result;
check result { return 1; }

f = File.open("b.txt") as result;
check result { return 1; }
// old "a.txt" file is disposed before "b.txt" becomes current
```

```ts
class Session {
  public file: File;

  public static create(file: File): Session {
    return Session { file: move file };
  }
}

let s = Session.create(move file1);

s.file = file2;                     // ERROR - File is move-only
s.file = move file2;                // OK - old file disposed, new file installed
```

**Conclusion.** `let` grants permission to replace; Copyable / move-only rules still decide the assignment form. Owned replacement cleans up the old value automatically.

---

### 11.5 Whole-Value Initialization Only

**Proposal.** `const` always requires an initializer at the declaration site. `let` may be declared without an initializer only when it has an explicit type annotation, and it must be assigned a complete value before any read, mutation, reference, or move.

Partial initialization through fields, nested fields, or indexed elements is not allowed. An uninitialized binding has no usable access paths.

**Reason.** Per-field initialization creates a construction-phase exception to the mutability model: `const` would need special "initializing writes," and `let` values could exist in half-valid states. Whole-value initialization keeps the state machine simple: a binding is either uninitialized or holds a complete value.

**Examples.**
```ts
let p: Point;                       // OK - type is explicit, value absent
p = { x: 1, y: 2 };                 // OK - whole-value initialization

let q: Point;
q.x = 1;                            // ERROR - q is uninitialized; no field path exists
q.y = 2;                            // ERROR
```

```ts
let dst: File;
let src = File.open("a.txt") as result;
check result { return 1; }

dst = src;                          // ERROR - File is move-only
dst = move src;                     // OK - whole-value initialization by move
```

```ts
let x;                              // ERROR - annotation or initializer required

const missing: Point;               // ERROR - const requires initializer
```

**Conclusion.** Uninitialized `let` is allowed only as `let name: T;`, and only whole-value assignment can initialize it. Partial initialization is not part of Delta.

---

### 11.6 File-Scope `const`

**Proposal.** File-scope `const` has the same read-only access semantics as local `const`, but it is additionally constrained by the compile-time/static-constant rules in [§32](#32-compile-time-constants--const-generics). File-scope `const` is not a global runtime object facility.

**Reason.** Allowing arbitrary runtime-owned values at file scope would introduce initialization order, failure handling, disposal timing, and global state questions. Section 3 already forbids file-scope `let`; allowing file-scope `const` to allocate resources or containers at runtime would smuggle much of that complexity back in through immutable names.

**Examples.**
```ts
// file scope
const MAX_USERS: uintsize = 1024;        // OK
const VERSION: stringview = "0.1.0";     // OK - rodata view

const USERS = new Array<User>();         // ERROR - runtime allocation/global object
const LOG = File.open("log.txt") as result; // ERROR - runtime/fallible/global resource
```

```ts
function main(): int32 {
  const users = new Array<User>();       // OK locally, disposed at scope exit
  return 0;
}
```

**Conclusion.** Local `const` may bind runtime values. File-scope `const` is further restricted to compile-time/static constants and does not create owned global runtime state.

---

### 11.7 Automatic Disposal

**Proposal.** `const` does not prevent automatic disposal at the end of an owned value's lifetime. The compiler may dispose a `const` owned value when its scope exits. User code still cannot manually consume it via `move` or call cleanup hooks.

**Reason.** Immutability and destruction are different capabilities. `const` prevents user-visible mutation and consumption, but a resource-owning value must still be cleaned up when ownership ends. Otherwise `const file` and `const lock` would leak or never release.

**Examples.**
```ts
function writeLog(): int32 {
  const file = File.open("log.txt") as result;
  check result { return 1; }

  read(&file);                  // OK - read-only reference
  return 0;
} // file is disposed here
```

```ts
const lock = mutex.lock();
// lock is released automatically at scope exit, even though the binding is const
```

**Conclusion.** `const` restricts mutation and user-initiated consumption. It does not suppress compiler-driven disposal.

---

### 11.8 Explicit Non-Goals for Section 11

The following are deliberately out of scope or excluded:

- **Field-level `const`** inside `type` or `class` declarations — not in MVP. Field mutability follows receiver capability. Classes that need invariants should keep fields private and expose controlled `edit` methods.
- **Local reference bindings** — deferred to the lifetime design. MVP references are parameter/call-site capabilities.
- **Interior mutability and concurrency** — deferred. Future explicitly-marked types such as atomics, mutexes, cells, or caches may define their own non-`edit` mutation surfaces under their safety rules.
- **Partial initialization** — never in the core model. Use whole-value assignment.
- **Global runtime `const` objects** — not supplied by file-scope `const`; any future global-state facility must be specified separately.

**Conclusion.** Section 11 specifies ordinary binding capability only. Specialized aliasing, lifetime, concurrency, and global-state mechanisms are handled by their own sections.

---

### 11.9 Cross-Section Alignment

This section is aligned with the following rules elsewhere in the spec:

- **§3.3** — `let name: T;` is allowed, but only whole-value assignment initializes it.
- **§4.7 / §9.2** — class construction follows the same complete-value rule as other nominal values: no partial construction.
- **§4.10** — `let x;` remains a hard error; a binding's type is fixed at declaration.
- **§8.4** — object literal construction is complete; `let v: T; v.field = ...` is not a construction path.
- **§8.11 / §8.12** — default-style overrides use explicit reconstruction or helpers, not `let -> mutate -> move` as a construction pattern.

---
