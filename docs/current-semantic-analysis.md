# Current Semantic Analysis Rules

Snapshot: 2026-06-15

Primary implementation: [`internal/semantics/semantics.go`](../internal/semantics/semantics.go)

Supporting definitions:

- [`internal/semantics/types.go`](../internal/semantics/types.go)
- [`internal/ast/types.go`](../internal/ast/types.go)
- [`internal/pipeline/pipeline.go`](../internal/pipeline/pipeline.go)

This document describes what the current analyzer does, including behavior
that is incomplete or accidental. It is a rewrite reference, not a language
specification. Parser-only checks are called out as boundaries rather than
being attributed to semantic analysis.

## Analyzer Outputs

`Analyzer.Analyze()` mutates the supplied diagnostic bag and produces:

| Output | Meaning |
|---|---|
| `GlobalScope` | File-level symbols. |
| `Refs` | Identifier use position to resolved `Symbol`, for LSP navigation and codegen. |
| `RootScope` | Position-ranged scope tree for LSP completion. |
| `Records` | Fully resolved record fields for records, aliases, and compositions. |
| `Conversions` | Numeric/character conversions keyed by call position. |
| `Divisions` | Integer `/` and `%` expressions keyed by position. |
| `Shifts` | Integer `<<` and `>>` expressions keyed by position. |
| `IncDecs` | Valid integer postfix `++` and `--` expressions keyed by position. |

The position-keyed lowering maps are part of the current analyzer/codegen
contract. Codegen does not independently reclassify these operations.

## Type Model

The primitive type names currently recognized are:

`void`, `int8`, `int16`, `int32`, `int64`, `intsize`, `uint8`, `uint16`,
`uint32`, `uint64`, `uintsize`, `float32`, `float64`, `bool`, `string`, and
`char`.

Other resolved type declarations use `TypeCustom`. The empty annotation name
uses `TypeEmpty`, and `TypeInvalid` is a poison value intended to suppress
follow-on diagnostics.

Literal defaults are:

| Literal | Default type |
|---|---|
| Integer | `int32` |
| Float | `float64` |
| Boolean | `bool` |
| String | `string` |
| Character | `char` |

`intsize` and `uintsize` are treated as 64-bit by `BitWidth()`, independent of
the host platform.

## Analysis Passes

Analysis is broadly performed in two source-order passes, followed by record
cycle detection and record-registry construction.

### Pass 1: Functions And File Constants

The first pass ignores comments and type declarations.

For every function:

- Reject a name already found in the global scope.
- Build and store a function signature.
- Store the function definition position at the function name.
- Permit calls to functions declared later in the file.

For every file `const`:

- Reject a global name already present.
- Resolve its annotation, or infer from its initializer when unannotated.
- Store the symbol immediately.

Function signatures in this pass resolve primitive names only. Unknown and
custom names are stored as `TypeInvalid` in the signature even if a matching
type declaration is processed later.

### Pass 2: Types, Bodies, And Const Validation

The second pass processes declarations in source order:

- Record declarations are stored as raw field lists.
- Aliases are accepted only when their target is already in `recordTypes`.
- Compositions are validated against type declarations already seen.
- Type symbols are then added to the global scope.
- Function parameter/return/error types and bodies are analyzed.
- File constants have their annotation and initializer checked.

Afterward:

- A DFS reports cycles through record fields, aliases, and named composition
  operands.
- `Records` is built by following aliases and flattening compositions.

Because type declarations are not predeclared, source order affects aliases
and compositions.

## Symbols And Scopes

Symbol kinds are function, file const, parameter, return type, error type,
local const, local let, and type declaration.

Name lookup walks from the current scope through all parents.

Local declaration rules:

- A local may not reuse any name visible in its current or enclosing scopes.
- This forbids shadowing globals, parameters, and outer locals.
- Sibling blocks have separate scopes and may independently use the same name.
- Duplicate parameters are rejected within the function scope.

Each function and each analyzed block creates a `ScopeNode` with source start
and end positions. Function parameters live in a function scope; the function
body itself creates a child block scope.

Return and error type names are also inserted as symbols in the function
scope. They are primarily used to make repeated custom type resolution work.

