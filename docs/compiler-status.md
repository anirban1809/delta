# Delta Compiler Status

Date: 2026-06-07

This document describes the current implementation status of the Delta compiler
against the design in `docs/main-spec.md` and `docs/spec-sections/`. It is a
working checkpoint for the initial Go compiler, not a replacement for the
language specification.

## Current Implementation

The compiler can now take a single `.delta` source file end-to-end:
tokenize, parse, run name resolution and a first pass of type checking,
lower the analyzed AST to C, write it to disk, and invoke clang to produce
a runnable executable. Tokenizer, parser, and semantic failures are
reported through a shared diagnostic bag and printed with file, line,
column, source line, and caret location. The parser performs error
recovery so multiple syntax errors can be reported in a single pass. The
same front-end pipeline is also exposed as a Language Server (`delta lsp`)
consumed by the bundled VS Code extension, which uses the analyzer's
scope tree and resolved-reference map to drive editor features.

Implemented command path:

1. `cmd/delta/main.go` accepts `delta build <file.delta>`,
   `delta dump-ast <file.delta>`, `delta test`, and `delta lsp`.
2. The CLI checks that the input file has a `.delta` extension.
3. `internal/pipeline.Compile(name, contents)` runs tokenize → parse →
   semantic analyze in memory, returning the AST, the diagnostic bag, and
   the analyzer's `Refs` map. Both the CLI and the LSP server share this
   entry point.
4. If any front-end stage reports diagnostics, downstream stages are
   skipped and the CLI prints them.
5. `delta build` then calls `internal/codegen.Emit` to lower the AST to
   C, writes the result to `build/c/<basename>.c`, locates clang via
   `internal/toolchain.FindClang`, and invokes it with `-std=c11 -Wall
   -Werror=implicit-function-declaration -fwrapv -o build/<basename>
   build/c/<basename>.c`. A non-zero clang exit on valid-Delta input is
   surfaced as an internal compiler error with the generated `.c` left
   in place for inspection.
6. `delta dump-ast` runs the front end and prints the formatted AST on
   success (the old `delta build` behavior).
7. `delta build` also accepts stage-stopping debug flags that print an
   earlier stage's output instead of building a binary: `--tokens` (token
   stream), `--ast` (parsed AST), and `--sema` (full front end, then the
   formatted AST). The earliest requested stage wins.

The project now covers stages 1–3, 5, and 6 of the planned pipeline from
Section 2:

1. lex
2. parse
3. semantic analysis: name resolution, scope rules, and type checking over
   the full primitive numeric set (operator typing, call arity and argument
   types, numeric `T(x)` conversions, return arity and types, assignment
   compatibility, condition typing), plus the Phase B control-flow checks:
   definite-assignment (no read before assignment), return-coverage on
   non-`void` functions, and cross-scope shadowing rejection. These flow
   checks are AST-walk heuristics, not a control-flow graph — the CFG +
   reusable dataflow framework sketched in the Phase B plan was not built
   (see "Semantic Analysis Status" and "Deviations From The Phase B Plan").
5. C code generation (single-TU, with trapping runtime helpers for checked
   conversions and arithmetic; see "Codegen Status" below for the covered
   surface)
6. Clang invocation (single-call compile + link to `build/<basename>`)

The remaining planned stages are not implemented yet:

1. typed AST (the current analyzer computes types but does not yet emit a
   separate typed AST node tree)
2. ownership and lifetime analysis
3. checked error-state analysis

## Implemented Language Surface

### Source Files

Implemented:

- Single input file compilation from the CLI.
- `.delta` file extension validation.

Not implemented yet:

- Module discovery.
- Imports and exports.
- Package configuration such as `delta.json`.
- Source-to-module mapping beyond the single file passed on the command line.

### Tokens

Implemented token categories:

- Identifiers.
- Integer literals, including `0x` hex, `0b` binary, and `0o` octal prefixes,
  all accepting `_` digit separators (e.g. `0xFF_FF`, `1_000_000`).
- Floating-point literals: decimal-point form (`3.14`) and scientific form
  (`2.5e1`, `1e10`, `1.5e-3`).
- Boolean literals: `true`, `false`.
- String literals using plain double quotes.
- Character literals using single quotes (with `\n`, `\t`, `\xNN`, `\u{...}`
  escapes).
- Keywords: `function`, `return`, `const`, `let`, `if`, `else`, `while`,
  `for`, `switch`, `case`, `default`, `break`, `continue`.
- Delimiters: `(`, `)`, `{`, `}`, `:`, `;`, `,`.
- Arithmetic operators: `+`, `-`, `*`, `/`, `%`.
- Bitwise operators: `&`, `|`, `^`, `~`, `<<`, `>>` (a lone `&` is bitwise-and;
  `&&` remains logical-and).
- Comparison operators: `<`, `<=`, `>`, `>=`, `==`, `!=`.
- Assignment operators: `=`, and the compound forms `+=`, `-=`, `*=`.
- Increment / decrement operators: `++`, `--` (lexed with lookahead so `++`
  and `--` are distinguished from `+`/`+=` and `-`/`-=`; only the postfix
  forms are accepted by the parser).
- Logical operators: `!`, `&&`, `||`.
- Error type separator: `|`.
- Line comments (`//`) and block comments (`/* ... */`). Comments are
  preserved in the AST at file and block scope and skipped by the parser
  when looking for grammar productions.

Not implemented yet:

- Template string literals.
- Raw string literals.
- Import/export/decorator/extern tokens.
- Type declaration, class, enum, interface, borrow, move, clone, heap, and error
  handling tokens.
- Remaining compound assignment operators (`/=`, `%=`, `&=`, `|=`, `^=`,
  `<<=`, `>>=`).

### Top-Level Declarations

Implemented:

- Function declarations:

  ```delta
  function add(a: int32, b: int32): int32 {
      return a + b;
  }
  ```

- Function declarations with multiple return types and declared error types:

  ```delta
  function x(): int32, int32 | IOError, NetError {}
  ```

- File-scope `const` declarations:

  ```delta
  const answer: int32 = 42;
  ```

- Rejection of file-scope `let`.

Partially aligned with the design:

- Section 3 allows file-scope `const` and rejects file-scope `let`; this is
  already reflected in the parser.
- The parser currently treats primitive type names like `int32` as identifiers
  in type positions, which matches the current AST shape but is not a complete
  type system yet.
