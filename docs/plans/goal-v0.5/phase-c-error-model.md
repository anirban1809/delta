# Plan: Phase C — Error Model (v0.5)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phases **I, D, J, A, B** landed. In particular, Phase A's trap helpers and Phase B's CFG + dataflow framework are direct dependencies.
Successor: Phase E (classes) builds on this — class methods can return fallible types.
Spec basis: [main-spec.md](../../main-spec.md) §22 (`return error as`), §23 (`as result`), §24 (`check` block), §25 (multi-return), §26 (`void | ErrorType`); [spec-sections/05-primitive-numeric-types.md](../../spec-sections/05-primitive-numeric-types.md) §5.5.

## Goal

Wire the recoverable-error story end-to-end per spec §22–§26: fallible function signatures, `as resultName` as the binding form (success values are *pending*), `check resultName { ... }` as the error-handling block whose every internal path must diverge, `return error as ErrorType { ... }` as the propagation form, and codegen as a tagged result struct in C. Tie Phase A's trap sites into the same fallible machinery so an overflow can either trap (default) or be caught (`as result`).

After Phase C:

```delta
function safeAdd(a: int64, b: int64): int64 | OverflowError {
    const sum = a + b as result;
    check result {
        return error as OverflowError { };
    }
    return sum;
}

function main(): int32 {
    const x = safeAdd(1_000_000_000_000, 999) as result;
    check result {
        return 1;
    }
    info("result", x);
    return 0;
}
```

…compiles, runs, prints `[INFO] result: 1000000000999`, exits 0. A variant that adds `int64_MAX + 1` causes `safeAdd`'s `check` to fire, propagating an `OverflowError`; main's `check` then fires and main returns 1.

## In-scope language surface

- End-to-end handling of fallible signatures `T | E1, E2, ...` and `T1, T2 | E` (the parser already accepts the shape; Phase C validates and lowers).
- Built-in error types: `OverflowError`, `DivideByZeroError`, `NarrowingError`, `ShiftCountError`. Predeclared in the analyzer's primordial scope.
- `expr as resultName` binding form — applies to fallible function calls and to trapping arithmetic / cast operations from Phase A's closed trap set. Success values are bound by name; for multi-value success, comma-separated bindings (`const a, b = call() as result;`). The result-name (`resultName`) is the user-chosen identifier for the error-handling block to refer to.
- The bound success names are *pending*: readable for type-purposes during analysis but the analyzer rejects every actual read until a `check` block proves the error path diverges.
- `check resultName { ... }` block statement — runs only on error. Inside the block, `resultName.error` is accessible. Every control-flow path inside the block must terminate via a diverging terminator: `return`, `panic`, `break`, `continue`, `process.exit`, or `unreachable`. There is no `else`. After the block, the pending bindings become valid for normal use.
- `return error as ErrorType { ... }` — produces a fallible value in the error state. Only legal inside a function whose declared error set contains `ErrorType`. The `{ ... }` initializer populates the error type's fields, exactly like a class literal (Phase E's class-literal rules apply; for v0.5, built-in error types have no required fields, so `OverflowError { }` is sufficient).
- Codegen: synthesized tagged-result C structs per success-type shape; `as result` writes a `delta_result_<shape>` value into a hidden binding; `check result {...}` lowers to `if (result.tag != 0) { ... }` plus a flow guarantee that the block diverges; `return error as E { }` lowers to setting the tag and returning.
- Fallible-call rejection without `as result`: a bare fallible call (no `as result`, no `ignore`) is a structured diagnostic, per spec §23.

## Explicitly out of scope for Phase C

| Feature | Reason | Eventual home |
|---|---|---|
| User-defined error types | Spec allows them, but Phase C uses the built-in set only. The mechanism extends naturally. | Post-v0.5, when type declarations land. |
| `ignore expr;` form for explicit error-drop (spec §27) | Out of v0.5; non-essential for the goal. | Post-v0.5. |
| `return error as TargetType { ... }` *type-reshaping* — propagating one error type as a different declared error type | Spec §22 allows this; for v0.5 the propagated error type must literally match a member of the enclosing function's declared error set. | Post-v0.5. |
| Allocation-failure errors (`AllocError`) | Needed for `heap T` in Phase H; predeclared *in* Phase C but only constructed once Phase H emits heap allocations. | Phase H consumes; Phase C predeclares. |
| Mapping / transforming errors | No combinator surface in v0.5. | Post-v0.5. |

## What's missing today

