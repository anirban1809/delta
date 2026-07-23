# Proposal: Root `std` Memory Management Library

Status: draft

## Decision

Memory management is exposed from the same root module as I/O and collections:

```delta
import std from "std";
```

There is no public `std/mem` import path. The implementation may contain
private Delta and C runtime files, but every user-visible declaration is
re-exported by `std`.

All exported memory types use lowercase names: `std.owned<T>`,
`std.shared<T>`, `std.arena`, `std.arena_ref<T>`, `std.layout`,
`std.allocator`, `std.alloc_error`, and `std.memory_error`.

The central rule is that ordinary Delta code never receives a raw address from
an allocation operation. Ownership, initialization, and destruction are
represented by typed capabilities. A C-origin `rawptr<T>` may be handled by a
deliberately unsafe FFI wrapper, but `std` does not provide an integer-to-pointer
cast, address-of-to-raw-pointer operation, or general `free(rawptr)` escape
hatch.

## Ownership model

The module has three distinct storage strategies:

- `owned<T>` is a unique owning allocation. It is move-only, automatically
  destroyed at scope exit, and cannot be copied or cloned unless `T` supports
  the corresponding explicit `clone` operation.
- `shared<T>` is a reference-counted allocation. Copying retains the allocation,
  `move` transfers one handle without retaining, and scope exit releases it.
  It is memory-safe but does not provide data-race or mutation exclusivity.
- `arena` owns a region. `arena_ref<T>` is a borrowed value tied to the arena;
  it does not individually free and cannot outlive the arena.

Plain Delta values remain the preferred representation for small, fixed data.
Use `owned<T>` or `shared<T>` only when an allocation, recursive shape, or
cross-scope sharing is actually needed.

There is no public `std.free`. `drop(move value)` is the explicit early-release
operation; normal scope cleanup calls the same generated destructor. This
prevents double-free and allocator-mismatch bugs while still allowing a caller
to release a resource before leaving a large scope.

## Errors and `forward`

The memory module owns the canonical allocation error used by collections and
other allocating standard-library modules:

```delta
export type alloc_error = {
    code: stringview;
    message: stringview;
    requested: uintsize;
    alignment: uintsize;
};

export type memory_error = {
    code: stringview;
    message: stringview;
    operation: stringview;
};
```

`alloc_error` reports failure to obtain or grow storage. `memory_error` reports
an invalid alignment, overflow in a size computation, an invalid byte range,
or a violated operation precondition. Neither error stores a borrowed pointer.

Every fallible allocation is consumed with `as result`. When the caller's
error set includes the received error, it forwards without reconstructing it:

```delta
function allocate_owned<T>(value: T): std.owned<T> | std.alloc_error {
    let result: std.owned<T> = std.alloc(value) as allocation;
    forward allocation;
    return result;
}
```

`check result { ... }` remains appropriate when the caller wants to recover,
translate an allocation failure, or return from an infallible function.

## Public surface (v1)

### Layout and allocation

```delta
export type layout = {
    size: uintsize;
    alignment: uintsize;
};

export function layout_of<T>(): layout;
export function layout_for(size: uintsize, alignment: uintsize): layout | std.memory_error;
export function checked_add(left: uintsize, right: uintsize): uintsize | std.memory_error;
export function checked_multiply(left: uintsize, right: uintsize): uintsize | std.memory_error;
export function align_up(value: uintsize, alignment: uintsize): uintsize | std.memory_error;

export function alloc<T>(value: T): owned<T> | std.alloc_error;
export function alloc_zeroed<T>(): owned<T> | std.alloc_error;
export function realloc<T>(value: edit &owned<T>, replacement: T): void | std.alloc_error;
export function drop<T>(value: move owned<T>): void;
```

`layout_of<T>()` is compiler-provided and returns the target ABI's size and
alignment. `layout_for` requires a nonzero power-of-two alignment and rejects
size/alignment combinations that overflow the target's address space.

