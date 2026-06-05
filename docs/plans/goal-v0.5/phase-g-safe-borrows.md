# Plan: Phase G — Safe Borrows (v0.5b)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phases through **F** landed.
Successor: Phase H adds `heap T`. After Phase H, the full v0.5 goal is reached.
Spec basis: [spec-sections/12-safe-borrows.md](../../spec-sections/12-safe-borrows.md), [spec-sections/13-memory-safety-model.md](../../spec-sections/13-memory-safety-model.md), [spec-sections/11-mutability-model.md](../../spec-sections/11-mutability-model.md).

## Goal

Add `borrowed T` and `mod borrowed T` as parameter types, with `borrowed x` / `mod borrowed x` at call sites, root-based exclusivity at each call's argument list, capability dispatch through borrows, and non-escape enforcement.

After Phase G, the acceptance program's borrow-using calls compile and the negative variants are rejected with precise diagnostics:

```delta
function bump(c: mod borrowed Counter, amount: int64): void | OverflowError {
    c.add(amount) as result;
    check result {
        return error as OverflowError { };
    }
    return;
}

function readSum(a: borrowed Counter, b: borrowed Counter): int64 {
    return a.get() + b.get();
}

function main(): int32 {
    let a = Counter.new(10);
    let b = Counter.new(20);

    bump(mod borrowed a, 5) as result;
    check result {
        return 1;
    }

    const total = readSum(borrowed a, borrowed b);
    info("total", total);
    // bump(mod borrowed a, borrowed a, ...)   ← rejected by exclusivity
    return 0;
}
```

## In-scope language surface

- `borrowed T` and `mod borrowed T` parameter types.
- `borrowed x` and `mod borrowed x` at call sites, operating on **named storage paths** (binding name or binding-dot-field chain).
- Binding-capability rule: `const` binding produces `borrowed` only; `let` produces both.
- Root-based exclusivity check at each call's argument list: many `borrowed` references **or** one `mod borrowed` reference on overlapping roots — never both.
- Method dispatch through borrows respects capability: a `borrowed Counter` may not call `mod` methods.
- Non-escape: borrows may not return, may not be stored in class fields, may not bind to outer-scope `let`/`const`.
- Borrows cannot satisfy by-value parameters; passing one where an owned `T` is expected is a structured error with a fix hint suggesting `clone`.
- Interaction with move-state from Phase F: while a binding is borrowed (alive in any in-flight call), it cannot be moved.

## Explicitly out of scope for Phase G

| Feature | Reason | Eventual home |
|---|---|---|
| Borrows of temporaries or general expressions | Spec requires named storage paths. | Post-v0.5 if needed; usually not. |
| `borrowed T` as a local binding type | Spec defers; parameter-only is the MVP. | Post-v0.5. |
| Borrows in class fields | Same. | Post-v0.5; requires lifetime tracking. |
| Borrows that escape calls (e.g. as return values) | Spec forbids; v0.5 enforces. | Post-v0.5, if a useful design lands. |
| Re-borrow operators / explicit reborrowing | Spec doesn't define them. | Post-v0.5. |
| Borrow inference / elision | All borrows are explicit in spec. | Never planned. |
| Borrow exclusivity across non-overlapping calls in sequence | Within a single call's arg list only. Across sequential calls, normal sequencing applies; the analyzer doesn't need to track "active borrows between calls" because borrows in Phase G don't outlive the call. | Already in scope. |
| Method calls on owned receivers — already work | Phase E covered this. | Already done. |

## What's missing today

After Phase F:

- No `borrowed` or `mod borrowed` keywords or types.
- The analyzer's parameter-type resolution has no notion of pointer-like types.
- Class methods are called with an implicit `self` pointer in codegen, but only on owned receivers; the dispatch through a borrow doesn't exist.
- No notion of "borrow capability" beyond the existing `const`/`let` binding distinction.
- No borrow-exclusivity check.
- Move-state pass doesn't know about borrows; nothing prevents `move a; bump(mod borrowed a, ...);`.

## Decisions

