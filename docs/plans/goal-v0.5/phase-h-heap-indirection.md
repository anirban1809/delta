# Plan: Phase H — `heap T` Indirection (v0.5b final)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phases through **G** landed.
Successor: None — Phase H closes v0.5. After Phase H, the full goal from [compiler-goal-v0.5.md](../../compiler-goal-v0.5.md) is reached.
Spec basis: [spec-sections/08-type-declarations.md](../../spec-sections/08-type-declarations.md) §8 (heap fields), [spec-sections/09-classes.md](../../spec-sections/09-classes.md), [spec-sections/13-memory-safety-model.md](../../spec-sections/13-memory-safety-model.md).

## Goal

Introduce `heap T` as a single-owner owning-indirection type for class fields and function parameters. Heap allocation is fallible (returns through Phase C's `AllocError`). Auto-deref in member access and method calls means user code reads as if the value were inline. Owner disposal frees the allocation at scope exit; field disposal cascades. No reference counting.

After Phase H, recursive class fields and large-value boxing are possible, and the full v0.5 acceptance program from the goal doc compiles and passes every success criterion:

```delta
class Tree {
    public value: int64;
    public left:  heap Tree | NoChild;   // not in v0.5; see "out of scope"
    public right: heap Tree | NoChild;
}
```

Caveat: the above sketch uses tagged unions, which are out of scope for v0.5. Phase H's actual demonstrable use case is a class with a single `heap` field of a different class type — see "Acceptance shape" below.

## Acceptance shape for Phase H

Since tagged unions are out of v0.5, the demonstrable Phase H program is more modest. A counter wrapping a boxed payload:

```delta
class Payload {
    public count: int64;
    public stride: int64;
}

class BoxedCounter {
    private payload: heap Payload;

    public static new(count: int64, stride: int64): BoxedCounter | AllocError {
        const p = heap Payload { count: count, stride: stride } as result;
        check result {
            return error as AllocError { };
        }
        return BoxedCounter { payload: p };
    }

    public total(): int64 {
        return this.payload.count + this.payload.stride;
    }

    public edit step(): void | OverflowError {
        this.payload.count = this.payload.count + this.payload.stride as result;
        check result {
            return error as OverflowError { };
        }
        return;
    }
}

function main(): int32 {
    let bc = BoxedCounter.new(10, 3) as result;
    check result {
        return 1;
    }

    bc.step() as result;
    check result {
        return 2;
    }
    bc.step() as result;
    check result {
        return 2;
    }

    info("total", bc.total());
    return 0;
}
```

This program exercises:
- `heap T` field on a class.
- Heap allocation as a fallible construction (`as result`, `check`).
- Auto-deref of `heap Payload` in `.count`/`.stride` reads and writes.
- Owner disposal: `bc` goes out of scope at `main`'s exit; its field `payload` gets the heap-free path.

## In-scope language surface

- `heap T` parameter and field types.
- Heap allocation via `heap T { ... }` (heap-class-literal form) producing a fallible value: `heap T | AllocError`.
- Auto-deref of `heap T` for `.field` access, `.method()` calls, and binding-typing in `let x: T = ...` only if dereferenced first (the binding type for the heap value itself is `heap T`).
- Disposal: scope-exit dispose for a `heap T`-typed binding frees its allocation, plus runs the underlying type's dispose.
- Class fields of type `heap T` cascade dispose through the class's auto-derived dispose function.
- Single-owner semantics — no reference counting, no shared pointers.
- Move and clone of `heap T`:
  - `move x` on a `heap T` binding transfers the pointer (compile-time only).
  - `clone x` on a `heap T` value allocates fresh storage and recursively clones the pointed-to value; fallible (`AllocError`).
- `&heap T` and `edit &heap T` parameters — the reference points to the heap pointer, auto-deref still works through the reference.

## Explicitly out of scope for Phase H

| Feature | Reason | Eventual home |
|---|---|---|
| `heap T` as a top-level local binding type | Spec MVP says parameter and field only. (A `let x: heap T = ...;` local can be replaced by inlining the value into a class for v0.5.) | Post-v0.5. |
| Reference counting / shared ownership / `Rc<T>` | Single-owner only. | Post-v0.5. |
| Tagged unions for the recursive tree pattern | Tagged unions are out of v0.5 entirely. | Post-v0.5. |
| `Optional<heap T>` / nullable heap pointers | Spec rejects nullability in user code. Without tagged unions, there's no way to express "may not have a payload." | Post-v0.5 (after tagged unions). |
| Custom allocator hooks | Uses `malloc`/`free` from libc directly. | Far post-v0.5. |
| `heap` constructor that takes existing-storage `T` (move-into-heap) | The construction shape is `heap T { ... }` (literal); moving an existing value into the heap is post-v0.5. | Post-v0.5. |

## What's missing today

After Phase G:

- No `heap` keyword.
- No `HeapType` AST node, no heap-class-literal expression form.
- Codegen has no notion of pointer-to-owned-allocation.
- The disposal pass disposes inline value types correctly but has no path for free-the-allocation.
- The clone derivation is straight-line copies; no path for recursive heap clone.
- The reference machinery doesn't auto-deref through `heap T`.

## Decisions

1. **`heap T` lowers to `T*` in C.** Owned pointer to a malloc'd `T`. The pointer is non-null by construction (allocation failure routes through `AllocError`, never produces a null pointer that needs checking).
2. **Heap allocation is fallible.** Every `heap T { ... }` literal returns `heap T | AllocError`. The caller consumes via `as result` + `check`. There is no infallible heap-allocation form in v0.5.
3. **Auto-deref is a Delta-side notion realized in codegen.** When the analyzer sees `x.field` and x's type is `heap T`, the lowered C is `x->field`. The analyzer treats x's *effective member-access type* as `T`, transparently. Methods called through `heap T` work identically.
4. **`heap T` is a move-only type even if `T` is copyable.** Owning an allocation means uniquely owning the pointer; copying the pointer would create aliased ownership and double-free at dispose time. So `let x: heap int32 = ...; let y = x;` is a move at the type level. Phase F's move-state lattice already handles this — the type's "tier" goes from `Live`'s default-cluster to the move-only cluster.
5. **`clone` of `heap T` is recursive.** The auto-derived clone for a class containing `heap Inner` calls `delta_rt_heap_alloc<Inner>` for a new allocation, then recursively clones the pointed-to value. Failure at any step propagates `AllocError` through the transactional cleanup pattern from Phase F.
6. **References through `heap T`.** `&heap T` lowers to `T* const *` (a non-mutable pointer to a non-mutable heap pointer; the indirection levels reflect "reference of a heap pointer"). For ergonomics, member access auto-derefs both levels: `bp.field` lowers to `(*bp)->field`. The capability checks compose: `&heap T` may not call `edit` methods; `edit &heap T` may.
7. **Dispose for `heap T` is a small per-type helper.** `delta_rt_heap_dispose_<T>(T* p)` calls the underlying `delta__<module>__<T>_dispose(p)`, then `free(p)`. Emitted by codegen for every `T` used as `heap T` in the project.
8. **Allocation uses `malloc`.** No custom allocator. The helper `delta_rt_heap_alloc_<T>(T value)` is:
   ```c
   static delta_result_heap_<T> delta_rt_heap_alloc_<T>(<T> value) {
       <T>* p = (<T>*)malloc(sizeof(<T>));
       if (!p) {
           return (delta_result_heap_<T>){ .tag = ALLOC_KIND + 1 };
       }
       *p = value;
       return (delta_result_heap_<T>){ .tag = 0, .value = p };
   }
   ```
9. **`AllocError` is the only failure mode of heap allocation.** Predeclared in the analyzer's primordial scope from Phase C (reserved but unused until Phase H). The error discriminant is stable.
10. **Disposal pass updated.** For a `heap T` binding at scope exit:
    - If move-state is `Live`, emit `delta_rt_heap_dispose_<T>(x);` (which frees the allocation and disposes its contents).
    - If `Moved`, skip (consistent with Phase F).
    - The dispose runs *after* any inner-scope disposes (LIFO per spec).
11. **Field disposal cascade.** A class with a `heap T` field gets its auto-derived dispose function extended: after the field-by-field dispose pass (currently empty bodies), heap fields' allocations are freed.

## Tokenizer changes

- New reserved keyword: `heap`.

## Parser changes

- `HeapType { Inner TypeReference; Position Position }` — appears in parameter and field type positions.
- `HeapClassLiteralExpression { ClassName string; Fields []FieldInitializer; Position Position }` — parsed when a class literal is prefixed with `heap`: `heap Counter { value: 5 }`.
- Rejection: `heap T` in local binding position — "heap-typed locals are post-v0.5; box into a class field instead."
- Rejection: `heap T` in return position — depends; spec allows it; for Phase H's MVP we **do** allow it (a static factory like `BoxedCounter.new` returns `BoxedCounter | AllocError` where the class contains `heap Payload`; the outer return type isn't `heap T` itself but the class). Returning a bare `heap T` from a function is left out for simplicity; the goal program doesn't need it.

