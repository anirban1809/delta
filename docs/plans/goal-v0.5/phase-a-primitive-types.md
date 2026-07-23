# Plan: Phase A — Primitive Type Surface and Fixed Arrays (v0.5)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phases **I (multi-file modules)**, **D (extern "c")**, **J (std/log)** from [compiler-goal-v0.5.md](../../compiler-goal-v0.5.md) are expected to land before this plan starts. Phase A operates in a multi-TU world but does not itself add new module-system features.
Successor: Phase **B** (control flow + flow analysis) consumes Phase A's expanded numeric surface and fixed-array indexing; Phase **C** (error model) later upgrades trap sites to be recoverable through `as result`.
Spec basis: [spec-sections/05-primitive-numeric-types.md](../../spec-sections/05-primitive-numeric-types.md), [spec-sections/06-other-primitive-types.md](../../spec-sections/06-other-primitive-types.md), [spec-sections/04-type-inference.md](../../spec-sections/04-type-inference.md) §4.3, and [main-spec.md](../../main-spec.md) §16.

## Goal

Expand the compiler's primitive surface from the v0 baseline (`int32`, `bool`, `void`) to the full §5–§6 type set, with trap-by-default arithmetic, the new operator families (modulus, bitwise, compound assignment), the `char` primitive, and fixed arrays as a compiler-known primitive type constructor. The deliverable is:

```bash
$ delta build hello.delta
$ ./build/hello
$ echo $?
```

…where `hello.delta` may freely use any of:

- All eleven primitive numeric types (`int8/16/32/64/intsize`, `uint8/16/32/64/uintsize`, `float32/64`).
- The `char` type with codepoint comparison.
- Hex (`0x...`) and binary (`0b...`) integer literals, underscore separators, float literals.
- `%`, `&`, `|`, `^`, `~`, `<<`, `>>`, and every compound assignment form.
- `T(x)` and `T.from(x)` numeric conversions, with narrowing and sign-flipping conversions trapping at runtime.
- Operator `+`, `-`, `*` on integers trapping on overflow.
- Inline fixed arrays such as `uint8[4]`, array literals such as `[1, 2, 3]`, and bounds-checked indexing.

…and any program that overflows, divides by zero, hits `int_MIN / -1`, shifts out of range, or narrows out of range **panics** at the trap site with a source-located message and exits non-zero. Recoverability of these traps via `as result` / `check` is **out of scope** for Phase A and lands in Phase C.

## In-scope language surface

New since v0:

- Primitive type tokens / type references: `int8`, `int16`, `int64`, `uint8`, `uint16`, `uint32`, `uint64`, `intsize`, `uintsize`, `float32`, `float64`, `char`.
- Integer literal forms: decimal `123`, hex `0xFF`, binary `0b1010`, all with `_` separators (`1_000_000`, `0xFF_FF`, `0b1010_1010`). No suffix syntax.
- Float literal forms: `3.14`, `1.0e10`, `1e-5`, `2.5e+3`, `0.5`. No `f` suffix; literal type defaults to `float64`, narrowed by binding-driven inference to `float32` when needed.
- Operators: `%`, `&`, `|`, `^`, `~`, `<<`, `>>`.
- Compound assignment: `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, `>>=`.
- Call-style numeric conversions: `int64(x)`, `uint32(x)`, `float32(x)`, `char(x)`, plus the `T.from(x)` alias.
- `char` operators: `==`, `!=`, `<`, `<=`, `>`, `>=` only (no arithmetic, no other methods).
- **Fixed arrays are primitive type forms.** `T[N]` is recognized directly by the parser and analyzer; it is not a type alias, a `std` declaration, or an instantiation of user-defined generics. `T` must be a Phase-A storable primitive and `N` must be a positive compile-time integer literal. Arrays have inline storage, a `uintsize` `.length` property, array-literal construction, whole-array assignment, and `a[i]` read/write indexing.
- Array literals: `[a, b, c]`. In a `T[N]` context every element is checked against `T` and the literal must contain exactly `N` elements. Without context, a non-empty literal infers `T[N]` from its first element and every remaining element must have that same type. Integer literals receive the array element type as their one-level inference context. Empty array literals are rejected in Phase A because neither their element type nor their length can be inferred.
- Indexing: `a[i]`, where `a: T[N]` and `i: uintsize`, yields `T`; integer literals in index position adopt `uintsize`. Every dynamic index is bounds-checked and panics at the index expression when `i >= a.length`. A compile-time literal index outside `[0, N)` is an analyzer error. `let` arrays permit `a[i] = value`; `const` arrays do not.
- Trap-on-overflow lowering for every operation listed in §5.3, with a built-in `panic` mechanism that terminates the process and prints `delta: panic at <file>:<line>:<col>: <kind>`.

Already working in v0 (unchanged by Phase A):

- `int32`, `bool`, `void`; `+`, `-`, `*`, `/`, `<`, `<=`, `>`, `>=`, `==`, `!=`, `&&`, `||`, `!`; functions, locals, `if`/`while`, calls; C codegen and clang invocation.

## Explicitly out of scope for Phase A

| Feature | Reason | Eventual home |
|---|---|---|
| `as result` / `check` for traps | Requires the fallible-return shape and `OverflowError` family. | Phase C — Error Model. |
| `Wrap<T>` / `Saturate<T>` numeric tags | Whole feature family of opt-out semantics with explicit `.value` boundary. | Out of v0.5 entirely. |
| `for`, `break`, `continue` | Phase B owns control-flow surface. Range form `for i in lo..=hi` depends on Phase A's typed ranges but is not blocking. | Phase B — Control Flow & Flow Analysis. |
| Definite assignment, return coverage | Same. | Phase B. |
| Compile-time constant folding beyond literal checks | The spec says compile-time integer overflow is an error and float NaN/Inf are OK; for Phase A we only enforce the literal-fits-target check, not full constant folding of `const` initializers. | Defer to a constant-evaluator pass once Phase C lands. |
| `bool ↔ int` conversions | Spec disallows them. Codegen emits no path for `int32(b)` or `bool(n)`. | Never (by design). |
| Mixed-precision float arithmetic (`float32` and `float64` in one expression) | Spec disallows; analyzer rejects. | Never (by design). |
| Strict `intsize`/`uintsize` nominal distinctness from `int64`/`uint64` on 64-bit targets | Spec is firm that they are nominally distinct types even when ABI-identical. Phase A enforces this in the analyzer; codegen lowers both to the same C type. | Already in scope; called out so we don't accidentally relax it. |
| Builtin numeric methods like `.isNaN()`, `.isFinite()` on floats | Mentioned in §5; small surface; could land in Phase A but is not on the critical path. | **Stretch goal within Phase A** — see "Stretch" below. |
| `panic(msg)`, `process.exit(code)`, `unreachable()` as user-callable intrinsics | §6 defines them; the trap mechanism uses an internal panic, but the user-facing intrinsics are a separate surface. | Phase B or Phase C, depending on which one needs them first. |
| Heap-backed `Array<T>` | This phase establishes the primitive, inline `T[N]` form only. A growable owner needs allocation failure handling, disposal, and move-state rules. | After Phases F and H, as the standard heap-backed collection built on the fixed-array representation. |
| `Slice<T>` / `&T[]`, slicing, or `for...of` over arrays | Views, lifetimes, and collection iteration require the borrow and iterator work that Phase A deliberately precedes. | Phases G and B, respectively, after heap-backed arrays land. |
| Zero-length and variable-length arrays | `T[0]` needs a distinct C representation, while runtime lengths would make the layout non-fixed. Neither is needed to establish the first-class fixed-array model. | Post-v0.5 design work. |

If a program uses a Phase-A-out-of-scope construct that the analyzer happens to accept, codegen emits a structured "unsupported in Phase A" diagnostic at the offending position and fails the build *before* invoking clang. This extends the fail-closed convention from v0 codegen.

## What's missing today

Working against the v0 baseline ([compiler-status.md](../../compiler-status.md)):

- **Lexer**: only decimal integer literals, no hex/binary, no underscore separators, no float literals. Operators `%`, `&`, `|`, `^`, `~`, `<<`, `>>` and the ten compound-assignment forms are not tokenized. The type-name keywords `int8`/`int16`/.../`float64`/`char` are not lexed as distinct kinds.
- **Parser**: precedence table covers additive, multiplicative, comparison, equality, logical AND, logical OR only. There are no precedence slots for bitwise AND / XOR / OR, no slot for shifts. Compound assignment is not parsed at all; only `=` is recognized. Numeric-cast parsing relies on the existing function-call parser working over a type-name callee — see "Decisions" §3.
- **Semantic analyzer**: `TypeKind` covers `TypeInt32`, `TypeBool`, `TypeString`, `TypeChar`, `TypeVoid`, `TypeEmpty`, `TypeInvalid`. The full numeric family, including `intsize`/`uintsize` and the float types, must be added. Operator typing rules cover the v0 set only — bitwise/shift/modulus rules are absent, as is the rule "operands must have identical numeric type; no implicit widening." Call-as-conversion is not distinguished from function call. `char` comparison is missing.
- **Codegen**: type mapping covers only `int32 → int32_t`, `bool → bool`, `void → void`, `char → char` (currently emitted but never reached by analyzer-typed programs). No trap helpers, no `<stdint.h>` for the wider integer types beyond what's already included, no panic mechanism. Binary expression emission emits raw C operators with no overflow checks.
- **Runtime**: no Delta-level runtime helpers exist. There is no place to put trap helpers, no `delta_runtime.h`, no panic printf/abort routine.
- **Arrays**: there is no array type descriptor, array-literal or index-expression AST node, contextual element typing, bounds analysis, or C layout/lowering. Brackets are not currently available in type or expression grammar.

## Decisions already made

These are the calls I'm making up front so the implementation steps are unambiguous. Each is reversible but only one is cheap to revisit later.

1. **Trap helpers ship as `static inline` functions emitted into every TU.** Each TU's generated `.c` opens with a block of small static-inline overflow/divzero/shift/cast helpers prefixed with `delta_rt_` (e.g., `delta_rt_add_i32`, `delta_rt_narrow_i64_to_i32`). They're `static` so they don't collide across TUs and `inline` so clang folds them at `-O0` already (gcc-style; LLVM's inline-at-O0 caveat is fine for v0.5). When the runtime library lands later, these move to a real `libdelta_runtime.a` and the `static inline` versions go away. Reasoning: a separate `delta_runtime.h` would require a build-system mechanism to find it (where does it live? do we ship it?). Inlining sidesteps that whole question for Phase A.
2. **Panic prints to stderr and calls `abort()`.** No backtrace, no `DELTA_BACKTRACE=1`, no user-installed pre-abort hook. Spec says all three are eventually required; v0.5 prints a one-line `delta: panic at <file>:<line>:<col>: <reason>\n` and calls `abort()`. Position comes from `#line` directives already emitted in v0; the helper takes them as `__FILE__` / `__LINE__` arguments. Hooks and backtraces are out of v0.5.
3. **`T(x)` numeric conversion is parsed as a function-call expression and re-tagged by the analyzer.** No new syntactic form. The parser sees `int64(x)` as `FunctionCallExpression{callee: Identifier("int64"), args: [x]}`. The analyzer, when resolving the callee, recognizes that `int64` is a *type name* (not a `SymbolFunction`) and re-tags the AST node as a `ConversionExpression`. Codegen then lowers conversions, not calls, for those nodes. This keeps the grammar free of a new production and matches `T.from(x)` (which goes through a normal member access + call) once `.from` lands. **`T.from(x)` is included in scope but lowered to the same conversion path** — the parser sees `int64.from(x)` as `Call(Member(int64, from), [x])`; the analyzer recognizes the receiver as a type and the member as the universal-constructor name, and re-tags it.
4. **Integer literals are typed by binding context, not by the literal itself.** A bare `42` in expression position has type `int32` by default (per §4); a `42` initializer for a `let x: uint64 = 42;` is typed `uint64` directly without an inserted conversion. This is one-level bidirectional inference, in scope for Phase A because every primitive site is annotated or has a clear default. Literal-fits-target is checked at the literal site; out-of-range literals are a compile error (e.g. `let x: uint8 = 256;` rejected, no conversion attempted).
5. **`intsize` / `uintsize` lower to `intptr_t` / `uintptr_t`.** Not `int64_t` — even on 64-bit targets the C-level type is distinct so that 32-bit targets keep working without a codegen branch. `<stdint.h>` already covers it.
6. **`char` lowers to `uint32_t`, not `char32_t`.** `<uchar.h>` is C11, well supported, but using `uint32_t` keeps the type-mapping table consistent with the other unsigned integers. Codepoint comparisons are integer comparisons.
7. **No mixed-type arithmetic, no implicit widening, anywhere.** `int32 + int64` is a hard analyzer error, not a coercion. `int32 + literal_that_fits_int32` is fine because the literal acquires `int32` by context. `float32 + float64` is an error per §5. This is non-negotiable and informs the trap helpers (each is monomorphic in its operand type).
8. **Float arithmetic does not trap; float-to-int conversion does.** Per §5.10. `+`/`-`/`*`/`/` on floats produce `Inf`/`NaN` per IEEE 754. `int32(my_float)` traps on NaN/Inf/out-of-range. Codegen guards float-to-int with an explicit `isnan(x) || isinf(x) || x < INT32_MIN || x > INT32_MAX` check.
9. **Modulus follows truncated division.** §3 specifies `%` as truncated-division remainder (sign of result follows dividend). C is already truncated-division on signed `%`, so codegen emits `%` directly with the same trap guards as `/`. No Python-style floor-edit fallback.
10. **Compound assignment is lowered, not de-sugared.** `x += y` lowers to a single C `x += y`, not to `x = x + y`, so x is evaluated once even at the C level. The trap helper is called inline: `x = delta_rt_add_i32(x, y, __FILE__, __LINE__);` — which means compound forms cannot use the literal C `+=` operator and instead must lower to `x = delta_rt_add_i32(x, y, ...);`. So decision (10) actually means: **emit a helper call assigned back to the LHS**, never use C's compound operator at the output. This keeps the trap site uniform regardless of source-level form.
11. **Phase A arrays are fixed, inline arrays written `T[N]`.** They are a compiler primitive type constructor with structural identity `(element type, length)`, not a library `Array<T>` and not a user-generic instantiation. This gives the language safe array literals and indexing without prematurely choosing heap growth, allocation-failure, disposal, or ownership-transfer semantics.
12. **Only positive, literal lengths are accepted.** The length is parsed as an unsigned decimal integer literal and checked to fit `uintsize`; `int32[N]`, `int32[0]`, `int32[-1]`, and `int32[n]` are errors. Rejecting zero length keeps every Phase-A array representable as a standard C array without a compiler-specific zero-length extension.
13. **The Phase-A element set is deliberately scalar-only.** An element type may be any non-`void` primitive available in this phase (`bool`, `char`, numeric types); arrays cannot nest and cannot contain `string`, `owned<T>`, records, or future resource-owning types. This makes whole-array copy well-defined before Phase F's ownership and disposal analysis. The restriction is lifted only with an explicit Phase-F-compatible element capability rule.
14. **Array bounds failures use the existing panic path.** Codegen emits a `delta_rt_index` guard before a dynamic index and reports `array index out of bounds`; no unchecked indexing syntax exists. Phase C may later make the same site recoverable through `as result`.

