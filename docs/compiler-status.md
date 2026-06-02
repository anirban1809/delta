# Delta Compiler Status

Date: 2026-06-02

This document describes the current implementation status of the Delta compiler
against the design in `docs/main-spec.md` and `docs/spec-sections/`. It is a
working checkpoint for the initial Go compiler, not a replacement for the
language specification.

## Current Implementation

The compiler currently has a small front end that can read a single `.delta`
source file, tokenize it, parse it into an untyped AST, run name resolution
and a first pass of type checking, and print the AST when analysis is clean.
Tokenizer, parser, and semantic failures are reported through a shared
diagnostic bag and printed with file, line, column, source line, and caret
location. The parser now performs error recovery so multiple syntax errors
can be reported in a single pass. The same pipeline is also exposed as a
Language Server (`delta lsp`) consumed by the bundled VS Code extension,
which uses the analyzer's scope tree and resolved-reference map to drive
editor features.

Implemented command path:

1. `cmd/delta/main.go` accepts `delta build <file.delta>`, `delta test`, and
   `delta lsp`.
2. The CLI checks that the input file has a `.delta` extension.
3. `internal/pipeline.Compile(name, contents)` runs tokenize → parse →
   semantic analyze in memory, returning the AST and the diagnostic bag. Both
   the CLI and the LSP server share this entry point.
4. If any stage reports diagnostics, downstream stages are skipped and the
   CLI prints them.
5. The AST formatter prints the parsed tree when no diagnostics are present.

This means the project currently covers the first three stages of the planned
pipeline from Section 2, with a partial type-checking pass layered on:

1. lex
2. parse
3. semantic analysis: name resolution, scope rules, and v0 type checking
   (operator typing, call arity and argument types, return arity and types,
   assignment compatibility, condition typing). Definite assignment, return
   coverage, and cross-scope shadowing are still pending.

The remaining planned stages are not implemented yet:

1. typed AST (the current analyzer computes types but does not yet emit a
   separate typed AST node tree)
2. ownership and lifetime analysis
3. checked error-state analysis
4. C code generation
5. Clang compile
6. Clang link

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
- Integer literals.
- Boolean literals: `true`, `false`.
- String literals using plain double quotes.
- Character literals using single quotes.
- Keywords: `function`, `return`, `const`, `let`, `if`, `else`, `while`.
- Delimiters: `(`, `)`, `{`, `}`, `:`, `;`, `,`.
- Arithmetic operators: `+`, `-`, `*`, `/`.
- Comparison operators: `<`, `<=`, `>`, `>=`, `==`, `!=`.
- Assignment operator: `=`.
- Logical operators: `!`, `&&`, `||`.
- Error type separator: `|`.
- Line comments (`//`) and block comments (`/* ... */`). Comments are
  preserved in the AST at file and block scope and skipped by the parser
  when looking for grammar productions.

Not implemented yet:

- Floating-point literals.
- Numeric literal prefixes and separators.
- Template string literals.
- Raw string literals.
- Import/export/decorator/extern tokens.
- Type declaration, class, enum, interface, borrow, move, clone, heap, and error
  handling tokens.
- Compound assignment operators such as `+=`.

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
- Assignment statements.
- Expression statements.
- `if` / `else` statements.
- `while` statements.

Aligned with the design:

- Statements require semicolons where applicable.
- Control-flow bodies require braces.
- `const` and `let` are distinct in the AST through the `Mutable` flag on local
  variable declarations.

Not implemented yet:

- `for` loops.
- `for...of` loops.
- `switch`.
- `check` blocks.
- `panic`, `process.exit`, and `unreachable` intrinsics.
- Multi-return destructuring.
- Definite-assignment analysis.
- Shadowing across nested scopes (currently only same-scope duplicates are
  rejected; nested shadowing per §3.4 is not yet enforced).
- Enforcement that `const` always has an initializer and `let` without an
  initializer must have a type. The current parser only supports initialized
  variable declarations.

Aligned with the design:

- `ReturnStatement.Values []Expression` stores multiple return
  expressions, so the parser accepts multi-expression `return`, and the
  semantic analyzer validates both arity and per-value types against the
  enclosing function's declared return-type list.

### Expressions

Implemented:

- Integer literals.
- Boolean literals.
- String literals.
- Character literals.
- Identifiers.
- Parenthesized expressions.
- Unary expressions: `!expr`, `-expr`.
- Binary expressions:
  - multiplicative: `*`, `/`
  - additive: `+`, `-`
  - comparison and equality: `<`, `<=`, `>`, `>=`, `==`, `!=`
  - logical: `&&`, `||`
- Function call expressions:

  ```delta
  go(3, 4)
  ```
- Chained function call expressions where the callee is itself an expression:

  ```delta
  makeAdder()(3)
  ```

Not implemented yet:

- Floating-point literals.
- Cast expressions such as `int32(x)`.
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
- `VariableDeclarationStatement`
- `ExpressionStatement`
- `AssignmentStatement`
- `IfStatement`
- `WhileStatement`
- `IntegerLiteral`
- `BooleanLiteral`
- `StringLiteral`
- `CharacterLiteral`
- `Identifier`
- `UnaryExpression`
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
- Same-scope duplicate-identifier rejection for functions, file consts,
  parameters, and locals.
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
- `if`, `else`, and `while` bodies recurse into nested scopes; condition
  expressions are analyzed against the enclosing scope.
- A `Refs` map records every resolved identifier use-site (keyed by
  `ast.Position`) so the LSP can answer go-to-definition and hover for
  identifier references without re-walking the tree.

Implemented (v0 type checking):

