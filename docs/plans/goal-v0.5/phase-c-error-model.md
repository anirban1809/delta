# Plan: Phase C — Error Model (v0.5)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phases **I, D, J, A, B** landed. In particular, Phase A's trap helpers and Phase B's CFG + dataflow framework are direct dependencies.
Successor: Phase K (custom types) builds on this — user-declared `type struct` error types can participate in fallible signatures. Receiver methods added by later phases can return fallible types as well.
Spec basis: [main-spec.md](../../main-spec.md) §22 (`return error as`), §23 (`as result`), §24 (`check` block), §25 (multi-return), §26 (`void | ErrorType`); [spec-sections/05-primitive-numeric-types.md](../../spec-sections/05-primitive-numeric-types.md) §5.5. The accepted `forward result` addition is recorded in [improvement-ideas.md](../../improvement-ideas.md#1-forward-result-statement--accepted).

## Goal

Wire the recoverable-error story end-to-end per spec §22–§26: fallible function signatures, `as resultName` as the binding form (success values are *pending*), exhaustive typed checks for multi-error results, `check resultName { ... }` as the single-error handling form, `forward resultName;` as unchanged propagation to the caller, `return error as ErrorType { ... }` as explicit error construction, and codegen as a tagged result struct in C. Tie Phase A's trap sites into the same fallible machinery so an overflow can either trap (default) or be caught (`as result`).

After Phase C:

```delta
function safeAdd(a: int64, b: int64): int64 | OverflowError {
    const sum = a + b as result;
    check result {
        return error as OverflowError { };
    }
    return sum;
}

function main(): int8 {
    const x = safeAdd(1_000_000_000_000, 999) as result;
    check result {
        return 1;
    }
    info("result", x);
    return 0;
}
```

…compiles, runs, prints `[INFO] result: 1000000000999`, exits 0. A variant that adds `int64_MAX + 1` causes `safeAdd`'s `check` to fire, propagating an `OverflowError`; main's `check` then fires and main returns 1.

When the caller declares every error that remains unhandled at the forwarding point, `forward` is the concise identity-propagation form:

```delta
function addThenForward(a: int64, b: int64): int64 | OverflowError {
    const x = safeAdd(a, b) as result;
    forward result;
    return x;
}
```

If `safeAdd` fails, `forward result;` returns that same error to `addThenForward`'s caller. On success it falls through and makes `x` valid. Use `check` instead when the error must be handled, transformed, or wrapped.

Typed checks narrow a live multi-error result. This allows a function to handle selected variants locally and forward the rest without repeating their names:

```delta
function calculateSafe(): int32 | DivideByZeroError {
    const value = calculate() as result;
    check result as OverflowError {
        return 0;
    }
    forward result; // only DivideByZeroError remains
    return value;
}
```

## In-scope language surface

- End-to-end handling of fallible signatures `T | E1, E2, ...` and `T1, T2 | E` (the parser already accepts the shape; Phase C validates and lowers).
- Built-in error types: `OverflowError`, `DivideByZeroError`, `NarrowingError`, `ShiftCountError`. Predeclared in the analyzer's primordial scope.
- `expr as resultName` binding form — applies to fallible function calls and to trapping arithmetic / cast operations from Phase A's closed trap set. Success values are bound by name; for multi-value success, comma-separated bindings (`const a, b = call() as result;`). The result-name (`resultName`) is the user-chosen identifier consumed by a following `check` or `forward` statement.
- The bound success names are *pending*: readable for type-purposes during analysis but the analyzer rejects every actual read until a `check` block proves the error path diverges or `forward resultName;` propagates the error unchanged.
- `check resultName { ... }` handles the sole error type of a single-error result. A multi-error result requires one `check resultName as ErrorType { ... }` block for every member of its declared error set. Each typed block runs only when its selected variant is active, and every path in each block must diverge. The success bindings remain pending until the final required variant has been checked.
- `forward resultName;` statement — if the named result contains an error that was not handled by an earlier typed check, immediately return that same error to the caller; otherwise continue and validate the pending success bindings. It is legal when the remaining unchecked error set is a subset of the enclosing function's declared error set. It never transforms, widens, or wraps an error.
- `return error as ErrorType { ... }` — produces a fallible value in the error state. Only legal inside a function whose declared error set contains `ErrorType`. The `{ ... }` initializer populates the error type's fields like a struct object literal (Phase K's `type struct` literal rules apply; for v0.5, built-in error types have no required fields, so `OverflowError { }` is sufficient).
- Codegen: synthesized tagged-result C structs per success-type shape; `as result` writes a `delta_result_<shape>` value into a hidden binding; an untyped single-error check lowers to `if (result.tag != 0)`, while a typed check lowers to `if (result.tag == ErrorTypeTag)`; `forward result;` lowers to an error-tag test and return; `return error as E { }` lowers to setting the tag and returning.
- Fallible-call rejection without `as result`: a bare fallible call (no `as result`, no `ignore`) is a structured diagnostic, per spec §23.