- Multiple return types and error types are currently parsed and formatted as
  type references only. The compiler does not yet validate return arity, error
  type shape, or fallible control flow.

Not implemented yet:

- `export` declarations.
- `import` declarations.
- `type`, `class`, `interface`, and `enum` declarations.
- `extern "c"` blocks.
- Decorators.
- Arrow-bound functions and lambdas.
- Nested function declarations.

### Statements

Implemented inside function and control-flow blocks:

- `return` statements.
- Local `const` and `let` variable declarations.
- Assignment statements, including compound `+=`, `-=`, `*=` (which lower to
  overflow-checked helper calls; see "Codegen Status").
- Expression statements (including postfix `i++;` / `i--;` as statements).
- `if` / `else` statements.
- `while` statements.
- `for` statements: the C-style counted form `for (init; cond; step) { ... }`.
  `init` is a `let`/`const` declaration or empty (an expression-statement
  init such as `for (i = 0; ...)` is **not** accepted — see the deviation
  note below); `cond` is an optional `bool` expression (empty means loop
  forever); `step` is an optional expression evaluated for effect.
- `switch` statements: value `switch (expr) { case L1, L2: { ... } default:
  { ... } }` over an integer or `char` scrutinee, with multi-label cases,
  required braced case bodies, no fall-through, and a required `default`.
- `break` and `continue` statements (rejected outside a loop).
- Local `let name: T;` declarations **without** an initializer (the binding's
  type comes from the annotation and definite-assignment tracks first use).

Aligned with the design:

- Statements require semicolons where applicable.
- Control-flow bodies require braces.
- `const` and `let` are distinct in the AST through the `Mutable` flag on local
  variable declarations.

Not implemented yet:

