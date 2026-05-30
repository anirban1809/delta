# Delta Compiler Status

Date: 2026-05-31

This document describes the current implementation status of the Delta compiler
against the design in `docs/main-spec.md` and `docs/spec-sections/`. It is a
working checkpoint for the initial Go compiler, not a replacement for the
language specification.

## Current Implementation

The compiler currently has a small front end that can read a single `.delta`
source file, tokenize it, parse it into an untyped AST, and print that AST in a
formatted tree form. Tokenizer and parser failures are reported through a shared
diagnostic bag and printed with file, line, column, source line, and caret
location.

Implemented command path:

1. `cmd/delta/main.go` accepts `delta build <file.delta>`.
2. The CLI checks that the input file has a `.delta` extension.
3. The tokenizer converts source text into tokens.
4. The parser builds an untyped AST.
5. If tokenization or parsing reports diagnostics, the CLI prints them and stops
   before the next stage.
6. The AST formatter prints the parsed tree when no diagnostics are present.

This means the project currently covers the first two stages of the planned
pipeline from Section 2:

1. lex
2. parse

The remaining planned stages are not implemented yet:

1. typed AST and semantic analysis
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

Not implemented yet:

- Floating-point literals.
- Numeric literal prefixes and separators.
- Comments.
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
- Multi-expression `return` statements for functions that declare multiple
  return values.
- Multi-return destructuring.
- Definite-assignment analysis.
- Scope validation and same-scope shadowing checks.
- Enforcement that `const` always has an initializer and `let` without an
  initializer must have a type. The current parser only supports initialized
  variable declarations.

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
  - currently stores one `Value Expression`
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
- Add span support for multi-character highlights.
- Add parser recovery later if the compiler should report multiple syntax errors
  in one parse pass.

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

The current implementation intentionally does not yet enforce most semantic
rules. For example, it does not know whether `x + y` is type-correct, whether a
name exists, whether a variable is definitely assigned, whether a `const` is
being reassigned, or whether a function returns on every required path.

## Pending Work By Design Area

### Pipeline

Pending:

- Semantic analysis.
- Typed AST.
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

Pending:

- Symbol tables.
- Scope creation and name resolution.
- Duplicate declaration detection.
- Same-scope shadowing rejection.
- Type checking.
- One-level bidirectional type inference.
- Literal defaulting.
- Return type validation.
- Function call arity and argument checks.
- Operator type rules.
- Definite-assignment analysis.
- `const` reassignment rejection.
- `let` mutation rules.

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

Goal: turn the untyped AST into a checked AST for the current subset.

Tasks:

1. Build symbol tables for file scope and block scopes.
2. Resolve identifiers.
3. Reject duplicate declarations in the same scope.
4. Reject unresolved names.
5. Track function signatures.
6. Track local variables.
7. Validate assignment targets.
8. Reject assignment to local `const`.
9. Validate that function calls refer to callable declarations.
10. Record function return type lists and error type lists in function symbols.

### Phase 5: Add Type Checking V0

Goal: support a small typed language with `int32`, `bool`, `void`, and
multi-return function signatures.

Tasks:

1. Represent primitive types.
2. Type integer literals as `int32` by default.
3. Type boolean literals as `bool`.
4. Validate unary operators.
5. Validate binary operators.
6. Validate function call arguments and return types.
7. Validate variable declaration initializers.
8. Validate assignment values.
9. Validate return statements against function return type lists.
10. Reject return arity mismatches.

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
