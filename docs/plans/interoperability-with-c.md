# Interoperability with C

Date drafted: 2026-07-03
Revised: 2026-07-07 — inbound model simplified toward Zig-style C imports. C headers are imported directly with `import c`, C pointers lower to `rawptr<T>`, Delta source cannot fabricate raw pointers, and the only mandatory safety check is null-checking a `rawptr<T>` with `as result` before use. Ownership/lifetime/aliasing/destructor correctness is the C-using developer's responsibility; safe wrapper modules are best practice, not additional language machinery.
Status: **Draft / design.** Not yet specced or implemented. Depends on the ownership model ([examples/12](../../examples/12-ownership-move-clone.delta)), owned indirection ([examples/14](../../examples/14-heap.delta)), the error model ([examples/11](../../examples/11-error-model.delta)), and the `extern "c"` machinery sketched in [examples/18](../../examples/18-stdlib-log.delta). Spec home: §40 (C interop), Phase D / Phase J territory — see [next-milestone](5-day-plan-jun2026.md).

---

## 1. The organizing idea

Delta lowers to C, so it is C-compatible *by construction*. This document specifies the two directions that turn that lowering into a usable **two-way** boundary:

| Direction | Meaning | Boundary | What the compiler enforces |
|-----------|---------|----------|-----------------------------|
| **Inbound** (C → Delta) | call a C library from Delta | `import c "header.h"` | C pointers are `rawptr<T>`; Delta cannot fabricate them; nullable `rawptr<T>` must be checked with `as result` before use |
| **Outbound** (Delta → C) | call a Delta library from C | *(no keyword)* — the module's export surface | Delta projects known types/signatures into a C header |

The asymmetry is the thesis of the whole design and worth stating up front:

> **C interop is C-shaped.** Inbound, a C header carries only types and signatures; it does not encode ownership, borrowed lifetimes, destructor choice, allocator pairing, aliasing, or error conventions. Delta therefore enforces only the facts it can know mechanically: raw pointers must originate outside Delta, and they must be null-checked before use. Past that point, using a C library directly is intentionally the developer's responsibility. Outbound, data moves from the richer language to the poorer one, so the boundary is a pure **projection** and is **fully autogeneratable** with zero annotation.

Everything below follows from that single observation.

---

## 2. Inbound — calling C from Delta

### 2.1 Seamless C imports

The inbound surface is a Zig-style C import:

```ts
import c "stdio.h" as stdio;
```

This is a source-level convenience over a generated raw binding. The compiler runs the equivalent of `delta bindgen` internally, translates the C header into a namespace, and exposes C functions, constants, typedefs, records, enums, and opaque types under the chosen import alias. A checked-in generated `ffi/*.delta` file is an implementation option, not the user-facing model.

C pointers in imported signatures become `rawptr<T>`:

```ts
import c "stdio.h" as stdio;

// C:
//   FILE *fopen(const char *path, const char *mode);
//   size_t fread(void *buf, size_t size, size_t n, FILE *stream);
//   int fclose(FILE *stream);
//
// Delta import view:
//   stdio.FILE                              // opaque C type
//   stdio.fopen(...): rawptr<stdio.FILE>    // nullable until checked
//   stdio.fread(..., stream: rawptr<stdio.FILE>): usize
//   stdio.fclose(stream: rawptr<stdio.FILE>): int32
```

### 2.2 `rawptr<T>` — C-origin pointer

`rawptr<T>` is the C pointer type. It lowers to a bare `T*`. It has no ownership, no RAII, no lifetime, no aliasing guarantees, and no allocator identity. After a `rawptr<T>` has been null-checked, Delta does not try to prove that the pointed-to memory is valid, alive, aligned, uniquely borrowed, initialized, or freed by the correct destructor.

Delta source cannot fabricate a `rawptr<T>`. Specifically:

- no `rawptr<T>` literal,
- no address-of operation that converts a Delta value into `rawptr<T>`,
- no integer-to-pointer cast,
- no `rawptr_null()` source escape hatch,
- no raw allocation intrinsic that creates a `rawptr<T>` in ordinary Delta source.

A `rawptr<T>` enters Delta only from C imports, compiler/runtime-provided C interop glue, or a Delta value decaying at a C call boundary (§2.6). This is the first hard safety rule: Delta code cannot invent addresses.

