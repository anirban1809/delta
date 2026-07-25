# Compiler Rule Architecture

Status: **Proposed.** No code changed yet. This document is the audit and the
migration design; each stage below is meant to land as its own reviewable change.

## Goal

Every compiler rule — one syntactic production, one semantic check, one lowering
decision — lives in its own file, registered in a table. Adding a rule becomes
*new file + one line in an index*. Changing a rule means opening exactly one
file, and the file name tells you which rule you are changing.

This is not cosmetic. Delta's stated north star is that the **feedback loop is
the product**: diagnostics quality, non-cascading errors, and the ability to
measure iterations-to-green. All three require that a rule be a thing you can
point at, name, test, and attach a stable code to. Today a rule is a paragraph
buried in a 400-line method, and that is the binding constraint.

---

## Part 1 — Current state

Measured against the tree at the time of writing.

### 1.1 `src/analysis/analyzer.ts` is 94% dead

`analyzer.ts:148–2075` — the whole `Analyzer` class, **1,928 lines** — is
unreachable. Nothing in `src/`, `main.ts`, or the test drivers constructs it.
Verified by deleting the class and running `tsc --noEmit`: zero errors.

Live surface is `analyzer.ts:43–147` only:

| Export | Consumers |
|---|---|
| `SymbolKind`, `Flow`, `BlockKind` | 16 files |
| `FunctionSignature`, `Symbol`, `PendingResult`, `BlockContext` | 16 files |

The dead class is a pre-refactor copy. It still holds
`analyzeVariableDeclarationStatement`, `analyzeSwitchStatement`,
`analyzeBinaryExpression`, `analyzeFunctionCallExpression`, `sizeOf`,
`getMaxIntegerValue`, `validateObjectLiteral` — all of which now exist in
**divergent** live form in `expression_analyzer.ts`, `type_analyzer.ts`, and
`statements/*`.

It also contains **66 `addError` call sites that can never fire.** Any search for
"where is the rule for X" — by a human, by grep, by LSP go-to-definition, by an
agent — has roughly even odds of landing in the corpse and editing it. This is
the single largest obstacle to the whole goal, and it is pure subtraction to fix.

### 1.2 `statements/` is the right shape, wired the wrong way

`src/analysis/statements/` already does one-file-per-statement-kind. Three things
stop it from scaling:

**Manual dependency injection.** `statements/statement.ts:36–89` is a 40-line
constructor threading `diagnostics`, `expressionAnalyzer`, `typeAnalyzer`,
`blockAnalyzer`, and a re-entrant `analyzeStatement` callback into each rule by
hand. Adding a rule means: declare a field, extend the constructor, add a switch
arm. Three edits to the one file the design was supposed to stop touching. The
`AnalyzeStatement` callback in `statement_context.ts` exists purely to break the
cycle this wiring creates.

**The dispatcher is itself a rule file.** Of its 458 lines, `statement.ts:173–458`
(**285 lines**) is the Phase C error-model implementation — `bindResult`,
`fallibleErrorTypes`, `isTrappingConversion`, `rejectUnboundFallible`,
`analyzeCheck`, `analyzeForward`, `discharge`, `analyzeReturnError`,
`blockDiverges`, `statementDiverges`. Actual dispatch is ~80 lines.

**Three kinds were never extracted**: `return_error_statement`,
`check_block_statement`, `forward_statement` — handled inline in the dispatcher,
which is why the error-model logic ended up there.

### 1.3 Parser: 260 lines of copied precedence rungs

`parser.ts:1328–1580` is ten near-identical methods that differ only in
*(operator set, next rung down)*:

| Rung | Operators |
|---|---|
| `parseLogicalOrExpression` | `\|\|` |
| `parseLogicalAndExpression` | `&&` |
| `parseBitwiseOrExpression` | `\|` |
| `parseBitwiseXorExpression` | `^` |
| `parseBitwiseAndExpression` | `&` |
| `parseEqualityExpression` | `==` `!=` |
| `parseRelationalExpression` | `<` `<=` `>` `>=` |
| `parseShiftExpression` | `<<` `>>` |
| `parseAdditiveExpression` | `+` `-` |
| `parseMultiplicativeExpression` | `*` `/` `%` |

