# Plan: Delta AST Optimizer

Date drafted: 2026-07-18  
Status: proposed  
Scope: typed-AST and control-flow optimization before C emission, plus coordinated Clang optimization  
Primary implementation language: TypeScript

## 1. Goal

Build an optimization pipeline for Delta that follows the successful architectural ideas of LLVM:

- a pass manager rather than one monolithic optimizer;
- distinct module, function, and loop pass scopes;
- cached analyses with explicit invalidation;
- canonical forms that make later optimizations simpler;
- repeated cleanup passes where one transformation exposes another;
- stable, user-facing optimization levels instead of a hard-coded pass list;
- optimization remarks, IR dumps, and verification hooks;
- profile-guided and link-time optimization as later overlays.

The optimizer must make Delta applications faster and smaller without changing any language-observable behavior. It must preserve traps, evaluation order, the error channel, moves and drops, FFI effects, floating-point rules, and source locations.

Success means all of the following:

1. `-O0`, `-Og`, `-O1`, `-O2`, `-O3`, `-Os`, and `-Oz` have documented, deterministic behavior.
2. `-O2` is a safe default for release builds and provides a measurable improvement over `-O0` on representative Delta programs.
3. Every optimization pass has a stated legality contract, unit tests, and a verifier boundary.
4. The same program has the same externally observable behavior at every optimization level.
5. Delta-specific information is exploited before C emission, while Clang remains responsible for mature low-level and target-specific optimization.

This is not a plan to reimplement all of LLVM on the syntax tree. LLVM succeeds partly because it optimizes a canonical control-flow IR, not a source AST. Delta should keep a typed tree for language-aware transformations and add a small CFG/SSA-like optimizer IR for data-flow, loop, and interprocedural work.

## 2. Architectural decision

### 2.1 Optimize a checked copy, never the parser AST

The parsed AST in `src/ast/types.ts` is currently mutated with some semantic facts, such as resolved types, generic specializations, and operator type strings. The optimizer needs a clearer boundary.

Introduce two compiler-owned representations:

1. **Typed HIR** — a normalized, fully checked tree retaining Delta constructs and source locations.
2. **Delta Optimizer IR (DOIR)** — per-function basic blocks, explicit control flow, temporaries, and optional SSA values.

The source AST remains suitable for formatting, diagnostics, and the LSP. Semantic analysis produces HIR only after the program has passed type, ownership/lifetime, and error-state validation. Optimization transforms HIR or DOIR, not the source AST.

```text
.delta source
  -> tokenize + parse
  -> source AST
  -> name/type analysis
  -> ownership + lifetime analysis
  -> checked error-state analysis
  -> typed HIR normalization
  -> Delta optimizer
       HIR passes
       HIR -> DOIR
       CFG/SSA passes
       DOIR -> C-oriented HIR
  -> C emission
  -> Clang optimization and code generation
  -> linker / optional ThinLTO
```

Optimization runs after all correctness diagnostics. Optimizing earlier could incorrectly make an invalid program appear valid by deleting the code that should have produced a diagnostic.

### 2.2 Why two optimization representations

Typed HIR retains facts that are difficult to recover from C or generic low-level IR:

- a call is known to be a Delta function, conversion, clone, drop, or FFI call;
- a value's exact Delta type, ownership category, and generic arguments are known;
- error-channel paths are explicit;
- record, union, enum, static-array, spread, and receiver-method semantics remain visible;
- source spans can be carried through transformations.

DOIR supplies the structure needed for LLVM-style optimizations:

- explicit basic blocks and terminators;
- control-flow graph edges;
- def-use chains;
- dominance and loop forests;
- phi/block parameters at merge points;
- memory effects and alias classes;
- explicit checked operations such as `checked_add`, `checked_div`, and `bounds_check`.

Local constant folding belongs naturally on HIR. Sparse conditional constant propagation, global value numbering, loop-invariant code motion, and dead-store elimination belong on DOIR.

### 2.3 Continue using Clang as the target optimizer

Delta should optimize what Clang cannot reliably infer after lowering:

- ownership-driven clone/drop elimination;
- error-channel simplification;
- generic specialization decisions;
- Delta trap/check elimination using language-level range facts;
- union/tag simplification;
- source-level purity and FFI effects;
- aggregate/spread simplification before they turn into C memory operations.

Clang should retain responsibility for:

- instruction selection and register allocation;
- target-aware instruction combining;
- scheduling;
- machine-level common-subexpression elimination;
- autovectorization;
- target-specific loop transforms;
- machine-function merging and section placement;
- final link-time optimization.

The two optimizers are complementary. Delta should emit clear, optimizer-friendly C and pass the matching `-O` level to Clang.

## 3. Non-negotiable semantic contract

An optimization is legal only if it preserves the behavior below.

### 3.1 Traps and checked arithmetic

Delta arithmetic must not be lowered through undefined C behavior. Before enabling `-O1` or above, codegen must cover every operation that can be undefined in C:

- signed add, subtract, multiply, increment, decrement, and negation overflow;
- division or remainder by zero;
- signed `MIN / -1` and `MIN % -1`;
- shifts by a negative amount or by an amount greater than or equal to the width;
- signed left shifts that overflow or operate on an invalid value;
- narrowing conversions outside the target range;
- out-of-bounds indexing wherever Delta requires a runtime check.

Use explicit checked DOIR operations and lower them to non-undefined C, preferably Clang overflow builtins such as `__builtin_add_overflow`, `__builtin_sub_overflow`, and `__builtin_mul_overflow`, or carefully widened unsigned arithmetic. No generated expression may first perform an overflowing signed C operation and check afterward.

Check elimination is allowed only when range analysis proves the check cannot fail. A potentially trapping expression may not be hoisted, speculated, reordered across another visible effect, or removed unless its result and trap are both proven unobservable.

### 3.2 Evaluation order and effects

HIR normalization must define Delta's evaluation order explicitly. Passes must preserve ordering among:

