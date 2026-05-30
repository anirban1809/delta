## 1. Source File Convention

Section 1 covers everything about how Delta source code lives on disk: file extension, manifest, project layout, module-to-file mapping, entry points, build artifacts, encoding, and case sensitivity. Each sub-feature below follows the Proposal / Reason / Examples / Conclusion structure.

---

### 1.1 File Extension and Standalone Builds

**Proposal.** Delta source files use the extension `.delta`. The compiler driver supports three usage modes:

- **Standalone single-file:** `delta build hello.delta` works with no manifest, no project directory, no setup.
- **Standalone multi-file:** `delta build a.delta b.delta c.delta` also works; imports between the files resolve by relative path.
- **Manifest-driven project:** a `delta.json` is required only when there is actual configuration to express — dependencies, custom build targets, named package, non-default settings.

**Reason.** A dedicated extension keeps tooling unambiguous (editors, formatters, language servers) and signals to readers that the file is not TypeScript despite the syntactic resemblance.

Allowing standalone and multi-file builds without a manifest removes the friction of "every Delta program starts with a project scaffold" — the same friction that makes scripting-style tools feel painful (cf. Rust's `cargo new` ceremony for one-off snippets). The threshold "manifest required when there is configuration to express" puts the cost where the value is.

**Examples.**
```bash
# standalone, no manifest needed
delta build hello.delta
./hello

# multi-file standalone
delta build main.delta util.delta parser.delta

# full project (manifest needed for dependencies, named package, etc.)
my-app/
  delta.json
  src/
    main.delta
    http.delta
    config.delta
```

**Conclusion.** Adopt `.delta` as the canonical extension. The compiler driver supports three usage modes: standalone single-file, standalone multi-file, and manifest-driven project. The "no manifest until you need configuration" boundary is a hard rule.

---

### 1.2 Manifest File (`delta.json`) and `delta init`

**Proposal.** The project manifest is `delta.json`, parsed as **JSONC** — JSON extended with `//` and `/* */` comments and trailing commas. Two rules govern the manifest:

- The file extension stays `.json` so generic tooling treats it as JSON; only the Delta toolchain knows about the JSONC dialect.
- The manifest is created **only** by explicit `delta init` (optionally `delta init --name foo`). No tool ever auto-generates a manifest as a side effect of `delta build` or any other command.

**Reason.** JSON is universally parseable but strict JSON's lack of comments and trailing commas creates real pain for build configuration — config files benefit from inline annotations, and trailing commas keep diffs minimal when fields are added.

Choice of dialect:

- **JSONC** is a minimal superset that addresses both, and is already the convention for VS Code's own config files (`tsconfig.json`, `.vscode/settings.json`).
- **TOML** reads better but adds a parser dependency and breaks the spec's JSON commitment.
- **YAML** is a footgun (Norway problem, indentation sensitivity).
- **A Delta-native format** creates a chicken-and-egg bootstrap problem.

Explicit-only manifest generation prevents the "I ran a build and it modified my filesystem" surprise. Side-effect file creation is a category of magic that experienced users learn to distrust — better to require one extra command (`delta init`) than to litter directories.

**Examples.**
```bash
delta init                 # creates ./delta.json + ./src/main.delta + ./.gitignore
delta init --name my-app   # same, but pins the package name
delta build                # errors if no manifest in current dir and no source argument
```

`delta.json` (JSONC dialect):
```jsonc
{
  // Package identity
  "name": "example",
  "version": "0.1.0",
  "schemaVersion": 1,

  // Build entry
  "entry": "src/main.delta",

  "target": {
    "backend": "c",
    "standard": "c17",
    "compiler": "clang",
  },

  "build": {
    "debug":   { "opt": "O0", "checks": true       },
    "release": { "opt": "O3", "lto": true, "checks": "selected" },
  },
}
```

**Conclusion.** Lock in `delta.json` + JSONC dialect. The manifest is always explicit. `delta init` produces a starter manifest with inline comments so users see the dialect from their first project. Schema is versioned via `schemaVersion` to allow forward evolution (e.g., workspaces in v2).

---

### 1.3 Project Layout

**Proposal.** `src/` is a convention, not a requirement.

- `delta init` creates `src/main.delta` by default because conventions shape ecosystems.
- The manifest's `entry` field accepts any path — `"entry": "main.delta"`, `"entry": "cmd/server/main.delta"`, `"entry": "app/start.delta"` are all valid.
- The compiler and build tool never grep for `src/`; they follow paths from `entry` and from `import` statements.
- `delta init --no-src` produces a flat layout (`main.delta` at the project root) for users who prefer it.

**Reason.** Delta's target domains are wide — CLI tools, services, parsers, libraries, infrastructure code — and they each want different layouts. A CLI suite with `cmd/foo/main.delta` + `cmd/bar/main.delta` is a reasonable shape; enforced `src/` would chafe.

Convention-over-enforcement is consistent with the rest of Section 1 (standalone files allowed, manifest optional, multi-file without manifest). The `delta init` default will dominate in practice, so the ecosystem will converge on `src/` without the language having to legislate it.

**Examples.**
```txt
# default layout from `delta init`
my-app/
  delta.json        # "entry": "src/main.delta"
  .gitignore
  src/
    main.delta

# flat layout from `delta init --no-src`
my-app/
  delta.json        # "entry": "main.delta"
  .gitignore
  main.delta

# Go-style multi-binary layout (valid, just not the default)
my-app/
  delta.json        # "entry": "cmd/server/main.delta"
  cmd/
    server/main.delta
    migrate/main.delta
  internal/
    db.delta
    http.delta
```

**Conclusion.** `src/` is convention only. No directory name is special to the compiler or the build tool. The `delta init` default writes `src/main.delta`; deviations are first-class.

---

### 1.4 Module-to-File Mapping

**Proposal.** One file = one module. The rules:

- `import { x } from "./user"` resolves to `./user.delta`, full stop.
- No `mod.delta`, no `index.delta`, no directory-as-module.
- Directories are pure organization with no semantic role in module resolution.
- Path separator in import strings is `/` only, even on Windows.

**Reason.** TypeScript users already expect this — TS resolves `./user` → `./user.ts` and that's the end of the story. Rust's `mod.rs` / `lib.rs`, Go's directory-as-package, and Python's `__init__.py` all introduce a "which file in the directory is the module?" ambiguity that newcomers stumble over for years. Delta's "TypeScript-shaped" positioning argues against reproducing that.

The tradeoff is that a logically-large module cannot be split across multiple files transparently — but that's an antipattern anyway; if `parser.delta` outgrows its file, split it into `parser-expr.delta` + `parser-stmt.delta` and have them be separate modules.

**Examples.**
```ts
// ./auth/login.delta exists, ./auth/session.delta exists
import { login } from "./auth/login";        // resolves to ./auth/login.delta
import { Session } from "./auth/session";    // resolves to ./auth/session.delta

// invalid — no directory-as-module
import { x } from "./auth";                  // compile error: ./auth.delta not found

// equivalent forms
import { x } from "./util";
import { x } from "./util.delta";            // explicit extension allowed but not preferred
```

To expose a grouped surface from a directory, write an explicit barrel file:
```ts
// ./auth.delta — barrel sibling to ./auth/
export { login } from "./auth/login";
export { Session } from "./auth/session";

// elsewhere
import { login, Session } from "./auth";     // resolves to ./auth.delta
```

**Conclusion.** One module per file is a hard rule. Imports use `/` separators. Barrels are written explicitly, not synthesized from directory structure.

---

### 1.5 Entry Point

**Proposal.** The entry-point symbol is `function main(): i32`, declared at top-level scope in the entry file. The rules:

- The entry *file* is identified by the manifest's `entry` field or by the `delta build <file>` CLI argument — the filename `main.delta` carries no special meaning; it is a convention.
- A project may contain multiple files each with their own `main`; the manifest or CLI picks which one is built.
- A library is simply a project whose entry file has no `main` (or whose `main` is ignored by consumers that link the project as a dependency).
- Building a project as an executable when `main` is absent in the entry file is a compile error.

**Reason.** Separating "what runs" (a symbol) from "where it lives" (a path) is the cleaner design and matches C, Rust, and Zig. Filename-based entry conflates a filesystem name with a semantic role and breaks for projects with multiple binaries.

The `i32` return type pins the function as returning a process exit code, which is what `main` semantically *is*. There is no "top-level code runs as a script" mode — Delta's static typing, ownership analysis, and error-handling rules don't compose cleanly with statement-level top-level execution.

**Examples.**
```ts
// src/main.delta
function main(): i32 {
  console.writeLine("hello");
  return 0;
}
```

Multiple entry points in one project:
```txt
my-tools/
  delta.json          # "entry": "cmd/server/main.delta" (default)
  cmd/
    server/main.delta     # has its own `function main(): i32`
    migrate/main.delta    # has its own `function main(): i32`

# default build:
delta build

# ad-hoc build of a different entry:
delta build cmd/migrate/main.delta
```

Library (no `main` anywhere; consumed as a dependency):
```ts
// src/lib.delta
export function parse(input: StringView): Ast | ParseError { /* ... */ }
// no function main here
```

**Conclusion.** `main` is the magic symbol, top-level, return type `i32`. Entry file is determined by manifest or CLI argument. Libraries are distinguished by absence of `main`, no annotation required.

---

### 1.6 Build Artifacts

**Proposal.** For manifest-driven projects, all build output goes under `build/` at the project root, structured as:
```
build/
  debug/    { c/, obj/, bin/ }
  release/  { c/, obj/, bin/ }
  cache/    # incremental build state
```

Additional rules:

- For standalone-file builds (`delta build hello.delta` with no manifest), the final binary lands at `./hello` next to the source, and intermediate C is written to a system temp directory and removed after the build.
- `delta init` writes a `.gitignore` containing `/build` so artifacts are never accidentally committed.
- Override the output location with `delta build --out <dir>` or `"build": { "outDir": "..." }` in the manifest.
- Generated C is kept *visible* (not hidden in `~/.cache/...`) so users can inspect it.

**Reason.** A small set of decisions drives the layout:

- **One top-level directory** keeps cleanup trivial (`rm -rf build`) and `.gitignore` simple.
- **Per-mode subdirectories** (`debug/`, `release/`) prevent debug and release artifacts from clobbering each other — switching modes doesn't trigger a full rebuild.
- **Visible generated C** is essential because Delta's pitch is "readable, idiomatic C output"; hiding the C undermines the value proposition and makes debugging the compiler itself harder. (User-facing stack traces still point at `.delta` files via `#line` directives emitted during codegen — see section 2 — so end users don't need to navigate into `build/` for normal debugging; the visible C is for inspecting codegen, not for reading line numbers.)
- **Standalone files** clean up intermediates so `delta build hello.delta && ./hello` feels like a scripting language — the right feel for one-off use.