- `as` and `check` are not keywords.
- The parser doesn't recognize the `as resultName` suffix on bindings/expression statements, nor the `check resultName { ... }` block statement, nor `return error as ErrorType { ... }`.
- Error types on function signatures are parsed but never validated. The analyzer treats them as opaque identifier references; `OverflowError` isn't a real symbol.
- Phase A's trap helpers abort unconditionally. They have no result-shaped sibling.
- Codegen has no result-struct synthesis machinery.
- The CFG from Phase B handles diverge edges (panic), but doesn't know that a `check resultName { ... }` block is guaranteed to diverge on every internal path.

## Decisions

1. **Error sets are nominal and per-signature.** A function returns `T | E1, E2`: the error side is the set `{E1, E2}`. Each is a built-in nominal error type. A `return error as Ei { ... }` is only legal when `Ei ∈ ErrorSet` of the enclosing function.
2. **One synthesized result struct per success-shape × error-set combination.** Codegen synthesizes the C struct on demand and caches by shape. A `T | E_set` lowers to `delta_result_<mangled-shape>`:
   ```c
   typedef struct {
       uint8_t  tag;            /* 0 = ok, otherwise error discriminant */
       union {
           int64_t value;       /* on success — for void, this member is absent */
           struct {
               /* error fields per Ei in E_set; for v0.5 built-ins, empty */
           } error;
       } u;
   } delta_result_int64;
   ```
   Multi-value success cases get a nested struct on the value side (`delta_result_int32_int32`).
3. **Error discriminant is global.** All built-in error types get a stable small integer (`OverflowError = 1`, `DivideByZeroError = 2`, etc.). Same number flows through every TU.
4. **`as result` applies to both fallible calls and trap-set operations.** Per spec §5.5 and §23, the form is unified. The expression on the LHS must be one of:
   - A call to a function whose return type includes `| E_set`.
   - A trap-set operation from the Phase A enumeration (arithmetic, division, shift, narrowing/sign-flip cast, float-to-int).
   Applying `as result` to a provably-infallible expression is a compile error (spec §5.5: "Binding a provably-infallible expression with `as result` is a hard compile error.").
