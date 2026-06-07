# Plan: Phase B — Control Flow & Flow Analysis (v0.5)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phases **I, D, J, A** landed.
Successor: Phase C consumes the CFG infrastructure from Phase B for fallible-flow analysis; Phase F extends the same CFG for move-state tracking.
Spec basis: [spec-sections/03-basic-syntax-and-variable-bindings.md](../../spec-sections/03-basic-syntax-and-variable-bindings.md) §3 (especially §3.4 per-case scoping and shadowing), [spec-sections/06-other-primitive-types.md](../../spec-sections/06-other-primitive-types.md) (exit-path terminators), [main-spec.md](../../main-spec.md) §46 (control flow) and §31 (no fall-through, case scoping rules — value `switch` inherits these), [compiler-status.md](../../compiler-status.md) "pending" list.

## Goal

Bring the control-flow surface and flow analysis up to spec: C-style counted `for`, value `switch`, `break`/`continue`, postfix `++`/`--`, definite-assignment analysis, return-coverage analysis, and cross-scope shadowing rejection. Also land the pending Phase 7 codegen hygiene work from `compiler-status.md` (structured codegen diagnostics, fail-closed guards) so codegen exits its prototype state.

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

function classify(n: int32): int32 {
    switch (n) {
        case 0:        { return 0; }
        case 1, 2, 3:  { return 1; }
        case -1:       { return -1; }
        default:       { return 2; }
    }
}

