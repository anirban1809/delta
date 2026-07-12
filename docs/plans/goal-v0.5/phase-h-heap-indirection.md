# Plan: Phase H — Indirection Types (full model)

Date drafted: 2026-06-03
Revised: 2026-06-21 — classes dropped (records + receiver methods); type spelled `heap<T>`; allocation via `new`
Revised: 2026-07-04 — type renamed `heap<T>` → `owned<T>`. Final indirection vocabulary settled.
Revised: 2026-07-04b — **all indirections brought into scope.** Phase H now covers the full model: `owned<T>` · `shared<T>` · `atomic shared<T>` · `mutex<T>` / `rwlock<T>` · `sync<T>` / `rwsync<T>`. Reorganized into four sequential sub-parts (H1–H4). See "Scope note" below.
Status: planning, not started.
Predecessor: Phases through **F** landed (former Phase G — safe references — is now part of Phase F, which also reserves and parses the `new` allocation operator). Records (Phase **K**) and receiver methods (Phase **L**) provide the `type`/method model this phase wraps.
Successor: None — Phase H closes v0.5. After Phase H, the full goal from [compiler-goal-v0.5.md](../../compiler-goal-v0.5.md) is reached.
Spec basis: [spec-sections/08-type-declarations.md](../../spec-sections/08-type-declarations.md) §8, [spec-sections/13-memory-safety-model.md](../../spec-sections/13-memory-safety-model.md), [spec-sections/14-ownership-and-move-semantics.md](../../spec-sections/14-ownership-and-move-semantics.md). Receiver-method rules are lifted onto records per Phase L.

## Scope note (read first)

This phase used to be single-owner only. It now brings the **entire indirection model** into scope. That is a large expansion — realistically four milestones, sequenced as sub-parts:

- **H1 — `owned<T>`**: single-owner owning indirection (the original Phase H content). Self-contained; ships first.
- **H2 — `shared<T>` + `atomic shared<T>`**: reference counting. Introduces the **refcount-insertion pass** (retain-on-copy / release-on-drop) and the Model-A mutable-through-shared semantics. `atomic` is a modifier selecting C11-atomic refcount ops.
- **H3 — `mutex<T>` / `rwlock<T>`**: payload locks over pthreads; `.lock()`/`.read()`/`.write()` return a `unique` guard whose `dispose()` unlocks; `.with(closure)` scoped form.
- **H4 — sugar**: `sync<T>` ≡ `atomic shared<mutex<T>>`, `rwsync<T>` ≡ `atomic shared<rwlock<T>>` — transparent type-alias resolution, no new runtime.

**Two prerequisites this expansion creates:**

1. **Refcount insertion (H2).** `shared<T>` requires the compiler to emit `retain` at every copy point (binding, pass-by-value, field store, return) and `release` at every scope exit / overwrite / post-move-suppression. This is an ARC-style pass — the biggest new surface in the phase. `owned<T>` (H1) needs none of it (move-only), which is why H1 ships first and independently.
2. **A threading runtime (H3, and the *point* of `atomic` in H2).** Atomic refcounts and locks are only *observable* under concurrency. Their **types, lowering, and single-threaded semantics are in scope** (C11 `_Atomic` and `pthread_mutex_t` compile and pass uncontended tests). **Genuine multi-thread demonstration depends on a `spawn`/thread-join primitive that is NOT part of this phase** — it is the one external dependency, called out again under "Out of scope." H3 ships the lock *types* and their guard/dispose machinery tested single-threaded; contention tests wait for threads.

Everything below is written for the full model; each Decision/Codegen entry is tagged with its sub-part.

## The model (recap)

| Form | `b = a` (copy) | `clone a` | `move a` | Sub-part |
|------|---|---|---|---|
| plain `T` | memcpy | ✅ | ✅ | (existing) |
| `owned<T>` | ❌ error | ✅ new alloc | ✅ | H1 |
| `shared<T>` | ✅ retain (refcount++) | ✅ new alloc | ✅ | H2 |
| `atomic shared<T>` | ✅ atomic retain | ✅ new alloc | ✅ | H2 |
| `owned<unique T>` | ❌ | ❌ | ✅ | H1 |
| `shared<unique T>` | ✅ retain | ❌ | ✅ | H2 |
| `mutex<T>` / `rwlock<T>` | (value; not an indirection — `.lock()`/`.read()`/`.write()` → guard) | — | ✅ | H3 |
| `sync<T>` = `atomic shared<mutex<T>>` · `rwsync<T>` = `atomic shared<rwlock<T>>` | (alias) | — | — | H4 |

Unified rule: **`owned` and `shared` differ only in the copy row** — `owned` errors, `shared` retains. Both are cloneable *iff* `T` is cloneable, both movable. `atomic` is a modifier on `shared` (atomic refcount). `unique` inner `T` drops the clone capability from either.

## Goal