## Type system changes

### `TypeKind` extensions

Add to [internal/semantics/types.go](../../../internal/semantics/types.go):

```go
type TypeKind int

const (
    TypeInvalid TypeKind = iota
    TypeVoid
    TypeBool
    TypeChar
    TypeString          // unchanged; string family expands later
    TypeEmpty

    // Signed integers
    TypeInt8
    TypeInt16
    TypeInt32
    TypeInt64
    TypeIntsize

    // Unsigned integers
    TypeUint8
    TypeUint16
    TypeUint32
    TypeUint64
    TypeUintsize

    // Floating-point
    TypeFloat32
    TypeFloat64

    // Fixed arrays. The complete type carries element type and length below.
    TypeArray
)
```

`TypeArray` is not sufficient on its own: the semantic type representation grows `Element *Type` and `Length uintsize` fields, populated only when `Kind == TypeArray`. Equality and the type-interning key include both fields, so `uint8[4]` and `uint8[8]` are distinct types while two independently written `uint8[4]` references are identical. `String()` renders the canonical `T[N]` spelling.

Helpers `IsInteger(k)`, `IsSignedInteger(k)`, `IsUnsignedInteger(k)`, `IsFloat(k)`, `IsNumeric(k)`, `BitWidth(k)` (returns 0 for `intsize`/`uintsize`, see "pointer-width" handling below), and `IsPhaseAArrayElement(t)`. The display names use the full spec form (`int32`, `uint64`, etc., never `i32`/`u64`).