## Explicitly out of scope for Phase C

| Feature | Reason | Eventual home |
|---|---|---|
| User-defined error types | Spec allows them, but Phase C uses the built-in set only. A future declaration uses the explicit struct form, for example `type struct MyError = { code: int32 };`; the obsolete bare record spelling `type MyError = { ... };` is not used. | Phase K (`type struct`). |
| `ignore expr;` form for explicit error-drop (spec §27) | Out of v0.5; non-essential for the goal. | Post-v0.5. |
| `return error as TargetType { ... }` *type-reshaping* — propagating one error type as a different declared error type | Spec §22 allows this; for v0.5 the propagated error type must literally match a member of the enclosing function's declared error set. | Post-v0.5. |
| Allocation-failure errors (`AllocError`) | Needed for `heap T` in Phase H; predeclared *in* Phase C but only constructed once Phase H emits heap allocations. | Phase H consumes; Phase C predeclares. |
| Mapping / transforming errors | No combinator surface in v0.5. | Post-v0.5. |

## What's missing today

- `forward` is already reserved by the current tokenizer but is not parsed as a statement. Phase C retains it alongside the `as`, `check`, and `error` keyword set.
- The parser doesn't recognize the `as resultName` suffix on bindings/expression statements, the `check resultName { ... }` block statement, `forward resultName;`, or `return error as ErrorType { ... }`.
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
   - `existingField = expr as resultName;` — assignment-form: the storage path receives the success value (also marked *pending* until the matching `check` or `forward`). This form is used in `edit` methods to update fields.
6. **`check` is exhaustive over the result's error set.** It is a block statement, not an expression. `check resultName { ... }` is permitted when the result has one error type. When the result has multiple errors, the program must contain exactly one `check resultName as ErrorType { ... }` for every error type returned by the source expression. Untyped multi-error checks, unknown variants, duplicate variants, and omitted variants are compile errors. Each block must diverge on every path. The result remains live and its success bindings remain pending between typed checks; the final required check discharges it.
7. **`forward resultName;` is identity propagation with narrowing.** It consumes a live result-name introduced by `as resultName`. Earlier typed checks remove their variants from the result's live error set because their blocks diverge whenever those tags are active. `forward` returns any remaining error unchanged and validates only `RemainingErrorSet ⊆ EnclosingErrorSet`. On success it falls through and validates the pending success bindings. No implicit widening, reshaping, or payload transformation occurs.
8. **Pending-state lattice.** A binding (or storage path) targeted by `as resultName` enters the analyzer's per-binding *pending* state from the `as result` site forward. Reads of a pending binding are errors. A single-error check, the final exhaustive typed check, or a valid `forward resultName;` transitions the binding to *valid* on its success fall-through path.
9. **A result must be discharged exhaustively or forwarded once.** The lifecycle is: introduced by `as resultName`; zero or more typed checks narrow its live error set; then either the final variants are handled by checks or the remaining set is consumed by one `forward resultName;`. Repeating a typed variant is rejected, and reaching the end of the function with unchecked, unforwarded variants reports their names.
10. **`return error as ErrorType { ... }` is the explicit construction/transformation form.** Used inside `check` blocks (and elsewhere) to construct or transform an error returned from the enclosing function. The `{ ... }` initializer follows the struct object-literal rules associated with a `type struct` error declaration; v0.5 built-in errors have no required fields. The enclosing function's error set must contain `ErrorType` literally (no widening per Phase C). Unchanged propagation should use `forward`.
11. **A fallible call without `as result` is an error.** Per spec §23, every fallible call must be bound. A bare `fallibleCall();` or `let x = fallibleCall();` (without `as result`) is rejected with "fallible result must be bound via `as resultName` and then checked or forwarded."
12. **Predeclared error types live in the analyzer's primordial scope.** `OverflowError`, `DivideByZeroError`, `NarrowingError`, `ShiftCountError`, `AllocError`. Each is a `SymbolErrorType` with a stable discriminant. Shadowing them is rejected by the Phase B shadowing rule.
13. **CFG extension: `check` and `forward` are guarded error edges.** A `check resultName { ... }` block contributes a guarded sub-CFG whose entry is conditioned on `resultName.error != none`; every sink in that subgraph must diverge. A `forward resultName;` contributes an error edge that returns from the enclosing function and a success edge that continues after validating the pending bindings. `forward` is therefore conditional control flow, not an unconditional terminator.

