## 13. Memory Safety Model

Section 13 defines the memory-safety promise Delta makes at the language boundary. It is a hub section: ownership, references, bounds checks, initialization, disposal, allocation, and the C backend each have their own detailed sections, but this section states which guarantees are part of the MVP and where the deliberate MVP boundaries are. The recurring principles are **no raw memory access in Delta source**, **safe APIs only expose valid values**, **local failures are recoverable when requested**, and **MVP is honest about view lifetimes it does not yet fully track**.

---

### 13.1 The Safety Promise and MVP Boundary

**Proposal.** Delta source code cannot express raw pointers, pointer arithmetic, unchecked casts, manual `malloc` / `free`, or direct access to generated C storage. User code, standard-library Delta code, and internal Delta modules all use the same safe language surface. Memory is mediated through safe value types and library abstractions: inline values, `heap T`, fixed arrays, collections, slices, string-family types, files, sockets, arenas, mutexes, atomics, and other APIs whose invariants are checked before values become visible to Delta code.

For MVP, the safety promise is deliberately precise:

- no use-after-move,
- no double dispose through safe ownership,
- no buffer overrun through safe indexing or slicing,
- no read of uninitialized storage,
- no null pointer or nullable-reference access,
- no raw pointer arithmetic in Delta source,
- no escaping call-scoped references,
- no escaping fresh-derived views from storage whose lifetime ends at the function boundary.

MVP does **not** claim full lifetime tracking for every stored view value. A pass-through view value such as `stringview` or `Slice<T>` may be returned or stored like any other value unless the compiler can see that it was freshly derived from local or referenced storage in the current function. Full lifetime-bearing views are post-MVP.

**Reason.** "Memory safe" must be specific enough to implement and test. Overclaiming "no use-after-free anywhere" while MVP still permits pass-through view values would make the spec dishonest. The credible MVP promise is stronger than C - raw memory bugs are not expressible through ordinary Delta operations - but it still names the limited view-lifetime hole that remains until the lifetime design exists.

**Examples.**
```ts
let s = string.from("hello") as result;
check result { return 1; }

consume(move s);
console.writeLine(s);                 // ERROR - use after move
```

```ts
function passThrough(v: stringview): stringview {
  return v;                            // OK - pass-through view
}

function bad(): stringview {
  const s = string.from("hello") as result;
  check result { return "fallback"; }
  return s;                            // ERROR - fresh view of local owned storage escapes
}
```

**Conclusion.** MVP memory safety is strong at the Delta language boundary, but not a full lifetime system. The spec states the exact guarantee and the exact view-lifetime boundary.

---

### 13.2 No Raw Pointers in Delta Source

**Proposal.** No Delta source file may declare, name, construct, store, or manipulate raw pointers. This ban applies uniformly to application code, standard-library Delta source, package libraries, and any internal Delta modules. There is no `Ptr<T>`, `pointer<T>`, address-of operator, pointer arithmetic operator, unchecked dereference, `malloc`, `free`, or unchecked bit reinterpretation to a pointer-shaped value.

Pointers may exist only below the Delta language boundary:

- in compiler-generated C,
- in handwritten runtime C shipped with the compiler,
- in C libraries reached through the future FFI design.

Those pointers are implementation details. Delta code cannot name them, depend on their representation, or import an unsafe Delta wrapper around them in MVP.

**Reason.** A "trusted Delta subset" would become a second language whose safety rules every reader must audit. For MVP, the clean boundary is simpler: Delta source is safe source. The C backend and runtime necessarily use C pointers internally, but that fact never becomes a Delta-language capability.

**Examples.**
```ts
type RawSlice = {
  ptr: pointer<uint8>;                 // ERROR - no raw pointer type in Delta
  len: uintsize;
};

function uncheckedAdd(p: pointer<uint8>, n: uintsize): pointer<uint8>; // ERROR
```

```ts
malloc(1024);                          // ERROR - not a Delta operation
free(buffer);                          // ERROR - disposal is ownership-driven
```