- calls not proven `readnone` or `readonly`;
- FFI calls, which are effectful by default;
- panic/trap operations;
- writes and reads that may alias;
- allocation, clone, move, drop, and disposal;
- error-channel production and checking;
- volatile or atomic operations when introduced.

Unknown calls get the conservative effect set: may read memory, write memory, trap, allocate, retain references, and return an error.

### 3.3 Ownership and lifetime

The optimizer must preserve exactly-once destruction and use-after-move rules. A value may be scalar-replaced or promoted only when the ownership analysis proves that doing so preserves:

- the number and order of observable disposals;
- borrow validity;
- escape behavior visible through FFI;
- replacement-drop behavior on assignment;
- error-path cleanup;
- alias identity where identity is observable.

Clone and drop elimination requires a dedicated ownership proof; ordinary dead-code elimination must never remove them merely because their return value is unused.

### 3.4 Errors, panics, and diagnostics

The optimizer may simplify an error path only when it is unreachable under proven facts. It must not convert a fallible function to an infallible ABI unless all callers and exported-interface constraints permit it.

Compile-time diagnostics are produced before optimization. Runtime panics retain a useful source location. Newly synthesized instructions inherit the narrowest common source span of their inputs; inlining retains both call-site and callee location metadata.

### 3.5 Floating point

All standard levels preserve IEEE-sensitive behavior, including NaNs, infinities, signed zero, and the declared rounding model. Reassociation, reciprocal approximation, contraction, and other fast-math transforms are not enabled by `-O3`.

There is no `-Ofast` in the first implementation. If unsafe floating-point modes are ever added, they must use a separate explicit flag and a language-spec amendment rather than silently changing `-O3`.

## 4. Optimization levels

Optimization levels are a stable product contract. Individual pass membership may evolve, but the intent and safety/compile-time tradeoff of each level must remain stable.

| Level | Intent                               | Delta optimizer                                                                           | Clang                         | Typical use                                        |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| `-O0` | fastest compile, clearest debugging  | mandatory lowering and correctness canonicalization only                                  | `-O0`                         | debugging optimizer/codegen problems               |
| `-Og` | debuggable code with obvious cleanup | cheap local simplification; avoids transformations that heavily distort stepping          | `-Og -g`                      | normal development                                 |
| `-O1` | low-cost optimization                | local scalar/CFG optimization and proven check removal                                    | `-O1`                         | quick builds and CI                                |
| `-O2` | balanced release optimization        | full safe scalar, data-flow, moderate interprocedural, and loop pipeline                  | `-O2`                         | default release build                              |
| `-O3` | maximum runtime throughput           | aggressive inlining, specialization, loop transforms, and vectorization-enabling cleanup  | `-O3` plus ThinLTO by default | compute-heavy production builds                    |
| `-Os` | speed subject to code-size pressure  | based on `-O2`, with size-aware inlining and no growth-heavy transforms                   | `-Os`                         | constrained binaries with normal performance needs |
| `-Oz` | minimum practical binary size        | stronger size policy; disables most cloning, unrolling, and vectorization-enabling growth | `-Oz`                         | firmware and highly constrained deployments        |

### 4.1 `-O0`: correctness pipeline

`-O0` does not mean "skip lowering." It runs only mandatory passes:

1. validate checked HIR;
2. assign stable node/value IDs;
3. make evaluation order explicit;
4. lower surface sugar such as compound assignment and loop syntax;
5. make moves, clones, drops, checked arithmetic, bounds checks, and error edges explicit;
6. lower generics to required monomorphizations;
7. verify HIR/DOIR and emit C.

No user computation is folded merely for speed. Source structure and variables should remain recognizable. Clang receives `-O0`.

### 4.2 `-Og`: development pipeline

`-Og` adds transformations that normally improve the debugging experience by removing noise without radically changing control flow:

- literal constant folding;
- safe identity simplification (`x + 0`, `x * 1`) when traps and floating-point rules permit it;
- local copy propagation;
- unreachable-block deletion after a terminator;
- trivial branch and switch folding;
- removal of unused pure temporaries;
- removal of statically redundant checks;
- trivial aggregate forwarding.

Avoid inlining except for mandatory wrappers, loop unrolling, code motion across source statements, function cloning, and aggressive variable promotion. Emit full source metadata and pass `-Og -g` to Clang. `-O0 -g` remains the fallback when exact source stepping matters more than performance.

### 4.3 `-O1`: cheap optimization

`-O1` includes `-Og` and adds:

- expression canonicalization and instruction combining;
- local common-subexpression elimination;
- local dead-code and dead-store elimination;
- simple CFG merging and jump threading;
- block-local constant/copy propagation;
- promotion of non-address-taken locals;
- scalar replacement of small non-escaping records/arrays;
- range-based elimination of obviously safe conversion, divisor, shift, overflow, and bounds checks;
- switch canonicalization;
- trivial function inlining based on a strict no-growth budget;
- dead private function and file-constant removal.

The pipeline must remain close to linear time in function size and avoid expensive whole-program fixpoints.

### 4.4 `-O2`: default release optimization

`-O2` includes `-O1` and adds the main performance pipeline:

- sparse conditional constant propagation (SCCP);
- global value numbering and redundant-load elimination;
- dead-store elimination with alias analysis;
- partial redundancy elimination where compile-time cost is bounded;
- stronger value-range and known-bits propagation;
- function effect/attribute inference;
- bottom-up inlining with a balanced cost model;
- interprocedural constant and argument propagation;
- unused argument, return component, private global, and private function elimination;
- ownership-aware clone, retain, move, and drop elision;
- aggregate and spread fusion;
- error-channel path and result-shape simplification;
- loop canonicalization, induction-variable simplification, invariant check hoisting, LICM, strength reduction, and deletion of side-effect-free zero-trip/dead loops;
- loop rotation when it enables later simplification without excessive growth;
- tail-call-friendly return shaping;
- C emission attributes and qualifiers derived from proven effects and alias facts.