Introduce the full indirection model for record fields and function parameters. Allocation via the `new` operator settled in Phase F; heap allocation aborts on OOM by default, with the opt-in `new x as result` routing Phase C's `AllocError`. Auto-deref in member access and method calls means user code reads as if the value were inline, regardless of indirection kind. Disposal: `owned<T>` frees at scope exit; `shared<T>`/`atomic shared<T>` decrement the refcount and free at zero; `mutex`/`rwlock` guards unlock at scope exit. Field disposal cascades in every case.

## Acceptance shapes

**H1 — owned (single-owner), the original acceptance program:**

```delta
type Payload = { count: int64; stride: int64; };
type OwnedCounter = { payload: owned<Payload>; };

export function makeOwnedCounter(count: int64, stride: int64): OwnedCounter | AllocError {
    const p = new Payload { count: count, stride: stride } as result;
    check result { return error as AllocError { }; }
    return OwnedCounter { payload: p };
}

export function (bc: &OwnedCounter) total(): int64 {
    return bc.payload.count + bc.payload.stride;          // owned auto-deref
}
export function (bc: edit &OwnedCounter) step(): void | OverflowError {
    bc.payload.count = bc.payload.count + bc.payload.stride as result;
    check result { return error as OverflowError { }; }
    return;
}
```

**H2 — shared (refcount, mutable-through-shared):**

```delta
type Node = { label: int64; };
type Graph = { root: shared<Node>; alias: shared<Node>; };   // two owners, one Node

export function diamond(): Graph | AllocError {
    const n = shared(new Node { label: 7 }) as result;       // refcount 1
    check result { return error as AllocError { }; }
    return Graph { root: n, alias: n };                      // b = a → retain, refcount 2
}
// mutation through one handle is visible through the other (Model A):
export function (g: edit &Graph) bump() { g.root.label = g.root.label + 1; }
// g.alias.label now also reflects the bump.
```

**H3 — mutex guard:**

```delta
type Counter = { value: int64; };
export function (m: &mutex<Counter>) incr() {
    const guard = m.lock();          // guard : unique; holds the lock
    guard.value = guard.value + 1;   // auto-deref through guard
}                                    // guard disposed → unlock (RAII, all paths)
```

**H4 — sync sugar:** `sync<Counter>` behaves as `atomic shared<mutex<Counter>>` with the same `.lock()` guard.

## In-scope language surface

**H1 — `owned<T>`**
- `owned<T>` parameter and field types; `new T { ... }` / `new value` / `new move x` allocation (bare aborts on OOM; `as result` yields `owned<T> | AllocError`).
- Auto-deref for `.field`, `.method()`, references. Scope-exit dispose frees the allocation and cascades field drops. Move transfers the pointer; clone recursively reallocates. Move-only (never copyable).

**H2 — `shared<T>` / `atomic shared<T>`**
- `shared<T>` and `atomic shared<T>` parameter and field types. `shared(new ...)` (or `new ...` typed into a `shared<T>` position) allocates a refcounted block, refcount 1.
- **Copyable via retain**: `b = a` increments the refcount and aliases (Model A — mutation through one handle is visible through all). `edit &shared<T>` is permitted (mutable-through-shared).
- `move` transfers without touching the count (source suppressed); `clone` deep-copies into a fresh block at refcount 1.
- Scope exit / overwrite / field drop → release (decrement, free + drop contents at zero).
- `atomic` modifier selects atomic (C11) refcount ops; identical surface otherwise. Only valid on `shared` (`owned` has no refcount).
- `shared<unique T>` legal: copyable (retain), non-cloneable, move-only-on-content; the `unique` type's `dispose()` runs when the refcount hits zero (dynamic disposal — the shared-fd / pooled-connection pattern).

**H3 — `mutex<T>` / `rwlock<T>`**
- `mutex<T>` / `rwlock<T>` parameter and field types (value types embedding a pthreads lock + `T`).
- `.lock()` on `mutex<T>` → a `unique` guard granting `edit` access to `T`, unlocking on dispose. `.with(fn)` scoped form.
- `.read()` (shared) / `.write()` (exclusive) on `rwlock<T>` → read-guard (`&T`) / write-guard (`edit &T`).
- Guards are `unique` (move-only) so they can't be aliased or leaked past the critical section.

**H4 — sugar**
- `sync<T>` and `rwsync<T>` resolve, in the analyzer, to `atomic shared<mutex<T>>` / `atomic shared<rwlock<T>>`. Transparent — no distinct runtime, no distinct AST node beyond the alias expansion.

## Explicitly out of scope for Phase H