The custodians that may hold a raw pointer — `owned<T>`, `shared<T>`, and `ptr<T>` — are blessed stdlib/compiler primitives with their own dedicated constructors, not values built from a general raw-allocation intrinsic exposed to source. They are created manually, only where a wrapper actually needs one, which keeps the privileged surface confined to that small fixed set rather than handing raw allocation to ordinary Delta code.

### 2.3 Mandatory null check with `as result`

Every `rawptr<T>` value returned from C is nullable and unusable until checked. The check uses Delta's existing error-handling shape:

```ts
const h = stdio.fopen(path, mode) as result;
check h {
    return error as OpenError { path: path };
}

// `h` is now a non-null rawptr<stdio.FILE>.
stdio.fclose(h);
```

`as result` on a `rawptr<T>` means: if the pointer is null, bind the result in the error arm; otherwise narrow the success binding to non-null `rawptr<T>`. The `check` block is the programmer's escape hatch: return an error, return a status code, panic, or otherwise leave the path where the pointer would be used.

Using a possibly-null `rawptr<T>` is a compile error:

```ts
const h = stdio.fopen(path, mode);
stdio.fclose(h);
// ERROR: raw pointer `h` must be null-checked with `as result` before use
```

This is the second hard safety rule: C null must be handled before C pointers are used.

### 2.4 After the check: C rules apply

A non-null `rawptr<T>` is not "safe Delta memory"; it is only a non-null C pointer. Delta deliberately does not add more language machinery for determining ownership or borrowedness because C headers do not contain that information.

After null checking, the developer is responsible for:

- whether the pointer is owning or borrowed,
- which destructor, if any, must be called,
- whether the pointer is an interior pointer into another object,
- how long the pointer remains valid,
- whether C may retain a passed pointer after the call,
- allocator pairing (`free`, `fclose`, library-specific destroy functions, or none),
- mutable aliasing and thread-safety,
- buffer length correctness,
- struct layout, alignment, and invalid bit patterns.

This is an intentional design choice. Direct use of a C library is unsafe in the ordinary C sense, even though it is syntactically convenient from Delta.

### 2.5 Optional safe wrappers

The recommended style is still to isolate direct C calls in a small wrapper module and expose normal Delta-shaped APIs from that module. That is a best practice, not a separate language feature.

```ts
import c "stdio.h" as stdio;
import { ptr, adopt } from "std/mem";

type OpenError = { path: cstringview; };
type ReadError = {};

unique type File = { handle: ptr<stdio.FILE>; };

function open(path: cstringview, mode: cstringview): File | OpenError {
    const h = stdio.fopen(path, mode) as result;
    check h {
        return error as OpenError { path: path };
    }

    return File { handle: adopt(h, stdio.fclose) };
}

function (f: edit &File) readInto(buf: edit &[u8]): usize | ReadError {
    const n = stdio.fread(buf, 1, buf.len(), f.handle);
    if (stdio.ferror(f.handle) != 0) {
        return error as ReadError {};
    }
    return n;
}
```

`ptr<T>` is a library abstraction for an owned foreign handle with a destructor. It is useful when the wrapper author knows the C API transfers ownership and knows the correct destructor. Promotion from `rawptr<T>` to `ptr<T>` is manual because null-checking proves only non-nullness; it does not prove ownership.

Borrowed C pointers do not become `ptr<T>`. They should remain raw in a C-shaped wrapper or be converted into a domain-specific view such as `cstringview` when the wrapper author knows the lifetime rules.

### 2.6 Decay at C call boundaries

Delta containers and references may decay to C pointer shapes only at C call boundaries. This gives ergonomic C calls without giving Delta source a general raw-pointer construction operation.

Examples:

- `&[T]` may lower to `const T*` plus length when the C signature expects a pointer/length pair.
- `edit &[T]` may lower to `T*` plus length.
- `&T` may lower to `const T*`.
- `edit &T` may lower to `T*`.
- `owned<T>` / `shared<T>` / `ptr<T>` may expose the contained pointer for the duration of the C call according to their normal borrow rules.

The decay is implicit and call-site-local. There is no `.raw()` / `.raw_ptr()` accessor: an explicit method that returned a storable `rawptr<T>` would be a fabrication and is a compile error. Decay does not create a storable `rawptr<T>` binding in Delta source:

```ts
stdio.fread(buf, 1, buf.len(), h);     // OK: `buf` decays for this C call

const p = buf.raw_ptr();               // ERROR: Delta source cannot fabricate rawptr<T>
```