`-O2` is the optimization quality baseline. It must not use profile guesses or large code-growth transforms.

### 4.5 `-O3`: aggressive throughput

`-O3` includes `-O2` and adds transformations that may increase binary size or compile time:

- a larger, hotness-aware inlining budget;
- function cloning and constant-argument specialization;
- receiver/generic specialization when it removes dispatch or aggregate work;
- loop unswitching;
- bounded full or partial unrolling;
- loop distribution/fusion only with a proven cost-model win;
- stronger loop idiom recognition;
- versioning to move checks out of a hot loop when a preheader predicate proves the fast path;
- vectorization-enabling canonicalization and alias/noalias metadata;
- ThinLTO by default for cross-module visibility.

Most final vectorization should still be performed by Clang. Delta's task is to expose simple counted loops, non-aliasing facts, and explicit fast/slow paths without violating traps or ownership.

### 4.6 `-Os` and `-Oz`: size policies

`-Os` starts from `-O2` but:

- uses a smaller inline budget;
- avoids loop unrolling and function cloning unless total size is predicted to fall;
- prefers shared cold error/trap blocks;
- outlines repeated cold cleanup paths when profitable;
- avoids monomorphization variants that save time but duplicate substantial code;
- favors compact switch lowering hints.

`-Oz` applies a stronger policy:

- inline only when size-neutral or size-reducing;
- disable normal loop unrolling, unswitching, and growth-oriented vectorization preparation;
- aggressively merge identical private helpers and generic instantiations;
- outline repeated panic, disposal, and error paths;
- prefer compact runtime helpers over repeated inline checks;
- use ThinLTO only when measurement shows a net size win.

Size levels must still remove dead code and fold constants; smaller code generally benefits from scalar cleanup.

## 5. Pass and analysis framework

### 5.1 Pass units

Match passes to the smallest useful unit:

- **Project/module passes:** call graph, import visibility, global constants, dead symbols, generic deduplication.
- **CGSCC passes:** bottom-up attribute inference, recursion-aware inlining, argument propagation.
- **Function passes:** CFG simplification, SCCP, GVN, DCE, SROA, check elimination.
- **Loop passes:** LICM, induction variables, rotation, unswitching, unrolling.

Grouping several function passes inside a function pipeline improves locality and allows immediate cleanup. A module pipeline should not repeatedly rescan the whole project from inside a function pass.

### 5.2 Core interfaces

The exact TypeScript API may evolve, but the framework should express these concepts:

```ts
type PreservedAnalyses = ReadonlySet<AnalysisKey> | "all" | "none";

interface Pass<Unit> {
    readonly name: string;
    run(unit: Unit, analyses: AnalysisManager<Unit>, context: PassContext): PreservedAnalyses;
}

interface Analysis<Unit, Result> {
    readonly key: AnalysisKey;
    run(unit: Unit, context: AnalysisContext): Result;
}

interface PassContext {
    level: OptimizationLevel;
    sizeMode: "none" | "size" | "min-size";
    target: TargetInfo;
    remarks: RemarkSink;
    verifyEach: boolean;
}
```

The analysis manager computes results lazily, caches them, and invalidates everything not explicitly preserved by a transformation. Start conservatively: a mutating pass may return `none`. Add fine-grained preservation only after profiling shows analysis recomputation matters.

### 5.3 Required analyses

| Analysis                       | Scope                       | Primary consumers                                        |
| ------------------------------ | --------------------------- | -------------------------------------------------------- |
| Type and layout                | project/module/function     | all legality checks, SROA, ABI lowering                  |
| Effect summary                 | expression/function/project | DCE, CSE, LICM, inlining, error simplification           |
| Ownership/escape               | value/function/project      | clone/drop elision, SROA, stack promotion, noalias facts |
| CFG predecessors/successors    | function                    | all control-flow passes                                  |
| Dominator/post-dominator trees | function                    | SSA, GVN, LICM, check elimination                        |
| Def-use and liveness           | function                    | DCE, register promotion, copy propagation                |
| Alias/mod-ref                  | function/project            | load elimination, DSE, LICM                              |
| Value range/known bits         | function                    | trap, bounds, shift, conversion, and branch elimination  |
| Loop forest/trip count         | function/loop               | LICM, strength reduction, unrolling                      |
| Call graph and SCCs            | project                     | attributes, inlining, dead functions, specialization     |
| Cost model                     | function/call/loop          | inlining, outlining, unrolling, size levels              |
| Profile summary                | project/function/block      | PGO overlays and hot/cold decisions                      |

Analyses must distinguish **not proven** from **proven false**. Optimizations fail closed when proof is absent.

### 5.4 Effect model

Give every DOIR instruction a conservative effect summary composed from flags such as:

```text
reads-memory, writes-memory, allocates, frees, may-trap,
may-error, calls-unknown, captures-reference, volatile, atomic
```

Pure arithmetic without a possible trap has no effects. Checked arithmetic has `may-trap` until range analysis proves otherwise. Loads/stores carry an alias class. Calls use inferred summaries for private Delta functions and conservative summaries for public/FFI functions.

## 6. Pass catalogue

The catalogue is intentionally broader than the first implementation. Each pass is included only after its prerequisites and verifier support exist.

### 6.1 Mandatory normalization passes

| Pass                      | Purpose                                                                | Runs at    |
| ------------------------- | ---------------------------------------------------------------------- | ---------- |
| `AssignStableIds`         | Give declarations, blocks, and values deterministic identities         | all levels |
| `ResolveSpecializations`  | Materialize the required generic instantiations                        | all levels |
| `ExplicitEvaluationOrder` | Introduce temporaries so operand/call order is unambiguous             | all levels |
| `LowerSurfaceControlFlow` | Canonicalize `for`, `switch`, compound assignment, increment/decrement | all levels |
| `MakeOwnershipExplicit`   | Insert explicit move/borrow/clone/drop/dispose operations              | all levels |
| `MakeChecksExplicit`      | Represent arithmetic, conversion, bounds, divisor, and shift checks    | all levels |
| `MakeErrorEdgesExplicit`  | Make success/error successors and cleanup visible                      | all levels |
| `BuildCFG`                | Form basic blocks with one terminator each                             | all levels |
| `VerifyDOIR`              | Check typing, dominance, CFG, ownership, and effect invariants         | all levels |