`alloc(value)` allocates and initializes one `T`. `alloc_zeroed<T>()` exists
only for types satisfying the compiler's `zeroable` constraint; it never
pretends that an arbitrary all-zero byte pattern is a valid value. `realloc`
may move the allocation internally, but takes an exclusive borrow so the
caller retains one valid owner either way. If allocation fails, the
implementation preserves the original value and reports the error. Any
references into the owner are excluded by the exclusive borrow for the full
operation.

The `owned<T>` receiver surface is intentionally small:

```delta
export type owned<T>;

export function (value: &owned<T>) get(): &T;
export function (value: edit &owned<T>) get_mut(): edit &T;
```

In ordinary Delta expressions, member access auto-dereferences `owned<T>`.
`get` and `get_mut` make the capability explicit at API boundaries. A moved or
dropped owner cannot be borrowed; this is enforced by the compiler rather than
by a runtime validity predicate.

### Shared ownership

```delta
export type shared<T>;

export function share<T>(value: T): shared<T> | std.alloc_error;
export function (value: &shared<T>) get(): &T;
export function (value: edit &shared<T>) get_mut(): edit &T;
export function (value: &shared<T>) use_count(): uintsize;
```

Assignment of `shared<T>` retains its control block. `clone shared_value`
performs a deep clone of `T`, while plain assignment creates another handle to
the same value. A `shared<T>` containing mutable state permits mutation through
`edit &`; this is a documented aliasing trade-off, not a data-race guarantee.
`atomic shared<T>` is deferred until the concurrency module defines its memory
ordering contract.

### Raw byte operations

These operations are safe because they operate on existing, initialized byte
views. They never accept or return a raw pointer.

```delta
export function copy_bytes(destination: edit &slice<uint8>, source: &slice<uint8>): void | std.memory_error;
export function move_bytes(destination: edit &slice<uint8>, source: &slice<uint8>): void | std.memory_error;
export function fill_bytes(destination: edit &Slice<uint8>, value: uint8): void;
export function compare_bytes(left: &Slice<uint8>, right: &Slice<uint8>): int32;
export function swap<T>(left: edit &T, right: edit &T): void;
```

`copy_bytes` has memmove semantics and is valid for overlapping views;
`move_bytes` is the same byte-level operation with a name that documents that
the source contents are no longer meaningful to the caller. Neither function
changes the length of a slice. A destination shorter than the source returns
`memory_error { code: "memory.destination_too_small", ... }` and performs no
write. `swap<T>` requires two distinct, simultaneously mutable borrows; the
borrow checker rejects aliasing arguments.

There is deliberately no general `copy<T>` that bypasses ownership or
initialization. Plain assignment handles copyable values, `clone` handles
cloneable values, and `move` handles transfers. Byte copies are for byte
buffers, FFI payloads, and serialization primitives only.

### Arenas

```delta
export type arena;
export type arena_ref<T>;

export function new_arena(capacity: uintsize): arena | std.alloc_error;
export function (region: edit &arena) alloc<T>(value: T): arena_ref<T> | std.alloc_error;
export function (region: edit &arena) reset(): void;
export function (region: move arena) destroy(): void;
export function (value: &arena_ref<T>) get(): &T;
export function (value: edit &arena_ref<T>) get_mut(): edit &T;
```

Arena allocation is useful for a parser or request whose objects share one
well-defined lifetime. `arena_ref<T>` is not an owner and has no `drop` method.
The borrow checker prevents `reset` or `destroy` while a reference derived from
the arena is live. `reset` then makes the region reusable; it does not run an
individual destructor for every allocation. Types with external cleanup (such
as `std.file`) are rejected by `arena.alloc` unless they provide an explicit
arena-safe disposal policy.

`new_arena` reserves the requested capacity but may grow on later allocation.
`alloc` is transactional: if it fails, existing arena references remain valid
and the arena's previous contents are unchanged. Arena growth may invalidate
addresses internally, so references across a growth call are conservatively
rejected unless the arena implementation uses a stable segmented backend.

### Allocator abstraction (deferred public customization)