- A small primitive type system: `TypeInt32`, `TypeBool`, `TypeString`,
  `TypeChar`, `TypeVoid`, plus the sentinels `TypeEmpty` (no annotation)
  and `TypeInvalid` (poison value used to suppress cascading errors).
- `TypeOf` computes types for integer/boolean/string/character literals,
  identifier references, unary expressions, binary expressions, and
  function-call expressions. Unknown identifiers and unresolved callees
  return `TypeInvalid` so downstream checks stay quiet.
- Unary operator typing: `!` requires `bool`; `-` requires `int32`.
- Binary operator typing:
  - `+`, `-`, `*`, `/` require `int32` operands and yield `int32`.
  - `<`, `<=`, `>`, `>=` require `int32` operands and yield `bool`.
  - `==`, `!=` require matching operand types and only accept `int32` or
    `bool` operands today; yield `bool`.
  - `&&`, `||` require `bool` operands and yield `bool`.
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

Not implemented yet (semantics):

- Definite-assignment analysis.
- Return-coverage analysis (every non-void path must end in a `return`).
- Cross-scope shadowing rejection (§3.4 — both inner-scope and same-scope
  shadowing should be rejected; only same-scope duplicates are caught today).
- Validation of declared error types on function signatures (the parser
  surfaces them; the analyzer currently treats them as unresolved primitives
  unless they happen to match a known type).
- Tracking and validating callable expressions (function values, member
  callees, returned functions).
- Equality on `string` / `char`; ordering on non-`int32` types.
- Floating-point typing.
- Bidirectional inference (annotations are currently informational; the
  initializer's inferred type is what the binding actually gets when a
  non-empty annotation is supplied — this is a known gap and needs a real
  "annotation drives inference" pass).
- A separate, persisted typed-AST node tree. Types are computed on demand by
  `TypeOf` rather than materialized into AST nodes.

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
operator operand types are compatible, whether an `if`/`while` condition is
`bool`, whether an assignment's value type matches its target, and whether a
`return` statement matches the enclosing function's declared return-type list.
It does not yet know whether a variable is definitely assigned before use, or
whether a function returns on every required path. Cross-scope shadowing
(§3.4) is also not yet rejected.

## Pending Work By Design Area

### Pipeline

Pending:

- A materialized typed AST distinct from the parser's untyped one.
- Ownership and lifetime analysis.
- Checked error-state analysis.
- C code generation.
- Clang compile and link.
- Build directories and generated artifacts.
- Incremental compilation.

### Syntax

Pending:

- Comments.
- Floating-point literals.
- More complete numeric literal support.
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
- Primitive type system (`int32`, `bool`, `string`, `char`, `void`) with
  `TypeInvalid` cascade suppression.
- Literal type assignment (`int32` for integers, `bool` for booleans,
  `string`, `char`).
- Operator type rules for unary `!`/`-`, arithmetic, comparison,
  equality, and logical operators.
- Function call arity and per-argument type checks against recorded
  `FunctionSignature`s.
- Return arity and per-value type validation against declared return-type
  lists (including the `void` cases).
- `if`/`while` condition required to be `bool`.
- Assignment target/value type compatibility.
- Function-signature parameter and return type names validated against
  the primitive set before body analysis.
- Per-symbol `Display` strings ready for LSP hover.

Pending:

- Cross-scope shadowing rejection (§3.4).
- Definite-assignment analysis.
- Return-coverage analysis on non-void functions.
- One-level bidirectional type inference (annotation-driven typing of
  initializers).
- Float typing and a wider primitive set.
- Validation of declared function error types and any fallible-call
  semantics.
- Support for function-typed values as callees.
- Equality/ordering rules for non-numeric types.
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

1. Add comments.
2. Done: add plain string literals.
3. Done: add character literals.
4. Add floating-point literals if needed for the next examples.
5. Add missing primitive type names as ordinary identifiers or as dedicated type
   tokens, then choose one consistent approach.
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

Goal: support a small typed language with `int32`, `bool`, `string`, `char`,
`void`, and multi-return function signatures.

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

Goal: enforce the basic safety rules from Sections 3 and 11.

Tasks:

1. Support `let name: Type;` without initializer.
2. Track definitely assigned bindings across blocks.
3. Reject reads before assignment.
4. Reject partial initialization once object/member syntax exists.
5. Validate return coverage for non-void functions.

### Phase 7: Generate C For The Current Subset

Goal: produce a runnable program for the current small language.

Tasks:

1. Define a small typed IR or use the typed AST directly.
2. Emit C for functions.
3. Emit C for local variables.
4. Emit C for expressions.
5. Emit C for `if`, `while`, `return`, and assignment.
6. Map `int32` and `bool` to C types.
7. Generate a `main` entry point convention.
8. Write generated files under a build directory.

### Phase 8: Invoke Clang

Goal: complete a minimal end-to-end `delta build`.

Tasks:

1. Locate a C compiler.
2. Compile generated C to an object file.
3. Link the final executable.
4. Report compile and link errors clearly.
5. Keep generated C inspectable for debugging.

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

The best next milestone is:

> Parse and type-check a single-file program with functions, parameters,
> `const`, `let`, assignment, `if`, `while`, function calls, multiple return
> types, declared error types, `int32`, `bool`, and `void`, then generate C and
> compile it.

That milestone is small enough to finish without resolving the entire language,
but it exercises the compiler architecture in the same order as the full design:

1. tokenize
2. parse
3. resolve names
4. type-check
5. generate C
6. compile with Clang

Once that works, the larger sections of the design can be incorporated one pass
at a time without restarting the compiler.