1. **Borrows are first-class parameter types.** `borrowed T` and `mod borrowed T` lower to C pointer types (`const T*` and `T*` respectively). They are not regular value types; the analyzer keeps the borrow-kind on the parameter symbol and uses it for capability and lifetime checks.
2. **Operand is a named storage path.** A "storage path" is an identifier optionally followed by `.field` segments — purely syntactic check on the parser side. Anything else (literals, call expressions, arithmetic) at the operand position is "borrow operand must be a named storage path."
3. **Root-based exclusivity within a single call.** Each borrow operand has a *root*: the leftmost identifier in its path. At each call site, collect the multiset of (root, capability) pairs. Reject if any root appears with `mod` and at least one other entry (mod or non-mod) on the same root.
4. **Capability rule at the borrow operator.** `borrowed x` requires no special capability on x. `mod borrowed x` requires x bound as `let` (or a `mod borrowed`-bound parameter — see decision 7). The analyzer rejects `mod borrowed c` where c is `const`.
5. **Method dispatch through borrow.** `borrowed_param.method(...)` is legal if the method is non-`mod`; `mod_borrowed_param.method(...)` is legal for both kinds. The capability check from Phase E generalizes to borrow-kind receivers.
6. **Non-escape: syntactic + scoped check.**
   - `return borrowed_value;` — error if the return type is or contains a borrow. Since borrows aren't legal return types in v0.5, this triggers automatically.
   - Assigning a borrow to a field — covered by the rule that fields can't be borrows in v0.5.
   - Assigning a borrow to a binding declared outside the current function — covered by the rule that borrow types are parameter-only.
   In short, since borrows can't appear *anywhere* except parameter positions and call-argument positions, escape is structurally impossible. The error messages are still emitted at the syntactic level so the user gets a friendly diagnostic, not a confusing "unknown type position" error.
7. **A `borrowed T` parameter, inside the callee, may be passed to nested calls as `borrowed T` again.** Same for `mod borrowed T`. The borrow's lifetime is the call scope, which dominates any nested call. No reborrow operator needed.
8. **Borrow lifetimes are the duration of the call.** This is the MVP simplification per spec. Lifetime tracking beyond call scope is post-v0.5.
9. **Move-state interaction.** While a binding is "actively borrowed," it cannot be moved. *Actively borrowed* in Phase G means: the binding is referenced as a borrow operand in the *current* call's argument list. Across sequential calls, borrows end at call completion. So a sequence:
   ```
   bump(mod borrowed a, 5);   // a borrowed during this call
   consume(move a);            // a moved here — legal because the prior borrow ended
   ```
   is legal. Within a single call, `f(mod borrowed a, move a)` is rejected because the borrow and move overlap.
10. **Borrows lower to C pointers.** `borrowed T → const T*`, `mod borrowed T → T*`. Inside the callee, `param.field` becomes `param->field`; `param.method(args)` becomes a free-function call with `param` as the `self` pointer. Identical lowering to Phase E's method dispatch — the receiver is already a pointer.

## Tokenizer changes

- `borrowed` becomes a reserved keyword. `mod` is already reserved from Phase E.
- No new operators.

## Parser changes

- `BorrowType { Mutable bool; Inner TypeReference; Position Position }` — appears in parameter type positions.
  - `borrowed T` → `Mutable: false`.
  - `mod borrowed T` → `Mutable: true`.
- `BorrowExpression { Mutable bool; Source StoragePath; Position Position }` — at call-argument positions.
  - Parsed as `borrowed <storage_path>` or `mod borrowed <storage_path>`.
  - `StoragePath` is a small AST shape: an identifier plus a sequence of field names.
- Parser-level rejection: borrow types appearing as locals (`let x: borrowed T = ...;`) or as return types or as fields are structured errors.

## Semantic analyzer changes