Naming:

- **`build/` over `target/`** (Cargo) because the manifest already uses `"target": { ... }` for backend configuration and reusing the word for an output directory invites confusion.
- **`build/` over `dist/`** (npm/webpack) because `dist/` connotes "ready to publish," not "intermediate build state."

**Examples.**
```txt
# after `delta build` in a project:
my-app/
  delta.json
  src/main.delta
  build/
    debug/
      c/   main.c
      obj/ main.o
      bin/ my-app
    cache/ ...
  .gitignore     # contains /build

# after `delta build hello.delta` standalone:
./hello          # binary, next to source
# (no .c file left behind; intermediate C was in /tmp/...)
```

**Conclusion.** `build/` for projects, in-place binary for standalone files. Generated C is visible by default. `delta init` writes the `.gitignore`. `--out` overrides for both modes.

---

### 1.7 Encoding, Line Endings, and Case Sensitivity

**Proposal.**
- **Encoding:** UTF-8 only. A UTF-8 BOM at file start is a compile error.
- **Line endings:** Both LF and CRLF accepted in source files. Internally normalized to LF for source positions and lowering. String literal bytes are preserved verbatim regardless of file-level line endings. A lone CR (no following LF) emits a warning.
- **Source positions:** byte offsets, not character offsets, not display columns.
- **Identifiers:** Follow Unicode UAX #31; compared after NFC normalization. Operators and digit literals are ASCII-only.
- **Case sensitivity in imports:** Always case-sensitive, regardless of the host OS's filesystem behavior. On case-insensitive filesystems (macOS, Windows), the build tool reads the actual on-disk filename from the directory entry and reports a compile error if the case in the import string does not match exactly.

