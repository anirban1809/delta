# Plan: Phase B — Control Flow & Flow Analysis (v0.5)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phases **I, D, J, A** landed.
Successor: Phase C consumes the CFG infrastructure from Phase B for fallible-flow analysis; Phase F extends the same CFG for move-state tracking.
Spec basis: [spec-sections/03-basic-syntax-and-variable-bindings.md](../../spec-sections/03-basic-syntax-and-variable-bindings.md) §3 (especially §3.4 shadowing), [spec-sections/06-other-primitive-types.md](../../spec-sections/06-other-primitive-types.md) (exit-path terminators), [compiler-status.md](../../compiler-status.md) "pending" list.

## Goal

Bring the control-flow surface and flow analysis up to spec: counted `for` ranges, `break`/`continue`, definite-assignment analysis, return-coverage analysis, cross-scope shadowing rejection. Also land the pending Phase 7 codegen hygiene work from `compiler-status.md` (structured codegen diagnostics, fail-closed guards) so codegen exits its prototype state.

After Phase B:

```delta
function gcd(a: int64, b: int64): int64 {
    let x: int64;
    let y: int64;
    if (a < b) { x = b; y = a; } else { x = a; y = b; }
    while (y != 0) {
        const t = y;
        y = x % y;
        x = t;
    }
    return x;
}

function main(): int32 {
    for i in 1..=5 {
        info("gcd", gcd(int64(i) * 12, 18));
    }
    return 0;
}
```

…compiles. The analyzer rejects programs that read an uninitialized `let`, omit a return on a non-`void` path, or shadow an outer binding.

## In-scope language surface

- `for i in lo..hi { ... }` (exclusive) and `for i in lo..=hi { ... }` (inclusive).
- Loop variable: a fresh `const` binding scoped to the loop body; its type is inferred from the range bounds.
- `break` and `continue` statements inside loops.
- `let name: T;` (no initializer) with definite-assignment tracked across the CFG.
- Return-coverage analysis on non-`void` functions: every CFG exit must end in `return`, `panic`, or one of the other diverging terminators.
- Cross-scope shadowing rejection per §3.4 — inner-scope `let`/`const` may not name an outer-scope visible binding.
- Codegen hygiene: `*diagnostics.ErrorBag` plumbed through `codegen.Emit`; fail-closed guards on every analyzer-accepted-but-codegen-unhandled construct.

## Explicitly out of scope for Phase B

| Feature | Reason | Eventual home |
|---|---|---|
| `for...of` over collections | No collection types exist yet. | Post-v0.5, after arrays/slices land. |
| `switch` and `switch type` | Spec defines them; significant surface; not needed for the goal. | Post-v0.5. |
| C-style `for (init; cond; step)` | Spec doesn't define it; the range form is the only `for`. | Never planned. |
| `check` blocks (`check { ... }`) | Phase C owns the error model. The CFG hooks for fallible flow land here. | Phase C. |
| User-callable `panic(msg)` / `process.exit(code)` / `unreachable()` | The trap helpers from Phase A already invoke an internal panic; exposing the user-facing intrinsics is a small additional surface. **Stretch goal within Phase B** — see below. | Phase B (stretch) or Phase C. |
| Definite assignment through pattern destructuring | No destructuring in Phase B. | Whenever multi-return destructuring lands. |

## What's missing today

- No `for`, `in`, `break`, `continue` keywords in the tokenizer.
- No `..` / `..=` range operators.
- No `ForRangeStatement`, `BreakStatement`, `ContinueStatement` AST nodes.
- No CFG in the analyzer — every pass walks the AST directly. Without a CFG, definite-assignment and return-coverage are impractical.
- Shadowing today rejects only same-scope duplicates per `compiler-status.md`. Cross-scope shadowing slips through.
- Codegen still calls `println` for some error paths (Phase 7 pending work).
- Codegen has no fail-closed guards on multi-return, error-typed signatures, or `string`/`char` in user positions.

## Decisions