- **Borrow type validation.** The analyzer recognizes `BorrowType` only in parameter type positions; everywhere else, error.
- **Parameter symbol kind extension.** `SymbolParameter` grows a `BorrowKind` field: `None`, `Borrowed`, `ModBorrowed`. Methods on the binding (capability lookups, mutability) consult this.
- **Borrow-expression typing.**
  - Operand must be a storage path (parser already ensures this, but the analyzer double-checks the AST shape).
  - Resolve the root binding. Check capability: `mod borrowed x` requires `x` to be `let` or `ModBorrowed` parameter. `borrowed x` requires `x` to be readable (any non-moved owned binding).
  - The expression's type is `BorrowType{Mutable, Inner: x's type along the field path}`.
  - The root binding's move-state at this point must be `Live`; emit "borrow of moved binding `x`" otherwise.
- **Exclusivity check at call sites.** For each call:
  1. Walk argument list; collect entries `(root_name, kind)` for each borrow operand.
  2. Group by root_name.
  3. For each group: if any entry is `mod` and the group has size > 1, reject with a diagnostic listing all positions.
  4. Also reject "move and borrow of same root in same arg list": a `move x` and a `borrowed x` in the same arg list overlap. Add `move` operands to the exclusivity check as a synthetic `Exclusive` capability.
- **Method dispatch via borrowed receiver.**
  - For a `borrowed T` typed expression `e.method(args)`:
    - Look up `method` in T's class scope.
    - If method is `mod`: error "cannot call `mod` method through `borrowed`."
    - Otherwise: legal; the call lowers to a method-as-free-function with `&e` as self.
  - For `mod borrowed T`: any method legal.
- **Capability for static functions through borrows.** Not applicable — static functions don't have a receiver.
- **Argument-to-parameter matching with borrows.** When a call argument is a `BorrowExpression` and the corresponding parameter is a `BorrowType`, the kinds must match exactly (no implicit demotion). If parameter is `borrowed T` and argument is `mod borrowed x`, the user gets "you may pass `borrowed x` here" — but it's still an error in v0.5 because we don't auto-demote. (Could be relaxed later; in spec terms, `mod borrowed` is a stronger capability that subsumes `borrowed`, but explicit is clearer for v0.5.)
- **Passing borrow to by-value parameter** — error with fix hint suggesting `clone`.

## Codegen changes

- **Borrow types lower to C pointers.**
  - `borrowed T` → `const <CType>* name` in parameter list.
  - `mod borrowed T` → `<CType>* name`.
- **Borrow expressions at call sites.**
  - `borrowed x` → `&x` (taking address of the named storage; legal because the binding is a real C local/parameter).
  - `borrowed x.field` → `&x.field`.
  - `mod borrowed x` → `&x`. (Same C address; the difference is in the parameter type's const-qualification.)
- **Method calls through borrows.**
  - `borrowed_param.method(args)` → `delta__<module>__<Class>_method(borrowed_param, args...)`. Same as Phase E because the receiver was already a pointer in the C ABI.
- **Field access through borrows.**
  - `borrowed_param.field` → `borrowed_param->field`.
- **Const-qualification.** C's `const T*` propagation is mostly automatic, but reading a field through a `const T*` yields a const reference that further restricts mutation. The Delta analyzer has already rejected any mutation attempt; the C-level `const` is belt-and-suspenders.

## Testing strategy

New fixtures under `test-source/tests/codegen/borrows/`:

**Basics (4)**
- `borrowed_param_ok` — function takes `borrowed Counter`, calls `.get()`, returns the value.
- `mod_borrowed_param_ok` — function takes `mod borrowed Counter`, calls `.add(5)`.
- `borrowed_calls_mod_method_err` — `borrowed Counter` calls a `mod` method; rejected.
- `mod_borrowed_calls_const_method_ok` — `mod borrowed Counter` calls `.get()`; allowed.

**Capability at borrow creation (3)**
- `const_to_borrowed_ok` — `const a = ...; f(borrowed a);` ok.
- `const_to_mod_borrowed_err` — `const a = ...; f(mod borrowed a);` rejected.
- `let_to_both_ok` — `let a = ...; f(borrowed a); g(mod borrowed a);` ok (sequential).

**Exclusivity (5)**
- `two_borrowed_same_root_ok` — `f(borrowed a, borrowed a);` ok (multiple immutable readers).
- `mod_plus_borrowed_err` — `f(mod borrowed a, borrowed a);` rejected.
- `two_mod_borrowed_err` — `f(mod borrowed a, mod borrowed a);` rejected.
- `mod_borrowed_disjoint_ok` — `f(mod borrowed a, mod borrowed b);` ok.
- `move_plus_borrowed_err` — `f(move a, borrowed a);` rejected.

**Non-escape (3)**
- `borrow_as_local_err` — `let x: borrowed Counter = ...;` rejected.
- `borrow_as_return_err` — function returns `borrowed Counter`; rejected.
- `borrow_as_field_err` — class field of borrow type; rejected.

**Sequencing with move-state (2)**
- `borrow_then_move_ok` — `f(borrowed a); g(move a);` legal (borrow ends before move).
- `move_then_borrow_err` — `g(move a); f(borrowed a);` — second use of moved.

**Storage paths with fields (2)**
- `borrow_field_ok` — `mod borrowed counter.inner` where the analyzer permits field paths through public fields.
- `borrow_field_root_check_ok` — exclusivity correctly groups by root identifier.

**Borrow vs by-value (1)**
- `borrowed_to_byvalue_err` — passing `borrowed x` where the callee expects owned `T`; rejected with clone hint.

All earlier-phase fixtures continue to pass.

## Stage-by-stage implementation order

1. Tokenizer: `borrowed` keyword.
2. Parser: `BorrowType`, `BorrowExpression`, storage-path validation, rejection of non-parameter positions.
3. Analyzer: `SymbolParameter.BorrowKind`; recognize borrow types in parameter positions.
4. Analyzer: borrow-expression typing (operand validity, capability at creation, root resolution).
5. Analyzer: exclusivity check at call sites (including the move-and-borrow overlap rule).
6. Analyzer: method-dispatch capability through borrows.
7. Analyzer: error messages for non-escape rejections (mostly already covered by step 3, but emit user-friendly forms).
8. Codegen: borrow type → C pointer; borrow expression → `&x`; method dispatch unchanged.
9. Codegen: field-access lowering through borrow operands.
10. Fixture suite.

Steps 4–6 are the analyzer-heavy core. Step 8–9 are small codegen.

## Risks and open questions

- **Root resolution for fields.** A borrow operand `mod borrowed obj.inner.value` has root `obj`. The exclusivity check groups by root only; it doesn't split sub-paths. This is the spec's MVP rule and is conservative — `f(mod borrowed obj.a, borrowed obj.b)` is rejected because both roots are `obj`. The fix hint says "borrow exclusivity in v0.5 is root-based; refactor to pass owned values."
- **Borrow lifetime tracking beyond call scope.** Phase G's MVP says borrows don't outlive their call. The analyzer doesn't need a region/lifetime variable system because the call-scope invariant is structural. If `borrowed T` ever becomes a local binding, this story has to grow significantly.
- **Method dispatch through `borrowed T` for fallible methods.** A `mod borrowed Counter` calls a method returning `void | OverflowError`. The result-struct ABI is unchanged; the receiver-as-pointer pattern is unchanged. Just works.
- **`mod borrowed` aliasing under the analyzer's eye.** Two `mod borrowed`s on the same root in one call are rejected, so the analyzer guarantees the C-level pointer arguments don't alias. clang can rely on this; we could emit `restrict` qualifications for `mod borrowed` parameters. **Recommendation: don't emit `restrict` in Phase G** — it's a perf optimization, not a correctness need, and the testing surface for "did we accidentally violate restrict" is large. Add it post-v0.5 if profiling shows benefit.
- **Borrow operand precedence.** `mod borrowed x.field.subfield` parses as a borrow of the storage path `x.field.subfield`. The `.` operator binds tighter than `borrowed` and `mod borrowed`. The parser handles this naturally by parsing the storage path before wrapping in `BorrowExpression`.
- **Borrowed Counter with fallible add: passing `mod borrowed a` and binding the call with `as result`.** Standard composition; nothing new. Verified by the `mod_borrowed_param_ok` fixture, which calls `c.add(amount) as result; check result { return error as OverflowError { }; }` from `bump`.

## Definition of done

- Acceptance program's `bump(mod borrowed a, 5)` and `readSum(borrowed a, borrowed b)` calls compile and run.
- All borrow fixtures pass.
- All earlier-phase fixtures continue to pass.
- The exclusivity diagnostics name the conflicting positions and the shared root.
- A `borrowed` parameter cannot escape the call: no return type, no field type, no local type.
- Phase H can begin: the borrow machinery extends to `heap T` borrows naturally (a `mod borrowed heap T` is still a single pointer, the auto-deref through `heap T` is one extra step in member access).
