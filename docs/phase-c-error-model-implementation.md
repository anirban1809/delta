# Phase C Error Model — Implementation Notes

Date implemented: 2026-07-18

This document records the Phase C implementation that landed in the TypeScript compiler and the `test-source/tests/errors/` fixture suite. It complements the planning document at [`docs/plans/goal-v0.5/phase-c-error-model.md`](plans/goal-v0.5/phase-c-error-model.md): the plan describes the intended language model, while this document describes the code that now implements it.

## Implemented language surface

The compiler now accepts user-declared struct error types, fallible signatures, checked success bindings, explicit error returns, and unchanged forwarding:

```delta
type struct OverflowError = { };

function increment(x: int32): int32 | OverflowError {
    const value = x + 1 as result;
    forward result;
    return value;
}

function main(): int8 {
    const value = increment(4) as result;
    check result {
        return 1;
    }
    return 0;
}
```

The following forms are implemented:

- `T | E1, E2` and `void | E` function signatures.
- Error-set validation against `type struct` declarations, including duplicate removal.
- `const value = expression as resultName;`.
- `storage = expression as resultName;` with commit-after-check semantics.
- `fallibleVoidCall() as resultName;`.
- `check resultName { ... }`, with every internal path required to diverge.
- `check resultName as ErrorType { ... }` for exhaustive multi-error handling. Every returned error type is mandatory, duplicate checks are rejected, and success remains pending until the final variant is covered.
- `forward resultName;`, provided the error variants remaining after typed checks are a subset of the enclosing function's error set.
- `return error as { ... };`, whose anonymous literal is pinned by the enclosing error set.
- `return error as existingError;` for an already-typed error value.
- Rejection of unbound fallible calls and reads of pending success bindings.
- Recoverable `as result` lowering for checked arithmetic, division/modulo, shift counts, and trapping primitive conversions.

## AST changes

File: [`src/ast/types.ts`](../src/ast/types.ts)

The executable statement union now includes the three error-control statements. Existing binding, assignment, and expression statements carry an optional `asResult` clause so the original success expression remains in its normal AST position.

```ts
export type AsResultBinding = {
    kind: "as_result_binding";
    position: Position;
    resultName: Identifier;
    successType?: Type;
    errorTypes?: Type[];
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
    value: Expression;
    resolvedErrorType?: Type;
};
```

`ReturnStatement.expression` is now optional so `return;` represents a real void return rather than forcing a placeholder expression.

## Parser changes

File: [`src/ast/parser.ts`](../src/ast/parser.ts)

### Function error sets

After parsing the success type list, `parseFuncDecl` now consumes `|` and a comma-separated error set:

```ts
if (this.current().kind == TokenKind.Symbol_Pipe) {
    this.advance();
    const parsedErrors = this.parseFuncErrorTypes();
    if (!parsedErrors) return;
    errorTypes = parsedErrors;
}
```

Each error entry is initially parsed as a normal `Type`; semantic analysis later proves that it resolves to a struct declaration.

### Result suffixes and control statements

`parseAsResultBinding` consumes the shared suffix:

```ts
parseAsResultBinding(): U<AsResultBinding> {
    if (this.current().kind != TokenKind.Keyword_As) return;
    const keyword = this.advance();
    const name = this.expect(TokenKind.Kind_Identifier, "result identifier expected after as");
    if (!name) return;
    return {
        kind: "as_result_binding",
        position: getTokenPosition(keyword),
        resultName: CreateIdentifier(name.value),
    };
}
```

Variable declarations, assignments, and expression statements call this helper before consuming their terminating semicolon. Statement dispatch also recognizes `check`, `forward`, and the `return error as` branch.

Anonymous object literals are accepted at expression position so typed declarations and error returns can use `{ field: value }`. Generic-call lookahead was separated from the `<` comparison operator; `f<T>()` is parsed as a generic call, while `x < 0` remains a comparison.

## Semantic-analysis changes

Files:

- [`src/analysis/declarations.ts`](../src/analysis/declarations.ts)
- [`src/analysis/analyzer.ts`](../src/analysis/analyzer.ts)
- [`src/analysis/expression_analyzer.ts`](../src/analysis/expression_analyzer.ts)
- [`src/analysis/statements/statement.ts`](../src/analysis/statements/statement.ts)
- [`src/analysis/statements/return_statement.ts`](../src/analysis/statements/return_statement.ts)
- [`src/analysis/statements/variable_declaration.ts`](../src/analysis/statements/variable_declaration.ts)

### Signature validation

For each declared error type, `DeclarationAnalyzer` now:

1. Rejects primitive entries with “must be a declared record type.”
2. Rejects unresolved names with “unknown type identifier.”
3. Requires `SymbolTypeStructDecl`.
4. Removes duplicate names while preserving declaration order.
5. Writes the normalized list back to both `FunctionDeclaration.errorTypes` and `FunctionSignature.errorTypes`.

### Pending result state

`BlockContext` owns the live result-name table:

```ts
export type PendingResult = {
    name: string;
    position: Position;
    bindings: string[];
    successType?: Type;
    errorTypes: Type[];
    handledErrorTypes: Set<string>;
};
```

When `as resultName` is analyzed, the compiler determines whether the source expression is fallible, records its success/error types on the AST, registers the live result, and marks each success binding with `Symbol.pendingResult`.

Identifier analysis rejects a read while that marker is present:

```ts
if (s.pendingResult) {
    diagnostics.addError(/* binding is pending; check or forward first */);
    return CreateType("invalid", TypeValue.TypeInvalid);
}
```

A single-error check, the final exhaustive typed check, or a successful `forward` consumes the result-name and clears the pending markers. Earlier typed checks record their selected variant in `handledErrorTypes` but deliberately keep the result live.

### Fallibility classification

The statement analyzer recognizes:

- Calls whose `FunctionSignature.errorTypes` is non-empty.
- `+`, `-`, and `*` as `OverflowError` sites.
- `/` and `%` as `DivideByZeroError` sites.
- `<<` and `>>` as `ShiftCountError` sites.
- Narrowing, sign-changing, and float-to-integer conversions as `NarrowingError` sites.

Applying `as result` to an expression outside that set produces “this expression cannot fail.” Calling a fallible function without the suffix produces the structured “fallible call … must be followed by `as result`” diagnostic.

### `check` divergence

The implementation performs a structural all-path test over the check body:

- `return`, `return error`, `break`, and `continue` diverge.
- A nested block diverges when its statement sequence reaches a guaranteed diverging statement.
- An `if` diverges only when it has an `else` and both branches diverge.

A body with a fall-through path receives “every path in a check block must diverge.” The existing placement checks still reject `break`/`continue` outside loops.

### Exhaustive multi-error checks

For a result carrying more than one error type, every variant must be selected exactly once:

```delta
const value = calculate() as result;
check result as OverflowError {
    return 1;
}
check result as DivideByZeroError {
    return 2;
}
// `value` becomes valid here.
```

The analyzer rejects an untyped multi-error check, a type outside the result's error set, a duplicate typed check, or a result that reaches function end with unchecked variants. The function-end diagnostic lists every missing error type. Single-error results retain the concise `check result { ... }` form, and may also use its typed form.

The emitter compares each typed check against that error type's stable tag. It preserves the hidden result temporary between checks and emits the success-value commit only after the check marked `dischargesResult` by analysis.

### Error returns

Anonymous error literals are matched by their exact field-name set against the enclosing function's normalized error set. An identifier form is matched by its resolved struct type. The selected type is stored in `ReturnErrorStatement.resolvedErrorType` for code generation. No match, or use in a non-fallible function, produces an error-set diagnostic.

### `forward`

`forward resultName;` requires a live pending result and checks:

```text
RemainingErrorSet = ResultErrorSet − HandledErrorSet
RemainingErrorSet ⊆ EnclosingFunctionErrorSet
```

This permits partial handling followed by unchanged forwarding:

```delta
function handleOverflow(): int32 | DivideByZeroError {
    const value = calculate() as result;
    check result as OverflowError {
        return 0;
    }
    forward result;
    return value;
}
```

The analyzer computes the remaining set directly from the pending result state:

```ts
const remaining = pending.errorTypes.filter(
    (errorType) => !pending.handledErrorTypes.has(errorType.name.name),
);
const missing = remaining.find(
    (errorType) => !enclosing.some((allowed) => allowed.name.name == errorType.name.name),
);
```

It never widens the function signature or transforms the forwarded errors. Because every preceding typed-check body must diverge, execution reaching `forward` proves those handled tags are not active. The error CFG edge returns any remaining tag; the success edge discharges the pending state and continues.

## C code-generation changes

File: [`src/codegen/emitter.ts`](../src/codegen/emitter.ts)

### Tagged result structs

The emitter collects every fallible success shape and emits a tagged value type before function prototypes:

```c
typedef struct delta_result_int64 {
    uint8_t tag;
    int64_t value;
} delta_result_int64;
```

`tag == 0` means success. Nonzero tags identify an error type. `void | E` uses a tag-only `delta_result_void`.

Fallible function signatures return the synthesized result type. Ordinary success returns become:

```c
return (delta_result_int64){ .tag = 0, .value = value };
```

Error returns become tag-only error results:

```c
return (delta_result_int64){ .tag = error_tag };
```

### `as result` and commit ordering

The binding site first evaluates into a hidden result temporary. For checked addition, the emitted shape is:

```c
delta_result_int64 __delta_result_0;
int64_t __delta_value_1;
if (__builtin_add_overflow(a, b, &__delta_value_1))
    __delta_result_0 = (delta_result_int64){ .tag = overflow_tag };
else
    __delta_result_0 = (delta_result_int64){ .tag = 0, .value = __delta_value_1 };
```

The matching check emits the error branch first and only then commits the success value:

```c
if (__delta_result_0.tag != 0) {
    return (delta_result_int64){ .tag = overflow_tag };
}
int64_t sum = __delta_result_0.value;
```

Assignment form uses the same ordering but commits with `target = temporary.value`. Void form has no commit.

Fallible calls already return a result struct and are assigned directly to the hidden temporary. Recoverable arithmetic uses overflow builtins or explicit divisor/shift checks. Recoverable conversions reuse the same range/NaN conditions as the trapping conversion runtime.

### Forward lowering

The received tag is returned unchanged in the caller's result shape:

```c
if (__delta_result_0.tag != 0) {
    return (delta_result_caller_shape){ .tag = __delta_result_0.tag };
}
```

This reconstruction matters when caller and callee have different success types.

## Formatter changes

File: [`src/ast/formatter.ts`](../src/ast/formatter.ts)

The AST formatter now renders `asResult` metadata and the `check_block_statement`, `forward_statement`, and `return_error_statement` discriminants, keeping parser/AST inspection useful for the new surface.

## Test-suite changes

Directory: [`test-source/tests/errors/`](../test-source/tests/errors/)

- Updated 38 record-shaped error declarations to the `type struct` syntax.
- Updated struct fields to comma-separated declaration syntax.
- Retained the original signature, binding, pending-state, check, return, and codegen fixtures.
- Added `forward_result_ok.delta`.
- Added `forward_error_not_in_set_err.delta`.
- Added `forward_unknown_result_err.delta`.
- Added `forward_remaining_errors_ok.delta`.
- Added `forward_remaining_error_not_in_set_err.delta`.
- Added exhaustive multi-error success, missing-variant, untyped-check, and duplicate-check fixtures.

Final dedicated result:

```text
errors (44 tests)
44 passed, 0 failed, 44 total
```

In addition to the fixture runner, every positive error fixture was emitted to C, compiled with the system C compiler, and executed. All 22 original positive fixtures exited successfully. `forward_result_ok` also compiled and exited successfully, and a separate overflow-path check verified that an `int32` overflow forwarded through one function was observed by the caller's `check` branch.

## Current representation boundary

The C result ABI currently carries the error discriminant but not user-declared error payload fields. Payload fields participate in semantic literal matching, while runtime propagation is tag-only. This matches the Phase C tag-only lowering used by the current suite; materializing error payload storage is a later ABI extension and must preserve the active payload unchanged through `forward`.