### 6.2 Scalar and CFG passes

| Pass                  | Delta-specific legality notes                                                                                                                                | First level |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `ConstantFold`        | Use exact-width Delta arithmetic and produce a compile-time trap only where the language permits; never use JavaScript `number` for 64-bit integer reasoning | `-Og`       |
| `InstructionSimplify` | Identities must respect traps, NaN, signed zero, and evaluation effects                                                                                      | `-Og`       |
| `SimplifyCFG`         | Fold branches/switches, merge blocks, remove unreachable blocks, retain cleanup edges                                                                        | `-Og`       |
| `DeadCodeElimination` | Remove only effect-free, non-trapping instructions                                                                                                           | `-Og`       |
| `CopyPropagation`     | Preserve ownership category and do not duplicate moves                                                                                                       | `-Og`       |
| `PromoteLocals`       | SSA-promote non-address-taken locals; ownership-aware                                                                                                        | `-O1`       |
| `SROA`                | Split non-escaping records/static arrays when field ownership permits                                                                                        | `-O1`       |
| `LocalCSE`            | Require identical operands, types, checks, and effect-free operations                                                                                        | `-O1`       |
| `SCCP`                | Propagate constants and executable edges together                                                                                                            | `-O2`       |
| `GVN`                 | Use dominance, memory versioning, and trap equivalence                                                                                                       | `-O2`       |
| `DSE`                 | Never delete an ownership/disposal effect; require alias proof                                                                                               | `-O2`       |
| `JumpThreading`       | Duplicate only cheap blocks and preserve cleanup/error edges                                                                                                 | `-O1`       |
| `TailMerge`           | Share identical cold/error tails; especially useful for size modes                                                                                           | `-Os`       |

Run DCE and CFG simplification after SCCP, inlining, SROA, and loop transforms because those passes commonly expose dead definitions and blocks.

### 6.3 Delta safety-check passes

| Pass                        | Proof used                                                                   | First level       |
| --------------------------- | ---------------------------------------------------------------------------- | ----------------- |
| `RangeAnalysis`             | intervals plus known bits, widened safely with `bigint`                      | analysis at `-O1` |
| `EliminateOverflowChecks`   | result interval fits exact destination type                                  | `-O1`             |
| `EliminateDivisorChecks`    | divisor nonzero and signed `MIN / -1` impossible                             | `-O1`             |
| `EliminateShiftChecks`      | amount in `[0, bitWidth)` and operation value-safe                           | `-O1`             |
| `EliminateConversionChecks` | source range is contained by target range                                    | `-O1`             |
| `EliminateBoundsChecks`     | index range is inside every relevant static/dynamic extent                   | `-O1`             |
| `MergeDominatingChecks`     | a dominating equivalent check covers the use and operands are unchanged      | `-O2`             |
| `LoopCheckVersioning`       | one preheader condition proves all iterations safe; keep a checked slow path | `-O3`             |

When a check is removed, emit an optional optimization remark describing the proof. This makes safety-related optimization auditable.

### 6.4 Ownership and aggregate passes

| Pass                          | Purpose                                                                                            | First level |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ----------- |
| `ElideRedundantMoves`         | Remove representation-level moves that are semantic no-ops                                         | `-O1`       |
| `ElideCloneDropPairs`         | Remove a clone and its matched drop if no alias observes the extra ownership                       | `-O2`       |
| `SinkDrops`                   | Shorten resource lifetime only when disposal timing is unobservable                                | `-O2`       |
| `FuseReplacementDrop`         | Combine assignment cleanup with a proven ownership transfer                                        | `-O2`       |
| `AggregateForwarding`         | Forward fields through temporary records/arrays                                                    | `-Og`       |
| `FuseObjectSpreads`           | Build the final aggregate directly when source evaluation order remains intact                     | `-O2`       |
| `ScalarReplaceAggregate`      | Replace non-escaping aggregate with fields                                                         | `-O1`       |
| `StackPromoteNonEscapingHeap` | Optional future pass; legal only if allocation identity/failure/disposal timing are not observable | `-O3`       |

Heap-to-stack promotion is deliberately late. It requires a complete language decision about whether allocation failure, address identity, and deallocation timing are observable.

### 6.5 Error, union, and dispatch passes

| Pass                    | Purpose                                                                                         | First level                    |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| `SimplifyKnownResult`   | Remove an error branch for a call/result proven successful or always failing                    | `-O1`                          |
| `PruneErrorVariants`    | Narrow private result representations when whole-program facts allow it                         | `-O2`                          |
| `MergeErrorCleanup`     | Share identical cleanup/error tails                                                             | `-O2`, stronger at size levels |
| `FoldUnionTag`          | Fold tag tests when the active variant is known                                                 | `-O1`                          |
| `EliminateDeadPayload`  | Remove unused private union/result payload fields where ABI permits                             | `-O2`                          |
| `DirectReceiverCall`    | Resolve a receiver method to a direct function target                                           | `-O1`                          |
| `DevirtualizeClosedSet` | Replace closed-set dispatch with direct/speculated calls while retaining a fallback when needed | `-O3`                          |

Exported ABI shapes are not changed without an explicit whole-program/internalization mode.

### 6.6 Interprocedural passes