### Type-name resolution

Parser still produces `TypeReference` nodes carrying an identifier string. The analyzer's existing `lookupPrimitive` (called from `validateSignature` and binding annotations) expands to recognize the new names. Unrecognized type names continue to produce `TypeInvalid` with a structured diagnostic.

For an array type reference, the parser produces `ArrayTypeReference{Element: TypeReference, Length: IntegerLiteral}`. The analyzer resolves `Element`, applies `IsPhaseAArrayElement`, verifies the positive `uintsize`-fitting literal length, then interns the resulting `TypeArray`. `Array` by itself and `Array<T>` are not Phase-A type names; diagnostics should point users to `T[N]` and explain that the growable collection is not yet available.

### Operator typing matrix

Add the following rules in `internal/semantics/semantics.go`'s expression typing pass:

| Operator(s) | Operand constraint | Result |
|---|---|---|
| `+`, `-`, `*`, `/` (binary) | both operands same `IsNumeric` type | same type |
| `%` | both operands same `IsInteger` type | same type |
| `&`, `\|`, `^` | both operands same `IsInteger` type | same type |
| `~` (unary) | operand `IsInteger` | same type |
| `<<`, `>>` | LHS `IsInteger`, RHS exactly `TypeUint32` | LHS type |
| `==`, `!=` | both operands same type from `{integers, floats, bool, char}` | `bool` |
| `<`, `<=`, `>`, `>=` | both operands same type from `{integers, floats, char}` | `bool` |
| `&&`, `\|\|` | both operands `bool` | `bool` |
| `!` (unary) | operand `bool` | `bool` |
| `-` (unary) | operand `IsSignedInteger` or `IsFloat` (not unsigned) | same type |

Unary `-` on `uintN` is a compile error (no negation of unsigned), and unary `-` on `int_MIN` traps at runtime. The latter is treated as overflow of `0 - x` and lowered through `delta_rt_neg_i32` etc.

Shift RHS must be `uint32` exactly; integer literals in shift position are typed `uint32` by binding-context rule. This matches §5.4.

### Conversion expressions

Introduce a `ConversionExpression` AST node (or analyzer-side tag on `FunctionCallExpression`) with `From`, `To`, `Source` fields. The analyzer's call-resolution path checks whether the callee identifier resolves to a type, and if so:

- Verifies arity is exactly 1.
- Verifies the argument is `IsNumeric` (or `char ↔ uint32`).
- Verifies the conversion is allowed by the spec (no `bool ↔ int`; `float ↔ int` allowed with float-to-int traps).
- Records the conversion direction so codegen can decide whether trap guards are needed.

Allowed direction matrix (rows are source, columns are destination; `✓` = allowed, `T` = allowed with trap, `—` = compile error):

|  | i8 | i16 | i32 | i64 | u8 | u16 | u32 | u64 | f32 | f64 | char |
|---|---|---|---|---|---|---|---|---|---|---|---|
| i8…i64 | ✓ / T | ✓ / T | ✓ / T | ✓ / T | T | T | T | T | ✓ | ✓ | — |
| u8…u64 | T | T | T | T | ✓ / T | ✓ / T | ✓ / T | ✓ / T | ✓ | ✓ | — |
| f32, f64 | T | T | T | T | T | T | T | T | ✓ / T | ✓ / T | — |
| char | — | — | — | — | — | — | ✓ | — | — | — | ✓ |

`✓ / T` means free when source bit-width ≤ destination and same signedness; trap when narrowing or flipping sign. `char → uint32` is the one free direction per §6; the reverse (`char(n) as result`) is fallible per spec, so plain `char(n)` traps on invalid scalar (surrogate range or > U+10FFFF). `intsize` and `uintsize` participate as if they were `int64`/`uint64` for type-checking purposes; codegen emits checks against `INTPTR_MIN/MAX` rather than `INT64_MIN/MAX`.

## Tokenizer changes

[internal/tokenizer/tokenizer.go](../../../internal/tokenizer/tokenizer.go):

- **Numeric literal scanner** rewritten to recognize:
  - `0x` followed by `[0-9a-fA-F_]+` (hex)
  - `0b` followed by `[01_]+` (binary)
  - `[0-9][0-9_]*` (decimal integer)
  - `[0-9][0-9_]*\.[0-9_]+(e[+-]?[0-9_]+)?` (float with fractional part)
  - `[0-9][0-9_]*e[+-]?[0-9_]+` (float in scientific form, no fractional)
  - Underscores are stripped before storage; leading underscore after the prefix is an error (`0x_FF` rejected, `0xFF_FF` accepted).
- **New token kinds** in [internal/token/token.go](../../../internal/token/token.go):
  - `Kind_FloatLiteral` (alongside existing `Kind_IntegerLiteral`).
  - Operators: `Op_Percent`, `Op_Amp`, `Op_Pipe`, `Op_Caret`, `Op_Tilde`, `Op_LShift`, `Op_RShift`.
  - Compound assignments: `Op_PlusEq`, `Op_MinusEq`, `Op_StarEq`, `Op_SlashEq`, `Op_PercentEq`, `Op_AmpEq`, `Op_PipeEq`, `Op_CaretEq`, `Op_LShiftEq`, `Op_RShiftEq`.
  - Type-name keywords: handled either as dedicated `Type_*` token kinds (matching the commented-out `Type_Int32` in the current code) or as identifiers checked at parse time. **Decision: keep them as identifiers.** Adding twelve new token kinds for type names is noise; the analyzer already does the keyword-vs-identifier disambiguation through `lookupPrimitive`. Reserve dedicated tokens only if the parser ever needs to make a syntactic decision based on whether the next token is a primitive type, which it does not.