**Reason.** Each decision earns its place:

- **UTF-8 is the modern consensus**; permitting other encodings creates a permanent tax on every tool in the ecosystem.
- **Rejecting BOM** (Go-style, not Rust-tolerant) avoids a class of silent Windows interop bugs.
- **Accepting both line endings** is mandatory in practice because Windows checkouts will have CRLF; rejecting them outright is hostile.
- **Byte offsets** are unambiguous and match what LSP clients expect.
- **NFC-normalized identifier comparison** prevents two visually-identical identifiers from being treated as distinct (a real attack surface in some languages).
- **Strict case sensitivity** eliminates the classic "works on my macOS, breaks on Linux CI" failure mode — Go's experience here is conclusive.

**Examples.**

Encoding and line endings:
```ts
// file is UTF-8, no BOM, mixed CRLF/LF accepted
const greeting = "héllo δelta";   // identifier and string contents are UTF-8
const lineSeparator = "\r\n";     // string literal bytes preserved exactly
```

Case-sensitivity enforcement:
```ts
// on disk: ./User.delta exists
import { User } from "./user";    // compile error on macOS/Windows even though
                                  // the filesystem would accept it:
                                  // "./User.delta exists but import path is './user';
                                  //  rename one to match"
```

Identifier normalization:
```ts
const café = 1;      // 'é' as composed U+00E9
const café = 2;      // 'é' as 'e' + U+0301 combining acute
                     // compile error: duplicate identifier `café` (NFC-equal)
```

**Conclusion.** UTF-8 mandatory, BOM rejected, both line endings accepted with internal LF normalization, byte-offset positions, NFC identifier comparison, strict case-sensitive imports with active verification on case-insensitive filesystems.

---

### 1.8 Explicit Non-Goals for Section 1

The following are deliberately out of scope, either deferred to later sections or excluded permanently:

- **Testing conventions** (test file naming, in-file test syntax, discovery rules) — deferred entirely; will be designed in a later pass.
- **Workspaces / multi-package monorepos** — post-MVP. The MVP allows exactly one `delta.json` per project; no root-level workspace manifest, no `path` dependencies between sibling projects. The `schemaVersion` field in the manifest reserves forward compatibility for adding `"workspace": { ... }` later.
- **Auto-generated manifests** — never. Manifest creation is always explicit (`delta init`).
- **Directory-as-module / `mod.delta` / `index.delta`** — never. One file = one module is a hard rule.
- **Enforced `src/` directory** — never. `src/` is convention only.
- **Top-level executable code (script mode)** — never. The entry point is always `function main(): i32`.
- **Filesystem-dependent import casing** — never. Imports are always case-sensitive.

---

