# Current C Code Generation Rules

Snapshot: 2026-06-15

Primary implementation: [`internal/codegen/emit.go`](../internal/codegen/emit.go)

Semantic input contract:
[`internal/semantics/semantics.go`](../internal/semantics/semantics.go)

This document describes the C currently emitted, including unsupported forms
and silent assumptions. It is a rewrite reference, not the desired backend
architecture.

## Inputs

`Emitter` receives:

- The parsed `ast.File`.
- The shared diagnostic bag.
- Identifier-position symbol references.
- Position-keyed conversion, integer division, shift, and postfix
  increment/decrement metadata from semantic analysis.
- The source path used in runtime panic messages.

The emitter assumes semantic analysis already rejected invalid programs. It
does not perform a complete independent validation pass.

`ErrorBag` is currently not used to report emitter failures. Some internal
type errors are printed with `println` and emission continues.

## Output Layout

`Emit()` constructs a single C translation unit in this order:

1. Standard includes.
2. Runtime panic function and trapping helpers, when needed.
3. Record `typedef struct` definitions.
4. Fallible-result struct definitions.
5. Recoverable result helpers.
6. Record equality helpers.
7. Forward declarations for all functions.
8. File-scope constants.
9. Function definitions.
10. An unconditional C `main` wrapper calling `delta_main`.

Helper names are sorted before rendering, making helper order deterministic.
Functions and constants otherwise retain source order.

Comments and type declarations do not emit standalone C statements.

No `#line` directives are currently emitted.

## Includes

Every file includes:

```c
#include <stdint.h>
#include <stdbool.h>
```

When a trapping conversion/division/shift/compound/inc-dec helper is used, it
also includes:

```c
#include <stdio.h>
#include <stdlib.h>
```

Recoverable `as result` helpers alone do not require the panic headers.

## Primitive Type Mapping

| Delta | C |
|---|---|
| `void` | `void` |
| `bool` | `bool` |
| `int8` | `int8_t` |
| `int16` | `int16_t` |
| `int32` | `int32_t` |
| `int64` | `int64_t` |
| `intsize` | `intptr_t` |
| `uint8` | `uint8_t` |
| `uint16` | `uint16_t` |
| `uint32` | `uint32_t` |
| `uint64` | `uint64_t` |
| `uintsize` | `uintptr_t` |
| `float32` | `float` |
| `float64` | `double` |
| `char` | C `char` |

`string`, invalid, and empty types are unsupported by `cType`.

Using C `char` means the emitted representation is not large enough for the
full Unicode scalar range enforced by semantic conversion checks.

## Records

Before emission, `buildRecordTable` scans all type declarations.

### Canonicalization

- A direct record gets `recordInfo{Name, "delta__" + Name, Fields}`.
- An alias points to the same `recordInfo` as its target.
- A composition gets a distinct nominal record and concatenates operand
  fields left to right.
- Inline composition fields are appended in source order.
- Named composition operands contribute their already resolved fields.

Aliases therefore emit no C type of their own and use the target's C struct
name.

### Definition Order

Canonical records are DFS-ordered so a record embedded by value is defined
before the record containing it. Semantic cycle rejection is assumed.

Each record emits:

```c
typedef struct delta__Name {
    field_type field_name;
} delta__Name;
```

Empty records emit an empty C struct, which Clang accepts as an extension but
ISO C11 does not define.

### Object Literals

A record literal is emitted only when an expected record type pins it:

```c
(delta__Vec3){ .x = value, .y = value, .z = value }
```

Rules:

- C fields are emitted in record declaration order, not source literal order.
- Explicit values are recursively pinned by the field type.
- A spread source supplies each field not already supplied as
  `(source).field`.
- Semantic analysis is trusted to guarantee complete coverage and no
  collisions.

Pinning contexts are local/file declarations, function arguments, return
statements, assignments, and nested record fields.

### Member Access

Record fields are inline values and emit as:

```c
receiver.field
```

No pointer dereference or ownership lowering is involved.

### Equality

Record `==` and `!=` use lazily registered structural helpers:

```c
static inline bool delta__Vec3_eq(delta__Vec3 a, delta__Vec3 b) {
    return a.x == b.x && a.y == b.y && a.z == b.z;
}
```

- Primitive fields use C `==`.
- Record fields call their own equality helper recursively.
- Empty records compare as `true`.
- `!=` emits logical negation of the equality helper call.
- Helpers are emitted only for records actually compared.

## Function Signatures

All functions receive forward declarations.

- Parameter types are resolved and emitted with parameter names.
- No parameters emits `()`, not `(void)`.
- No declared return emits C `void`.
- Otherwise only the first declared return type is used.
- A function named `main` is renamed to `delta_main` in its declaration and
  definition.
