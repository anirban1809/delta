# Plan: Phase J — Standard Library `std/log` (v0.5)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phase **I** (module resolver wired against `std/...`) and Phase **D** (`extern "c"`, `cstringview`, variadics) both landed.
Successor: Phase A and every later phase may import `std/log` for visible output in fixtures and acceptance programs.
Spec basis: [spec-sections/01-source-file-convention.md](../../spec-sections/01-source-file-convention.md) §1, [compiler-goal-v0.5.md](../../compiler-goal-v0.5.md) Phase J.

## Goal

Ship the stdlib delivery mechanism by populating the `std/...` resolver from Phase I with one real module — `std/log` — written in plain Delta on top of the `extern "c"` machinery from Phase D. After Phase J:

```delta
import { info, warn, error } from "std/log";

function main(): int8 {
    info("startup", 0);
    info("count", 42);
    return 0;
}
```

…produces a binary that prints

```text
[INFO] startup: 0
[INFO] count: 42
```

to **stderr** and exits 0.

## In-scope language surface

- A populated `stdlib/` embedded FS containing `log.delta`.
- A tiny C support shim co-located with the embedded sources (`stdlib/runtime.c`) that exposes `stderr` through a callable wrapper.
- A `std/log` Delta module exporting `info`, `warn`, `error`, each with the signature `(message: cstringview, value: int64): void`.
- Clang invocation extended to add the shim `.c` file when any `std/...` module is reachable in the project graph.
- A test runner expectation for stderr content (Phase J introduces the first program that writes to stderr; the existing exit-code expectation is insufficient).

## Explicitly out of scope for Phase J

| Feature | Reason | Eventual home |
|---|---|---|
| Stdlib modules beyond `std/log` | No `std/io`, no `std/collections`, no `std/unicode`. | Post-v0.5, on demand. |
| Log-level filtering (compile-time or runtime) | Adds state; v0.5 always prints all three levels. | Post-v0.5 when the use case is real. |
| Structured fields (key-value pairs beyond one `value`) | Requires more of the string family. | After template literals land. |
| Custom sinks (file, syslog, network) | Stderr is enough. | Post-v0.5. |
| Timestamps, process IDs, source-location prefixes | Same. | Post-v0.5. |
| Overloads that omit `value` or accept other value types | The `(message, value: int64)` shape is the only form. Adding string-only or float overloads requires template literals or full overloading. | After Phase A widens the numeric surface and overloading is in scope. |
| User-supplied logger configuration via Delta API | Same. | Post-v0.5. |

## What's missing today

After Phase I, the `std/...` resolver routes through `internal/stdlib.Resolve` against an empty embedded FS. After Phase D, the language can speak `extern "c"` and `cstringview`. What's missing:

- The `stdlib/log.delta` source file does not exist.
- The C shim file `stdlib/runtime.c` does not exist.
- The clang-invocation step does not know how to inject the shim into the link.
- The test runner cannot assert on stderr content; it asserts on exit codes and process panics only.

Everything else (resolver, extern, mangling, module graph) is already done.

## Decisions

1. **The stdlib lives in `stdlib/` at the repo root and is embedded via `//go:embed stdlib/*`.** Same path the Phase I scaffold uses. Phase J populates it with `log.delta` and `runtime.c`.
2. **The shim is plain C compiled by clang alongside the user TUs.** No Go-side wrapping. The shim sits at `stdlib/runtime.c` and is appended to the clang argument list whenever the project graph touches any `std/...` module.
3. **`std/log` is plain Delta on top of extern "c".** It declares `extern "c" { function fprintf(...); function delta_rt_stderr_handle(): cstringview; }` and wraps them with `info`/`warn`/`error`. The shim provides `delta_rt_stderr_handle()`.
4. **The `cstringview` return type of `delta_rt_stderr_handle` is a deliberate sleight-of-hand.** In v0.5 we don't have an opaque-handle type, but `FILE*` and `const char*` are both pointer-sized on every target we care about. The Delta side never dereferences the value — it just passes it back into `fprintf`. A `// XXX: not actually a string; opaque handle in disguise` comment lives in `log.delta` next to the extern declaration so the next reader knows what's happening.
5. **The shim never grows beyond what `std/log` needs.** It's not a general-purpose runtime library. When more stdlib modules arrive, each one ships its own shim or a runtime-library file is introduced. Phase J's shim is one function, four lines including the include.
6. **`std/log` is reachable when any module's import graph touches it.** The clang-injection rule is: if `pipeline.BuildProject` walks the graph and finds at least one `std/...` module, append `stdlib/runtime.c` to the source list. The shim is dead-code-eliminated by clang if no symbol from it is referenced — no harm in always linking when stdlib is touched.
7. **Stderr format is `[LEVEL] message: value\n`.** Fixed; no user configuration. Levels are uppercase. `value` is decimal-formatted via `%lld` (since the value is `int64`).
8. **The shim's symbol name is mangled with a `delta_rt_` prefix to avoid colliding with any future user `stderr_handle` function.** No `delta__stdlib__log__` namespace because the shim is C, not Delta-mangled.

## Tokenizer / parser / analyzer / codegen

Nothing new in any of these. Phase J is content + wiring. The Delta module compiles through the existing pipeline. The shim compiles through clang. The clang invocation lengthens by one argument.

## Stdlib sources

### `stdlib/log.delta`