| Feature | Reason | Eventual home |
|---|---|---|
| **`spawn` / thread creation + join** | This phase ships the *thread-safe types* (atomic refcount, locks) but not the concurrency primitive that runs code on another thread. Locks/atomics are tested single-threaded until this lands. | Next concurrency phase. |
| `weak<T>` (non-owning reference) | `shared`/`atomic shared` leak on cycles; the cycle-breaker is deferred. | Post-v0.5. |
| `Send`/`Sync`-style static data-race prevention | Model A accepts "memory-safe, not data-race-free." Fearless-concurrency markers are a separate subsystem. | Post-v0.5. |
| `owned<T>` / `shared<T>` as a top-level local binding type | Spec MVP: parameter and field only. Wrap into a record field for v0.5. | Post-v0.5. |
| Tagged unions for the recursive tree / optional-link pattern | Out of v0.5 entirely. | Post-v0.5. |
| Custom allocator hooks (`new x in <allocator>`), arenas, free-lists | Uses libc `malloc`/`free` directly. | Far post-v0.5. |
| Custom `dispose()` on an owning record (beyond `unique type`) | Custom cleanup requires `unique type`. Indirection fields still get automatic disposal via the derived drop. | Post-v0.5 classes. |

## What's missing today

After Phase F:
- No `owned` / `shared` / `mutex` / `rwlock` / `sync` / `rwsync` keywords or the `atomic` type modifier. (`new` is reserved/parsed from Phase F but produces no indirection typing or lowering.)
- No `OwnedType` / `SharedType` (with atomic flag) / `MutexType` / `RwlockType` AST nodes; `NewExpression` parses but isn't type-checked or lowered.
- Codegen has no notion of pointer-to-owned-allocation, no refcount control block, no retain/release insertion pass, no lock embedding.
- The disposal pass handles inline value types only — no free-the-allocation, no release, no unlock.
- The clone derivation is straight-line copies; no recursive owned/shared clone.
- The tier resolver has no "copyable-via-retain" tier for `shared`.
- No pthreads / C11-atomics linkage or runtime headers.

## Decisions

### H1 — owned
1. **`owned<T>` lowers to `T*`.** Owned pointer to a malloc'd `T`, non-null by construction (alloc failure aborts or routes `AllocError`).
2. **Aborts on OOM by default.** `new x` yields `owned<T>` and aborts on failure; `new x as result` yields `owned<T> | AllocError`. Shared internally-fallible helper; only call-site lowering differs.
3. **Auto-deref realized in codegen.** `x.field` with `x : owned<T>` → `x->field`; effective member-access type is `T`.
4. **Move-only even if `T` is copyable.** Copying the pointer would alias ownership → double-free. Phase F's move-state lattice handles it.
5. **`clone` is recursive** — fresh allocation + recursive clone of the pointee; transactional cleanup on mid-clone failure.
6. **References**: `&owned<T>` → `T* const *`; member access auto-derefs both levels (`(*bp)->field`). Capability checks compose.
7. **Drop helper** `delta_rt_owned_dispose_<T>(T* p)` — drop contents then `free`.
8. **Alloc helper** `delta_rt_owned_alloc_<T>(T value)` — fallible malloc + init:
   ```c
   static delta_result_owned_<T> delta_rt_owned_alloc_<T>(<T> value) {
       <T>* p = (<T>*)malloc(sizeof(<T>));
       if (!p) return (delta_result_owned_<T>){ .tag = ALLOC_KIND + 1 };
       *p = value;
       return (delta_result_owned_<T>){ .tag = 0, .value = p };
   }
   ```
9. **`AllocError` is the only failure mode.** Stable discriminant, predeclared from Phase C.
10. **Disposal pass**: `Live` owned binding at scope exit → `delta_rt_owned_dispose_<T>(x)`; `Moved` → skip; LIFO.
11. **Field cascade**: record drop frees `owned<T>` fields after the field-by-field pass.

### H2 — shared / atomic shared
12. **`shared<T>` lowers to a pointer to a control block** `delta_shared_<T> { size_t rc; T value; }`. The `shared<T>` value is `delta_shared_<T>*`; auto-deref goes through `->value` (`x.field` → `x->value.field`). Alloc sets `rc = 1`.
13. **Copyable-via-retain — a new tier.** The tier resolver gains a "shared" tier: not move-only (unlike `owned`), not memcpy-copyable (unlike plain `T`) — copy emits a **retain**. A record containing a `shared<T>` field stays copyable (its copy retains each shared field). This is the crux difference from `owned`.
14. **Refcount-insertion pass.** Codegen inserts:
    - **retain** (`++rc`) at each copy point: `let b = a`, pass-by-value argument, store into a field, and function return that copies a live `shared` binding.
    - **release** (`--rc; if (rc==0) { drop(&value); free(block); }`) at scope exit, at overwrite of a `shared` binding, and for temporaries.
    - **move suppression**: a `move`d source is not retained at the move and not released at its original scope (transfers the existing count).
    This mirrors Swift ARC / C++ `shared_ptr`. Ordering and double-release safety follow the move-state lattice from Phase F.
