# Delta Compiler Status

Date: 2026-06-25

This document describes the current implementation status of the Delta compiler
against the design in `docs/main-spec.md` and `docs/spec-sections/`. It is a
working checkpoint for the initial Go compiler, not a replacement for the
language specification.

## Current Implementation

The compiler now compiles a **multi-file Delta project** end-to-end: it
discovers the module graph starting from an entry `.delta` file (following
`import`s, including the embedded `std/` standard-library root), parses and
analyzes each module once, runs full name resolution, type checking, and
ownership/move/borrow analysis, lowers each module to its own C translation
unit, and invokes clang once over all TUs to produce a runnable executable.
Tokenizer, parser, and analyzer failures are reported through a shared
diagnostic bag and printed with file, line, column, source line, and caret
location. The parser performs error recovery so multiple syntax errors can
be reported in a single pass. The same front-end pipeline is also exposed as
a Language Server (`delta lsp`) consumed by the bundled VS Code extension,
which uses the analyzer's scope tree and resolved-reference map to drive
editor features.

> **Analyzer rewrite.** The semantic pass that this document originally
> described under `internal/semantics/` has been rewritten into
> `internal/analyzer/` (the `Validator`/`Analyzer` types). `internal/semantics/`
> still exists on disk but is no longer imported by the pipeline, LSP, or CLI —
> treat `internal/analyzer/` as the live semantic layer. References to
> `internal/semantics/` below are historical.

Implemented command path:

1. `cmd/delta/main.go` accepts `delta build`, `delta run`, `delta init`,
   `delta dump-ast <file.delta>`, `delta test`, and `delta lsp`.
2. `delta build`/`delta run` resolve a project: either an explicit entry
   `.delta` file or a `delta.json` manifest (`internal/project.Resolve`),
   with a `--release` build mode and `--name`/`--no-src` flags on `init`.
   The CLI checks that an entry file has a `.delta` extension.
3. `internal/pipeline.Compile(name, contents)` runs tokenize → parse →
   analyze in memory for a single buffer (used by the LSP and `dump-ast`),
   returning the AST, the diagnostic bag, and the analyzer's `Refs` map.
   `internal/pipeline.BuildProject` drives the whole multi-module build:
   `buildModuleGraph` discovers and parses imports, detects import cycles,
   analyzes each module, and codegens one TU per module.
4. If any front-end stage reports diagnostics, downstream stages are
   skipped and the CLI prints them.
5. `delta build` lowers each module with `internal/codegen` to
   `build/c/<module-id>.c`, locates clang via `internal/toolchain.FindClang`,
   and invokes it once over all TUs with `-std=c11 -Wall
   -Werror=implicit-function-declaration -fwrapv` linking to
   `build/<binary>`. Exported symbols are name-mangled per module
   (`delta__<module>__<name>`) so TUs do not collide; the entry module's
   `main` becomes the program entry point. A non-zero clang exit on
   valid-Delta input is surfaced as an internal compiler error with the
   generated `.c` left in place for inspection.
6. `delta run` builds then executes the resulting binary; `delta dump-ast`
   runs the front end and prints the formatted AST on success.
7. `delta build` also accepts stage-stopping debug flags that print an
   earlier stage's output instead of building a binary: `--tokens` (token
   stream), `--ast` (parsed AST), and `--sema` (full front end, then the
   formatted AST). The earliest requested stage wins.

The project now covers stages 1–3, 5, and 6 of the planned pipeline from
Section 2, and a first real slice of stage 4 (ownership/move/borrow):

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
   This now also covers the Phase K user-defined **record types**: `type`
   declarations (record, alias, and spread/intersection composition),
   object literals pinned by their typed context (one-level bidirectional
   inference), member access and field assignment, whole-value
   definite-assignment, declaration-time cycle detection, and
   compiler-derived structural `==`/`!=` (see "Record Types (Phase K)").
   This now also covers the Phase C **recoverable error model**: fallible
   function signatures (`T | E1, E2`), the `expr as result` binding form
   over fallible calls and Phase A trap sites, `check result { ... }`
   error-handling blocks (every internal path must diverge),
   `return error as { ... }` propagation, pending-state tracking, and
   unbound-fallible rejection (see "Error Model (Phase C)").
4. C code generation (single-TU, with trapping runtime helpers for checked
   conversions and arithmetic, and tagged result-struct lowering for the
   error model; see "Codegen Status" below for the covered surface)
5. Clang invocation (single-call compile + link to `build/<basename>`)

A first slice of **checked error-state analysis** landed as part of
Phase C (fallible-call binding, pending-read rejection, check-block
divergence). Since then the **ownership / move / borrow** model (Phases F,
G, H) and the **multi-file module system** (Phase I) and **receiver
methods** (Phase L) have also landed (see "Ownership, Borrows, and Heap
(Phases F/G/H)", "Modules (Phase I)", and "Receiver Methods (Phase L)"
below). The remaining planned stages are not fully implemented yet:

1. typed AST (the current analyzer computes types on demand but does not
   emit a separate typed AST node tree)
2. a control-flow-graph-based dataflow framework (move/assignment flow is
   still tracked with AST-walk heuristics)
3. lifetime annotations / `viewing <source>` clauses for stored and
   returned borrows (borrow *checking* at call sites is implemented; the
   full returned-borrow lifetime story is not)
4. the `std/log` standard-library module (Phase J): the embedded-FS and
   import-resolution machinery exists, but `internal/stdlib/stdlib/` ships
   only a placeholder, not the `std/log` source + C shim

## Implemented Language Surface

### Source Files

Implemented (Phase I):

- Multi-file project compilation. `delta build`/`delta run` start from an
  entry `.delta` file (or a `delta.json` manifest) and discover the whole
  module graph transitively through `import`s.
- `.delta` file extension validation.
- One file = one module; the file path (relative to the project root)
  determines module identity and the mangling prefix.
