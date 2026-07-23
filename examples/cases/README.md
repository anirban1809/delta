# Delta examples — per-case success & failure fixtures

This tree splits the combined teaching files in [`../`](..) into **one program per
case**, so each file can drive a single compiler test. Everything here targets the
**v0.5 scope** defined in [`../../docs/plans/goal-v0.5/`](../../docs/plans/goal-v0.5/);
features deferred past v0.5 (generics, lifetimes/`@lifetime`, classes, user-defined
error types) are intentionally absent.

- `success/` — a folder of valid programs, one `<scenario>.delta` per distinct
  valid scenario (e.g. `E04-control-flow-returns/success/{if-else,while-loop,for-loop,switch}.delta`).
  Each must compile and (for `runtime-traps/`) run without panicking.
- `success/<scenario>.c` — the illustrative C lowering paired with each scenario.
  Arithmetic and casts lower to **plain C operators/casts** (the emitter does not
  wrap them in trap helpers — there is no `delta_add_i32`); `&T`→`const T*`,
  `edit &T`→`T*`, records→`struct delta__<Name>`, fallible `T | E`→a tagged
  `{ uint8_t tag; … }` result, `owned<T>`→`T*` with `delta_rt_*` runtime calls,
  exports→`delta__<module>__<name>`. Shows the *intent*, not a byte-exact target,
  and omits `#line`. (Module scenarios are subfolders holding several `.delta`/`.c`
  files, since a module graph spans files.)
- `fail-<CODE>-<slug>.delta` — a minimal program that triggers exactly **one**
  diagnostic. The expected diagnostic is on the offending line as
  `// ERROR[<CODE>]: <message>`. Some v0.5 rejections are structural and have no
  stable code yet (escaping borrows, cross-type spread); those use `// ERROR: …`.
- `trap-<slug>.delta` (in `runtime-traps/`) — a program that **compiles** but
  **panics at runtime**. The expected panic is marked `// TRAP: <message>`.

Folders are grouped by the diagnostics-catalog error-code sections.

| Folder | Codes | Source feature(s) |
|--------|-------|-------------------|
| `E01-names-scopes-declarations`   | E0101–E0108 (E0103→E04, E0104→type-inference) | local bindings, scopes |
| `E02-expressions`                 | E0201–E0208, E0210–E0215 (+ uncoded operator/conversion rejections) | expression forms: literals, identifiers, arithmetic, shifts, comparisons, logical, unary, casts `T(x)`, function calls (feature 02–03 / §3, §5). Bitwise `&`/`|`/`^`/`~` not yet supported. |
| `type-inference`                  | E0104, E0201 (inference context) | binding type inference (feature 04 / §4) |
| `E03-mutability-assignment`       | E0301–E0306 | assignment & mutability |
| `E04-control-flow-returns`        | E0401–E0411 (+ E0103 shadowing, E0209 condition-not-bool) | control flow, definite assignment, switch (Phase B) |
| `E05-record-types`                | E0501–E0507 (+ spread/composition) | record types (Phase K) |
| `E06-error-model`                 | E0601–E0608 | recoverable errors, **built-in error set** (Phase C) |
| `E07-ownership-move-clone`        | E0701–E0707 | ownership, move, clone (Phase F) |
| `E08-references`                  | E0801–E0806 (+ escape rejections) | safe references, auto-borrow (Phase F) |
| `E09-heap`                        | E0901–E0903 | heap (Phase H) |
| `E11-receiver-methods`            | E1101–E1106 | receiver methods (Phase L) |
| `E12-modules`                     | E1201–E1203, E1205 (+ bare-path, import-order) | modules (Phase I), stdlib (Phase J) |
| `runtime-traps`                   | (no codes)  | trap-on-overflow, narrowing/sign casts (Phase A) |

## What changed when aligning to plan-v0.5
- **Removed `E10-lifetimes`** — lifetimes / `@lifetime(...)` are post-MVP (§15 is
  post-MVP and still uses dropped `class`/generics). In v0.5 borrows are
  parameter-only and call-scoped; the escaping-borrow *rejections* now live in
  `E08-references` (`fail-escape-*`).
- **Removed `E0708`** (`<clone T>` generic-bound body rule) — generics are out of
  v0.5 entirely.
- **Removed `E0904`** — bare `new` legitimately aborts on OOM, so it is not an error.
- **`E06` rewritten to the built-in error set** (`OverflowError`, `DivideByZeroError`,
  `NarrowingError`, `ShiftCountError`, `AllocError`). User-defined error types are
  post-v0.5, so `type DivByZero` and `return error as { …fields }` are gone;
  propagation is `return error as OverflowError { }`.
- **`E0801` repurposed** — v0.5 calls *auto-borrow*, so "must take the reference
  explicitly" is not an error. E0801 now covers passing a borrow where an owned
  value is expected (fix hint: `clone`).
- **`E0707`** uses `unique type` (a stored `edit &T` field needs lifetimes, post-v0.5).
- **`E12` case-mismatch dropped** (not specified in plan-v0.5); added the spec'd
  bare-path "unknown import root" and "imports must precede declarations" cases.
- The `as resultName` / `check resultName` names must match (e.g. `as result` →
  `check result`); fixed where parent examples used the success-binding name.

## Module cases are multi-file
Each `E12-modules/*` case is its own mini-project directory:
- `success/vec3-methods/` — `main.delta` + `geometry.delta` (type + methods across modules)
- `success/const-and-function/` — `main.delta` + `mathlib.delta` (exported const + function)
- `fail-E1201-missing-module/`, `fail-E1205-unknown-std-module/`, `fail-bare-path/` — single file
- `fail-E1202-not-exported/` — `main.delta` + `geometry.delta`
- `fail-E1203-import-cycle/` — `a.delta` ⇄ `b.delta`
- `fail-import-after-declaration/` — `main.delta` + `helper.delta`

## Notes
- Each `fail-*` file is otherwise valid so only the marked diagnostic fires.
- Syntax follows plan-v0.5: verbose `int32`/`float64` naming, `type` records (no
  `class`), `owned<T>`, and call-site auto-borrowing (explicit `&`/`edit &` optional).
- The authored `docs/diagnostics-catalog.md` still lists some of the removed codes
  (E0708, E0904, E10xx) and the pre-auto-borrow E0801 wording — it has not been
  edited here; reconcile it separately if desired.
