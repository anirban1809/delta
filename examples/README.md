# Delta examples — implementation reference

One file per roadmap feature. Implement them **in order**, taking each
feature end-to-end across the whole pipeline (parser → semantic analysis →
codegen → diagnostics → LSP) before starting the next.

Each file demonstrates valid syntax (`// OK`) and, where instructive, the
illegal cases the compiler must reject (`// ERROR: <expected diagnostic>`).
The `// ERROR` lines are commented out so the file as a whole is meant to
compile once the feature is done — uncomment them to drive your diagnostic
tests.

The semantic error messages each feature must produce are cataloged in
[`../docs/diagnostics-catalog.md`](../docs/diagnostics-catalog.md), keyed to the
same feature order — implement the `// ERROR:` cases against those.

Syntax is grounded in `docs/main-spec.md` / `docs/spec-sections/` and the
`docs/plans/goal-v0.5/` phase plans. Where the spec and the v0.5 phase plans
disagree (classes were dropped for `type` records; `i32` vs `int32`), these
examples follow the **v0.5 phase plans + the verbose `int32` naming of §5**.

## Milestone 1 — expressions & scalar types
| File | Feature | Key new stage work |
|------|---------|--------------------|
| `01-local-bindings.delta`        | `let`/`const` bindings        | name resolution, block scopes |
| `02-arithmetic-and-operators.delta` | binary/unary operators     | operator typing, expr-tree codegen |
| `03-primitive-types-and-casts.delta`| the 11 numeric types       | no-implicit-conversion, call-style casts |
| `04-type-inference.delta`        | inference of binding types    | literal defaulting, annotation agreement |
| `05-assignment-and-mutability.delta`| `=`, `+=`, `i++`, const     | binding-state tracking, `const` reassignment error |
| `06-trap-on-overflow.delta`      | checked arithmetic            | trap helpers, panic runtime |

## Milestone 2 — control flow
| File | Feature | Key new stage work |
|------|---------|--------------------|
| `07-control-flow.delta`          | `if`/`else`, `while`, `for`   | bool conditions, block scoping |
| `08-definite-assignment.delta`   | DA + return coverage          | CFG / dataflow framework |
| `09-switch.delta`                 | `switch`, `break`, `continue`| multi-label, no fall-through, required default |

## Milestone 3 — user-defined types
| File | Feature | Key new stage work |
|------|---------|--------------------|
| `10-record-types.delta`          | `type` records                | object-literal pinning, struct codegen, structural `==` |
| `11-error-model.delta`           | fallible fns, `as`/`check`     | tagged result-struct lowering |

## Milestone 4 — memory & ownership
| File | Feature | Key new stage work |
|------|---------|--------------------|
| `12-ownership-move-clone.delta`  | tiers, `move`, `clone`        | move-state lattice (reuses CFG) |
| `13-references-borrows.delta`    | `&T`, `edit &T`               | exclusivity / root-locking checks |
| `14-heap.delta`                   | `heap<T>`, `new`             | malloc/free lowering, auto-deref |
| `15-lifetimes.delta`             | `@lifetime(...)`              | compiler-generated lifetime inference |

## Milestone 5 — methods, modules, stdlib
| File | Feature | Key new stage work |
|------|---------|--------------------|
| `16-receiver-methods.delta`      | `function (r: &T) m()`        | `function (` lookahead, capability dispatch |
| `17-modules/`                     | `import` / `export`          | module graph, DAG/cycle check, name mangling |
| `18-stdlib-log.delta`            | `std/log`, `extern "c"`       | embedded stdlib, C shim linking |

## Generated C (codegen reference)
Each `.delta` file ends with a `/* === Generated C === */` block showing the
**illustrative** lowering. Per §2.3 the generated C is an internal IR — the exact
shape (name mangling, struct layout, helper names) is not stable; these blocks
show the *intent*, not a byte-exact target. Conventions used throughout:

- Real codegen interleaves `#line N "file.delta"` at every statement boundary
  (§2.8) so panics/debuggers point at `.delta` source. The blocks omit `#line`
  for readability — add it when you implement codegen.
- Type mapping: `int32`→`int32_t`, `int64`→`int64_t`, `uint8`→`uint8_t`,
  `float64`→`double`, `float32`→`float`, `bool`→`bool`, empty params→`(void)`.
- Trap-set ops lower to runtime helpers that panic: `delta_add_i32`, `delta_sub_i32`,
  `delta_mul_i32`, `delta_div_i32`, `delta_cast_i64_to_i32`, … (defined in feature 06).
- Records → `struct delta__<Name>`; fallible returns → a tagged
  `{ bool is_error; union { ok; err; }; }`; `heap<T>` → `T*` via `delta_rt_alloc`/
  `delta_rt_free`; `&T` → `const T*`, `edit &T` → `T*`; exports mangle to
  `delta__<module>__<name>`.

## Notes on cross-feature dependencies
- `move`/`clone` (12) are only *observable* on non-copyable types. In v0.5
  the only non-copyable record is one owning a `heap<T>` field, so file 12
  forward-references `heap<T>` from file 14. Implement the move *machinery*
  at step 12 but expect to write its real fixtures once heap lands.
- There is no `class`/`enum`/`interface` — `type` records + receiver methods
  are the v0.5 substitute. `unique type` is post-v0.5; records are unique
  only *by structure* (containing a unique field).