## Identifier Reads

For an identifier expression:

1. The name must resolve.
2. A binding created by `as result` may not be read until its matching
   successful `check`.
3. An uninitialized local `let` may not be read.
4. A successful use is recorded in `Refs`.

A bare function identifier cannot be used as a value. Function-typed values
are not implemented.

## Unary Expressions

| Operator | Accepted operand | Result |
|---|---|---|
| `!` | `bool` | `bool` |
| `-` | Any integer or float | Operand type |
| `~` | Any integer | Operand type |

An unknown unary operator is an error. `TypeInvalid` operands propagate
without another type diagnostic.

## Binary Expressions

Before operator checking, a bare integer literal adopts the other integer
operand's type. A bare float literal similarly adopts the other float
operand's type. After this adjustment, unequal `Type` values produce the
current `"incompatibe types in expression"` diagnostic.

| Operators | Rules | Result/metadata |
|---|---|---|
| `+ - * /` | Matching numeric operands | Operand type |
| `%` | Matching integer operands | Operand type |
| `& \| ^` | Matching integer operands | Operand type |
| `<< >>` | Both operands integer; widths may differ | Left type |
| `< <= > >=` | Matching numeric or `char`; records rejected | `bool` |
| `== !=` | Same supported primitive type, or custom records | `bool` |
| `&& \|\|` | Both operands `bool` | `bool` |

Additional lowering metadata:

- Integer `/` and `%` are added to `Divisions`.
- Integer shifts are added to `Shifts`.
- Ordinary integer `+`, `-`, and `*` are considered fallible for `as result`
  but are not added to a general arithmetic metadata map.

Current record equality returns `bool` whenever either operand is custom,
without first proving that both operands are the same custom type.

## Function Calls

Only identifier callees are supported.

For a normal call:

- The callee must exist and be a function with a signature.
- Arity mismatch produces one diagnostic, but overlapping arguments are still
  checked.
- Each argument is typed.
- Object-literal arguments are validated against the corresponding parameter.
- Otherwise, argument kinds must match.
- A narrower integer argument is implicitly accepted when the parameter has a
  larger bit width.
- A function with an error set may only be called inside `as result`.

Call result rules:

- No declared return values means `void`.
- One declared return means that type; a single declared `void` also means
  `void`.
- More than one return is rejected in expression position.

The implicit integer argument widening check compares bit width but does not
require matching signedness.

### Explicit Conversions

Call-shaped `T(x)` is treated as conversion syntax when `T` resolves to an
integer type or `char`.

- Exactly one argument is required.
- Integer to `char` traps unless the value is a valid Unicode scalar.
- Float to integer traps for NaN, infinity, or out-of-range values.
- Integer narrowing and signedness changes trap when out of range.
- Same-signedness integer widening/identity is free.
- Integer to float and float to float are free.
- Non-numeric conversions are rejected.

Accepted conversions are recorded in `Conversions` as `ConvFree` or
`ConvTrap`.

`AnalyzeExpr` synthesizes callable symbols only for fixed-width integer names
and `char`; it does not do this for `intsize`, `uintsize`, or float names.

## Variable Declarations

For local `const` and `let`:

- The initializer expression is analyzed first.
- Duplicate/shadowing names are rejected.
- An annotation is resolved as primitive or custom.
- An unannotated binding infers its type from the initializer.
- An untyped object literal is rejected because it has no nominal context.
- A typed object literal is checked against the annotated record.
- A declaration with an initializer is added to the scope's assigned set.
- A declaration without an initializer remains unassigned.

Current behavior does **not** compare an ordinary non-record initializer type
with its local annotation. For example, `let x: int32 = true;` is accepted by
`AnalyzeVarDecl`.

Unknown local annotations can receive an `"unknown type"` diagnostic, but the
symbol is still installed with an invalid type.

## Assignment

For a plain or compound assignment:

- The RHS is analyzed.
- The root target identifier must resolve.
- The target use is recorded in `Refs`.
- Only a local `let` is assignable.
- Functions, parameters, and consts receive specialized diagnostics.
- The symbol is marked assigned even when assignment is illegal.

