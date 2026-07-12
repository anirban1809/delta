# CFG fixture suite

These fixtures define the required control-flow graph behavior for every
control-flow statement currently represented in `src/ast/types.ts`.

They use the repository's standard `tests.json` convention: a passing fixture
must be accepted and a failing fixture must produce the listed diagnostic.
The assertions are deliberately semantic rather than tied to basic-block IDs,
so the CFG builder is free to choose its own block numbering and layout.

The suite covers:

- straight-line blocks containing declarations, assignments, and expression
  statements;
- `if` joins, `if`/`else` joins, nested branches, and return-only branches;
- `while` and all C-style `for` forms, including loop back-edges;
- `break` and `continue` targets, including nested loops and a switch inside a
  loop;
- `switch` dispatch, multi-label cases, default paths, nested switches, and
  return-only switches;
- reachability after `return`, `break`, and `continue`;
- definite-assignment joins at branches and loops; and
- return coverage at a function's normal exit.

| AST node / flow construct | Fixtures |
| --- | --- |
| `VariableDeclarationStatement`, `AssignmentStatement`, `ExpressionStatement` | `straight_line_ok` |
| `IfStatement`, `BlockStatement`, `ReturnStatement` | `if_*`, `nested_if_join_ok`, `unreachable_after_return_err` |
| `WhileStatement` | `while_*` |
| `ForStatement` | `for_*`, `nested_for_break_ok`, `unreachable_after_break_err`, `unreachable_after_continue_err` |
| `BreakStatement`, `ContinueStatement` | `while_*`, `for_continue_targets_step_ok`, `nested_for_break_ok`, `switch_*_targets_loop_ok` |
| `SwitchStatement`, `SwitchCase`, `CaseBlockStatement` | `switch_*` |

Run only this suite with:

```sh
npm run build && node dist/run-tests.js cfg
```

The current AST encodes an empty `for` condition as the boolean literal
`true`, so `for_empty_condition_break_ok.delta` asserts the resulting
unconditional header edge rather than a missing-condition node.