```delta
export interface allocator {
    function allocate<T>(value: T): owned<T> | std.alloc_error;
    function deallocate<T>(value: move owned<T>): void;
}

export function default_allocator(): &allocator;
```

`default_allocator()` is a borrowed process allocator used internally by
`alloc`, collections, and arenas. User-defined allocators are not accepted by
the v1 containers: allocator identity must not be hidden inside a value that
can later be moved to a different owner. Custom allocator injection is a
follow-up design requiring allocator pairing, thread-safety, and lifetime
rules. The interface is documented now so those rules have a stable target.

## Memory safety invariants

The compiler and runtime must preserve these invariants:

- Every successful `owned<T>` has exactly one owner and exactly one eventual
  destruction path.
- A failed `alloc` or `realloc` leaves the prior owner/value usable.
- `shared<T>` frees its control block exactly when its count reaches zero.
- No reference or `arena_ref<T>` can outlive the allocation or arena it views.
- No operation reads uninitialized storage or writes past a slice's length.
- Allocation sizes and alignment arithmetic are checked before reaching C.
- `drop` consumes its argument; using it afterward is a compile-time move error.
- A scope-exit cleanup path runs before `return`, `forward`, `break`, and
  `continue` according to the existing reverse-declaration disposal order.

The memory runtime may trap only for compiler-proven impossible states or an
unrecoverable process-wide runtime failure. Ordinary allocation failure is
represented by `alloc_error` when called through this API.

## Runtime and implementation plan

1. Make `alloc_error` a canonical root-`std` error and have the collections
   design consume it instead of redeclaring it.
2. Add compiler-known `owned<T>` and `shared<T>` layouts, move states,
   auto-deref, and scope-exit disposal. Generate per-type drop and clone
   helpers only for types used in a build.
3. Add checked layout arithmetic and typed allocation helpers over the bundled
   runtime allocator. Use `malloc`/`free` only behind `delta_rt_*` functions.
4. Add `copy_bytes`, `move_bytes`, `fill_bytes`, `compare_bytes`, and `swap`
   with borrow and length checks before C lowering.
5. Add arenas after lifetime analysis can reject reset/destroy while borrowed.
6. Expose `allocator` as a borrowed interface only after custom allocator
   pairing and thread-safety semantics are specified.

The C runtime must never receive a Delta pointer without a compiler-generated
length, layout, or ownership operation. Runtime functions return tagged status
values; they do not signal ordinary OOM by returning a null pointer into Delta.

## Compatibility and exclusions

- The language's existing `heap T`/`new` spelling may lower onto `std.owned<T>`
  internally. New library APIs use the lowercase generic type name `owned<T>`.
- There is no public `std.free`, raw `alloc(size)`, pointer arithmetic,
  integer-to-pointer cast, or public address-of operation.
- `weak<T>`, atomic reference counting, pools, slab allocators, garbage
  collection, page mapping, executable memory, and custom allocator selection
  are deferred until their safety contracts are ready.
- `std.buffer` and collection storage are clients of this module; they should
  not duplicate allocation, overflow, or disposal logic.
- C interop may use C-origin `rawptr<T>` under the separate FFI rules. This
  module does not turn that unsafe boundary into an ordinary Delta allocation
  primitive.

## Acceptance criteria

- `import std from "std"` is the only public memory-library import path; direct
  `std/mem` imports are rejected.
- All exported memory types and functions use lowercase names.
- Typed allocation, reallocation, explicit `drop`, and automatic scope cleanup
  never double-free, leak on a failed reallocation, or permit use-after-move.
- Byte operations reject short destinations and preserve overlap semantics.
- Shared handles retain/release correctly, and arena references cannot outlive
  their arena or survive an unsafe reset.
- Allocation failures can be handled with `as result` or propagated using
  `forward result;`.
- Tests cover zero-sized/aligned layouts, arithmetic overflow, allocation
  failure injection, move/clone/drop paths, aliasing rejection in `swap`,
  overlapping byte moves, arena lifetime errors, and the root-module-only
  import rule.