Every body is the same loop building the same `binary_expression` node. Adding an
operator today means writing a new method and rethreading two neighbours. This is
a precedence *table*, not ten productions.

### 1.4 Functions that braid independent rules together

| Lines | Location |
|---|---|
| 436 | `expression_analyzer.ts:1237` `analyzeFunctionCallExpression` |
| 280 | `expression_analyzer.ts:607` `analyzeObjectLiteral` |
| 277 | `expression_analyzer.ts:1896` `analyzeMethodCall` |
| 248 | `parser.ts:2082` `parseSwitchStatement` |
| 223 | `expression_analyzer.ts:1673` `analyzeVariadicFunctionCall` |
| 202 | `parser.ts:3341` `parseDecls` |
| 197 | `declarations.ts:586` `analyzeFunctionDeclaration` |
| 193 | `expression_analyzer.ts:69` `inferType` |
| 184 | `statements/variable_declaration.ts:24` `analyze` |
| 183 | `parser.ts:2883` `parseTypeDeclaration` |

`analyzeFunctionCallExpression` alone carries namespace resolution, callability,
arity, borrow-aliasing (`edit &T` used twice), generic inference, interface-bound
checking, receiver-mutability witness checks, and conversion synthesis. Seven
rules with no reason to share a control-flow spine — and no way to test one
without constructing inputs that satisfy the other six.

### 1.5 The emitter has no seam at all

`src/codegen/emitter.ts` is 2,439 lines, one class, ~60 methods over ~24 fields of
shared mutable state. `emitExpression:1111` and `emitStatement:1615` are
kind-switches — structurally identical to the analyzer, so the same treatment
applies — but every method reaches into `this`, so **the split is blocked until
that state is named.** The state does decompose cleanly into three lifetimes:

| Lifetime | Fields |
|---|---|
| Module | `ast`, `moduleOptions`, `symbolModules`, `symbolSourceNames`, `externalLinkNames`, `newTypes`, `cloneTypes`, `sliceTypes`, `stringLiteralNames`, `stringLiteralBlocks`, `errorTags`, `guards`, `guardNames` |
| Function | `activeFunction`, `activeConcreteTypes`, `activeVariadicTypes`, `pendingOwnedParameters`, `resultCounter`, `ownershipCounter`, `replacementCounter` |
| Block | `indent`, `localScopes`, `ownershipScopes`, `controlFlowBoundaries`, `pendingResults` |

That three-tier split is the design. It is also why stage 4 is the risky one:
`AllocationTracker` (`emitter.ts:58`) is currently a no-op stub, and the ownership
scope stack is manipulated by `emitBlockStatement`, `emitLoopExit`, and
`emitFunctionDeclaration` in an order that is load-bearing but nowhere stated.

### 1.6 Diagnostics have no codes

`docs/diagnostics-catalog.md` defines **74 stable codes** (`E0101`…) and says
outright they are "for tests, docs, and `--explain`". The compiler emits **none**
of them. All **313** `addError` sites carry free text only:

| File | Sites |
|---|---|
| `expression_analyzer.ts` | 73 |
| `analyzer.ts` (dead) | 66 |
| `declarations.ts` | 52 |
| `parser.ts` | 47 |
| `statements/*` | 63 |
| other | 12 |

Consequences: tests assert on message substrings, so rewording a message breaks
the suite; `--explain E0213` cannot be built; and "did this program produce one
root-cause error or five cascading ones" is not measurable. Rule-per-file is the
natural fix, because the file *is* the rule and can own its code.

---

## Part 2 — Target architecture

One descriptor shape per suite, a registry per suite, a generic dispatcher.

### 2.1 Analysis

```ts
// src/analysis/rules/rule.ts
export type AnalysisContext = {
    scope: Scope;
    block: BlockContext;
    diagnostics: Diagnostics;
    types: TypeAnalyzer;
    expressions: ExpressionAnalyzer;
    /** Re-entrant dispatch, replacing the AnalyzeStatement callback. */
    statement(s: Statement, block: BlockContext, scope: Scope): void;
    block(b: BlockStatement, block: BlockContext, scope: Scope): void;
};

export type StatementRule<K extends Statement["kind"] = Statement["kind"]> = {
    kind: K;
    analyze(node: Extract<Statement, { kind: K }>, ctx: AnalysisContext): void;
};
```