15. **Model A — mutable-through-shared.** `edit &shared<T>` is allowed; `shared<T>` does **not** grant static exclusivity. Accepted consequence: aliasing bugs (iterator invalidation, re-entrancy) are possible and uncaught; Delta guarantees memory safety, **not** data-race freedom. Documented non-guarantee.
16. **`atomic shared<T>`** uses the same layout with `_Atomic size_t rc`. Retain: `atomic_fetch_add(&rc, 1, memory_order_relaxed)`. Release: `if (atomic_fetch_sub(&rc, 1, memory_order_acq_rel) == 1) { atomic_thread_fence(memory_order_acquire); drop(&value); free(block); }` — the standard Arc pattern. The `atomic` modifier selects the atomic helper set; nothing else changes.
17. **CRITICAL — atomic refcount protects the count, not the data.** `atomic shared<T>` makes retain/release/free race-free across threads but concurrent mutation of `value` is still a data race (→ UB) unless guarded by H3's lock. This is why `sync<T>` = `atomic shared<mutex<T>>`.
18. **`clone` of `shared<T>`** deep-copies into a fresh block at `rc = 1` (not a retain — retain is `b = a`). Recursive + transactional, as H1.
19. **`shared<unique T>`**: copyable (retain), non-cloneable (inner `unique` is non-cloneable). Release at `rc == 0` calls the unique type's `dispose()` instead of the plain drop → **dynamic disposal**.
20. **Helpers** (per `T`, gated): `delta_rt_shared_alloc_<T>`, `delta_rt_shared_retain_<T>`, `delta_rt_shared_release_<T>`, and the `atomic` variants `delta_rt_atomic_shared_{alloc,retain,release}_<T>`.