## Semantic analyzer changes

- **Recognize `HeapType` in parameter and field positions only.**
- **Heap-class-literal typing.** `heap C { ... }` has type `heap C | AllocError`. The literal must satisfy class C's field-init rules just like a normal class literal.
- **Auto-deref in member access.** When the receiver's type is `heap T`, treat member-access as if the receiver were `T`. Same for method calls. Encode this in the existing member-access typing pass — add a single "if receiver is HeapType, unwrap once" step.
- **Move-state tier for `heap T` is move-only.** Update the copyability resolver from Phase F: `heap T` is never copyable, regardless of `T`. The lattice handles it; no new lattice value.
- **Auto-derived clone updates.** When the analyzer walks a class's fields to decide cloneability, a `heap T` field requires `T` cloneable (or copyable); if so, the class clone is cloneable but the clone call is fallible (always, because the heap allocation may fail).
- **Reference through heap.** A `&heap T` parameter resolves member access by auto-derefing through both indirection levels. Capability check unchanged.
- **Disposal scheduling.** The codegen disposal pass already consumes a per-scope binding list. Extend the list entries with a `IsHeap bool` flag so the emitter picks `delta_rt_heap_dispose_<T>` vs `delta__<module>__<T>_dispose`.

## Codegen changes

- **Type mapping.** `heap T` → `<CType_of_T>*`. Whenever `heap T` appears in a parameter list, field list, or return position, emit the C pointer type.
- **Per-type heap helpers.** Emit two helpers per type used as `heap T` in the project:
  - `delta_rt_heap_alloc_<T>(T value)` — fallible alloc + initialize.
  - `delta_rt_heap_dispose_<T>(T* p)` — dispose contents + free pointer.
  Helpers are gated like Phase A/C: only emit those actually used.