### Custom-type declaration syntax

When this plan refers to custom types supplied by later phases, it uses the settled declaration family:

```delta
type struct Point = { x: float64, y: float64 };
type enum Color = { Red, Green, Blue };
type union Shape = Circle{ radius: float64 } | Square{ side: float64 };
type Coordinate = Point;
```

`type struct`, `type enum`, and `type union` introduce fresh custom types. The bare `type Name = Existing;` form is reserved for transparent aliases; it does not declare a struct. Consequently, user-defined record-shaped error types are declared with `type struct`, never the older `type ErrorName = { ... };` spelling.

## Tokenizer changes

- Required error-model keywords: `as`, `check`, `forward`, `error`. `forward` is already reserved in the current tokenizer; `error` is needed for `return error as ErrorType { }` and is a contextual keyword in spec §22.
- `result` is **not** a keyword; it's a user-chosen identifier following `as`. The parser doesn't need to treat it specially.

## Parser changes

- Extend variable-declaration and assignment-statement productions to accept a trailing `as <identifier>` suffix on the initializer/RHS. The identifier becomes the result-name.
  - `const <bindings> = <expr> as <name>;`
  - `let <binding> = <expr> as <name>;`
  - `<storage_path> = <expr> as <name>;`
  - `<expr> as <name>;` (when the success type is `void` — analyzer enforces)
- New AST nodes:
  ```ts
  export type AsResultBinding = {
      kind: "as_result_binding";
      position: Position;
      expression: Expression;
      resultName: Identifier;
  };

  export type CheckBlockStatement = {
      kind: "check_block_statement";
      position: Position;
      resultName: Identifier;
      errorType?: Type;
      dischargesResult?: boolean;
      body: BlockStatement;
  };

  export type ForwardStatement = {
      kind: "forward_statement";
      position: Position;
      resultName: Identifier;
  };

  export type ReturnErrorStatement = {
      kind: "return_error_statement";
      position: Position;
      errorType: Type;
      initializer: ObjectLiteralExpression;
  };
  ```
- Recognize both `check <identifier> { ... }` and `check <identifier> as <ErrorType> { ... }` at statement position; produce `CheckBlockStatement`.
- Recognize `forward <identifier>;` at statement position; produce `ForwardStatement`.
- Recognize `return error as <TypeName> { ... };` at statement position; produce `ReturnErrorStatement`.
- Extend the `Statement` discriminated union with `CheckBlockStatement`, `ForwardStatement`, and `ReturnErrorStatement`.
- `FunctionDeclaration.errorTypes` is already parsed; no change to the signature shape.

## Semantic analyzer changes

- **Predeclared error types.** Extend the primordial scope with the five built-ins. Each carries the stable discriminant.
- **Signature validation.** Validate every entry in `FunctionDeclaration.errorTypes` resolves to an error type. Unknown names get "unknown error type; only built-in error types are available in v0.5." Normalize the set (sort, dedup) and store it on `FunctionSignature.errorTypes`.
- **`as result` typing.**
  - Inner expression must be fallible (call to a function with non-empty `ErrorSet`) or in the Phase A closed trap set.
  - Inner expression's success type matches the LHS binding/storage shape; mismatch is a binding-error diagnostic.
  - Provably-infallible inner expressions get "this expression cannot fail; remove `as result`."
  - The result-name is bound in a fresh per-statement *result scope*; only `result.error` is readable, and only inside the matching `check` block. `forward result;` refers to the result-name but does not expose its error payload to user code.
  - The LHS bindings/storage transition to *pending* in the analyzer's per-binding state map.