Plain assignment:

- Non-record binding types must equal the RHS `Type` exactly.
- Whole-record assignment skips the ordinary equality check.
- Member assignment compares the member type and RHS type.
- A member cannot initialize an otherwise uninitialized record; whole-value
  initialization must happen first.

Compound assignment:

- Only integer bindings are accepted.
- The analyzer recognizes the parser's `+=`, `-=`, and `*=`.

For member targets, mutability is checked through the root identifier stored
in `AssignmentStatement.Target`.

## Postfix Increment And Decrement

For identifier operands:

- The binding must exist.
- A local const is rejected.
- The binding type must be integer.
- The identifier reference and operation type are recorded.

The current check explicitly rejects `SymbolLocalConst`, but not every other
non-mutable symbol kind. Non-identifier operands are not fully validated.

## Conditions And Control Flow

`if`, `while`, and non-empty `for` conditions must have type `bool`.

### If

- The condition is typed and analyzed.
- Then and else blocks receive child scopes.
- Definite assignment after the `if` is joined from both branches.
- If one branch always returns, only the other branch constrains the join.
- If both return, no assignments are propagated.

### While

- The condition must be `bool`.
- The body is analyzed in a child scope.
- Assignments made only in the loop are not propagated after it.
- A `while` never proves return coverage, even with a literal `true`
  condition.

### For

- The implementation unconditionally asserts that the initializer is an
  `ast.VariableDeclarationStatement`.
- A non-empty initializer must be mutable; `const` is rejected.
- The optional condition must be `bool`.
- The optional step expression is analyzed.
- The body is analyzed in a child scope.
- Body assignments are not propagated after the loop.
- Return coverage treats a `for` as returning when its body returns, even
  though the loop may execute zero times.

An empty initializer currently causes a panic in semantic analysis because of
the unchecked type assertion.

### Switch

- The scrutinee must stringify as an integer type or exactly `char`.
- Bare integer labels adopt the scrutinee's integer type.
- Label type must match the scrutinee.
- Duplicate integer/character labels are rejected by literal text key.
- Only literal integer, character, or parser-admitted unary labels are
  expected.

The current semantic switch branch does not analyze case/default bodies.
Return-coverage helpers inspect their ASTs, but ordinary body expressions,
assignments, and nested scopes are not walked there.

The parser, not `semantics.go`, requires a `default`, restricts label syntax,
and rejects `break`/`continue` outside loops.

## Definite Assignment

Each scope stores a list of assigned `Symbol` values.

- Reads search assigned lists in the current and enclosing scopes.
- Straight-line assignment makes a binding readable afterward.
- `if` joins use intersection unless a branch returns.
- Loop-body assignments do not escape the loop.
- The analysis tracks symbol assignment, not fields independently.

Assignment lists are slices and may contain duplicates.

## Return Validation

For a normal return:

- A return outside a function is rejected.
- `void` mixed with other declared returns is rejected.
- A single `void` declaration is treated as zero returned values.
- Return arity must exactly match.
- Each expression is analyzed and compared by type name with its declared
  return type.
- An object literal is pinned and validated by the corresponding return type.

Return coverage:

- A non-void function is rejected unless `blockReturns` succeeds.
- A block returns if it contains any statement considered returning.
- An `if` returns only when both branches return.
- A `while` never guarantees a return.
- A `for` guarantees a return when its body does.
- A `switch` guarantees a return when every case and the default do.
- Only the first declared return type controls whether coverage is required.

## Records

Three declaration forms are tracked:

- Direct record field lists.
- Aliases to records.
- Compositions containing named records and inline fields.

### Declaration Validation

- Alias targets must already be direct records.
- Composition operands are flattened in operand order.
- Primitive/unknown non-record operands are rejected.
- Duplicate field names across a composition are rejected.
- DFS cycle detection follows custom record fields, aliases, and named
  composition operands.
- A cycle diagnostic suggests using `owned<T>`, although heap types are not
  represented by this analyzer.

Direct record field declarations are not comprehensively validated for
unknown field type names before registry construction; unresolved names are
treated as custom types in `Records`.

### Object Literals