| Pass                           | Purpose                                                                  | First level                                                 |
| ------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `InferFunctionEffects`         | Infer purity, memory behavior, trapping, errors, capture, and allocation | `-O1` (cheap), fixpoint at `-O2`                            |
| `GlobalConstantPropagation`    | Propagate immutable module constants                                     | `-O1`                                                       |
| `DeadPrivateSymbolElimination` | Remove unreachable private functions/types/constants/instantiations      | `-O1`                                                       |
| `InlineTrivialFunctions`       | Inline wrappers/accessors under a strict budget                          | `-O1`                                                       |
| `InlineFunctions`              | Bottom-up, cost-model-driven inlining                                    | `-O2`                                                       |
| `ArgumentPropagation`          | Propagate constant arguments and unused parameters                       | `-O2`                                                       |
| `FunctionSpecialization`       | Clone for profitable constant/type arguments                             | `-O3`                                                       |
| `DeduplicateMonomorphizations` | Share equivalent generic instantiations                                  | `-Os`, also normal release where exact equivalence is cheap |
| `GlobalDCE`                    | Re-run after inlining/specialization                                     | `-O2`                                                       |

Recursive call-graph SCCs require bounded iteration. Inlining must never recursively explode; the cost model tracks depth and total project growth.

### 6.7 Loop passes

| Pass                        | Purpose                                                                  | First level |
| --------------------------- | ------------------------------------------------------------------------ | ----------- |
| `LoopSimplify`              | Preheader, dedicated exits, canonical latch                              | `-O2`       |
| `LCSSA`                     | Make values crossing loop boundaries explicit                            | `-O2`       |
| `InductionVariableSimplify` | Canonical induction variables and exit comparisons                       | `-O2`       |
| `LICM`                      | Hoist/sink invariant non-trapping operations with alias proof            | `-O2`       |
| `LoopStrengthReduce`        | Replace expensive induction expressions with cheaper forms               | `-O2`       |
| `LoopDelete`                | Delete loops proven finite and effect/trap free whose results are unused | `-O2`       |
| `LoopRotate`                | Expose a canonical latch/test shape                                      | `-O2`       |
| `LoopUnswitch`              | Move invariant branches outside at a controlled code-size cost           | `-O3`       |
| `LoopUnroll`                | Full/partial unroll with known trip count and cost budget                | `-O3`       |
| `LoopIdiomRecognize`        | Expose fill/copy/reduction shapes to generated C/Clang                   | `-O3`       |

LICM may not hoist a checked operation unless it preserves when and whether the trap occurs. It may hoist the proof/check into a preheader only if executing it there is behaviorally equivalent, or it must use a versioned fast path.

## 7. Proposed pass pipelines

Pass order is part of optimizer quality. Use named pipeline builders rather than scattering level checks through individual passes.

### 7.1 Common mandatory pipeline

```text
HIR verifier
-> stable IDs
-> specialization resolution
-> explicit evaluation order
-> ownership/check/error lowering
-> HIR verifier
-> build CFG/DOIR
-> DOIR verifier
```

### 7.2 `-O1` pipeline

```text
function-effect inference (cheap)
-> constant fold + instruction simplify
-> simplify CFG + DCE
-> promote locals + SROA
-> local CSE + copy propagation
-> range analysis + safety-check elimination
-> jump threading
-> simplify CFG + DCE
-> trivial inlining
-> global constant propagation + dead private symbols
-> simplify CFG + DCE
-> verifier
```

### 7.3 `-O2` pipeline

```text
O1 early scalar pipeline
-> call graph + SCC effect/escape inference
-> bottom-up inlining + argument propagation
-> SROA + promote locals
-> SCCP
-> simplify CFG + DCE
-> GVN + redundant load elimination
-> range analysis + merged check elimination
-> DSE
-> ownership/aggregate/error simplification
-> loop simplify + LCSSA
-> induction simplify + LICM + strength reduction + loop rotate/delete
-> instruction simplify + GVN + DCE
-> global DCE
-> verifier
```

### 7.4 `-O3` pipeline

```text
O2 pipeline with larger inline budget
-> function specialization + cleanup
-> loop unswitch/versioning
-> induction simplify + LICM
-> loop unroll/idiom recognition
-> SROA + GVN + SCCP + DCE
-> emit vectorization/noalias-friendly C
-> ThinLTO-enabled Clang -O3
-> verifier before emission
```

### 7.5 Fixed-point policy

Do not iterate the entire optimizer until no changes; that is unpredictable and can be very expensive. Use explicit, bounded cleanup groups:

- instruction simplify + DCE: at most 2 iterations;
- SCCP + CFG simplify + DCE: at most 2 iterations;
- post-inline scalar cleanup: once per inlining round, maximum 2 rounds;
- interprocedural attribute inference: to call-graph SCC convergence with a hard diagnostic/debug assertion on unexpected non-convergence.

Track whether each pass changed its unit so cleanup groups can stop early.

## 8. Clang and link-time integration

The current project compiler invokes Clang with `-std=c17` and no optimization flag. Add a single build profile that drives both Delta and Clang.

### 8.1 CLI and manifest

```bash
delta build --opt-level=0
delta build -Og
delta build -O2
delta build -O3 --lto=thin
delta build -Os
delta build -Oz
```

Proposed `delta.json` shape:

```json
{
    "profiles": {
        "dev": {
            "optLevel": "g",
            "debugInfo": "full",
            "lto": "off"
        },
        "release": {
            "optLevel": 2,
            "debugInfo": "line-tables",
            "lto": "thin"
        }
    }
}
```

CLI flags override the selected profile. Cache keys include optimization level, target, Delta compiler version, Clang version, LTO mode, and all semantics-affecting flags.

### 8.2 Flag mapping

| Delta level | Per-module Clang flags    | Link flags                               |
| ----------- | ------------------------- | ---------------------------------------- |
| `-O0`       | `-std=c17 -O0`            | none                                     |
| `-Og`       | `-std=c17 -Og -g`         | debug symbols                            |
| `-O1`       | `-std=c17 -O1`            | none by default                          |
| `-O2`       | `-std=c17 -O2`            | optional `-flto=thin` in release profile |
| `-O3`       | `-std=c17 -O3 -flto=thin` | `-flto=thin`                             |
| `-Os`       | `-std=c17 -Os`            | optional measured ThinLTO                |
| `-Oz`       | `-std=c17 -Oz`            | optional measured ThinLTO                |