```ts
// src/analysis/rules/index.ts
export const statementRules: StatementRule[] = [
    variableDeclarationRule,
    assignmentRule,
    returnRule,
    // ...one line per rule
];
export const statementRuleTable = new Map(statementRules.map((r) => [r.kind, r]));
```

The dispatcher becomes a table lookup. `AnalysisContext` replaces constructor
injection outright — a rule declares what it needs by reading `ctx`, not by being
handed collaborators at construction time. The `statement_context.ts` callback
type disappears.

`ExpressionRule` follows the same shape keyed on `Expression["kind"]`, returning
`Type`.

### 2.2 Parser

```ts
// src/ast/rules/rule.ts
export type ParseRule = {
    /** Leading token(s) that select this production. */
    leading: TokenKind[];
    parse(p: Parser): U<Declaration> | U<Statement>;
};
```

Two registries: `declarationRules` (keyed on `import`/`ffi`/`export`/`function`/
`type`/`unique`/`interface`/`extern`/`const`/`let`) and `statementRules` (keyed on
`break`/`continue`/`check`/`forward`/`const`/`let`/`return`/`if`/`while`/`switch`/
`for`, with expression-statement as fallback). `parseDecls` and `parseStmt` become
lookup + fallback, and the ordering constraints they currently enforce inline
(imports first, `export module` last) become explicit fields on the descriptor
rather than flags threaded through a 202-line loop.

Precedence collapses to data:

```ts
const precedence: TokenKind[][] = [
    [TokenKind.Symbol_LogicalOr],
    [TokenKind.Symbol_LogicalAnd],
    [TokenKind.Symbol_Pipe],
    [TokenKind.Symbol_Caret],
    [TokenKind.Symbol_Ampersand],
    [TokenKind.Symbol_Equality, TokenKind.Symbol_NotEquals],
    [TokenKind.Symbol_Less, TokenKind.Symbol_LessEq,
     TokenKind.Symbol_Greater, TokenKind.Symbol_GreaterEq],
    [TokenKind.Symbol_ShiftLeft, TokenKind.Symbol_ShiftRight],
    [TokenKind.Symbol_Plus, TokenKind.Symbol_Minus],
    [TokenKind.Symbol_Asterisk, TokenKind.Symbol_FSlash, TokenKind.Symbol_Percent],
];
```

One ~25-line driver replaces ~260 lines. Adding an operator is a table edit.

### 2.3 Emitter

```ts
// src/codegen/rules/rule.ts
export type EmitContext = {
    module: ModuleEmitState;    // §1.5 module tier
    fn: FunctionEmitState;      // §1.5 function tier
    block: BlockEmitState;      // §1.5 block tier
    cType(t: Type): string;
    expression(e: Expression): string;
    statement(s: Statement): string;
};

export type EmitRule<K extends Statement["kind"] | Expression["kind"]> = {
    kind: K;
    emit(node: Extract<Statement | Expression, { kind: K }>, ctx: EmitContext): string;
};
```

`cType` (~70 lines of switch, `emitter.ts:176–247`) moves to its own
`codegen/ctype.ts` — it is consulted by nearly every rule and depends only on the
module tier.

### 2.4 Directory shape

```
src/
  ast/
    rules/
      declarations/   one file per top-level production
      statements/     one file per statement production
      expressions/    primary, postfix, unary, precedence table
      index.ts        registry
  analysis/
    symbols.ts        SymbolKind, Flow, Symbol, FunctionSignature, BlockContext…
    rules/
      statements/     one file per statement rule
      expressions/    one file per expression rule
      declarations/   one file per declaration rule
      index.ts        registry
  codegen/
    ctype.ts
    context.ts        the three state tiers
    rules/
      statements/
      expressions/
      index.ts
```

---

## Part 3 — Migration stages

Each stage lands separately and leaves the suite green. Diagnostic codes are
deliberately **not** threaded in during extraction — mixing mechanical moves with
message changes makes regressions hard to bisect. Codes are stage 6.