### H3 — mutex / rwlock
21. **`mutex<T>` lowers to** `delta_mutex_<T> { pthread_mutex_t m; T value; }` (value type — embedded, not heap-indirected on its own; it's usually a field, or wrapped by `shared`/`atomic shared`). `rwlock<T>` → `pthread_rwlock_t`.
22. **`.lock()` returns a `unique` guard** `delta_mutex_guard_<T> { delta_mutex_<T>* owner; }`. Construction locks (`pthread_mutex_lock`); the guard auto-derefs to `value` with `edit` capability; the guard's `dispose()` unlocks (`pthread_mutex_unlock`). Being `unique`, it cannot be copied, and scope-exit dispose guarantees unlock on **every** path (early return, error propagation) via the existing disposal machinery.
23. **`.with(fn)`** lowers to `lock; fn(&value); unlock;` — the guard cannot escape the closure. Offered alongside `.lock()`.
24. **`rwlock<T>`**: `.read()` → read-guard granting `&T` (shared, `pthread_rwlock_rdlock`); `.write()` → write-guard granting `edit &T` (`pthread_rwlock_wrlock`). Both unlock on dispose.
25. **Single-threaded validity.** Lock/unlock are correct (uncontended) without a thread runtime, so H3 is testable now; contention behavior awaits `spawn`.
26. **pthreads linkage.** The toolchain links `-lpthread`; a runtime header declares the lock helpers. (macOS/Linux both provide pthreads; Windows is post-v0.5.)

### H4 — sugar
27. **`sync<T>` / `rwsync<T>` are transparent aliases** resolved during type resolution to `atomic shared<mutex<T>>` / `atomic shared<rwlock<T>>`. No new AST node survives past resolution, no new runtime. Kept as sugar (not primitives) so the composable grid — `atomic shared<T>` with no lock, `atomic shared<rwlock<T>>`, bare `mutex<T>` in an owned struct — stays expressible.

## Tokenizer changes

- New reserved keywords: `owned`, `shared`, `mutex`, `rwlock`, `sync`, `rwsync`, and the type modifier `atomic`. (`new` already reserved from Phase F.)

## Parser changes

- `OwnedType { Inner; Position }`, `SharedType { Inner; Atomic bool; Position }` (the `atomic` modifier sets `Atomic`), `MutexType { Inner; Position }`, `RwlockType { Inner; Position }` — all in parameter/field positions, angle-bracket form like `Array<T>`.
- `sync<T>` / `rwsync<T>` parse as their own surface nodes but the analyzer rewrites them to `SharedType{Atomic:true, Inner: MutexType/RwlockType}` immediately (alias expansion); nothing downstream sees them.
- `atomic shared<T>` parses `atomic` as a leading type-modifier keyword bound to the following `shared<...>`. `atomic` on anything but `shared` is a parse/semantic error ("`atomic` modifies `shared` only").
- Allocation still reuses Phase F's `NewExpression`; no new allocation node. The target type (owned/shared/atomic shared) is determined by the binding/field/parameter type the `new` flows into, or by an explicit `shared(...)` / `owned(...)` constructor form.
- Rejections: indirection types in local-binding position (post-v0.5); returning a bare indirection type from a function (left out of MVP for simplicity; wrap in a record).

## Semantic analyzer changes

- **Placement enforcement** for every indirection type (parameter/field only).
- **`new`-expression typing**: operand type `T` → the indirection type of the target position (`owned<T>` / `shared<T>` / `atomic shared<T>`). Bare aborts; `as result` yields `<indirection> | AllocError`.
- **Alias expansion**: `sync<T>` → `atomic shared<mutex<T>>`, `rwsync<T>` → `atomic shared<rwlock<T>>`, before tier/typing.
- **Auto-deref** in member access and receiver-method calls: unwrap `owned`/`shared`/`atomic shared` once; unwrap a lock **guard** once. Composes for `&owned<T>` etc.
- **Tier resolver** gains the **shared tier** (copyable-via-retain): `owned<T>` move-only; `shared<T>`/`atomic shared<T>` copyable-via-retain; a record's tier is the join over its fields (any `owned` field ⇒ at least cloneable; any `unique` field ⇒ unique; `shared` fields keep it copyable). `mutex`/`rwlock`/guard types are move-only.
- **Clone derivation**: `owned<T>` / `shared<T>` fields require `T` cloneable and allocate on clone (bare aborts, `as result` surfaces `AllocError`); `shared<unique T>` / lock types are non-cloneable.
- **Model-A mutation**: `edit &` through `shared`/`atomic shared` is allowed (no exclusivity claim); through a `mutex`/`rwlock` guard the capability is whatever the guard grants.
- **Disposal scheduling**: extend per-binding disposal entries with a kind tag `{ Owned | Shared | AtomicShared | Guard }` so the emitter picks the right teardown (dispose-free / release / atomic-release / unlock).
- **Refcount-insertion analysis (H2)**: mark each `shared`-typed copy point (retain) and drop point (release) on the move-state graph; suppress on `move`.

## Codegen changes

- **Type mapping**: `owned<T>` → `T*`; `shared<T>`/`atomic shared<T>` → `delta_shared_<T>*`; `mutex<T>`/`rwlock<T>` → the embedded-lock struct; guards → the guard struct.
- **Per-type helpers, gated to those used:**
  - owned: `delta_rt_owned_alloc_<T>`, `delta_rt_owned_dispose_<T>`.
  - shared: `delta_rt_shared_{alloc,retain,release}_<T>` (+ `atomic_shared` variants using C11 atomics per Decision 16).
  - locks: `delta_rt_mutex_{lock,unlock}_<T>`, `delta_rt_rwlock_{rdlock,wrlock,unlock}_<T>`, and guard constructors/disposers.
- **`new`-expression lowering**: owned → `delta_rt_owned_alloc_<T>`; shared/atomic-shared → the corresponding `*_alloc` producing an `rc=1` block. Bare aborts on the error tag; `as result` propagates.
- **Retain/release insertion (H2)**: emit `*_retain` at analyzer-marked copy points and `*_release` at drop points; skip retained-then-moved sources. Atomic variant for `atomic shared`.
- **Auto-deref lowering**: owned `x->field`; shared `x->value.field`; guard `x.owner->value.field`. Receiver-method calls pass the already-pointer receiver.
- **Lock lowering (H3)**: `.lock()` → construct guard (`pthread_mutex_lock`); guard dispose → `pthread_mutex_unlock`; `.with(fn)` → inline lock/call/unlock. rwlock read/write analogously.
- **Disposal lowering**: owned → dispose+free; shared → release; atomic shared → atomic release; guard → unlock. `Moved` → skip.
- **Record drop / clone extensions**: cascade release/dispose per field kind in reverse declaration order; clone reallocates owned/shared fields with transactional cleanup.
- **Toolchain**: link `-lpthread`; emit `<stdatomic.h>` / `<pthread.h>` includes when the respective helpers are used.

## Lowered codegen examples

Illustrative C for each sub-part. Module prefix `delta__m__` stands for the mangled module path; `DELTA_ALLOC_ERR` is `AllocError`'s stable discriminant. Helpers are gated — only those actually used are emitted. `->` never appears in Delta source; it is codegen realizing auto-deref.

### H1 — `owned<T>`

```delta
type Payload = { count: int64; stride: int64; };
type OwnedCounter = { payload: owned<Payload>; };

export function makeOwnedCounter(count: int64, stride: int64): OwnedCounter | AllocError {
    const p = new Payload { count: count, stride: stride } as result;
    check result { return error as AllocError { }; }
    return OwnedCounter { payload: p };
}
export function (bc: &OwnedCounter) total(): int64 {
    return bc.payload.count + bc.payload.stride;
}
```

```c
typedef struct { int64_t count; int64_t stride; } delta__m__Payload;
typedef struct { delta__m__Payload* payload; } delta__m__OwnedCounter;

typedef struct { int32_t tag; delta__m__Payload* value; } delta_result_owned__m__Payload;

static delta_result_owned__m__Payload delta_rt_owned_alloc__m__Payload(delta__m__Payload value) {
    delta__m__Payload* p = (delta__m__Payload*)malloc(sizeof(delta__m__Payload));
    if (!p) return (delta_result_owned__m__Payload){ .tag = DELTA_ALLOC_ERR };
    *p = value;
    return (delta_result_owned__m__Payload){ .tag = 0, .value = p };
}
static void delta_rt_owned_dispose__m__Payload(delta__m__Payload* p) {
    delta__m__Payload_drop(p);   /* plain record: empty body, still emitted */
    free(p);
}

delta_result__m__OwnedCounter delta__m__makeOwnedCounter(int64_t count, int64_t stride) {
    delta_result_owned__m__Payload _r =
        delta_rt_owned_alloc__m__Payload((delta__m__Payload){ .count = count, .stride = stride });
    if (_r.tag != 0)                                   /* check result → forward */
        return (delta_result__m__OwnedCounter){ .tag = DELTA_ALLOC_ERR };
    return (delta_result__m__OwnedCounter){ .tag = 0,
        .value = (delta__m__OwnedCounter){ .payload = _r.value } };
}

int64_t delta__m__OwnedCounter_total(const delta__m__OwnedCounter* bc) {
    return bc->payload->count + bc->payload->stride;   /* owned auto-deref: -> */
}

/* record drop cascade: frees the owned field */
static void delta__m__OwnedCounter_drop(delta__m__OwnedCounter* v) {
    delta_rt_owned_dispose__m__Payload(v->payload);
}
```

### H2 — `shared<T>` (retain/release + Model-A aliasing)

```delta
type Node = { label: int64; };
type Graph = { root: shared<Node>; alias: shared<Node>; };

export function diamond(): Graph | AllocError {
    const n = shared(new Node { label: 7 }) as result;   // rc = 1
    check result { return error as AllocError { }; }
    return Graph { root: n, alias: n };                  // each field copy → retain
}
export function (g: edit &Graph) bump() { g.root.label = g.root.label + 1; }
```

```c
typedef struct { int64_t label; } delta__m__Node;
typedef struct { size_t rc; delta__m__Node value; } delta_shared__m__Node;   /* control block */
typedef struct { delta_shared__m__Node* root; delta_shared__m__Node* alias; } delta__m__Graph;

static delta_result_shared__m__Node delta_rt_shared_alloc__m__Node(delta__m__Node value) {
    delta_shared__m__Node* b = (delta_shared__m__Node*)malloc(sizeof(delta_shared__m__Node));
    if (!b) return (delta_result_shared__m__Node){ .tag = DELTA_ALLOC_ERR };
    b->rc = 1; b->value = value;
    return (delta_result_shared__m__Node){ .tag = 0, .value = b };
}
static inline delta_shared__m__Node* delta_rt_shared_retain__m__Node(delta_shared__m__Node* b) {
    b->rc += 1;                                          /* non-atomic */
    return b;
}
static void delta_rt_shared_release__m__Node(delta_shared__m__Node* b) {
    if (--b->rc == 0) { delta__m__Node_drop(&b->value); free(b); }
}

delta_result__m__Graph delta__m__diamond(void) {
    delta_result_shared__m__Node _r =
        delta_rt_shared_alloc__m__Node((delta__m__Node){ .label = 7 });     /* rc = 1 */
    if (_r.tag != 0) return (delta_result__m__Graph){ .tag = DELTA_ALLOC_ERR };
    delta_shared__m__Node* n = _r.value;

    /* `n` copied into two fields → two retains; local `n` released at scope exit */
    delta__m__Graph g = {
        .root  = delta_rt_shared_retain__m__Node(n),    /* rc = 2 */
        .alias = delta_rt_shared_retain__m__Node(n),    /* rc = 3 */
    };
    delta_rt_shared_release__m__Node(n);                /* local n dies:  rc = 2 */
    return (delta_result__m__Graph){ .tag = 0, .value = g };
}

/* Model A: mutation through one handle is visible through the other alias */
void delta__m__Graph_bump(delta__m__Graph* g) {
    g->root->value.label = g->root->value.label + 1;    /* shared auto-deref: ->value. */
}

static void delta__m__Graph_drop(delta__m__Graph* v) {  /* release both, reverse decl order */
    delta_rt_shared_release__m__Node(v->alias);
    delta_rt_shared_release__m__Node(v->root);
}
```

### H2 — `atomic shared<T>` (only the helpers differ)

```c
typedef struct { _Atomic size_t rc; delta__m__Node value; } delta_atomic_shared__m__Node;

static inline delta_atomic_shared__m__Node*
delta_rt_atomic_shared_retain__m__Node(delta_atomic_shared__m__Node* b) {
    atomic_fetch_add_explicit(&b->rc, 1, memory_order_relaxed);
    return b;
}
static void delta_rt_atomic_shared_release__m__Node(delta_atomic_shared__m__Node* b) {
    if (atomic_fetch_sub_explicit(&b->rc, 1, memory_order_acq_rel) == 1) {
        atomic_thread_fence(memory_order_acquire);      /* standard Arc pattern */
        delta__m__Node_drop(&b->value);
        free(b);
    }
}
```

### H2 — `shared<unique T>` (dynamic disposal)

Release at `rc == 0` runs the user-defined `dispose()` (e.g. `close(fd)`), not a plain field drop — the shared-fd / pooled-connection pattern:

```c
static void delta_rt_shared_release__m__File(delta_shared__m__File* b) {
    if (--b->rc == 0) {
        delta__m__File_dispose(&b->value);   /* user dispose(), fires when last owner drops */
        free(b);
    }
}
```

### H3 — `mutex<T>` (guard is a `unique` with dispose = unlock)

```delta
type Counter = { value: int64; };
export function (m: &mutex<Counter>) incr() {
    const guard = m.lock();
    guard.value = guard.value + 1;
}
```

```c
typedef struct { int64_t value; } delta__m__Counter;
typedef struct { pthread_mutex_t m; delta__m__Counter value; } delta_mutex__m__Counter;
typedef struct { delta_mutex__m__Counter* owner; } delta_mutex_guard__m__Counter;   /* unique */

static delta_mutex_guard__m__Counter delta_rt_mutex_lock__m__Counter(delta_mutex__m__Counter* m) {
    pthread_mutex_lock(&m->m);
    return (delta_mutex_guard__m__Counter){ .owner = m };
}
static void delta_rt_mutex_guard_dispose__m__Counter(delta_mutex_guard__m__Counter* g) {
    pthread_mutex_unlock(&g->owner->m);
}

void delta__m__mutex_Counter_incr(const delta_mutex__m__Counter* m) {
    /* the lock is interior-mutable: a `&` receiver may still lock, because the
       reference capability governs the DATA, while the lock protects it. */
    delta_mutex_guard__m__Counter guard =
        delta_rt_mutex_lock__m__Counter((delta_mutex__m__Counter*)m);

    guard.owner->value.value = guard.owner->value.value + 1;   /* auto-deref through guard */

    delta_rt_mutex_guard_dispose__m__Counter(&guard);          /* scope exit → unlock (all paths) */
}
```

The `.with(closure)` form skips the materialized guard and inlines lock/body/unlock:

```c
{
    pthread_mutex_lock(&m->m);
    delta__m__Counter* c = &m->value;
    c->value = c->value + 1;        /* closure body inlined */
    pthread_mutex_unlock(&m->m);
}
```

### H4 — `sync<T>` (alias, no new runtime)

`sync<Counter>` resolves to `atomic shared<mutex<Counter>>` before lowering; the composed representation is just the two wrappers nested:

```c
typedef struct { pthread_mutex_t m; delta__m__Counter value; } delta_mutex__m__Counter;
typedef struct { _Atomic size_t rc; delta_mutex__m__Counter value; }
    delta_atomic_shared__m__mutex__m__Counter;

/* sync<Counter>  ==  delta_atomic_shared__m__mutex__m__Counter*
   - b = a         → atomic retain on rc
   - .lock()       → pthread_mutex_lock on the inner mutex, returns the guard
   - last release  → unlock-safe free of the whole block                        */
```

## Testing strategy

Fixtures under `test-source/tests/codegen/indirection/`, grouped by sub-part.

**H1 — owned (mirrors the prior suite):** `owned_field_ok`, `owned_param_ok`, `owned_local_err`, `owned_alloc_failure_propagation_ok`; auto-deref read/write/method; `owned_dispose_at_scope_exit_ok`, `owned_dispose_skipped_after_move_ok`, `owned_field_dispose_in_record_drop_ok`; `ref_owned_field_read_ok`, `edit_ref_owned_edit_method_ok`; `clone_record_with_owned_field_ok`, `clone_transactional_cleanup_ok`.

**H2 — shared / atomic shared:**
- `shared_field_ok`, `shared_alias_retain_ok` (snapshot: `b = a` emits retain; two owners), `shared_release_at_zero_ok` (last release frees + drops), `shared_release_skipped_after_move_ok`.
- `shared_mutation_visible_through_alias_ok` (Model A: bump via one handle, read via other).
- `atomic_shared_uses_atomic_ops_ok` (snapshot: `atomic_fetch_add/sub` emitted).
- `shared_unique_dynamic_dispose_ok` (dispose runs at refcount zero, not scope exit).
- `clone_shared_is_deep_ok` (clone → new block rc=1, independent).

**H3 — mutex / rwlock (single-threaded):**
- `mutex_lock_guard_unlocks_ok` (snapshot: lock on `.lock()`, unlock on guard dispose).
- `mutex_guard_unlocks_on_early_return_ok` (all-paths unlock).
- `mutex_with_closure_ok`. `rwlock_read_write_guards_ok`. `guard_is_move_only_err` (can't copy a guard).

**H4 — sugar:** `sync_expands_to_atomic_shared_mutex_ok`, `rwsync_expands_ok` (snapshot: resolved type + lowering equals the desugared form).

**Concurrency (deferred marker):** `contended_*` fixtures are listed but skipped/`ignore`d until the `spawn` primitive lands; a comment ties each to its future thread test.

All earlier-phase fixtures continue to pass.

## Stage-by-stage implementation order

**H1 — owned** (self-contained; can ship independently)
1. Tokenizer: `owned`.
2. Parser: `OwnedType`; placement rejections.
3–7. Analyzer: placement, `new` typing, auto-deref, move-only tier + clone, reference-through-owned.
8–13. Codegen: alloc/dispose helpers, `new` lowering, auto-deref, referenced-owned deref, disposal + record-drop cascade, clone extension.
14. owned fixtures.

**H2 — shared / atomic shared** (introduces refcounting)
15. Tokenizer: `shared`, `atomic` modifier.
16. Parser: `SharedType{Atomic}`; `atomic`-only-on-`shared` check.
17. Analyzer: shared tier (copyable-via-retain); `new` → shared block typing; `shared<unique T>` rules.
18. Analyzer: **refcount-insertion analysis** (mark retain/release points on the move graph; move suppression).
19. Codegen: control-block layout + `shared_{alloc,retain,release}` (and atomic variants).
20. Codegen: retain/release insertion; shared auto-deref (`->value`); release-based disposal + record-drop cascade; `shared<unique T>` dynamic dispose.
21. Codegen: clone-is-deep for shared.
22. H2 fixtures.

**H3 — mutex / rwlock** (pthreads)
23. Tokenizer: `mutex`, `rwlock`. Parser: `MutexType`/`RwlockType`.
24. Analyzer: lock types + `unique` guard types; `.lock()`/`.read()`/`.write()`/`.with()` typing; guard auto-deref + capability.
25. Codegen: embedded-lock structs; guard construct/dispose → lock/unlock; `.with` inline; pthreads linkage.
26. H3 fixtures (single-threaded).

**H4 — sugar**
27. Tokenizer: `sync`, `rwsync`. Parser + analyzer: alias expansion to `atomic shared<mutex/rwlock<T>>`.
28. H4 fixtures.

H1's analyzer work (steps 3–7) is small; the heavy new surfaces are H2's refcount-insertion pass (18, 20) and H3's guard/pthreads lowering (24–25).

## Risks and open questions

- **Refcount-insertion correctness is the central risk.** Retain/release must be balanced on every control-flow path, interact correctly with `move` suppression and early returns/error propagation, and not double-release after a partial move. Recommend building it directly on Phase F's move-state lattice and snapshot-testing the emitted retain/release positions heavily.
- **Threading dependency.** `atomic shared`, `mutex`, `rwlock`, `sync` are shipped as types + single-threaded-correct lowering, but their *raison d'être* (contended concurrent use) can't be demonstrated until a `spawn`/join primitive exists. Decide whether to pull a minimal thread primitive into v0.5 or accept that these types ship "correct but only exercised single-threaded" until the concurrency phase. **This is the biggest scope question the expansion raises.**
- **Cycles leak (no `weak<T>`).** `shared`/`atomic shared` cycles never free. Documented; `weak<T>` deferred. A shared-heavy self-hosting compiler will hit this — flag prominently in user docs.
- **Model-A aliasing bugs are uncaught by design.** `edit &` through `shared` permits iterator-invalidation / re-entrancy. Accepted (memory-safe, not race-free); worth a lint later.
- **Allocator failure simulation.** As before — structural snapshots for the failure paths in v0.5; runtime fault injection post-v0.5.
- **Returning a bare indirection from a function.** Out of MVP; wrap in a record. Easy to add later (just a pointer return).
- **Self-referential fields.** `next: owned<Node>` / `shared<Node>` pass the fixed-size check; without tagged unions there's no "no next" terminator. Language-surface limitation, not a Phase H one.
- **Auto-deref vs explicit `->`.** Users never write `->`; codegen emits it. Consistent across owned/shared/guard.
- **Reference exclusivity through indirection.** For `owned`, the exclusivity root is the enclosing binding (`bc` in `bc.payload`). For `shared`, Model A means exclusivity is *not* claimed — two `edit &` through shared aliases is permitted (that's the accepted hole). Guard access is exclusive by the lock, not the static checker.
- **Performance.** Every op is `malloc`/`free` (+ refcount traffic for shared, + lock cost for guards). No arenas/optimization in v0.5.

## Definition of done

- **H1**: OwnedCounter program compiles/runs; owned fixtures pass; disposal cascade + independent clone verified.
- **H2**: shared diamond program compiles/runs; retain/release balanced (snapshot-verified); Model-A alias mutation visible; `atomic shared` emits C11 atomics; `shared<unique T>` disposes at refcount zero; deep clone verified.
- **H3**: mutex/rwlock guard programs compile/run single-threaded; guards unlock on all paths; guards are move-only.
- **H4**: `sync`/`rwsync` resolve to their desugared forms (snapshot-verified equal lowering).
- Generated C uses libc `malloc`/`free`, C11 `<stdatomic.h>`, and `<pthread.h>` only through the `delta_rt_*` helpers; no raw calls in user-emitted paths.
- All earlier-phase fixtures continue to pass.
- **v0.5 acceptance**: the full program from [compiler-goal-v0.5.md](../../compiler-goal-v0.5.md) compiles, runs, and meets all success criteria. **Caveat:** the concurrency demonstration for the thread-safe types is gated on the `spawn` primitive (out of scope here) — record as the one known limitation carried past Phase H.
