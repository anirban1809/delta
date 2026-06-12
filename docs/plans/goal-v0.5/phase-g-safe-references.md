# Plan: Phase G — Safe References (v0.5b)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phases through **F** landed.
Successor: Phase H adds `heap T`. After Phase H, the full v0.5 goal is reached.
Spec basis: [spec-sections/12-safe-references.md](../../spec-sections/12-safe-references.md), [spec-sections/13-memory-safety-model.md](../../spec-sections/13-memory-safety-model.md), [spec-sections/11-mutability-model.md](../../spec-sections/11-mutability-model.md).

## Goal

Add `&T` and `edit &T` as parameter types, with `&x` / `edit &x` at call sites, root-based exclusivity at each call's argument list, capability dispatch through references, and non-escape enforcement.

After Phase G, the acceptance program's reference-using calls compile and the negative variants are rejected with precise diagnostics:

```delta
function bump(c: edit &Counter, amount: int64): void | OverflowError {
    c.add(amount) as result;
    check result {
        return error as OverflowError { };
    }
    return;
}

function readSum(a: &Counter, b: &Counter): int64 {
    return a.get() + b.get();
}

function main(): int32 {
    let a = Counter.new(10);
    let b = Counter.new(20);

    bump(edit &a, 5) as result;
    check result {
        return 1;
    }

    const total = readSum(&a, &b);
    info("total", total);
    // bump(edit &a, &a, ...)   ← rejected by exclusivity
    return 0;
}
```

## In-scope language surface

- `&T` and `edit &T` parameter types.
- `&x` and `edit &x` at call sites, operating on **named storage paths** (binding name or binding-dot-field chain).
- Binding-capability rule: `const` binding produces `&` only; `let` produces both.
- Root-based exclusivity check at each call's argument list: many `&` references **or** one `edit &` reference on overlapping roots — never both.
- Method dispatch through references respects capability: a `&Counter` may not call `edit` methods.
- Non-escape: references may not return, may not be stored in class fields, may not bind to outer-scope `let`/`const`.
- References cannot satisfy by-value parameters; passing one where an owned `T` is expected is a structured error with a fix hint suggesting `clone`.
- Interaction with move-state from Phase F: while a binding is referenced (alive in any in-flight call), it cannot be moved.

## Explicitly out of scope for Phase G

| Feature | Reason | Eventual home |
|---|---|---|
| References of temporaries or general expressions | Spec requires named storage paths. | Post-v0.5 if needed; usually not. |
| `&T` as a local binding type | Spec defers; parameter-only is the MVP. | Post-v0.5. |
| References in class fields | Same. | Post-v0.5; requires lifetime tracking. |
| References that escape calls (e.g. as return values) | Spec forbids; v0.5 enforces. | Post-v0.5, if a useful design lands. |
| Re-reference operators / explicit re-referencing | Spec doesn't define them. | Post-v0.5. |
| Reference inference / elision | All references are explicit in spec. | Never planned. |
| Reference exclusivity across non-overlapping calls in sequence | Within a single call's arg list only. Across sequential calls, normal sequencing applies; the analyzer doesn't need to track "active references between calls" because references in Phase G don't outlive the call. | Already in scope. |
| Method calls on owned receivers — already work | Phase E covered this. | Already done. |

## What's missing today

After Phase F:

- No `&` or `edit &` keywords or types.
- The analyzer's parameter-type resolution has no notion of pointer-like types.
- Class methods are called with an implicit `self` pointer in codegen, but only on owned receivers; the dispatch through a reference doesn't exist.
- No notion of "reference capability" beyond the existing `const`/`let` binding distinction.
- No reference-exclusivity check.
- Move-state pass doesn't know about references; nothing prevents `move a; bump(edit &a, ...);`.

## Decisions