```delta
extern "c" {
    function fprintf(stream: cstringview, fmt: cstringview, ...args): int32;
    // XXX: not actually a string — opaque FILE* in disguise. cstringview is the
    // only pointer-shaped Delta type available in v0.5. Phase D's restrictions
    // mean we cannot import a real opaque-handle type yet.
    function delta_rt_stderr_handle(): cstringview;
}

export function info(message: cstringview, value: int64): void {
    fprintf(delta_rt_stderr_handle(), "[INFO] %s: %lld\n", message, value);
}

export function warn(message: cstringview, value: int64): void {
    fprintf(delta_rt_stderr_handle(), "[WARN] %s: %lld\n", message, value);
}

export function error(message: cstringview, value: int64): void {
    fprintf(delta_rt_stderr_handle(), "[ERROR] %s: %lld\n", message, value);
}
```

### `stdlib/runtime.c`

```c
#include <stdio.h>

const char *delta_rt_stderr_handle(void) {
    return (const char *)stderr;
}
```

The cast through `const char *` matches the Delta-side `cstringview` return type. The pointer is opaque on the Delta side; the only thing done with it is passing it back into `fprintf`, which expects a `FILE *`. On every supported target both types have identical representation.

## Pipeline / toolchain wiring

`pipeline.BuildProject`:

- After the module graph is built, walk it: if any module's source path is from the stdlib FS, set `needsStdlibShim = true`.
- When invoking clang, if `needsStdlibShim`, materialize `stdlib/runtime.c` to a temp file (extracted from the embedded FS) and append it to the source list.

The materialization can also be done into `build/c/_runtime.c` next to the other generated TUs so the build artifacts are self-explanatory. Pick this option — it's no more code and aids debugging.

## Test runner extension

Phase J introduces stderr assertions. Extend the test fixture format:

```json
{
  "file": "main.delta",
  "expect": "pass",
  "exit_code": 0,
  "stderr_contains": [
    "[INFO] startup: 0",
    "[INFO] count: 42"
  ]
}
```

`stderr_contains` is a list of substrings; each must appear in the binary's stderr in some order. (Strict-order matching is more brittle than valuable for Phase J.) The runner captures stderr, joins, and matches.

## Testing strategy

New fixture directory `test-source/tests/codegen/projects/std_log/`:

- `std_log_basic_ok/` — imports info, calls it twice with different messages/values, asserts stderr contains both expected lines.
- `std_log_three_levels_ok/` — imports info/warn/error, calls each once, asserts each level prefix appears.
- `std_log_only_info_ok/` — imports info only (not warn/error), verifies the build still works. Confirms the partial-import shape is wired through.
- `std_log_unused_import_ok/` — imports info but never calls it; verifies the program builds and produces an empty stderr. Confirms clang dead-code-elimination doesn't trip on the shim.

The existing Phase I and Phase D fixtures continue to pass.

## Stage-by-stage implementation order

1. Drop `stdlib/log.delta` and `stdlib/runtime.c` into the repo. The Phase I `go:embed` directive picks them up automatically.
2. Wire `pipeline.BuildProject` to detect stdlib reachability and materialize the shim.
3. Extend the clang invocation to include the shim source file.
4. Extend the test runner with `stderr_contains` support.
5. Land the four fixtures.

The whole phase is roughly a hundred lines of code plus the two stdlib files. The risk surface is small.

## Risks and open questions

- **`(const char *)stderr` cast UB.** It's not strictly UB because both sides are pointers and the value is never dereferenced through the `const char *` view. But a strict compiler with `-Wcast-align` or `-Wbad-function-cast` might warn. The v0 clang flag set is `-Wall -Werror=implicit-function-declaration -fwrapv`; `-Wall` doesn't include the relevant cast warnings, so we're safe. If a future flag tightens, fix the shim with a memcpy-through-`intptr_t` dance.
- **`stderr` accessor portability.** On glibc, musl, and macOS libc, `stderr` is a macro expanding to a function call or an extern symbol. The shim's `(const char *)stderr` resolves consistently across all three. Windows isn't a target for v0.5.
- **Unicode in messages.** `cstringview` is C-style NUL-terminated; passing a multibyte UTF-8 message works only because `printf` is byte-oriented and the terminal interprets the bytes. No `\u{...}` escapes in `cstringview` literals (Phase D defers them). For Phase J that's fine — log messages are ASCII in practice.
- **What if the user defines their own `info`/`warn`/`error`?** Their names live in their module's scope; `import { info, ... } from "std/log"` brings the stdlib version into the importer's scope. Same-scope collision with a local function `info` is a duplicate-declaration error from the existing analyzer. No new logic needed.
- **What if the user calls `info` with a too-long format result (e.g., the message itself contains `%`)?** Because `fprintf("[INFO] %s: %lld\n", message, value)`'s format string is fixed and `%s` consumes the user message as a string, the user's message is never interpreted as a format string. Safe.

## Definition of done

- `import { info } from "std/log";` works end-to-end on a project that has no other imports.
- All four `std_log_*` fixtures pass with stderr assertions.
- Phase I and Phase D fixtures continue to pass.
- The acceptance program from [compiler-goal-v0.5.md](../../compiler-goal-v0.5.md)'s `import { info, error } from "std/log";` line type-checks and resolves (the full program won't compile until Phase E lands, but the import resolution is now possible).
- Phase A can begin and use `std/log` to print numeric results in its fixtures, replacing the v0 "main returns an int" exit-code-only flavor with proper visible output.