Do not add `-ffast-math`, `-Ofast`, `-fno-strict-aliasing`, or flags that weaken Delta's semantic contract. Use generated C types and accesses that obey C aliasing rules. Any `restrict`, `const`, `pure`, `noinline`, `always_inline`, branch probability, or alignment annotation must be derived from a proven Delta fact.

### 8.3 ThinLTO

ThinLTO is the preferred cross-module strategy because Delta emits one C translation unit per source module. Introduce it after deterministic per-module builds and cache keys are implemented.

- Default: off for development, optional at `-O2`, on at `-O3`.
- Link with the same pinned Clang/LTO toolchain used for compilation.
- Cache ThinLTO artifacts by module content and compiler configuration.
- Measure both clean-build time and incremental-build time before making it the `-O2` release default.

### 8.4 Profile-guided optimization overlay

PGO is not another optimization level. It is an overlay on `-O2` or `-O3`:

```bash
delta build -O2 --pgo=generate
./build/app <representative-workload>
delta build -O2 --pgo=use:build/profiles/default.profdata
```

Use profile data for inline budgets, function/block layout, cold error outlining, specialization, unswitching, and unrolling. Reject stale profiles with an actionable warning keyed to source/build identity. Ship PGO only after the unprofiled pipeline is stable.

## 9. Observability and developer tooling

An optimizer is maintainable only when its decisions are inspectable.

Add these internal/developer options:

```text
--emit=typed-hir
--emit=doir
--emit=optimized-doir
--emit=c
--passes=<comma-separated-pipeline>
--print-before=<pass-or-all>
--print-after=<pass-or-all>
--verify-each
--opt-remarks[=<pass>]
--opt-remarks-missed[=<pass>]
--opt-remarks-output=<file>
--time-passes
```

Requirements:

- Dumps are deterministic and suitable for snapshot tests.
- Every pass has a stable name.
- Remarks identify the pass, source span, transformation, and reason.
- Missed remarks explain important failed proofs, such as "bounds check retained: index upper bound unknown."
- `--verify-each` runs structural, type, effect, dominance, and ownership verifiers after every transformation.
- Normal users see none of this unless requested.

## 10. Verification and testing strategy

### 10.1 Representation verifiers

HIR verifier:

- every identifier resolves to a stable declaration ID;
- every expression has one valid Delta type;
- generic arguments are concrete where required;
- source spans are valid;
- ownership/error annotations are complete.

DOIR verifier:

- every block has exactly one terminator;
- predecessor/successor lists agree;
- all uses are dominated by definitions, including block parameters/phi values;
- instruction operand/result types match;
- move-only values have legal use counts and paths;
- every owned value is disposed or transferred on every exit path;
- effect summaries are conservative;
- checked operations and cleanup/error edges are well formed;
- no dangling references remain after a pass deletes a value/block/function.

### 10.2 Pass tests

Each pass gets focused input/output fixtures:

- positive transform cases;
- near-miss cases that must not transform;
- trap-preservation cases;
- error-path cases;
- move/clone/drop cases;
- FFI/unknown-call barriers;
- float NaN/signed-zero cases;
- nested loop and irreducible-control-flow cases where applicable;
- 64-bit boundary values represented with `bigint`.

Prefer checking meaningful DOIR patterns over the entire dump when a full snapshot would be brittle.

### 10.3 Differential end-to-end tests

For every runnable program, build and run at all supported levels and compare:

- exit status;
- stdout and stderr bytes;
- panic versus success;
- panic category and source location where guaranteed;
- emitted external/FFI trace in instrumented tests;
- sanitizer results in compiler CI.

The baseline is `-O0` safe codegen, not JavaScript evaluation. Add a small reference interpreter later if it can share the exact checked-operation semantics without sharing optimizer code.

### 10.4 Generative and metamorphic tests

Generate small well-typed programs containing arithmetic boundaries, branches, loops, records, arrays, ownership transfers, errors, and calls. Compare every level with `-O0`. Useful metamorphic pairs include:

- a function versus its manually inlined equivalent;
- a loop versus a bounded unrolled equivalent;
- a constant versus the same value through local copies;
- a record temporary versus direct field construction;
- success/error paths with equivalent cleanup.

When a mismatch is found, automatically reduce the program and retain it as a regression fixture.

### 10.5 Backend safety testing

Run generated C under Clang sanitizers in CI where available:

- undefined behavior sanitizer;
- address sanitizer;
- memory/leak sanitizer where supported;
- thread sanitizer once concurrency exists.

Compile representative programs with multiple supported Clang versions during development, but release with the pinned toolchain.

### 10.6 Performance testing

Create `benchmarks/` with at least:

- numeric loops and reductions;
- nested static-array traversal;
- record construction/copy/update;
- generic containers and monomorphized calls;
- branch-heavy switch/union handling;
- fallible calls with hot success/cold error paths;
- ownership-heavy clone/move/drop workloads;
- multi-module call chains;
- code-size-oriented microapplications.

Track:

- wall-clock runtime and variance;
- peak memory;
- binary/text-section size;
- generated C size;
- Delta optimizer time by pass;
- Clang compile and link time;
- clean and incremental build time.

Do not accept a pass based on a single microbenchmark. Require a clear aggregate win or a documented niche win with no unacceptable regressions.

## 11. Implementation plan

### Phase 0 — Freeze semantics and make optimized C safe

Deliverables:

- document exact evaluation order, integer overflow, shift, division, conversion, bounds, panic, allocation, float, and disposal semantics;
- audit every C expression for undefined behavior;
- introduce safe helpers/builtins for all checked integer operations;
- fix signed `MIN / -1`, signed remainder, and shift edge cases;
- add `-O0` versus Clang `-O1/-O2/-O3` differential tests before the Delta optimizer exists;
- add build-profile parsing and forward the selected level to Clang only after the audit passes.

