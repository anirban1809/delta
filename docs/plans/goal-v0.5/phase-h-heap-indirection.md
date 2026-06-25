# Plan: Phase H — `heap<T>` Indirection (v0.5b final)

Date drafted: 2026-06-03
Revised: 2026-06-21 — classes dropped (records + receiver methods); type spelled `heap<T>`; allocation via `new`
Status: planning, not started.
Predecessor: Phases through **F** landed (former Phase G — safe references — is now part of Phase F, which also reserves and parses the `new` allocation operator). Records (Phase **K**) and receiver methods (Phase **L**) provide the `type`/method model this phase boxes.
Successor: None — Phase H closes v0.5. After Phase H, the full goal from [compiler-goal-v0.5.md](../../compiler-goal-v0.5.md) is reached.
Spec basis: [spec-sections/08-type-declarations.md](../../spec-sections/08-type-declarations.md) §8 (heap fields on records), [spec-sections/13-memory-safety-model.md](../../spec-sections/13-memory-safety-model.md), [spec-sections/14-ownership-and-move-semantics.md](../../spec-sections/14-ownership-and-move-semantics.md). Receiver-method rules are lifted onto records per Phase L.

## Goal

Introduce `heap<T>` as a single-owner owning-indirection type for record fields and function parameters, allocated with the `new` operator settled in Phase F. Heap allocation aborts the program on out-of-memory by default; the optional `new x as result` form returns through Phase C's `AllocError`. Auto-deref in member access and method calls means user code reads as if the value were inline. Owner disposal frees the allocation at scope exit; field disposal cascades. No reference counting.

After Phase H, recursive record fields and large-value boxing are possible, and the full v0.5 acceptance program from the goal doc compiles and passes every success criterion:

```delta
type Tree = {
    value: int64;
    left:  heap<Tree> | NoChild;   // not in v0.5; see "out of scope"
    right: heap<Tree> | NoChild;
};
```

Caveat: the above sketch uses tagged unions, which are out of scope for v0.5. Phase H's actual demonstrable use case is a record with a single `heap<T>` field of a different record type — see "Acceptance shape" below.

## Acceptance shape for Phase H

Since tagged unions are out of v0.5, the demonstrable Phase H program is more modest. A counter wrapping a boxed payload, expressed as records plus receiver methods:

```delta
type Payload = { count: int64; stride: int64; };

// `BoxedCounter` is unexported; the exported factory is its only constructor,
// recovering the encapsulation a class would have provided (Phase L: records
// are transparent, so privacy comes from module scope + factory functions).
type BoxedCounter = { payload: heap<Payload>; };

export function makeBoxedCounter(count: int64, stride: int64): BoxedCounter | AllocError {
    const p = new Payload { count: count, stride: stride } as result;
    check result {
        return error as AllocError { };
    }
    return BoxedCounter { payload: p };
}

export function (bc: &BoxedCounter) total(): int64 {
    return bc.payload.count + bc.payload.stride;          // heap auto-deref
}

export function (bc: edit &BoxedCounter) step(): void | OverflowError {
    bc.payload.count = bc.payload.count + bc.payload.stride as result;
    check result {
        return error as OverflowError { };
    }
    return;
}

function main(): int32 {
    let bc = makeBoxedCounter(10, 3) as result;
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
- `heap<T>` field on a record.
- Heap allocation with `new`, here using the opt-in `as result` form so the factory can forward `AllocError`.
- Receiver methods (`total`, `step`) on a record that owns a heap field, called with `bc.total()` / `bc.step()` (auto-borrow forms the `&` / `edit &` receiver).
- Auto-deref of `heap<Payload>` in `.count`/`.stride` reads and writes.
- Owner disposal: `bc` goes out of scope at `main`'s exit; its field `payload` gets the heap-free path.

## In-scope language surface

- `heap<T>` parameter and field types.
- Heap allocation via the `new` operator (settled in Phase F): `new T { ... }` for in-place construction, `new value` to box an existing value, and `new move x` to box a non-Copyable binding. Bare `new` aborts on OOM; `new ... as result` yields the `heap<T> | AllocError` carrier.
- Auto-deref of `heap<T>` for `.field` access, `.method()` receiver calls, and binding-typing in `let x: T = ...` only if dereferenced first (the binding type for the heap value itself is `heap<T>`).
- Disposal: scope-exit dispose for a `heap<T>`-typed binding frees its allocation, plus runs the underlying type's auto-derived drop.
- Record fields of type `heap<T>` cascade disposal through the record's auto-derived drop function.
- Single-owner semantics — no reference counting, no shared pointers.
- Move and clone of `heap<T>`:
  - `move x` on a `heap<T>` binding transfers the pointer (compile-time only).
  - `clone x` on a `heap<T>` value allocates fresh storage and recursively clones the pointed-to value; aborts on OOM by default, or surfaces `AllocError` via `clone x as result`.
- `&heap<T>` and `edit &heap<T>` parameters — the reference points to the heap pointer, auto-deref still works through the reference.

## Explicitly out of scope for Phase H

| Feature | Reason | Eventual home |
|---|---|---|
| `heap<T>` as a top-level local binding type | Spec MVP says parameter and field only. (A `let x: heap<T> = ...;` local can be replaced by inlining the value into a record for v0.5.) | Post-v0.5. |
| Reference counting / shared ownership / `Rc<T>` | Single-owner only. | Post-v0.5. |
| Tagged unions for the recursive tree pattern | Tagged unions are out of v0.5 entirely. | Post-v0.5. |
| `Optional<heap<T>>` / nullable heap pointers | Spec rejects nullability in user code. Without tagged unions, there's no way to express "may not have a payload." | Post-v0.5 (after tagged unions). |
| Custom allocator hooks (`new x in <allocator>`) | Uses `malloc`/`free` from libc directly; the default allocator is the only one. | Far post-v0.5. |
| Custom `dispose()` on a heap-owning record | Custom cleanup requires `unique type`, deferred with classes (Phase L). Heap fields still get automatic free via the derived drop. | Post-v0.5 classes. |

## What's missing today

After Phase F:

- No `heap` keyword for the type. (`new` is already reserved and parsed in Phase F, but produces no `heap<T>` typing or lowering yet.)
- No `HeapType` AST node; `NewExpression` parses but is not type-checked or lowered.
- Codegen has no notion of pointer-to-owned-allocation.
- The disposal pass disposes inline value types correctly but has no path for free-the-allocation.
- The clone derivation is straight-line copies; no path for recursive heap clone.
- The reference machinery doesn't auto-deref through `heap<T>`.

## Decisions

1. **`heap<T>` lowers to `T*` in C.** Owned pointer to a malloc'd `T`. The pointer is non-null by construction (allocation failure aborts or routes through `AllocError`, never produces a null pointer that needs checking).
2. **Heap allocation aborts on OOM by default.** `new x` yields a `heap<T>` directly and aborts the program if allocation fails — matching `clone` and every current systems language, none of which expose a routine OOM-handling path. Handling failure is opt-in: `new x as result` yields `heap<T> | AllocError`, consumed via `as result` + `check`. Both forms share one internally-fallible runtime helper (see decision 8); only the call-site lowering differs.
3. **Auto-deref is a Delta-side notion realized in codegen.** When the analyzer sees `x.field` and x's type is `heap<T>`, the lowered C is `x->field`. The analyzer treats x's *effective member-access type* as `T`, transparently. Receiver methods called through `heap<T>` work identically.
4. **`heap<T>` is a move-only type even if `T` is copyable.** Owning an allocation means uniquely owning the pointer; copying the pointer would create aliased ownership and double-free at dispose time. So `let x: heap<int32> = ...; let y = x;` is a move at the type level. Phase F's move-state lattice already handles this — the type's "tier" goes from the default-cluster to the move-only cluster.
5. **`clone` of `heap<T>` is recursive.** The auto-derived clone for a record containing `heap<Inner>` calls `delta_rt_heap_alloc<Inner>` for a new allocation, then recursively clones the pointed-to value. Failure at any step is reported through the transactional cleanup pattern from Phase F; a bare `clone` then aborts, while `clone ... as result` propagates `AllocError`.
6. **References through `heap<T>`.** `&heap<T>` lowers to `T* const *` (a non-mutable pointer to a non-mutable heap pointer; the indirection levels reflect "reference of a heap pointer"). For ergonomics, member access auto-derefs both levels: `bp.field` lowers to `(*bp)->field`. The capability checks compose: `&heap<T>` may not call `edit` receiver methods; `edit &heap<T>` may.
7. **Drop for `heap<T>` is a small per-type helper.** `delta_rt_heap_dispose_<T>(T* p)` calls the underlying `delta__<module>__<T>_drop(p)`, then `free(p)`. Emitted by codegen for every `T` used as `heap<T>` in the project.
8. **Allocation uses `malloc`.** No custom allocator. The helper `delta_rt_heap_alloc_<T>(T value)` is internally fallible (returns a result carrier); bare `new x` aborts on its error tag, while `new x as result` routes the tag into Phase C. The helper is:
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
10. **Disposal pass updated.** For a `heap<T>` binding at scope exit:
    - If move-state is `Live`, emit `delta_rt_heap_dispose_<T>(x);` (which frees the allocation and disposes its contents).
    - If `Moved`, skip (consistent with Phase F).
    - The dispose runs *after* any inner-scope disposes (LIFO per spec).
11. **Field disposal cascade.** A record with a `heap<T>` field gets its auto-derived drop function extended: after the field-by-field drop pass, heap fields' allocations are freed.

## Tokenizer changes

- New reserved keyword: `heap` — for the **type** `heap<T>`. The allocation operator `new` is already reserved from Phase F.

## Parser changes

- `HeapType { Inner TypeReference; Position Position }` — appears in parameter and field type positions, spelled `heap<T>` (the same angle-bracket form as `Array<T>`).
- No new allocation-expression node: allocation reuses Phase F's `NewExpression`. `new Counter { value: 5 }` parses the record literal as the operand, exactly like any other `new x`. Phase H gives `NewExpression` its `heap<T>` typing and lowering; the parser is unchanged from Phase F.
- Rejection: `heap<T>` in local binding position — "heap-typed locals are post-v0.5; box into a record field instead."
- Rejection: `heap<T>` in return position — depends; spec allows it; for Phase H's MVP we **do** allow it (a factory like `makeBoxedCounter` returns `BoxedCounter | AllocError` where the record contains `heap<Payload>`; the outer return type isn't `heap<T>` itself but the record). Returning a bare `heap<T>` from a function is left out for simplicity; the goal program doesn't need it.

## Semantic analyzer changes

- **Recognize `HeapType` in parameter and field positions only.**
- **`new`-expression typing.** A `NewExpression` whose operand has type `T` produces `heap<T>`. Bare `new x` has type `heap<T>` and aborts on OOM; `new x as result` has type `heap<T> | AllocError`. A `new C { ... }` operand must satisfy record C's field-init rules just like a normal record literal; `new value` / `new move x` box an existing value of any type.
- **Auto-deref in member access.** When the receiver's type is `heap<T>`, treat member-access as if the receiver were `T`. Same for receiver-method calls. Encode this in the existing member-access typing pass — add a single "if receiver is HeapType, unwrap once" step.
- **Move-state tier for `heap<T>` is move-only.** Update the copyability resolver from Phase F: `heap<T>` is never copyable, regardless of `T`. The lattice handles it; no new lattice value.
- **Auto-derived clone updates.** When the analyzer walks a record's fields to decide cloneability, a `heap<T>` field requires `T` cloneable (or copyable); if so, the record is cloneable, and its clone may allocate — so the bare clone aborts on OOM while `clone ... as result` surfaces `AllocError`.
- **Reference through heap.** A `&heap<T>` parameter resolves member access by auto-derefing through both indirection levels. Capability check unchanged.
- **Disposal scheduling.** The codegen disposal pass already consumes a per-scope binding list. Extend the list entries with an `IsHeap bool` flag so the emitter picks `delta_rt_heap_dispose_<T>` vs `delta__<module>__<T>_drop`.

## Codegen changes

- **Type mapping.** `heap<T>` → `<CType_of_T>*`. Whenever `heap<T>` appears in a parameter list, field list, or return position, emit the C pointer type.
- **Per-type heap helpers.** Emit two helpers per type used as `heap<T>` in the project:
  - `delta_rt_heap_alloc_<T>(T value)` — fallible alloc + initialize.
  - `delta_rt_heap_dispose_<T>(T* p)` — drop contents + free pointer.
  Helpers are gated like Phase A/C: only emit those actually used.
- **`new`-expression lowering.** `new Counter { value: 5 }` lowers to a call to `delta_rt_heap_alloc_Counter((Counter){ .value = 5 })`, which produces a `delta_result_heap_Counter`. The `as result` form hands that carrier to `check`; the bare form checks the tag inline and calls `delta_abort("allocation failed")` on failure, yielding the `Counter*` on success. `new value` / `new move x` pass the boxed value as the helper argument.
- **Auto-deref lowering.** Member access `x.field` where x is `heap<T>` → `x->field`. Receiver-method call `x.m(args)` → `delta__<module>__<T>_m(x, args)` (x is already a pointer; the receiver-pointer convention is unchanged).
- **Referenced-heap lowering.** `&heap<T>` → `T* const *`. Access `bp.field` → `(*bp)->field`. The two derefs add nothing at runtime (clang folds).
- **Disposal lowering.** For each `heap<T>`-typed owned binding at scope exit (state `Live`), emit `delta_rt_heap_dispose_<T>(x);`. For `Moved`, skip.
- **Record drop extension.** A record with `heap<T>` fields gets its auto-derived drop body extended: per heap field in reverse declaration order, `delta_rt_heap_dispose_<T>(value->field);`. Other fields keep their existing drop behavior.
- **Clone derivation extension.** Per-record clone walks fields; for each `heap<T>` field, it recursively clones the pointed-to value (which itself produces a `delta_result_<T>`), then wraps the cloned value in a fresh heap allocation (a second fallible step). Both steps live in the generated clone function as plain `if (tmp.tag != 0) goto cleanup;` guards — no Delta-level `check` block is emitted here because this is the C body of the auto-derived helper. The transactional cleanup pattern from Phase F now matters: if a later field's clone or alloc fails, earlier heap allocations must be freed before reporting the propagated error.

## Testing strategy

New fixtures under `test-source/tests/codegen/heap/`:

**Basics (4)**
- `heap_field_ok` — record with one `heap<...>` field; construct via the exported factory; access through auto-deref.
- `heap_param_ok` — function takes `heap<T>` by value; auto-deref works; function moves it into another owning binding (or drops it, causing dispose).
- `heap_local_err` — `let x: heap<Counter> = ...;` rejected with the v0.5 boundary message.
- `heap_alloc_failure_propagation_ok` — simulated alloc failure (use the analyzer's error-injection hook if added; otherwise this fixture is structural — verifies the `as result` + `check` lowering works) propagates `AllocError`.

**Auto-deref (3)**
- `auto_deref_field_read_ok` — read through heap field.
- `auto_deref_field_write_ok` — write through heap field (`edit` receiver method).
- `auto_deref_method_call_ok` — call a receiver method through a heap field.

**Disposal (3)**
- `heap_dispose_at_scope_exit_ok` — snapshot test asserting `delta_rt_heap_dispose_<T>` appears at scope exit.
- `heap_dispose_skipped_after_move_ok` — moved heap binding doesn't dispose at original scope.
- `heap_field_dispose_in_record_drop_ok` — record with `heap<...>` field; record value's scope exit triggers the drop cascade.

**References through heap (2)**
- `ref_heap_field_read_ok` — `&heap<Payload>` argument; read through.
- `edit_ref_heap_edit_method_ok` — `edit &heap<Payload>`; call an `edit` receiver method.

**Clone (2)**
- `clone_record_with_heap_field_ok` — clone of `BoxedCounter` produces an independent allocation; original and clone modifiable independently.
- `clone_transactional_cleanup_ok` — simulated mid-clone failure exercises the cleanup path (synthetic test if real failure injection unavailable; otherwise structural snapshot of the cleanup-emitted C).

All earlier-phase fixtures continue to pass.

## Stage-by-stage implementation order

1. Tokenizer: `heap` keyword.
2. Parser: `HeapType` (`heap<T>`) in parameter/field positions; reject local/forbidden positions. (Allocation reuses Phase F's `NewExpression`; no new node.)
3. Analyzer: `HeapType` placement enforcement.
4. Analyzer: `new`-expression typing — `heap<T>` result, bare-abort vs `as result` carrier shape.
5. Analyzer: auto-deref in member access and receiver-method call.
6. Analyzer: `heap<T>` as move-only tier; clone derivation updated.
7. Analyzer: reference-through-heap (member access via `&heap<T>`).
8. Codegen: per-type `heap_alloc` / `heap_dispose` helpers with gating.
9. Codegen: `new`-expression lowering through `heap_alloc` (bare aborts on the error tag; `as result` propagates).
10. Codegen: auto-deref expansions in member access / method call / field assignment.
11. Codegen: referenced-heap two-level deref lowering.
12. Codegen: disposal pass extended with `IsHeap` per binding; record drop extended with cascade.
13. Codegen: clone derivation extended for heap fields with transactional cleanup.
14. Fixture suite.

Steps 8–13 are the codegen-heavy ones. The analyzer parts (steps 3–7) are mostly small extensions of existing passes.

## Risks and open questions

- **Allocator failure simulation in tests.** Real `malloc` rarely fails; the failure-path fixtures need either a test-time `malloc` shim or structural snapshots that assert the cleanup C is emitted. Recommendation: ship structural snapshots for v0.5; defer a runtime fault-injection harness to post-v0.5.
- **Returning `heap<T>` from a function.** Out of scope for Phase H's MVP per "Parser changes." Could be added with little extra work — it's just another C pointer return — but the goal program doesn't need it and skipping it keeps the surface clean. Document as a known limitation.
- **`heap<T>` of a record with no fields.** Pathological but legal. `heap_alloc` allocates `sizeof(EmptyRecord)`, which clang might warn about (`-Wzero-length-array`); empty structs have implementation-defined size in C. v0.5 doesn't ship an empty record anyway; safe to ignore.
- **Self-referential `heap` fields.** A record `Node` with field `next: heap<Node>` is the natural recursive case. The fixed-size check passes (heap pointers have fixed size). Phase H supports it structurally, but without tagged unions there's no way to express "may not have a next" — the user has to terminate the chain some other way. This is more of a language-surface limitation than a Phase H limitation; tagged unions land post-v0.5.
- **Auto-deref vs explicit `.`-through-pointer.** Delta auto-derefs; the user never writes `->`. This is consistent with the spec ("instances behave like values regardless of where they're stored"). Codegen emits `->` because C requires it; users never see it.
- **Reference exclusivity through heap.** `f(edit &bc.payload, &bc.payload)` — the root for exclusivity purposes is `bc`. Both reference operands share the root `bc` (the path `bc.payload` derefs the heap pointer but the root is still `bc`). The exclusivity check rejects, correctly. Verified by `reference_field_root_check_ok` from Phase F (the former Phase G surface) with the heap variant added.
- **Performance.** Every heap operation is a `malloc`/`free` call. For v0.5 we don't optimize. Bulk-allocated arenas, free-lists, etc., are post-v0.5.

## Definition of done

- The Phase H acceptance shape (BoxedCounter program from "Acceptance shape" above) compiles and runs, printing the expected total.
- All Phase H fixtures pass.
- All earlier-phase fixtures continue to pass.
- Generated C uses `malloc`/`free` through the `delta_rt_heap_*` helpers; no raw `malloc` in user-emitted code paths.
- Disposal pass produces correct cascade through record fields with heap members.
- Clone of a record with heap fields produces an independent allocation, verified by a fixture that mutates the clone and checks the original is untouched.
- **v0.5 is complete.** The full acceptance program from [compiler-goal-v0.5.md](../../compiler-goal-v0.5.md) compiles, runs, and meets all nine success criteria — including the three negative variants (move + capability + exclusivity) and the three visibility/cycle/import variants from Phase I.