- **Pending-state propagation.** Every read of a pending binding is an error; the diagnostic names the `as result` site and says that the result must be checked or forwarded. Pending → valid happens on the success path past either a fully-diverging `check resultName { ... }` block or a valid `forward resultName;` statement.
- **`check` block validation.**
  - The result-name must match a preceding `as <name>` whose pending bindings are still pending at this point (no intervening read or shadowing).
  - If the result has multiple error types, every check must select one returned type with `as ErrorType`; all variants are mandatory and duplicates are rejected.
  - The result is discharged only after the selected-type set equals the result's normalized error set. A function-end diagnostic lists any missing checks.
  - The block body must have every CFG sink be a diverging terminator. The dataflow check is the same shape as Phase B's return-coverage; reuse it.
  - Inside the block, `result.error` is readable; the pending bindings remain pending (unreachable past the block on the in-block path because the block diverges).
- **`forward` validation.**
  - The result-name must match a preceding, still-live `as <name>` result in the same basic block.
  - Compute `RemainingErrorSet = ResultErrorSet − HandledErrorSet`, where `HandledErrorSet` contains the variants selected by preceding fully-diverging typed checks.
  - Every remaining error type must appear in the enclosing function's normalized `FunctionSignature.errorTypes`; equivalently, `RemainingErrorSet ⊆ EnclosingErrorSet`.
  - If any type is missing, reject the statement with a diagnostic such as "cannot forward `IOError`; this function returns `Success | NetError`." The analyzer never widens a function signature implicitly.
  - On success, consume the result-name and validate its pending bindings. On error, add a return edge to the CFG. A second `check` or `forward` of the same result-name is an unknown/consumed-result diagnostic.
- **`return error as ErrorType { ... }` validation.** `ErrorType` must literally appear in the enclosing function's `ErrorSet`. The field-init list follows the object-literal coverage rules for the error type's `type struct` declaration (v0.5: built-in errors have no required fields, so `{ }` is fine).
- **Unbound fallible.** Any fallible call not followed by `as resultName` is rejected.
- **CFG extension.** The check block is a sub-CFG attached to the basic block holding the `as result` binding. The existing return-coverage pass walks the sub-CFG and asserts every sink terminates with a diverging edge kind. `forward` adds a guarded return edge plus a normal success continuation.

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
- **`as resultName` lowering.** The whole binding statement plus its matching discharge statement (`check` or `forward`) lowers as a single C block. With `check`:
  ```c
  delta_result_int64 __result_NN = <expr>;          /* __result_NN is the user's `resultName`, mangled */
  if (__result_NN.tag != 0) {
      /* body of check block — every path diverges */
      ...
  }
  /* now success values are bound */
  int64_t userBinding = __result_NN.value;          /* or assign into the user's LHS storage path */
  ```
  With `forward`, codegen returns the same global error discriminant in the enclosing function's result shape:
  ```c
  delta_result_int64 __result_NN = callee();
  if (__result_NN.tag != 0) {
      return (delta_result_caller_shape){ .tag = __result_NN.tag };
  }
  int64_t userBinding = __result_NN.value;
  ```
  The callee and caller may have different success shapes, so codegen reconstructs the caller's result struct rather than returning the callee's struct directly. The analyzer has already proved that the callee's error set is a subset of the caller's. Phase C errors carry only their global tag; when error payloads land, this lowering must copy the selected payload unchanged as well.
  When the LHS is an assignment to an existing storage path (e.g. `this.value = expr as result;`), the success-extract goes into that path *after* the discharge statement. For a `check` block:
  ```c
  delta_result_int64 __result_NN = <expr>;
  if (__result_NN.tag != 0) { ... }
  self->value = __result_NN.value;
  ```
  The "commit after discharge" ordering matches the spec: success values are pending until `check` proves error-divergence or `forward` proves that execution is on the success path; they only commit to user-visible storage afterward.
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
- **`forward resultName` lowering.** Emit a tag test and return a caller-shaped error result carrying the received tag unchanged. Do not run success extraction or storage commit on the error edge.
- **Helper-emission gating.** The Phase A gating mechanism already tracks reachable trap kinds per TU. Extend it to include `_result` variants when the analyzer marks an op as `as result`-ed.