- **Multi-character operator disambiguation:** `<<` must out-prefer `<`, `<=` keeps its precedence, `<<=` out-prefers `<<`. Same pattern for `>>` / `>>=`. The current tokenizer's lookahead suffices; extend the per-character switch.
- **Array punctuation:** add `[` and `]` token kinds. They are structural punctuation, not operators. The tokenizer continues to emit ordinary integer-literal tokens between them; the parser, not the tokenizer, decides whether a bracket pair is a type length, an array literal, or an index suffix.

## Parser changes

[internal/ast/parser.go](../../../internal/ast/parser.go):

- **Precedence table** grows. The full ordered list from lowest to highest binding:
  1. logical OR (`||`)
  2. logical AND (`&&`)
  3. bitwise OR (`|`)
  4. bitwise XOR (`^`)
  5. bitwise AND (`&`)
  6. equality (`==`, `!=`)
  7. comparison (`<`, `<=`, `>`, `>=`)
  8. shift (`<<`, `>>`)
  9. additive (`+`, `-`)
  10. multiplicative (`*`, `/`, `%`)
  11. unary (`-`, `!`, `~`)
  12. call / member / primary
- All bitwise/shift levels are left-associative; the existing loop-based parser handles this with no new logic, just new precedence slots.
- **Assignment statement parsing** must accept any of the eleven assignment operators on the LHS-side check. Today it only matches `=`. Refactor into a small `isAssignmentOp(tok)` helper; the resulting `AssignmentStatement` AST node grows an `Op` field carrying the operator kind.
- **No new expression productions.** Compound assignment is statement-level; conversions reuse the function-call production; literal forms reuse `IntegerLiteral` / new `FloatLiteral`.
- **`FloatLiteral` AST node** added alongside `IntegerLiteral`. Stores the original lexeme and a parsed `float64` value. Formatter prints the original lexeme to preserve source style.
- **Fixed-array type references.** After parsing a base type reference, accept one `[` integer-literal `]` suffix and build `ArrayTypeReference`. The length is intentionally syntactic at this stage: semantic validation owns positive-value and `uintsize` range checks. Repeated suffixes (`int32[2][3]`) are rejected in Phase A rather than accidentally introducing nested arrays.
- **Array literals.** In primary-expression position, `[` starts `ArrayLiteralExpression{Elements []Expression}`; elements are comma-separated and a trailing comma is accepted. `[]` parses successfully so the analyzer can issue its targeted “array literal needs element type and length” diagnostic.
- **Index expressions.** The postfix parser accepts `expression '[' expression ']'` and builds `IndexExpression{Receiver, Index}`. Postfix parsing makes calls/member access/indexing bind more tightly than unary operators, so `a[i] + 1` and `f()[0]` have the expected shape. Only an array receiver is accepted by Phase A semantics; parsing `f()[0]` now is harmless and produces a source-located type error if `f()` is not an array.

## Semantic analyzer changes

[internal/semantics/semantics.go](../../../internal/semantics/semantics.go):

- Extend the primitive-type table per "Type system changes" above.
- Add the operator-typing matrix from the same section. The existing `typeOfBinary` switch grows; structure it as a table indexed by operator kind for clarity.
- **Literal-fits-target check.** When an integer literal is typed by binding context (`let x: uint8 = 256;`), the analyzer verifies the literal fits the destination range before recording the type. Out-of-range is a structured diagnostic at the literal's position. Float literals similarly check finiteness; no float range check (per §5.9, IEEE folding may produce `Inf`).
- **Conversion-call recognition.** When resolving a `FunctionCallExpression`'s callee, if the identifier resolves to a primitive type name (not a `SymbolFunction`), redirect to the conversion path. Re-tag the node so codegen sees a conversion, not a call. Reject any conversion not in the matrix above.
- **`T.from(x)` recognition.** Member-access syntax in callee position is new — today's parser only supports identifier callees. Add a minimal member-access path: when the parser sees `Identifier '.' Identifier` followed by `(`, build `Call(Member(receiver, name), args)`. The analyzer recognizes this only for the `Type.from(arg)` shape and rejects all other member-access uses with "member access not yet supported." (Member access in general lands with classes — Phase E.)
- **`bool ↔ int` rejection.** Any conversion attempt in this direction emits a "no implicit bool/int conversion" diagnostic with a hint: "use a ternary (`b ? 1 : 0`) or comparison (`n != 0`) instead."
- **Mixed-precision rejection.** Any binary expression with operands of different numeric types is a structured diagnostic naming both types and suggesting `T(x)` for the explicit conversion.
- **Array literal typing.** With an expected `T[N]`, require exactly `N` elements and type every element with expected type `T`. Without an expected type, reject `[]`; otherwise type the first element normally, use its type as `T`, type each remaining element in that context, and infer `T[element-count]`. A mismatch points at the mismatching element and names the inferred element type. `void` is never a valid element type.
- **Array indexing and assignment.** `IndexExpression` requires a `TypeArray` receiver and a `uintsize` index. Its result is the receiver element type and it is addressable when its receiver is addressable. An integer-literal index is range-checked against the fixed length in the analyzer: a bad constant is a build failure; a nonliteral index records a required runtime bounds guard. Assignment through an index follows the ordinary `const`/`let` rule and requires the assigned value to match the element type exactly.
- **Array `.length`.** Recognize `array.length` as a compiler-known read-only property when `array` has `TypeArray`; its type is `uintsize` and its value is the statically known length. General member access remains out of scope. Because the length is immutable, no storage field or C-level property lookup is needed.

