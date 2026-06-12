# Plan: Phase K — Custom Record Types (`type`)

Date drafted: 2026-06-07
Status: planning, not started.
Predecessor: Phases **A** and **B** landed.
Successor: Phase E (classes) reuses the field-list, member-access, object-literal-pinning, and structural-`==` machinery introduced here. Phase H (`heap T`) lifts the no-recursion restriction. Phase G (`&T`) and a future tagged-union phase lift two more restrictions called out below.
Spec basis: [spec-sections/08-type-declarations.md](../../spec-sections/08-type-declarations.md), with knock-on text in §11 (mutability) and §3.3 (definite assignment).

## Why land this before Phase E

The existing Phase E plan assumes phases I/D/J/A/B/C have shipped because its acceptance program uses `as result`, `check`, `std/log`, and `OverflowError`. Phase K lets the project add a sizable, demonstrable language slice (records, object literals, field access, member assignment, composition, structural equality) without depending on the error model, modules, or `std/log`. It also pulls forward the front-end machinery Phase E needs — `MemberAccessExpression`, object-literal-pinning by expected type, struct emission and compound-literal codegen, declaration-time fixed-size check — into a smaller and cheaper surface, so Phase E can focus on the class-specific layers (privacy, `this`, `edit`, dispose scaffolding) rather than re-inventing field plumbing.

## Goal

A user can declare nominal data records with `type X = { ... };`, alias existing named types with `type Y = X;`, construct values with object literals pinned by their surrounding typed context, read and mutate public fields, compose records with spread (`...`) and intersection (`&`), spread values into other literals, and compare them with compiler-derived structural `==`.

After Phase K, this program compiles and exits with status `9`:

```delta
type Vec3   = { x: float64; y: float64; z: float64; };
type Animal = { species: int32; age: int32; };
type Dog    = { ...Animal; goodBoy: bool; };

function magnitudeSquared(v: Vec3): float64 {
    return v.x * v.x + v.y * v.y + v.z * v.z;
}

function origin(): Vec3 {
    return { x: 0.0, y: 0.0, z: 0.0 };
}

function main(): int32 {
    const a: Vec3 = { x: 1.0, y: 2.0, z: 2.0 };
    const b: Vec3 = { ...a };
    if (a == b) {
        let dog: Dog = { species: 1, age: 3, goodBoy: true };
        dog.age = 4;
        if (dog.goodBoy) {
            return int32(magnitudeSquared(a));   // 9.0 → 9
        }
    }
    return 1;
}
```

## In-scope language surface

- `type Name = { f1: T1; f2: T2; ... };` — fresh nominal record declaration.
- `type Alias = Existing;` — alias to a single named type.
- Object-type literal `{ f: T; ... }` legal **only** on the RHS of a `type` declaration (or as a syntactic operand of `...` / `&` inside such a declaration).
- Object literal `{ f: v, ... }` at expression position, pinned by the surrounding typed context:
  - `const v: Vec3 = { ... };` binding annotation.
  - `f({ ... })` call-site argument with a record parameter type.
  - `return { ... };` inside a function whose declared return type is a record.
- Object literal coverage rules: every field exactly once. Missing / extra / duplicate fields are compile errors. Field order is irrelevant.
- `let v: Vec3;` (no initializer) — record-typed binding, **definitely-assigned only by whole-value assignment** (`v = { ... };`).
- Field read: `v.field` for any record-typed expression.
- Field assignment: `v.field = expr;` legal only when `v` is a mutable (`let`) binding **and** has already been fully initialized.
- Type-level composition on the RHS of `type X = ...;`:
  - Spread form: `type Dog = { ...Animal; breed: int32; };`.
  - Intersection form: `type Dog = Animal & { breed: int32; };`.
  - Field-name collisions across operands are compile errors. No override.
  - Operands must be record types (named or RHS-inline). Aliases that resolve to records are fine.
- Value-level spread inside an object literal: `const c: Vec3 = { ...base };`, `const c: Vec3 = { ...base, ...other };`. Combined field set must cover the target exactly once; collisions across spreads or between a spread and an explicit field are errors. The spread source's type must be the **same** record type as the target.
- Compiler-derived structural `==` / `!=` on two values of the same record type, iff every field type supports `==`. Per-field structural comparison; numeric / `bool` / `char` field-types qualify (consistent with current Phase A typing).
- No methods, no per-field visibility, no field defaults — all rejected at parse / analyze time per §8.5 / §8.11.