## Testing strategy

New fixtures under `test-source/tests/codegen/errors/`:

**`as result` (5)**
- `as_result_add_ok` — overflowing add bound with `as result`; check block returns 1; success path prints the sum.
- `as_result_div_ok` — divisor zero caught.
- `as_result_narrow_ok` — narrowing cast caught.
- `as_result_on_non_trap_err` — `as result` on a provably-infallible expression rejected ("this expression cannot fail").
- `as_result_assign_to_field_ok` — `this.value = expr as result;` form used in an `edit` method (the acceptance-program shape).

**`check` block**
- `check_block_diverges_via_return_ok` — every path in the block ends in `return`.
- `check_block_diverges_via_panic_ok` — block calls `panic(...)`.
- `check_block_fallthrough_err` — block has a path that falls off the end; rejected.
- `check_block_partial_diverge_err` — `if cond { return 1; }` inside the block without an else; rejected.
- `check_in_non_fallible_propagator_err` — `return error as OverflowError { }` in a function that does not declare `OverflowError`; rejected.
- `check_after_pending_use_err` — pending binding read between `as result` and `check`; rejected.
- `check_multi_error_exhaustive_ok` — two typed blocks cover `OverflowError` and `DivideByZeroError`, then the success binding becomes readable.
- `check_multi_error_missing_err` — one declared error variant is omitted; rejected with the missing type name.
- `check_multi_error_untyped_err` — untyped check over a multi-error result; rejected.
- `check_multi_error_duplicate_err` — the same typed variant is checked twice; rejected.

**`forward` statement**
- `forward_matching_error_ok` — caller and callee both admit `OverflowError`; the received error reaches the caller unchanged.
- `forward_subset_ok` — a result carrying `OverflowError` forwards through a function declaring `OverflowError, DivideByZeroError`.
- `forward_success_validates_binding_ok` — after `forward result;` falls through, the success binding is readable.
- `forward_void_success_ok` — `void | OverflowError` can be forwarded without a success binding.
- `forward_error_not_in_caller_err` — reject forwarding `IOError` from a function whose declared set contains only `NetError`.
- `forward_unknown_result_err` — reject a name not introduced by a live `as resultName` binding.
- `forward_consumed_result_err` — reject checking or forwarding the same result-name a second time.
- `forward_after_pending_use_err` — reject reading a pending success binding before its `forward` statement.
- `forward_remaining_errors_ok` — handle one variant with a typed check, then forward only the remaining variant through a narrower function error set.
- `forward_remaining_error_not_in_set_err` — reject a remaining variant that is absent from the enclosing function's error set, even when another variant was already handled.

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
3. Parser: trailing `as <name>` on bindings/assignments/statements; `CheckBlockStatement`; `ForwardStatement`; `ReturnErrorStatement`.
4. Analyzer: per-binding *pending* state + reads-of-pending rejection.
5. Analyzer: `as result` typing — applicability (fallible call or trap-set op), provably-infallible rejection, success-shape matching.
6. Analyzer: `check` block validation — name match, body must fully diverge, no fall-through.
7. Analyzer: `forward` validation — live result-name, remaining-error-set subset check after typed-check narrowing, pending-to-valid success edge, guarded return edge.
8. Analyzer: `return error as Ei { }` — Ei must be in enclosing function's `ErrorSet`.
9. Analyzer: unbound-fallible rejection.
10. Codegen: result-struct synthesizer with shape caching.
11. Codegen: `_result` trap-helper variants gated by analyzer markers.
12. Codegen: `as result` + `check` lowering as a single `delta_result_<shape> __result_NN = <expr>; if (__result_NN.tag != 0) { <block> } <commit>;` shape.
13. Codegen: `as result` + `forward` lowering as a tag test, caller-shaped error return, then success commit.
14. Codegen: `return error as Ei { }` direct lowering.
15. Codegen: fallible function lowering (return struct).
16. Fixture suite.

