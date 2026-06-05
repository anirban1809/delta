# Plan: Phase F — Ownership and Move Semantics (v0.5b)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: All of v0.5a (Phases **I, D, J, A, B, C, E**) landed.
Successor: Phase G adds borrowed/mod-borrowed references on top of the ownership model. Phase H adds `heap T` owning indirection.
Spec basis: [spec-sections/14-ownership-and-move-semantics.md](../../spec-sections/14-ownership-and-move-semantics.md), [spec-sections/13-memory-safety-model.md](../../spec-sections/13-memory-safety-model.md), [spec-sections/11-mutability-model.md](../../spec-sections/11-mutability-model.md).

## Goal

Close the intentional unsoundness from end-of-v0.5a: classes are now move-only by default, `move x` is the only way to transfer ownership of an owned binding, use-after-move is a compile error, conditional moves are rejected, and the disposal pass skips moved-from bindings. `clone x` provides a fallible deep copy. Copyable values (primitives, `bool`, `char`, views) keep working as before; assignment copies them.

After Phase F, the acceptance program's `consume(move a)` line compiles and the diagnostic for using `a` afterward is precise:

```delta
function consume(c: Counter): int64 { return c.get(); }

function main(): int32 {
    let a = Counter.new(10);
    const v = consume(move a);  // a is moved-from after this
    info("v", v);
    // info("a", a.get());  ← rejected with "use of moved binding `a`"
    return 0;
}
```

## In-scope language surface

- **Copyability tiers**: Copyable (primitives, bool, char, views), cloneable (every class whose fields are all copyable or cloneable — auto-derived), move-only (the default class behavior; user-supplied `uses Disposable` would lock a class into move-only but is out of v0.5).
- `move x` expression — whole-name only, live owned binding.
- `clone x` expression — fallible, produces `T | AllocError` (consumed via `as result` + `check`).
- Per-binding move-state tracking via the Phase B CFG + dataflow framework.
- Conditional-move rejection: a binding moved on some paths but not all is an error at the merge point. Diverging paths (`return`, `break`, `continue`, `panic`) exempt.
- Revival via whole-value reassignment: a moved-from `let` becomes live again after `x = newvalue;`.
- Implicit `return x` moves x when x is an owned binding referenced in the return value.
- Disposal pass updated to skip moved-from bindings at scope exit.
- Auto-derived clone for class instances.
- Copyable assignment continues to copy at the C level (struct copy is fine for copyable types).

## Explicitly out of scope for Phase F

| Feature | Reason | Eventual home |
|---|---|---|
| `uses Copyable` user-supplied hook | Auto-derived only. | Post-v0.5. |
| `uses Cloneable` user-supplied clone hook | Auto-derived only. | Post-v0.5. |
| `uses Disposable` user-supplied dispose hook | Phase E's empty dispose function stays the only dispose path. | Post-v0.5. |
| Partial moves / field-level moves | Aggregates move whole or not at all. | Never planned per spec. |
| `move` of borrow operands | Borrows aren't owned — moving them makes no sense. Phase G enforces. | Phase G. |
| `clone` of borrows | A borrow can't be cloned because the destination would need ownership. | Phase G. |
| Move state of heap-allocated values | Phase H adds `heap T` and its own move discipline. | Phase H. |
| Move tracking across modules / cross-TU | Inside one function only. Cross-call moves are handled at the call site (the argument is moved into the callee, the parameter receives ownership). | Already in scope for v0.5; this is what call-by-value with move-only types means. |

## What's missing today

After Phase E:

- Classes are move-only at the *type-system level* not yet enforced. Passing a class by value emits a struct copy and the analyzer never complains. Two `let a = Counter.new(...); let b = a;` works and produces two seemingly-independent counters, which is wrong.
- No `move` or `clone` keywords.
- The analyzer's binding-state tracking is per-name liveness for definite-assignment only. There's no move-state lattice.
- The disposal pass disposes every binding — including bindings whose value was moved out, which would be a double-free in a language where Phase H'd heap pointers exist.
- No per-class auto-derived clone function.

## Decisions

