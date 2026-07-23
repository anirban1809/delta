# Proposal: Root `std` Collections Library

Status: draft

## Decision

Collections are exported from the same root `std` module as I/O:

```delta
import std from "std";
```

There is no public `std/collections`, `std/array`, or `std/map` import path.
The embedded implementation may be split into files, but only declarations
re-exported by the root `std` façade are visible to user programs.

Every collection type declared by `std` is lowercase, including generic and
auxiliary types: `std.array<T>`, `std.slice<T>`, `std.map<K, V>`,
`std.set<T>`, `std.deque<T>`, `std.queue<T>`, `std.stack<T>`,
`std.buffer`, and `std.iterator<T>`. Type parameters (`T`, `K`, `V`) are local
parameters, not exported symbols.

The module is intentionally split into two semantic families:

- Owning containers (`array`, `map`, `set`, `deque`, `queue`, `stack`, and
  `buffer`) own storage, are cloneable but not copyable, and require explicit
  `clone` or `move` when passed by value.
- `slice<T>` and read-only iterator views are non-owning, copyable views whose
  lifetime is tied to their source.

This makes allocation and aliasing visible at every call site. A collection
does not silently copy its backing storage merely because the handle is passed
to another function.

## Error and ownership conventions

The collections use the existing Delta error channel. Allocation and growth
failures use the canonical `std.alloc_error` declared by the memory module;
invalid positions use `std.bounds_error`. Both satisfy the standard error shape
(`code` and `message`) and add diagnostic fields:

```delta
export type bounds_error = {
    code: stringview;
    message: stringview;
    index: uintsize;
    length: uintsize;
};
```

Operations that can allocate return `void | alloc_error` (or a value plus that
error). A caller propagating the same error writes `forward result;` after the
`as result` binding. `check result { ... }` is reserved for recovery or for
converting a collection error into an application error.

```delta
function add_all(values: edit &std.array<int32>, amount: int32): void | std.alloc_error {
    values.reserve(values.length + 1) as result;
    forward result;
    values.push(amount) as result;
    forward result;
    return;
}
```

Collection indexing follows two explicit paths:

- `at(index)` and mutation methods are fallible and return `bounds_error`.
- `values[index]` is bounds-checked syntax. An out-of-range access traps; it
  is not a hidden nullable value and cannot be discharged with `as result`.

The compiler may elide the indexing trap only when it proves the index is in
range. `try_at(index)` is an optional convenience alias for `at(index)` and is
not a separate unchecked operation.

## Public surface (v1)

The following declarations describe the source-level contract. Concrete
representations are private and may change without changing the API.