Object literals are shape-only and require an expected record type from:

- A variable annotation.
- A function parameter.
- A return type.
- A nested record field.

Validation requires:

- Every explicit field exists.
- No field is supplied more than once.
- Every declared field is supplied.
- Nested object literals match custom record fields recursively.
- Primitive field kinds match.
- Record field values match after alias canonicalization.
- A spread source is a value of the same canonical nominal record type.
- A spread contributes all target fields and may not collide with explicit
  fields or another spread.

Compositions are flattened to a record shape for validation. Aliases are
treated as the same nominal record as their target.

Member typing is implemented primarily for identifier receivers. Recursive
member-access handling returns the receiver chain's type without reliably
resolving the final member in every nested case.

## Fallible Expressions And Error Sets

A function is fallible when its signature has at least one error type.

Error type declarations in function signatures:

- Integer and float primitives are rejected.
- Known custom type declarations are accepted.
- Other primitives such as `bool`, `char`, and `string` are not rejected by
  the primitive numeric check.
- Repeated error types are not explicitly normalized in `semantics.go`.

### What Can Use `as result`

`expressionCanFail` recognizes only the outer expression:

- A direct call to a fallible function.
- A trapping integer/`char` conversion.
- Integer `+`, `-`, `*`, `/`, `%`, `<<`, or `>>`.
- Integer postfix `++` or `--`.

It does not recursively search an arbitrary expression tree.

When analyzing `inner as resultName`:

- A non-fallible outer expression is diagnosed.
- Fallible calls are temporarily allowed.
- The inner declaration/assignment/expression statement is analyzed normally.
- The result name is registered in the current scope.
- A declaration or assignment destination becomes pending.

Pending bindings cannot be read until a matching successful check.

### Check

`check name { ... }`:

- Must find a preceding pending result by walking enclosing scopes.
- An unmatched check is diagnosed, but its body is still analyzed.
- Every path through the check body must diverge.
- Divergence includes `return`, `break`, `continue`, both branches of an
  `if`, or every branch/default of a `switch`.
- On success, the pending result and its bindings are cleared.

If the check body does not fully diverge, pending state remains.

### Return Error

`return error as { ... };`:

- Requires a non-empty function error set.
- Requires exactly one object literal.
- Matches an error type first by field-name set and field count.
- Validates the selected record literal normally afterward.

If multiple error types have the same field-name set, the first matching error
type wins. The literal's values do not participate in choosing the error type.

## Diagnostic Behavior

Diagnostics use semantic stage positions from AST nodes. `TypeInvalid` is
used in unary, binary, and call typing to suppress some cascades.

Expression analysis and expression typing are separate traversals. Several
statement paths call both, and some call `TypeOf` more than once, so reference
recording and diagnostics are not uniformly single-pass.

## Current Rewrite Hazards

These behaviors should be consciously preserved, corrected, or covered by a
migration test during the rewrite:

- Type declarations are not globally predeclared; aliases/compositions are
  source-order-sensitive.
- Function signatures retain invalid types for custom names built in pass 1.
- Local primitive initializer/annotation mismatches are not checked.
- Custom whole-value assignment compatibility is largely skipped.
- Record equality does not require identical custom types.
- Empty `for` initialization panics.
- Switch bodies are not semantically walked.
- `for` return coverage is optimistic; `while` coverage is conservative.
- Result names can overwrite earlier pending results in the same scope.
- Fallibility detection is shallow and syntax-directed.
- Return-error selection is shape-based and can be ambiguous.
- Some invalid declarations still install symbols, affecting later analysis.

## Observed Test Baseline

On 2026-06-15:

- `go test ./...` passed.
- `go run ./cmd/delta test all` reported 219 passing and 15 failing scenarios.

Failures attributable or adjacent to current semantic behavior included:

- Empty `for` initialization panic.
- Missing local initializer type mismatch.
- Mixed-width arithmetic accepted when literal retargeting makes the operands
  appear equal.
- Unknown local/file annotation diagnostics not matching the expected rule.
- One assignment-form `as result` scenario failing error-type validation.

Parser failures in the same run, such as a multi-label switch parse failure,
are outside this file's responsibility.