### Stage 1 — Delete the dead analyzer

- Move `analyzer.ts:43–147` to `src/analysis/symbols.ts`.
- Delete `analyzer.ts:148–2075` and the file.
- Repoint 16 importers.

**Δ −1,928 lines. Risk: none** — `tsc --noEmit` is a total check here, since
nothing constructs the class and there are no dynamic imports.

**Done when:** `tsc --noEmit` clean; `npm test` unchanged; `rg 'analysis/analyzer'`
returns nothing.

### Stage 2 — Analysis rule registry

- Add `AnalysisContext` and `StatementRule`; convert the 10 existing
  `statements/*` analyzers to descriptors.
- Extract `return_error_statement`, `check_block_statement`, `forward_statement`
  into their own rule files.
- Move `statement.ts:173–458` (Phase C error-model) into
  `analysis/error_model.ts` — it is a service the check/forward/return-error rules
  consume, not dispatcher code.
- Delete `statement_context.ts`.

**Δ ~0. Risk: low.** The `blockDiverges`/`statementDiverges` pair is the one piece
to watch: it is called from both the check rule and the switch rule.

**Done when:** `statement.ts` is <100 lines and contains only table lookup.

### Stage 3 — Parser rules

- Precedence table (−~235 lines).
- `declarationRules` / `statementRules` registries; split `parseDecls` and
  `parseSwitchStatement`.

**Δ −250. Risk: low** — the parser is well covered by `examples/cases/`.

### Stage 4 — Emitter context extraction

Two sub-steps, in order:

1. Extract the three state tiers into `codegen/context.ts` with `Emitter` holding
   them as fields. **No file splitting yet.** Pure state renaming, verifiable by
   diffing generated C.
2. Only then introduce `EmitRule` and split `emitExpression`/`emitStatement`.

**Δ ~0. Risk: medium** — the highest of the plan. The ownership scope stack has
an undocumented push/pop contract across `emitBlockStatement`, `emitLoopExit`, and
`emitFunctionDeclaration`, and `AllocationTracker` is a live no-op stub whose
intended contract is unclear.

**Done when:** generated C for every `examples/` and `test-source/tests/` fixture
is byte-identical before and after. Capture that baseline *before* starting.

### Stage 5 — Decompose the braided functions

Split §1.4's list, worst-first. `analyzeFunctionCallExpression` becomes a small
spine plus one file each for arity, borrow-aliasing, generic inference, bound
checking, and conversion synthesis.

**Δ ~0. Risk: medium** — real behaviour lives in the interleaving; each split
needs a fixture asserting the diagnostic still fires and still fires *first*.

### Stage 6 — Diagnostic codes

- Add `code: DiagnosticCode` to `Error`; render as `semantic error[E0213]: …`.
- Each rule file declares the codes it owns; a test asserts every catalog code is
  reachable and every emitted code is in the catalog.
- Convert `examples/cases/` assertions from message substrings to codes.
- Then `--explain E0213` is a lookup.

**Δ +small. Risk: low**, but touches all 313 sites, so it wants to be last.

---

## Out of scope

- `src/lsp/` (`source-index.ts` is 1,094 lines and has its own duplication with
  the parser, but it consumes the AST rather than defining rules).
- `src/compiler/package.ts`, `project.ts` — build orchestration, not rules.
- Any change to Delta's semantics. Stages 1–5 are behaviour-preserving by
  construction; stage 6 changes only diagnostic *rendering*.

## Open questions

1. **Rule ordering.** Some checks must run before others to keep errors
   non-cascading (an arity error should suppress the per-argument type errors).
   Today that ordering is implicit in statement order inside the big functions.
   Does `StatementRule` need an explicit `after: RuleId[]`, or is registry array
   order sufficient? Registry order is simpler and probably enough; worth
   deciding before stage 5, not after.
2. **One code per rule, or many?** `analyzeFunctionCallExpression` splits into ~7
   rules but owns ~12 catalog codes. Likely `codes: DiagnosticCode[]` rather than
   a single `code`.
3. **`AllocationTracker`.** Stub or vestigial? Answering this before stage 4
   removes the main unknown from the riskiest stage.