- **Heap-class-literal lowering.** `heap Counter { value: 5 }` lowers to `delta_rt_heap_alloc_Counter((Counter){ .value = 5 })`, which produces a `delta_result_heap_Counter` consumable by `as result` / `check`.
- **Auto-deref lowering.** Member access `x.field` where x is `heap T` → `x->field`. Method call `x.m(args)` → `delta__<module>__<T>_m(x, args)` (x is already a pointer; the receiver-pointer convention is unchanged).
- **Referenced-heap lowering.** `&heap T` → `T* const *`. Access `bp.field` → `(*bp)->field`. The two derefs add nothing at runtime (clang folds).
- **Disposal lowering.** For each `heap T`-typed owned binding at scope exit (state `Live`), emit `delta_rt_heap_dispose_<T>(x);`. For `Moved`, skip.
- **Class dispose extension.** A class with `heap T` fields gets its dispose body extended: per heap field in reverse declaration order, `delta_rt_heap_dispose_<T>(self->field);`. Other fields remain no-op disposes.
- **Clone derivation extension.** Per-class clone walks fields; for each `heap T` field, it recursively clones the pointed-to value (which itself produces a `delta_result_<T>`), then wraps the cloned value in a fresh heap allocation (a second fallible step). Both steps live in the generated clone function as plain `if (tmp.tag != 0) goto cleanup;` guards — no Delta-level `check` block is emitted here because this is the C body of the auto-derived helper. The transactional cleanup pattern from Phase F now matters: if a later field's clone or alloc fails, earlier heap allocations must be freed before returning the propagated error.

## Testing strategy

New fixtures under `test-source/tests/codegen/heap/`:

**Basics (4)**
- `heap_field_ok` — class with one `heap` field; construct via fallible static factory; access through auto-deref.
- `heap_param_ok` — function takes `heap T` by value; auto-deref works; function moves it into another owning binding (or drops it, causing dispose).
- `heap_local_err` — `let x: heap Counter = ...;` rejected with the v0.5 boundary message.
- `heap_alloc_failure_propagation_ok` — simulated alloc failure (use the analyzer's error-injection hook if added; otherwise this fixture is structural — verifies the `check` lowering works) propagates `AllocError`.

**Auto-deref (3)**
- `auto_deref_field_read_ok` — read through heap field.
- `auto_deref_field_write_ok` — write through heap field (`edit` method).
- `auto_deref_method_call_ok` — call a method through a heap field.

**Disposal (3)**
- `heap_dispose_at_scope_exit_ok` — snapshot test asserting `delta_rt_heap_dispose_<T>` appears at scope exit.
- `heap_dispose_skipped_after_move_ok` — moved heap binding doesn't dispose at original scope.
- `heap_field_dispose_in_class_dispose_ok` — class with `heap` field; class instance scope exit triggers cascade.

**References through heap (2)**
- `ref_heap_field_read_ok` — `&heap Payload` argument; read through.
- `edit_ref_heap_edit_method_ok` — `edit &heap Payload`; call an `edit` method.

**Clone (2)**
- `clone_class_with_heap_field_ok` — clone of `BoxedCounter` produces an independent allocation; both originals and clones modifiable independently.
- `clone_transactional_cleanup_ok` — simulated mid-clone failure exercises the cleanup path (synthetic test if real failure injection unavailable; otherwise structural snapshot of the cleanup-emitted C).

All earlier-phase fixtures continue to pass.

## Stage-by-stage implementation order

1. Tokenizer: `heap` keyword.
2. Parser: `HeapType` in parameter/field positions; `HeapClassLiteralExpression`; reject local/forbidden positions.
3. Analyzer: `HeapType` placement enforcement.
4. Analyzer: heap-class-literal typing and the fallible result shape.
5. Analyzer: auto-deref in member access and method call.
6. Analyzer: `heap T` as move-only tier; clone derivation updated.
7. Analyzer: reference-through-heap (member access via `&heap T`).
8. Codegen: per-type `heap_alloc` / `heap_dispose` helpers with gating.
9. Codegen: heap-class-literal lowering through `heap_alloc`.
10. Codegen: auto-deref expansions in member access / method call / field assignment.
11. Codegen: referenced-heap two-level deref lowering.
12. Codegen: disposal pass extended with `IsHeap` per binding; class dispose extended with cascade.
13. Codegen: clone derivation extended for heap fields with transactional cleanup.
14. Fixture suite.

Steps 8–13 are the codegen-heavy ones. The analyzer parts (steps 3–7) are mostly small extensions of existing passes.

## Risks and open questions

- **Allocator failure simulation in tests.** Real `malloc` rarely fails; the failure-path fixtures need either a test-time `malloc` shim or structural snapshots that assert the cleanup C is emitted. Recommendation: ship structural snapshots for v0.5; defer a runtime fault-injection harness to post-v0.5.
- **Returning `heap T` from a function.** Out of scope for Phase H's MVP per "Parser changes." Could be added with little extra work — it's just another C pointer return — but the goal program doesn't need it and skipping it keeps the surface clean. Document as a known limitation.
- **`heap T` of a class with no fields.** Pathological but legal. `heap_alloc` allocates `sizeof(EmptyClass)`, which clang might warn about (`-Wzero-length-array`); empty structs have implementation-defined size in C. v0.5 doesn't ship an empty class anyway; safe to ignore.
- **Self-referential `heap` fields.** A class `Node` with field `next: heap Node` is the natural recursive case. The fixed-size check passes (heap pointers have fixed size). Phase H supports it structurally, but without tagged unions there's no way to express "may not have a next" — the user has to terminate the chain some other way. This is more of a language-surface limitation than a Phase H limitation; tagged unions land post-v0.5.
- **Auto-deref vs explicit `.`-through-pointer.** Delta auto-derefs; the user never writes `->`. This is consistent with the spec (§9 says "instances behave like values regardless of where they're stored"). Codegen emits `->` because C requires it; users never see it.
- **Reference exclusivity through heap.** `f(edit &bc.payload, &bc.payload)` — the root for exclusivity purposes is `bc`. Both reference operands share the root `bc` (the path `bc.payload` derefs the heap pointer but the root is still `bc`). The exclusivity check rejects, correctly. Verified by `reference_field_root_check_ok` from Phase G with the heap variant added.
- **Performance.** Every heap operation is a `malloc`/`free` call. For v0.5 we don't optimize. Bulk-allocated arenas, free-lists, etc., are post-v0.5.

## Definition of done

- The Phase H acceptance shape (BoxedCounter program from "Acceptance shape" above) compiles and runs, printing the expected total.
- All Phase H fixtures pass.
- All earlier-phase fixtures continue to pass.
- Generated C uses `malloc`/`free` through the `delta_rt_heap_*` helpers; no raw `malloc` in user-emitted code paths.
- Disposal pass produces correct cascade through class fields with heap members.
- Clone of a class with heap fields produces an independent allocation, verified by a fixture that mutates the clone and checks the original is untouched.
- **v0.5 is complete.** The full acceptance program from [compiler-goal-v0.5.md](../../compiler-goal-v0.5.md) compiles, runs, and meets all nine success criteria — including the three negative variants (move + capability + exclusivity) and the three visibility/cycle/import variants from Phase I.