Exit gate: the existing unoptimized emitter produces behaviorally identical, sanitizer-clean binaries when its C is compiled at all Clang optimization levels.

### Phase 1 — Typed HIR and pass-manager foundation

Deliverables:

- add `src/optimizer/hir/` with stable IDs, resolved types, effects, ownership, and source metadata;
- make semantic analysis produce HIR without mutating the parser AST as the long-term target;
- implement generic `PassManager`, `AnalysisManager`, instrumentation, preserved analyses, and named pipelines;
- implement HIR verifier, deterministic printer, `--print-before/after`, and `--verify-each`;
- wire `OptimizationLevel` through CLI, manifest, compiler pipeline, emitter, Clang compile, and link steps.

Exit gate: all levels can run the mandatory pipeline and emit byte-deterministic equivalent C.

### Phase 2 — Useful AST/HIR optimizer (`-Og` and first `-O1`)

Deliverables:

- constant folding with exact-width integers and strict floats;
- instruction/identity simplification;
- branch and switch folding;
- local copy propagation;
- effect-aware dead temporary removal;
- aggregate forwarding;
- compile-time range analysis for straight-line expressions;
- divisor, shift, conversion, overflow, and static-bounds check elimination;
- optimization remarks and pass fixtures.

Exit gate: `-Og` and `-O1` beat `-O0` on generated C size/runtime in the starter benchmark suite without requiring CFG/SSA optimizations.

### Phase 3 — DOIR, CFG, and SSA scalar pipeline

Deliverables:

- add `src/optimizer/ir/` with functions, blocks, instructions, terminators, and explicit checked/ownership/error operations;
- CFG, dominator, post-dominator, def-use, liveness, and loop analyses;
- local promotion/SSA construction and destruction or direct C emission from SSA;
- SimplifyCFG, DCE, SROA, SCCP, GVN, DSE, and jump threading;
- DOIR verifier and deterministic dumps;
- bounded cleanup pipelines.

Exit gate: a stable `-O1` pipeline and the scalar half of `-O2`, with compile-time budgets enforced.

### Phase 4 — Delta-aware release optimization

Deliverables:

- ownership/escape and alias analyses;
- clone/drop/move simplification;
- aggregate/spread fusion;
- result/error-path and union/tag simplification;
- call graph and SCC effect inference;
- dead private symbol elimination;
- balanced bottom-up inlining and argument propagation;
- emitted C attributes only from proven facts.

Exit gate: `-O2` is suitable as the default release level and shows material wins on ownership-, error-, and generic-heavy benchmarks beyond compiling the same C with Clang `-O2` alone.

### Phase 5 — Loop optimization and `-O3`

Deliverables:

- loop simplify/LCSSA, trip-count and induction analyses;
- LICM, strength reduction, loop rotation/deletion;
- controlled unswitching, unrolling, and check versioning;
- specialization and aggressive inlining with project growth limits;
- Clang vectorization/noalias enablement;
- ThinLTO integration and cache support.

Exit gate: `-O3` wins on compute-heavy benchmarks without broad regressions in code size or compiler memory, and growth limits prevent pathological programs.

### Phase 6 — Size optimization

Deliverables:

- shared cost model with `size` and `min-size` policies;
- cold error/cleanup outlining;
- generic/function deduplication;
- tail merging and compact helper lowering;
- `-Os` and `-Oz` Clang/ThinLTO tuning based on measurements.

Exit gate: `-Os` is smaller than or equal to `-O2` across the size corpus, and `-Oz` is smaller than or equal to `-Os`, with documented exceptions treated as bugs or benchmark noise requiring investigation.

### Phase 7 — PGO and long-term tuning

Deliverables:

- profile generation/use workflow;
- hot/cold-aware inlining, outlining, layout, specialization, and loops;
- stale-profile detection;
- benchmark dashboard with optimizer-time and quality trends;
- optional pass-pipeline experimentation behind internal flags.

Exit gate: a representative trained workload shows a repeatable gain over unprofiled `-O2`/`-O3` and the workflow is reproducible.

## 12. Proposed source layout

```text
src/optimizer/
  levels.ts                 OptimizationLevel and pipeline builders
  pass.ts                   Pass/analysis interfaces and preserved analyses
  pass_manager.ts           scheduling, instrumentation, bounded groups
  remarks.ts                applied/missed optimization remarks
  cost_model.ts             speed/size/hotness policy
  hir/
    types.ts
    builder.ts
    verifier.ts
    printer.ts
    passes/
  ir/
    types.ts
    builder.ts
    verifier.ts
    printer.ts
    analyses/
    passes/
      scalar/
      cfg/
      ownership/
      errors/
      interprocedural/
      loops/
src/compiler/
  options.ts                profiles, CLI/manifest normalization
  pipeline.ts               source/LSP compile path
  project.ts                project optimization, C compile, LTO/link
```

Keep analysis and transformation code out of `src/ast/` and `src/codegen/`. The emitter consumes optimized HIR/DOIR and should not quietly perform optimizations of its own; emitter-local formatting decisions are fine, semantic rewrites are not.

## 13. Initial milestones and issue breakdown

The first useful delivery should be small enough to review:

1. **Optimizer options:** parse levels, profile selection, Clang flag mapping, cache identity.
2. **Safe C gate:** checked arithmetic/division/shift/conversion lowering and sanitizer suite.
3. **HIR contract:** IDs, resolved types, effects, ownership, source metadata, verifier/printer.
4. **Pass manager:** function/module managers, analysis cache, invalidation, instrumentation.
5. **Constant folding:** integers, booleans, comparisons, strict floats, trap tests.
6. **HIR CFG cleanup:** constant branches/switches, unreachable code, effect-aware DCE.
7. **Range checks:** prove/remove conversion, divisor, shift, overflow, and static-array checks.
8. **DOIR foundation:** blocks, terminators, checked operations, builder, verifier.
9. **SSA scalar core:** promotion, SCCP, CFG simplify, DCE, GVN, SROA, DSE.
10. **Delta-aware core:** ownership, errors, aggregate fusion, interprocedural effects.
11. **Release pipeline:** inliner, loops, ThinLTO, benchmarks, `-O2` default.
12. **Aggressive/size pipelines:** `-O3`, `-Os`, `-Oz`, growth and compile-time guards.