- A function with any error types returns a generated result struct instead
  of its ordinary success type.

Calling `main` from Delta source is not renamed at call sites.

Multi-return lowering is not implemented; extra declared return types and
extra returned expressions are ignored by codegen.

## Entry Point

Every generated translation unit ends with:

```c
int main() {
    return (int)delta_main();
}
```

There is no emitter-side validation that:

- A Delta `main` exists.
- It has no parameters.
- It returns a value compatible with C `int`.
- It is non-fallible.

The wrapper is emitted even when no valid `delta_main` declaration exists.

## File Constants

A file constant emits:

```c
static const C_TYPE name = initializer;
```

The initializer is pinned by the declared type. Unannotated file constants
depend on the AST carrying a resolvable type name; the emitter does not infer
their type.

## Expression Emission

### Literals

| AST expression | C output |
|---|---|
| Integer literal | The AST literal value |
| Float literal | The AST literal value |
| Boolean literal | The AST literal value |
| Character literal | Original content wrapped in `'...'` |
| String literal | No output; there is no `StringLiteral` emitter case |

Literal spelling present in the AST is emitted unchanged. The tokenizer has
already removed numeric `_` separators before the emitter receives the AST.

### Identifiers And Calls

Identifiers emit unchanged.

A normal call emits:

```c
callee(arg1, arg2)
```

Object-literal arguments are pinned using the emitter's function signature
table.

If a conversion metadata entry exists, `T(x)` emits either a C cast or a
helper call. Without metadata, fixed-width integer type names have a fallback
cast-like path. This fallback does not cover every semantic conversion target.

### Unary And Postfix

Ordinary unary expressions concatenate the operator and operand:

```c
!value
-value
~value
```

There is no unconditional parenthesization.

A postfix expression with `IncDecs` metadata calls an overflow-checking helper
with the operand address. Without metadata it emits native C postfix syntax.

### Binary Operators And Precedence

Most binary operators emit infix C syntax. Parentheses are added only when
the child AST grouping would be changed by C precedence/left associativity.

Examples:

- `(a + b) * c` needs parentheses around the left child.
- `a - (b - c)` needs parentheses around the right child.
- `a + b * c` emits naturally.

Division, modulo, shifts, and record equality may take specialized paths
before ordinary precedence emission.

Ordinary integer `+`, `-`, and `*` emit raw C operations. They do not use
overflow helpers unless they appear in compound assignment, postfix
increment/decrement, or recoverable `as result`.

## Statement Emission

### Local Declarations

```delta
const x: T = value;
let y: T = value;
let z: T;
```

becomes:

```c
const C_T x = value;
C_T y = value;
C_T z;
```

The emitter records local types in one function-wide map as declarations are
emitted. It does not push/pop a codegen type environment per lexical block.

### Assignment

A plain identifier or member lvalue emits:

```c
target = value;
```

The RHS is pinned by the target type when codegen can determine it.

Compound `+=`, `-=`, and `*=` become:

```c
target = delta_rt_add_i32(target, rhs, "source.delta", line);
```

The helper uses Clang's `__builtin_*_overflow` and traps on overflow,
including unsigned wrap.

### If And While

These map directly to C:

```c
if (condition) { ... } else { ... }
while (condition) { ... }
```

An empty else block is omitted.

### For

`for` maps directly to a C `for` statement.

- An empty initializer emits `;`.
- A declaration initializer is emitted by reusing declaration emission with
  indentation disabled.
- Missing condition and step slots are left empty.

The emitter assumes a non-nil initializer can be asserted to
`VariableDeclarationStatement` when checking whether it is empty. This
mirrors the analyzer's fragile initializer assumptions.

Native C `continue` behavior runs the `for` step before retesting the
condition.

### Switch

A switch emits C cases in source order. Multiple labels are rendered as
adjacent C labels sharing one block. Every case receives an unconditional
generated `break;` after its body to prevent fallthrough.

The default emits last when present.

A source `break` inside a case is emitted as native C `break`, so it targets
the C switch, not an enclosing loop. This conflicts with the parser/test
design that treats switch-contained `break` as targeting the enclosing loop.

### Break, Continue, Comments, Expression Statements

- `break` emits `break;`.
- `continue` emits `continue;`.
- Expression statements emit `expression;`.
- Comments emit an empty string and disappear.

### Return

Non-fallible value return:

```c
return value;
```

The value is pinned by the first declared function return type.

A non-fallible empty `return;` currently emits no statement. A C `void`
function therefore falls through at that location.

## Runtime Trap Lowering

Runtime checks call:

```c
delta_panic(file, line, message);
```

`delta_panic` prints:

```text
<file>:<line>: panic: <message>
```

and calls `abort()`.

Only helpers referenced during body emission are generated.