Steps 1–9 are analyzer; steps 10–15 are codegen. The risks are in step 10 (synthesizer correctness), step 6 (correctly proving block-body divergence), and steps 12–13 (commit-after-discharge ordering and caller-shaped forwarding).

## Risks and open questions

- **Result-struct ABI.** Returning small structs by value in C is ABI-defined per target. On x86-64 SysV, structs ≤ 16 bytes fit in registers — fast. Larger value types go through hidden-pointer ABI — slower. For Phase C we don't optimize; clang handles both. Worth a sanity check that a `delta_result_int64` actually fits in two registers on common ABIs.
- **No statement-expression dependency.** Because `check` is a block statement (not an expression), the lowering is a plain `if` over a temp — no GCC `({...})` extension needed. The earlier (incorrect) version of this plan depended on statement-expressions; the spec-correct shape doesn't.
- **Error-set normalization.** Sorting by discriminant gives a stable representation. Two functions with the same set produce the same `ErrorSet` value. Equality is set equality. Comparing for `⊆` is bitset-and.
- **Pending-state lifetime past discharge.** After a fully-diverging `check resultName { ... }` or a valid `forward resultName;`, the result-name itself goes out of scope (it was a fresh per-statement name); only the user's LHS bindings/storage transition from pending to valid on the success path. The analyzer must enforce that `resultName` is not visible afterward.
- **Multiple `as result` bindings in sequence.** `const a = call1() as r1; check r1 { return 1; } const b = call2() as r2; check r2 { return 2; }` — each result-name has its own scope. Names cannot collide within a function; the analyzer rejects shadowing (Phase B rule).
- **`as result` on assignment-form to a field.** `this.value = expr as result; check result { ... }` — the spec example. Lowering: temp holds the result; check block runs; on fall-through, commit to `self->value`. The commit happens *only* on fall-through, which is sound because the check block's body fully diverges.
- **Error-typed `void`.** `function f(): void | OverflowError` is sensible. The bound shape is empty success: `f() as result; check result { ... }` or `f() as result; forward result;` — no LHS bindings, just the result-name and its discharge statement.
- **Forwarding across different success shapes.** Identity propagation applies to the error channel, not the entire C result struct. A callee returning `int64 | OverflowError` can be forwarded by a caller returning `void | OverflowError`; codegen must construct the caller's result shape with the received tag. Returning the callee's C struct directly would be a type error.
- **Error payload preservation.** Phase C's built-in errors are tag-only, so forwarding copies the discriminant. When user-defined error payloads are represented in C, `forward` must copy the active payload byte-for-byte/field-for-field without invoking object-literal construction or transformation.
- **What happens if `main` returns a fallible value?** Per the entry-point convention, `main` returns `int8`. It can declare an error set: `function main(): int8 | OverflowError`. If propagation reaches the entry shim, the C-level `main()` wrapper translates the tag into a nonzero exit code and prints `delta: error in main: <ErrorName>` to stderr. Land this as a small extension to the v0 entry shim.

## Definition of done

- The acceptance program's `<expr> as result` + `check result { return error as OverflowError { }; }` pattern compiles and runs.
- The identity-propagation pattern `<expr> as result; forward result;` compiles, returns the received error unchanged, and validates the success binding on fall-through.
- The partial-handling pattern `check result as E1 { ... }` followed by `forward result;` forwards only the unchecked variants and permits the enclosing function to omit `E1` from its declared error set.
- All Phase C fixtures pass, including the new `check_block_fallthrough_err` and `check_block_partial_diverge_err` cases.
- All earlier-phase fixtures continue to pass.
- Programs that read a pending binding before the matching `check` or `forward` get a precise diagnostic naming both positions.
- Programs that omit `as result` on a fallible call are rejected.
- Trap-ops can be promoted to recoverable form with `as result`; the `_result` helper variants are emitted only when used.
- Later receiver methods can declare fallible return types using the now-stable result-struct machinery and use `as result` followed by either `check` (handle/transform) or `forward` (propagate unchanged).