1. **References are first-class parameter types.** `&T` and `edit &T` lower to C pointer types (`const T*` and `T*` respectively). They are not regular value types; the analyzer keeps the reference-kind on the parameter symbol and uses it for capability and lifetime checks.
2. **Operand is a named storage path.** A "storage path" is an identifier optionally followed by `.field` segments — purely syntactic check on the parser side. Anything else (literals, call expressions, arithmetic) at the operand position is "reference operand must be a named storage path."
3. **Root-based exclusivity within a single call.** Each reference operand has a *root*: the leftmost identifier in its path. At each call site, collect the multiset of (root, capability) pairs. Reject if any root appears with `edit` and at least one other entry (edit or non-edit) on the same root.
4. **Capability rule at the reference operator.** `&x` requires no special capability on x. `edit &x` requires x bound as `let` (or an `edit &`-bound parameter — see decision 7). The analyzer rejects `edit &c` where c is `const`.
5. **Method dispatch through reference.** `ref_param.method(...)` is legal if the method is non-`edit`; `edit_ref_param.method(...)` is legal for both kinds. The capability check from Phase E generalizes to reference-kind receivers.
6. **Non-escape: syntactic + scoped check.**
   - `return ref_value;` — error if the return type is or contains a reference. Since references aren't legal return types in v0.5, this triggers automatically.
   - Assigning a reference to a field — covered by the rule that fields can't be references in v0.5.
   - Assigning a reference to a binding declared outside the current function — covered by the rule that reference types are parameter-only.
   In short, since references can't appear *anywhere* except parameter positions and call-argument positions, escape is structurally impossible. The error messages are still emitted at the syntactic level so the user gets a friendly diagnostic, not a confusing "unknown type position" error.
7. **A `&T` parameter, inside the callee, may be passed to nested calls as `&T` again.** Same for `edit &T`. The reference's lifetime is the call scope, which dominates any nested call. No re-reference operator needed.
8. **Reference lifetimes are the duration of the call.** This is the MVP simplification per spec. Lifetime tracking beyond call scope is post-v0.5.
9. **Move-state interaction.** While a binding is "actively referenced," it cannot be moved. *Actively referenced* in Phase G means: the binding is referenced as a reference operand in the *current* call's argument list. Across sequential calls, references end at call completion. So a sequence:
   ```
   bump(edit &a, 5);   // a &during this call
   consume(move a);            // a moved here — legal because the prior reference ended
   ```
   is legal. Within a single call, `f(edit &a, move a)` is rejected because the reference and move overlap.
10. **References lower to C pointers.** `&T → const T*`, `edit &T → T*`. Inside the callee, `param.field` becomes `param->field`; `param.method(args)` becomes a free-function call with `param` as the `self` pointer. Identical lowering to Phase E's method dispatch — the receiver is already a pointer.

## Tokenizer changes

- `&` becomes a reserved keyword. `edit` is already reserved from Phase E.
- No new operators.

## Parser changes

- `ReferenceType { Mutable bool; Inner TypeReference; Position Position }` — appears in parameter type positions.
  - `&T` → `Mutable: false`.
  - `edit &T` → `Mutable: true`.
- `ReferenceExpression { Mutable bool; Source StoragePath; Position Position }` — at call-argument positions.
  - Parsed as `& <storage_path>` or `edit & <storage_path>`.
  - `StoragePath` is a small AST shape: an identifier plus a sequence of field names.
- Parser-level rejection: reference types appearing as locals (`let x: &T = ...;`) or as return types or as fields are structured errors.

## Semantic analyzer changes