5. **`as result` is a binding-form suffix, not a standalone expression.** The form `<lhs-binding-or-storage-or-statement> = <expr> as resultName;` or `<expr> as resultName;` (when the expression's success type is `void`) is what the parser recognizes. Specifically:
   - `const a, b = fallibleCall() as resultName;` — fresh `const` bindings receive multi-value success.
   - `let x = trappingExpr as resultName;` — fresh `let` binding receives the single success value.
   - `fallibleCall() as resultName;` — `void` success; no value bound.
   - `existingField = expr as resultName;` — assignment-form: the storage path receives the success value (also marked *pending* until the matching check). This form is used in `edit` methods to update fields.
6. **`check resultName { ... }` is a block statement.** Not an expression. Inside, `resultName.error` is the only thing that may be read from `resultName`. Every control-flow path inside the block must terminate with a *diverging terminator*: `return`, `panic`, `break`, `continue`, `process.exit`, or `unreachable`. The analyzer enforces this via the Phase B CFG: every CFG sink inside the block must be a divergence. Falling through is a structured error.
7. **Pending-state lattice.** A binding (or storage path) targeted by `as resultName` enters the analyzer's per-binding *pending* state from the `as result` site forward. Reads of a pending binding are errors. The matching `check resultName { ... }` block, whose body the analyzer has proved fully-diverging, transitions the binding to *valid* on the fall-through path past the block. (On the in-block path, the binding remains pending — it can't be read because the block can only read `result.error`.)
8. **`check resultName` must follow the `as resultName` binding directly.** Per spec, the result-name lifecycle is: introduced by `as resultName`, consumed by exactly one `check resultName`, then the name goes out of scope. The analyzer enforces this as a syntactic-ish rule: between the `as result` site and the next `check result` site in the same basic block, no statements other than further uninvolved code may intervene — and the next `check result` must reference the same name. (Practically: the `check` block comes immediately or near-immediately after the `as result` binding; the analyzer doesn't require strict adjacency, but it does require that no read of the pending binding happens in between.)
9. **`return error as ErrorType { ... }` is the propagation form.** Used inside `check` blocks (and elsewhere) to return an error from the enclosing function. The `{ ... }` is a class-literal-style initializer over the error type's fields; v0.5 built-in errors have no required fields. The enclosing function's error set must contain `ErrorType` literally (no widening per Phase C).
10. **A fallible call without `as result` is an error.** Per spec §23, every fallible call must be bound. A bare `fallibleCall();` or `let x = fallibleCall();` (without `as result`) is rejected with "fallible result must be bound via `as resultName` and checked."
11. **Predeclared error types live in the analyzer's primordial scope.** `OverflowError`, `DivideByZeroError`, `NarrowingError`, `ShiftCountError`, `AllocError`. Each is a `SymbolErrorType` with a stable discriminant. Shadowing them is rejected by the Phase B shadowing rule.
12. **CFG extension: the `check` block is a guarded subgraph.** A `check resultName { ... }` block contributes a sub-CFG whose entry is conditioned on `resultName.error != none`. The analyzer's existing return-coverage pass already requires every sink in a CFG path to terminate; restricting the check block to diverging terminators is the same rule applied to that sub-CFG.

## Tokenizer changes

- New keywords: `as`, `check`, `error`. (`error` is needed for `return error as ErrorType { }`; it's a contextual keyword in spec §22.)
- `result` is **not** a keyword; it's a user-chosen identifier following `as`. The parser doesn't need to treat it specially.

## Parser changes

- Extend variable-declaration and assignment-statement productions to accept a trailing `as <identifier>` suffix on the initializer/RHS. The identifier becomes the result-name.
  - `const <bindings> = <expr> as <name>;`
  - `let <binding> = <expr> as <name>;`
  - `<storage_path> = <expr> as <name>;`
  - `<expr> as <name>;` (when the success type is `void` — analyzer enforces)
- New AST nodes:
  ```go
  type AsResultBinding struct {
      Expr       Expression
      ResultName string
      Position   Position
  }
  type CheckBlockStatement struct {
      ResultName string
      Body       *BlockStatement
      Position   Position
  }
  type ReturnErrorStatement struct {
      ErrorType   string
      FieldInits  []FieldInitializer  /* class-literal shape from Phase E */
      Position    Position
  }
  ```
- Recognize `check <identifier> { ... }` at statement position; produce `CheckBlockStatement`.
- Recognize `return error as <TypeName> { ... };` at statement position; produce `ReturnErrorStatement`.
- `FunctionDeclaration.ErrorTypes` is already parsed; no change to the signature shape.

## Semantic analyzer changes

- **Predeclared error types.** Extend the primordial scope with the five built-ins. Each carries the stable discriminant.
- **Signature validation.** Validate every entry in `FunctionDeclaration.ErrorTypes` resolves to a `SymbolErrorType`. Unknown names get "unknown error type; only built-in error types are available in v0.5." Normalize the set (sort, dedup) and store on `FunctionSignature.ErrorSet`.
- **`as result` typing.**
  - Inner expression must be fallible (call to a function with non-empty `ErrorSet`) or in the Phase A closed trap set.
  - Inner expression's success type matches the LHS binding/storage shape; mismatch is a binding-error diagnostic.
  - Provably-infallible inner expressions get "this expression cannot fail; remove `as result`."
  - The result-name is bound in a fresh per-statement *result scope*; only `result.error` is readable, and only inside the matching `check` block.
  - The LHS bindings/storage transition to *pending* in the analyzer's per-binding state map.
- **Pending-state propagation.** Every read of a pending binding is an error; the diagnostic names the `as result` site and the missing `check`. Pending → valid happens on the path past a `check resultName { ... }` block whose body is fully diverging.
- **`check` block validation.**
  - The result-name must match a preceding `as <name>` whose pending bindings are still pending at this point (no intervening read or shadowing).
  - The block body must have every CFG sink be a diverging terminator. The dataflow check is the same shape as Phase B's return-coverage; reuse it.
  - Inside the block, `result.error` is readable; the pending bindings remain pending (unreachable past the block on the in-block path because the block diverges).
- **`return error as ErrorType { ... }` validation.** `ErrorType` must literally appear in the enclosing function's `ErrorSet`. The field-init list must satisfy the error type's field requirements (v0.5: built-in errors have no required fields, so `{ }` is fine).
- **Unbound fallible.** Any fallible call not followed by `as resultName` is rejected.
- **CFG extension.** The check block is a sub-CFG attached to the basic block holding the `as result` binding. The existing return-coverage pass walks the sub-CFG and asserts every sink terminates with a diverging edge kind.

## Codegen changes

- **Result-struct synthesizer.** Walk the project; collect every distinct success-shape reachable through a fallible signature. Emit one C struct per shape into the per-TU runtime preamble:
  ```c
  typedef struct { uint8_t tag; int64_t value; } delta_result_int64;
  typedef struct { uint8_t tag; }                delta_result_void;
  typedef struct { uint8_t tag; struct { int32_t v0; int32_t v1; } value; } delta_result_int32_int32;
  ```
  Multi-value success gets a nested struct on the value side. Error-side fields are absent in v0.5 because built-in error types have none.
- **Error-kind table.** Emit a `static const char *const delta_result_error_names[] = { ... };` at the top of the runtime preamble, ordered by discriminant.
- **Fallible function lowering.** A Delta function returning `T | E_set` lowers to a C function returning `delta_result_<shape>`.
  - Success path: `return (delta_result_<shape>){ .tag = 0, .value = ... };`.
  - `return error as Ei { ... };` path: `return (delta_result_<shape>){ .tag = <discriminant_of_Ei> };`.
- **`as resultName` lowering.** The whole binding statement plus its matching `check` block lowers as a single C block:
  ```c
  delta_result_int64 __result_NN = <expr>;          /* __result_NN is the user's `resultName`, mangled */
  if (__result_NN.tag != 0) {
      /* body of check block — every path diverges */
      ...
  }
  /* now success values are bound */
  int64_t userBinding = __result_NN.value;          /* or assign into the user's LHS storage path */
  ```
  When the LHS is an assignment to an existing storage path (e.g. `this.value = expr as result;`), the success-extract goes into that path *after* the check block:
  ```c
  delta_result_int64 __result_NN = <expr>;
  if (__result_NN.tag != 0) { ... }
  self->value = __result_NN.value;
  ```
  The "commit after check" ordering matches the spec: success values are pending until the check proves error-divergence; they only commit to user-visible storage afterward.
- **Trap-helper `_result` variants.** Each trap-site operation gets a `_result`-suffixed helper:
  ```c
  static inline delta_result_int64 delta_rt_add_i64_result(int64_t a, int64_t b) {
      int64_t r;
      if (__builtin_add_overflow(a, b, &r)) {
          return (delta_result_int64){ .tag = OVERFLOW_KIND };
      }
      return (delta_result_int64){ .tag = 0, .value = r };
  }
  ```
  Codegen picks the `_result` variant when the analyzer marks the op as `as result`-wrapped.
- **`return error as Ei { }` lowering.** Direct emission of a result-struct literal with the matching tag.
- **Helper-emission gating.** The Phase A gating mechanism already tracks reachable trap kinds per TU. Extend it to include `_result` variants when the analyzer marks an op as `as result`-ed.

## Testing strategy

New fixtures under `test-source/tests/codegen/errors/`:

**`as result` (5)**
- `as_result_add_ok` — overflowing add bound with `as result`; check block returns 1; success path prints the sum.
- `as_result_div_ok` — divisor zero caught.
- `as_result_narrow_ok` — narrowing cast caught.
- `as_result_on_non_trap_err` — `as result` on a provably-infallible expression rejected ("this expression cannot fail").
- `as_result_assign_to_field_ok` — `this.value = expr as result;` form used in an `edit` method (the acceptance-program shape).

**`check` block (6)**
- `check_block_diverges_via_return_ok` — every path in the block ends in `return`.
- `check_block_diverges_via_panic_ok` — block calls `panic(...)`.
- `check_block_fallthrough_err` — block has a path that falls off the end; rejected.
- `check_block_partial_diverge_err` — `if cond { return 1; }` inside the block without an else; rejected.
- `check_in_non_fallible_propagator_err` — `return error as OverflowError { }` in a function that does not declare `OverflowError`; rejected.
- `check_after_pending_use_err` — pending binding read between `as result` and `check`; rejected.

**Signature validation (3)**
- `signature_unknown_error_err` — `function f(): int32 | NoSuchError` rejected.
- `signature_redundant_error_ok` — `int32 | OverflowError, OverflowError` deduplicated, no error.
- `signature_void_with_error_ok` — `function f(): void | OverflowError` legal; analyzer permits void+error combination.

**Codegen result struct (3)**
- `result_struct_shape_ok` — emitted struct has the expected shape (snapshot test).
- `multi_value_fallible_ok` — `(int32, int32) | OverflowError` result.
- `unbound_fallible_err` — calling a fallible function without `as resultName` rejected.

**`return error as` (2)**
- `return_error_ok` — function returns `error as OverflowError { }`; caller checks and propagates further.
- `return_error_not_in_set_err` — `return error as OverflowError { }` in a function whose `ErrorSet` doesn't contain `OverflowError`; rejected.

All prior-phase fixtures continue to pass. The Phase A trap fixtures now have a sibling `_as_result_ok` variant for each.

## Stage-by-stage implementation order

1. Predeclare built-in error types in the analyzer; extend the primordial scope.
2. Signature validation: error-set normalization, unknown-error rejection.
3. Parser: trailing `as <name>` on bindings/assignments/statements; `CheckBlockStatement`; `ReturnErrorStatement`.
4. Analyzer: per-binding *pending* state + reads-of-pending rejection.
5. Analyzer: `as result` typing — applicability (fallible call or trap-set op), provably-infallible rejection, success-shape matching.
6. Analyzer: `check` block validation — name match, body must fully diverge, no fall-through.
7. Analyzer: `return error as Ei { }` — Ei must be in enclosing function's `ErrorSet`.
8. Analyzer: unbound-fallible rejection.
9. Codegen: result-struct synthesizer with shape caching.
10. Codegen: `_result` trap-helper variants gated by analyzer markers.
11. Codegen: `as result` + `check` block lowering as a single `delta_result_<shape> __result_NN = <expr>; if (__result_NN.tag != 0) { <block> } <commit>;` shape.
12. Codegen: `return error as Ei { }` direct lowering.
13. Codegen: fallible function lowering (return struct).
14. Fixture suite.

Steps 1–8 are analyzer; steps 9–13 are codegen. The risk is in step 9 (synthesizer correctness), step 6 (correctly proving block-body divergence), and step 11 (commit-after-check ordering).

## Risks and open questions

- **Result-struct ABI.** Returning small structs by value in C is ABI-defined per target. On x86-64 SysV, structs ≤ 16 bytes fit in registers — fast. Larger value types go through hidden-pointer ABI — slower. For Phase C we don't optimize; clang handles both. Worth a sanity check that a `delta_result_int64` actually fits in two registers on common ABIs.
- **No statement-expression dependency.** Because `check` is a block statement (not an expression), the lowering is a plain `if` over a temp — no GCC `({...})` extension needed. The earlier (incorrect) version of this plan depended on statement-expressions; the spec-correct shape doesn't.
- **Error-set normalization.** Sorting by discriminant gives a stable representation. Two functions with the same set produce the same `ErrorSet` value. Equality is set equality. Comparing for `⊆` is bitset-and.
- **Pending-state lifetime past the check block.** After a `check resultName { ... }` block whose body fully diverges, the result-name itself goes out of scope (it was a fresh per-statement name); only the user's LHS bindings/storage transition from pending to valid. The analyzer must enforce that `resultName` is not visible past the block.
- **Multiple `as result` bindings in sequence.** `const a = call1() as r1; check r1 { return 1; } const b = call2() as r2; check r2 { return 2; }` — each result-name has its own scope. Names cannot collide within a function; the analyzer rejects shadowing (Phase B rule).
- **`as result` on assignment-form to a field.** `this.value = expr as result; check result { ... }` — the spec example. Lowering: temp holds the result; check block runs; on fall-through, commit to `self->value`. The commit happens *only* on fall-through, which is sound because the check block's body fully diverges.
- **Error-typed `void`.** `function f(): void | OverflowError` is sensible. The bound shape is empty success: `f() as result; check result { ... }` — no LHS bindings, just the result-name and its check.
- **What happens if `main` returns a fallible value?** Per the entry-point convention, `main` returns `int32`. It can declare an error set: `function main(): int32 | OverflowError`. If propagation reaches the entry shim, the C-level `main()` wrapper translates the tag into a nonzero exit code and prints `delta: error in main: <ErrorName>` to stderr. Land this as a small extension to the v0 entry shim.

## Definition of done

- The acceptance program's `<expr> as result` + `check result { return error as OverflowError { }; }` pattern compiles and runs.
- All Phase C fixtures pass, including the new `check_block_fallthrough_err` and `check_block_partial_diverge_err` cases.
- All earlier-phase fixtures continue to pass.
- Programs that read a pending binding before the matching `check` block get a precise diagnostic naming both positions.
- Programs that omit `as result` on a fallible call are rejected.
- Trap-ops can be promoted to recoverable form with `as result`; the `_result` helper variants are emitted only when used.
- Phase E (classes) can begin: methods can declare fallible return types using the now-stable result-struct machinery and use the spec-correct `as result` + `check` block form for trap-handling inside method bodies.