function main(): int32 {
    for (let i: int32 = 1; i <= 5; i++) {
        info("gcd",      gcd(int64(i) * 12, 18));
        info("classify", int64(classify(i)));
    }
    return 0;
}
```

…compiles. The analyzer rejects programs that read an uninitialized `let`, omit a return on a non-`void` path, shadow an outer binding, omit `default` from a `switch`, or repeat a `case` label.

## In-scope language surface

- `for (init; cond; step) { ... }` C-style counted loop, matching the spec §46 example.
  - `init` is a `let`/`const` declaration or an expression statement, or empty.
  - `cond` is optional; when present it must type as `bool`. An empty `cond` loops forever (equivalent to `while (true)`).
  - `step` is an expression statement, or empty.
  - Bindings declared in `init` are scoped to `init`/`cond`/`step`/body and released at loop exit.
- `switch (expr) { case L1, L2: { ... } ... default: { ... } }` value switch.
  - Scrutinee must be an integer type or `char`.
  - Each `case` lists one or more comma-separated literal labels; each case body is a required braced block, opens its own scope per §3.4, and has no fall-through.
  - `default` is required.
  - `break`/`continue` inside a switch target the nearest enclosing loop (not the switch); see Decision 7.
- Postfix `i++` and `i--` on mutable integer bindings. The expression's value is the operand's pre-update value (standard C postfix semantics). Increment/decrement go through the Phase A trap helpers, so overflow at the type boundary traps.
- `break` and `continue` statements inside loops.
- `let name: T;` (no initializer) with definite-assignment tracked across the CFG.
- Return-coverage analysis on non-`void` functions: every CFG exit must end in `return`, `panic`, or one of the other diverging terminators.
- Cross-scope shadowing rejection per §3.4 — inner-scope `let`/`const` may not name an outer-scope visible binding.
- Codegen hygiene: `*diagnostics.ErrorBag` plumbed through `codegen.Emit`; fail-closed guards on every analyzer-accepted-but-codegen-unhandled construct.

## Explicitly out of scope for Phase B

| Feature | Reason | Eventual home |
|---|---|---|
| `for...of` over iterators / collections | Iterator protocol not yet specified; no collection types exist. | Post-v0.5, after the iterator protocol and arrays/slices land. |
| Range expressions (`a..b`, `a..=b`) | Tied to the iterator protocol decision; see above. | Same as `for...of`. |
| Prefix `++i` / `--i` | Postfix covers the spec §46 example and the for-step use case. Prefix's "return new value" semantics adds a second AST shape and type rule for marginal expressiveness. | Add only if real code demands it. || `switch type` (variant dispatch) | Requires tagged unions, which are post-MVP per §53. | Post-v0.5, with tagged unions. |
| `switch` over strings, enums, floats | No string family, no enums, and floats are an equality-on-NaN footgun. | Strings/enums: with their respective types. Floats: never. |
| Range labels (`case 1..10:`) and const-expr labels (`case SOME_CONST:`) | Range syntax deferred; no const-folding yet. AST is forward-compatible. | When ranges or const-eval land. |
| `check` blocks (`check { ... }`) | Phase C owns the error model. The CFG hooks for fallible flow land here. | Phase C. |
| User-callable `panic(msg)` / `process.exit(code)` / `unreachable()` | The trap helpers from Phase A already invoke an internal panic; exposing the user-facing intrinsics is a small additional surface. **Stretch goal within Phase B** — see below. | Phase B (stretch) or Phase C. |
| Definite assignment through pattern destructuring | No destructuring in Phase B. | Whenever multi-return destructuring lands. |

## What's missing today

- No `for`, `break`, `continue`, `switch`, `case`, `default` keywords in the tokenizer.
- No `++` / `--` operator tokens.
- No `ForStatement`, `BreakStatement`, `ContinueStatement`, `SwitchStatement`, `SwitchCase` AST nodes; no postfix-unary AST shape.
- No CFG in the analyzer — every pass walks the AST directly. Without a CFG, definite-assignment and return-coverage are impractical.
- Shadowing today rejects only same-scope duplicates per `compiler-status.md`. Cross-scope shadowing slips through.
- Codegen still calls `println` for some error paths (Phase 7 pending work).
- Codegen has no fail-closed guards on multi-return, error-typed signatures, or `string`/`char` in user positions.

## Decisions

1. **C-style `for (init; cond; step) { body }` is the only `for` shape in Phase B.** `init` is a `let`/`const` declaration, an expression statement, or empty. `cond` is an optional `bool` expression; an empty `cond` loops forever (equivalent to `while (true)`). `step` is an expression statement or empty. The loop scope opens at `init` and closes at loop exit, surrounding `cond`, `step`, and the body.
2. **C-style evaluation order matches C exactly.** `init` runs once at loop entry. `cond` runs before every iteration including the first; iteration ends when `cond` is false. `step` runs after each body execution, before the next `cond` evaluation. No Delta-specific rule needed — users get what they expect.
3. **Postfix `++` and `--` only.** Operand must be a place expression resolving to a mutable integer binding (`let`, not `const`). The expression value is the pre-update value. Increment/decrement lower through the Phase A trap helpers, so overflow at `T::MAX` traps. Prefix forms deferred.
4. **Value `switch` scrutinee must be an integer type or `char`.** `bool` (use `if`), float (NaN equality footgun), and types not yet specified (`string`, enums) are rejected with type-specific diagnostics. Allowing only integer-like scrutinees keeps the C lowering trivial and matches what users expect from C-family `switch`.
5. **Case labels are one or more literal expressions, comma-separated.** Phase B accepts integer literals and character literals; negative integer literals are modeled as `UnaryExpression{Operator: "-", ...}` over the existing literal node, so the parser needs no new "negative literal" path. Labels must type-check against the scrutinee type. Range labels and const-expr labels are deferred (the AST is forward-compatible).
6. **`default` is required; no fall-through; each case body is a braced block.** §31's rules for `switch type` (no fall-through, per-case braced scope per §3.4) carry over to value `switch`. Value switch over integers/chars can't be exhaustive, so `default` is mandatory — the analyzer rejects a switch without one. Duplicate case labels (within a switch, across all cases) are a structured error with both positions.
7. **`break` and `continue` are transparent to `switch`.** Inside a `switch`, they target the nearest enclosing loop, not the switch. Because there is no fall-through, "breaking out of a case" has no meaning — the case body's closing brace already terminates the case. If the switch is not nested in a loop, `break`/`continue` inside it is the same "outside loop" error as anywhere else. Codegen accounts for this when lowering to C `switch` (see Codegen section).
8. **CFG is per-function, computed once during analysis.** Lives in `internal/semantics/cfg.go`. Each node is a basic block of straight-line statements; edges carry edge kinds: `Unconditional`, `CondTrue`, `CondFalse`, `SwitchCase` (carries the matched label set), `SwitchDefault`, `Break`, `Continue`, `Return`, `Diverge` (panic/process.exit/unreachable when those land). Loop nodes know their continue target (the for-step block, or loop head when there is no step) and break target (loop exit). Switch nodes record case-block entries and the post-switch join.
9. **Definite-assignment is a forward dataflow over the CFG.** Each binding has a per-program-point lattice value: `Live` (definitely assigned), `Maybe` (assigned on some paths into this point, not others), `Unassigned` (definitely not). Reads at `Maybe` or `Unassigned` are errors. The lattice generalizes for Phase F (move-state) and Phase C (fallible-pending-state) — design it as reusable lattice machinery.
10. **Return-coverage is a backward reachability check.** On non-`void` functions, every CFG exit must terminate in a return or a diverging terminator. The check is "no exit edge from a CFG sink that isn't a return-edge or a diverge-edge." A `switch` whose every case (including `default`) ends in return/diverge is a sink for the coverage check; this falls out naturally from the CFG shape. A `for` with an empty `cond` has no fall-through exit edge, so it is itself a diverging construct unless it contains a reachable `break`.
11. **Shadowing rule: walk the scope chain on each new declaration.** Adding a `let`/`const`/parameter name `n` requires that no enclosing scope has a visible binding named `n`. Parameters shadowing file-scope names *are* permitted because parameters live in a freshly-opened function scope and file-scope names are still reachable through fully-qualified module paths (post-Phase I). This last exemption is small and worth calling out in the diagnostic.
12. **`break`/`continue` are CFG terminators (for loops).** `continue` edges to the loop's step block (or the cond-test if no step); `break` edges to the loop exit. Outside a loop, they're a structured error caught at AST-walk time. Switch is transparent per Decision 7 — these statements bind to the nearest enclosing loop, skipping over any `switch` they're inside.
13. **For-loop induction variable participates in cross-scope shadowing.** `for (let i: int32 = 0; ...)` inside a function that already binds `i` is rejected per Decision 11 — the for-statement's scope is treated like any other.
14. **Phase 7 codegen pending work lands here.** Replace `println` error reports in `codegen` with `*ErrorBag` calls. Add fail-closed guards for multi-return signatures, error-typed signatures, and `string`/`char` in user positions. (These guards live until Phase C resolves error-typed signatures and the string family arrives.)

## Tokenizer changes

- New keywords: `for`, `break`, `continue`, `switch`, `case`, `default`.
- New operators: `Op_PlusPlus` (`++`), `Op_MinusMinus` (`--`).
- Lookahead disambiguates `+` (binary/unary plus) from `++` (increment); same for `-` / `--`.

## Parser changes

New AST nodes (embedded `Position` to match the existing convention in [internal/ast/types.go](../../../internal/ast/types.go)):

```go
type ForStatement struct {
    Position             // position of `for`
    Init Statement       // *VariableDeclarationStatement or *ExpressionStatement, may be nil
    Cond Expression      // required; analyzer enforces bool typing
    Step Expression      // expression evaluated for effect; may be nil
    Body *BlockStatement
}
func (ForStatement) statementNode() {}