### Conversions

Free conversions emit a plain C cast.

Trapping helpers check:

- Float-to-int NaN and range.
- Integer-to-`char` Unicode scalar validity.
- Signed/unsigned narrowing.
- Signedness changes.

### Integer Division And Modulo

Normal integer `/` and `%` metadata emits a helper that traps when the divisor
is zero.

The normal helper does not check signed `MIN / -1` overflow. The recoverable
result helper does check it.

### Shifts

Normal shifts emit a helper that checks:

- Negative count when the left operand type is signed.
- Count greater than or equal to the left type's bit width.

The normal helper gives both C parameters the left operand's type, even though
semantic analysis permits a different integer type on the right. Its
negative-count check also uses left-type signedness rather than the actual
right operand type.

### Postfix Increment/Decrement

The helper:

- Takes a pointer to the binding.
- Saves and returns the old value.
- Uses a checked add/subtract by one.
- Stores the new value.
- Traps on signed or unsigned overflow.

## Fallible Result Representation

Each success type used by a fallible function or `as result` gets:

```c
typedef struct delta_result_i32 {
    uint8_t tag;
    int32_t value;
} delta_result_i32;
```

For `void`, the `value` field is omitted.

Naming:

- Primitive: `delta_result_<type-code>`.
- Custom record: `delta_result_<record-name>`.
- Void: `delta_result_void`.

The current representation stores only:

- `tag == 0` for success.
- `tag == 1` for any error.
- The success value when non-void.

Declared error types and error payload values are not represented in C.

### Fallible Function Return

For a fallible function:

- `return value;` becomes `{ .tag = 0, .value = value }`.
- Empty success return becomes `{ .tag = 0 }`.
- `return error as { ... };` becomes `{ .tag = 1 }`.

The error object literal is discarded entirely.

### Recoverable Operations

Inside `as result`, codegen may use non-panicking helpers:

- Conversion helper returning tag 1 on invalid input.
- Division/modulo helper returning tag 1 on zero or signed `MIN / -1`.
- Shift helper returning tag 1 on invalid count.
- Add/subtract/multiply helper returning tag 1 on overflow.
- A fallible function call already returns a result struct and needs no
  wrapper helper.

### Pending Commit

For:

```delta
const x = expression as result;
check result { ... }
```

codegen emits conceptually:

```c
delta_result_T __delta_result_N = recoverable_expression;
if (__delta_result_N.tag != 0) { ... }
const T x = __delta_result_N.value;
```

The declaration or assignment is delayed until after the matching check.

Expression-statement form has no success commit.

Pending results are tracked by result name in a per-function map. A matching
check removes the entry. Temporary counters are emitter-wide, so numbering
continues across functions.

The check body is emitted as an ordinary `if (tag != 0)` block. Semantic
analysis is trusted to ensure it diverges.

## Best-Effort Codegen Typing

The emitter reconstructs enough expression types to handle records and
fallible helpers:

- Literal defaults.
- Function parameters and already emitted locals.
- File constants.
- Record member fields.
- Unary/postfix operand types.
- Binary left operand type.
- Conversion target.
- Function first return type.

Unknown forms return `TypeEmpty`.

This is not equivalent to semantic typing. In particular, binary expressions
always take the left type, and block scope is not represented in the local
type map.

## Current Rewrite Hazards

- The emitter mutates helper-registration state while emitting bodies, then
  emits the preamble afterward. A rewrite must preserve this dependency or
  introduce an explicit collection pass.
- Unsupported types often yield ignored errors and malformed C rather than a
  structured diagnostic.
- `ErrorBag` is effectively unused by codegen.
- String expressions emit nothing.
- `char` lowers to C `char`, not a Unicode scalar representation.
- Main validation is absent and the wrapper is unconditional.
- Calls to Delta `main` are not renamed.
- Only the first return value/type is lowered.
- Empty non-fallible returns disappear.
- Ordinary integer arithmetic does not trap.
- Normal division misses signed `MIN / -1`.
- Normal shift helpers use the left type for the count parameter/check.
- Switch-contained `break` follows C switch semantics.
- Fallible errors lose their type and payload.
- Function/block local type environments are approximated with one mutable
  map.
- Emitter state is not reset comprehensively at the start of `Emit`; reusing
  one `Emitter` instance can retain helper/counter state.

## Observed Test Baseline

On 2026-06-15:

- All 17 legacy codegen golden scenarios passed.
- The record equality golden scenario passed.
- The full manifest run reported 219 passing and 15 failing scenarios.

Runtime-safety failures in that run included several expected conversion,
modulo, and shift traps not being observed. Because the implementation has
the corresponding helper paths, these failures should be treated as
integration regressions to reproduce during the rewrite rather than as
desired semantics.