If a C API retains a pointer after the call, the wrapper author must model that deliberately with an API-specific ownership transfer or lifetime convention. Delta does not infer it from the C header.

### 2.7 Best practices for C wrappers

Because the language intentionally enforces only C-origin and null-checking, library authors should keep the C-shaped surface small:

- Put direct `import c` usage in one wrapper module per C library.
- Expose ordinary Delta types, errors, slices, strings, and methods from that module.
- Convert null/error conventions into Delta `| Error` results at the boundary.
- Use `ptr<T>` only when the C documentation says the caller owns the result and names the matching destructor.
- Do not expose `rawptr<T>` from application-facing APIs unless the API is deliberately C-like.
- Document whether every returned pointer is owned, borrowed, interior, thread-local, invalidated by later calls, or valid until a parent object is destroyed.
- Pair every create/open/alloc wrapper with one clear disposal path.
- Prefer Delta slices/containers at the wrapper boundary; let them decay only at the C call.
- Treat callbacks, global state, retained pointers, custom allocators, and APIs that write into caller memory as audit points.

### 2.8 Inbound C lowering

The import, null check, and direct C calls lower to ordinary C:

```ts
import c "stdio.h" as stdio;

function closeFile(path: cstringview): int32 {
    const h = stdio.fopen(path, "rb") as result;
    check h {
        return 1;
    }

    stdio.fclose(h);
    return 0;
}
```

```c
int32_t delta__closeFile(const char* path) {
    FILE* h = fopen(path, "rb");
    if (h == NULL) {
        return 1;
    }

    fclose(h);
    return 0;
}
```

`import c` and `rawptr<T>` are zero-cost. The mandatory `as result` check emits the ordinary null branch the programmer would have written by hand in C.

---

## 3. Outbound — calling Delta from C

### 3.1 No keyword: the module *is* the export surface

There is deliberately **no `export "c"`**. A module already declares what it exports — the symbols other Delta modules `import` ([examples/18](../../examples/18-stdlib-log.delta)). **That existing export surface is also the C-export surface.** A `delta cbindgen`-style tool emits a `.h` from it. Nothing new to learn; nothing to annotate.

```ts
// counter.delta — an ordinary module. No export annotations anywhere.
type AllocError = {};
unique type Counter = { value: int64; };

function new(): owned<Counter> | AllocError {
    return new Counter { value: 0 } as result;
}
function (c: edit &Counter) add(amount: int64): void {
    c.value = c.value + amount;
}
function (c: &Counter) get(): int64 {
    return c.value;
}
```

### 3.2 Names are not mangled

Mangling was only ever a mechanical uniqueness trick for placing Delta's namespaced symbols into C's flat global namespace. Outbound, the symbols you *named* export under a clean, conventional C name; the uniqueness obligation moves to the author and is compiler-enforced.

Default naming scheme:

| Delta declaration | C symbol |
|-------------------|----------|
| free function `f` in module `m` | `m_f` → `counter_new` |
| method `meth` on type `T` | `T_meth` → `Counter_add` |
| record / `unique type` `T` | `T` (opaque if `unique`) |

Enforcement:

- **Global uniqueness.** If two exported symbols map to the same C identifier (two modules both defining `new`), the compiler **errors**; the author renames or supplies a one-line name alias.
- **Valid C identifiers.** A Delta symbol named `struct` (or `new`, if the header may be compiled as C++) is rejected or must be prefixed.
- This means unmangled export requires a **curated** module-public surface, not every internal helper — which is correct: internals should never be part of an ABI contract.

### 3.3 Synthesized types never cross the boundary

> **The exported C header mentions *only* author-named types and C primitives.** No leaked `..._result` structs, no `Slice_T` structs, no mangled generic-instance names.

The three compiler-synthesized shapes are dissolved into the *signature* by a **fixed, zero-annotation canonical lowering** — uniform, not per-function:

| Synthesized shape | Canonical C projection | What C never sees |
|-------------------|------------------------|-------------------|
| error channel `S \| Errs` | `int32_t f(args, <S> out)` — `0`=ok, stable nonzero code per error variant | the `{is_error; union}` result struct |
| slice `[]T` | `(T* ptr, size_t len)` param pair (out-pair on return) | any `Slice_T` struct |
| generic instance `Vec<int32>` | **not exportable** unless aliased (`type IntVec = Vec<int32>`) | a mangled instance name |