- `import { Name, Other } from "./relative/path";` (resolved to
  `./relative/path.delta` relative to the importing file) and
  `import { Name } from "std/...";` (resolved against the embedded stdlib FS).
- `export` modifier on top-level declarations; importing a non-exported name
  is a diagnostic.
- Terminal `export module Name;` declarations that publish every eligible
  top-level declaration and imported binding from the file.
- Namespace imports in both `import Name from "path";` and
  `import Name as Local from "path";` forms, with qualified value/type lookup,
  nested namespace re-exports, and direct C symbol lowering.
- Project-root-relative import mappings declared by `delta.json`'s
  `dependencies` object. Exact dependencies and dependency subpaths are
  supported by project builds and the LSP; `@std` is reserved for the standard
  library and takes its dependency root from the `DELTA_STD_LIB` environment
  variable. Extensionless imports use the same `.delta`, then `.ffi.delta`,
  lookup for relative, configured-dependency, and standard-library paths.
- Import-cycle detection with a diagnostic naming the cycle path.
- `delta.json` manifest (`name`, `version`, `entry`, `dependencies`, `target`,
  per-mode `build.output`) with `delta init` scaffolding and a `--release`
  build mode.

Not implemented yet:

- The `std/log` standard-library module itself (Phase J) — only the
  embed/resolution mechanism exists; `internal/stdlib/stdlib/` is a
  placeholder.
- `import { Name as Local }` renaming form (out of scope for v0.5).
- Third-party package roots (unconfigured bare import paths are a diagnostic).

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
  `for`, `switch`, `case`, `default`, `break`, `continue`, `type`, and the
  Phase C error-model keywords `as`, `check`, and `error`. (`forward` is also
  reserved as a keyword in the tokenizer but is not yet recognized by the
  parser.) `result` is **not** a keyword — it is the user-chosen identifier
  that follows `as`.
- Delimiters: `(`, `)`, `{`, `}`, `:`, `;`, `,`, `.` (member access, a
  first-class punctuation token), and `...` (spread/ellipsis, lexed with
  longest-match lookahead so a future `..` range is not consumed early).
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

The keyword set now also includes the ownership / module keywords
`import`, `export`, `from`, `edit`, `move`, `clone`, `unique`, `heap`, and
`new` (Phases F/G/H/I/L). `&` doubles as bitwise-and and the borrow sigil.

Not implemented yet:

- Template string literals.
- Raw string literals.
- Decorator/extern tokens.
- Class, enum, and interface tokens.
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

- `type` declarations for user-defined record types, in all three RHS
  forms (Phase K):

  ```delta
  type Vec3   = { x: float64; y: float64; z: float64; }; // record
  type Position = Vec3;                                   // alias
  type Dog    = { ...Animal; goodBoy: bool; };            // spread composition
  type Cat    = Animal & { color: int32; };              // intersection composition
  ```

  The anonymous object-type literal `{ f: T; ... }` is accepted **only**
  on a `type` RHS (or as a spread/intersection operand within one);
  using it in a parameter, field, return, or binding position is a parser
  error (§8.3). Field defaults, methods, and per-field visibility inside a
  record body are rejected at the parser (§8.5 / §8.11).

Partially aligned with the design:

- Section 3 allows file-scope `const` and rejects file-scope `let`; this is
  already reflected in the parser.
- The parser currently treats primitive type names like `int32` as identifiers
  in type positions, which matches the current AST shape but is not a complete
  type system yet.
- Multiple return types are parsed, formatted, and validated (return arity and
  per-value types). As of Phase C, declared **error types** are also validated:
  each entry in the `T | E1, E2` error set must resolve to a user-declared
  record type (see "Error Model (Phase C)"), the set is normalized
  (deduplicated), and fallible control flow (`as result` / `check` /
  `return error as`) is checked end-to-end.

Implemented (Phases I and L):

- `export` modifier on top-level `function`, `const`, and `type`
  declarations (Phase I).
- `import { Name, Other } from "...";` declarations (Phase I).
- **Receiver methods** on records (Phase L): `function (t: &T) m(...)` (read
  receiver) and `function (t: edit &T) m(...)` (mutable receiver). The named
  receiver replaces `this`; call form is `value.m(args)` with auto-referencing
  of the receiver and capability dispatch (a `const` binding or `&T` cannot
  call an `edit`-receiver method). Methods travel with the type across
  modules; there is no by-value receiver. The `FunctionDeclaration` node
  carries an optional `Receiver *FunctionParameter`.
- The compiler-invoked `function (x: edit &T) dispose(): void` cleanup hook on
  explicitly `unique` records (Phase F); it cannot be called manually.

Not implemented yet:

- `class`, `interface`, and `enum` declarations (`type` records + receiver
  methods are the v0.5 substitute; tagged-union `type X = A | B;` is not done).
- `extern "c"` blocks.
- Decorators.
- Arrow-bound functions and lambdas.
- Nested function declarations.

### Statements

Implemented inside function and control-flow blocks:

- `return` statements.
- Local `const` and `let` variable declarations.
- Assignment statements, including compound `+=`, `-=`, `*=` (which lower to
  overflow-checked helper calls; see "Codegen Status"). The target may be an
  identifier or, since Phase K, a member-access L-value `v.field = expr;`
  (legal only when `v` is a mutable `let` binding that is already fully
  initialized).
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
  This includes record-typed bindings (`let v: Vec3;`), which are
  definite-assigned only by a **whole-value** assignment (`v = { ... };`);
  reading or writing any field before that is rejected (Phase K).