## Explicitly out of scope for Phase K

| Feature | Reason | Eventual home |
|---|---|---|
| `heap T` indirection (recursive records) | Spec §8.7; depends on heap allocation story. | Phase H. |
| `&T` / `edit &T` field-type and parameter types | Spec §8.8; needs reference machinery. | Phase G. |
| `same(a, b)` identity intrinsic | Spec §8.10; requires `&` / `heap` operands to be well-defined. | Co-lands with G/H. |
| Tagged unions `type X = A \| B;` | Spec §8.13; separate phase. | Future "tagged-union phase". |
| Aliases to generic instantiations (`type IntList = Array<int32>;`) | Generics not yet specified. | Future generics phase. |
| Ordering operators `<` / `>` / `<=` / `>=` on records | Spec §8.9: not defined for records. | Never. |
| User-overridable `==` | Spec §8.9: compiler-derived only. | Never. |
| Anonymous object types in parameter / field / return / binding positions | Spec §8.3. | Never. |
| Per-field visibility (`public` / `private`) | Spec §8.5: types carry no visibility. | Never. |
| Methods on `type` declarations | Spec §8.5: behavior lives in free functions or classes. | Never. |
| Field-level default initializers | Spec §8.11: drift / two construction rules. | Never. |
| `extends` keyword on `type` | Spec §8.14. | Never. |
| Class records and the `class` keyword | Phase E. | Phase E. |
| Moving fields out of records | No move story yet. | Phase F (and even there, mostly classes). |
| Disposal of record-typed bindings | Phase K records hold only primitives, so there's nothing to dispose; the scaffolding lands in Phase E. | Phase E. |

## What's missing today