## Codegen changes

[internal/codegen/](../../../internal/codegen/):

- **Type mapping table extension:**

  | Delta | C |
  |---|---|
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
  | `char` | `uint32_t` |
  | `T[N]` | an interned `typedef struct { T data[N]; } delta_arr_<T>_<N>` |

  Every generated `.c` includes `<stdint.h>` (already present), `<stdbool.h>` (already present), and now `<math.h>` (for `isnan`, `isinf`) and `<stdlib.h>` (for `abort`) and `<stdio.h>` (for `fprintf(stderr, ...)`).

- **Runtime preamble.** Every TU opens with an emitted block of `static inline` helpers and a panic function:

  ```c
  static void delta_rt_panic(const char *file, int line, const char *reason) {
      fprintf(stderr, "delta: panic at %s:%d: %s\n", file, line, reason);
      abort();
  }

  static inline int32_t delta_rt_add_i32(int32_t a, int32_t b, const char *file, int line) {
      int32_t r;
      if (__builtin_add_overflow(a, b, &r)) {
          delta_rt_panic(file, line, "arithmetic overflow in `+`");
      }
      return r;
  }
  /* ... and so on for sub/mul on every integer type, div/edit with two checks, etc. */
  ```

  Helpers are emitted only for type/op combinations actually used by the TU — the codegen tracks reachable trap kinds during emission and renders only the helpers needed. (Avoids fifty unused helpers in every output file.)

- **Trap helper coverage:**

  | Helper family | Variants | Notes |
  |---|---|---|
  | `delta_rt_add_T` | one per integer type | uses `__builtin_add_overflow` |
  | `delta_rt_sub_T` | one per integer type | uses `__builtin_sub_overflow` |
  | `delta_rt_mul_T` | one per integer type | uses `__builtin_mul_overflow` |
  | `delta_rt_div_T`, `delta_rt_edit_T` | one per integer type | divzero check + (signed only) `int_MIN/-1` check |
  | `delta_rt_neg_T` | one per signed integer type | unary `-`; check `x == INT_MIN` |
  | `delta_rt_shl_T`, `delta_rt_shr_T` | one per integer type | shift-count-OOR check (count vs bit width) |
  | `delta_rt_narrow_S_to_D` | one per allowed (source, destination) pair where narrowing applies | range check |
  | `delta_rt_sign_S_to_D` | one per sign-flipping pair | range check |
  | `delta_rt_f_to_i_T` | one per (`float32`/`float64`, integer type) pair | NaN/Inf/range check |

- **Expression emission changes:**
  - Integer literals carry their inferred type from the analyzer. Emission writes the value as a C literal with a width-appropriate suffix only where C demands it (`123LL` for `int64_t` literals, `123U` for unsigned, `123ULL` for `uint64_t`); narrower types fit in plain `int`-typed literals and rely on implicit promotion to the target type.
  - Float literals emit as C literals: `3.14` for `double`, `3.14f` for `float`.
  - Binary expressions on integers route through trap helpers: `a + b` (where both are `int32`) becomes `delta_rt_add_i32(a, b, "src.delta", 17)`. The file/line strings come from `#line` directive bookkeeping — Phase A is the first place where source-mapped runtime errors meet `#line`, so this validates the directive plumbing from v0.
  - Binary expressions on floats emit raw C operators (no traps).
  - Compound assignment `x += y` lowers to `x = delta_rt_add_T(x, y, file, line);` — never a raw C `+=`.
  - Conversion expressions lower through the appropriate `delta_rt_narrow_*` or `delta_rt_sign_*` helper for trapping conversions, or a plain `(T)x` cast for free conversions.