Generated C may still contain implementation details like this:
```c
typedef struct {
  uint8_t *data;
  size_t length;
  size_t capacity;
} DeltaArray_uint8;
```

**Conclusion.** Raw pointers are outside Delta source entirely. They are permitted only below the language boundary in generated/runtime C and future C interop machinery.

---

### 13.3 Enforcement Layers

**Proposal.** Delta's memory-safety model is enforced by several independent compiler checks and runtime checks:

- definite assignment prevents reads, moves, references, and mutation of absent values ([§3.3](#3-basic-syntax--variable-bindings), [§11.5](#115-whole-value-initialization-only)),
- ownership and move checking prevent use-after-move and double disposal ([§14](#14-ownership--move-semantics)),
- automatic disposal ensures owned values are cleaned exactly once on every exit path ([§9.7](#97-disposal-and-disposable), [§33](#33-automatic-disposal)),
- reference checking prevents escaping references and call-local mutable aliasing ([§12](#12-safe-references)),
- view-escape checks prevent fresh-derived views from outliving visible sources ([§13.6](#136-fresh-derived-view-lifetimes)),
- bounds and numeric checks prevent out-of-range memory access and invalid scalar construction ([§5](#5-primitive-numeric-types), [§38](#38-bounds-checking)),
- construction rules ensure nominal values are complete before use ([§8.4](#84-construction), [§9.2](#92-controlled-construction)).

**Reason.** No single mechanism carries the safety promise. Bounds checks alone do not prevent double-free; ownership alone does not validate UTF-8; reference checking alone does not prove an index is in range. The model is intentionally layered so each check has a small job and a clear diagnostic.

**Examples.**
```ts
let user: User;
console.writeLine(user.name);          // ERROR - not definitely assigned
```

```ts
let file = File.open(path) as result;
check result { return 1; }

consume(move file);
file.close();                          // ERROR - moved-from binding
```

```ts
const item = values[index] as result;   // recoverable bounds check
check result { return error as BoundsError { code: "bounds.index", message: "bad index", index }; }
```

**Conclusion.** Section 13 is the umbrella. The enforceable rules live in the dedicated sections and combine to produce the memory-safety guarantee.

---

### 13.4 Complete Values Only

**Proposal.** User-visible values are either absent or complete. There is no partially initialized object state in safe Delta code. `let name: T;` creates an absent binding whose type is known, not a partially constructed `T`. It becomes usable only after a whole-value assignment on every reaching path. A `const` binding must be initialized at the declaration site. Field-by-field construction of `type` or `class` values is not a construction path.

**Reason.** Partial initialization is a common source of invalid reads and double cleanup. If a value can be half-built, the compiler must track which fields exist, which fields need disposal, and which methods are safe to call. Delta avoids that category by requiring complete construction.

**Examples.**
```ts
let point: Vec3;
point.x = 1.0;                         // ERROR - no partial initialization
point = { x: 1.0, y: 2.0, z: 3.0 };     // OK - whole-value assignment
```

```ts
const user: User;                       // ERROR - const requires initializer
```

```ts
class File {
  private fd: FileDescriptor;
  private path: string;

  public static open(path: stringview): File | IOError {
    const fd = os.open(path) as result;
    check result { return error as IOError { code: "io.open", message: result.error.message, path }; }

    const ownedPath = string.from(path) as result;
    check result { return error as IOError { code: "io.path", message: result.error.message, path }; }

    return File { fd, path: move ownedPath }; // complete class literal inside class body
  }
}
```

**Conclusion.** No partially initialized values are visible to user code. Definite assignment plus complete construction close the uninitialized-read branch of memory safety.

---

### 13.5 Ownership, Disposal, and Double-Free Prevention

**Proposal.** Owned resource values are move-only unless their type is explicitly copyable. Plain assignment and by-value argument passing copy only Copyable values. Move-only values transfer ownership only with `move`; the source binding becomes invalid afterward. The compiler automatically disposes every live owned value exactly once when its lifetime ends. Moved-from bindings are not disposed; their new owner is.

View values are non-owning. A type marked `uses View of S` owns no part of the `S` storage it aliases, is copyable by construction, and may not use `Disposable`. If the view type has unrelated bookkeeping that needs cleanup, it is not a pure `View of S` in MVP and must be modeled as an owning type with a separate safe API.

**Reason.** Double-free prevention depends on exactly one owner for each owned resource. Views must not participate in disposal of their backing storage, because the owner is elsewhere. Allowing `View of S` plus `Disposable` would make it too easy to hide ownership in a type that the compiler treats as non-owning.

**Examples.**
```ts
let a = string.from("hello") as result;
check result { return 1; }

let b = move a;
console.writeLine(a);                  // ERROR - moved-from binding
```

```ts
class BufferView uses View of Buffer {
  // OK - non-owning view; copyable by construction
}

class BadView uses View of Buffer, Disposable {
  dispose(): void { /* ... */ }         // ERROR - views are non-owning
}
```

**Conclusion.** Ownership and disposal are single-owner. Views are always non-owning and cannot be cleanup hooks for the storage they observe.

---

### 13.6 Fresh-Derived View Lifetimes

**Proposal.** MVP tracks a small, local provenance bit for view values. A view value is **fresh-derived** when, inside the current function, it is produced from storage whose lifetime or aliasing the compiler can see:

- from an owned local,
- from an owned by-value parameter,
- from a `&` or `edit &` parameter,
- from a field path rooted in any of the above,
- from an implicit owned-to-view coercion,
- from a method call whose result type is a built-in view type or a `uses View of S` type and whose receiver/source is one of the above.

Fresh-derived view taint propagates through simple local bindings and assignments. A fresh-derived view may be used locally, but it may not escape the function by return, field storage, global storage, or capture by an escaping closure. A view that arrives as a view-typed parameter or field and is merely passed through is not fresh-derived by this rule; MVP permits returning or storing it, and the caller remains responsible for ensuring the backing storage remains valid.

String literals are static storage and are safe view sources for return and storage.

**Reason.** This is the smallest useful lifetime rule. It catches the obvious UAF cases without requiring lifetime parameters, region inference, or whole-program alias tracking. The line between fresh-derived and pass-through is easy to teach: "If this function created the view from storage it can see, the view cannot leave."

**Examples.**
```ts
function bad(): stringview {
  const s = string.from("hello") as result;
  check result { return "fallback"; }
  const v: stringview = s;              // fresh-derived from local owned string
  return v;                             // ERROR
}
```

```ts
function bad2(doc: &Document): stringview {
  const text = doc.viewText();          // fresh-derived from reference parameter
  return text;                          // ERROR
}
```

```ts
type Cache = { text: stringview; };

function bad3(doc: &Document): Cache {
  const text = doc.viewText();
  return { text };                      // ERROR - stores fresh-derived view
}
```

```ts
function ok(v: stringview): stringview {
  const w = v;
  return w;                             // OK - pass-through view parameter
}

function staticText(): stringview {
  return "hello";                       // OK - string literal storage is static
}
```

For `View of S` classes:
```ts
class BufferView uses View of Buffer { /* ... */ }

function bad4(buffer: Buffer): BufferView {
  return buffer.view();                 // ERROR - fresh-derived view of owned parameter
}

function ok2(view: BufferView): BufferView {
  return view;                          // OK - pass-through view value
}
```

**Conclusion.** MVP has a local fresh-derived-view escape check. It is not full lifetime tracking, but it closes the visible local/referenced-storage escape hole.

---

### 13.7 Recoverable Checks, Panics, and Non-Trapping Arithmetic

**Proposal.** Runtime safety checks fall into four categories:

| Category | Examples | Behavior |
|---|---|---|
| Compile-time error | raw pointer type, temporary reference, use after move, uninitialized read, fresh-derived view escape | rejected before codegen |
| Recoverable with `as result` | integer overflow, divide by zero, shift out of range, numeric/`char` cast failure, array/slice/string bounds, invalid `ByteOffset` slicing | produces `T | ErrorType` and must be checked |
| Default panic | same local check used without `as result` and failing at runtime | non-catchable panic |
| Non-trapping explicit arithmetic | `Wrap<T>`, `Saturate<T>` | wraps or saturates, no panic |

The exact error types for recoverable bounds and slicing failures are specified by the bounds/string/collection API sections, but the language-level rule is that local deterministic safety checks may be requested as recoverable with `as result`.

Catastrophic runtime out-of-memory outside an allocation-facing API, explicit `panic`, reaching `unreachable`, and compiler/runtime invariant corruption are not recoverable with `as result`.

**Reason.** "Memory safe" does not mean "programs never fail." It means failed checks do not become undefined behavior. Delta gives authors a choice for deterministic local failures: let the default panic stop the program, or bind the operation with `as result` and handle the error path explicitly.

**Examples.**
```ts
const item = numbers[index];            // panics if index is out of bounds
```

```ts
const item = numbers[index] as result;  // recover bounds failure
check result {
  return error as BoundsError { code: "bounds.index", message: "bad index", index };
}
```

```ts
const total = a + b as result;          // recover overflow
check result {
  return error as MathError { code: "math.overflow", message: "...", a, b };
}
```

```ts
let hash: Wrap<uint32> = seed;
hash = hash * 16777619;                 // wraps, no panic

const bright: Saturate<uint8> = channel + amount; // saturates, no panic
```

```ts
panic("corrupt runtime state");         // not recoverable
unreachable();                          // not recoverable if reached
```

**Conclusion.** Deterministic local safety checks are recoverable when written with `as result`; otherwise they panic on failure. Explicit wrap/saturate arithmetic opts out of trapping arithmetic by type.

---

### 13.8 Allocation Failure

**Proposal.** APIs whose purpose is to allocate, clone, reserve, grow, or otherwise acquire owned storage are fallible and may be consumed with `as result`. This includes owned string construction, deep cloning, capacity reservation, and collection growth APIs. Exact collection constructor names and growth APIs belong to [§35](#35-allocation-model) and [§37](#37-standard-collections); §13 fixes only the safety policy.

Catastrophic allocation failure below an operation that is not specified as allocation-returning is a non-recoverable panic/abort. The implementation must not continue with null storage or fabricate a partially initialized value.

**Reason.** Allocation failure is ordinary enough that systems code needs a recovery path, especially for capacity planning. At the same time, forcing every incidental implementation allocation to infect otherwise simple APIs would make the whole language feel fallible by default. The compromise is explicit: allocation-facing APIs are fallible; runtime-level catastrophic OOM remains non-recoverable.

**Examples.**
```ts
const owned = string.from(view) as result;    // allocates owned storage
check result {
  return error as AllocError { code: "alloc.failed", message: "string allocation failed" };
}
```

```ts
const copy = clone document as result;        // deep copy may allocate
check result {
  return error as AllocError { code: "alloc.clone", message: result.error.message };
}
```

Illustrative container shape, with exact names deferred:
```ts
buffer.reserve(additional) as result;
check result { return error as AllocError { code: "alloc.reserve", message: "reserve failed" }; }
```

**Conclusion.** Allocation-facing APIs are recoverably fallible. Catastrophic runtime OOM is non-recoverable and must not produce invalid Delta values.

---

### 13.9 Concurrency Boundary

**Proposal.** MVP makes no cross-thread data-race-freedom guarantee because user-level concurrency is out of scope. MVP programs execute under single-threaded application semantics unless they cross into runtime/compiler machinery that is not visible as Delta concurrency. The post-MVP concurrency model is owned by [§42](#42-concurrency--atomics), where shared mutation must be expressed through safe abstractions such as `Mutex<T>` and `Atomic<T>`.

**Reason.** A data-race guarantee requires a thread-spawning model, send/share rules, atomic ordering, lock-guard lifetimes, and closure-capture restrictions. Those are not small footnotes to §13. Naming the boundary prevents readers from assuming the memory-safety model already covers threads.

**Examples.**
```ts
Thread.spawn(() => {
  counter += 1;
});                                     // not MVP
```

Post-MVP direction:
```ts
const counter = Mutex<int32>.create(0);
const guard = counter.lock();
guard.value += 1;                       // lock guard controls mutable access
```

**Conclusion.** MVP memory safety is single-threaded at the Delta application level. Data-race freedom is deferred to the concurrency section.

---

### 13.10 C Interop Boundary

**Proposal.** C interop and `extern "c"` are not specified by §13. Their detailed rules belong to [§40](#40-c-interoperability) and [§41](#41-ffi-safe-types). Section 13 fixes only one boundary: C pointers and C-owned storage do not become raw pointer capabilities in Delta source. Any future C interop surface must expose safe Delta types, validate invariants before values enter Delta, and never require application code to manipulate raw addresses.

**Reason.** FFI is large enough to need its own design pass. Mixing it into the core memory-safety section would blur two separate questions: "what can safe Delta source express?" and "how does Delta talk to unsafe C libraries?"

**Examples.**
```ts
extern "c" {
  function getenv(name: cstringview): cstringview;
}
```

The exact legality, lifetime, and wrapper requirements for this declaration are deferred to the FFI section. What §13 decides is that the returned value cannot be exposed as a raw pointer in Delta.

**Conclusion.** §13 does not settle FFI. It requires any future FFI design to preserve the no-raw-pointer Delta boundary.

---

### 13.11 Explicit Non-Goals for Section 13

The following are deliberately out of scope for MVP or permanently excluded:

- **Raw pointer types or pointer arithmetic in Delta source** - never.
- **Manual `malloc` / `free` in Delta source** - never.
- **User-authored `@trusted` Delta modules** - not in MVP.
- **Trusted Delta standard-library internals with raw pointers** - not in MVP; std Delta source uses the same safe surface as user code.
- **Full lifetime parameters or lifetime inference for every view** - post-MVP.
- **Field-disjoint reference analysis and whole-program alias analysis** - post-MVP.
- **Thread/data-race guarantees** - post-MVP, owned by §42.
- **FFI safety rules** - deferred to §§40-41.
- **Exact collection allocation APIs** - deferred to §§35 and 37.
- **Catchable panics or panic recovery** - not part of Delta.

**Conclusion.** Section 13 defines the MVP safety boundary. It intentionally does not smuggle in the full lifetime, FFI, collection, or concurrency designs.

---

### 13.12 Cross-Section Alignment

This section requires the following alignment elsewhere:

- **§3.3 / §11.5** - definite assignment and whole-value initialization prevent uninitialized reads.
- **§5.5 / §5.15** - numeric traps are recoverable with `as result` and panic by default when not recovered.
- **§7** - `stringview` and `cstringview` are built-in non-owning view types; owned-to-view coercions can create fresh-derived views under §13.6.
- **§8.7 / §9.1 / §36** - `heap T` is the owning heap-indirection form; it is not a raw pointer capability.
- **§9.1 / §12.4** - `uses View of S` marks non-owning view types and drives both call-level alias checking and fresh-derived-view escape checking.
- **§9.7 / §33 / §34** - disposal is automatic, implicit, and ownership-driven.
- **§12** - references are non-owning, call-scoped access capabilities; they do not own, copy, move, or extend lifetime.
- **§14** - ownership is single-owner: assignment copies copyable values, `move` transfers ownership, and `clone` deep-copies cloneable values (fallible). `Disposable` types are never cloneable, which is what blocks resource duplication; use-after-move and double-free are compile-time properties.
- **§38** - bounds failures panic by default and are recoverable with `as result`.
- **§39** - MVP has no trusted Delta source with raw pointer privileges; unsafe implementation detail lives below the Delta boundary in generated/runtime C.
- **§40 / §41** - FFI must preserve the no-raw-pointer Delta boundary, but detailed rules are deferred.
- **§42** - data-race freedom is post-MVP.

---