Each issue must state:

- IR scope and prerequisites;
- legality proof and preserved analyses;
- compile-time complexity expectation;
- positive and negative transform tests;
- differential/runtime tests;
- benchmark hypothesis;
- emitted optimization remark, if user-relevant.

## 14. Acceptance criteria

The optimizer project is complete enough for general use when:

- all documented levels are wired end-to-end and deterministic;
- `-O2` is the default release profile and `-Og` is the default development profile;
- safe arithmetic and checks remain correct under Clang `-O3` and ThinLTO;
- every transformation pass can run under `--verify-each` across the full test suite;
- differential tests pass across levels on every supported target/toolchain;
- the optimizer never deletes, duplicates, or reorders observable ownership/error/FFI effects;
- performance dashboards show no unexplained material regression;
- compile-time and memory growth have enforced budgets;
- optimization remarks can explain important applied and missed safety-check, inline, and loop decisions;
- generated C remains inspectable and free of undefined behavior;
- the language specification documents which behavior optimizations must preserve.

Suggested initial performance targets, to be revised after a real baseline exists:

- `-O1`: no more than 1.25x Delta front-end time versus `-O0` on the benchmark corpus;
- `-O2`: no more than 1.75x Delta front-end time versus `-O0`;
- `-O3`: no more than 3x Delta front-end time or 2x peak optimizer memory versus `-O2` without an explicit override;
- `-O2`: at least a 15% geomean runtime improvement over Clang `-O2` applied to unoptimized Delta C on Delta-specific workloads, or equivalent removal of ownership/error/check overhead;
- `-Oz`: at least a 10% geomean text-size reduction versus `-O2` on the size corpus.

Targets are guardrails, not promises. Measure first, retain only passes that earn their cost, and record intentional exceptions.

## 15. Risks and mitigations

| Risk                                                       | Mitigation                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Optimizing the syntax AST reaches a quality ceiling        | Introduce DOIR before advanced data-flow and loop work                                 |
| Clang exploits undefined behavior in generated C           | Complete Phase 0 before enabling optimized builds; use checked builtins and sanitizers |
| Ownership transforms cause double-free/leak/use-after-move | Explicit ownership IR, path verifier, effect-aware DCE, differential tests             |
| Pass order becomes fragile                                 | Named pipeline builders, canonical forms, bounded cleanup groups, pass fixtures        |
| Analysis cache returns stale facts                         | Conservative invalidation first, `--verify-each`, preserved-analysis tests             |
| Inlining/specialization explodes code                      | Per-call and project growth budgets; SCC recursion limits; size policy                 |
| Optimization breaks debugging                              | Separate `-Og`, retained source/inlining metadata, `-O0` escape hatch                  |
| Delta duplicates work Clang already does better            | Keep Delta passes language-aware and delegate target-specific work                     |
| Benchmarks encourage overfitting                           | Maintain varied application corpus, holdout programs, compile-time/size tracking       |
| ThinLTO hurts incremental builds                           | Keep it profile-controlled and content-address its cache                               |
| Public ABI changes under whole-program optimization        | Internalize only private symbols; preserve exported shapes by default                  |

## 16. Explicit non-goals

- Reimplementing LLVM's machine optimizer in TypeScript.
- Direct LLVM IR generation in this project phase.
- Unsafe integer or floating-point semantics hidden behind `-O3`.
- Optimizing invalid programs before semantic diagnostics.
- Treating generated C as a stable public ABI.
- Promising that every higher numeric level is faster for every program.
- Adding every listed pass before measurements demonstrate its value.
- Making optimizer output depend on hash-map iteration order, wall-clock time, or parallel scheduling.

## 17. LLVM concepts adopted—and deliberately not copied

Adopt:

- hierarchical pass managers;
- lazy analysis caching and explicit invalidation;
- canonicalization before specialized transforms;
- function/CGSCC/loop pipelines;
- SCCP followed by DCE;
- repeated instruction/CFG cleanup at deliberate points;
- optimization levels built by a central pipeline builder;
- remarks, pass timing, IR printing, and verification hooks.

Do not copy blindly:

- LLVM pass names do not imply that the same algorithm is legal on Delta HIR;
- `mem2reg`, GVN, LICM, and loop transforms belong after Delta has explicit CFG/SSA structure;
- LLVM assumes its own IR semantics, including poison/undefined-value rules that Delta need not adopt;
- LLVM's exact default pass sequence changes over time and is not Delta's compatibility contract;
- target-specific optimization remains Clang's job.

## 18. References

- [LLVM's Analysis and Transform Passes](https://llvm.org/docs/Passes.html) — high-level behavior of canonical LLVM passes such as `instcombine`, SCCP, SROA, `mem2reg`, `simplifycfg`, LICM, and loop unrolling.
- [Using LLVM's New Pass Manager](https://llvm.org/docs/NewPassManager.html) — analysis managers, pass nesting, adaptors, caching, invalidation, and default-pipeline construction.
- [Writing an LLVM New-PM Pass](https://llvm.org/docs/WritingAnLLVMNewPMPass.html) — pass structure and preserved-analysis contracts.
- [Clang command guide](https://clang.llvm.org/docs/CommandGuide/clang.html) — Clang optimization-level behavior.
- [Clang user manual](https://clang.llvm.org/docs/UsersManual.html) — optimization reports, LTO/PGO guidance, debug information, and undefined-behavior cautions.
- [Delta compilation pipeline specification](../spec-sections/02-compilation-pipeline.md) — C as internal IR, one translation unit per module, pinned Clang, and planned ThinLTO.