type BreakStatement    struct { Position }
type ContinueStatement struct { Position }
func (BreakStatement)    statementNode() {}
func (ContinueStatement) statementNode() {}

type PostfixUnaryExpression struct {
    Position             // position of the `++` / `--` token
    Operand  Expression  // place expression
    Operator string      // "++" or "--"
}
func (PostfixUnaryExpression) expressionNode() {}

type SwitchStatement struct {
    Position                   // position of `switch`
    Scrutinee Expression
    Cases     []*SwitchCase    // ordered as written; every entry has len(Labels) >= 1
    Default   *SwitchCase      // required by analyzer; nil only when missing (analyzer errors)
}
func (SwitchStatement) statementNode() {}

type SwitchCase struct {
    Position             // position of `case` or `default`
    Labels []Expression  // nil iff this case is the Default
    Body   *BlockStatement
}
```

- `SwitchCase` is a plain struct, not a `Statement` — it never appears outside a `SwitchStatement`.
- `Default` is a separate field (not just an entry in `Cases` with `Labels == nil`) so the parser physically prevents "two defaults" and the analyzer/codegen don't have to scan.
- Labels are typed as `Expression`, not as a literal interface — the analyzer enforces "must be a literal of compatible type." This leaves the AST forward-compatible with future const-expr / range labels.
- `VariableDeclarationStatement` grows an optional-initializer form: `let name: T;` is now legal at parse time.
- The for-`init` slot accepts a single declaration or expression statement; no comma-separated init forms.
- Empty `cond` in `for` is permitted: the for-`cond` slot may be left empty, producing a loop that runs until a `break`/`return`. When present, `cond` must type as `bool`.
- Switch with no `default` parses successfully (so the analyzer can produce a position-rich diagnostic); the "default required" rule lives in the analyzer.

## Semantic analyzer changes

[internal/semantics/](../../../internal/semantics/) gains:

- `internal/semantics/cfg.go`: CFG builder. Input: a function's AST. Output: a `CFG` with basic blocks and labeled edges.
- `internal/semantics/dataflow.go`: a small reusable forward-dataflow framework. Lattice values are interface-typed; transfer functions and joins are user-supplied. Used for definite-assignment now; reused by Phase F (move) and Phase C (fallible-pending).
- Definite-assignment pass: visits every read; if the binding's at-point state isn't `Live`, emit "binding `x` may be uninitialized at this read" with the read position and one example unassigned path.
- Return-coverage pass: backward reachability from CFG sinks to return / diverge edges; non-void functions with any sink not terminated by such an edge get "function `f` may end without returning a value." The diagnostic includes the line of the last statement on the offending path.
- Shadowing check: on each new declaration, walk the scope chain. If a visible binding shares the name, emit "binding `x` shadows outer-scope `x` declared at <pos>" — with the file-scope-shadowed-by-parameter exemption.
- `for` statement typing:
  - Open a new scope for the for-statement before processing `init`.
  - If `init` declares a binding, register it in that scope; `cond`/`step`/body all see it.
  - `cond` must type as `bool`.
  - Loop body opens a nested scope. A `LoopContext` is recorded so `break`/`continue` know they're in a loop.
- `switch` statement typing:
  - Scrutinee must type as an integer or `char` — otherwise emit a type-specific diagnostic (`bool`: "use `if`"; float: "switch on a float is not allowed; equality on floats is unsafe"; other: "switch scrutinee must be an integer or `char`").
  - For each `case`, every label expression must be either an integer literal, a character literal, or a `UnaryExpression{"-", IntegerLiteral}` (only when the scrutinee is a signed integer). Labels are type-checked against the scrutinee type.
  - Collect all labels across all cases into a position-tagged set; duplicates produce "duplicate case label `<value>` (previous at <pos>)".
  - If `Default == nil`, emit "value `switch` requires a `default` case" at the `switch` keyword position.
  - Each case body opens a fresh nested scope.
  - A `SwitchContext` is *not* recorded for `break`/`continue` resolution — Decision 7 says they're transparent.
- `++` / `--` typing:
  - Operand must be a place expression (in Phase B: an identifier referring to a mutable binding).
  - The bound symbol must be a `let` (not `const`) of an integer type.
  - Result type equals operand type. Allowed as a statement (`i++;`) and as a sub-expression.
- `break`/`continue` outside loop = structured error.

## Codegen changes

- `for (init; cond; step) { body }` lowers to a brace-scoped `while` so `continue`'s skip-the-step pitfall is handled cleanly:
  ```c
  {
      <init>;
      while (<cond>) {
          <body — with `continue` rewritten to `goto __delta_for_step_N;` >
          __delta_for_step_N: ;
          <step>;
      }
  }
  ```
  The enclosing braces give the `init` binding its scope. The synthesized label keeps `continue` semantically correct (run `step` before re-testing `cond`). An empty `cond` lowers to `while (1)` — an unconditional loop.
- `break` (inside a for-body) → C `break;`. Inside a `switch` inside a for, this must lower to `goto __delta_loop_exit_N;` — a literal C `break;` would only exit the C `switch`, not the loop. Decision 7's "transparent switch" requires this rewrite.
- `i++` lowers to `i = delta_rt_add_T(i, 1, __FILE__, __LINE__)` and `i--` to the corresponding `sub_T` helper. When the expression's value is used (`let a = i++;`), capture the pre-update value in a fresh temp:
  ```c
  T __tmp_N = i;
  i = delta_rt_add_T(i, 1, __FILE__, __LINE__);
  T a = __tmp_N;
  ```
- `switch (expr) { ... }` lowers to a brace-scoped C `switch`:
  ```c
  {
      T __scrut_N = <expr>;
      switch (__scrut_N) {
          case L1: case L2: {
              <case-body-1 with break/continue rewritten per Decision 7>
          } break;
          case L3: {
              <case-body-2>
          } break;
          default: {
              <default-body>
          } break;
      }
  }
  ```
  - Multi-label cases share a single C-`switch` body, prefixed by all their labels.
  - Each case ends with a synthesized `break;` to suppress C fall-through (Delta has none).
  - The outer braces give the scrutinee temp its scope.
  - Inside the case bodies, any `break`/`continue` that targets an enclosing loop is rewritten to a `goto` per Decision 7.
- Definite-assignment doesn't affect emission — the analyzer has already rejected unsound programs.
- `let name: T;` with no initializer lowers to `T name;` (uninitialized in C; safe because the analyzer guarantees no read precedes assignment).
- Phase 7 cleanup:
  - `internal/codegen/emit.go` and `internal/codegen/emitter.go` get a `*diagnostics.ErrorBag` parameter threaded through every error path. The current `println` calls become `bag.Add(...)` with proper `SourceError` values.
  - Fail-closed guards: when codegen encounters a multi-return function, an error-typed signature, or a `string`/`char` in a user-facing position, it emits "Phase B: not yet supported, planned for <Phase C / later>" and fails the build pre-clang.

## Testing strategy

New fixtures under `test-source/tests/codegen/control_flow/`:

**`for` loops (7)**
- `for_basic_ok` — `for (let i: int32 = 1; i <= 10; i++)` summing to 55, exit code 55.
- `for_exclusive_ok` — `for (let i: int32 = 0; i < 10; i++)` summing to 45.
- `for_int64_ok` — wide loop over `int64`, large sum.
- `for_high_end_trap` — `for (let i: int32 = 0; i <= int32_MAX; i++)` traps on `i++` overflow at the top. `expect: trap`.
- `for_empty_step_ok` — `for (let i: int32 = 0; i < 5; )` with the body advancing `i`.
- `for_empty_init_ok` — `let i: int32 = 0; for (; i < 5; i++)` uses an outer-declared induction variable.
- `for_empty_cond_ok` — `for (let i: int32 = 0; ; i++)` with an empty `cond`; the body `break`s to terminate. `expect: pass`.

**`switch` (10)**
- `switch_basic_ok` — single-label cases, integer scrutinee, hits a non-default case.
- `switch_default_ok` — falls through to `default` when no case matches.
- `switch_multi_label_ok` — `case 1, 2, 3: { ... }` shared body, verify all three labels reach it.
- `switch_char_ok` — `switch (c)` with `case 'a':` / `case 'b':` / `default:`.
- `switch_negative_label_ok` — signed-int scrutinee with `case -1:`.
- `switch_no_default_err` — switch missing `default` rejected; diagnostic position is the `switch` keyword.
- `switch_duplicate_label_err` — same label in two cases rejected; diagnostic includes both positions.
- `switch_bool_scrutinee_err` — `switch (someBool) { ... }` rejected with "use `if`" hint.
- `switch_float_scrutinee_err` — `switch (someFloat)` rejected.
- `switch_break_targets_loop_ok` — `for (...) { switch (x) { case 1: { break; } default: { ... } } }` — verify the `break` exits the for-loop, not just the switch.

**`++` / `--` (4)**
- `incdec_basic_ok` — `let i = 0; i++; i++; i--; return i;` returns 1.
- `incdec_value_ok` — `let i: int32 = 0; let a: int32 = i++; return a + i;` returns 1 (postfix yields pre-update value).
- `incdec_const_err` — `const x: int32 = 0; x++;` rejected.
- `incdec_overflow_trap` — `let i: int32 = int32_MAX; i++;` traps.

**`break` / `continue` (3)**
- `break_early_ok` — break out of a loop, observe partial sum.
- `continue_skip_ok` — sum only even numbers; verifies `continue` still runs the for-step.
- `break_outside_loop_err` — `break` at top level rejected. (A `switch` at top level with `break` inside it is also rejected by the same rule — Decision 7.)

**Definite assignment (5)**
- `def_assign_simple_ok` — `let x: int32; x = 5; return x;`.
- `def_assign_branch_ok` — both branches assign.
- `def_assign_branch_err` — only one branch assigns; read after.
- `def_assign_loop_ok` — assigned before loop, used after.
- `def_assign_loop_err` — assigned inside loop only, used after.

**Return coverage (5)**
- `return_cov_ok` — every path returns.
- `return_cov_missing_err` — non-void function falls through.
- `return_cov_via_panic_ok` (Phase B stretch — see below) — diverging branch is a `panic(...)`.
- `return_cov_switch_ok` — every case (including default) ends in `return`; coverage accepts.
- `return_cov_void_ok` — void function may omit returns.

**Shadowing (4)**
- `shadow_cross_scope_err` — inner `let x` while outer `x` visible.
- `shadow_for_var_err` — `for (let i: int32 = 0; ...)` inside a function that already binds `i`.
- `shadow_parameter_ok` — parameter shadows file-scope const (allowed exemption).
- `shadow_same_scope_err` — duplicate at same scope (already covered in v0; regression-check).

**Phase 7 cleanup (2)**
- `codegen_multi_return_err` — multi-return signature, expect codegen-stage diagnostic.
- `codegen_string_user_err` — `let x: string = ...;`, expect codegen-stage diagnostic.

All Phase A + Phase D + Phase I + Phase J fixtures continue to pass.

## Stage-by-stage implementation order

1. Tokenizer: keywords `for`, `break`, `continue`, `switch`, `case`, `default`; operators `++`, `--`.
2. Parser: `ForStatement`, `BreakStatement`, `ContinueStatement`, `PostfixUnaryExpression`, `SwitchStatement`/`SwitchCase`, optional-initializer `let`.
3. CFG builder. Land with unit tests on synthetic ASTs (the CFG is reusable; test it standalone). Include switch's N-way branch and multi-label-shared-block shape.
4. Reusable dataflow framework.
5. Definite-assignment pass on top of the framework.
6. Return-coverage pass.
7. Shadowing check.
8. Analyzer typing: `for`, `++`/`--`, `break`/`continue`, optional-initializer `let`, `switch` (scrutinee type, label types, default-required, duplicate detection).
9. Codegen: `for` (with the `continue`-to-step label trick), `break` (with the loop-break-from-inside-switch goto), `++`/`--`, optional-initializer `let`, `switch` (multi-label C cases + synthesized `break;`).
10. Phase 7 cleanup: thread `*ErrorBag` through codegen; replace `println` calls.
11. Phase 7 fail-closed guards in codegen.
12. Stretch: `panic(msg: cstringview)` intrinsic — see below.
13. Fixture suite.

The CFG builder (step 3) is the structural piece; the rest are passes layered on top.

## Stretch within Phase B: `panic` / `process.exit` / `unreachable`

The Phase A runtime preamble already defines `delta_rt_panic`. Exposing `panic(msg: cstringview): void` to users is small:

- Tokenizer: no change (treat `panic` as an identifier reserved by the analyzer).
- Analyzer: predeclare `panic`, `process_exit`, and `unreachable` as built-in `SymbolFunction` values with signatures and a `Divergent: true` flag.
- CFG: a call to a `Divergent` function adds a diverge edge from the current basic block, not a fall-through edge. This makes return-coverage accept paths terminated by `panic(...)`.
- Codegen: each intrinsic lowers to its runtime helper (`delta_rt_panic`, `exit`, `abort` for `unreachable` with a debug message).

**Recommendation:** land `panic` in Phase B because return-coverage needs the diverge concept anyway. Defer `process.exit` and `unreachable` unless cheap.

## Risks and open questions

- **CFG construction correctness.** The CFG is the backbone for three later phases (C, F, possibly E). Get the merge / loop / break / continue-to-step / switch-N-way semantics right; write a fuzz-style unit test that constructs random nested CFGs and asserts standard properties (every node reachable from entry, every sink reachable from non-diverging exits, etc.).
- **`continue` and the for-step.** Because we desugar `for` to `while` with the step at the end of the loop body, a literal C `continue` would skip the step. Codegen rewrites `continue` inside a for-body to a jump to a synthesized label that precedes the step. The CFG already models this; codegen must respect it. Verified by `continue_skip_ok`.
- **`break` from inside a `switch` inside a loop.** Decision 7 makes `break` target the loop, but C's `break` inside a `switch` only exits the switch. Codegen detects "this `break` is in a switch but binds to an outer loop" and emits `goto __delta_loop_exit_N;` instead. Both the analyzer (binding `break` to the right `LoopContext`) and codegen (emitting the goto) must agree. Verified by `switch_break_targets_loop_ok`.
- **Multi-label case CFG edges.** Each case body is a single block in the CFG with multiple incoming `SwitchCase` edges (one per label). The CFG builder must produce this shape — not duplicate the body per label — so dataflow joins behave correctly.
- **Duplicate-label detection across label types.** When a signed scrutinee accepts both `case 1:` and `case -1:`, the analyzer normalizes labels to a canonical (typed) integer value before duplicate-checking. For `char`, the canonical form is the codepoint integer.
- **`let x: T;` and the future field/object syntax.** Spec defines definite assignment to extend to fields once object literals arrive. Phase B's lattice is per-binding; the field extension reshapes the lattice. Build the lattice with future field-path support in mind (a path is `binding.field.field…`, not just `binding`) — but don't implement the field case in Phase B.
- **`++` trap position.** The Phase A trap helper takes a `__FILE__`/`__LINE__`; for `i++` we attribute the trap to the `++` token's source position. Inside a for-step, that's still the user-written `++` — a clearer diagnostic than attributing the overflow to the `for` keyword.
- **`for` over unsigned bounds.** `for (let i: uint32 = 0; i <= uint32_MAX; i++)` traps on `i++` at the top, consistent with the trap helper's overflow behavior. Verify with a fixture.
- **For-loop induction variable shadowing.** `for (let i: int32 = ...)` opens a new scope. If the enclosing scope has a visible `i`, the shadowing rule rejects (Decision 13). Verified by `shadow_for_var_err`.
- **Phase 7 cleanup risk.** Threading `*ErrorBag` through codegen touches every emission site. Mechanical, but error-prone. Land as a separate PR if possible.

## Definition of done

- All Phase B fixtures pass with their declared expectations.
- All earlier-phase fixtures continue to pass.
- The analyzer rejects every program that reads an uninitialized `let`, omits a return on a non-void path, shadows across scopes, switches without a `default`, repeats a `case` label, or switches on an unsupported scrutinee type — with diagnostics that include the position of the offending construct and the position of the original (for shadowing / duplicate labels).
- Codegen emits no `println`; every error path goes through `*ErrorBag`.
- Codegen fail-closed: any analyzer-accepted-but-codegen-unhandled construct produces a structured diagnostic naming the construct, the planned home phase, and the source position.
- Phase C can begin: the CFG + dataflow framework are stable enough for fallible-flow analysis to layer on.