- No `type` keyword, no `...` (spread) token, no spread / intersection on type RHS, no anonymous object-type literal.
- No object-literal expression. The parser does not parse `{ ... }` at expression position; it only recognizes `{` as a block opener inside statements.
- No `MemberAccessExpression` AST node (Phase A's `Type.from` path is special-cased in the analyzer).
- No user-defined nominal types in the type table. The current `Type` covers only the primitive set plus `TypeInvalid` / `TypeEmpty`.
- The analyzer does not propagate an *expected* type into expression checks. Annotations are informational ("known gap" called out in compiler-status: "annotations are currently informational"). Bidirectional inference is required to type-check object literals correctly — they have shape but no name without context.
- Codegen has no struct emission, no compound-literal emission, no per-type equality helper synthesis, no field-access lowering.
- Definite-assignment in Phase B is per-binding, not per-field. Partial-init rejection requires no new tracking (we simply disallow `v.field = ...` until DA is satisfied by a whole-value assignment), but the rule has to be wired into the AST-walk DA pass.

## Decisions

1. **A `type` declaration lowers to a C struct, named `delta__<RecordName>`.** Fields are emitted in declaration order. Aliases (`type Y = X;`) do not emit a new struct; they reuse the aliased type's symbol and C name. The single-module name space matches the current single-file compiler; a per-module prefix is left as a no-op placeholder for Phase I to fill in.
2. **Anonymous object-type literals are RHS-only, enforced in the parser.** The parser only accepts `{ field: T; ... }` as the body of `type X = ...;` (or as an operand of `...` / `&` within that RHS). Anywhere else (`function f(p: { x: int32; }): void`, `let v: { x: int32 };`) is a parser error pointing at §8.3.
3. **Object literals at expression position carry shape but no name; the analyzer pins their type from context.** Pinning sources, in order: binding annotation, call-site parameter type, return type. An object literal whose context cannot be pinned is a structured error with the message "object literal needs a typed context; add an annotation, pass to a typed parameter, or return into a typed function." The expression's static type after pinning is the pinned record type.
4. **A one-level bidirectional inference pass lands here.** The analyzer gains a `typeOfExpr(expr, expected Type)` form. `expected` is passed only at the three pinning sites above and at each field of a known-target object literal (used to type the literal's field initializers). Everywhere else, type checking proceeds bottom-up as today. This closes the existing "annotations are informational" gap for the record path; primitives keep their current behavior (a separate cleanup item).
5. **`type X = Y;` is a structural alias, not a fresh nominal type.** The analyzer records `X` as another name pointing at `Y`'s `Type` value. `Vec3` and `Position` (where `type Position = Vec3;`) compare equal as types and interchange freely. Fresh nominal identity is reserved for the `{ ... }` and composition RHS forms (§8.2 table).
6. **Composition is uniform across spread and intersection.** The analyzer collects all operands' field sets, errors on any name collision, and produces a fresh nominal record. Operands that are not records (or aliases to records) are errors. Cyclic composition (`type A = { ...B; }; type B = { ...A; };`) is detected at declaration time by a worklist that expands each declaration's operands eagerly; any back-edge is the structured cycle error from §8.6 / §8.7.
7. **Direct self-reference is a hard error at declaration time.** Phase K has no `heap T`, so any record cycle is fatal. The diagnostic names every type on the cycle and ends with "introduce indirection (`heap T`) — not supported until Phase H." This is intentional: the cycle check is the same code path that Phase H will refine once `heap T` lands; the only thing Phase H changes is what counts as a cycle-breaker.
8. **Coverage check happens after pinning, comparing the literal's field-name set against the pinned type's field-name set.** Missing / unknown / duplicate field diagnostics each carry the field name and the target type name. Spread sources contribute their declared field set; if a spread source's static type is not the *same* type as the target, the diagnostic is "spread source is `T1`, target is `T2`; cross-type spread is not allowed (§8.12)."
9. **`==` is compiler-derived structurally.** For two operands of the same record type, the analyzer accepts the comparison iff every field type supports `==` (numeric, `bool`, `char` today). Codegen synthesizes one `static inline bool delta__<Record>_eq(delta__<Record> a, delta__<Record> b) { return a.x == b.x && ...; }` per record type the program compares, emitted on first use. Records whose fields are all primitives qualify; once `string` is added later, the gate will exclude any record with a `string` field per §8.9 with the suggested fix message.
10. **Field access (`v.f`) and field assignment (`v.f = e;`) reuse `MemberAccessExpression`.** The analyzer resolves the receiver to a record type, looks up `f` on that type's field list, and yields the field's type (read) or validates the L-value (write). Writes require the receiver binding to be a `let` (or, eventually, `edit &`). Writes to a `const`-bound receiver are the existing "cannot assign to const" diagnostic, extended to record receivers.
11. **Definite-assignment treats record bindings whole.** `let v: Vec3;` is uninitialized; reading any field of `v` or writing any field of `v` before `v = { ... };` is an error ("`v` is uninitialized"). Whole-value assignment marks the binding initialized; from then on, individual field reads/writes are fine. The DA tracker doesn't need per-field bits, because §8.4 forbids partial field initialization outright.
12. **No ordering, no field defaults, no methods, no per-field visibility — rejected at the earliest legal stage.** Field defaults (`port: int32 = 8080;`) are a parser error inside the RHS field list. Methods (`name(): T { ... }`) are a parser error. `public` / `private` inside a `type` are parser errors. `<` / `>` / `<=` / `>=` between record operands are analyzer errors. All carry the §8 reference in the help text.

## Tokenizer changes

- New reserved keyword: `type`. (`interface` is already reserved by the spec but is not added to the tokenizer in this phase — adding it would only be motivated when post-MVP trait/interface work begins.)
- New token: `...` (three-dot ellipsis). Lexed with lookahead so `..` (range — Phase B) is not consumed prematurely. The tokenizer prefers the longest match: three dots → `...`, two dots → `..`, otherwise `.`.
- No other tokenizer changes. `&` already exists (bitwise AND); the parser disambiguates type-position `&` (intersection) from expression-position `&` (bitwise).
- `.` (single dot) needs to be recognized as a token for field access; today it is only used inside `Type.from(x)` via a special parse path. Promote it to a first-class punctuation token.

## Parser changes

- AST nodes:
  ```go
  type TypeDeclaration struct {
      Name     string
      RHS      TypeRHS         // RecordRHS, AliasRHS, or CompositionRHS
      Exported bool            // Phase I will populate this; Phase K writes false
      Position Position
  }

  type RecordRHS struct {
      Fields   []RecordField   // inline { f: T; ... }
      Position Position
  }
  type AliasRHS struct {
      Target   TypeReference   // a single named type
      Position Position
  }
  type CompositionRHS struct {
      Operands []CompositionOperand   // each is a TypeReference or a RecordRHS
      Style    CompositionStyle       // SpreadForm or IntersectionForm; informational only
      Position Position
  }
  type RecordField struct { Name string; Type TypeReference; Position Position }

  type ObjectLiteralExpression struct {
      Elements []ObjectLiteralElement   // FieldInit or SpreadElement
      Position Position
  }
  type FieldInit       struct { Name string; Value Expression; Position Position }
  type SpreadElement   struct { Source Expression; Position Position }

  type MemberAccessExpression struct {
      Receiver Expression
      Member   string
      Position Position
  }
  ```
- Statement-vs-expression `{` disambiguation: at expression position (after `=`, `return`, inside call arg lists, inside another object literal value), `{` introduces an `ObjectLiteralExpression`. At statement-leading position, `{` still introduces a `BlockStatement`. The expression grammar gains `parseObjectLiteral`; the statement grammar is unchanged.
- Type-position `&` parsing: inside a `type` RHS, `&` is intersection. Outside, it stays bitwise AND. Parens around an RHS are not yet legal (no `(A & B) | C` until tagged unions land; the parser rejects parenthesized RHS with a "parentheses in type RHS are not supported" diagnostic that points at the tagged-union spec section).
- Member access: extend the postfix-expression loop to recognize `.identifier`, producing `MemberAccessExpression`. Phase A's `Type.from(x)` path becomes a special case of "member access whose receiver resolves to a type name and whose call site picks the conversion path"; no parser change needed beyond emitting the generic node and letting the analyzer interpret it.
- Object literal element parsing: `Name : Expression` and `...Expression`, comma-separated, optional trailing comma. The block-vs-literal disambiguation falls out of expression-position vs statement-position.
- Field-list parsing inside a record RHS: `Name : TypeReference ;` repeated. The parser rejects `Name : TypeReference = Expression ;` (field defaults), `Name (...) : TypeReference { ... }` (methods), and `public Name : ...;` / `private Name : ...;` (visibility) at the parser, each with a §8.5 / §8.11 reference.

## Semantic analyzer changes

- **New type kind:** `TypeUserRecord` with `Name string`, `Fields []RecordField` (each carrying a resolved `Type`), and a `Position` for diagnostics. The `Type` equality check treats two record references as equal iff they point at the same `*UserRecord` (nominal identity). Aliases reuse the same `*UserRecord`.
- **Type-declaration registration.** Three passes interleave with the existing function/const passes:
  1. **Declare phase.** Each `type X = ...;` adds an empty `*UserRecord` to the symbol table under name `X` (or, for alias RHS, defers — recorded as "alias pending"). Forward references between record declarations are allowed within the file.
  2. **Resolve phase.** Each declaration's RHS is walked. For a `RecordRHS`, fields are typed (their `TypeReference` resolved against the symbol table, which already contains forward record names). For an `AliasRHS`, the target is resolved and the alias name is bound to the same `*UserRecord`. For a `CompositionRHS`, operands are walked, each operand's field set is fetched (alias-followed), collisions are checked, and the combined field set populates the fresh `*UserRecord`.
  3. **Cycle check.** A worklist over record declarations: for each, expand spread / intersection operands and inline field types to detect any back-edge to the declaration itself. Inline field types of type `RecordX` are also followed (a direct self-reference field is a cycle of length 1). Any cycle → structured diagnostic naming every type on the cycle, with the "introduce `heap T` — not yet supported" tail.
- **Object-literal typing (bidirectional).** A new `typeOfExpr(expr, expected Type)` helper. Call sites that pass a non-empty `expected`:
  - `VariableDeclarationStatement` with a non-empty type annotation: `typeOfExpr(initializer, annotation)`. (This also fixes the long-standing "annotations are informational" gap for record-typed bindings; primitive bindings keep their existing behavior — the change is additive.)
  - `AssignmentStatement` where the target is a record-typed L-value: pass the L-value's type as the expected type for the RHS.
  - `FunctionCallExpression` arguments: pass the parameter's declared type as each argument's expected type.
  - `ReturnStatement`: pass the enclosing function's declared return type to each return value (using the matching position when there is more than one return slot).
  - `ObjectLiteralExpression` field values: with a pinned target type, pass each field's declared type to its value expression. (This is the "one level" — the expected-type propagation does not recurse beyond the literal's immediate children, matching §4.1's stated machinery.)

  For an `ObjectLiteralExpression`:
  - If `expected` is empty → structured error per Decision 3.
  - If `expected` is not a record type → "object literal cannot satisfy non-record type `T`".
  - Otherwise: walk elements, classify each as `FieldInit` or `SpreadElement`.
    - For each `FieldInit`, check the field exists on the expected type (else "unknown field `f` on `T`"), check no field has been provided twice (else "duplicate field `f`"), and type-check the value against the field's declared type.
    - For each `SpreadElement`, type-check `Source` (no expected type), require its type to be the same `*UserRecord` as the expected type (else cross-type-spread error), and contribute the source's full field set to the "provided" set (with duplicate detection against earlier elements).
    - At the end, require coverage: every field of the expected type appears in the provided set (else "missing field `f` of `T`").
- **Member access typing.** For `v.f`:
  - Resolve `v`'s type. Errors propagate.
  - If `v`'s type is `TypeUserRecord`, look up `f` in its field list. Found → expression's type is the field's type. Not found → "type `T` has no field `f`".
  - If `v`'s type is a primitive, allow the existing `Type.from` / `Type(x)` paths as today; everything else is "left operand of `.` must be a record".
  - If `v`'s type is `TypeInvalid`, return `TypeInvalid` (cascade suppression).
- **Field assignment.** `v.f = e;` is permitted iff (a) `v.f` is a writable L-value — receiver is a `let` binding, field exists — and (b) the DA tracker has `v` marked initialized. The value's type is checked against the field's type with bidirectional inference. A receiver that is a `const` binding or a function name is the existing "cannot assign to const" diagnostic; the new wrinkle is the DA check for uninitialized record locals (Decision 11).
- **Definite-assignment.** Treat the binding atomically. `let v: T;` (record `T`) starts uninitialized; reading or writing any field is an error. `v = { ... };` marks the binding initialized. After that, field reads and writes are unconstrained.
- **Equality typing.** `==` / `!=` between two operands of the same record type is accepted iff every field type supports `==` (primitive + `bool` + `char`). The analyzer records the per-record-type equality-helper requirement in a new `RecordEqs` map so codegen knows which helpers to synthesize. If any field type does not support `==`, the diagnostic names the blocking field and the type's declaration site.
- **Ordering rejection.** `<` / `>` / `<=` / `>=` with any record operand → structured error referencing §8.9.

## Codegen changes

- **Struct emission.** For each declared record type, emit:
  ```c
  typedef struct delta__Vec3 {
      double x;
      double y;
      double z;
  } delta__Vec3;
  ```
  Field order matches declaration order; no padding tricks. Aliases emit no new struct.
- **Object-literal lowering.** A pinned `ObjectLiteralExpression` lowers to a C compound literal: `(delta__Vec3){ .x = ..., .y = ..., .z = ... }`. Field order in the emitted compound literal matches the *declaration* order, not the literal's source order, so the C output is stable across source-order variations. Spread sources are expanded fieldwise: for each field not already explicitly provided, emit `.f = (source).f`. (Two-pass: first pass collects explicit fields by name, second pass walks the target type's fields in declaration order and emits either the explicit value or the matching spread-source projection.)
- **Member access lowering.** `v.f` → `v.f`. No deref; record values live inline.
- **Field assignment lowering.** `v.f = e;` → `v.f = e;`.
- **Equality helper synthesis.** For each record type used in an `==` or `!=`, emit one helper into the TU preamble (after the struct definition):
  ```c
  static inline bool delta__Vec3_eq(delta__Vec3 a, delta__Vec3 b) {
      return a.x == b.x && a.y == b.y && a.z == b.z;
  }
  ```
  `a == b` lowers to `delta__Vec3_eq(a, b)`; `a != b` lowers to `!delta__Vec3_eq(a, b)`. The helper is emitted only when the analyzer's `RecordEqs` map records that the record was compared.
- **Pass-by-value semantics.** Records flow through C as struct values: parameters are declared `delta__Vec3 v`, return types are `delta__Vec3`, locals are `delta__Vec3 v;`. Phase E's "intentional struct-copy gap" is the same gap that already applies here — pass-by-value duplicates the C struct without any ownership tracking. There are no resources inside Phase K records (only primitives), so the gap is silent rather than unsound, but it is the same hole Phase F closes.
- **Forward-declaration order.** Add a pre-pass that emits all `typedef struct` declarations and their definitions in topological order over inline-field dependencies before any function bodies or eq-helpers. The cycle check in semantics guarantees a valid order exists.

## Testing strategy

New fixtures under `test-source/tests/codegen/records/`.

**Declarations (4)**
- `record_basic_ok` — `type Vec3 = { x: float64; y: float64; z: float64; };` + main constructs and reads.
- `record_alias_ok` — `type Position = Vec3;` + interchanging values.
- `record_composition_spread_ok` — `type Dog = { ...Animal; goodBoy: bool; };`.
- `record_composition_intersection_ok` — `type Cat = Animal & { color: int32; };`.

**Construction (5)**
- `literal_pinned_by_annotation_ok` — `const v: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };`.
- `literal_pinned_by_call_arg_ok` — `f({ x: 1.0, y: 2.0, z: 3.0 });`.
- `literal_pinned_by_return_ok` — `function f(): Vec3 { return { ... }; }`.
- `literal_unpinned_err` — `const v = { x: 1.0 };` rejected ("needs a typed context").
- `literal_field_set_errors_err` — three sub-cases: missing field, extra field, duplicate field.

**Field access and assignment (4)**
- `field_read_ok` — `return int32(v.x + v.y);`.
- `field_write_ok` — `let v: Vec3 = { ... }; v.x = 5.0;`.
- `field_write_const_err` — `const v: Vec3 = { ... }; v.x = 5.0;` rejected.
- `field_partial_init_err` — `let v: Vec3; v.x = 1.0;` rejected ("uninitialized").

**Spread at value level (3)**
- `value_spread_full_ok` — `const c: Vec3 = { ...a };`.
- `value_spread_cross_type_err` — spread of different record type rejected.
- `value_spread_collision_err` — `{ ...a, x: 5.0 }` rejected as "duplicate field `x`".

**Composition rejections (3)**
- `composition_field_collision_err` — two operands declare the same field.
- `composition_non_record_operand_err` — `type Bad = int32 & { x: int32; };`.
- `composition_cycle_err` — `type A = { ...B; }; type B = { ...A; };` — diagnostic names every type on cycle.

**Cycle / self-reference (2)**
- `record_self_field_err` — `type Tree = { value: int32; left: Tree; };` rejected with the "introduce `heap T`" tail.
- `record_mutual_cycle_err` — `type A = { b: B; }; type B = { a: A; };` rejected.

**Equality (3)**
- `record_eq_ok` — `Vec3 == Vec3` returns expected bool.
- `record_eq_helper_emitted_ok` — snapshot test asserting the generated C contains exactly one `delta__Vec3_eq` definition.
- `record_ordering_err` — `a < b` between records rejected.

**Out-of-scope rejections (4)**
- `record_method_err` — method inside `{ ... }` rejected at parser.
- `record_visibility_err` — `public x: int32;` inside `{ ... }` rejected at parser.
- `record_default_err` — `x: int32 = 0;` inside `{ ... }` rejected at parser.
- `anonymous_object_type_err` — `let v: { x: int32 };` rejected at parser with §8.3 reference.

All earlier-phase fixtures continue to pass. Two existing fixtures may need touchup if they relied on the old behavior of `{` always opening a block at expression-following positions (none currently do, but this is the obvious regression risk).

## Stage-by-stage implementation order

1. Tokenizer: `type` keyword, `...` token, promote `.` to a first-class punctuation token (verify no regressions in the existing `Type.from(x)` parse path).
2. Parser: `TypeDeclaration` with `RecordRHS` / `AliasRHS` / `CompositionRHS`, RHS-only object-type literal enforcement, parser-stage rejections for methods / visibility / defaults / anonymous object types in non-RHS positions.
3. Parser: `MemberAccessExpression` (postfix-expression loop extension), `ObjectLiteralExpression` (expression-position `{`), and `SpreadElement` element form. Audit the `Type.from` path to confirm it still parses.
4. Analyzer scaffolding: `TypeUserRecord`, type-declaration registration passes (declare → resolve → cycle check), alias resolution.
5. Analyzer composition: spread + intersection field-set merging with collision and operand-kind checks; cycle detector across composition and inline fields.
6. Analyzer bidirectional inference: `typeOfExpr(expr, expected Type)` introduced and threaded through the four pinning sites (annotation, call arg, return, literal field value).
7. Analyzer object-literal typing: pinning, coverage, spread handling, error messages.
8. Analyzer member access and field assignment, including the DA hookup for "uninitialized record local".
9. Analyzer equality and ordering rules for records, plus the `RecordEqs` map for codegen.
10. Codegen: struct emission with topological ordering, including a quick smoke pass that the existing codegen output compiles unchanged for non-record programs.
11. Codegen: object-literal compound-literal emission, spread expansion, member access, field assignment.
12. Codegen: equality helper synthesis on demand.
13. Fixture suite.

Steps 1–3 are parser-heavy. Steps 4–9 are analyzer-heavy. Steps 10–12 are codegen-heavy. Step 6 (bidirectional inference) is the load-bearing analyzer change; expect it to take the most iterations because it's the first time the front end propagates expected types.

## Risks and open questions

- **Statement-vs-expression `{` ambiguity.** The disambiguation rule ("`{` at expression position is an object literal; `{` at statement-leading position is a block") is unambiguous in the grammar but easy to get wrong in the parser. Risk: `{ x: 1.0, y: 2.0 }` evaluated as a statement-expression — i.e., a labeled-statement-style misparse — silently becoming a block. Mitigation: the expression-position `{` parser only fires when the postfix / primary expression parser is called; statement-leading `{` continues to dispatch to the block parser unchanged. A focused parser test confirms `{ x: 1.0 } ;` is *not* a valid statement on its own.
- **Bidirectional inference rollout.** Adding `expected Type` to expression typing touches every call site. The change is mechanically simple but broad. Risk: a missed call site produces "literal needs a typed context" in code where the context exists. Mitigation: do the propagation as a single PR with a fixture verifying each pinning site, before object-literal typing depends on it. Primitive typing is unchanged because the existing flow ignores `expected` when the literal already has an inferred type — the new helper degrades to the current behavior for everything that isn't an object literal.
- **`==` on records containing floats.** Float `==` already exists in Phase A; the per-field structural lowering inherits its IEEE-754 NaN semantics. Acceptable. Once `string` lands, the gate (every field supports `==`) excludes string-bearing records per §8.9 with the suggested fix message; nothing in this phase changes when that happens.
- **Cycle-check diagnostic phrasing.** The "introduce `heap T` — not yet supported" tail is correct but easy to misread as "the feature exists, the user did something wrong." Mitigation: phrase as "introducing `heap T` would break this cycle, but `heap T` is not implemented yet (Phase H); a record cannot recurse directly." Lift the wording exactly from §8.7's diagnostic to keep wording stable across phases.
- **Alias chains.** `type A = B; type B = C; type C = { x: int32; };`. The resolve phase needs to follow the chain to find the underlying `*UserRecord`. Risk: alias-of-alias-of-record causes lookup loops. Mitigation: alias-chain resolution uses a small visited-set; alias cycles (`type A = B; type B = A;`) are a structured error caught in the cycle pass.
- **Codegen forward-declaration ordering.** Record types may reference each other through inline fields (e.g., `type Outer = { inner: Inner; };`). The codegen TU has to declare `Inner` before `Outer`. Mitigation: the topological sort is over the inline-field dependency graph, which the semantic cycle check already validates is acyclic. Aliases collapse to their target before sorting.
- **Phase E plan overlap.** Phase E's `MemberAccessExpression`, `ClassLiteralExpression`, `FieldInitializer`, and dispose scaffolding ideas overlap with this phase. Recommendation: when Phase E begins, fold the Phase K AST nodes in instead of re-introducing them; Phase E's `ClassLiteralExpression` becomes a parser-level distinction (`Identifier { ... }`) on top of the same field-initializer shape.

## Definition of done

- The Phase K acceptance program (Vec3 / Animal / Dog with composition, value spread, structural equality, field read/write) compiles and runs, exiting with status `9`.
- All Phase K fixtures pass.
- All earlier-phase fixtures continue to pass.
- The generated C contains a `typedef struct delta__<Record>` for each declared record, an emitted `delta__<Record>_eq` for each record actually compared with `==` / `!=`, and zero spurious equality helpers (verified by snapshot).
- The analyzer rejects every out-of-scope construct listed in the table above with a structured diagnostic that references the relevant §8 section.
- Phase E can reuse, without reimplementing, the `MemberAccessExpression` AST node, the bidirectional `typeOfExpr` plumbing, the struct-emission codegen pass, and the literal-coverage / collision-checking analyzer logic.