```delta
// Owning, contiguous, growable storage.
export type array<T> = {data: T[], length: uintsize, capacity: uintsize};

export function new_array<T>(): array<T> | std.alloc_error;
export function array_with_capacity<T>(capacity: uintsize): array<T> | std.alloc_error;
export function (values: &array<T>) length(): uintsize;
export function (values: &array<T>) capacity(): uintsize;
export function (values: edit &array<T>) reserve(minimum: uintsize): void | std.alloc_error;
export function (values: edit &array<T>) push(value: T): void | std.alloc_error;
export function (values: edit &array<T>) pop(): T?;
export function (values: &array<T>) at(index: uintsize): T | std.bounds_error;
export function (values: edit &array<T>) set(index: uintsize, value: T): void | std.bounds_error;
export function (values: edit &array<T>) insert(index: uintsize, value: T): void | std.bounds_error, std.alloc_error;
export function (values: edit &array<T>) remove(index: uintsize): T | std.bounds_error;
export function (values: edit &array<T>) clear(): void;
export function (values: &array<T>) slice(start: uintsize, end: uintsize): slice<T> | std.bounds_error;

// A non-owning contiguous view. Its lifetime is derived from the source array
// or fixed buffer; it never reallocates and never frees its elements.
export type slice<T>;

export function (values: &slice<T>) length(): uintsize;
export function (values: &slice<T>) at(index: uintsize): T | std.bounds_error;
export function (values: edit &slice<T>) set(index: uintsize, value: T): void | std.bounds_error;
export function (values: &slice<T>) sub_slice(start: uintsize, end: uintsize): slice<T> | std.bounds_error;

// Byte-specialized owning storage. `buffer` is equivalent to array<uint8>
// with byte-oriented names and is the preferred FFI and file-I/O companion.
export type buffer = array<uint8>;

export function new_buffer(): buffer | std.alloc_error;
export function buffer_with_capacity(capacity: uintsize): buffer | std.alloc_error;
export function (bytes: &buffer) length(): uintsize;
export function (bytes: edit &buffer) reserve(minimum: uintsize): void | std.alloc_error;
export function (bytes: edit &buffer) push(value: uint8): void | std.alloc_error;
export function (bytes: edit &buffer) append(values: &slice<uint8>): void | std.alloc_error;
export function (bytes: &buffer) at(index: uintsize): uint8 | std.bounds_error;
export function (bytes: edit &buffer) set(index: uintsize, value: uint8): void | std.bounds_error;
export function (bytes: &buffer) as_slice(): slice<uint8>;
export function (bytes: edit &buffer) clear(): void;

// Hash-based associative containers. K must satisfy the std.hashable
// constraint; equality is part of that constraint.
export interface hashable<T> {
    function hash(value: &T): uintsize;
    function equal(left: &T, right: &T): bool;
}

export type map<K, V>;
export type entry<K, V> = { key: K; value: V; };

export function new_map<K, V>(): map<K, V> | std.alloc_error;
export function map_with_capacity<K, V>(capacity: uintsize): map<K, V> | std.alloc_error;
export function (values: &map<K, V>) length(): uintsize;
export function (values: &map<K, V>) contains(key: &K): bool;
export function (values: &map<K, V>) get(key: &K): V?;
export function (values: edit &map<K, V>) put(key: K, value: V): void | std.alloc_error;
export function (values: edit &map<K, V>) remove(key: &K): V?;
export function (values: edit &map<K, V>) clear(): void;

export type set<T>;

export function new_set<T>(): set<T> | std.alloc_error;
export function set_with_capacity<T>(capacity: uintsize): set<T> | std.alloc_error;
export function (values: &set<T>) length(): uintsize;
export function (values: &set<T>) contains(value: &T): bool;
export function (values: edit &set<T>) add(value: T): bool | std.alloc_error;
export function (values: edit &set<T>) remove(value: &T): bool;
export function (values: edit &set<T>) clear(): void;

// Double-ended and restricted queue containers.
export type deque<T>;
export type queue<T>;
export type stack<T>;

export function new_deque<T>(): deque<T> | std.alloc_error;
export function (values: &deque<T>) length(): uintsize;
export function (values: edit &deque<T>) push_front(value: T): void | std.alloc_error;
export function (values: edit &deque<T>) push_back(value: T): void | std.alloc_error;
export function (values: edit &deque<T>) pop_front(): T?;
export function (values: edit &deque<T>) pop_back(): T?;
export function (values: &deque<T>) at(index: uintsize): T | std.bounds_error;

export function new_queue<T>(): queue<T> | std.alloc_error;
export function (values: edit &queue<T>) enqueue(value: T): void | std.alloc_error;
export function (values: edit &queue<T>) dequeue(): T?;
export function (values: &queue<T>) length(): uintsize;

export function new_stack<T>(): stack<T> | std.alloc_error;
export function (values: edit &stack<T>) push(value: T): void | std.alloc_error;
export function (values: edit &stack<T>) pop(): T?;
export function (values: &stack<T>) length(): uintsize;

// A read-only, source-tied traversal view. Mutable collection operations and
// iterator invalidation rules are described below.
export type iterator<T>;
export function (values: &array<T>) iter(): iterator<T>;
export function (values: &slice<T>) iter(): iterator<T>;
export function (values: &map<K, V>) entries(): iterator<entry<K, V>>;
export function (values: &set<T>) iter(): iterator<T>;
export function (values: edit &iterator<T>) next(): T?;
```

The `hashable<T>` interface is a constraint, not a runtime object supplied to
every map. Primitive keys use compiler-provided implementations. User-defined
keys must provide a stable hash and equality operation before constructing a
map or set. Mutating a key while it is stored is rejected by the borrow checker
or requires removal and reinsertion.

`T?` from `pop`, `get`, `remove`, `dequeue`, and `next` means no value is
available. This is adequate for v1's nullable model; a future `iterator_step<T>`
can distinguish an exhausted iterator from an iterator over nullable elements
without changing the owning containers.

## Semantics

### Allocation and growth

`new_*` and `*_with_capacity` allocate immediately and are fallible. `reserve`
grows capacity to at least the requested number of elements, preserving all
existing values if it succeeds and leaving the container unchanged if it fails.
The growth policy is implementation-defined but must be geometric for repeated
pushes; callers needing a hard allocation budget should reserve once and check
the error.

`push`, `put`, `add`, `enqueue`, and `push_*` may grow and therefore return
`alloc_error`. `set`, `remove`, `clear`, and all pop operations do not allocate.
An empty pop returns `null` and is not an error.

The container remains valid after an allocation failure. No operation may leave
an element half-inserted or silently discard an existing element. If a type's
move or clone itself can fail in a future ownership model, the operation must
use the same commit-or-rollback guarantee.

### Ownership and cloning

Owning containers are cloneable: `clone values` creates an independent deep
copy, and `clone values as result` is required when the caller wants allocation
failure recovery. Plain assignment of an `array<T>`, `map<K,V>`, or other owning
container is rejected. `move values` transfers ownership and invalidates the
source.

`slice<T>` and `iterator<T>` carry no ownership of elements and are copyable
views. A slice cannot outlive its source array or buffer, and a mutable slice
holds the same exclusive borrow as `edit &` of its source. Creating a mutable
slice prevents mutation or reallocation of the source for the slice's lifetime.