- **Reference type validation.** The analyzer recognizes `ReferenceType` only in parameter type positions; everywhere else, error.
- **Parameter symbol kind extension.** `SymbolParameter` grows a `ReferenceKind` field: `None`, `Ref`, `EditRef`. Methods on the binding (capability lookups, mutability) consult this.
- **Reference-expression typing.**
  - Operand must be a storage path (parser already ensures this, but the analyzer double-checks the AST shape).
  - Resolve the root binding. Check capability: `edit &x` requires `x` to be `let` or `EditRef` parameter. `&x` requires `x` to be readable (any non-moved owned binding).
  - The expression's type is `ReferenceType{Mutable, Inner: x's type along the field path}`.
  - The root binding's move-state at this point must be `Live`; emit "reference of moved binding `x`" otherwise.
- **Exclusivity check at call sites.** For each call:
  1. Walk argument list; collect entries `(root_name, kind)` for each reference operand.
  2. Group by root_name.
  3. For each group: if any entry is `edit` and the group has size > 1, reject with a diagnostic listing all positions.
  4. Also reject "move and reference of same root in same arg list": a `move x` and a `&x` in the same arg list overlap. Add `move` operands to the exclusivity check as a synthetic `Exclusive` capability.
- **Method dispatch via referenced receiver.**
  - For a `&T` typed expression `e.method(args)`:
    - Look up `method` in T's class scope.
    - If method is `edit`: error "cannot call `edit` method through `&`."
    - Otherwise: legal; the call lowers to a method-as-free-function with `&e` as self.
  - For `edit &T`: any method legal.
- **Capability for static functions through references.** Not applicable — static functions don't have a receiver.
- **Argument-to-parameter matching with references.** When a call argument is a `ReferenceExpression` and the corresponding parameter is a `ReferenceType`, the kinds must match exactly (no implicit demotion). If parameter is `&T` and argument is `edit &x`, the user gets "you may pass `&x` here" — but it's still an error in v0.5 because we don't auto-demote. (Could be relaxed later; in spec terms, `edit &` is a stronger capability that subsumes `&`, but explicit is clearer for v0.5.)
- **Passing reference to by-value parameter** — error with fix hint suggesting `clone`.

## Codegen changes

- **Reference types lower to C pointers.**
  - `&T` → `const <CType>* name` in parameter list.
  - `edit &T` → `<CType>* name`.
- **Reference expressions at call sites.**
  - `&x` → `&x` (taking address of the named storage; legal because the binding is a real C local/parameter).
  - `&x.field` → `&x.field`.
  - `edit &x` → `&x`. (Same C address; the difference is in the parameter type's const-qualification.)
- **Method calls through references.**
  - `ref_param.method(args)` → `delta__<module>__<Class>_method(ref_param, args...)`. Same as Phase E because the receiver was already a pointer in the C ABI.
- **Field access through references.**
  - `ref_param.field` → `ref_param->field`.
- **Const-qualification.** C's `const T*` propagation is mostly automatic, but reading a field through a `const T*` yields a const reference that further restricts mutation. The Delta analyzer has already rejected any mutation attempt; the C-level `const` is belt-and-suspenders.

## Testing strategy

New fixtures under `test-source/tests/codegen/references/`:

**Basics (4)**
- `ref_param_ok` — function takes `&Counter`, calls `.get()`, returns the value.
- `edit_ref_param_ok` — function takes `edit &Counter`, calls `.add(5)`.
- `ref_calls_edit_method_err` — `&Counter` calls an `edit` method; rejected.
- `edit_ref_calls_const_method_ok` — `edit &Counter` calls `.get()`; allowed.

**Capability at reference creation (3)**
- `const_to_ref_ok` — `const a = ...; f(&a);` ok.
- `const_to_edit_ref_err` — `const a = ...; f(edit &a);` rejected.
- `let_to_both_ok` — `let a = ...; f(&a); g(edit &a);` ok (sequential).

**Exclusivity (5)**
- `two_ref_same_root_ok` — `f(&a, &a);` ok (multiple immutable readers).
- `edit_plus_ref_err` — `f(edit &a, &a);` rejected.
- `two_edit_ref_err` — `f(edit &a, edit &a);` rejected.
- `edit_ref_disjoint_ok` — `f(edit &a, edit &b);` ok.
- `move_plus_ref_err` — `f(move a, &a);` rejected.

**Non-escape (3)**
- `reference_as_local_err` — `let x: &Counter = ...;` rejected.
- `reference_as_return_err` — function returns `&Counter`; rejected.
- `reference_as_field_err` — class field of reference type; rejected.

**Sequencing with move-state (2)**
- `reference_then_move_ok` — `f(&a); g(move a);` legal (reference ends before move).
- `move_then_ref_err` — `g(move a); f(&a);` — second use of moved.

**Storage paths with fields (2)**
- `reference_field_ok` — `edit &counter.inner` where the analyzer permits field paths through public fields.
- `reference_field_root_check_ok` — exclusivity correctly groups by root identifier.

**Reference vs by-value (1)**
- `ref_to_byvalue_err` — passing `&x` where the callee expects owned `T`; rejected with clone hint.

All earlier-phase fixtures continue to pass.

## Stage-by-stage implementation order

1. Tokenizer: `&` keyword.
2. Parser: `ReferenceType`, `ReferenceExpression`, storage-path validation, rejection of non-parameter positions.
3. Analyzer: `SymbolParameter.ReferenceKind`; recognize reference types in parameter positions.
4. Analyzer: reference-expression typing (operand validity, capability at creation, root resolution).
5. Analyzer: exclusivity check at call sites (including the move-and-reference overlap rule).
6. Analyzer: method-dispatch capability through references.
7. Analyzer: error messages for non-escape rejections (mostly already covered by step 3, but emit user-friendly forms).
8. Codegen: reference type → C pointer; reference expression → `&x`; method dispatch unchanged.
9. Codegen: field-access lowering through reference operands.
10. Fixture suite.

Steps 4–6 are the analyzer-heavy core. Step 8–9 are small codegen.

## Risks and open questions

- **Root resolution for fields.** A reference operand `edit &obj.inner.value` has root `obj`. The exclusivity check groups by root only; it doesn't split sub-paths. This is the spec's MVP rule and is conservative — `f(edit &obj.a, &obj.b)` is rejected because both roots are `obj`. The fix hint says "reference exclusivity in v0.5 is root-based; refactor to pass owned values."
- **Reference lifetime tracking beyond call scope.** Phase G's MVP says references don't outlive their call. The analyzer doesn't need a region/lifetime variable system because the call-scope invariant is structural. If `&T` ever becomes a local binding, this story has to grow significantly.
- **Method dispatch through `&T` for fallible methods.** An `edit &Counter` calls a method returning `void | OverflowError`. The result-struct ABI is unchanged; the receiver-as-pointer pattern is unchanged. Just works.
- **`edit &` aliasing under the analyzer's eye.** Two `edit &`s on the same root in one call are rejected, so the analyzer guarantees the C-level pointer arguments don't alias. clang can rely on this; we could emit `restrict` qualifications for `edit &` parameters. **Recommendation: don't emit `restrict` in Phase G** — it's a perf optimization, not a correctness need, and the testing surface for "did we accidentally violate restrict" is large. Add it post-v0.5 if profiling shows benefit.
- **Reference operand precedence.** `edit &x.field.subfield` parses as a reference of the storage path `x.field.subfield`. The `.` operator binds tighter than `&` and `edit &`. The parser handles this naturally by parsing the storage path before wrapping in `ReferenceExpression`.
- **Referenced Counter with fallible add: passing `edit &a` and binding the call with `as result`.** Standard composition; nothing new. Verified by the `edit_ref_param_ok` fixture, which calls `c.add(amount) as result; check result { return error as OverflowError { }; }` from `bump`.

## Definition of done

- Acceptance program's `bump(edit &a, 5)` and `readSum(&a, &b)` calls compile and run.
- All reference fixtures pass.
- All earlier-phase fixtures continue to pass.
- The exclusivity diagnostics name the conflicting positions and the shared root.
- A `&` parameter cannot escape the call: no return type, no field type, no local type.
- Phase H can begin: the reference machinery extends to `heap T` references naturally (an `edit &heap T` is still a single pointer, the auto-deref through `heap T` is one extra step in member access).