- `for...of` loops (deferred until the iterator protocol and collection types
  land; see the Phase B plan's out-of-scope table).
- Prefix `++i` / `--i` (only the postfix forms are implemented).
- `switch type` (variant dispatch), and `switch` over strings, enums, or
  floats.
- Range case labels (`case 1..10:`) and const-expression case labels.
- `check` blocks.
- `panic`, `process.exit`, and `unreachable` intrinsics (the Phase B "stretch"
  goal; the trap runtime exists but is not yet user-callable, and no
  divergence concept feeds return-coverage).
- Multi-return destructuring.
- Scoping `for`-`init` bindings to the loop: the induction variable is
  currently declared in the enclosing block scope, so it remains visible
  after the loop (a known deviation from §3.4 / Phase B Decision 1).
- Enforcement that `const` always has an initializer (only `let` may now omit
  one).

Aligned with the design:

- `ReturnStatement.Values []Expression` stores multiple return
  expressions, so the parser accepts multi-expression `return`, and the
  semantic analyzer validates both arity and per-value types against the
  enclosing function's declared return-type list.

### Expressions

Implemented:

- Integer literals (decimal, hex, binary, octal).
- Floating-point literals.
- Boolean literals.
- String literals.
- Character literals.
- Identifiers.
- Parenthesized expressions.
- Unary expressions: `!expr`, `-expr`, `~expr`.
- Postfix increment / decrement: `i++`, `i--` on a mutable integer binding.
  The operand must be an identifier resolving to a `let` of integer type;
  the expression yields the pre-update value and the step traps on overflow
  (lowered through the Phase A-style overflow helpers; see "Codegen Status").
- Binary expressions:
  - multiplicative: `*`, `/`, `%`
  - additive: `+`, `-`
  - shift: `<<`, `>>`
  - bitwise: `&`, `^`, `|`
  - comparison and equality: `<`, `<=`, `>`, `>=`, `==`, `!=`
  - logical: `&&`, `||`

  These are parsed at standard C precedence (`* / %` > `+ -` > `<< >>` >
  relational > equality > `&` > `^` > `|` > `&&` > `||`).
- Numeric conversion expressions such as `int32(x)`, `uint8(n)`, `float64(i)`,
  and `char(codepoint)` (parsed as calls, recognized as conversions by the
  analyzer).
- Function call expressions:

  ```delta
  go(3, 4)
  ```
- Chained function call expressions where the callee is itself an expression:

  ```delta
  makeAdder()(3)
  ```

Not implemented yet:

- `as result`.
- `move`, `clone`, `borrowed`, and `mod borrowed` expressions.
- Member access.
- Index expressions.
- Object literals.
- Array literals.
- Lambda expressions.
- Ternary or other expression forms, if later adopted.

## Current AST Shape

The AST currently separates declarations, statements, and expressions:

- `File`
- `FunctionDeclaration`
  - `Parameters []FunctionParameter`
  - `ReturnTypes []TypeReference`
  - `ErrorTypes []TypeReference`
- `ConstDeclaration`
- `FunctionParameter`
- `TypeReference`
- `BlockStatement`
- `ReturnStatement`
  - stores `Values []Expression` (supports multi-expression returns)
- `Comment` (preserved at file and block scope; skipped by the analyzer)
- `VariableDeclarationStatement` (the `Value` expression is now optional, so
  `let name: T;` parses with `Value == nil`)
- `ExpressionStatement`
- `AssignmentStatement` (carries an `Operator` field: `""` for plain `=`, or
  `"+"`/`"-"`/`"*"` for the compound forms)
- `IfStatement`
- `WhileStatement`
- `ForStatement` (`Init`, `Cond`, `Step`, `Body`; any of `Init`/`Cond`/`Step`
  may be empty)
- `SwitchStatement` (`Scrutinee`, `Cases []*SwitchCase`, and a separate
  `Default *SwitchCase`)
- `SwitchCase` (a plain struct, not a `Statement`: `Labels []Expression` and a
  braced `Body`)
- `BreakStatement`
- `ContinueStatement`
- `IntegerLiteral`
- `FloatLiteral`
- `BooleanLiteral`
- `StringLiteral`
- `CharacterLiteral`
- `Identifier`
- `UnaryExpression`
- `PostfixUnaryExpression` (`Operand` + `Operator` of `"++"` / `"--"`)
- `BinaryExpression`
- `FunctionCallExpression`

This is enough for an untyped parser milestone. It is not yet the typed AST
described in the pipeline design.

## Recently Fixed Parser Gaps

These parser gaps from the first checkpoint have now been fixed:

- Empty function parameter lists parse correctly.
- Identifier-started statements now use lookahead:
  - `identifier = ...;` parses as an assignment statement.
  - `identifier(...);` and other identifier-started expressions parse as
    expression statements.
- Binary operators at the same precedence are parsed left-associatively.
- Logical AND now binds tighter than logical OR.
- Function call callees are expression-shaped, so chained calls such as
  `makeAdder()(3)` can parse.
- `Parser.Check` now checks the current token kind.
- `Parser.Peek` now returns the next token.
- Function declaration parsing now checks return-type and `{` errors instead of
  ignoring those failures.
- Function declarations now parse multiple return types after `:` and multiple
  error types after `|`.
- Function declaration formatting now prints `ReturnTypes` and `ErrorTypes`.
- Parser failures are now recorded as structured diagnostics instead of returned
  as plain Go errors.
- The parser now performs error recovery via `synchronizeDeclaration` and
  `synchronizeStatement`. After a failed declaration or statement the parser
  skips ahead to the next safe boundary (next declaration keyword, next
  statement keyword, after a `;`, or `}`) so multiple syntax errors can be
  surfaced in one pass.

The parser should keep focused tests for these cases as the syntax surface
continues to evolve.

## Diagnostics Status

The compiler now has a shared diagnostics package used by the tokenizer and
parser.

Implemented:

- `SourceError` values include stage, severity, file, line, column, source line,
  message, optional expected text, and optional help text.
- `ErrorBag` collects diagnostics for a compilation run.
- The tokenizer records lexer errors in the shared error bag instead of stopping
  immediately with returned Go errors.
- The parser records parser errors in the shared error bag instead of returning
  plain strings.
- The CLI stops after tokenizer diagnostics before parsing.
- The CLI stops after parser diagnostics before formatting the AST.
- Diagnostic output includes the file path, line and column, stage, severity,
  message, source line, and a caret under the diagnostic column:

  ```text
  example.delta:2:10: tokenizer error: unexpected character '@'
    |
  2 |   return @;
    |          ^
  ```

Remaining diagnostics work:

- Populate `Expected` and `Help` consistently from tokenizer and parser call
  sites.
- Add diagnostic tests for tokenizer and parser failures.
- Add span support for multi-character highlights. Today `SourceError` carries
  a single `Line`/`Column`; the LSP adapter renders these as point ranges that
  editors widen to the token under the cursor.
- Parser recovery is now in place (see `synchronizeDeclaration` and
  `synchronizeStatement`); follow-up work is to tune the recovery anchors so
  cascading "spurious" errors after a real failure are reduced.

## Semantic Analysis Status

The semantic analyzer lives in `internal/semantics/`. It runs after parsing
and reports source-located errors through the same `ErrorBag`. It now
performs both name resolution and a v0 type-checking pass over the current
language subset.

Implemented (name resolution and scope):

- A two-pass walk of the file: pass 1 declares all top-level functions and
  file-scope `const`s (recording function signatures on `SymbolFunction`);
  pass 2 validates signature types and walks bodies. This lets functions
  refer to peers declared later in the file.
- Scopes for the global file, each function (parameters), and each
  `BlockStatement`. Scopes form a parent chain; `FindSymbol` walks up it.
- A parallel `ScopeNode` tree (in `internal/semantics/types.go`) mirrors
  the lexical scope structure with source ranges, so a cursor position can
  be mapped to its enclosing scope via `RootScope.FindDeepest(pos)`.
- Symbol kinds: `SymbolFunction`, `SymbolFileConst`, `SymbolParameter`,
  `SymbolLocalConst`, `SymbolLocalLet`.
- Each symbol carries a `Display` string used for editor hover (e.g.
  `const counter: int32`, `let x: bool`, `param a: int32`,
  `function add(int32, int32) -> int32 | IOError`).
- Duplicate-identifier rejection for functions, file consts, parameters, and
  locals. For local `let`/`const` this check walks the whole scope chain
  (`FindSymbol`), so it now also rejects a binding that shadows a
  visible outer-scope name (cross-scope shadowing per §3.4). The diagnostic
  is the generic "use of duplicate identifier"; it does not yet cite the
  original declaration's position or carry the parameter-shadows-file-scope
  exemption from the Phase B plan.
- Unknown-identifier detection inside expressions and as assignment targets.
- Assignment rules:
  - `const` (file or local) cannot be reassigned ("cannot assign to const: x").
  - Function names cannot be reassigned.
  - Parameters cannot be reassigned ("cannot assign to const parameter: x").
  - Only `SymbolLocalLet` is a legal assignment target.
- Function calls: the callee identifier must resolve to a `SymbolFunction`;
  invoking a non-callable symbol is rejected.
- Function-typed values are not yet supported; expression-shaped callees
  (e.g. `makeAdder()(3)`) parse but are rejected by the analyzer.
- `if`, `else`, `while`, `for`, and `switch`-case bodies recurse into nested
  scopes; condition / scrutinee expressions are analyzed against the
  enclosing scope. (`break`/`continue` are validated for "must be inside a
  loop" in the parser via a loop-depth counter, not in the analyzer.)
- A `Refs` map records every resolved identifier use-site (keyed by
  `ast.Position`) so the LSP can answer go-to-definition and hover for
  identifier references without re-walking the tree.

Implemented (v0 type checking):

- A full primitive type system: the signed integers `int8`, `int16`,
  `int32`, `int64`, `intsize`; the unsigned integers `uint8`, `uint16`,
  `uint32`, `uint64`, `uintsize`; the floats `float32`, `float64`; plus
  `bool`, `string`, `char`, `void`, and the sentinels `TypeEmpty` (no
  annotation) and `TypeInvalid` (poison value used to suppress cascading
  errors). `Type` exposes `IsInteger`, `IsFloat`, `IsSigned`, `IsUnsigned`,
  and `BitWidth` helpers.
- `TypeOf` computes types for integer/float/boolean/string/character
  literals, identifier references, unary expressions, binary expressions,
  and function-call/conversion expressions. Integer literals default to
  `int32` and float literals to `float64`, but a literal operand coerces to
  the other operand's (or the annotated binding's) type, so
  `let x: uint8 = 5` and `a + 1` type-check against `a`'s type.
- Unary operator typing: `!` requires `bool`; `-` requires a numeric
  (integer or float) operand; `~` requires an integer operand.
- Binary operator typing (operands must share a kind; integer literals
  coerce as above):
  - `+`, `-`, `*`, `/` require matching numeric operands and yield that type.
  - `%` is integer-only (C has no float `%`) and yields the operand type.
  - `<<`, `>>` require integer operands and yield the left operand's type;
    the count need not share that type.
  - `&`, `^`, `|` are integer-only and yield the operand type.
  - `<`, `<=`, `>`, `>=` accept matching numeric or `char` operands and
    yield `bool` (`char` compares by code point).
  - `==`, `!=` require matching operand types and accept numeric, `bool`, or
    `char` operands; yield `bool`.
  - `&&`, `||` require `bool` operands and yield `bool`.
- Numeric `T(x)` conversions (`ClassifyConversion`): int→int that widens
  with the same signedness is free; any narrowing or sign change traps;
  float→int traps (NaN/range); int→float and float→float are free; int→char
  traps (the value must be a valid Unicode scalar). Forbidden conversions
  (e.g. from `bool`) are a compile error. Resolved conversions are recorded
  by position in the analyzer's `Conversions` map, and integer `/`/`%` and
  `<<`/`>>` are recorded in `Divisions`/`Shifts`, so codegen can lower the
  trapping forms without re-running inference.
- Function call type checking:
  - Resolves the callee symbol, rejects non-identifier and non-function
    callees.
  - Arity check against the recorded signature (`function f expects N
    argument(s), got M`).
  - Per-argument type check against the recorded parameter type list.
  - In expression position, multi-return calls are rejected; void-returning
    calls yield `void`; single-return calls yield their declared type.
- Variable declarations infer the binding's type from the initializer when
  no annotation is present.
- Assignment statements check that the value's type matches the target's
  declared type and emit a mismatch diagnostic otherwise.
- `if` and `while` conditions are required to be `bool`.
- Return statements are checked against the enclosing function's recorded
  `FunctionSignature`:
  - `void` cannot appear alongside other return types.
  - A declared `void` return is treated as "no values expected".
  - Return arity must match the declared return-type list.
  - Each returned expression must match the declared type at its position.
- Function-signature type validation: parameter and return types that do
  not resolve to known primitives are rejected before the body is analyzed
  (`unknown identifier <Type>`).

Implemented (control flow & flow analysis, Phase B):

- `for` typing: the `init` declaration is analyzed and registered, an empty
  `init` is tolerated, `cond` (when present) must type as `bool`, the `step`
  is analyzed for effect, and the body is analyzed in a nested scope. A
  `const` induction variable that the loop would mutate is rejected.
- `switch` typing: the scrutinee must be an integer type or `char` (`bool`,
  float, and other types are rejected with type-specific diagnostics); each
  case label must type-check against the scrutinee (bare integer literals
  coerce to the scrutinee's integer type, negative/`char` labels do not);
  duplicate case labels across the whole switch are rejected. `default` is
  required, but that requirement is currently enforced in the **parser**
  (`missing default case`) rather than the analyzer.
- Postfix `++` / `--` typing: the operand must be an identifier bound to a
  mutable (`let`) integer; `const`, non-integer, and unknown operands are
  rejected. Each occurrence is recorded in the analyzer's `IncDecs` map so
  codegen can lower the overflow-trapping form.
- Definite-assignment: an uninitialized `let name: T;` is tracked through a
  per-scope assignment list; reading it before an assignment is rejected
  ("`x` is uninitialized"). Assignments in an enclosing scope are visible to
  nested reads. `if`/`else` joins via intersection (with branches that always
  `return` contributing nothing to the join). Assignments made *only* inside a
  loop body do not escape to the enclosing scope, so a read after the loop is
  correctly treated as possibly-unassigned.
- Return-coverage: a non-`void` function whose body is not guaranteed to hit
  a `return` is rejected ("all paths must return a value"). `if`/`else`
  (both branches return), `switch` (every case **and** `default` return), and
  `for` bodies feed this check.

These flow checks are **AST-walk heuristics**, not the per-function CFG +
reusable dataflow framework described in the Phase B plan. There is no
`internal/semantics/cfg.go` or `dataflow.go`; definite-assignment is a
per-`Scope` `assignments` list plus an `if`/`else` intersection join, and
return-coverage is the structural `blockReturns`/`statementReturns` walk.
This is enough for the Phase B fixture surface but is not a sound general
dataflow (e.g. `for`-body return-coverage assumes the loop runs at least
once, and there is no divergence/`panic` edge). See "Deviations From The
Phase B Plan" below.

Not implemented yet (semantics):

- A control-flow graph and a reusable dataflow framework (the planned
  `cfg.go` / `dataflow.go`); the current flow checks are AST-walk heuristics.
- The parameter-shadows-file-scope exemption, and shadowing/duplicate
  diagnostics that cite the original declaration's position.
- A divergence concept (`panic`/`process.exit`/`unreachable`) so
  return-coverage can accept diverging paths.
- Validation of declared error types on function signatures (the parser
  surfaces them; the analyzer currently treats them as unresolved primitives
  unless they happen to match a known type).
- Tracking and validating callable expressions (function values, member
  callees, returned functions).
- Equality and ordering on `string` (numeric/`bool`/`char` equality and
  numeric/`char` ordering are implemented).
- Bidirectional inference (annotations are currently informational; the
  initializer's inferred type is what the binding actually gets when a
  non-empty annotation is supplied — this is a known gap and needs a real
  "annotation drives inference" pass).
- A separate, persisted typed-AST node tree. Types are computed on demand by
  `TypeOf` rather than materialized into AST nodes.

## Codegen Status

The C code generator lives in `internal/codegen/`. It walks the analyzed
AST and emits a single C translation unit. It is paired with
`internal/toolchain/` for clang location and `cmd/delta` for the
write-and-invoke step.

Implemented (exercised by 17 golden-file fixtures under
`test-source/tests/codegen/`, the 23-case `test-source/tests/primitives/`
suite, and the 61-case `test-source/tests/controlflow/` suite — the latter
two run `pass`/`fail`/`trap` verbs end-to-end through clang. Suites are
auto-discovered by `delta test` from any `test-source/tests/<dir>/tests.json`):

- Single-file lowering to `build/c/<basename>.c`, then clang invocation
  to produce `build/<basename>`. Generated `.c` is preserved on failure.
- Type mapping: the signed integers to `int8_t`…`int64_t` (and `intsize →
  intptr_t`), the unsigned integers to `uint8_t`…`uint64_t` (and `uintsize →
  uintptr_t`), `float32 → float`, `float64 → double`, `bool → bool` (via
  `<stdbool.h>`), `void → void`, `char → char`. Every TU opens with
  `#include <stdint.h>` and `#include <stdbool.h>`.
- Function lowering: forward declarations for every function are emitted
  in source order at the top of the TU; bodies follow with named
  parameters (no unnamed `int32_t f(int32_t)` style).
- Entry-point wrapper: a user `function main(): int32` is renamed to
  `delta_main` at the C level; an `int main()` shim at the bottom of the
  file calls `(int)delta_main()`. The user's Delta source still says
  `main`.
- File-scope `const` lowers to `static const T name = expr;` between the
  forward decls and the bodies.
- Statements: `return` (with and without value), `let` (including the
  initializer-less `let name: T;`, lowered to an uninitialized `T name;`),
  local `const` (lowered as `const T x = expr;`), assignment, `if`/`else`,
  `while`, `for`, `switch`, `break`, `continue`,
  function-call-as-statement (`ExpressionStatement`), and block
  statements with brace wrapping regardless of statement count.
  - `for` lowers to a native C `for (init; cond; step) { body }` (empty
    `init`/`cond`/`step` slots are emitted as empty), so a Delta `continue`
    naturally runs the C `for`-step.
  - `switch` lowers to a native C `switch` with each Delta case rendered as
    one or more C `case L:` labels sharing a block, a synthesized `break;`
    after each case body to suppress C fall-through, and the Delta `default`
    as C `default:`.
  - `break` / `continue` lower to plain C `break;` / `continue;`.
- Expressions: integer, float, boolean, and character literals (char
  literals are re-quoted as C char constants); identifiers; unary `-`, `!`,
  and `~`; postfix `++` / `--`; binary arithmetic (`+`, `-`, `*`, `/`, `%`),
  bitwise (`&`, `^`, `|`), shift (`<<`, `>>`), comparison, logical, and
  function calls.
- Checked conversions and arithmetic lower to a shared `delta_panic`
  trap routine plus `static inline` helper functions, emitted into the TU
  preamble only when used (with `<stdio.h>`/`<stdlib.h>` pulled in then):
  - Numeric `T(x)` conversions: free conversions become a plain C cast;
    trapping ones call a range-checked helper that panics on out-of-range
    (narrowing/sign-flip), NaN or out-of-range float→int, or an invalid
    Unicode scalar for int→char.
  - Integer `/` and `%` route through a divisor-checked helper that panics
    on division by zero.
  - `<<` and `>>` route through a helper that panics when the shift count
    is negative or `>=` the operand's bit width.
  - Compound `+=`, `-=`, `*=` lower to `x = delta_rt_<op>_<type>(x, e, …)`,
    an overflow-checked helper built on clang's `__builtin_*_overflow`.
  - Postfix `i++` / `i--` lower to `delta_rt_postinc_<type>(&i, …)` /
    `delta_rt_postdec_<type>(&i, …)` helpers (also built on
    `__builtin_*_overflow`) that take the operand by pointer, trap on
    overflow at the type boundary, and return the pre-update value so the
    postfix value semantics hold even when the result is used. Driven by the
    analyzer's `IncDecs` map.
  - The build uses `-fwrapv` and no `-ffast-math`, so these checks (e.g.
    the `v != v` NaN test) are not optimized away.
- Precedence-aware re-parenthesization for infix binary expressions: parens
  are re-emitted around an operand only when the natural C reading would
  re-group differently than the AST demands. (Helper-lowered operators —
  division, shift, compound assignment — emit as self-delimiting calls and
  need no parens.)
- Comments in Delta source are dropped from the emitted C.

Pending (planned in `docs/plans/c-codegen-v0.md`):

- Structured codegen diagnostics in the `ErrorBag`. Today the `*ErrorBag`
  return value is plumbed through `codegen.Emit` but unused — errors
  from `cType` and `buildSignature` go to `println` instead.
- "Fail-closed" guards on out-of-scope constructs (multi-return
  signatures, error-typed signatures, `string` types in user positions).
  Today these would silently produce broken C if reached.
- Entry-point validation (no `main`, `main` with params, `main` with
  non-`int32` return) at the codegen boundary.
- `#line N "src.delta"` directives at statement boundaries
  (plan §Source mapping; deliberately last in the implementation order).
- Negative test fixtures (`expect: "build_fail"`) once the diagnostics
  land.

See the "Notes" subsection under "Phase 7: Generate C For The Current
Subset" further down for additional design notes.

## Deviations From The Phase B Plan

The control-flow surface described above is implemented and exercised by the
`test-source/tests/controlflow/` suite, but the implementation took several
shortcuts relative to `docs/plans/goal-v0.5/phase-b-control-flow.md`. These
are tracked here so the gaps are not mistaken for finished work:

- **No CFG / dataflow framework.** The plan's central deliverable — a
  per-function control-flow graph in `internal/semantics/cfg.go` plus a
  reusable forward-dataflow framework in `dataflow.go` — was not built.
  Definite-assignment is a per-`Scope` assignment list with an `if`/`else`
  intersection join, and return-coverage is the structural
  `blockReturns`/`statementReturns` AST walk. Phase C and Phase F were
  meant to layer on this CFG; that infrastructure still has to be written.
- **`break`/`continue` are not transparent to `switch`** (plan Decisions 7
  and 8). Codegen lowers a Delta `switch` to a native C `switch` and a Delta
  `break` to a literal C `break;`. A `break` inside a `switch` nested in a
  loop therefore exits the *switch*, not the loop, contrary to the plan's
  "transparent switch" rule (which called for a `goto __delta_loop_exit_N;`
  rewrite). `continue` happens to behave correctly because C's `continue`
  is not captured by `switch`.
- **`for`-`init` only accepts a declaration.** The parser's `init` slot is a
  `let`/`const` declaration or empty; an expression-statement init
  (`for (i = 0; …)`) is not parsed. The plan allowed both.
- **`for`-`init` bindings are not loop-scoped.** The induction variable is
  declared in the enclosing block scope rather than a dedicated loop scope,
  so it stays visible after the loop (plan Decision 1 / §3.4 wanted it
  released at loop exit).
- **`switch` `default`-required is enforced in the parser**, not the analyzer
  (the plan wanted a no-`default` switch to parse so the analyzer could emit
  a position-rich diagnostic).
- **`break`/`continue` "outside a loop" is a parser check** (a loop-depth
  counter), not an analyzer/CFG check.
- **`panic` / `process.exit` / `unreachable` not exposed.** The Phase B
  stretch goal is unimplemented; there is no divergence edge, so
  return-coverage cannot yet accept paths that end in a `panic`.
- **Phase 7 codegen hygiene still pending.** `codegen.Emit` does not yet
  thread `*diagnostics.ErrorBag` (errors still go to `println`), and there
  are no fail-closed guards for multi-return / error-typed signatures or
  `string`/`char` in user positions. The plan slated this work for Phase B;
  it remains open (see "Codegen Status → Pending").

## Editor Integration

`delta` now ships a Language Server subcommand and a bundled VS Code
extension that surface live diagnostics in the editor.

Implemented:

- `delta lsp` subcommand: a single-threaded JSON-RPC over stdio server that
  speaks the LSP subset needed for diagnostics-only operation.
  - Handles `initialize`, `initialized`, `shutdown`, `exit`,
    `textDocument/didOpen`, `textDocument/didChange`, `textDocument/didClose`.
  - Advertises `textDocumentSync: { openClose: true, change: 1 }` (full
    document sync).
  - On each open/change, runs `pipeline.Compile` over the document text and
    publishes `textDocument/publishDiagnostics`. On close, clears them.
  - Unknown requests respond with `MethodNotFound`; unknown notifications are
    ignored. Pipeline panics are caught so a malformed buffer cannot crash the
    server.
- `internal/lsp/diagnostics.go` adapts `SourceError` to LSP `Diagnostic`:
  1-based positions become 0-based, severities map to LSP 1/2, `source` is
  `"delta"`, optional `Expected`/`Help` are appended to the message body.
- VS Code extension at `editors/vscode/`:
  - TextMate grammar covering keywords, literals, comments, strings, type
    annotations, and function-name highlights.
  - `language-configuration.json` for comment toggling and bracket
    autoclosing.
  - `src/extension.ts` spawns `delta lsp` over stdio via
    `vscode-languageclient` and surfaces server stderr in a "Delta Language
    Server" output channel.
  - Settings: `delta.server.path` (absolute path override; empty means PATH)
    and `delta.trace.server` (LSP trace level).

The analyzer now exposes the two pieces the LSP needs for position-based
queries: `Analyzer.Refs` (use-site `Position` → resolved `Symbol`) and
`Analyzer.RootScope` (a `ScopeNode` tree with source ranges and
`FindDeepest(pos)`). Each `Symbol` carries a `Display` string for hover.
This is enough machinery to land hover and go-to-definition next, but
those LSP endpoints are not wired up yet.

Not implemented yet (LSP):

- Hover, go-to-definition, document symbols, completion, signature help,
  rename, code actions, formatting — the analyzer outputs are ready;
  wiring through `internal/lsp` remains.
- Incremental document sync.
- Multi-file analysis / project graph.
- Cancellation, progress reporting, persistent caches.
- A bundled or auto-downloaded server binary (the extension relies on a
  user-built `delta` on PATH or in `delta.server.path`).

## Current Alignment With The Design

The current implementation is aligned with the design in these ways:

- The project is following the planned pipeline order by starting with lexing
  and parsing.
- The CLI has begun to enforce `.delta` as the source file extension.
- The parser supports mandatory semicolons for statements.
- Function declarations use the specified `function name(params): Type { ... }`
  shape.
- Top-level `const` is allowed.
- Top-level `let` is rejected.
- Local `const` and `let` are represented distinctly.
- Braced `if`, `else`, and `while` blocks are supported.
- String and character literals are tokenized, parsed into AST nodes, and shown
  by the AST formatter.
- Function signatures can represent multiple return types and declared error
  types in the untyped AST.
- Expression parsing now preserves the intended precedence between arithmetic,
  comparison, logical AND, and logical OR expressions.
- Tokenizer and parser diagnostics are structured and include source locations
  in CLI output.
- `int32` and other type names can already appear as identifier-shaped type
  references, which keeps the parser independent from semantic validation.

The current implementation enforces a first slice of semantic rules: it knows
whether a name exists, whether a `const` (file, local, or parameter) is being
reassigned, whether a same-scope identifier was already declared, whether a
call target is callable with the right number and types of arguments, whether
operator operand types are compatible, whether an `if`/`while`/`for` condition
or a `switch` scrutinee has a legal type, whether an assignment's value type
matches its target, and whether a `return` statement matches the enclosing
function's declared return-type list. As of Phase B it also rejects reading a
`let` before it is definitely assigned, a non-`void` function that may fall off
its end without returning, and a binding that shadows a visible outer-scope
name (§3.4). These last three are AST-walk heuristics rather than a CFG-based
dataflow, with the limitations noted under "Semantic Analysis Status" and
"Deviations From The Phase B Plan".

## Pending Work By Design Area

### Pipeline

Pending:

- A materialized typed AST distinct from the parser's untyped one.
- Ownership and lifetime analysis.
- Checked error-state analysis.
- Structured codegen diagnostics in the `ErrorBag` and fail-closed
  guards for out-of-scope constructs (see "Codegen Status").
- `#line` directives in the generated C for source mapping.
- Multi-file translation units, name mangling, and bundled clang.
- Incremental compilation, `.delta-meta`, and parallel codegen.
- Release/debug modes, LTO, sanitizers, and determinism flags.

Done:

- Single-TU C code generation for the v0 surface (see "Codegen Status").
- Single-call clang compile + link to `build/<basename>`.
- Build directory layout (`build/c/<basename>.c` then `build/<basename>`).
- Host clang lookup with a structured "not found on PATH" error.

### Syntax

Pending:

- Template string literals.
- Raw string literals.
- Type declarations.
- Classes.
- Interfaces and traits.
- Enums and tagged unions.
- Imports and exports.
- External C declarations.
- Decorators.
- Arrays, slices, and object literals.

### Semantics

Implemented (v0):

- Symbol tables for file, function, and block scopes.
- A parallel `ScopeNode` tree carrying source ranges for cursor-based
  scope lookup.
- Name resolution across the scope chain with a `Refs` map for
  use-site → symbol queries.
- Same-scope duplicate declaration detection.
- `const` reassignment rejection (file consts, locals, and parameters).
- `let` mutation allowed; assignments validated against symbol kind and
  binding type.
- Function callee must resolve to a `SymbolFunction`.
- Full primitive type system (signed/unsigned `int8`…`int64`/`intsize` and
  `uint8`…`uint64`/`uintsize`, `float32`/`float64`, `bool`, `string`,
  `char`, `void`) with `TypeInvalid` cascade suppression.
- Literal type assignment (`int32` for integers, `float64` for floats,
  `bool`, `string`, `char`) with literal-to-annotation coercion.
- Operator type rules for unary `!`/`-`/`~`, arithmetic (incl. `%`),
  bitwise, shift, comparison (incl. `char`), equality, and logical
  operators.
- Numeric `T(x)` conversion classification (free vs. trapping) for
  int↔int, float→int, int→float, float→float, and int→char.
- Function call arity and per-argument type checks against recorded
  `FunctionSignature`s.
- Return arity and per-value type validation against declared return-type
  lists (including the `void` cases).
- `if`/`while` condition required to be `bool`.
- Assignment target/value type compatibility.
- Function-signature parameter and return type names validated against
  the primitive set before body analysis.
- Per-symbol `Display` strings ready for LSP hover.
- Control flow (Phase B): `for`, `switch`/`case`/`default`, `break`/
  `continue`, and postfix `++`/`--` typing; AST-walk definite-assignment,
  return-coverage, and cross-scope shadowing rejection.

Pending:

- A real control-flow graph + reusable dataflow framework to replace the
  AST-walk flow heuristics (needed before Phase C/F layer on).
- A divergence concept (`panic`/`process.exit`/`unreachable`) feeding
  return-coverage.
- Scoping `for`-`init` bindings to the loop (today they leak into the
  enclosing scope).
- One-level bidirectional type inference (annotation-driven typing of
  initializers).
- Validation of declared function error types and any fallible-call
  semantics.
- Support for function-typed values as callees.
- Equality/ordering rules for `string`.
- A materialized typed AST distinct from the parser's untyped one.

### Safety Model

Pending:

- Ownership and move checking.
- `borrowed` and `mod borrowed`.
- `heap T`.
- `move` and `clone`.
- Disposal analysis.
- Borrow aliasing rules.
- Memory safety validation.

### Error Model

Pending:

- Full fallible function signature semantics.
- Semantic validation for parsed function error signatures.
- `as result`.
- `check` blocks.
- `return error as`.
- Error type shape validation.
- Explicit error ignoring.
- Checked error-state analysis.

## Recommended Implementation Plan

### Phase 1: Stabilize The Parser

Status: mostly complete for the current expression and statement subset.

Goal: keep the untyped AST reliable enough to support semantic analysis.

Tasks:

1. Done: fix empty function parameter lists.
2. Done: fix identifier-started statement parsing with lookahead.
3. Done: replace same-precedence recursive binary parsing with loops.
4. Done: split logical OR and logical AND into separate precedence levels.
5. Done: change function call callees from `Identifier` to `Expression`.
6. Pending: keep parser tests for:
   - empty and non-empty parameter lists
   - expression statements beginning with identifiers
   - assignment statements
   - binary associativity
   - logical precedence
   - nested calls and parenthesized calls
7. Pending: continue adding parser tests as new syntax is introduced.
8. Done: parse and format multiple return types and declared error types in
   function signatures.
9. Pending: parse multi-expression return statements, probably by changing
   `ReturnStatement.Value Expression` to `ReturnStatement.Values []Expression`.

### Phase 2: Finish The MVP Token Surface

Goal: parse common source files without requiring every advanced language
feature.

Tasks:

1. Done: add comments.
2. Done: add plain string literals.
3. Done: add character literals.
4. Done: add floating-point literals (and hex/binary/octal integer literals
   with `_` separators).
5. Done: primitive type names are handled as identifiers in type positions and
   resolved by the analyzer against the full primitive set.
6. Partially done: illegal-character and parser EOF errors now use structured
   diagnostics.
7. Pending: decide when to implement template and raw string forms.

### Phase 3: Add Structured Diagnostics

Status: mostly complete for tokenizer and parser errors.

Goal: make errors useful before the compiler grows more passes.

Tasks:

1. Done: introduce a diagnostics package.
2. Done: record diagnostics with file, line, column, stage, severity, and
   message from tokenizer and parser.
3. Done: print source lines and caret locations in CLI diagnostics.
4. Pending: populate expected token information and help text consistently.
5. Pending: add focused tests for formatted tokenizer and parser diagnostics.

### Phase 4: Add Semantic Analysis V0

Status: complete for the current subset.

Goal: turn the untyped AST into a checked AST for the current subset.

Tasks:

1. Done: build symbol tables for file scope, function scope, and block scopes.
2. Done: resolve identifiers across the scope chain.
3. Done: reject duplicate declarations in the same scope.
4. Done: reject unresolved names.
5. Done: record function signatures (parameter types, return types, error
   types) on `SymbolFunction` via `buildSignature`.
6. Done: track local variables (`SymbolLocalConst`, `SymbolLocalLet`) and
   parameters.
7. Done: validate assignment targets.
8. Done: reject assignment to local `const`, file `const`, parameters, and
   function names.
9. Done: validate that function calls refer to callable declarations.
10. Done: record function return type lists and error type lists in
    function symbols.

### Phase 5: Add Type Checking V0

Status: mostly complete for the current expression and statement subset.
Error-type validation and annotation-driven inference remain open.

Goal: support a typed language over the full primitive set (the signed and
unsigned integer widths, `float32`/`float64`, `bool`, `string`, `char`,
`void`), checked numeric conversions, and multi-return function signatures.

Tasks:

1. Done: represent primitive types (`Type` / `TypeKind` with `TypeInvalid`).
2. Done: type integer literals as `int32` by default.
3. Done: type boolean literals as `bool`.
4. Done: validate unary operators (`!`, `-`).
5. Done: validate binary operators (arithmetic, comparison, equality, logical).
6. Done: validate function call arguments and return types.
7. Done: validate variable declaration initializers (the binding adopts the
   initializer's type today).
8. Done: validate assignment values.
9. Done: validate return statements against function return type lists.
10. Done: reject return arity mismatches.
11. Pending: bidirectional inference — let the declared annotation drive
    initializer typing rather than the other way around.
12. Pending: validate declared error types in function signatures and tie
    them into a fallible-call story.

### Phase 6: Add Definite Assignment And Control Flow Checks

Status: mostly complete (delivered as part of the goal-v0.5 **Phase B**
work), with the caveat that the checks are AST-walk heuristics rather than a
CFG-based dataflow.

Goal: enforce the basic safety rules from Sections 3 and 11.

Tasks:

1. Done: support `let name: Type;` without initializer.
2. Done: track definitely assigned bindings across blocks (per-scope
   assignment list + `if`/`else` intersection join).
3. Done: reject reads before assignment.
4. Pending: reject partial initialization once object/member syntax exists.
5. Done: validate return coverage for non-void functions (structural
   `blockReturns` walk; does not yet account for divergence/`panic` or
   loop-execution uncertainty).

### Phase 7: Generate C For The Current Subset

Goal: produce a runnable program for the current small language.

Status: **substantially done.** Tasks 2–8 are implemented for the
in-scope v0 surface and verified by 17 golden-file fixtures under
`test-source/tests/codegen/`. Task 1 was resolved by walking the
analyzed AST directly (no separate typed IR materialized — types are
re-resolved on demand). See "Codegen Status" earlier in this document
for the exact surface coverage and the remaining structured-diagnostics
work.

Tasks:

1. ~~Define a small typed IR or use the typed AST directly.~~ — using
   the analyzed AST directly.
2. ~~Emit C for functions.~~
3. ~~Emit C for local variables.~~ (`let` and local `const`)
4. ~~Emit C for expressions.~~ (literals, identifiers, unary, binary,
   calls; with precedence-aware re-parenthesization)
5. ~~Emit C for `if`, `while`, `return`, and assignment.~~ Plus
   call-as-statement.
6. ~~Map `int32` and `bool` to C types.~~ (also `void`, `char`)
7. ~~Generate a `main` entry point convention.~~ (user `main` → C
   `delta_main`; `int main()` wrapper calls `(int)delta_main()`)
8. ~~Write generated files under a build directory.~~
   (`build/c/<basename>.c`)

Remaining within Phase 7:

- Populate `*diagnostics.ErrorBag` from the emitter (today errors go to
  `println`).
- Fail-closed guards for unsupported constructs (multi-return signatures,
  error-typed signatures, `string`/`char` in user positions).
- Entry-point validation (no `main`, params, wrong return type) at the
  codegen boundary.
- `#line N "src.delta"` directives at statement boundaries.

Notes:

- Empty parameter lists: in C, `f()` in a declaration means "unspecified
  parameters" (K&R style), while `f(void)` means "definitively no
  parameters." Clang accepts both, but if the codegen ever needs
  prototype-checked calls across TUs the `(void)` form is the stricter one.
  Fine for v0 — just keep it in mind.

### Phase 8: Invoke Clang

Goal: complete a minimal end-to-end `delta build`.

Status: **done for v0.** `delta build` now drives the full pipeline
through to a runnable binary on a machine with clang on PATH.

Tasks:

1. ~~Locate a C compiler.~~ — `internal/toolchain.FindClang` uses
   `exec.LookPath("clang")` and returns a structured
   `ErrClangMissing` if not found.
2. ~~Compile generated C to an object file.~~ — single clang call with
   `-std=c11 -Wall -Werror=implicit-function-declaration -fwrapv`.
3. ~~Link the final executable.~~ — same call also links to
   `build/<basename>`.
4. ~~Report compile and link errors clearly.~~ — non-zero clang exit on
   valid-Delta input is treated as an ICE and clang stderr is piped to
   the user with a "this is a codegen bug, please report" header.
5. ~~Keep generated C inspectable for debugging.~~ — `build/c/<basename>.c`
   is preserved on failure.

Pending (out of scope for v0, tracked under "Pending Work By Design
Area"):

- Bundled clang and `DELTA_CC` env var.
- Multi-file translation units and name mangling.
- Separate debug / release modes.

### Phase 9: Expand Toward The Full Design

After the basic compiler can build small programs, expand in this order:

1. Imports and module graph.
2. File-scope exports.
3. Type declarations and object literals.
4. Arrays and strings.
5. Error handling with `as result` and `check`.
6. Ownership and move semantics.
7. Borrows.
8. Classes and disposal.
9. Generics.
10. Incremental compilation.

## Near-Term Milestone

The previous milestone was:

> Parse and type-check a single-file program with functions, parameters,
> `const`, `let`, assignment, `if`, `while`, function calls, multiple return
> types, declared error types, `int32`, `bool`, and `void`, then generate C and
> compile it.

That milestone is reached, and the work has since been extended into the
**Phase A (primitive types)** slice of the `docs/plans/goal-v0.5/` plan:
the full signed/unsigned integer set, `float32`/`float64`, and `char`
flow end-to-end through tokenize → parse → type-check → C → clang, with
checked numeric conversions and arithmetic lowered to trapping runtime
helpers. This is verified by the 23-case `test-source/tests/primitives/`
suite (`pass`/`fail`/`trap`), which all passes.

The **Phase B (control flow)** slice has since largely landed: C-style
`for`, value `switch`/`case`/`default`, `break`/`continue`, postfix
`++`/`--`, the initializer-less `let name: T;`, and AST-walk
definite-assignment, return-coverage, and cross-scope shadowing checks now
flow end-to-end through tokenize → parse → analyze → C → clang, with a
61-case `test-source/tests/controlflow/` suite. What remains open within
Phase B is summarized in "Deviations From The Phase B Plan" above; the
largest items are the real CFG + dataflow framework (the current flow checks
are heuristics), the transparent-`switch` `break`/`continue` rewrite, the
`panic`/divergence stretch goal, and `for`-`init` loop scoping.

Cross-cutting codegen hardening also remains open and can land alongside
the phase work: populate `*ErrorBag` from `codegen.Emit` (today emitter
errors go to `println`), add fail-closed guards and entry-point
validation at the codegen boundary, and add a negative
`expect: "build_fail"` test verb. After that, the next milestone is
**Phase C (the error model)** — `check` blocks, `as result`, and
fallible-flow analysis — followed by the larger sections of the design
(ownership and lifetimes, modules), incorporated one pass at a time
following phases C–J without restarting the compiler.