`as_slice()` returns a view tied to the buffer. It does not copy. Any operation
that might reallocate the buffer while that view is live is rejected by the
borrow checker. A caller that needs independent storage must construct or clone
another `buffer`.

### Bounds and indices

Valid element positions are `0 <= index < length`. Insertion additionally
permits `index == length`; `at`, `set`, `remove`, and `deque.at` do not. Slice
ranges use a half-open interval `[start, end]` and permit `start == end`.
Invalid ranges return one `bounds_error` and do not mutate the source.

The bracket operator is intentionally the fast, trapping path. It can be used
inside a loop after a check that proves the index, while `at` is the right API
for user-controlled indices or functions that need recoverable failure.

### Iteration and invalidation

`array`, `slice`, `map`, and `set` expose read-only iterators. A `for (const x of
values)` loop may be lowered to `iter()`/`next()` once the language's iteration
protocol is available. The iterator keeps a borrow of its source, so changing
the collection's length or capacity while iterating is rejected.

For `map` and `set`, iteration order is unspecified and may change after a
mutation. `array` and `slice` iterate in increasing index order. Queue and
stack iteration are deferred until their ordering contract is needed; callers
can drain them explicitly with `dequeue` or `pop`.

## Example: collecting input and indexing safely

```delta
import std from "std";

function read_line(input: edit &std.stdin): std.buffer | std.io_error, std.alloc_error {
    let result: std.buffer = std.new_buffer() as allocation;
    forward allocation;

    let byte: uint8[1];
    while (true) {
        const count = input.read(byte) as read_result;
        forward read_result;
        if (count == 0 || byte[0] == 10) break;

        result.push(byte[0]) as push_result;
        forward push_result;
    }
    return result;
}

function main(): int8 {
    let input: std.stdin = std.stdin();
    const line = read_line(input) as result;
    check result { return 1; }

    const bytes = line.as_slice();
    if (bytes.length() > 0) {
        const first = bytes.at(0) as first_result;
        check first_result { return 1; }
        // `first` is now a valid uint8; no unchecked index was required.
    }
    return 0;
}
```

The `read_line` function forwards allocation and input failures unchanged.
`main` cannot forward an `io_error`, so it handles the result with `check` and
chooses an exit code.

## Runtime and implementation plan

The first implementation should use ordinary Delta source for collection
algorithms and a small private runtime allocator only where C is necessary.
Container layouts are compiler-known or emitted through private helpers; raw
pointers never appear in the public API.

1. Add root-`std` declarations for `alloc_error`, `bounds_error`, `array`,
   `slice`, and `buffer`; reserve generic type parameters and ownership bounds.
2. Implement contiguous storage and borrow/lifetime checks for `array`,
   `slice`, and `buffer`, including trap-preserving indexing code generation.
3. Add hash-table storage and the `hashable` constraint for `map` and `set`.
4. Add `deque`, `queue`, and `stack` as containers over the same growable
   storage primitive.
5. Add iterator lowering and invalidation diagnostics, then add collection
   convenience algorithms only after the core contracts are stable.

The runtime must provide checked allocation, overflow-safe capacity arithmetic,
alignment suitable for every `T`, and a deterministic failure result. A failed
allocation must never be represented as a null collection handle visible to
Delta code.

## Compatibility and exclusions

- Existing PascalCase `Array<T>` and `Slice<T>` names in older design text are
  replaced at the public standard-library boundary by lowercase `array<T>` and
  `slice<T>`. The language may retain aliases during migration, but new std
  APIs use only lowercase names.
- Sorting, binary search, heap/priority queues, ordered maps, and concurrent
  containers are deferred until comparator, allocator, and concurrency
  contracts exist.
- Formatting, serialization, filesystem traversal, and I/O streaming remain
  separate concerns. `std.buffer` is the byte bridge between collections and
  the I/O API; it does not know about files or encodings.
- No hidden global allocator state is exposed. A future allocator parameter can
  be added after the basic containers have a stable ownership contract.

## Acceptance criteria

- `import std from "std"` exposes all collection symbols; `std/collections`,
  `std/array`, and `std/map` are not public import paths.
- Every exported collection type is lowercase, including generic and helper
  types.
- `array`, `slice`, and `buffer` preserve values across growth, reject invalid
  ranges, and enforce source/view lifetimes.
- Allocation failures are recoverable through `as result` and `forward result;`;
  no failed mutation leaves a partially updated container.
- Owning collections reject implicit copies and support explicit `clone` and
  `move`; slices remain copyable but cannot outlive their source.
- `map` and `set` reject non-hashable keys, preserve key/value associations,
  and document unspecified iteration order.
- Tests cover empty operations, boundary indices, insertion at `length`,
  partial-growth failure, move/clone behavior, iterator invalidation, and the
  root-module-only import rule.
