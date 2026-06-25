# Delta 5-Day Plan — through 2026-06-30

Drafted: 2026-06-25. Window: Jun 26 → Jun 30 (5 working days).

> **Living document.** Day labels are a suggested sequence, not a commitment —
> reorder/rescope freely as work progresses. The one part worth preserving is the
> **dependency spine** below (`extern "c"` before stdlib/linking/maps; generics
> before typed collections); the calendar is negotiable.

## Goals (from the request)

1. Fix LSP issues (scoped to: **stale-binary / phantom errors**).
2. Add a basic standard library.
3. Linking support with external libraries.
4. Named/namespace module imports — `import strings from "std/strings"`.
5. Basic generics.
6. Arrays and maps.
7. Fix general issues that surface along the way.

## Dependency spine (why the order below)

These tasks are **not** independent:

- The stdlib (Phase J plan) was designed to sit on top of `extern "c"` (Phase D),
  which is **not implemented**. Decision: build `extern "c"` first.
- "Linking with libraries" is the same clang-invocation work as `extern "c"`
  (`internal/pipeline/project_build.go`, `internal/toolchain/clang.go`).
- `import strings from "std/strings"` is a **new namespace-import syntax** +
  qualified-name resolution, not a tweak to the existing `import { Name }` form.
- Maps realistically need both generics and a C hashmap shim → built on the
  `extern "c"` foundation. Arrays land first; **maps are a stretch goal**.

```
LSP stale-binary fix ── independent, do first
extern "c" + clang linking (Phase D) ──┬─→ stdlib std/strings (Phase J)
                                        └─→ maps (C hashmap shim)
namespace imports ───────────────────────→ ergonomic std/* usage
generics (<T>) ──────────────────────────→ typed arrays & maps
```

---

## Day 1 (Fri Jun 26) — LSP stabilization + `extern "c"` groundwork

**LSP stale-binary fix** (`internal/lsp/`, `cmd/delta`)
- Add a build/version stamp to the `delta` binary (ldflags or a const) and surface
  it from `delta lsp` (log on startup + a custom LSP notification).
- VS Code extension (`editors/vscode/src/extension.ts`): on connect, compare the
  server stamp against the extension's expected version; warn/auto-prompt to
  rebuild + restart when they diverge. This kills the "phantom errors from an old
  `bin/delta`" class of bug (per the known gotcha).
- Verify the LSP path uses `internal/analyzer` end-to-end (no lingering
  `internal/semantics` references after the rewrite).

**`extern "c"` groundwork** (Phase D)
- Read `docs/plans/phase-d-extern-c.md`; reconcile it with the current
  analyzer/codegen (the plan predates the rewrite).
- Tokenizer/parser: `extern "c" { ... }` blocks and `cstringview` type
  (`internal/tokenizer`, `internal/ast/parser.go`). `forward`/`extern` tokens
  are already reserved.

## Day 2 (Sat Jun 27) — `extern "c"` complete + library linking

- Analyzer: treat `extern "c"` decls as opaque foreign signatures; type-check
  calls against them; `cstringview` and variadics as needed.
- Codegen: emit declarations only (no body) for extern functions; string
  literals → C string view.
- **Linking**: extend the clang invocation in
  `internal/pipeline/project_build.go` to (a) inject co-located C shim files when
  a `std/*` module is reachable, and (b) accept link flags (`-l`, `-L`) — source
  these from `delta.json` (`build.link` / `libs`) and/or per-extern annotations.
- Add an end-to-end fixture: a Delta program calling a libc function (e.g.
  `puts`) that compiles, links, and runs.

## Day 3 (Sun Jun 28) — stdlib `std/strings` + namespace imports

**Standard library** (`internal/stdlib/`, Phase J)
- Replace the placeholder with real embedded sources: `stdlib/strings.delta`
  (+ `stdlib/runtime.c` shim if needed). Start with `std/strings`; `std/log`
  optional.
- Functions: length, equality/compare, concat, substring/contains — whatever the
  current string surface + `extern "c"` can support.
- `Resolve()` already routes `std/...`; ensure the shim links via Day 2 work.

**Namespace imports** — `import strings from "std/strings"`
- Parser: new import form binding a module under a single local name
  (`internal/ast/parser.go`), alongside existing `import { Name }`.
- Resolver: bind the module namespace; resolve qualified `strings.fn(...)` access
  (`internal/analyzer`, `internal/pipeline/project_build.go`).
- Codegen: qualified calls resolve to the mangled `delta__<module>__<name>`.

## Day 4 (Mon Jun 29) — basic generics

- Parser: type parameters on functions and records — `function f<T>(...)`,
  `type Box<T> = { ... }` (`internal/ast/parser.go`). Ownership bounds
  (`<clone T>` / `<unique T>`) parse but can be minimally enforced for v0.
- Analyzer: type-parameter scopes, substitution, instantiation-site inference
  (`internal/analyzer`).
- Codegen: **monomorphization** — emit one concrete C type/function per used
  instantiation (`internal/codegen`).
- Fixtures: generic identity fn, a generic `Box<T>` record.

## Day 5 (Tue Jun 30) — arrays (+ maps stretch) + cleanup

**Arrays** (the committed collection deliverable)
- Parser: array literals `[a, b, c]` and index expressions `a[i]`
  (currently unimplemented).
- Type system: an array type kind, likely over `heap<T>` (Phase H exists).
- Analyzer: element typing, bounds-trap on index (reuse the trap runtime).
- Codegen: array layout + indexing in C.

**Maps — stretch** (only if arrays land with time to spare)
- Generic `Map<K,V>` over a C hashmap shim (depends on generics + `extern "c"`).

**General-issue cleanup** (Task 7, also woven through every day)
- Triage bugs surfaced during the week; fix the cheap/blocking ones, file the
  rest. Update `docs/compiler-status.md`. Add/extend `test-source/tests/*`
  suites for everything that landed.

---

## Risks / honest scoping

- **`extern "c"` is the long pole.** If Days 1–2 slip, stdlib, linking, and maps
  all slip with them. Protect this work.
- **Generics + arrays in one window is aggressive.** Maps are explicitly a
  stretch; do not let them cannibalize array quality.
- **Each landed feature needs a test suite** (`delta test` auto-discovers
  `test-source/tests/<dir>/tests.json`) or it isn't really done.
- Rebuild `bin/delta` (`make build`) + restart the LSP after compiler changes,
  or the editor shows phantom errors (the very bug Day 1 addresses).