Sub-rules that make the projection total and deterministic:

- **void success** (`void | E`) → status code only, no out-param.
- **pointer success** (`owned<T> | E` → `T*`) → may collapse to the NULL-sentinel shortcut `T* f(args)` when the caller does not need to distinguish error codes.
- **multi-error sets** → the status code is the discriminant; per-variant *payloads* beyond "which error" require a shim that merges them into a single named error record (otherwise the error arm re-synthesizes a union).

### 3.4 The generated header

Applying §3.2 and §3.3 to `counter.delta`:

```c
// counter.h — GENERATED. Reads like a hand-written C library.
#ifndef DELTA_counter_H
#define DELTA_counter_H
#include <stdint.h>

typedef struct Counter Counter;                  // author-named opaque handle

int32_t Counter_new(Counter** out);             // error channel -> 0=ok / nonzero=AllocError
void    Counter_add(Counter* c, int64_t amount);
int64_t Counter_get(const Counter* c);
void    Counter_dispose(Counter* c);            // auto-emitted from dispose()/owned disposal

#endif
```

### 3.5 C usage

```c
#include "counter.h"
#include <stdio.h>

int main(void) {
    Counter* c;
    if (Counter_new(&c) != 0) return 1;          // AllocError, by status code
    Counter_add(c, 5);
    Counter_add(c, 7);
    printf("%lld\n", (long long)Counter_get(c));
    Counter_dispose(c);                          // C frees the Delta-owned handle
    return 0;
}
```

### 3.6 Ownership leaves the checker — the paired destructor

Once `Counter_new` returns to C, Delta's ownership analysis cannot follow the pointer. C is **trusted** to call `Counter_dispose` exactly once and never use-after-free. This is irreducibly unsafe and unavoidable — static guarantees cannot be projected into a language that has none. Two rules keep it as safe as it can be:

- Every exported function that **transfers ownership** of an `owned<T>` obligates the generator to also export that type's destructor. The compiler enforces the pairing.
- The destructor is just `dispose()` re-projected as a manually-callable C symbol — the classic `_new`/`_dispose` C-library pattern.

### 3.7 A worked example with the error channel and a slice

```ts
// buffer.delta
type IoError = { code: int32; };
unique type Buffer = { data: owned<[u8]>; };

function open(path: cstringview): Buffer | IoError { /* ... */ }

// returns a borrowed view of the buffer's bytes
function (b: &Buffer) bytes(): &[u8] { /* ... */ }

// reads up to buf.len bytes; returns count or an error
function (b: edit &Buffer) read(buf: edit &[u8]): usize | IoError { /* ... */ }
```

Generated header — the `| IoError` becomes status+out, the `&[u8]` becomes `ptr+len`, and no synthesized struct appears:

```c
typedef struct Buffer Buffer;

int32_t Buffer_open(const char* path, Buffer** out);          // S | E  -> status + out
void    Buffer_bytes(const Buffer* b, const uint8_t** out_ptr, size_t* out_len);  // []u8 -> ptr+len
int32_t Buffer_read(Buffer* b, uint8_t* buf_ptr, size_t buf_len, size_t* out_n);  // slice in + S|E out
void    Buffer_dispose(Buffer* b);
```

### 3.8 When a signature can't project — flag, don't leak

If a function returns an un-aliased generic instance, or an arm that cannot project, it is **not auto-exported**. The compiler flags it:

```
note: `first<T>` is not C-exportable: generic instance `Vec<T>` has no C name.
      add a `type` alias for the instantiation, or a shim, to export it.
```

The slogan:

> **Everything projectable auto-exports with a clean C signature; anything that can't project is flagged, and the author adds a one-line alias or shim.**

### 3.9 Escape hatch for hand-tuned C ergonomics

The canonical projection is faithful but not always the *prettiest* C. To hand-shape an API, write a thin ordinary Delta function whose return and error shape project the way you want.

For example, the default error-channel projection keeps the error visible:

```ts
function create(): owned<Counter> | AllocError {
    return new Counter { value: 0 } as result;
}
```

```c
int32_t Counter_create(Counter** out);  // 0 = ok, nonzero = AllocError
```

If the C API wants a null-sentinel style instead, that is a `cbindgen` projection choice for an owning pointer success with an error arm that carries no C-observable payload:

```c
Counter* Counter_create_or_null(void);  // NULL = AllocError
```

