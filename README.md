# Delta

A statically-typed, AOT-compiled systems programming language with TypeScript-like syntax. Delta lowers to inspectable C through a bundled, pinned Clang toolchain, and pairs ownership-based memory safety with a channel-style error model — no exceptions, no `Result<T, E>` wrappers, no hidden control flow.

> **Status:** early-stage. The compiler currently implements the first two pipeline stages (lex + parse) on a small language subset. See [Current Status](#current-status) below.

---

## Design at a glance

| Area | Delta's choice |
|---|---|
| Surface syntax | TypeScript-like (`function`, `const`, `let`, `interface`, `T?`) |
| Compilation | AOT, lowers to C, compiled with a bundled pinned Clang |
| Memory | Ownership + moves, `borrowed` / `mod borrowed` safe borrows, `heap T` |
| Errors | `Success \| ErrorType` returns, `as result` binding, `check` block, `ignore` for explicit drops |
| Sum types | Pre-declared named `type`s unioned with `\|`, dispatched via `switch type` (exhaustive, no `match`) |
| Mutability | Single axis — `const` vs `let`; borrow capability follows the binding |
| Toolchain | Bundled Clang under `~/.delta/toolchain/`; system `cc` only via opt-in `DELTA_CC` |
| Project layout | Standalone `.delta` files, multi-file, or manifest-driven (`delta.json`, JSONC); no auto-generated manifests |

The full design lives in [`docs/main-spec.md`](docs/main-spec.md), with expanded treatments under [`docs/spec-sections/`](docs/spec-sections/).

---

## A taste of Delta

```ts
function readFile(fileName: stringview): stringview, string | IOError {
  if (fileName == "") {
    return error as IOError {
      code: "io.empty_file_name",
      message: "file name cannot be empty",
      fileName,
    };
  }

  const fileContent = fs.readRaw(fileName);
  return fileName, fileContent;
}

function main(): int32 {
  const fileName, fileContent = readFile("hello.txt") as result;
  check result {
    console.writeLine(result.error.message);
    return 1;
  }
  console.writeLine(fileContent);
  return 0;
}
```

Key things on display:
- Multi-value success returns (`stringview, string`) on the happy path.
- Errors travel on a dedicated channel — `| IOError` after the success tuple — and are constructed with `return error as IOError { ... }`.
- Callers **must** bind a fallible call with `as result` and discharge it in a `check` block before the success values become usable.

---

## The compilation pipeline

Delta is designed around eight stages, each a pure function from its input to its output:

```
.delta sources
   │  1. lex
   ▼
token streams
   │  2. parse
   ▼
untyped ASTs
   │  3. semantic analysis  (typed AST + module interfaces)
   ▼
typed ASTs
   │  4. ownership & lifetime analysis
   ▼
ownership-checked ASTs
   │  5. checked error-state analysis
   ▼
fully-checked ASTs
   │  6. C codegen
   ▼
.c files under build/<mode>/c/
   │  7. clang -c   (parallel)
   ▼
.o files under build/<mode>/obj/
   │  8. clang link
   ▼
executable under build/<mode>/bin/
```

Targeting C (rather than LLVM IR directly) buys mature optimization, broad platform support, and inspectable codegen for debugging. The pure-function-per-stage discipline is what makes incremental compilation and future LSP embedding tractable later.

---

## Current Status

Implemented:
- CLI driver: `delta build <file.delta>` with `.delta` extension enforcement.
- Tokenizer covering identifiers, integer/bool/string/char literals, keywords (`function`, `return`, `const`, `let`, `if`, `else`, `while`), delimiters, arithmetic/comparison/logical operators, and assignment.
- Parser producing an untyped AST for function declarations, top-level `const` (top-level `let` rejected), local `const`/`let`, assignment, `if`/`else`, `while`, `return`, unary/binary expressions with correct precedence (`*` `/` > `+` `-` > comparison > `&&` > `||`), and expression-shaped call callees (so `makeAdder()(3)` parses).
- Shared diagnostics package with file/line/column/source-line/caret output, used by both tokenizer and parser.

Not yet implemented (large gaps):
- Floats, comments, template/raw strings.
- Imports/exports, `type`, `class`, `interface`, `enum`, `extern "c"`, decorators.
- `for`, `for...of`, `switch`, `check`, `panic`, `process.exit`, `unreachable`.
- Multi-return destructuring, definite-assignment, scope/shadowing checks.
- All of semantic analysis, ownership/borrow checking, error-state analysis, and codegen.

A full feature-by-feature checkpoint lives in [`docs/compiler-status.md`](docs/compiler-status.md).

### Next milestone

Push a thin slice through every pipeline stage on a tiny language subset — `{functions, const, let, assignment, if, while, calls, int32, bool, void}` — by adding name resolution, primitive type checking, C emission for the existing AST nodes, and a Clang invocation. The goal is to exercise the full compiler architecture before broadening the syntax surface.

---

## Building and running

The compiler is written in Go (module `delta`, Go 1.26+).

```bash
# Build the compiler
make build         # produces ./bin/delta

# Run it against a sample
./bin/delta build test-source/hello.delta

# Standard Go workflow
make test
make fmt
make clean
```

Today, `delta build` prints either:
- a formatted diagnostic (with caret-pointed source line) if tokenization or parsing fails, or
- the parsed AST in tree form if it succeeds.

End-to-end compilation to a binary is not wired up yet — that arrives with the next milestone.

---

## Repository layout

```
cmd/delta/              CLI entry point (delta build ...)
internal/tokenizer/     Stage 1 — lexer
internal/token/         Token kinds and helpers
internal/ast/           Untyped AST types + parser (stage 2)
internal/diagnostics/   Shared diagnostic bag and CLI rendering
internal/semantics/     Stage 3 — semantic analysis (in progress)
docs/main-spec.md       Top-level language spec (52 numbered features)
docs/spec-sections/     Expanded per-feature design documents
docs/compiler-status.md Implementation checkpoint
test-source/            Sample .delta inputs
```

---

## Contributing

The language design is still being shaped. Feature proposals are written in the Proposal → Reason → Examples → Conclusion format used throughout `docs/spec-sections/`. When proposing or implementing a feature, please reference the relevant numbered section in `docs/main-spec.md` so the design conversation and the implementation stay in sync.