1. **Move state is per binding, computed by forward dataflow over the Phase B CFG.** Lattice:
   - `Live` — binding is owned and usable.
   - `Moved` — binding has been moved out; subsequent reads are errors until revival.
   - `MaybeMoved` — a merge of `Live` and `Moved` from different predecessors. **Treated as an error at any subsequent use.** This is the "conditional move" rejection.
   - `Revived` — was `Moved`, reassigned to a fresh whole value. Treated as `Live` for downstream.
   - `Uninitialized` (already from Phase B for definite-assignment) — interacts with move state because a `let x: T;` followed by `move x` is also an error ("move of uninitialized binding `x`").
2. **`move x` is whole-name only.** `move x.field` and `move arr[i]` are errors. The parser accepts only `move <identifier>`.
3. **Use-after-move includes implicit returns.** `return x;` where x is owned and `Live` is an implicit move (`x` becomes `Moved` at the function's exit). The CFG models the implicit move at the return site; the dataflow propagates it.
4. **Conditional moves: same lattice at every merge point.** If predecessors disagree on a binding's state and the joined state is `MaybeMoved`, any use post-merge is an error. The diagnostic names both predecessors: "binding `x` is moved on the then-branch but live on the else-branch; uses past the merge are not permitted."
5. **Revival via whole-value reassignment.** `x = ...;` where `x` is `Moved` makes `x` `Live` again. Partial revival (assigning to a field of a moved-from binding) is an error: "cannot assign to field of moved-from `x`."
6. **Loops require revival before back-edges if a binding is moved inside.** An outer-scope binding moved on the first iteration must be revived before the loop's back-edge or the back-edge sees `Moved`, making the next iteration's use invalid. The CFG already builds the loop-back edge; the dataflow flags the issue at the join.
7. **`move` is purely a compile-time concept.** At the C level, `move x` lowers to `x` — the value is just used in place. The analyzer's invariant (no subsequent read of x) makes the C-level "value still sitting in x" invisible. No runtime sentinel, no zeroing.
8. **`clone` is auto-derived recursively.** For class C, the synthesized `delta__<module>__<C>_clone(const C* src, C* dst) → delta_result_void`:
   - Per field: if copyable, plain assignment; if cloneable, recursive call to its clone; on any clone failure, propagate `AllocError`.
   - "Transactional": if a clone fails partway, partially-constructed sub-clones must be disposed before returning. Implement as a "build-up" pattern with a fail-label cleanup.
   - In Phase F all class instances are inline value types (Phase H adds heap), so transactionality is trivial — no heap allocations to worry about yet. The pattern still lands here so Phase H plugs in cleanly.
9. **Copyable assignment is plain C struct copy.** Primitives, bool, char, views: `=` copies. No new codegen surface; the existing code path is correct.
10. **Disposal pass consults move-state at scope exit.** Phase E emitted dispose calls for every owned binding; Phase F gates each call: if the binding's at-exit state is `Moved`, skip the dispose call. If `MaybeMoved`, the analyzer has already errored before reaching codegen, so this is unreachable.
11. **`return <expr>` with multiple owned operand bindings.** Each owned binding referenced in the return value is moved. If the same binding is referenced more than once (`return f(x, x);`), that's a use-after-move error at the second use. Same rule as any other call.

## Tokenizer changes

- New reserved keywords: `move`, `clone`.

## Parser changes

- `MoveExpression { Source string; Position Position }` — only an identifier is legal as source.
- `CloneExpression { Source Expression; Position Position }` — the source is an arbitrary expression (typically an identifier, but `clone obj.field` is acceptable because it reads, not moves; the read-only nature makes any storage path valid).

## Semantic analyzer changes

- **Move-state lattice** as a `LatticeValue` implementation feeding the Phase B dataflow framework.
- **Per-binding state map** computed once per function in a new analyzer pass after definite-assignment.
- **Use-site checks**: every binding read consults its state at that point. Anything non-`Live`/`Revived` is an error with a specific reason:
  - `Moved` → "use of moved binding `x`; moved at <pos>"
  - `MaybeMoved` → "binding `x` may be moved on some paths; refactor to make the move consistent"
  - `Uninitialized` → already from Phase B
- **`move x` transitions** the binding to `Moved` at the move site. If x is already `Moved` or `MaybeMoved`, error. If x is `Uninitialized`, error.
- **`clone x` reads** x (state must be `Live`), produces a `T | AllocError` value, leaves x's state unchanged.
- **Implicit return moves**: at each `return`, for each owned binding referenced in any operand, transition to `Moved` at the return-site exit.
- **Revival**: `x = ...` where x is `Moved` transitions to `Live`. Partial-revival rejection: assigning to `x.field` where x is `Moved` is an error.
- **Loop back-edge check**: at the start of a loop body's second-or-later iteration, every binding the loop-body might have moved must be `Live`. If the back-edge sees `Moved` or `MaybeMoved`, error.
- **`return` value typing**: the return type's copyability tier determines what happens. For move-only types, the implicit move is the only valid path; for copyable types, the value is copied (no move). No new diagnostic; the rules just follow the type.
- **Copyability resolution**:
  - Primitives, bool, char: copyable.
  - Class types: cloneable iff all fields are copyable or cloneable; otherwise move-only.
  - Result types from Phase C: copyability follows the success type (an `int32 | OverflowError` is copyable; a `Counter | OverflowError` is move-only).
- **Auto-derived clone synthesis** happens at class-registration time: walk the field list, check each field's copyability, mark the class cloneable or not. Emit the clone-function declaration; codegen later emits the body.

## Codegen changes

- **`move x` lowers to `x`.** No runtime mark, no zeroing.
- **`clone x` lowers** to a call to the class's auto-derived clone function, returning a `delta_result_<class>`. The caller consumes via `as result` + `check` from Phase C.
- **Auto-derived clone function body** per class:
  ```c
  static delta_result_<Class> delta__<module>__<Class>_clone(const <Class>* src) {
      <Class> dst;
      /* per field: copy or recursive clone, with transactional cleanup on failure */
      return (delta_result_<Class>){ .tag = 0, .value = dst };
  }
  ```
  For Phase F, every class's clone is straight-line copies (no heap fields yet). The transactional skeleton (fail-label cleanup) is emitted but never exercised; Phase H will exercise it.
- **Disposal pass gating.** For each scope-exit dispose call from Phase E, generate a guard or omit the call based on the binding's at-exit move-state:
  - `Live` at exit: emit the dispose call (unchanged from Phase E).
  - `Moved` at exit: omit the dispose call.
  - `MaybeMoved`: unreachable; analyzer error.
  Statically resolvable at codegen time because the analyzer's move-state pass runs first.
- **Plumbing the per-binding state map to codegen.** The analyzer attaches an at-exit state to each binding's scope record; codegen consults it when emitting dispose calls.
- **No runtime overhead.** Every move/clone decision is compile-time. The generated C is identical to the Phase E output minus the dispose calls that the analyzer proved unnecessary.

## Testing strategy

New fixtures under `test-source/tests/codegen/ownership/`:

**Move basics (4)**
- `move_simple_ok` — `consume(move a)`, no subsequent use.
- `move_use_after_err` — `consume(move a); a.get();` rejected with precise positions.
- `move_uninitialized_err` — `let a: Counter; move a;` rejected.
- `move_twice_err` — `move a; move a;` rejected on the second.

**Conditional moves (3)**
- `move_both_branches_ok` — moved in both then and else; ok.
- `move_one_branch_err` — moved only in then; use after merge rejected.
- `move_diverging_branch_ok` — one branch returns/panics; the other moves; use after the if is permitted because the diverging branch doesn't reach the merge.

**Implicit return move (2)**
- `return_moves_ok` — `return c;` moves c; subsequent code unreachable, no diagnostic.
- `return_uses_moved_err` — `return f(move c, c);` rejected (second use of moved).

**Loops (3)**
- `loop_move_outer_err` — moved inside loop, used on next iteration via the back-edge; rejected.
- `loop_move_revive_ok` — moved then reassigned before back-edge; ok.
- `loop_inner_only_ok` — bind freshly inside the loop body, move freely.

**Revival (2)**
- `revive_after_move_ok` — `move a; a = Counter.new(...); a.get();` ok.
- `revive_partial_err` — `move a; a.value = 5;` rejected.

**Clone (3)**
- `clone_class_ok` — `let b = clone a as result; check result { return 1; }` works; both a and b independently usable past the check.
- `clone_in_check_ok` — clone propagating allocation error (synthetic; v0.5b clone has no failure paths but the consume shape must work).
- `copyable_no_clone_needed_ok` — primitives don't need clone; plain assignment works.

**Disposal (2)**
- `dispose_skipped_after_move_ok` — generated C does not call dispose for the moved binding (snapshot).
- `dispose_called_when_not_moved_ok` — non-moved bindings still get their dispose call.

All earlier-phase fixtures continue to pass.

## Stage-by-stage implementation order

1. Tokenizer: `move`, `clone` keywords.
2. Parser: `MoveExpression`, `CloneExpression`.
3. Copyability resolution for primitives and classes (recursive).
4. Move-state lattice; reusable through the Phase B dataflow framework.
5. Use-site checks: `Live`/`Revived` only.
6. `move x` transitions and rejections (uninitialized, double-move).
7. Implicit return move at each return site.
8. Revival rules: whole-value reassignment, partial-revival rejection.
9. Loop back-edge check.
10. Auto-derived clone signature synthesis at class registration; codegen body emission.
11. Codegen: `move x` lowering (no-op), `clone x` lowering (call to derived function).
12. Disposal-pass gating in codegen using the analyzer's at-exit move-state map.
13. Fixture suite.

Steps 3–9 are the analyzer-heavy core. Step 12 is the codegen win.

## Risks and open questions

- **Lattice correctness at merge points.** The single hardest piece of v0.5. Build the lattice with a dedicated unit-test suite that constructs synthetic CFGs and asserts state transitions. Reuse the Phase B framework's pattern of testing the dataflow before plumbing it.
- **Implicit return move vs `check`-block propagation.** A sequence like `const c = makeCounter() as result; check result { return error as ...; } return c;` — the check block diverges with a `return error as ...`; the fall-through path moves `c` via the implicit return move. The move-state pass treats every diverging terminator inside a `check` block as a regular function-exit edge: owned bindings dispose normally on those edges. The bindings introduced by `as result` (e.g., `c`) are only *valid* on the fall-through path past the check block, so the implicit-move rule applies there as usual.
- **Owned bindings inside a fallible's success path.** `const c = makeCounter() as result; check result { return 1; } return c;` where `makeCounter(): Counter | AllocError` — after the check block, `c` holds the Counter value; `return c;` implicit-moves it. The fallible-result-struct from Phase C carries the Counter by value; the commit-after-check codegen pattern materializes `c` from the result struct. Move tracking works on `c` from that point forward.
- **Transactional clone partial cleanup.** Phase F's clones don't allocate, so partial-cleanup paths are never exercised. The skeleton lives unused. Phase H's `heap T` clone will exercise it. Land the skeleton anyway; it's where the abstraction belongs.
- **Move of a binding whose lifetime is parameter scope.** Function parameters are owned by-value. `move p;` is legal at any point in the function; the analyzer treats parameters like any other `let`-bound local for move-state purposes. The C-level argument disappears at function exit naturally.
- **Cross-call ownership transfer at C ABI.** Passing a class instance to a function by value emits a C-level struct copy. With move tracking on the Delta side, the source binding is `Moved`; the C-level copy reaches the callee. Acceptable for v0.5b — there's no aliased ownership, and the analyzer guarantees no subsequent use.

## Definition of done

- Acceptance program's `consume(move a)` and use-after-move rejection both work.
- All Phase F fixtures pass.
- All earlier-phase fixtures continue to pass.
- The disposal pass produces C that calls dispose only on bindings the analyzer proved live at scope exit, verified by snapshot inspection.
- `clone x` is consumed via `as result` + `check` at every call site; no in-band failure mode escapes.
- The intentional v0.5a unsoundness gap is closed: passing a class by value moves it; subsequent use is a compile error.
- Phase G can begin: the move-state machinery is the foundation for the borrow-exclusivity check (a `mod borrowed` reference precludes a concurrent move).