Delta source still does not fabricate `rawptr<T>` or return `rawptr_null()`. The generated C shim is allowed to project failure as `NULL` because it is compiler-owned interop glue, not ordinary Delta source.

---

## 4. Shared concerns

### 4.1 The runtime must be linked and must not trap into C

A Delta library assumes a runtime: the allocator plus trap-on-overflow / OOM-abort ([examples/06](../../examples/06-trap-on-overflow.delta), [examples/14](../../examples/14-heap.delta)). When C calls Delta:

- The runtime (`delta_rt_*`) must be linked into the C program. It is self-initializing, or the host calls an exported `delta_rt_init()` once.
- **A Delta trap aborts the whole process** — the C caller cannot catch it. Therefore **exported entry points must be trap-free on the error path**: use the fallible `as result` forms and surface failures as status codes / NULL, never let an overflow or unchecked-OOM trap unwind into C.
- Proposed lint: an exported function body containing a trap-capable operation without a `check` is flagged.

### 4.2 ABI stability

Because unmangled names + struct layouts *are* the contract, the exported header must stay scoped to **module-public** symbols. Refactoring an internal helper must never change the ABI. "Everything exportable" means "the module's curated public surface," not "every link-visible helper."

### 4.3 Generics

A generic function is not a single C symbol. Only concrete instantiations get exported, and only when aliased to a named type (§3.3). This is consistent with the generics boundary in the roadmap.

### 4.4 Callbacks (deferred)

Passing a Delta function to C as a function pointer works for plain, capture-free functions. Captured state / lifetimes across the boundary (who owns the environment, how long it lives) are hard and **deferred**. Initial support: bare function pointers only.

---

## 5. Tooling

| Tool | Direction | Autogeneratable | Output |
|------|-----------|-----------------|--------|
| `import c "header.h"` | inbound | **yes** | an imported namespace of C declarations; C pointers appear as nullable `rawptr<T>` |
| `delta bindgen <header.h>` | inbound | **yes** | optional checked-in generated binding used by `import c` implementations or build caching |
| `delta cbindgen` (or `delta build --emit-header`) | outbound | **fully** | a `.h` projecting the module's export surface |

`import c` / `bindgen` walks a Clang AST (or `clang -Xclang -ast-dump=json`) and emits the raw import view. A human may write a safe wrapper module over it, but that wrapper is a library-design practice rather than a special compiler mode. `cbindgen` needs no human input — it is a pure projection of a surface Delta already fully understands.

---

## 6. Non-goals

- **Automatic inference of ownership, borrowedness, lifetime, allocator, destructor, or error intent from C headers.** Not in the header. A human who uses the C library directly, or writes a wrapper around it, owns those semantics.
- **Exposing Delta's synthesized types in C** (result structs, slice structs, generic instances). Forbidden by §3.3.
- **A `safe {}` or `unsafe {}` airlock for ordinary C calls.** Direct C interop is C-shaped code. Delta does not add a lexical block to pretend it can prove C ownership/lifetime semantics.
- **Mandatory promotion of `rawptr<T>` to `ptr<T>` or a borrowed pointer type.** Null-checking proves non-nullness only. Classification as owned or borrowed is a wrapper-design decision, not a language requirement.
- **Fabricating raw pointers in Delta source.** `rawptr<T>` is C-origin only; ordinary Delta cannot construct one, cast an integer to one, or take the address of a Delta value as one.
- **Capturing callbacks across the boundary.** Deferred (§4.4).
- **Catching Delta traps in C.** Not possible; exported entry points must be trap-free on the error path (§4.1).

---

## 7. Summary of new surface

| Construct | Direction | Purpose |
|-----------|-----------|---------|
| `import c "header.h" as name` | inbound | imports a C header as a namespace; implemented by bindgen-style Clang analysis |
| `rawptr<T>` | inbound | C-origin pointer type; nullable until checked; cannot be fabricated in Delta source |
| `as result` on `rawptr<T>` | inbound | mandatory null check; narrows success binding to non-null `rawptr<T>` |
| C-call decay | inbound | Delta references/containers may lower to C pointer forms only at C call boundaries |
| `ptr<T>` | stdlib | optional wrapper abstraction for an owned foreign handle when the author knows the destructor |
| *(module export surface)* | outbound | no keyword; the C-export surface, projected by `cbindgen` |
| canonical projections | outbound | fixed lowering that keeps synthesized types out of the header |
