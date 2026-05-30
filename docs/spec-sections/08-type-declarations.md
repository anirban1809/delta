## 8. Type Declarations

Section 8 covers Delta's user-defined data type surface: the `type` keyword, declaration syntax, construction model, field visibility, composition (spread and intersection), recursion via owning heap indirection, value-equality semantics, the `same(...)` identity intrinsic, and tagged unions over named variants. The recurring principles are **nominal identity is the only identity** (two declarations with identical fields are distinct types; there is no structural subtyping anywhere), **transparency belongs to types and opacity belongs to classes** (types are pure public data with no behavior; classes — [§9](#9-classes) — carry methods, static construction functions, and per-field visibility), and **cost and ownership are visible at every site** (heap indirection is spelled with `heap T`, borrows are spelled with `borrowed T`, no silent allocations through implicit boxing or copy-on-write). Each sub-feature below follows the Proposal / Reason / Examples / Conclusion structure.

---

### 8.1 The `type` Keyword

**Proposal.** User-defined nominal data records are declared with the `type` keyword. The `interface` keyword is **reserved** for a future API-contract feature (post-MVP) and does not declare data records. The previous draft's `interface Vec3 { ... }` shape is removed entirely.

**Reason.** Across every language a Delta reader is likely to come from — TypeScript, Java, C#, Go, Swift, Kotlin — `interface` consistently means *behavioral contract*, not *data layout*. Reusing the keyword for data records imposes a permanent comprehension tax on every newcomer: the meaning at the keyword level says "contract," the meaning in the spec says "struct," and the reader has to override their reflex on every read. The keyword is paying nothing for that cost — Delta already has `class` ([§9](#9-classes)) for the behavior side, so `interface` was not pulling its weight on the data side either.

Reserving `interface` for a future contract feature keeps the word available when post-MVP design work introduces protocols, traits, or constraints. Releasing the word *and* using it inconsistently in MVP would be the worst combination.

**Examples.**
```ts
// declare a nominal data record
type Vec3 = { x: float32; y: float32; z: float32; };

// `interface` is reserved — using it as a declaration form is an error
interface Vec3 { x: float32; y: float32; z: float32; }   // ERROR — `interface` is reserved
```

**Conclusion.** Use `type` for data record declarations. `interface` is reserved.

---

### 8.2 Declaration Syntax

**Proposal.** Every `type` declaration uses the form `type Name = RHS;`. The `=` is mandatory; there is no body form (`type Name { ... }`). The RHS determines what the declaration produces:

| RHS shape                       | Effect                                                            |
|---------------------------------|-------------------------------------------------------------------|
| `{ field: T; ... }`             | **declares a fresh nominal record type**                          |
| a single named type             | declares an alias to that type                                    |
| a union of named types `A \| B` | declares an alias to a tagged union (see [§8.13](#813-tagged-unions-over-type)) |
| a named generic instantiation   | declares an alias to that instantiation                           |

The presence of `{...}` on the RHS is the only thing that distinguishes a fresh record declaration from an alias. There is no separate keyword for "alias."

**Reason.** A single declaration form keeps the surface uniform: every `type` declaration parses the same way, every reader scans the RHS to learn what the name refers to. The TS pattern of having both `interface Foo { ... }` and `type Foo = { ... }` for nominal/structural data records produces a permanent style debate inside every codebase; collapsing to one form eliminates the debate.

Choosing `=` over the body form has two further consequences. First, it matches the natural reading "type *Foo equals* this shape," which is how TS migrants already think about object-typed aliases. Second, aliases also use `=`, so the keyword *always* introduces a name and the `=` *always* attaches a definition — there is no "is this a declaration or an alias?" question at the syntactic level.

**Examples.**
```ts
// fresh nominal record
type Vec3     = { x: float32; y: float32; z: float32; };

// alias to a named type
type Position = Vec3;

// alias to a tagged union of named variants
type Token    = Identifier | Eof | Number;

// alias to a generic instantiation
type IntList  = Array<int32>;

// the body form is not allowed
type Vec3 { x: float32; y: float32; z: float32; }            // ERROR — `=` required
```

**Conclusion.** `type Name = RHS;` with `=` always required. The RHS shape distinguishes fresh records from aliases.

---

### 8.3 Anonymous Object Types

**Proposal.** The `{ field: T; ... }` object-type literal is legal in **exactly one syntactic position**: the RHS of a `type Name = ...` declaration (or as a syntactic operand of intersection / spread within such a declaration — see [§8.6](#86-composition-spread-and-intersection)). It is **not** a type that can appear as a parameter type, field type, binding annotation, return type, generic type argument, or expression position.

```ts
type Vec3 = { x: float32; y: float32; z: float32; };       // OK — RHS of a `type` declaration

function f(p: { x: float32; y: float32; }): void { ... }   // ERROR — anonymous object type
                                                           //   not allowed in parameter position
let v: { x: float32 } = ...;                                // ERROR — same in binding position
type Pair = (Array<{ x: int32 }>, { name: string });       // ERROR — same anywhere else
```

**Reason.** Delta is nominally typed; every type that values can be of has a name. Permitting anonymous object types anywhere outside the declaration site would re-introduce structural typing through the back door: every function parameter, field, or return type could carry a structural shape that overlaps with a named type without being it, and the type system would have to answer "is `{ x: float32; y: float32; z: float32 }` the same as `Vec3`?" The whole §8 model rests on "no."

Confining the object-literal shape to the *single* declaration slot collapses the question. The `{ ... }` in `type Vec3 = { ... };` is not "an anonymous structural type that gets bound to `Vec3`"; it is the *body* of the `Vec3` declaration, and it has no existence outside that role. There is no value or type in the language that has type "anonymous record with these fields."

**Examples.**
```ts
type Point = { x: int32; y: int32; };

// declaring with the literal is legal at the RHS slot only
type Origin = { x: 0; y: 0; };                              // ERROR — fields require types,
                                                            //   not value literals
type Origin = { x: int32; y: int32; };                      // OK — declares Origin

// using the literal as a type anywhere else is rejected
function midpoint(a: { x: int32; y: int32; }, b: { x: int32; y: int32; }): Point { ... }
//                  ^ ERROR             ^ ERROR
function midpoint(a: Point, b: Point): Point { ... }        // OK
```

**Conclusion.** Anonymous object-type literals live only on the RHS of `type X = ...` (and within composition operands, [§8.6](#86-composition-spread-and-intersection)). Everywhere else, a type must have a name.

---

### 8.4 Construction

**Proposal.** A value of a `type` is constructed by an object literal `{ field: value; ... }` whose nominal type is **pinned by the surrounding typed context**. Pinning sources (in order, all equivalent):

- a binding annotation: `const v: Vec3 = { ... };`
- a parameter type at a call site: `takesVec3({ ... });`
- a function's declared return type at a `return` site: `return { ... };`

Without a typed context, an object literal has **no type** and is a compile error — same shape as the empty-array-literal rule ([§4.5](#45-empty-collection-literals)).

The literal must mention **every field of the target type, exactly once**:

- Missing field → compile error.
- Extra (unknown) field → compile error.
- Duplicate field → compile error.
- Field order in the literal is irrelevant; the compiler matches by name.

For `let` bindings declared without an initializer, the only later construction path is **whole-value assignment** ([§3.3](#33-variable-bindings-and-definite-assignment), [§4.10](#410-let-without-initializer), and [§11.5](#115-whole-value-initialization-only)):

```ts
let v: Vec3;
v = { x: 1.0, y: 2.0, z: 3.0 };
useVec3(v);                          // OK — complete value definitely assigned
```

Partial initialization through fields is never allowed. `const` bindings require the full object literal at the declaration site (per [§3.3](#33-variable-bindings-and-definite-assignment), `const` always requires an initializer; there is no later mutation slot to fill).

**Reason.** Pinning the literal's nominal type from the surrounding context reuses the §4.1 bidirectional one-level inference machinery — no new mechanism. The literal carries shape information; the context carries name information; together they produce a typed value. Without context, the literal carries shape but no name, and Delta has no anonymous nominal type to give it.

Requiring exact field-set coverage prevents two failure modes: silent "did you mean to set this field?" omissions (which §8.11 doubles down on by rejecting field defaults), and silent "this extra field is being ignored" typos at construction sites. Whole-value assignment for uninitialized `let` bindings is the natural escape hatch when the complete value is selected across branches; it reuses the §3.3 DA rules without creating half-initialized records.

**Examples.**
```ts
type Vec3 = { x: float32; y: float32; z: float32; };

// const — full literal at declaration
const a: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
const b: Vec3 = { z: 3.0, y: 2.0, x: 1.0 };                  // OK — order irrelevant

// let — full literal allowed, or whole assignment later
let c: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
let d: Vec3;                                                 // uninitialized
d = { x: 1.0, y: 2.0, z: 3.0 };
useVec3(d);                                                   // OK

// errors
const e = { x: 1.0, y: 2.0, z: 3.0 };                        // ERROR — literal without context
const f: Vec3 = { x: 1.0, y: 2.0 };                          // ERROR — missing field `z`
const g: Vec3 = { x: 1.0, y: 2.0, z: 3.0, w: 4.0 };          // ERROR — unknown field `w`
const h: Vec3 = { x: 1.0, y: 2.0, z: 3.0, x: 5.0 };          // ERROR — duplicate field `x`
const i: Vec3;                                                // ERROR — const requires initializer
let j: Vec3;
j.x = 1.0;                                                    // ERROR — partial initialization is not allowed

// pinning at call and return sites
function takesVec3(v: Vec3): void { ... }
takesVec3({ x: 1.0, y: 2.0, z: 3.0 });                       // OK — pinned by parameter

function origin(): Vec3 { return { x: 0.0, y: 0.0, z: 0.0 }; }   // OK — pinned by return type

// `let → const` transfer is allowed; const cannot mutate after the transfer
let tmp: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
const final: Vec3 = move tmp;                                // tmp now invalid
final.x = 5.0;                                                // ERROR — const is immutable
```

**Conclusion.** Object literal pinned by binding / parameter / return context; bare literal without context is a hard error; every field appears exactly once; `let v: T;` may be initialized later only by whole-value assignment; `const` requires the full literal up front.

---

### 8.5 Field Visibility and the Absence of Methods

**Proposal.** Two rules together:

- **All fields of a `type` are public.** No `public` / `private` / per-field visibility modifiers are allowed inside a `type` declaration. Using one is a compile error.
- **A `type` carries no methods.** No method declarations, no static functions, no constructors, no associated constants. Behavior on data lives in **free functions** or in `class` ([§9](#9-classes)).

**Reason.** Visibility is meaningful only when paired with behavior that maintains invariants on hidden state. A `type` has no behavior, so it has no invariants to maintain, so it has no hidden state to protect: every "private" field on a pure data record would just be a field accessed through a more verbose path. That is not encapsulation, it is annotation theater.

Removing methods from `type` makes the data/behavior split razor-sharp: `type` = "transparent shape, all fields readable and writable everywhere"; `class` = "opaque object with private state, methods, and controlled construction through static functions." A reader who sees `type` knows there are no hidden invariants, no overridable behavior, no surprises — the value is exactly its fields. A reader who sees `class` knows the opposite. No middle ground.

The ergonomic cost is method-chaining (`v.normalize().scale(2)`) doesn't work on `type` values. That cost is feature, not bug: if a thing is method-chainable, it has behavior worth a `class`. For one-off helpers, free functions compose just as well: `magnitude(v)` reads only marginally worse than `v.magnitude()`, and it removes the "is this a method or a free function?" naming convention from every API.

**Examples.**
```ts
type Vec3 = { x: float32; y: float32; z: float32; };

// no methods on the type
type Vec3 = {                                                // ERROR — methods not allowed
  x: float32; y: float32; z: float32;
  magnitude(): float32 { return ...; }
};

// no visibility modifiers on fields
type User = {                                                // ERROR — `private` not allowed
  public id: uint64;
  private passwordHash: string;
};

// behavior lives on free functions
function magnitude(v: Vec3): float32 {
  return sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

const v: Vec3 = { x: 3.0, y: 4.0, z: 0.0 };
const m = magnitude(v);                                      // 5.0

// for state with invariants, use class
class Vector {
  private inner: Vec3;

  public static create(v: Vec3): Vector {
    return Vector { inner: v };
  }

  public magnitude(): float32 { return magnitude(this.inner); }
}
```

**Conclusion.** All fields public, no visibility modifiers, no methods. Behavior is free functions or classes.

---

### 8.6 Composition: Spread and Intersection

**Proposal.** A `type` declaration may reuse fields from existing record types via two equivalent operators on the RHS:

- **Spread:** `type Dog = { ...Animal; breed: string; };`
- **Intersection:** `type Dog = Animal & { breed: string; };`

The two forms produce **identical** results. Choice between them is stylistic. The semantic rules are uniform:

- The result is a **fresh nominal type** whose fields are the union of the spread / intersected operands. No subtyping relationship to any operand.
- **Field-name collisions across operands are compile errors.** No override semantics, no "child wins," no inheritance-flavored shadowing.
- Operands must be **record types** (named records, or the inline object-literal form on the RHS). Unions and aliases-to-unions cannot be operands (`{ ...Token; extra: int32; }` is an error if `Token` is a tagged union — there is no single field set to copy).
- Cyclic composition is a compile error (`type A = { ...B; ... }; type B = { ...A; ... };` — infinite expansion at declaration time).
- Mixing `|` (union) and `&` (intersection) in a single RHS requires explicit parentheses.

**Reason.** Composition by field-set merging — rather than by subtyping or inheritance — keeps the language nominally simple: every `type` declaration produces a self-contained struct layout. Change a composed-from source, every type that spreads / intersects it picks up the new field set on rebuild (per [§2.7](#27-incremental-compilation) public-interface hashing); there is no "is `Dog` still a valid `Animal`?" question, because no such relationship ever existed.

Allowing both `...` and `&` is a deliberate concession to two strong audience priors. TS migrants reach for `A & { ... }`; languages with object-literal spread reach for `{ ...A; ... }`. Both spellings express the same operation, both are unambiguous, both lower identically. The cost (two ways to do one thing) is real but contained: a style guide can pick one per project, and the absence of override semantics removes the dimension along which the two forms could diverge in meaning.

Field-collision-as-error (rather than "later wins") is the load-bearing rule. Override semantics would silently change behavior when a parent gains a field that collides with a child's existing field — exactly the inheritance footgun Delta has been avoiding throughout §§1–7.

**Examples.**
```ts
type Animal = { name: string; age: int32; };
type Owner  = { ownerId: uint64; };

// spread form
type Dog = { ...Animal; breed: string; };

// intersection form — equivalent
type Cat = Animal & { color: string; };

// multiple spreads / intersections
type PetWithOwner = { ...Animal; ...Owner; species: string; };
type CatWithOwner = Animal & Owner & { color: string; };

// no implicit conversion to operand types — fresh nominal identity
const d: Dog = { name: string.from("Rex"), age: 3, breed: string.from("Lab") };
const a: Animal = d;                                          // ERROR — Dog is not Animal
const a: Animal = { name: d.name, age: d.age };               // OK — fresh literal

// collision is an error
type Bad = { ...Animal; name: int32; };                       // ERROR — `name` from Animal collides

// can't spread a union
type Token = Identifier | Eof;
type Bad   = { ...Token; extra: int32; };                     // ERROR — union has no field set

// cyclic composition
type A = { ...B; x: int32; };
type B = { ...A; y: int32; };                                 // ERROR — cyclic spread

// mixed | and & require parens
type Bad = Animal & Owner | { extra: int32; };                // ERROR — parens required
type OK  = (Animal & Owner) | { extra: int32; };              // ERROR — unions have named variants only
```

**Conclusion.** Spread and intersection are equivalent spellings. Result is a fresh nominal type with the union of fields. Collisions are errors; cycles are errors; union operands are errors.

---

### 8.7 Recursion and Indirection: `heap T`

**Proposal.** A field of a `type` whose value is stored **off-frame through an owning heap indirection** is declared with the `heap T` form:

```ts
type Tree = { value: int32; left: heap Tree; right: heap Tree; };
```

`heap T` is the **only** built-in mechanism through which a `type` may recurse — direct self-reference (`type Tree = { value: int32; left: Tree; ... };`) is a compile error because the resulting layout has infinite size. The compiler runs a **fixed-size check at declaration time**: walks the field graph; any cycle that does not pass through `heap T` (or through a std heap-backed type such as `Array<T>` whose own representation is a `{ptr, len}` pair) is a hard error naming every type on the cycle. This is a single pass over the combined `type`/`class` field graph — inline `class` fields ([§9.1](#9-classes)) participate in the same check, so a cycle running `type → class → type` is caught uniformly.

Properties of `heap T`:

- **Allocates on construction.** Every `heap T` field owns its allocation; constructing a value implicitly allocates and stores the heap handle.
- **Auto-derefs on read.** `tree.left.value` reads through the indirection without explicit unboxing.
- **Drops on owner drop.** When the containing value is dropped, every `heap T` field's allocation is freed (recursively).
- **Legal in every type position.** Parameter types, return types, binding annotations, generic type arguments, field types — `heap T` is a type, and types compose uniformly. The only restriction is the fixed-size check at declaration time.
- **No separate user-visible heap-wrapper type.** `heap T` is the canonical syntax. Earlier alternate heap-indirection spellings are removed from the user-facing surface.

**Reason.** Recursive data structures are foundational — linked lists, trees, ASTs, JSON, the compiler's own type IR. Without an owning heap-indirection mechanism, none are expressible. `heap T` is one keyword (no generic brackets, no library type to import), reads as exactly what it does ("this value owns a heap-stored T"), and composes with the rest of the type-position grammar.

The asymmetry with `borrowed T` ([§8.8](#88-borrows-on-type-values-borrowed-t)) is intentional and load-bearing: `heap T` is a *type* that owns a heap-stored value; `borrowed T` is a *type* that does not own the value it refers to. `owned` remains an English description of lifetime responsibility, not a user-facing type modifier. Together, inline `T`, `heap T`, and `borrowed T` cover the core storage/lifetime cases: owned inline storage, owned heap storage, and temporary non-owning access.

Auto-deref on read pays for itself in tree-walking code: every node access (`node.left.right.value`) would otherwise require explicit dereference at every hop, dominating readability. The cost — readers don't see the pointer chase happening — is bounded because the field declaration is right there and the `heap` keyword is the cost signal.

Disallowing direct recursion at declaration time (rather than lazily at first instantiation) puts the diagnostic at the source of the problem. The error message names every type on the cycle and points at the field that should be indirected — same shape as the import-cycle diagnostic in [§2.5](#25-import-dag-and-execution-order).

**Examples.**
```ts
// linked list
type Cons = { head: int32; tail: heap List; };
type Nil  = { };
type List = Cons | Nil;

// binary tree
type Tree = { value: int32; left: heap Tree; right: heap Tree; };

// AST nodes
type LitExpr    = { value: int64; };
type BinaryExpr = { op: BinOp; left: heap Expr; right: heap Expr; };
type CallExpr   = { callee: heap Expr; args: Array<Expr>; };
type Expr       = LitExpr | BinaryExpr | CallExpr;

// construction — object literals flow into `heap T` fields; compiler allocates
const t: Tree = {
  value: 1,
  left:  { value: 2, left: ..., right: ... },                // pinned to Tree, allocated
  right: { value: 3, left: ..., right: ... },
};

// auto-deref on read
const v: int32 = t.left.right.value;                          // OK — two hops, no explicit deref

// direct recursion — error
type BadTree = { value: int32; left: BadTree; right: BadTree; };
// ERROR: type `BadTree` has infinite size
//   cycle: BadTree -> BadTree (field `left`)
//   fix: introduce `heap` indirection, e.g., `left: heap BadTree`

// mutual cycle without indirection
type A = { b: B; x: int32; };
type B = { a: A; y: int32; };                                 // ERROR — cycle A → B → A
                                                              // fix: one of the fields must be `heap`

// `heap T` in non-recursive positions is also allowed
function buildTree(): heap Tree { return { value: 0, left: ..., right: ... }; }
const factory: (int32) => heap Tree = ...;
const trees: Array<heap Tree> = ...;
```

**Conclusion.** `heap T` is the canonical owning heap-indirection syntax. Auto-deref on read; allocates on construction; drops on owner drop. Direct recursion is a declaration-time error; the fix is to introduce `heap` on a field along the cycle.

---

### 8.8 Borrows on Type Values: `borrowed T` and `mod borrowed T`

**Proposal.** A non-owning borrow of a type value uses the `borrowed T` form (**read-only**, the default) or the `mod borrowed T` form (**mutable**). Read-only is unmarked because it is the overwhelmingly common case; mutability is opted into with `mod` — the same keyword that marks a mutating method ([§9.5](#9-classes)), so "`mod` means may-mutate" reads consistently at both the borrow and the method level. There is **no `readonly` keyword**. The keyword `borrowed` replaces the previous draft's `ref` modifier from [§12](#12-safe-borrows-borrowed-mod-borrowed).

```ts
function read(v: borrowed Vec3): float32 { return v.x; }        // read-only borrow (default)
function update(v: mod borrowed Vec3): void { v.x += 1.0; }     // mutable borrow

let a: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
read(borrowed a);                                              // pass read-only borrow
update(mod borrowed a);                                        // pass mutable borrow
```

Properties:

- **Non-owning.** A borrow does not allocate, does not drop, and does not extend the lifetime of its referent.
- **Read-only by default; `mod` for mutation.** A `borrowed T` cannot mutate its referent; only `mod borrowed T` can. A `mod borrowed` cannot be taken from a `const` binding.
- **Auto-derefs on read.** `b.x` reads the field through the borrow without explicit dereference; symmetric with `heap T`'s read behavior ([§8.7](#87-recursion-and-indirection-heap-t)).
- **Lifetime-tracked by the ownership system.** Full rules live in [§12](#12-safe-borrows-borrowed-mod-borrowed) and [§14](#14-ownership--move-semantics); §8 inherits whatever those sections specify.
- **Parameter positions only** in MVP. Borrows as field types (which would require lifetime annotations on enclosing types) are out of scope.

**Reason.** Two decisions combine here:

- **The `ref` → `borrowed` rename.** `borrowed Vec3` reads as English, pairs symmetrically with `heap T` ([§8.7](#87-recursion-and-indirection-heap-t)) as the non-owning vs owning forms, and frees the bare `ref` keyword from carrying both a type modifier (`ref T`) and an expression operator (`ref x`). With `borrowed T` as the type and `borrowed x` as the expression, one word carries one meaning at both levels.
- **Read-only as the default, `mod` for mutation.** Most borrows only read; making the common case unmarked keeps signatures short (`borrowed Vec3`, not `readonly borrowed Vec3`), and reusing `mod` for the rare mutable case ties the borrow vocabulary to the method-mutation vocabulary — a reader who knows `mod increment()` mutates already knows `mod borrowed` mutates. Eliminating `readonly` removes a keyword entirely and removes the verbosity of the old `readonly borrowed T` (18 characters) on the path most code takes.

At the value level, `move` transfers ownership and `clone x` (fallible) deep-copies; there is no `copy` operator (plain assignment copies copyable values). `borrowed` / `mod borrowed` are the non-owning forms.

**Examples.**
```ts
type Vec3 = { x: float32; y: float32; z: float32; };

// mutable borrow
function scale(v: mod borrowed Vec3, factor: float32): void {
  v.x *= factor;
  v.y *= factor;
  v.z *= factor;
}

// read-only borrow (default)
function length(v: borrowed Vec3): float32 {
  return sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

let a: Vec3 = { x: 3.0, y: 4.0, z: 0.0 };
scale(mod borrowed a, 2.0);                                   // a is now { 6, 8, 0 }
const len = length(borrowed a);                               // 10.0

// auto-deref on field access
function firstX(v: borrowed Vec3): float32 { return v.x; }    // no explicit deref

// borrow as a field type — out of scope in MVP
type Bad = { v: borrowed Vec3; };                             // ERROR — borrows in field positions
                                                              //   require lifetime annotations
```

**Conclusion.** `borrowed T` (read-only, default) and `mod borrowed T` (mutable) are the parameter-position borrow forms; there is no `readonly` keyword. Auto-deref on read. Renaming from `ref T` resolves the prior keyword overload. Full borrow rules live in [§12](#12-safe-borrows-borrowed-mod-borrowed) and [§14](#14-ownership--move-semantics).

---

### 8.9 Equality: Compiler-Derived Structural `==`

**Proposal.** The `==` and `!=` operators are defined on a `type` **iff every field's type supports `==`** (and, transitively, `==` on those fields composes structurally). When defined, `==` performs **per-field structural equality**:

```ts
type Vec3 = { x: float32; y: float32; z: float32; };
const a: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
const b: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
a == b                                                        // true
```

`==` is **compiler-derived, not user-overridable**. There is no operator-overloading surface for it in MVP; a `type` either supports `==` (because all its fields do) or it does not (because some field doesn't).

`==` auto-derefs through `heap T` and `borrowed T` operands — the operator sees the underlying `T` value, never the indirection or the borrow representation itself ([§8.10](#810-identity-via-same) is where storage identity lives).

Ordering operators `<`, `>`, `<=`, `>=` are **not** defined on `type` values. There is no natural total order on records, and adding one would either require lexicographic ordering (which is rarely what the user means) or a user-defined comparator (which would re-introduce operator overloading).

**Reason.** For pure data records, per-field structural equality is the only meaning of `==` that does not require a side conversation. Reference identity is not natural for value types ([§8.10](#810-identity-via-same)); locale-aware equality is not a `type`-layer concern; reference-counted "same instance" equality only exists for class instances and is handled there.

Making `==` compiler-derived (and not user-overridable) closes off the dimension along which different codebases would otherwise produce different `==` definitions for the same shape of type. It also unblocks `Map<K, V>` and `Set<K>` keying on `type` values whenever the field-type predicate is satisfied, with no per-key-type configuration.

The "all fields must support `==`" gate is the honest version of the dependency. A type containing a `string` field (where `==` is banned per [§7](#7-string-family-types) in favor of `.equals()`) does not support `==`; the user must compare explicitly, field by field. The compiler emits a clear diagnostic naming the field that blocks derivation, with the suggested replacement.

**Examples.**
```ts
// types whose every field supports == → == is defined
type Vec3 = { x: float32; y: float32; z: float32; };
const a: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
const b: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
const eq = a == b;                                            // true
const ne = a != b;                                            // false

// containing a `string` blocks == derivation
type Person = { name: string; age: int32; };
const p: Person = { name: string.from("A"), age: 1 };
const q: Person = { name: string.from("A"), age: 1 };
const bad = p == q;
// ERROR: type `Person` does not support `==`
//   field `name: string` does not support `==`
//   use `.equals()` on the field, or write a comparison helper:
//     p.name.equals(q.name) && p.age == q.age

// heap and borrowed operands auto-deref
const oa: heap Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
const ob: heap Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
oa == ob                                                      // true — values compared

function compare(p: borrowed Vec3, q: borrowed Vec3): bool {
  return p == q;                                              // true if underlying values equal
}

// ordering is not defined
const less = a < b;                                           // ERROR — `<` not defined on `type`
```

**Conclusion.** `==` / `!=` are compiler-derived and structural when all field types support them; auto-deref through `heap` and `borrowed`. Ordering operators are not defined on `type`. No user override.

---

### 8.10 Identity: `same(a, b)`

**Proposal.** The compiler intrinsic `same(a, b)` returns `true` iff `a` and `b` refer to the **same underlying storage**. It is a language-level operator, not a function — same category as `panic`, `process.exit`, and `unreachable` ([§6.9](#69-exit-path-terminators)).

```ts
const a: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };
const b: Vec3 = { x: 1.0, y: 2.0, z: 3.0 };

same(borrowed a, borrowed a)                                  // true — same storage
same(borrowed a, borrowed b)                                  // false — different storage
a == b                                                        // true — values compared (per §8.9)
```

Rules:

- **Reserved name.** `same` cannot be shadowed, imported, exported, or used as an identifier in any other role.
- **Not a value.** `const f = same;` is a compile error — `same` exists only at call sites.
- **Available without import** — part of the language surface.
- **Exactly two arguments.**
- **Argument expressions must be indirected** — each argument must be an existing borrow-typed value, an explicit `borrowed ...` / `mod borrowed ...` call-site expression, or a `heap T` access path. Plain inline `T` is a compile error (inline values have no meaningful storage identity).
- **Same underlying `T` required.** `same(borrowed someVec3, borrowed someVelocity)` is a compile error — distinct types cannot share storage.
- **Mixed indirection forms are fine** if the underlying `T` matches: `same(borrowed someVec3, heapVec3)` is legal when `heapVec3: heap Vec3`.
- **Return type:** `bool`. Runtime cost: O(1) pointer comparison.

**Reason.** Storage identity is occasionally needed — cycle detection during graph traversal, aliasing guards before mutation, fast-path optimization inside `==` implementations of large structures — but it is rare in application code. A dedicated intrinsic at compiler level (rather than a std function) keeps the surface small and unambiguous: a reader who sees `same(...)` knows the question is "do these refer to the same storage?", not "are these values equal?"

Restricting the argument types to indirected forms is what makes the operation well-defined. An inline `Vec3` lives at whatever stack address its binding happens to occupy; comparing two inline values' addresses is asking the wrong question — the answer changes when the compiler reorders locals. Forcing the argument through `borrowed`, `mod borrowed`, or `heap` guarantees the address is meaningful and stable for the duration of the call.

Compiler-intrinsic status (rather than std function) earns its keep on two axes: no import needed (rare uses, not worth ceremony), and the compiler can validate the type / arity / indirection constraints with precise diagnostics rather than going through the generic function overload machinery.

**Examples.**
```ts
// graph traversal — cycle detection
function visit(node: borrowed Node, seen: borrowed Set<heap Node>): void {
  for (const s of seen) {
    if (same(node, borrowed s)) { return; }                   // already visited
  }
  seen.add(...);
  for (const child of node.children) { visit(borrowed child, seen); }
}

// aliasing guard before mutation
// Note: §12.4 rejects swap(mod borrowed x, mod borrowed x) at compile time (same root).
// This same(a, b) guard covers aliasing root-checking cannot see — e.g. two heap
// handles reaching the same node, or graph edges into shared storage.
function swap(a: mod borrowed Vec3, b: mod borrowed Vec3): void {
  if (same(a, b)) { return; }                                  // self-swap is a no-op
  const tmp: Vec3 = { x: a.x, y: a.y, z: a.z };
  a.x = b.x; a.y = b.y; a.z = b.z;
  b.x = tmp.x; b.y = tmp.y; b.z = tmp.z;
}

// invalid uses
const x: Vec3 = ...;
const y: Vec3 = ...;
same(x, y);                                                    // ERROR — inline values
                                                               //   have no storage identity

same(borrowed someVec3, borrowed someVel);                     // ERROR — Vec3 and Velocity distinct

const f = same;                                                // ERROR — not a value
function same(a, b): bool { ... }                              // ERROR — reserved name
```

**Conclusion.** `same(a, b)` is a compiler intrinsic for storage-identity comparison. Arguments must be existing borrows, explicit borrow expressions, or `heap T` values that reference the same underlying type. Distinct from `==`, which compares values.

---

### 8.11 No Field Defaults

**Proposal.** A `type` declaration **cannot** assign default values to fields. Every field is type-only:

```ts
// allowed
type Config = { port: int32; host: string; timeout: int32; };

// disallowed
type Config = {                                                // ERROR — defaults not allowed
  port: int32 = 8080;
  host: string = string.from("localhost");
};
```

Constructing a value still requires the literal to mention every field exactly once ([§8.4](#84-construction)).

**Reason.** Field defaults look ergonomic but pay for it three ways:

- **Drift.** A field's default can be changed in a future version of the type's declaration; every caller that omitted that field silently picks up the new default. The behavior change at construction sites is invisible without a diff against the type declaration. With defaults disallowed, every change to a field's value is visible at the call site.
- **Two construction rules.** With defaults, "the literal must mention every field" becomes "the literal must mention every non-default field, plus any default field the caller wants to override." Construction-site review needs per-type knowledge of which fields default to what.
- **Consistency with [§4.7](#47-class-field-declarations).** Class fields are type-only — no field-level initializers — and complete class literals inside the declaring class body establish every field. Applying the same no-defaults discipline to `type` keeps the two declaration forms aligned while preserving their construction differences.

The use case (config-like types where most callers want defaults) is well-served by free helper functions:

```ts
function defaultConfig(): Config {
  return { port: 8080, host: string.from("localhost"), timeout: 30 };
}

const c: Config = defaultConfig();
```

For "use defaults except for one field," use an explicit reconstruction helper or write the full literal at the override site; see [§8.12](#812-value-level-spread) for the value-spread interaction.

**Examples.**
```ts
type Config = { port: int32; host: string; timeout: int32; };

// defaults at the type level — disallowed
type Bad = { port: int32 = 8080; ... };                       // ERROR

// helper function for the "all defaults" case
function defaultConfig(): Config {
  return { port: 8080, host: string.from("localhost"), timeout: 30 };
}

const c1: Config = defaultConfig();

// override one field — explicit reconstruction
const base = defaultConfig();
const c2: Config = {
  port:    9090,
  host:    base.host,
  timeout: base.timeout,
};
```

**Conclusion.** No field defaults. Use helper functions for "all defaults"; use explicit reconstruction for "defaults with one override."

---

### 8.12 Value-Level Spread

**Proposal.** The `...source` spread form is legal inside an **object literal at the value level**, symmetric with the type-level spread from [§8.6](#86-composition-spread-and-intersection):

```ts
const base: Config = { port: 8080, host: string.from("localhost"), timeout: 30 };
const c: Config = { ...base };                                // OK — same as `base`'s fields
const c: Config = { ...base, ...other };                      // OK — concatenated fields
```

Rules:

- **Same-type requirement.** The spread source must have the exact same `type` as the literal's target. Cross-type spread is a compile error.
- **Additive only — no collisions.** If two operands of a literal (spreads or explicit fields) provide the same field, it is a compile error. There is no "last wins" override semantics.
- **Coverage still required.** The combined field set across all spreads + explicit fields must mention every field of the target type exactly once. Missing fields → compile error. Duplicate fields (across spreads or between a spread and an explicit field) → compile error.

**Reason.** Value spread completes the construction story: object literals can be built either by listing every field explicitly or by concatenating disjoint field sets from existing values of the same type. The same-type and additive-only rules keep value spread structurally identical to type spread — the only difference is that one operates on values, the other on type definitions.

The "no collisions / no overrides" rule is the load-bearing one. Allowing override-via-spread (`{ ...base, port: 9090 }`) would silently break when `base` changes shape: a caller writing `{ ...base, port: 9090 }` is asserting that `base` does not provide `port`, and that assertion should be visible. Without override semantics, the override pattern shifts to explicit reconstruction or a helper function ([§8.11](#811-no-field-defaults)), which makes both the source-of-truth (`base`) and the modification visible in source.

The cost — verbosity at the override site — is acceptable because override is the explicit minority case; pure spread (concatenation of disjoint field sets) is the common case and reads cleanly.

**Examples.**
```ts
type Config = { port: int32; host: string; timeout: int32; };

const base: Config = { port: 8080, host: string.from("localhost"), timeout: 30 };

// spread the whole thing
const same: Config = { ...base };                              // OK — copy

// concatenated disjoint sets
type Cluster = { name: string; replicas: int32; };
type ClusterConfig = Cluster & Config;
const cc: ClusterConfig = {
  name: string.from("primary"),
  replicas: 3,
  ...base,                                                     // contributes port, host, timeout
};

// collision — compile error
const bad: Config = { ...base, port: 9090 };
// ERROR: duplicate field `port`
//   `port` provided by spread `base` and by explicit field
//   to override, reconstruct explicitly or call a helper:
//     const c: Config = { port: 9090, host: base.host, timeout: base.timeout };

// missing field after spread
type Wide = { a: int32; b: int32; c: int32; };
const small: Wide = { ...partialOfWide };                      // ERROR — fields not covered
                                                               //   (must include any field that
                                                               //   the spread source does not)

// cross-type spread
const v: Vec3      = { x: 1.0, y: 2.0, z: 3.0 };
const vel: Velocity = { ...v };                                // ERROR — Vec3 is not Velocity
const vel: Velocity = { x: v.x, y: v.y, z: v.z };              // OK
```

**Conclusion.** Value-level spread mirrors type-level spread: same-type only, additive only, full coverage required. Override is done by explicit reconstruction or helpers, not by spread.

---

### 8.13 Tagged Unions Over `type`

**Proposal.** A `type X = A | B | C;` declaration where `A`, `B`, `C` are pre-declared named `type`s creates a **nominal tagged union** whose values are exactly one of the listed variants at runtime. The discriminant tag is **compiler-synthesized** — sized to the smallest integer that fits the variant count — and is not user-visible.

Construction rules:

- An object literal in a context typed as the union (`const t: Token = { ... };`) is **pinned to the variant whose field set it structurally matches**.
- If exactly one variant matches the literal's field set, the literal is interpreted as that variant and implicitly widened to the union.
- If zero variants match (or extra/missing fields are present), it is a compile error.
- If **multiple variants match** (two variants happen to have the same field set), construction via a bare literal in the union context is a compile error; the user must construct through an intermediate variant-typed binding to disambiguate:

  ```ts
  const id: Identifier = { name: string.from("foo") };
  const t:  Token      = id;
  ```

The union is **nominally distinct from any other union with the same variants**. `Token` and `Token2` declared with identical variant lists are different types; values do not interchange. Variants themselves remain individually constructible and assignable to multiple unions they appear in.

Variant dispatch over a tagged union, exhaustiveness checking, and field access through the narrowed variant are provided by the `switch type` statement, specified in [§30](#30-variant-dispatch-switch-type) and the surrounding error / control-flow sections. §8 commits only to the *declaration* and *construction* surface; the *dispatch* surface is downstream.

**Reason.** Pre-declared variants force every shape inside a union to have a name. The name is the discriminant in source code (`switch type (t) { case Identifier: ... }`) and pairs naturally with the nominal-only commitment from §§8.1–8.3. Inline anonymous shapes in a union (`type T = { kind: "id"; ... } | { kind: "eof"; }`) would re-open the structural-type door we closed in [§8.3](#83-anonymous-object-types) and re-introduce user-supplied literal-tag discrimination, which is a TS pattern Delta does not need.

Compiler-synthesized tags keep the runtime representation tight and uniform — no user-supplied discriminant fields cluttering each variant — and let the compiler choose the narrowest tag width per union. The cost (the tag is not directly accessible as a value) is the right cost: the only legitimate consumer of the tag is `switch type`, which has its own typed access path.

Shape-based variant pinning is the ergonomic concession that keeps construction terse for the overwhelming case where variants have distinct field sets. The ambiguous case is real but rare (a union containing two variants that happen to share a field shape); the workaround (intermediate variant-typed binding) is one extra line and reads naturally. The library-evolution risk — adding a new variant whose shape overlaps with an existing one is a potentially breaking change — is real and documented; library authors should treat variant addition as non-additive.

**Examples.**
```ts
// variant types
type Identifier = { name: string; };
type Eof        = { };
type Number     = { value: int64; };

// the union
type Token = Identifier | Eof | Number;

// construction — pinned by literal shape
const t1: Token = { name: string.from("foo") };               // pinned as Identifier
const t2: Token = { };                                         // pinned as Eof
const t3: Token = { value: 42 };                               // pinned as Number

// variants are distinct from the union
const id: Identifier = { name: string.from("foo") };
const t:  Token      = id;                                     // implicit widening
const i2: Identifier = t;                                      // ERROR — narrowing requires `switch type`
                                                               //   (Token may be any variant)

// nominal distinctness across unions
type Token2 = Identifier | Eof | Number;
const t4: Token2 = t;                                          // ERROR — Token and Token2 distinct
const t4: Token2 = id;                                         // OK — fresh widening into Token2

// ambiguous construction
type A = { x: int32; };
type B = { x: int32; };                                        // structurally identical to A
type AB = A | B;
const ab: AB = { x: 1 };                                       // ERROR — ambiguous; matches A and B
                                                               // fix:
const a: A = { x: 1 };
const ab: AB = a;                                              // OK — disambiguated

// empty variants
type Marker1 = { };
type Marker2 = { };
type Markers = Marker1 | Marker2;
const m: Markers = { };                                        // ERROR — ambiguous; matches both
const m: Markers = (someMarker1);                              // OK — go through a variant binding

// dispatch lives in §30; the variant's name is the case label, and `t` narrows inside each case
switch type (t) {
  case Identifier: { use(t.name); }
  case Eof:        { done(); }
  case Number:     { use(t.value); }
}
```

**Conclusion.** Tagged unions over named variants. Compiler-synthesized tag. Shape-based pinning in unambiguous cases; explicit two-step for ambiguous. Nominally distinct unions. Dispatch lives in [§30](#30-variant-dispatch-switch-type) via `switch type`.

---

### 8.14 Explicit Non-Goals for Section 8

The following are deliberately out of scope, either deferred to a later section or excluded permanently:

- **`interface` as a data-record declaration form** — never. `interface` is reserved for a future API-contract feature; data records use `type`.
- **The body form `type X { ... }`** — never. Declarations always use `type X = ...` with `=` mandatory.
- **Anonymous structural object types in any position outside the RHS of `type X = ...`** — never.
- **Structural subtyping or duck-typing assignability between record types** — never. Identity is nominal; two declarations with identical fields are distinct types.
- **Methods on `type` declarations** — never. Methods, static functions, and associated constants belong to `class`. Constructors do not exist for either `type` or `class`.
- **Per-field visibility modifiers** (`public`, `private`, etc.) on `type` fields — never. All fields are public.
- **Field-level default initializers** (`port: int32 = 8080`) — never. Helpers + value spread + mutate-via-let cover the use cases.
- **"Last wins" override semantics on field collisions** (either at type spread or value spread) — never. Collisions are compile errors.
- **Spread / intersection operands that are unions** — never. Operands must be record types with a single concrete field set.
- **Override / shadow / inheritance-flavored field-redefinition** in composition — never.
- **An `extends` keyword on `type`** — never. Composition is by spread or intersection, both of which produce fresh nominal types.
- **A user-visible heap-wrapper indirection type** — never. `heap T` is the canonical syntax.
- **Implicit boxing / heap promotion** of inline values — never. `heap T` is always written explicitly.
- **Direct self-reference in field types** (`type Tree = { left: Tree; ... }`) — never. Must go through `heap T` or an indirection-shaped std type.
- **Borrows in field positions** — out of scope for MVP. Would require lifetime annotations on enclosing types; revisit post-MVP.
- **User-overridable `==`** — never. Equality is compiler-derived structural per-field; types whose fields do not support `==` simply do not support `==`.
- **Ordering operators (`<`, `>`, `<=`, `>=`) on `type` values** — never. There is no natural total order on records.
- **User-defined generic `type` declarations** — deferred to the generics section ([§31](#31-generics--constraints)). MVP scope is settled in that section.
- **Inline anonymous variants inside a tagged union** (`type T = { kind: "id"; ... } | ...`) — never. Variants must be pre-declared named types.
- **User-supplied discriminant fields** on tagged-union variants — never. The tag is compiler-synthesized and not user-visible.
- **Implicit narrowing from a union back to a variant** (without `switch type`) — never. Narrowing happens only through variant dispatch ([§30](#30-variant-dispatch-switch-type)).
- **Reference identity via `==`** — never. `==` is value equality; `same(...)` is the identity intrinsic.
- **`same(...)` on inline (non-indirected) values** — never. Arguments must be existing borrows, explicit borrow expressions, or `heap T` values.

---

**Note on downstream sections.** This rewrite of §8 has knock-on effects elsewhere in the spec:

- **[§9](#9-classes)** — language unchanged in substance, but the data/behavior split is now sharpened: `type` is pure-public data with no methods; `class` is the *only* construct with methods, static construction functions, and per-field visibility. §9 should reference [§8.5](#85-field-visibility-and-the-absence-of-methods) for the rationale.
- **[§12](#12-safe-borrows-borrowed-mod-borrowed)** — the keyword change from `ref T` / `readonly ref T` to `borrowed T` (read-only, default) / `mod borrowed T` (mutable) applies uniformly; the `readonly` keyword is eliminated. Section 12 also fixes the MVP limits: borrows are parameter/call scoped, owner call sites spell `borrowed x` / `mod borrowed x`, and borrow operands are bindings or field paths rather than temporaries, indexes, or slice expressions.
- **[§14](#14-ownership--move-semantics)** — the ownership vocabulary is now `heap` (type-level, owning heap indirection), `borrowed` (type-level, non-owning), `move` (operator, ownership transfer), and `clone` (operator, explicit fallible deep copy of owned types). There is **no `copy` operator**: plain assignment copies copyable values and is an error for move-only ones. `owned` remains descriptive prose, not syntax.
- **[§18](#18-null-safety--nullable-types)** — already removed by [§3.9](#39-removal-of-nullability). The §8 model uses fallible signatures and tagged unions for absence, not nullable record types.
- **[§29](#29-tagged-unions--exhaustiveness)** — the *declaration* surface for tagged unions moves into §8 ([§8.13](#813-tagged-unions-over-type)); §29 now focuses on exhaustiveness checking and the `switch type` dispatch statement.
- **[§30](#30-variant-dispatch-switch-type)** — referenced from [§8.13](#813-tagged-unions-over-type) as the home of the `switch type` dispatch/narrowing rules (replacing the former `match`).
- **[§31](#31-generics--constraints)** — settles whether user-defined generic `type` declarations land in MVP; [§8.12](#812-value-level-spread) deferred the question.
- **[§36](#36-heap-t--arena-allocation)** — the indirection role is filled by the `heap T` keyword (which lowers to arena-aware heap allocation under the hood). §36 should be retitled and rewritten as "Arena Allocation" with `heap T` as the syntactic surface.
- **[§41](#41-ffi-safe-types)** — `type` declarations lower to C structs; FFI-safe layout rules (and the `repr "c"` / `packed` prefix-keyword forms from the [§5](#5-primitive-numeric-types) knock-on note) apply unchanged. C interop details for nominal types belong in [§41](#41-ffi-safe-types) / [§47](#47-layout-rules-reprc-packed).
- **[§47](#47-layout-rules-reprc-packed)** — `repr "c" type Foo = { ... };` and `packed type Foo = { ... };` are the prefix-keyword forms for FFI-compatible and tightly-packed layouts respectively. Behavior is unchanged from the prior `interface`-based draft.
- **[§52](#52-mvp-compiler-scope)** — MVP scope additions: `type` declarations (with `=` always), object-literal construction with context pinning, value-level spread, `heap T` indirection, compiler-derived structural `==`, `same(...)` intrinsic, tagged unions over named variants with shape-based pinning. Removed from MVP scope: `interface` as a declaration form, `ref T` / `readonly ref T` keywords (renamed), and user-visible heap-wrapper types.

These knock-on edits are tracked but not made in this section.

---