1. **Range form is the only `for` shape in Phase B.** `for i in lo..hi { ... }` and `for i in lo..=hi { ... }`. Bounds must be integer expressions with identical type. Loop variable is a fresh `const` binding scoped to the body — not user-reassignable, not user-shadowable from inside.
2. **Range bounds may use any integer type from Phase A.** Most idiomatic uses are `int32` or `int64`; the analyzer permits any `IsInteger` operand. Iteration over the high boundary uses the Phase A trap helpers (the loop's increment traps on overflow at the top end).
3. **CFG is per-function, computed once during analysis.** Live in `internal/semantics/cfg.go`. Each node is a basic block of straight-line statements; edges carry edge kinds: `Unconditional`, `CondTrue`, `CondFalse`, `Break`, `Continue`, `Return`, `Diverge` (panic/process.exit/unreachable when those land). Loop nodes know their continue target (loop head) and break target (loop exit).
4. **Definite-assignment is a forward dataflow over the CFG.** Each binding has a per-program-point lattice value: `Live` (definitely assigned), `Maybe` (assigned on some paths into this point, not others), `Unassigned` (definitely not). Reads at `Maybe` or `Unassigned` are errors. The lattice generalizes for Phase F (move-state) and Phase C (fallible-pending-state) — design it as a reusable lattice machinery.
5. **Return-coverage is a backward reachability check.** On non-`void` functions, every CFG exit must terminate in a return or a diverging terminator. The check is "no exit edge from a CFG sink that isn't a return-edge or a diverge-edge."
6. **Shadowing rule: walk the scope chain on each new declaration.** Adding a `let`/`const`/parameter name `n` requires that no enclosing scope has a visible binding named `n`. Parameters shadowing file-scope names *are* permitted because parameters live in a freshly-opened function scope and file-scope names are still reachable through fully-qualified module paths (post-Phase I). This last exemption is small and worth calling out in the diagnostic.
7. **`break`/`continue` are CFG terminators.** They edge to the loop exit / loop head respectively. Outside a loop, they're a structured error caught at AST-walk time.
8. **Phase 7 codegen pending work lands here.** Replace `println` error reports in `codegen` with `*ErrorBag` calls. Add fail-closed guards for multi-return signatures, error-typed signatures, and `string`/`char` in user positions. (These guards live until Phase C resolves error-typed signatures and the string family arrives.)
9. **Range bound evaluation is once per loop.** Both bounds are evaluated at loop entry, stored in fresh temps, and never re-read inside the loop. This matches the natural read of `for i in 0..n` (n shouldn't be re-read if mutated inside).

## Tokenizer changes

- New keywords: `for`, `in`, `break`, `continue`.
- New operators: `Op_DotDot` (`..`), `Op_DotDotEq` (`..=`).
- Lookahead disambiguates `.` (field/member), `..` (range), `..=` (inclusive range), `...` (Phase D ellipsis).

## Parser changes

- New AST nodes:
  ```go
  type ForRangeStatement struct {
      Variable   string
      Start, End Expression
      Inclusive  bool
      Body       *BlockStatement
      Position   Position
  }
  type BreakStatement    struct { Position Position }
  type ContinueStatement struct { Position Position }
  ```
- `VariableDeclarationStatement` grows an optional-initializer form: `let name: T;` is now legal at parse time. The current parser only accepts initialized vars; relax that.
- Range expression is *only* legal as the iterator-expression slot in a `for`. A bare `lo..hi` elsewhere is a structured error — no general range type for Phase B.

## Semantic analyzer changes

[internal/semantics/](../../../internal/semantics/) gains:

- `internal/semantics/cfg.go`: CFG builder. Input: a function's AST. Output: a `CFG` with basic blocks and labeled edges.
- `internal/semantics/dataflow.go`: a small reusable forward-dataflow framework. Lattice values are interface-typed; transfer functions and joins are user-supplied. Used for definite-assignment now; reused by Phase F (move) and Phase C (fallible-pending).
- Definite-assignment pass: visits every read; if the binding's at-point state isn't `Live`, emit "binding `x` may be uninitialized at this read" with the read position and one example unassigned path.
- Return-coverage pass: backward reachability from CFG sinks to return / diverge edges; non-void functions with any sink not terminated by such an edge get "function `f` may end without returning a value." The diagnostic includes the line of the last statement on the offending path.
- Shadowing check: on each new declaration, walk the scope chain. If a visible binding shares the name, emit "binding `x` shadows outer-scope `x` declared at <pos>" — with the file-scope-shadowed-by-parameter exemption.
- `for` range typing:
  - Both bounds must be integer; bounds must agree; loop variable is `const` of the agreed type.
  - Loop body opens a new scope with the loop variable bound and a `LoopContext` recorded so `break`/`continue` know they're in a loop.
- `break`/`continue` outside loop = error.

## Codegen changes

- `for i in lo..hi { ... }` lowers to:
  ```c
  /* both bounds evaluated once */
  const T __start = <lo>;
  const T __end   = <hi>;
  for (T i = __start; i < __end; i = delta_rt_add_T(i, 1, __FILE__, __LINE__)) {
      ...
  }
  ```
  (`<=` for `..=`.) The increment goes through the Phase A trap helper so the increment itself traps on overflow at the top end (e.g. `for i in 0..int32_MAX+1` traps at the boundary, not silently wraps).
- `break` → C `break;`. `continue` → C `continue;`.
- Definite-assignment doesn't affect emission — the analyzer has already rejected unsound programs.
- `let name: T;` with no initializer lowers to `T name;` (uninitialized in C; safe because the analyzer guarantees no read precedes assignment).
- Phase 7 cleanup:
  - `internal/codegen/emit.go` and `internal/codegen/emitter.go` get a `*diagnostics.ErrorBag` parameter threaded through every error path. The current `println` calls become `bag.Add(...)` with proper `SourceError` values.
  - Fail-closed guards: when codegen encounters a multi-return function, an error-typed signature, or a `string`/`char` in a user-facing position, it emits "Phase B: not yet supported, planned for <Phase C / later>" and fails the build pre-clang.

## Testing strategy

New fixtures under `test-source/tests/codegen/control_flow/`:

**`for` loops (5)**
- `for_range_ok` — sum 1..=10, exit code 55.
- `for_range_exclusive_ok` — sum 0..10, exit 45.
- `for_int64_range_ok` — wide range, large sum.
- `for_high_end_trap` — `for i in 0..int32_MAX+1` should trap on increment overflow. `expect: trap`.
- `for_bounds_type_mismatch_err` — `for i in 0..int64(5)` rejected.

**`break` / `continue` (3)**
- `break_early_ok` — break out of a loop, observe partial sum.
- `continue_skip_ok` — sum only even numbers.
- `break_outside_loop_err` — `break` at top level rejected.

**Definite assignment (5)**
- `def_assign_simple_ok` — `let x: int32; x = 5; return x;`.
- `def_assign_branch_ok` — both branches assign.
- `def_assign_branch_err` — only one branch assigns; read after.
- `def_assign_loop_ok` — assigned before loop, used after.
- `def_assign_loop_err` — assigned inside loop only, used after.

**Return coverage (4)**
- `return_cov_ok` — every path returns.
- `return_cov_missing_err` — non-void function falls through.
- `return_cov_via_panic_ok` (Phase B stretch — see below) — diverging branch is a `panic(...)`.
- `return_cov_void_ok` — void function may omit returns.

**Shadowing (3)**
- `shadow_cross_scope_err` — inner `let x` while outer `x` visible.
- `shadow_parameter_ok` — parameter shadows file-scope const (allowed exemption).
- `shadow_same_scope_err` — duplicate at same scope (already covered in v0; regression-check).

**Phase 7 cleanup (2)**
- `codegen_multi_return_err` — multi-return signature, expect codegen-stage diagnostic.
- `codegen_string_user_err` — `let x: string = ...;`, expect codegen-stage diagnostic.

All Phase A + Phase D + Phase I + Phase J fixtures continue to pass.

## Stage-by-stage implementation order

1. Tokenizer + parser for the new keywords, range operator, optional-initializer `let`, `break`/`continue` nodes.
2. CFG builder. Land with unit tests on synthetic ASTs (the CFG is reusable; test it standalone).
3. Reusable dataflow framework.
4. Definite-assignment pass on top of the framework.
5. Return-coverage pass.
6. Shadowing check.
7. Codegen for `for`, `break`, `continue`, optional-initializer `let`.
8. Phase 7 cleanup: thread `*ErrorBag` through codegen; replace `println` calls.
9. Phase 7 fail-closed guards in codegen.
10. Stretch: `panic(msg: cstringview)` intrinsic — see below.
11. Fixture suite.

The CFG builder (step 2) is the structural piece; the rest are passes layered on top.

## Stretch within Phase B: `panic` / `process.exit` / `unreachable`

The Phase A runtime preamble already defines `delta_rt_panic`. Exposing `panic(msg: cstringview): void` to users is small:

- Tokenizer: no change (treat `panic` as an identifier reserved by the analyzer).
- Analyzer: predeclare `panic`, `process_exit`, and `unreachable` as built-in `SymbolFunction` values with signatures and a `Divergent: true` flag.
- CFG: a call to a `Divergent` function adds a diverge edge from the current basic block, not a fall-through edge. This makes return-coverage accept paths terminated by `panic(...)`.
- Codegen: each intrinsic lowers to its runtime helper (`delta_rt_panic`, `exit`, `abort` for `unreachable` with a debug message).

**Recommendation:** land `panic` in Phase B because return-coverage needs the diverge concept anyway. Defer `process.exit` and `unreachable` unless cheap.

## Risks and open questions

- **CFG construction correctness.** The CFG is the backbone for three later phases (C, F, possibly E). Get the merge / loop / break semantics right; write a fuzz-style unit test that constructs random nested CFGs and asserts standard properties (every node reachable from entry, every sink reachable from non-diverging exits, etc.).
- **`let x: T;` and the future field/object syntax.** Spec defines definite assignment to extend to fields once object literals arrive. Phase B's lattice is per-binding; the field extension reshapes the lattice. Build the lattice with future field-path support in mind (a path is `binding.field.field…`, not just `binding`) — but don't implement the field case in Phase B.
- **Range increment trap interaction.** The Phase A trap helper for `+` requires a `__FILE__`/`__LINE__` argument. For a synthesized `for i = i+1`, what source position do we use? Decision: the increment is attributed to the `for` token itself — the diagnostic reads "panic at for_high_end_trap.delta:3: arithmetic overflow in for-loop increment" which is unambiguous.
- **`for` over unsigned ranges.** `for i in 0..uint32_MAX+1` would overflow the bound type. The trap fires at bound computation, before the loop starts. Verify with a fixture.
- **Loop variable shadowing.** `for i in ...` opens a new scope with `i` bound. If the enclosing scope has an `i`, the shadowing rule kicks in. The for-loop variable is treated like any other declaration — shadowing rejects.
- **Phase 7 cleanup risk.** Threading `*ErrorBag` through codegen touches every emission site. Mechanical, but error-prone. Land as a separate PR if possible.

## Definition of done

- All Phase B fixtures pass with their declared expectations.
- All earlier-phase fixtures continue to pass.
- The analyzer rejects every program that reads an uninitialized `let`, omits a return on a non-void path, or shadows across scopes — with diagnostics that include the position of the offending construct and the position of the original (for shadowing).
- Codegen emits no `println`; every error path goes through `*ErrorBag`.
- Codegen fail-closed: any analyzer-accepted-but-codegen-unhandled construct produces a structured diagnostic naming the construct, the planned home phase, and the source position.
- Phase C can begin: the CFG + dataflow framework are stable enough for fallible-flow analysis to layer on.