- The Phase C error-model statement forms:
  - `expr as result;` / `const x = expr as result;` / `let x = expr as result;`
    / `lvalue = expr as result;` — the fallible-binding form. The inner `expr`
    must be fallible (a call to a function with a non-empty error set, or a
    Phase A trap-set operation — checked arithmetic, division, shift, or a
    narrowing/sign-flip/float→int/int→char conversion). `result` is the
    user-chosen result name. The bound success value(s) become **pending**
    until a matching `check`. Applying `as result` to a provably-infallible
    expression is rejected ("this expression cannot fail").
  - `check result { ... }` — the error-handling block. It runs only on the
    error path, and every control-flow path inside it must end in a diverging
    terminator (`return`, `return error as`, `break`, or `continue`); a
    fall-through path is rejected. After the block, the pending bindings become
    valid for normal use. The result name must match a preceding `as result`.
  - `return error as { ... };` — the propagation form, producing a fallible
    value in the error state. The `{ ... }` is an object-literal initializer
    pinned by the enclosing function's declared error set (the error type is
    **not** named at the `return` site — it is inferred from the set), and is
    legal only inside a function that declares a non-empty error set.

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

- Member-access expressions `receiver.field` (Phase K), for reading a field
  of a record-typed expression. The legacy `Type.from(x)` conversion path is
  now a special case of the generic member-access node.

- Object-literal expressions `{ f: v, ... }` (Phase K). These carry shape but
  no name; the analyzer pins their record type from the surrounding typed
  context (binding annotation, call-site parameter type, or return type) and
  enforces exact field coverage (no missing / unknown / duplicate fields,
  order-insensitive). Value-level spread `{ ...base }` / `{ ...a, ...b }` is
  supported; the spread source must be the same record type as the target.
  An object literal with no typed context to pin against is a structured
  error.

- `move x` expressions (Phase F): whole-name transfer of a live owned
  binding; the source becomes moved-from and a later use is a compile error.
- `clone x` / `clone x as result` expressions (Phase F): explicit copy of a
  Cloneable value; fallible when used with `as result` (clone may abort on
  OOM). Unique values cannot be cloned.
- `new T { ... }` heap-allocation expressions (Phase H): allocate `T` on the
  heap, yielding a `owned<T>` single-owner value; typically written
  `new T { ... } as result` since allocation is fallible (`AllocError`).
- Borrow expressions / auto-borrowing (Phase G): `&x` and `edit &x`, plus
  contextual auto-borrowing where a bare addressable `T` argument satisfies a
  `&T` / `edit &T` parameter, with exclusivity checking for `edit &`.

Not implemented yet:

- Index expressions.
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
- `TypeDeclaration` (Phase K), with a `RHS` of one of:
  - `RecordRHS` (`Fields []RecordField`) — inline `{ f: T; ... }`
  - `AliasRHS` (`Target TypeReference`) — `type Y = X;`
  - `CompositionRHS` (`Operands`, `Style` = spread or intersection) — each
    operand is a named `TypeReference` or an inline `RecordRHS`
- `RecordField` (`Name`, `Type TypeReference`)
- `FunctionParameter`
- `TypeReference`
- `BlockStatement`
- `ReturnStatement`
  - stores `Values []Expression` (supports multi-expression returns)
  - carries an `Error bool` flag (set by `return error as { ... };`, in which
    case `Values` holds the pinned error object literal) — Phase C
- `FallibleStatement` (`Inner Statement`, `Result Identifier`) — the
  `... as result;` binding form, wrapping the inner declaration / assignment /
  expression statement — Phase C
- `CheckStatement` (`Result Identifier`, `Body *BlockStatement`) — the
  `check result { ... }` block — Phase C
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
- `MemberAccessExpression` (`Receiver`, `Member`) — Phase K
- `ObjectLiteralExpression` (`Elements []ObjectLiteralElement`), where each
  element is a `FieldInit` (`Name`, `Value`) or a `SpreadElement` (`Source`)
  — Phase K

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

Implemented (record types, Phase K):

- A new type kind `TypeCustom`, carrying a `*CustomRecord` (name, C name,
  and a resolved field list). Two record references are equal as types iff
  they point at the same `*CustomRecord` (nominal identity); aliases reuse
  the target's `*CustomRecord`, so an alias and its target interchange
  freely.
- Type-declaration registration runs in interleaved passes alongside the
  existing function/const passes: a declare pass registers each record name
  (so declarations may forward-reference one another), a resolve pass types
  record fields, follows alias chains, and merges composition operands, and
  a cycle pass rejects recursive records.
- Alias resolution (`type Y = X;`) is a structural alias to a single named
  type, including alias chains; alias cycles are caught by the cycle pass.
- Composition (`...` spread and `&` intersection) is uniform: all operands'
  field sets are collected, any field-name collision across operands is an
  error, non-record operands are rejected, and the result is a fresh nominal
  record. Direct self-reference and mutual cycles are rejected at
  declaration time with a diagnostic naming every type on the cycle and
  suggesting `owned<T>` to break it (`heap T` is not implemented until Phase
  H).
- One-level **bidirectional inference**: typing now threads an *expected*
  type into expression checks at the pinning sites (binding annotation,
  call-site argument, return value, and each field value of a pinned object
  literal). This is what lets a shape-only object literal acquire a nominal
  record type. (The expected type is currently consulted for the record
  path; primitive binding inference still adopts the initializer's type —
  the "annotations are informational" gap persists for primitives.)