- **`#line` integration.** The trap helpers take `__FILE__` / `__LINE__` arguments because the C-level `#line` directive shifts them. Verify on a small fixture that a panic from line 12 of `src.delta` actually prints `src.delta:12`, not `src.c:<C line>`.
- **Fixed-array layouts and expressions.** For every distinct `T[N]` used by a translation unit, emit one deterministic wrapper typedef before the functions that use it. A wrapper struct, rather than a raw C `T[N]`, preserves Delta's whole-array assignment, parameter, and return-value semantics, which C arrays do not have. Lower `[a, b, c]` to a compound literal of that wrapper (`(delta_arr_i32_3){ .data = { a, b, c } }`); lower `a[i]` to `a.data[i]`. `.length` lowers to a width-correct `uintsize` literal and emits no C member access.
- **Bounds helper.** Add `delta_rt_index(uintptr_t index, uintptr_t length, const char *file, int line)` (`uintsize`'s C lowering). It panics with `array index out of bounds` when `index >= length` and otherwise returns `index`, so a dynamic source index emits exactly once as `a.data[delta_rt_index(i, 4, __FILE__, __LINE__)]`. Constant-valid indexes omit the helper. This helper is selected by the same per-TU reachability tracker as numeric trap helpers.

## CLI / build behavior

No changes. `delta build`, `delta dump-ast`, `delta test`, `delta lsp` keep their v0 semantics. The codegen output grows a runtime preamble; nothing else moves.

## Filesystem layout

Unchanged from v0:

```
project/
  hello.delta
  build/
    c/
      hello.c    # now opens with delta_rt_* helpers
    hello
```

`delta_runtime.h` is **not** introduced in Phase A.

## Testing strategy

Add fixtures under `test-source/tests/codegen/numeric/` (a new sub-suite under the existing codegen tests). Each fixture exercises one slice of the new surface and verifies either a specific exit code (pass-and-run) or a specific panic message (trap-on-run).

The runner gains a new expectation form:

```json
{
  "file": "overflow_add_i32_trap.delta",
  "expect": "trap",
  "panic_contains": "arithmetic overflow in `+`",
  "panic_at": "overflow_add_i32_trap.delta:7"
}
```

Semantics:

- `"expect": "trap"` means: build must succeed; running the binary must exit non-zero (via `abort()`); the panic line on stderr must match `panic_contains` and `panic_at`.
- `"expect": "build_fail"` covers analyzer- or codegen-level rejection (already supported from v0 codegen plan).

Initial fixtures (twenty-eight, grouped):

**Integer breadth (8)**
- `uint8_add_ok.delta`, `int64_arith_ok.delta`, `uintsize_arith_ok.delta`, `mixed_widths_err.delta` (compile error), `int32_to_int64_ok.delta`, `int64_to_int32_narrow_trap.delta`, `int32_to_uint32_sign_flip_trap.delta`, `int_max_constant_ok.delta`.

**Float (4)**
- `float64_arith_ok.delta`, `float32_to_int_trap_nan.delta`, `float32_to_int_ok.delta`, `float_mixed_precision_err.delta` (compile error).

**Operators (5)**
- `edit_ok.delta`, `edit_zero_trap.delta`, `bitwise_ops_ok.delta`, `shift_ok.delta`, `shift_oor_trap.delta`.

**Compound assignment (2)**
- `compound_add_ok.delta`, `compound_mul_overflow_trap.delta`.

**Char (3)**
- `char_compare_ok.delta`, `char_from_uint32_ok.delta`, `char_from_invalid_trap.delta`.

**Literals (1)**
- `hex_binary_underscore_ok.delta` (covers `0xFF_FF`, `0b1010_1010`, `1_000_000`).

**Fixed arrays (5)**
- `array_literal_inferred_ok.delta` (`const xs = [1, 2, 3];` is `int32[3]`), `array_literal_contextual_ok.delta` (`const bytes: uint8[3] = [1, 2, 3];`), `array_index_and_mutation_ok.delta`, `array_constant_index_oob_err.delta`, `array_dynamic_index_oob_trap.delta`.

The pre-existing v0 fixtures must still pass unchanged — Phase A is purely additive on top of `int32`/`bool`/`void`.

## Stage-by-stage implementation order

1. **Type system foundation.** Extend `TypeKind`, the printable names, and the predicates. Add `lookupPrimitive` entries for the new names. Land with unit tests in `internal/semantics/` that round-trip type-name resolution. No tokenizer/parser/codegen changes yet; analyzer rejects programs that use new types because the tokenizer still treats `int64` as a generic identifier — that's fine, the existing identifier path already produces a `TypeReference` for type-position uses, so this step really does work in isolation.
2. **Tokenizer expansion.** Add hex/binary/float literal forms and the new operator tokens. Land with tokenizer tests covering each new token kind and each rejection case (`0x_FF`, malformed exponents, etc.). Codegen unaffected; parser still ignores the new tokens.
3. **Parser expansion.** Add precedence slots for shifts, bitwise, and the modulus operator. Add compound-assignment parsing. Add `FloatLiteral` AST node and `Op` field on `AssignmentStatement`. Add the minimal `Type.from(x)` member-access path, array type suffixes, array literals, and postfix index expressions. Land with parser tests covering precedence (mixed `&` / `&&` / `==`), associativity, compound-assignment shapes, and nested postfix parsing.
4. **Analyzer operator and array typing.** Implement the operator-typing matrix, literal-fits-target, conversion-call recognition, mixed-precision and `bool ↔ int` rejection. Add array-type interning, array literal contextual/inferred typing, `.length`, index typing, and constant-index bounds diagnostics. Land with analyzer unit tests on each rule.
5. **Codegen type mapping and fixed arrays.** Extend the type-mapping table and emit interned fixed-array wrappers. Verify programs using `int64`, `float64`, `char`, and `uint8[3]` compile through to executables with correct values, **without** trap helpers yet — division by zero and dynamic out-of-bounds access still produce a clang/runtime error. This is the milestone where the new types are end-to-end visible.
6. **Trap helpers — emission machinery.** Add the per-TU tracker that records which trap families are used and emits only those at the top of the TU. Include the array-index guard. Land with codegen unit tests that snapshot the emitted preamble for representative numeric and array programs.
7. **Trap helpers — coverage.** Implement all helper families per the table above. Each one as a function template parametrized by Delta type; emission picks the right one based on operand types from the analyzer. Land with the panic-on-overflow and dynamic-index fixtures.
8. **Conversion lowering.** Emit `delta_rt_narrow_*`, `delta_rt_sign_*`, `delta_rt_f_to_i_*` for trapping conversions; plain casts for free conversions. Land with conversion fixtures.
9. **Compound assignment lowering.** Implement the helper-call-assigned-back form, including index LHSs after evaluating the receiver and index once. Land with compound and indexed-assignment fixtures.
10. **`#line`-aware panic messages.** Verify panic file/line strings carry through `#line`; fix the directive emission if the helper position is wrong. Land with end-to-end fixtures that assert the panic location for both arithmetic and array indexing.
11. **Phase-A fail-closed guards.** Add codegen-level diagnostics for the Phase-A-out-of-scope constructs the analyzer might accept once Phase B lands but Phase C has not (e.g., the literal `OverflowError` type name); emit "Phase A: not yet supported, see Phase C" with a source-located message.

Steps 1–4 are mostly analyzer/parser plumbing; steps 5–7 are the risk-bearing milestone (this is where overflow behavior actually changes); steps 8–11 are mechanical fill-in.

## Stretch (in scope if cheap, out of scope if not)

- `.isNaN()`, `.isFinite()`, `.isInf()` methods on float types. Spec defines them as instance methods. Without a real method-dispatch system (Phase E), these would have to be parser-special-cased — that's ugly enough to defer. **Recommend dropping from Phase A** and revisiting when classes/methods land.
- A `panic(msg: cstringview)` user-callable intrinsic. Already needs `cstringview` (Phase D), which is upstream of Phase A in the v0.5a order. **Recommend adding to Phase A** if the surface fits, since the trap helpers already invoke `delta_rt_panic` — exposing it user-facing is small. Hold off on `process.exit` and `unreachable()`.

## Risks and open questions

- **`__builtin_*_overflow` portability.** Clang and GCC both support them; MSVC does not. v0.5 only targets Clang per the v0 toolchain decision, so this is fine — but worth a one-line comment in the runtime preamble noting the dependency. If MSVC support ever lands, we replace the builtins with explicit width-doubled comparisons.
- **Float-to-int trap precision.** `int64(my_float64)` is genuinely lossy at the boundary because `double` has 53 bits of mantissa. The trap check has to compare against `(double)INT64_MAX + 1` to handle values that round up to `INT64_MAX + 1`. Worth a focused fixture.
- **`intsize`/`uintsize` as analyzer-distinct but ABI-same on 64-bit.** Two analyzer-side types that lower to the same C type means the trap helpers `delta_rt_add_intsize` and `delta_rt_add_int64` are duplicates on 64-bit but distinct on 32-bit. **Decision: emit both as separate helpers, even on 64-bit.** The codegen is simpler if every Delta type has its own helper; the duplication is a few hundred bytes per TU at most and clang merges identical inline functions at link time.
- **Compound assignment to fields.** Phase A predates classes (Phase E), so the only assignment LHS is an identifier. Compound-assignment-to-field is a Phase E concern. The lowering shape (helper call) generalizes cleanly because field access is just an lvalue; deferring is safe.
- **What happens to v0 programs?** Every v0-passing fixture must still pass. The new operator-typing rules forbid mixed-precision, but the only types v0 had were `int32` / `bool` / `void`, so there's no opportunity for v0 programs to use mixed precision. Safe.
- **Where do trap helpers go when the runtime lands?** Pre-committed in Decision §1: `static inline` per TU now, real library later. No design work needed in Phase A to support the move.
- **Should `let x: int32 = 0xFFFFFFFF;` be a compile error or a runtime trap?** Compile error — the literal-fits-target check catches it at parse-into-analyzer time, before any runtime semantics apply. Same for `let x: int8 = 256;`. The trap path is for *computed* values, not literals.
- **Why fixed arrays before `Array<T>`?** A primitive fixed layout gives codegen a safe, copyable array value with no allocator, destructor, aliasing, or growth policy. Treating a growable heap owner as a primitive before Phase F would either leak or silently create shallow aliases. The heap-backed collection therefore remains a separate, ownership-aware milestone.
- **Can arrays nest in Phase A?** No. `int32[2][3]` would be mechanically lowerable, but allowing it now would turn the scalar-only capability rule into an accidental ownership policy. The parser rejects it and the later element-capability design reopens it deliberately.
- **How does array compound assignment preserve single evaluation?** `xs[i] += y` must not lower to an expression that evaluates `xs` or `i` twice. The codegen captures the lvalue location/index once before applying the relevant numeric trap helper; this is the same semantic promise as identifier compound assignment and needs a focused fixture.
- **Does the precedence change break any existing test?** Bitwise operators currently aren't parsed at all, so adding them between equality and comparison won't reshape any existing tree. Verify by re-running the existing parser snapshot tests.

## Definition of done for Phase A

- The analyzer accepts every program in the new `numeric/` fixture suite that is marked `expect: pass` or `expect: trap`, and rejects every one marked `expect: build_fail` / `expect: fail` with a diagnostic that matches the fixture's `contains` field.
- The trap fixtures, when run, exit non-zero and print a Delta panic line on stderr whose file:line:col matches the source location of the trapping operation.
- All v0 codegen fixtures keep passing unchanged.
- A focused unit-test pass exists for each Phase-A surface change: tokenizer (new literals + operators), parser (precedence + compound), analyzer (operator typing + conversions + mixed-precision rejection), codegen (trap helper emission + selection).
- Fixed arrays are first-class compiler primitive types: `T[N]` preserves structural type identity across declarations, literals infer or consume the correct element type, `.length` is `uintsize`, valid indexing and mutation execute correctly, and invalid constant/dynamic indexes fail at compile time/runtime respectively.
- `delta build` continues to work on Phase-A-using programs with no measurable startup-time regression (target: codegen still finishes in well under a second on the acceptance program from the goal doc; the runtime-preamble overhead is bounded by the helper-emission gating from Step 6).
- The Phase B plan can start without revisiting any Phase A decision; in particular, `for`-loop bodies can freely use the wider integer surface and compound assignment without further codegen work.

That's the Phase A contract. The recoverable-trap story (`as result` over `OverflowError`) and the user-facing intrinsics are deferred to Phase C and Phase B respectively, both tracked in [compiler-goal-v0.5.md](../../compiler-goal-v0.5.md).
