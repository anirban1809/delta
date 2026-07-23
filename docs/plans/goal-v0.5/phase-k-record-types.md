# Plan: Phase K — Custom Types (`type struct` / `type enum` / `type union`)

Date drafted: 2026-06-07
Revised: 2026-07-05 — adopt the `type struct` / `type enum` / `type union` family; enums and tagged unions folded into scope (previously deferred to a "future tagged-union phase"). Union variant construction is **unqualified** (`Variant{ ... }`, pinned by the surrounding typed context); the qualified `Union.Variant{ ... }` form was dropped.
Status: planning, not started.
Predecessor: Phases **A** and **B** landed. (Enum and union matching lean on Phase B's `switch`.)
Successor: Phase E (classes) reuses the field-list, member-access, and object-literal-pinning machinery introduced here. Phase H (`heap T`) lifts the no-recursion restriction. Phase G (`&T`) lifts the reference restriction called out below.
Spec basis: [spec-sections/08-type-declarations.md](../../spec-sections/08-type-declarations.md) (§8 predates this revision — it still shows the bare `type X = {...}` form with `;`-separated fields and treats unions/enums as aliases; the syntax below supersedes it and §8 needs a follow-up edit).

## Syntax revision (why this plan changed)

The type-declaration surface was redesigned into a single `type` keyword with a sub-keyword that names the kind, so records, enums, and unions are declared uniformly and the sub-keyword tells the reader how to read `:`:

```delta
type struct Point = { x: float64, y: float64 }              // product; name : TYPE
type enum   Color = { Red: 1, Green: 3, Blue: 40 }          // constants; name : VALUE
type union  Shape = Circle{ r: float64 } | Square{ s: float64 } // sum; variant + payload
type Meters       = distinct float64                        // transparent alias/newtype (bare RHS)
```

Settled rules (see also the standing decision record):

- **Fields and enum members are comma-separated** inside `{ }` (was `;` in the old draft). This makes struct field lists and struct object literals use the same separator.
- **`struct`** = product of fields.
- **`enum`** = closed set of named constants, **`int32`-backed by default**, ABI/FFI-friendly (bridges C enums). Values via `name: value`. **No mixing** — a declaration is either all-explicit (`{ Red: 1, Green: 3 }`) or all-implicit (`{ Red, Green, Blue }` → auto `0, 1, 2`), never partial.
- **`union`** = Delta-managed tagged sum (discriminant + payload; **not** an integer). `|`-alternated. **Named payloads only** (`Circle{ r: float64 }`; positional payloads deferred). **Payloadless variants are banned** — every variant must carry a `{ ... }`.
- The **enum ↔ union distinction is representation/ABI-based, not "does it have a payload"** — deliberately avoiding Rust's enum/union conflation. Decision rule for users: needs to be an integer / cross the C boundary → `enum`; needs per-variant data → `union`.
- `class` was **not** reintroduced (OO baggage already dropped in favor of `struct` records + free receiver functions).

## Why land this before Phase E

The existing Phase E plan assumes phases I/D/J/A/B/C have shipped because its acceptance program uses `as result`, `check`, `std/log`, and `OverflowError`. Phase K lets the project add a sizable, demonstrable language slice (records, enums, tagged unions, object literals, field access, member assignment, composition, variant matching) without depending on the error model, modules, or `std/log`. It also pulls forward the front-end machinery Phase E needs — `MemberAccessExpression`, object-literal-pinning by expected type, struct emission and compound-literal codegen, declaration-time fixed-size check — into a smaller and cheaper surface, so Phase E can focus on the class-specific layers (privacy, `this`, `edit`, dispose scaffolding) rather than re-inventing field plumbing.

## Goal

A user can declare nominal `struct` records, `int32`-backed `enum`s, and tagged `union`s; alias existing named types; construct values (object literals for structs, `Enum.Member` for enums, and unqualified `Variant{ ... }` for unions) pinned by their surrounding typed context; read and mutate struct fields; compose structs with spread (`...`) and intersection (`&`); and match unions with `switch` binding payloads. Custom types (structs and unions) carry no compiler-derived `==` / `!=` — it would introduce hidden control flow behind an operator; only enums compare, as their backing `int32`.

After Phase K, this program compiles and exits with status `9`:

```delta
type struct Vec3   = { x: float64, y: float64, z: float64 };
type struct Animal = { species: int32, age: int32 };
type struct Dog    = { ...Animal, goodBoy: bool };

type enum Facing = { North: 0, East: 90, South: 180, West: 270 };

type union Shape =
      Circle{ r: float64 }
    | Square{ s: float64 };

function area(sh: Shape): float64 {
    switch (sh) {
        case Circle{ r }: return 3.14159 * r * r;
        case Square{ s }: return s * s;
    }
}

function magnitudeSquared(v: Vec3): float64 {
    return v.x * v.x + v.y * v.y + v.z * v.z;
}

function main(): int8 {
    const a: Vec3 = { x: 1.0, y: 2.0, z: 2.0 };
    const b: Vec3 = { ...a };
    const heading: Facing = Facing.East;
    const sh: Shape = Square{ s: 3.0 };

    if (a.x == b.x && heading == Facing.East) {
        let dog: Dog = { species: 1, age: 3, goodBoy: true };
        dog.age = 4;
        if (dog.goodBoy) {
            return int32(area(sh));   // 9.0 → 9
        }
    }
    return int32(magnitudeSquared(a));   // fallback: also 9
}
```

## In-scope language surface

### Structs (`type struct`)

- `type struct Name = { f1: T1, f2: T2, ... };` — fresh nominal record declaration, comma-separated fields.
- Object-type literal `{ f: T, ... }` legal **only** on the RHS of a `type struct` declaration (or as a syntactic operand of `...` / `&` inside such a declaration).
- Object literal `{ f: v, ... }` at expression position, pinned by the surrounding typed context:
  - `const v: Vec3 = { ... };` binding annotation.
  - `f({ ... })` call-site argument with a struct parameter type.
  - `return { ... };` inside a function whose declared return type is a struct.
- Object literal coverage rules: every field exactly once. Missing / extra / duplicate fields are compile errors. Field order is irrelevant.
- `let v: Vec3;` (no initializer) — struct-typed binding, **definitely-assigned only by whole-value assignment** (`v = { ... };`).
- Field read: `v.field`. Field assignment: `v.field = expr;` legal only when `v` is a mutable (`let`) binding **and** already fully initialized.
- Type-level composition on the RHS of `type struct X = ...;`:
  - Spread form: `type struct Dog = { ...Animal, breed: int32 };`.
  - Intersection form: `type struct Dog = Animal & { breed: int32 };`.
  - Field-name collisions across operands are compile errors. No override. Operands must be struct types (named or RHS-inline); aliases that resolve to structs are fine.
- Value-level spread inside an object literal: `{ ...base }`, `{ ...base, ...other }`. Combined field set must cover the target exactly once; collisions across spreads or between a spread and an explicit field are errors. The spread source's type must be the **same** struct type as the target.

### Enums (`type enum`)

- `type enum Name = { A: v1, B: v2, ... };` — closed set of named `int32` constants, comma-separated.
- Two declaration modes, never mixed:
  - **All-explicit:** every member names a value (`{ North: 0, East: 90 }`). Values must be `int32` literals; duplicate values are allowed (aliasing constants) but duplicate **names** are an error.
  - **All-implicit:** no member names a value (`{ Red, Green, Blue }`); the compiler assigns `0, 1, 2, …` in declaration order.
  - A partial mix (`{ Red: 1, Green, Blue: 3 }`) is a compile error ("enum values must be all-explicit or all-implicit").
- Member reference: `Name.Member` (e.g. `Facing.East`) yields a compile-time `int32` value of type `Name`. An enum member **is** an `int32` literal and interchanges freely with any integer type — no cast is needed to use it as an integer.
- Comparisons: because a member is an `int32` literal, `==` / `!=` **and** `<` / `>` / `<=` / `>=` work between two enum operands and between an enum and any integer, as ordinary integer comparisons.
- No cast is needed to read an enum's value — `Facing.East` *is* the `int32` literal `90` (`int32(e)` is redundant, not required). In the reverse direction, an integer **literal** that names a member coerces to the enum by its typed context (`const f: Facing = 90;` → `East`); an integer literal that names **no** member (`= 91`) and any **non-literal / runtime** integer are compile errors. A checked runtime narrowing (trapping on illegal values) is deferred to the FFI phase.
- Exhaustive `switch` over an enum: every member must have a `case`, or a `default` must be present; a non-exhaustive `switch` with no `default` is a compile error naming the missing members.

### Unions (`type union`)

- `type union Name = A{ f: T, ... } | B{ g: U, ... } | ...;` — tagged sum over named variants, `|`-alternated.
- **Every variant carries a named-field payload.** Payloadless variants (`A | B{ ... }`) are a parser error. Positional payloads (`A{ float64 }`) are a parser error (named-only for now).
- Variant names are **not** global free constructors: an unqualified `Variant{ ...payload... }` resolves only against the union pinned by the surrounding typed context (binding annotation, call-arg, return, or an enclosing field/payload). Construction is unqualified — the qualified `Name.Variant{ ... }` form is rejected — and an unpinned `Variant{ ... }` (no typed context) is an error. The payload literal follows the same coverage rules as struct object literals (every payload field exactly once).
- A union value's payload is only reachable through a `switch` that binds it:
  ```delta
  switch (sh) {
      case Circle{ r }:        // binds r: float64
      case Square{ s }: ...     // binds s: float64
  }
  ```
  - Patterns bind payload fields by name into the case body (`{ r }` binds `r`; `{ r: radius }` renaming form is out of scope for now — named-shorthand only).
  - `switch` over a union must be exhaustive (every variant, or a `default`).
- Equality: **not supported.** `==` / `!=` between union operands is rejected — a compiler-derived comparison would branch on the tag and compare payloads fieldwise, i.e. hidden control flow behind an operator. (Structs are rejected for the same reason; see §Shared.)

### Shared / aliases

- `type Alias = Existing;` — transparent alias to a single named type (struct, enum, union, or primitive). Bare RHS, no sub-keyword.
- No compiler-derived `==` / `!=` on struct or union values — a synthesized fieldwise (struct) or tag-dispatching (union) comparison is hidden control flow behind an operator, so both are rejected. Enums do compare (`==` / `!=`, and ordering), by their backing `int32`.
- No methods, no per-field visibility, no field defaults on any form — rejected at parse / analyze time.

## Explicitly out of scope for Phase K

| Feature | Reason | Eventual home |
|---|---|---|
| `heap T` indirection (recursive structs/unions) | Depends on heap allocation story. | Phase H. |
| `&T` / `edit &T` field-type and parameter types | Needs reference machinery. | Phase G. |
| `same(a, b)` identity intrinsic | Requires `&` / `heap` operands. | Co-lands with G/H. |
| Enum backing types other than `int32` (`type enum E: u8 = ...`) | Needs the explicit-backing-type syntax + range checks. | FFI phase (co-lands with `extern "c"` enum import). |
| **Runtime / checked** integer → enum narrowing (`Facing(runtimeInt)`, trapping on illegal values) | Admits out-of-range values; needs the trap/validation story. (Compile-time coercion of a *member-naming literal* is in scope — see §Enums.) | FFI phase. |
| Union pattern **renaming** (`case Circle{ r: radius }`) and nested/guard patterns | Keeps the matcher small this phase. | Later matching phase. |
| Positional / tuple union payloads (`A{ float64 }`) | Named-only for parity with structs. | Later. |
| Aliases to generic instantiations (`type List = Array<int32>;`) | Generics not yet specified. | Future generics phase. |
| Ordering operators `<` / `>` / `<=` / `>=` on struct / union operands | Not defined for records/unions. (Enum operands **do** order — a member is an `int32` literal.) | Never (records/unions). |
| `==` / `!=` on struct / union operands | A synthesized fieldwise / tag-dispatch comparison is hidden control flow behind an operator. | Never. |
| Anonymous object types in parameter / field / return / binding positions | §8.3. | Never. |
| Per-field visibility (`public` / `private`) | Types carry no visibility. | Never. |
| Methods on `type` declarations | Behavior lives in free functions / receiver functions. | Never. |
| Field-level default initializers | Drift / two construction rules. | Never. |
| `class` keyword and class records | Deliberately dropped; Phase E covers class-shaped records if revived. | Phase E. |
| Moving fields out of records | No move story yet. | Phase F. |
| Disposal of `type`-bound values | Phase K values hold only primitives, so there's nothing to dispose. | Phase E/F. |

## What's missing today

- No `type` keyword; no `struct` / `enum` / `union` sub-keywords; no `...` (spread) token; no spread / intersection on type RHS; no anonymous object-type literal; no `|` in type position.
- No object-literal expression, no `Enum.Member` value form, no `Union.Variant{ ... }` construction form. The parser only recognizes `{` as a block opener inside statements.
- No `MemberAccessExpression` AST node (Phase A's `Type.from` path is special-cased in the analyzer).
- `switch` (Phase B) matches scalar values only — no variant patterns, no payload binding, no exhaustiveness check against a declared member/variant set.
- No user-defined nominal types in the type table. The current `Type` covers only the primitive set plus `TypeInvalid` / `TypeEmpty`.
- The analyzer does not propagate an *expected* type into expression checks ("annotations are currently informational"). Bidirectional inference is required to type-check object literals and union payload literals, which have shape but no name without context.
- Codegen has no struct/enum/union emission, no compound-literal emission, no field-access lowering, no tagged-union tag/payload lowering.
- Definite-assignment in Phase B is per-binding, not per-field.

## Decisions

### Structs

1. **A `type struct` declaration lowers to a C struct, named `delta__<Name>`.** Fields are emitted in declaration order. Aliases (`type Y = X;`) do not emit a new struct; they reuse the aliased type's symbol and C name. Per-module name prefixing is a no-op placeholder for Phase I.
2. **Anonymous object-type literals are RHS-only, enforced in the parser.** The parser only accepts `{ field: T, ... }` as the body of `type struct X = ...;` (or as an operand of `...` / `&` within that RHS). Anywhere else (`function f(p: { x: int32 }): void`, `let v: { x: int32 }`) is a parser error pointing at §8.3.
3. **Object literals at expression position carry shape but no name; the analyzer pins their type from context.** Pinning sources, in order: binding annotation, call-site parameter type, return type, and (for union payloads) the variant selected by `Union.Variant`. An unpinnable object literal is the structured error "object literal needs a typed context; add an annotation, pass to a typed parameter, or return into a typed function."
4. **A one-level bidirectional inference pass lands here.** The analyzer gains `typeOfExpr(expr, expected Type)`. `expected` is passed at the pinning sites above and at each field of a known-target object literal / union payload. Everywhere else, checking proceeds bottom-up. This closes the "annotations are informational" gap for the type-declaration path; primitives keep their current behavior (additive change).
5. **`type X = Y;` is a transparent alias, not a fresh nominal type.** The analyzer records `X` as another name pointing at `Y`'s `Type`. Fresh nominal identity is reserved for the `struct` / `enum` / `union` RHS forms.
6. **Struct composition is uniform across spread and intersection.** Collect all operands' field sets, error on any name collision, produce a fresh nominal struct. Non-struct operands are errors. Cyclic composition is detected at declaration time by a worklist expanding each declaration's operands eagerly; any back-edge is the structured cycle error.
7. **Direct self-reference is a hard error at declaration time** (structs and unions alike). Phase K has no `heap T`, so any value-type cycle is fatal. The diagnostic names every type on the cycle and ends with "introducing `heap T` would break this cycle, but `heap T` is not implemented yet (Phase H); a value type cannot recurse directly." Wording lifted from §8.7 to stay stable across phases.
8. **Struct coverage check happens after pinning**, comparing the literal's field-name set against the pinned type's field-name set. Missing / unknown / duplicate diagnostics carry the field name and the target type name. Spread sources contribute their declared field set; a spread source whose static type is not the *same* type as the target is "spread source is `T1`, target is `T2`; cross-type spread is not allowed."
9. **Field access (`v.f`) and field assignment (`v.f = e;`) reuse `MemberAccessExpression`.** Resolve the receiver to a struct type, look up `f`, yield the field's type (read) or validate the L-value (write). Writes require the receiver binding to be a `let`. Writes to a `const` receiver are the existing "cannot assign to const" diagnostic, extended to struct receivers.
10. **Definite-assignment treats struct bindings whole.** `let v: T;` is uninitialized; reading or writing any field before `v = { ... };` is an error. Whole-value assignment marks it initialized. No per-field bits — partial field initialization is forbidden outright.

### Enums

11. **A `type enum` lowers to a C enum backed by `int32`.** Emit `typedef enum delta__Facing { delta__Facing_North = 0, delta__Facing_East = 90, ... } delta__Facing;`. The backing type is fixed at `int32` this phase (explicit backing types are out of scope). Implicit-mode members receive `0, 1, 2, …` computed at analyze time and emitted as explicit initializers, so the C output does not depend on the C compiler's enum-numbering rules.
12. **Enum mode is enforced in the parser.** All members bare → implicit. All members `name: literal` → explicit. Any mix → parser error. Explicit values must be integer literals; the analyzer checks each fits `int32`. Duplicate member **names** are an error; duplicate **values** are allowed.
13. **`Enum.Member` is a `MemberAccessExpression` whose receiver resolves to an enum type name.** The analyzer yields an `int32`-valued member of the enum type that interchanges with any integer type without a cast (`int32(e)` is redundant, not required). Integer → enum: an integer **literal** naming a member coerces by the pinned expected type (`const f: Facing = 90;`); an integer literal that names no member, or any non-literal / runtime integer, is a compile error. A runtime checked narrowing (trapping on illegal values) is deferred to the FFI phase.
14. **Enum comparisons lower to integer comparison** on the backing value — `==`/`!=` **and** `<`/`>`/`<=`/`>=`, between two enum operands or an enum and any integer (a member is an `int32` literal). No synthesized helper needed.

### Unions

15. **A `type union` lowers to a tagged C struct** — a discriminant enum plus an anonymous `union` of per-variant payload structs:
    ```c
    typedef struct delta__Shape {
        enum { delta__Shape_Circle, delta__Shape_Square } tag;
        union {
            struct { double r; } Circle;
            struct { double s; } Square;
        } payload;
    } delta__Shape;
    ```
    Variants and their payload fields are emitted in declaration order.
16. **Payloadless and positional payloads are parser errors.** Every variant must be `Variant{ named: T, ... }`. The two diagnostics ("union variants must carry a `{ ... }` payload" / "union payloads must use named fields") point at the union spec text.
17. **Construction is unqualified `Variant{ ... }`, pinned by the surrounding typed context.** The pinned expected type must resolve to a union; the `Variant` name selects one of its variants (and thus the payload type). The analyzer sets the value's type to that union, records the active variant tag, and type-checks the payload literal against the variant's field list using the same coverage/collision rules as struct literals (Decision 8). An unpinned `Variant{ ... }` (no typed context) is an error (mirrors Decision 3); a qualified `Union.Variant{ ... }` is rejected with a fix-it to drop the qualifier; a `Variant` the pinned union does not declare, or a `Variant` without a `{ ... }` payload, is an error.
18. **Union consumption is exhaustive `switch` with variant patterns.** `case Variant{ a, b }:` matches the tag and binds each named payload field into the case scope (shorthand binding only; renaming is out of scope). The analyzer requires the case set to cover every variant unless a `default` is present; a non-exhaustive `switch` with no `default` lists the missing variants. Pattern field names must exactly match the variant's payload fields (missing/unknown/duplicate binding → error).
19. **Union `==`/`!=` is rejected — no compiler-derived equality.** A synthesized comparison would branch on the discriminant and compare the active payload fieldwise; hiding that control flow behind `==` is disallowed (as it is for structs). The analyzer reports a structured error on any `==`/`!=` with a union operand; no `delta__<Union>_eq` helper is generated.

### Cross-cutting

20. **No ordering, no field defaults, no methods, no per-field visibility — rejected at the earliest legal stage.** Field defaults (`port: int32 = 8080`) are a parser error inside any RHS field/payload list. Methods and `public`/`private` inside a `type` body are parser errors. `<`/`>`/`<=`/`>=` between struct/union operands are analyzer errors.

## Tokenizer changes

- New reserved keyword: `type`.
- New keywords `struct`, `enum`, `union`, recognized **only immediately after `type`** (contextual keywords), so existing identifiers named `struct`/`enum`/`union` elsewhere are not stolen. (If the parser sees `type` followed by anything other than one of these three or a plain identifier/`{`… it errors; `type Name = …` without a sub-keyword is the alias form.)
- New token: `...` (three-dot ellipsis). Lexed with longest-match lookahead so `..` (range — Phase B) is not consumed prematurely: three dots → `...`, two → `..`, else `.`.
- `|` already exists (bitwise OR); the parser disambiguates type-position `|` (union alternation) from expression-position `|`.
- `&` already exists (bitwise AND); the parser disambiguates type-position `&` (struct intersection) from expression-position `&`.
- Promote `.` (single dot) to a first-class punctuation token for member access (`v.f`, `Enum.Member`, `Union.Variant`); today it is only used inside `Type.from(x)` via a special parse path.

## Parser changes

- AST nodes:
  ```go
  type TypeDeclaration struct {
      Name     string
      RHS      TypeRHS   // StructRHS, EnumRHS, UnionRHS, AliasRHS, or CompositionRHS
      Exported bool      // Phase I populates; Phase K writes false
      Position Position
  }

  type StructRHS struct { Fields []RecordField; Position Position }   // inline { f: T, ... }
  type AliasRHS  struct { Target TypeReference; Position Position }
  type CompositionRHS struct {
      Operands []CompositionOperand   // each a TypeReference or a StructRHS
      Style    CompositionStyle       // SpreadForm or IntersectionForm; informational
      Position Position
  }
  type RecordField struct { Name string; Type TypeReference; Position Position }

  type EnumRHS struct {
      Members  []EnumMember
      Mode     EnumMode   // Explicit or Implicit; parser-determined
      Position Position
  }
  type EnumMember struct { Name string; Value *int64; Position Position }   // Value nil in implicit mode

  type UnionRHS struct { Variants []UnionVariant; Position Position }
  type UnionVariant struct { Name string; Payload []RecordField; Position Position }  // Payload non-empty (enforced)

  type ObjectLiteralExpression struct { Elements []ObjectLiteralElement; Position Position }
  type FieldInit     struct { Name string; Value Expression; Position Position }
  type SpreadElement struct { Source Expression; Position Position }

  type VariantConstructionExpression struct {   // Variant{ ... }; union pinned by context
      Variant  string
      Payload  *ObjectLiteralExpression
      Position Position
  }

  type MemberAccessExpression struct { Receiver Expression; Member string; Position Position }
  ```
- **`type` RHS dispatch:** after `type`, peek for `struct` / `enum` / `union`; else parse an alias/composition RHS. `struct` → field list; `enum` → member list with mode detection; `union` → `|`-separated variant list. Parenthesized RHS is rejected ("parentheses in type RHS are not supported").
- **Struct field list:** `Name : TypeReference` repeated, comma-separated, optional trailing comma. Reject field defaults (`Name : T = Expr`), methods (`Name(...) : T { ... }`), and visibility (`public`/`private Name`) at the parser with §8 references.
- **Enum member list:** either all `Name` (implicit) or all `Name : IntLiteral` (explicit); a mix is a parser error. Comma-separated, optional trailing comma.
- **Union variant list:** `Name { payload-field-list }` separated by `|`. A variant with no `{ ... }` → "union variants must carry a payload." A payload field without `Name :` (positional) → "union payloads must use named fields."
- **Statement-vs-expression `{`:** at expression position (`=`, `return`, call args, inside a literal value, after `Union.Variant`) `{` opens an `ObjectLiteralExpression`; at statement-leading position `{` stays a `BlockStatement`.
- **Member access & construction:** extend the postfix loop to recognize `.identifier` → `MemberAccessExpression`. When an identifier at expression position is immediately followed by `{`, parse a `VariantConstructionExpression` (unqualified `Variant{ ... }`) — the same `Identifier { ... }` shape the future class literal reuses; the analyzer resolves the variant against the union pinned by context. A qualified `Type.Variant{ ... }` still parses (member-access followed by a literal) and is rejected in the analyzer. `Type.from(x)` remains a member-access special case interpreted by the analyzer.
- **`switch` patterns (extends Phase B):** a `case` label may now be `Variant{ bindingList }` (union) or an `Enum.Member` / enum-member name (enum) in addition to scalar cases. Binding list is comma-separated bare identifiers.

## Semantic analyzer changes

- **New type kinds:**
  - `TypeUserStruct` — `Name`, `Fields []{Name, Type}`, `Position`. Nominal identity: two references equal iff same `*UserStruct`. Aliases reuse the pointer.
  - `TypeUserEnum` — `Name`, `Members []{Name, Value int32}`, `Position`. Underlying repr `int32`.
  - `TypeUserUnion` — `Name`, `Variants []{Name, Payload []{Name, Type}}`, `Position`.
- **Type-declaration registration**, interleaved with the existing function/const passes:
  1. **Declare phase.** Each `type X = ...;` adds an empty nominal placeholder of the right kind under name `X` (alias RHS → "alias pending"). Forward references between declarations are allowed within the file.
  2. **Resolve phase.** `StructRHS` → type each field. `EnumRHS` → assign values (implicit: `0..n-1`; explicit: as written, checking each fits `int32`, duplicate names rejected). `UnionRHS` → type each variant's payload fields. `AliasRHS` → resolve target, bind the alias name to its `Type`. `CompositionRHS` → merge struct operand field sets with collision checks into a fresh `*UserStruct`.
  3. **Cycle check.** Worklist over struct/union declarations expanding composition operands and inline field/payload types; any back-edge (including a length-1 self field/payload) → the "introduce `heap T`" structured diagnostic (Decision 7).
- **Bidirectional inference.** `typeOfExpr(expr, expected Type)`; `expected` passed at: binding annotations, record-typed assignment L-values, call arguments (parameter type), return values (declared return type), object-literal field values, and union-payload field values (variant's field type). One level only.
- **Object-literal typing.** With a pinned struct target: classify elements; each `FieldInit` must name an existing field, not duplicated, value checked against the field type; each `SpreadElement` must be the same `*UserStruct` as the target and contributes its full field set; require exact coverage. Empty `expected` → Decision 3 error; non-struct `expected` → "object literal cannot satisfy non-struct type `T`".
- **Enum typing.** `Enum.Member` (member access with an enum-type-name receiver) → an `int32`-valued member of the enum type; unknown member → "enum `E` has no member `m`". A member interchanges with any integer type without a cast. Integer literal → enum: a literal naming a member coerces by the pinned expected type; a non-member literal, or any non-literal / runtime integer flowing into an enum slot, is an error. `==`/`!=` and `<`/`>`/`<=`/`>=` accepted between enum operands and between an enum and any integer.
- **Union typing.** `VariantConstructionExpression` (unqualified `Variant{ ... }`): resolve the pinned expected type to a union `U` (unpinned → "needs a typed context" error, Decision 3), resolve `Variant` to one of `U`'s variants (else "union `U` has no variant `V`"), type the payload literal against that variant's field list (struct coverage rules), yield type `U` with the recorded active variant. A qualified `U.Variant{ ... }` is rejected with a drop-the-qualifier fix-it. `switch` over a union: each `case Variant{ bindings }:` must name a real variant, bindings must exactly match that variant's payload field names (missing/unknown/duplicate → error) and are introduced into the case scope with the payload field types; require exhaustive variant coverage unless `default` present (non-exhaustive → list missing variants). Reading a union field outside a matching `case` is impossible by construction (no `.field` on unions) — attempting `u.field` is "cannot access variant payload directly; match with `switch`".
- **Member access typing (structs).** `v.f`: resolve `v` to a struct, look up `f`, yield its type (read) or validate L-value (write, `let`-only). Primitive receivers keep the `Type.from` path; `TypeInvalid` cascades.
- **Definite-assignment.** Struct bindings atomic (Decision 10). Enum/union bindings are likewise whole-value: `let x: Facing;` / `let s: Shape;` uninitialized until assigned a whole value.
- **Equality rejection.** Any `==`/`!=` with a struct or union operand is a structured error (custom types have no compiler-derived equality — it would be hidden control flow). No helper registry and no `RecordEqs`. Enum `==`/`!=` is accepted and lowers to an integer compare (no helper).
- **Ordering rejection.** `<`/`>`/`<=`/`>=` with any struct/union operand → structured error. Enum operands are **allowed** (integer ordering — a member is an `int32` literal).

## Codegen changes

- **Struct emission.** `typedef struct delta__Vec3 { double x; double y; double z; } delta__Vec3;`, fields in declaration order. Aliases emit nothing.
- **Enum emission.** `typedef enum delta__Facing { delta__Facing_North = 0, delta__Facing_East = 90, ... } delta__Facing;` with every value emitted explicitly (implicit mode resolved in the analyzer). `Enum.Member` lowers to the C enum constant `delta__Facing_East` (already `int32`-compatible — no cast wrapper); comparisons `a == b` / `a < b` lower to `a == b` / `a < b`; a member-naming integer literal coerced into an enum slot lowers to that member's constant.
- **Union emission.** Tagged struct per Decision 15. `U.Variant{ ... }` lowers to a compound literal setting `.tag` and the matching `.payload.Variant` sub-struct: `(delta__Shape){ .tag = delta__Shape_Square, .payload.Square = { .s = 3.0 } }`. A `switch (u) { case Variant{ b }: ... }` lowers to `switch (u.tag) { case delta__Shape_Square: { double s = u.payload.Square.s; ... } }`, each binding a local from the active payload sub-struct.
- **Object-literal lowering (structs).** Pinned literal → C compound literal in **declaration** field order (stable across source order). Spread sources expanded fieldwise for any field not explicitly provided (two-pass: collect explicit by name, then walk target fields).
- **Member access / field assignment lowering.** `v.f` → `v.f`; `v.f = e;` → `v.f = e;`. Records/unions/enums flow through C by value.
- **No equality helpers.** Struct/union `==`/`!=` is rejected at analyze time, so codegen never synthesizes a `delta__<T>_eq` helper. Enum `==`/`!=` lowers directly to an integer comparison.
- **Forward-declaration order.** Pre-pass emits all `typedef`s (structs, enums, unions) in topological order over inline field / payload dependencies before function bodies. Enums have no dependencies; the semantic cycle check guarantees a valid order for structs/unions. Aliases collapse to their target before sorting.

## Testing strategy

New fixtures under `test-source/tests/codegen/records/` (structs), `.../enums/`, and `.../unions/`.

**Struct declarations & construction (9)** — carried over from the previous draft, re-spelled with `type struct` and comma fields: `struct_basic_ok`, `struct_alias_ok`, `struct_composition_spread_ok`, `struct_composition_intersection_ok`, `literal_pinned_by_annotation_ok`, `literal_pinned_by_call_arg_ok`, `literal_pinned_by_return_ok`, `literal_unpinned_err`, `literal_field_set_errors_err` (missing/extra/duplicate).

**Struct field access, spread, composition, cycles, rejections (14)** — carried over: `field_read_ok`, `field_write_ok`, `field_write_const_err`, `field_partial_init_err`, `value_spread_full_ok`, `value_spread_cross_type_err`, `value_spread_collision_err`, `composition_field_collision_err`, `composition_non_struct_operand_err`, `composition_cycle_err`, `struct_self_field_err`, `struct_mutual_cycle_err`, `struct_eq_err` (struct `==` rejected), `struct_ordering_err`.

**Enums (7)**
- `enum_explicit_ok` — `{ North: 0, East: 90 }`, member reference + equality.
- `enum_implicit_ok` — `{ Red, Green, Blue }` auto `0,1,2`.
- `enum_mixed_err` — `{ Red: 1, Green, Blue: 3 }` rejected at parser.
- `enum_dup_name_err` / `enum_dup_value_ok` — duplicate names rejected; duplicate values accepted.
- `enum_as_int_ok` — a member is an `int32` literal usable with integer types directly (no cast), across widths; `enum_ordering_ok` — `<`/`>`/`<=`/`>=` on enum members. `enum_from_literal_ok` — an integer literal naming a member coerces by context (`const f: Facing = 90;`); `enum_from_nonmember_literal_err` — `= 91` rejected; `enum_from_runtime_int_err` — a runtime integer into an enum slot rejected (checked narrowing deferred to FFI).
- `enum_switch_exhaustive_ok` / `enum_switch_nonexhaustive_err` — missing-member diagnostic.
- `enum_emitted_ok` — snapshot: explicit C enum initializers.

**Unions (8)**
- `union_basic_ok` — construct + `switch` + payload read (the acceptance `Shape`/`area` slice).
- `union_payloadless_err` — `A | B{ ... }` rejected at parser.
- `union_positional_payload_err` — `A{ float64 }` rejected at parser.
- `union_construct_qualified_err` — the qualified `Shape.Square{ ... }` form is rejected (construction is unqualified). `union_construct_unpinned_err` — an unqualified `Square{ ... }` with no typed context is rejected (mirrors `literal_unpinned_err`).
- `union_construct_bad_variant_err` — `Shape.Triangle{ ... }` rejected.
- `union_switch_nonexhaustive_err` — missing-variant diagnostic; `union_switch_default_ok` — `default` satisfies exhaustiveness.
- `union_direct_field_access_err` — `sh.r` rejected ("match with `switch`").
- `union_eq_err` (union `==` rejected), `union_self_payload_err` (recursion → `heap T` tail).

**Out-of-scope rejections (5)** — carried over/extended: `record_method_err`, `record_visibility_err`, `record_default_err`, `anonymous_object_type_err`, `class_keyword_err` (`class` / `type class` rejected with "use `type struct`").

All earlier-phase fixtures continue to pass. Regression risk: existing fixtures that relied on `{` always opening a block at expression-following positions (none currently do).

## Stage-by-stage implementation order

1. Tokenizer: `type` keyword; contextual `struct`/`enum`/`union`; `...` token; promote `.` to a punctuation token (verify no `Type.from(x)` regression).
2. Parser: `TypeDeclaration` RHS dispatch — `StructRHS` / `AliasRHS` / `CompositionRHS`; RHS-only object-type enforcement; parser rejections for methods / visibility / defaults / anonymous object types / `class`.
3. Parser: `EnumRHS` (mode detection + mixed-mode rejection) and `UnionRHS` (payloadless + positional rejection).
4. Parser: `MemberAccessExpression`, `ObjectLiteralExpression`, `SpreadElement`, `VariantConstructionExpression`; `switch` variant/enum case labels + binding lists. Audit `Type.from`.
5. Analyzer scaffolding: `TypeUserStruct` / `TypeUserEnum` / `TypeUserUnion`; declare→resolve→cycle-check passes; alias resolution.
6. Analyzer struct composition: spread + intersection merging; cycle detector across composition + inline field/payload types.
7. Analyzer bidirectional inference: `typeOfExpr(expr, expected)` threaded through all pinning sites.
8. Analyzer struct object-literal typing: pinning, coverage, spread, errors.
9. Analyzer enums: member access, `int32(e)` cast, equality, exhaustive `switch`.
10. Analyzer unions: `Union.Variant{ ... }` construction typing, `switch` variant patterns + payload binding + exhaustiveness, no-direct-access rule.
11. Analyzer member access / field assignment / DA hookup; equality + ordering **rejection** rules for structs & unions (no `==`/`<`/`>`); enum comparisons resolve to integer compares.
12. Codegen: struct + enum + union type emission with topological ordering; smoke-check unchanged output for non-`type` programs.
13. Codegen: struct compound literals + spread; enum member/cast lowering; union construction + `switch` tag/payload lowering; member access / field assignment.
14. Fixture suite.

Steps 1–4 parser-heavy; 5–11 analyzer-heavy; 12–13 codegen-heavy. Step 7 (bidirectional inference) and step 10 (union matching) are the load-bearing changes.

## Risks and open questions

- **Statement-vs-expression `{` ambiguity.** Unchanged from the previous draft: expression-position `{` fires only from the postfix/primary parser; statement-leading `{` stays a block. A focused test confirms `{ x: 1.0 };` is not a valid statement. Union construction adds `Variant{` — an identifier directly followed by `{` in expression position, disambiguated the same way as struct object literals and the future class literal `Identifier { ... }`.
- **Union matching is the new load-bearing feature.** Payload binding introduces the first pattern-binding scope in the language. Risk: binding scope / shadowing bugs, or exhaustiveness holes. Mitigation: land union typing (step 10) behind its own fixtures before codegen; keep patterns to shorthand binding only (no renaming/nesting/guards) this phase.
- **Enum implicit numbering stability.** Implicit `{ Red, Green, Blue }` must resolve to `0,1,2` at analyze time and be emitted as explicit C initializers, so a later reordering of members is a visible source change rather than a silent value shift, and the C output never depends on the host compiler.
- **`int32` backing lock-in.** Fixing the backing type at `int32` now keeps FFI honest later only if the explicit-backing-type syntax (`type enum E: u8 = ...`) is purely additive. Reserve the `type enum Name: Type = ...` grammar slot now (parse-and-reject with "explicit enum backing types are not supported yet") so adding it later doesn't churn the parser.
- **No custom-type equality.** Structs and unions have no compiler-derived `==` / `!=` — a synthesized fieldwise (struct) or tag-dispatch (union) comparison hides control flow behind an operator. Enums compare as their backing `int32`, so no float-`==` or (future) `string`-`==` question arises for custom types.
- **Cycle-check diagnostic phrasing.** Shared across structs and unions; lift the wording from §8.7 verbatim so it stays stable ("`heap T` would break this cycle but is not implemented yet").
- **Alias chains.** `type A = B; type B = C; type C = struct{...};` — resolve follows the chain with a visited-set; alias cycles are a structured error in the cycle pass.
- **Codegen forward-declaration ordering.** Structs/unions may reference each other through inline fields/payloads. Topological sort over the field/payload dependency graph (validated acyclic by semantics); enums have no deps; aliases collapse to target before sorting.
- **Spec §8 drift.** §8 still documents the bare `type X = {...}` form with `;` fields and treats unions/enums as RHS aliases. This plan supersedes it; §8 (and §8.13) need a follow-up edit to the `type struct`/`type enum`/`type union` family before or alongside implementation.
- **Phase E overlap.** Phase E's `MemberAccessExpression`, class-literal, field-initializer, and dispose scaffolding overlap here. When Phase E begins, fold these AST nodes in rather than re-introducing them; a class literal becomes `Identifier { ... }` on top of the same field-initializer shape.

## Definition of done

- The Phase K acceptance program (Vec3 / Animal / Dog with composition + value spread, `Facing` enum with equality, `Shape` union with `switch`-based `area`) compiles and runs, exiting with status `9`.
- All Phase K fixtures pass; all earlier-phase fixtures continue to pass.
- The generated C contains a `typedef struct delta__<Struct>` per struct, a `typedef enum delta__<Enum>` (explicit `int32` initializers) per enum, and a tagged `typedef struct delta__<Union>` per union. No `delta__<T>_eq` helpers are emitted — struct/union `==`/`!=` is rejected at analyze time.
- The analyzer rejects every out-of-scope construct in the table with a structured diagnostic referencing the relevant §8 section — including mixed-mode enums, payloadless/positional union variants, qualified (`Union.Variant{ ... }`) and unpinned variant construction, non-exhaustive `switch`, direct union field access, struct/union `==`/`!=`, and the `class` keyword.
- Phase E can reuse, without reimplementing, the `MemberAccessExpression` AST node, the bidirectional `typeOfExpr` plumbing, the struct/enum/union emission codegen pass, the variant-matching `switch` machinery, and the literal-coverage / collision-checking analyzer logic.