- Object-literal typing: an unpinned literal is a structured error ("needs a
  typed context"); a literal pinned to a non-record type is rejected; a
  pinned literal is checked for exact field coverage with per-field-name
  missing / unknown / duplicate diagnostics and per-field value typing.
  Value spreads contribute the source's field set, require the source to be
  the same record type as the target, and participate in collision and
  coverage checks.
- Member-access typing (`v.f`): the receiver is resolved to a record type and
  `f` looked up on its field list (read yields the field's type; an unknown
  field or a non-record receiver is an error). `TypeInvalid` receivers
  return `TypeInvalid` to suppress cascades. The legacy `Type.from(x)` path
  is preserved.
- Field assignment (`v.f = e;`): permitted only when the receiver is a `let`
  binding (a `const` receiver reuses the "cannot assign to const"
  diagnostic) and the binding is definitely assigned; the value is checked
  against the field type. Definite-assignment treats record bindings whole
  (per §8.4 there is no partial initialization), so no per-field bits are
  tracked.
- Compiler-derived structural equality: `==` / `!=` between two values of the
  same record type is accepted iff every field type supports `==` (numeric,
  `bool`, `char`, and — recursively — record fields). The requirement is
  recorded so codegen knows which per-type helpers to synthesize. Ordering
  operators (`<`, `>`, `<=`, `>=`) on record operands are rejected (§8.9).

Implemented (error model, Phase C):

- **Error types are user-declared record types**, not a built-in predeclared
  set. This is the major deviation from the Phase C plan, which called for
  `OverflowError` / `DivideByZeroError` / etc. predeclared in a primordial
  scope. Instead each error type is an ordinary in-file `type E = { ... };`
  record (Phase K). The fixtures declare their own `type OverflowError = {};`.
- Signature validation: every entry in a function's `T | E1, E2` error set
  must resolve to a record type (a primitive in the error slot is rejected
  with "must be a record type", an undeclared name with "unknown type"). The
  error set is normalized (duplicates removed) and stored on the
  `FunctionSignature.ErrorTypes`. A `void | E` success-with-error signature is
  legal.
- `as result` typing: the inner expression must be fallible — a call to a
  function with a non-empty error set, or one of the Phase A trap-set
  operations (checked arithmetic, integer `/`/`%`, `<<`/`>>`, and trapping
  `T(x)` conversions). `as result` on a provably-infallible expression is
  rejected ("cannot fail"). A fallible expression is only permitted inside the
  `as result` form; a bare/unbound fallible call elsewhere is rejected
  ("fallible call ... must be followed by `as result`"), including
  `let x = fallibleCall();` without `as result`.
- Pending-state tracking: the success binding(s) introduced by `as result`
  enter a per-scope **pending** map; any read of a pending binding before its
  matching `check` is rejected ("`x` is pending from `as result`; check
  `result` before reading it"). The matching `check result { ... }` transitions
  the bindings to valid on the fall-through path past the block.
- `check` block validation: the result name must match a still-pending
  preceding `as result` (a name mismatch or a `check` with no preceding
  `as result` is rejected), and the block body must fully diverge — every path
  must end in a diverging terminator (`return`, `return error as`, `break`, or
  `continue`); a fall-through or partial-divergence (`if` without `else`) path
  is rejected ("must diverge").
- `return error as { ... }` validation: legal only inside a function with a
  non-empty declared error set; the `{ ... }` object literal is pinned by that
  error set. `return error as` from a function with no error set, or an error
  literal that does not match a member of the declared set, is rejected
  ("error set").

These error-model flow checks reuse the same AST-walk machinery as Phase B
(there is still no CFG); check-block divergence is the structural
return-coverage walk applied to the block body.

Implemented (ownership and move, Phase F):

- **Inferred ownership tiers.** A type is *Copyable* iff every field is
  Copyable; `owned<T>` (and any owning built-in) is an ownership root, so any
  record transitively containing one becomes non-Copyable. `unique` types (and
  anything containing a Unique member) are non-Copyable and additionally
  non-Cloneable. `Validator.IsCopyable` / `IsUnique` compute these recursively.
- **Copy-vs-move enforcement.** Plain assignment and by-value passing of a
  non-Copyable (or Unique) value is rejected with a diagnostic suggesting
  `move`, `clone`, or `&`. Copyable values still copy implicitly.
- **`move` semantics.** `move x` transfers a live owned binding (whole-name
  only); a `const` binding, a borrowed reference, or a moved-into-itself
  target is rejected. The source enters a moved-from state.
- **Use-after-move tracking.** Move state is tracked per binding across
  straight-line code, `if`/`else`, `while`, and `for`, with a merge at join
  points. A binding moved on some paths but not all is rejected (diverging
  paths are exempt); reading or field-assigning a moved-from binding is a
  compile error. A loop body that moves a binding flags a use on the next
  iteration. Whole-value reassignment revives a moved-from binding.
- **`clone`.** `clone x` (fallible as `clone x as result`) produces a copy of
  a Cloneable value; cloning a Unique value is rejected.
- Implicit `return` move of owned locals / owned by-value parameters, and
  compiler-emitted reverse-order field disposal / scope-exit disposal of owned
  values (with moved-from owners skipped), per the Phase F plan.

Implemented (borrows, Phase G):

- `&T` (read-only) and `edit &T` (mutable, exclusive) borrow types on
  parameters, parsed via `ParseTypeReference` (the `TypeReference`/
  `TypeIdentifier` node carries `Reference` and `Edit` flags).
- **Contextual auto-borrowing at calls:** a bare addressable `T` argument
  satisfies a `&T` / `edit &T` parameter; explicit `&x` / `edit &x` remains
  available. A function-call temporary cannot be auto-borrowed.
- **Capability rule:** a `const` binding (or an existing `&` borrow) produces
  only `&`; passing it where `edit &` is wanted is rejected.
- **Exclusivity:** within one call, a storage root may be borrowed `&` any
  number of times, but an `edit &` borrow must be exclusive (no other borrow
  of the same root); a live borrow also excludes moving its source.

Implemented (heap indirection, Phase H):

- `owned<T>` parameter and field types; `new T { ... }` allocation expressions
  (fallible — `new ... as result`) yielding a `owned<T>` single owner.
- Auto-deref of `owned<T>` when accessing fields / calling methods on the
  inner value; `heapDerefTypesMatch` reconciles a `owned<T>` against a `T`.
- Single-owner (not refcounted); owner disposal frees the allocation, with
  cascading field disposal.

Implemented (receiver methods, Phase L):

- Receiver methods resolved and type-checked on records (`&T` and `edit &T`
  receivers). `value.m(args)` dispatch with auto-referencing of the receiver
  and capability checking (a `const`/`&` receiver cannot invoke an
  `edit`-receiver method). Methods are looked up on the receiver's record type
  and travel with the type across module boundaries.

Implemented (modules, Phase I):

- Cross-module name resolution: an `import` binds the named exported symbol
  into the importing file's top scope; importing a non-exported name is a
  diagnostic. The module graph, cycle detection, and per-module analysis live
  in `internal/pipeline/project_build.go` (`buildModuleGraph`,
  `resolveImportModule`, `checkOneMain`, `addCycleError`).

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

Implemented and exercised by the suites auto-discovered by `delta test` from
each `test-source/tests/<dir>/tests.json` (`pass`/`fail`/`trap`/`codegen_match`
verbs run end-to-end through clang). The current suites and case counts:

- `codegen` (17), `primitives` (23), `controlflow` (61), `customtypes` (69),
  `errors` (35) — the v0.5a numeric / control-flow / custom-type / error surface.
- `ownership` (66) and `ownership-codegen` (11) — move/borrow/copy analysis
  and its lowering (Phases F/G).
- `heap-codegen` (1) and `receivers` (20) — `owned<T>`/`new` lowering (Phase H)
  and receiver-method dispatch (Phase L).
- `analyzer-parity` (27), `basic` (23), `typecheck` (28) — analyzer and
  type-checker regression suites.

Covered codegen surface:

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
- Entry-point wrapper: a user `function main(): uint8` is renamed to
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
- Record types (Phase K):
  - A `buildRecordTable` pre-pass resolves every `TypeDeclaration` into a
    canonical `recordInfo` (Delta name, C name `delta__<Record>`, and the
    declaration-order field list). Aliases share the target's `recordInfo`
    and emit no new struct.
  - One `typedef struct delta__<Record> { ... }` per canonical record, in
    dependency (topological) order so a record embedded by value is defined
    before the record that contains it. Records flow through C by value:
    parameters, returns, and locals are plain struct values.
  - Object literals lower to C compound literals
    `(delta__Vec3){ .x = ..., ... }` with fields emitted in **declaration**
    order regardless of source order, so output is stable. Value spreads are
    expanded fieldwise — for each target field not given explicitly, the
    matching projection of the spread source is emitted.
  - Member access `v.f` and field assignment `v.f = e;` lower to plain C
    `v.f` (records live inline, no deref).
  - Structural equality: one `static inline bool delta__<Record>_eq(...)` is
    synthesized per record actually compared (recursing into record-typed
    fields via the field's own `_eq` helper). `a == b` lowers to
    `delta__<Record>_eq(a, b)` and `a != b` to its negation; the snapshot
    fixture `record_eq_helper_emitted_ok` asserts exactly one helper is
    emitted and no spurious ones.
- Error model (Phase C):
  - One tagged result struct per distinct success shape, synthesized on demand
    and cached: `typedef struct delta_result_<shape> { uint8_t tag; T value; }`
    (the `value` member is omitted for a `void` success shape). `tag == 0`
    means success; a non-zero tag means error. **Error-payload fields are not
    materialized** — the error side is tag-only in v0.5, even when the error
    record declares fields, so `return error as { code: 1, line: 0 }` lowers to
    a tag-only error value.
  - A fallible Delta function `T | E_set` lowers to a C function returning
    `delta_result_<shape>`; success returns `{ .tag = 0, .value = ... }` and
    `return error as { ... };` lowers to `{ .tag = 1 }`.
  - `_result`-suffixed variants of the Phase A trap helpers (conversion,
    division, shift, arithmetic) return a result struct (`{ .tag = 1 }` on what
    would have trapped, `{ .tag = 0, .value = ... }` otherwise) instead of
    calling `delta_panic`. Codegen selects the `_result` variant when the
    analyzer marks the op as `as result`-wrapped, and these helpers are emitted
    only when used.
  - The `as result` binding plus its matching `check` block lower together: a
    temporary `delta_result_<shape>` holds the inner expression, an
    `if (__result.tag != 0) { <check body> }` runs the check block, and the
    success value commits to the user's binding/storage **after** the check
    (so pending values only become visible once the error path is proven to
    diverge).
- Ownership / move / borrow (Phases F/G), exercised by the `ownership-codegen`
  suite (11 golden-file fixtures):
  - Copyable values copy as plain struct copies; `move` lowers to a transfer
    with no extra copy; borrows (`&T` / `edit &T`, including auto-borrows)
    lower to C pointer parameters with `*`/`->` access at use sites.
  - Compiler-emitted disposal: a `delta__<T>_drop` helper runs reverse-order
    field disposal at scope exit for owned (and `const`-bound owned) values,
    skipping moved-from owners; a `unique` type's `dispose` method is invoked
    here and emitted as a `delta__<T>_drop` body.
- Heap indirection (Phase H), exercised by `heap-codegen`: `owned<T>` lowers to
  `T*`; `new T { ... }` lowers to a heap allocation (single-owner), with
  auto-deref (`->`) on field/method access and a free at owner disposal.
- Receiver methods (Phase L): each method lowers to a free C function
  `delta__<RecvType>_<method>` taking the receiver as a leading pointer
  parameter; `value.m(args)` lowers to `delta__<T>_<m>(&value, args)` with
  auto-referencing (tracked in `buildMethods` keyed by receiver type → method).
- Multi-module output (Phase I): one C TU per module at `build/c/<module-id>.c`;
  exported symbols are mangled `delta__<module>__<name>` and module-private
  symbols are emitted `static`; the emitter is configured per module via
  `ConfigureModule(ModuleInfo)` with imported-symbol metadata so cross-module
  calls resolve to the right mangled names. All TUs are passed to clang in a
  single invocation.
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
  meant to layer on this CFG; Phase C nonetheless landed on the same AST-walk
  machinery (check-block divergence is the structural return-coverage walk
  applied to the block body), so the CFG infrastructure still has to be written
  before the flow analysis is sound in general.
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
extension that surface live diagnostics and position-based queries in the
editor.

Implemented:

- `delta lsp` subcommand: a single-threaded JSON-RPC over stdio server.
  - Handles `initialize`, `initialized`, `shutdown`, `exit`,
    `textDocument/didOpen`, `textDocument/didChange`, `textDocument/didClose`,
    `textDocument/hover`, `textDocument/definition`,
    `textDocument/completion`, `textDocument/signatureHelp`,
    `textDocument/documentSymbol`, `textDocument/references`,
    `textDocument/prepareRename`, `textDocument/rename`,
    `textDocument/semanticTokens/full`, `textDocument/inlayHint`,
    `textDocument/foldingRange`, `textDocument/selectionRange`, and
    `textDocument/codeAction`.
  - Advertises `textDocumentSync: { openClose: true, change: 1 }` (full
    document sync), plus `hoverProvider`, `definitionProvider`, and
    `completionProvider`.
  - On each open/change, runs `pipeline.Compile` over the document text and
    publishes `textDocument/publishDiagnostics`. On close, clears them. The
    latest result (and the last cleanly-parsed result) is cached per URI so
    hover/definition/completion can answer without recompiling.
  - Unknown requests respond with `MethodNotFound`; unknown notifications are
    ignored. Pipeline panics are caught so a malformed buffer cannot crash the
    server.
- Hover and go-to-definition resolve through the analyzer's `Refs` map
  (use-site → symbol) and `RootScope` scope tree. `internal/lsp/position.go`
  walks the **full current AST surface** — including the Phase B control-flow
  nodes (`for`, `switch`/`case`/`default`, postfix `++`/`--`) and the Phase K
  record nodes (`type` declarations and their record/alias/composition RHS,
  member access, object literals, member-access assignment targets) — so
  these features resolve everywhere they appear. Hover renders each symbol's
  `Display` string (e.g. `let i: int32`, `type Vec3`) as a fenced `delta`
  code block.
- Go-to-definition also resolves **type-name references** to their `type`
  declaration: a value use-site resolves through the `Refs` map, while a
  type reference (an annotation, field type, alias target, or composition
  operand) — which carries no `Refs` entry — falls back to a scope lookup
  that lands on the `SymbolTypeDecl`. The jump targets the type name itself
  (`SymbolTypeDecl.DefPos` is the declaration's name position); clicking the
  declaration site stays a no-op.
- Completion has two modes:
  - **Member access** (triggered by `.`): after a record-typed receiver
    (`v.`, `a.b.`), it offers that record's fields and nothing else, each
    labeled `name: type`. The receiver chain is resolved through the
    analyzer's resolved-record registry (`Analyzer.Records`, which follows
    alias chains and flattens spread/intersection composition); nested
    chains walk field types one segment at a time, and a non-record receiver
    yields no items.
  - **Default**: in-scope symbols (functions, consts, locals, parameters,
    and `type` names) plus the Delta keyword set (`function`, `const`,
    `let`, `type`, `if`/`else`/`while`/`for`, `switch`/`case`/`default`/
    `break`/`continue`, `return`, `true`/`false`). Locals are gated on
    declaration order; globals and parameters are always visible.
  - Function items insert argument snippets using declared parameter names.
    Statement completion supplies snippets for bindings and common control
    flow. Type positions offer primitive and user-defined types without
    unrelated value symbols.
  - Completion uses the expected binding or call-argument type to rank
    compatible values first. Inside a typed record literal it offers fields
    that have not already been initialized. After `check` it offers unmatched
    result names from preceding `as result` bindings.
  - Record fields are also offered after a simple record-returning function
    call such as `makeUser().`.
- Signature help shows parameter names and types, return types, and declared
  error types, with the active parameter tracked across nested calls.
- Document symbols expose functions, file constants, record types, and record
  fields. Find-references and rename operate over the current file for value
  and type symbols, with prepare-rename validation.
- Member hover and go-to-definition resolve record fields to their declared
  type and source position.
- Semantic tokens distinguish types, functions, parameters, variables, and
  fields. Inlay hints show inferred local binding types. AST block ranges feed
  folding and selection-range requests.
- Code actions currently provide quick fixes for adding a required
  `as result` binding and removing an unnecessary one.
- `internal/lsp/diagnostics.go` adapts `SourceError` to LSP `Diagnostic`:
  1-based positions become 0-based, severities map to LSP 1/2, `source` is
  `"delta"`, optional `Expected`/`Help` are appended to the message body.
- VS Code extension at `editors/vscode/`:
  - TextMate grammar covering comments, strings, numeric literals (incl. hex /
    binary / octal and scientific-notation floats), the full keyword set,
    booleans, function-name and `type`-name declaration highlights, and type
    annotations.
  - `language-configuration.json` for comment toggling and bracket
    autoclosing, plus brace indentation rules.
  - `src/extension.ts` spawns `delta lsp` over stdio via
    `vscode-languageclient` and surfaces server stderr in a "Delta Language
    Server" output channel.
  - Settings: `delta.server.path` (absolute path override; empty means PATH)
    and `delta.trace.server` (LSP trace level).
  - A server status-bar item, restart/output commands, automatic restart when
    the configured server path changes, and workspace-relative server paths.

The analyzer exposes the pieces the LSP needs for position-based queries:
`Analyzer.Refs` (use-site `Position` → resolved `Symbol`), `Analyzer.RootScope`
(a `ScopeNode` tree with source ranges and `FindDeepest(pos)`), and
`Analyzer.Records` (record type name → resolved `[]ResolvedRecordField`, with
aliases followed and composition flattened, built at the end of `Analyze()`).
Each `Symbol` carries a `Display` string for hover, including
`SymbolTypeDecl` (rendered as `type <Name>`).

Not implemented yet (LSP):

- Field completion at the cursor is text-driven: the receiver chain before
  the `.` is recovered by scanning the line prefix, and only the leading
  segment is resolved as a binding (subsequent segments walk field types).
  It does not consult the typed AST, so it does not see fields of a record
  returned by a call (`f().field`) or any non-binding receiver expression.
- A general typed-expression index. Member completion recognizes binding
  chains and simple function-call receivers, but arbitrary expression
  receivers still require a persisted typed AST or expression-type map.
- Field rename/find-references. Value and type symbols are supported, while
  field-wide refactoring needs receiver-type identity at every member and
  object-literal field occurrence.
- Source formatting. The current AST formatter is a debug tree renderer, not a
  round-tripping source formatter.
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
- A CFG-based dataflow framework underpinning move/borrow/assignment flow
  (still AST-walk heuristics) and a divergence model.
- Returned/stored-borrow lifetimes (`viewing <source>` clauses).
- Remaining checked error-state analysis (a v0 slice landed in Phase C; a
  CFG-based divergence model and error-payload materialization are still open).
- Structured codegen diagnostics in the `ErrorBag` and fail-closed
  guards for out-of-scope constructs (see "Codegen Status").
- `#line` directives in the generated C for source mapping.
- Bundled clang.
- The `std/log` standard library (Phase J) and `extern "c"` interop (Phase D).
- Incremental compilation, `.delta-meta`, and parallel codegen.
- LTO, sanitizers, and determinism flags.

Done:

- Ownership / move / borrow analysis and lowering (Phases F/G) and `owned<T>`
  indirection (Phase H).
- Multi-file module graph with cycle detection, per-module C translation
  units, and per-module name mangling (Phase I).
- Receiver methods (Phase L).
- `delta.json` manifest + `delta init` scaffolding, `delta run`, and a
  `--release` build mode.
- Single-TU C code generation for the v0 surface (see "Codegen Status").
- Single-invocation clang compile + link of all TUs to `build/<binary>`.
- Build directory layout (`build/c/<module-id>.c` then `build/<binary>`).
- Host clang lookup with a structured "not found on PATH" error.

### Syntax

Implemented:

- `type` record declarations: records, aliases, spread/intersection
  composition, object literals, member access (Phase K).
- `import` / `export`, with `from "..."` paths (Phase I).
- `move` / `clone` expressions, `&T` / `edit &T` borrow types, `owned<T>`
  types, and `new T { ... }` allocation (Phases F/G/H).
- Receiver-method declarations `function (t: &T) m(...) { ... }` (Phase L).

Pending:

- Template string literals.
- Raw string literals.
- Tagged-union `type` declarations (`type X = A | B;`).
- Classes.
- Interfaces and traits.
- Enums.
- External C declarations (`extern "c"`).
- Decorators.
- Arrays and slices.

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
- Record types (Phase K): `TypeCustom` with nominal identity, `type`
  record/alias/composition registration with declaration-time cycle
  detection, one-level bidirectional inference for object-literal pinning,
  field-coverage and value-spread checks, member access and field
  assignment with whole-binding definite-assignment, and compiler-derived
  structural `==`/`!=` (with ordering rejected).
- Error model (Phase C): fallible signatures `T | E1, E2` with error-set
  validation, `as result` / `check` / `return error as`, and pending-state
  tracking.
- Ownership (Phase F): inferred Copyable/Cloneable/Unique tiers, copy-vs-move
  enforcement, `move`/`clone`, use-after-move tracking with conditional-move
  rejection and revival, and compiler-emitted disposal.
- Borrows (Phase G): `&T` / `edit &T` with contextual auto-borrowing, the
  const-`&`-only capability rule, and `edit &` exclusivity.
- Heap (Phase H): `owned<T>` types, `new T { ... }` allocation, and auto-deref.
- Receiver methods (Phase L): `&T` / `edit &T` receivers, `value.m(args)`
  dispatch with auto-referencing and capability checking.
- Modules (Phase I): cross-module name resolution, export visibility,
  import-cycle detection.

Pending:

- A real control-flow graph + reusable dataflow framework to replace the
  AST-walk flow heuristics (definite-assignment, return-coverage, and the
  Phase F move/borrow flow all still ride on the heuristic machinery).
- A divergence concept (`panic`/`process.exit`/`unreachable`) feeding
  return-coverage.
- Scoping `for`-`init` bindings to the loop (today they leak into the
  enclosing scope).
- Extending one-level bidirectional inference to primitive bindings
  (annotation-driven typing of initializers); it lands for the record path
  in Phase K but primitive bindings still adopt the initializer's type.
- Returned/stored-borrow lifetimes (`viewing <source>` clauses); call-site
  borrow checking (Phase G) is done.
- Support for function-typed values as callees.
- Equality/ordering rules for `string`.
- A materialized typed AST distinct from the parser's untyped one.

### Safety Model

Implemented (Phases F/G/H):

- Inferred ownership tiers (Copyable / Cloneable / Unique) and copy-vs-move
  enforcement.
- `move` and `clone` (the latter fallible via `as result`).
- Use-after-move tracking with conditional-move rejection at merge points and
  revival via whole-value reassignment.
- `&T` / `edit &T` borrows with contextual auto-borrowing, the
  const-produces-`&`-only capability rule, and `edit &` exclusivity.
- `owned<T>` single-owner indirection with auto-deref and `new T { ... }`
  allocation.
- Compiler-emitted disposal: reverse-order field disposal and scope-exit
  disposal of owned values, with the `unique`-type `dispose` hook.

Pending:

- A CFG-based dataflow framework to make move/borrow flow analysis sound in
  general (still AST-walk heuristics).
- Full returned/stored-borrow lifetimes (`viewing <source>` clauses).
- Borrowed views of slices and strings (`&T[]`, `&string`) — pending the
  array/string family.
- `AllocError` plumbing beyond the tag-only error path.

### Error Model

Implemented (Phase C):

- Fallible function signatures `T | E1, E2` with error-set validation and
  normalization (each error type must resolve to a user-declared record type).
- The `expr as result` binding form over fallible calls and Phase A trap-set
  operations, with provably-infallible rejection.
- `check result { ... }` blocks with full-divergence enforcement.
- `return error as { ... }` propagation pinned by the declared error set.
- Pending-state tracking and pending-read rejection.
- Unbound-fallible-call rejection.
- Tagged result-struct codegen (tag-only error side) and `_result` trap-helper
  variants.

Pending:

- A built-in / predeclared error-type set (Phase C uses user-declared record
  types instead, a deviation from the plan).
- Materializing error-payload fields through codegen (the error side is
  tag-only today).
- Naming the error type at the `return error as` site and error-type
  *reshaping* / widening across function boundaries.
- `as result` over a `main` that itself declares an error set (entry-shim
  translation of a propagated error into an exit code).
- Explicit error ignoring (`ignore expr;`).
- Allocation-failure errors (`AllocError`, needs Phase H).
- A CFG-based divergence model (`panic`/`process.exit`/`unreachable`) feeding
  check-block divergence and return-coverage.

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

1. ~~Imports and module graph.~~ — done (Phase I; cycle detection + per-module
   name mangling).
2. ~~File-scope exports.~~ — done (Phase I).
3. ~~Type declarations and object literals.~~ — done (Phase K records).
4. Arrays and strings.
5. ~~Error handling with `as result` and `check`.~~ — done (Phase C; error
   types are user-declared records, error side is tag-only).
6. ~~Ownership and move semantics.~~ — done (Phase F).
7. ~~References.~~ — done (Phase G borrows; returned/stored-borrow lifetimes
   still pending).
8. Classes and disposal. — records (Phase K) + receiver methods (Phase L) +
   compiler-emitted disposal (Phase F) are the v0.5 substitute; the `class`
   keyword is deferred post-v0.5.
9. Generics.
10. Incremental compilation.

Also landed alongside these: `owned<T>` indirection (Phase H) and receiver
methods (Phase L). Remaining v0.5 work is the `std/log` standard library
(Phase J) and the `extern "c"` interop slice (Phase D).

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

The **Phase K (record types)** slice has also landed, taken ahead of the
remaining error-model and module work because it adds a large, demonstrable
language surface without depending on them. User-defined records — `type`
declarations (record / alias / spread + intersection composition), object
literals pinned by their typed context, member access, field assignment,
whole-value definite-assignment, declaration-time cycle detection, and
compiler-derived structural `==`/`!=` — now flow end-to-end through
tokenize → parse → analyze → C → clang. This required the first real piece
of one-level bidirectional inference (an *expected* type threaded into the
pinning sites) and struct / compound-literal / equality-helper codegen. It
is verified by the `test-source/tests/customtypes/` suite (structs, enums,
and tagged unions), and the
Phase K acceptance program (Vec3 / Animal / Dog with composition, value
spread, structural equality, field read/write) compiles and exits with
status `9`. The machinery here (the `MemberAccessExpression` node, the
bidirectional `typeOfExpr` plumbing, struct emission, and the
coverage/collision analyzer logic) is the foundation Phase E (classes) will
reuse. Out-of-scope items deferred to later phases: recursive records
(`heap T`, Phase H), `&T`/`edit &T` field and parameter types (Phase G),
tagged unions, and `string`-bearing record equality.

The **Phase C (error model)** slice has also landed. Fallible function
signatures (`T | E1, E2`), the `expr as result` binding form over fallible
calls and Phase A trap sites, `check result { ... }` blocks (every internal
path must diverge), `return error as { ... }` propagation, pending-state
tracking, and unbound-fallible rejection now flow end-to-end through
tokenize → parse → analyze → C → clang, lowering to tagged result structs.
This is verified by the `test-source/tests/errors/` suite, and the Phase C
acceptance program (`safeAdd` with nested `as result` / `check`) compiles and
runs. The largest deviation from the Phase C plan is that **error types are
user-declared in-file record types**, not a built-in predeclared error set,
and `return error as { ... }` is anonymous (pinned by the function's declared
error set) rather than naming the type; the error side of the result struct is
also tag-only (error-payload fields are not yet materialized). See "Error
Model (Phase C)" and the "Error Model" pending list for the open items.

The **v0.5b** slice — ownership and move semantics (**Phase F**), safe borrows
(**Phase G**), `owned<T>` indirection (**Phase H**), receiver methods
(**Phase L**), and the multi-file module system (**Phase I**) — has now landed.
Inferred ownership tiers, `move`/`clone`, use-after-move tracking, `&T`/`edit &T`
borrows with contextual auto-borrowing and exclusivity, `new T { ... }` heap
allocation with auto-deref, record receiver methods with capability dispatch,
and a transitively-discovered module graph (with import-cycle detection, export
visibility, per-module name mangling, and one C TU per module linked in a single
clang call) all flow end-to-end through tokenize → parse → analyze → codegen →
clang. This was accompanied by a **rewrite of the semantic pass** from
`internal/semantics/` into `internal/analyzer/` (now the live layer), and by
project tooling: a `delta.json` manifest, `delta init`, `delta run`, and a
`--release` build mode. These are exercised by the `ownership` (66),
`ownership-codegen` (11), `heap-codegen` (1), `receivers` (20), and
`analyzer-parity` (27) suites. The largest remaining v0.5 gaps are the `std/log`
standard library (**Phase J** — only the embed/resolution machinery exists), the
`extern "c"` interop slice (**Phase D**), a CFG-based dataflow framework to make
the move/borrow flow analysis sound, and returned/stored-borrow lifetimes
(`viewing <source>` clauses).

Cross-cutting codegen hardening also remains open and can land alongside
the phase work: populate `*ErrorBag` from `codegen.Emit` (today emitter
errors go to `println`), add fail-closed guards and entry-point
validation at the codegen boundary, and add a negative
`expect: "build_fail"` test verb. After that, the next milestones are the
larger sections of the design (ownership and lifetimes, modules, classes),
incorporated one pass at a time following phases D–J without restarting the
compiler.
