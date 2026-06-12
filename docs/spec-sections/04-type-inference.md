## 4. Type Inference

Section 4 covers when Delta requires explicit type annotations, when it infers types from context, what the defaults are when neither annotation nor context is available, how inference interacts with literals, lambdas, generic constructors, multi-return destructuring, and uninitialized bindings, and what shape the primitive type names take. The recurring principle is **bidirectional one-level inference**: explicit annotations and parameter/return types flow one hop into the surrounding expression, never further. There is no Hindley-Milner, no cross-statement constraint solving, and no retroactive type recovery from later uses. Each sub-feature below follows the Proposal / Reason / Examples / Conclusion structure.

---

### 4.1 Inference Direction

**Proposal.** Inference is **bidirectional, one level deep**. Type information flows from exactly three sources into the immediately surrounding expression:

- An explicit binding annotation: `const x: T = expr` propagates `T` into `expr`.
- A function parameter type at a call site: `f(arg)` propagates the declared parameter type into `arg`.
- A function's declared return type: in `function f(): T { return expr; }`, `T` propagates into `expr`.

The flow stops after one hop. Inference never crosses statement boundaries, never looks at later uses of a binding to refine its type retroactively, and never solves a system of constraints spanning multiple expressions. A binding's type is fixed at its declaration; later operations must conform.

**Reason.** Three positions were considered:

- **Pure bottom-up (RHS → LHS only).** Locally diagnosable, but inconsistent with [§3.11](#311-numeric-literals)'s literal-fits-target rule (`const a: uint8 = 200;` only typechecks because the `uint8` annotation flows into the literal). Allowing that flow already commits to bidirectional inference.
- **Full Hindley-Milner / constraint-based.** Allows code like `let xs = []; xs.push(1); takesBytes(xs);` to retroactively type `xs` as `Array<uint8>`. The cost is real, not cosmetic: errors get attributed to the wrong source line ("you wrote `[]` on line 5, but the type only became wrong on line 12"); the [§2.7](#27-incremental-compilation) cache loses granularity because changing a function body can ripple inferred return types through importers; and overload resolution ([§3.7](#37-parameters-and-overloading)) becomes far harder when argument types are not known until the constraint system is solved.
- **Bidirectional one-level (chosen).** Captures the common cases (typed targets, parameter slots, return-context literals) without inviting either of the failure modes above. Errors point at the declaration, not at a downstream symptom. The compiler never needs to revisit a binding's type after its declaration site.

**Examples.**
```ts
function takesBytes(xs: Array<uint8>): void { /* ... */ }

const a: uint8 = 200;                 // OK — uint8 flows into the literal, 200 fits uint8
takesBytes([1, 2, 3]);                // OK — Array<uint8> flows into the array literal
takesBytes(new Array());              // OK — same flow into a generic constructor

const xs = [1, 2, 3];                 // inferred as Array<int32> from defaults (§4.2)
xs.push(255);                         // OK — int32 fits
takesBytes(xs);                       // ERROR — xs is Array<int32>, not Array<uint8>
                                      // fix: const xs: Array<uint8> = [1, 2, 3];

let r: int32;
if (cond) { r = 1; }
else      { r = "hello"; }            // ERROR — r's type is fixed at declaration
```

**Conclusion.** Bidirectional one-level inference. Three sources only — binding annotations, parameter types at call sites, function return types at `return` sites. Stops at the immediately surrounding expression.

---

### 4.2 Default Literal Types

**Proposal.** When a literal appears with no annotation and no surrounding type context, it takes a fixed default:

- Integer literals default to **`int32`**.
- Float literals default to **`float64`**.
- String literals default to **`StringView`** ([§7](#7-string-family-types)).
- `true` / `false` default to **`bool`**.

Defaults apply only when context is absent. In a typed context, [§3.11](#311-numeric-literals)'s literal-fits-target rule lets the literal adopt the target type if the value fits.

**Reason.** Per-type rationale:

- **`int32` over `int64`.** Delta lowers to C, where `int` is 32-bit on every platform Delta targets, so `int32` literals flow into C signatures without casts. `Array<int32>` is half the size of `Array<int64>` for data-structure-heavy code (parsers, compilers — including Delta's own self-host target per [§52](#52-mvp-compiler-scope)). Cases that genuinely need 64-bit (file offsets, timestamps, hashes) should be annotating anyway.
- **`int32` over platform-width.** Go shipped `int = pointer-width` and has paid for it: `len()` returns a platform-dependent size, FFI bindings need explicit conversions, serialization is nondeterministic. A fixed-width default eliminates the category.
- **`float64`.** Universal default in every systems language; `float32` is for memory-bound numeric code that should annotate.
- **`StringView`.** Per [§7](#7-string-family-types), literals are allocation-free; defaulting to `StringView` keeps `"hello"` zero-cost.

**Examples.**
```ts
const x = 42;                  // int32 (default)
const y = 3.14;                // float64 (default)
const s = "hello";             // StringView (default)
const b = true;                // bool

const big: int64 = 42;         // 42 adopts int64 from context (literal fits target)
const small: uint8 = 200;      // adopts uint8
const tooBig: uint8 = 256;     // ERROR — 256 doesn't fit uint8

const f: float64 = 3;          // ERROR — int → float is not implicit (§3.11)
const f: float64 = 3.0;        // OK
const f: float64 = float64(3); // OK — explicit cast
```

**Conclusion.** `int32` integer default, `float64` float default, `StringView` string default, `bool` boolean default. Defaults apply only when context is absent.

---

### 4.3 Primitive Type Naming Convention

**Proposal.** The primitive numeric and pointer-width types use the type-then-size convention:

- Signed integers: `int8`, `int16`, `int32`, `int64`, `intsize`.
- Unsigned integers: `uint8`, `uint16`, `uint32`, `uint64`, `uintsize`.
- Floating point: `float32`, `float64`.
- Other primitives: `bool`, `char`, `void`. (`never` is not a Delta type — see [§6](#6-other-primitive-types-bool-char-void).)

`intsize` and `uintsize` are pointer-width integers on the target platform — `int32` / `uint32` on 32-bit targets, `int64` / `uint64` on 64-bit targets. They are the types of `length` fields on `Array<T>`, `Slice<T>`, and similar.

There is no terse `i32` / `u32` / `f64` form, and no aliases (`int`, `uint`, `double`, `float`).

**Reason.** Two naming families exist in the wild:

- **Terse (Rust, Zig):** `i32`, `u32`, `f64`.
- **Verbose (C `stdint.h`, Go, C#):** `int32`, `uint32`, `float64`.

Verbose was chosen because (a) it reads more clearly for newcomers — the prefix is unambiguous English rather than a single-letter sigil; (b) it matches C's `stdint.h` exactly, which is what Delta lowers to and what FFI bindings will overwhelmingly target; (c) the symmetry with `float32`/`float64` is harder to break than the `f32`/`f64` shorthand.

No `int` / `uint` aliases (à la Go) because a bare `int` reads as "the default integer," which collides with `int32` being the actual default literal type and re-introduces Go's platform-width hazard. No `double` (à la C) because it breaks the size-in-the-name pattern that `int32`, `int64`, `float32` all follow.

`intsize` / `uintsize` over `intptr` / `uintptr` because the type's job is "an integer sized like a pointer," not "an integer that can hold a pointer" — and Delta's safe-references rule ([§12](#12-safe-references)) means application code does not work with pointer values anyway.

**Examples.**
```ts
const count: int32 = 1024;
const total: int64 = 1_000_000_000_000;
const flags: uint8 = 0b1010_1010;
const length: uintsize = arr.length;
const ratio: float64 = 3.14159;

// disallowed
const x: i32 = 10;             // ERROR — `i32` is not a type name
const y: int = 10;             // ERROR — no `int` alias
const z: double = 1.0;         // ERROR — no `double` alias
```

**Conclusion.** Verbose, C-stdint-style naming. No terse forms, no aliases.

---

### 4.4 Lambda Parameter and Return Inference

**Proposal.** Lambdas defer to surrounding context for their parameter types and infer their return type from their body when possible:

- **Parameter types** are inferred from the expected function-type at the lambda's expression position (callee's parameter slot, binding annotation, return-position expected type). Parameters require annotation only when no such context exists.
- **Return type** is inferred from the lambda's body when all parameter types are pinned (either by context or by explicit annotation). When parameter types are not pinned, the return type must also be explicitly annotated.
- A bare `const f = (x) => x + 1;` (no annotations, no surrounding context) is a **hard error** — same shape as the empty-literal error in §4.5.

**Reason.** This is the §4.1 bidirectional rule applied to lambdas:

- In a call like `filter(items, (item) => item > 0)`, the callee's parameter slot has a known function type — its argument types flow into the lambda's parameter types. Annotating `(item: int32)` is redundant noise that bites every callback-heavy API.
- When parameters are pinned, the body has a determinate type, and one-step inference of the return is local — no Hindley-Milner creep, no cross-function flow.
- When the lambda is bound to a name without context (`const f = (x) => ...`), there is no surrounding type to flow into the parameters. Inferring parameters from body alone is the bottom-up inference §4.1 rejects.

**Examples.**
```ts
function filter<T>(items: Slice<T>, pred: (T) => bool): Array<T> { /* ... */ }

filter(items, (item) => item > 0);                   // OK — int32 flows into `item`
filter(items, (item: int32): bool => item > 0);      // OK — explicit, redundant

// return inferred when params are pinned
const add = (a: int32, b: int32) => a + b;           // OK — return inferred as int32

// no context, no parameter annotation
const pred = (item) => item > 0;                     // ERROR — lambda has no expected type
const pred = (item: int32): bool => item > 0;        // OK — fully annotated

// return required when params aren't pinned (no-context case)
const pred = (item: int32) => item > 0;              // OK — params pinned, return inferred
```

**Conclusion.** Lambda params infer from context; return infers from body when params are pinned; bare named bindings of un-annotated lambdas are a hard error.

---

### 4.5 Empty Collection Literals

**Proposal.** Empty literals — `[]`, `new Array()`, `new Map()`, `new Set()`, etc. — have no inherent element type and are not given one by default. Their type must come from surrounding context (§4.1). Absent context, the use is a **hard compile error** at the literal itself.

There is no defaulting to `Array<int32>`, no `Array<never>` placeholder, no retroactive inference from later operations.

**Reason.** Three alternatives, all worse:

- **Default to `Array<int32>` (or any fixed type).** Arbitrary and silently wrong half the time — users intend `Array<uint8>`, `Array<StringView>`, `Array<User>`, etc.
- **Default to `Array<never>` and let the first `.push(x)` pin the element type.** Errors point at the wrong line — the `[]` is the missing-information site, the push is just the first symptom. Also requires cross-statement inference, which §4.1 rejects.
- **Look at all later uses to find a consistent type.** Full Hindley-Milner.

The chosen rule — error at the literal — diagnoses at the right line and asks the user for a one-character annotation. Same shape as §4.10's "let without initializer" rule.

**Examples.**
```ts
function build(): Array<int32> {
  const xs: Array<int32> = [];      // OK — annotation pins the element type
  xs.push(1);
  return xs;
}

function bad(): Array<int32> {
  const xs = [];                    // ERROR — empty literal without context
  xs.push(1);                       // (push doesn't retroactively type xs)
  return xs;
}

takesBytes([]);                     // OK — Array<uint8> flows in from parameter
takesBytes(new Array());            // OK — same

let result: Array<int32>;
if (cond) { result = []; }          // OK — annotation on the binding flows in
else      { result = [1, 2, 3]; }
```

**Conclusion.** Empty literals without context are hard errors. No defaulting, no `never`-typed placeholder, no cross-statement inference.

---

### 4.6 File-Scope `const`

**Proposal.** A `const` declaration at file scope follows a visibility-based rule:

- **`export const` requires an annotation.** No exception, even for obvious literals.
- **Non-exported `const` may infer its type** from the initializer, under the same §4.1 rules as a local binding.

**Reason.** The recurring §4 principle is *API boundaries get explicit types; internals can infer*. `export const` is an API boundary by definition — consumers in other modules read it and must know its type without tracing the initializer. A non-exported `const` is private to the file and is structurally identical to a local binding.

This rule is symmetric with [§3.6](#36-function-declaration-forms)'s "function signatures require annotations" — both function and exported const are visible across the module boundary and demand explicit types there.

The "annotation required when initializer isn't a literal" alternative was considered and rejected as too fuzzy: is `[1, 2, 3]` a literal? Is `MAX_USERS * 2`? `export` is a bright line.

**Examples.**
```ts
// file-private — inference allowed
const MAX_USERS = 1024;                       // int32 by default
const PI = 3.14159;                           // float64 by default
const ENDPOINTS = ["a", "b"];                 // OK — Array<StringView>

// exported — annotation required
export const DEFAULT_PORT: uint16 = 8080;     // OK
export const VERSION: StringView = "0.1.0";   // OK
export const PI = 3.14159;                    // ERROR — exported const requires annotation
```

**Conclusion.** `export const` requires annotation; non-exported `const` may infer.

---

### 4.7 Class Field Declarations

**Proposal.** Class fields are declared with **type-only syntax — no field-level initializers**. Every field is annotated at the declaration site, exactly like a `type` field, regardless of visibility (`public`, or the implicit `private` — these are the only two member visibilities; see [§9.4](#9-classes)).

Delta has no `constructor`, `new`, or `init` declaration form for classes. Class field initialization is governed by [§9.2](#92-controlled-construction): a class value is created only by a complete class literal inside the declaring class body, normally returned from a public static function such as `create`, `open`, `from`, or `parse`.

There is no `private value: int32 = 0;` form, no inferred class field type, no implicit default constructor, and no partial field-by-field construction for class values.

**Reason.** Permitting field-level initializers creates two sites where a field's value can be established — the declaration and the class construction expression — and forces the type system to reconcile them. Disallowing field initializers keeps the field type unambiguous: it is always the annotation, never an inferred type from an initializer that might silently disagree with the intended type.

Classes protect invariants, so they must be born whole. The complete class literal in [§9.2](#92-controlled-construction) is the single point where every stored field becomes valid. This matches the general [§3.3](#33-variable-bindings-and-definite-assignment) / [§11](#11-mutability-model-const-vs-let) rule for nominal values: no partial initialization through fields.

**Examples.**
```ts
class Counter {
  private value: int32;                            // type-only declaration
  private history: Array<int32>;
  private name: stringview;

  public static create(start: int32, name: stringview): Counter {
    return Counter {
      value: start,
      history: new Array<int32>(),
      name,
    };
  }

  public edit increment(): void { this.value += 1; }
  public get(): int32 { return this.value; }
}

// disallowed
class Bad {
  private value: int32 = 0;                        // ERROR — field-level initializers are not allowed
  private name = "counter";                        // ERROR — also no inference at field scope
}

class WithConstructor {
  private value: int32;

  constructor(start: int32) {                       // ERROR — classes have no constructors
    this.value = start;
  }
}

function bad(): Counter {
  let c: Counter;
  c.value = 0;                                      // ERROR — class values are not built field by field
  return c;
}

function ok(cond: bool): Counter {
  let c: Counter;                                   // OK — declare, assign a whole value before any read
  if (cond) { c = Counter.create(0, "a"); }
  else      { c = Counter.create(1, "b"); }
  return c;                                          // OK — definitely assigned on every path
}

const bad2: Counter;                                // ERROR — `const` requires a complete initializer
```

**Conclusion.** Class fields are type-only and always annotated. Classes have no constructors and no field-level initializers. Initialization happens only through complete class literals inside the declaring class body, typically exposed by public static functions.

---

### 4.8 Multi-Return Destructuring Inference

**Proposal.** The comma-form `const a, b = expr;` (introduced in [§3.3](#33-variable-bindings-and-definite-assignment) for multi-return destructuring) participates in inference per-binding:

- Each binding is inferred independently from the corresponding return position of the right-hand side.
- Per-binding annotations are allowed. `const a: T1, b = expr;` annotates `a` and infers `b`. Mismatched annotations are type errors at the binding's position.
- **`_` is the discard binding.** It introduces no name into scope, has no type to check, and drops its slot's value immediately (running ownership cleanup for owned types). `_` cannot be read, cannot be annotated, and may appear in multiple positions in the same destructure.
- Arity must match exactly. A two-return function destructured into one binding (or three) is an error.

**Reason.** Per-binding independence falls out of §4.1's one-level bidirectional rule applied to each return slot in turn. There is no temptation to find a "common destructure type" because no such thing exists.

`_` is the convention from Go, Rust, Swift, and Python. It is reserved here for the discard role and (looking ahead) for the `default`/wildcard role in [§30](#30-variant-dispatch-switch-type)'s `switch type` — committing to it now avoids churn when variant dispatch lands.

The "discard runs drop for owned values" rule is the only ownership-affecting subtlety: a function that returns an owned `string` and is destructured `const _, x = ...` must still drop the `string`, just at the destructure site rather than at a later use. Without that, `_` would be a silent leak channel.

**Examples.**
```ts
function splitName(full: StringView): StringView, StringView | ParseError { /* ... */ }

// inferred per-binding
const first, last = splitName("Ada Lovelace") as result;
check result { return 1; }

// partial annotation
const first: StringView, last = splitName("...") as result;
check result { return 1; }

// discard
const _, last = splitName("...") as result;
check result { return 1; }
console.writeLine(last);                       // OK — `last` is in scope

// disallowed
const first = splitName("...") as result;      // ERROR — arity mismatch (function returns 2)
const a, b, c = splitName("...") as result;    // ERROR — arity mismatch
const _: StringView, b = splitName("...") as result;  // ERROR — cannot annotate `_`
const _, _ = splitName("...") as result;       // OK — multiple discards allowed
console.writeLine(_);                          // ERROR — `_` is not a name
```

**Conclusion.** Per-binding inference, per-binding annotation, `_` as discard, exact arity.

---

### 4.9 Generic Type Argument Inference

**Proposal.** Generic type arguments at constructors and at generic call sites are inferred from one-level context, in two ways:

- **From a target annotation:** `const xs: Array<int32> = new Array();` — the binding's `<int32>` flows into the constructor's type-argument slot.
- **From argument types into type parameters (structural matching):** `singleton<T>(value: T): Array<T>` called as `singleton(user)` — `T` is read off the argument's type at the parameter position.

Constraints:

- Each type parameter must be **uniquely pinned** by structural matching. If `T` appears in two parameter positions and the arguments disagree (e.g., `identity<T>(a: T, b: T)` called as `identity(1, "x")`), it is an error, not an attempt at common-type unification — Delta has no subtyping, so no common type exists.
- **No partial type-argument holes.** `new Map<StringView, _>()` is not legal. Either every type argument is determined (from context or from arguments) or every one is written explicitly.
- Absent both context and structurally-pinning arguments, the generic call requires explicit type arguments.

**Reason.** Generic standard collections ship in MVP (`Array<T>`, `Map<K, V>`, `Slice<T>` per [§37](#37-standard-collections)) even though user-defined generics are deferred to post-MVP per [§52](#52-mvp-compiler-scope) — so MVP must answer the inference question for these types.

The chosen rule extends §4.1's one-step bidirectional inference into the type-argument position. Structural matching of argument types into type parameters is not unification — it is a single read of "the argument is of type `U`, the parameter is declared as `T`, so this position pins `T = U`." When multiple positions pin the same parameter, they must agree exactly; no widening, no narrowing.

Partial type-arg holes (`<X, _>`) were rejected because the "where can holes appear?" question opens onto a much larger design surface (only at trailing positions? everywhere? in interface arguments?) that does not need to be resolved for the MVP.

**Examples.**
```ts
// pinned from binding annotation
const xs: Array<int32> = new Array();                       // OK
const m: Map<StringView, int32> = new Map();                // OK

// pinned from argument
function singleton<T>(value: T): Array<T> { /* ... */ }
const b = singleton(user);                                  // OK — T = User from argument

// pinned from parameter slot at call site
function takesBytes(xs: Array<uint8>): void { /* ... */ }
takesBytes(new Array());                                    // OK — <uint8> flows in

// agreement check
function identity<T>(a: T, b: T): T { /* ... */ }
identity(1, 2);                                             // OK — both arguments pin T = int32
identity(1, "x");                                           // ERROR — T cannot be both int32 and StringView

// no context, no pinning argument
const xs = new Array();                                     // ERROR — type argument cannot be inferred
const xs = new Array<int32>();                              // OK — explicit

// no partial holes
const m: Map<StringView, _> = new Map();                    // ERROR — partial holes not allowed
```

**Conclusion.** One-step inference into type-argument positions, structural matching from arguments, exact agreement across positions, no partial holes.

---

### 4.10 `let` Without Initializer

**Proposal.** A `let` binding has the following declaration forms, in decreasing order of strictness:

| Form                  | Behavior                                                                 |
|-----------------------|--------------------------------------------------------------------------|
| `let x: T = expr;`    | Annotation pins `T`; initializer must satisfy `T` (with literal-fits).  |
| `let x = expr;`       | Type inferred from `expr` under §4.1.                                    |
| `let x: T;`           | Type pinned to `T`; DA-checked, must be assigned before any read.        |
| `let x;`              | **Hard error** — annotation or initializer required.                     |

The compiler never looks at later assignments to determine a binding's type. The type is fixed at the declaration.

**Reason.** Allowing `let x;` and recovering the type from later assignments is exactly the cross-statement inference §4.1 rejects. The two recovery strategies — "first assignment wins" and "all assignments must agree" — both have failure modes that point error messages at the wrong line:

- *First-assignment-wins:* in `let x; if (...) x = 1; else x = "hi";`, the second branch errors at the `else`, even when the *intent* may have been `string` and the first branch is the bug.
- *All-must-agree:* this is Hindley-Milner-shaped multi-site inference; rejected for the reasons in §4.1.

Forbidding `let x;` outright forces the user to make the decision at the declaration, which is the right place. The fix is one character.

This rule also keeps [§3.3](#33-variable-bindings-and-definite-assignment)'s definite-assignment analysis unambiguous. `let v: Vec3;` works because the type is pinned up front, and `v = { x: 1, y: 2, z: 3 };` later installs a complete value of that type. Without the annotation, `let v; v = { x: 1, y: 2, z: 3 };` would force the compiler to recover a nominal type from a later statement, which is exactly the cross-statement inference §4.1 rejects.

**Examples.**
```ts
// all valid
let counter: int32 = 0;
let total = 0;                          // inferred int32
let config: Config;                     // DA-checked, must assign before read
if (useDefault) { config = Config.default(); }
else            { config = parseConfig(path); }
console.writeLine(config.name);         // OK — DA satisfied

// disallowed
let x;                                  // ERROR — `let` without annotation requires an initializer
let y;
y = 1;                                  // ERROR — type of `y` was never determined
```

**Conclusion.** `let x;` (no annotation, no initializer) is a hard error. Type is fixed at the declaration.

---

### 4.11 Explicit Non-Goals for Section 4

The following are deliberately out of scope, either deferred to a later section or excluded permanently:

- **Hindley-Milner / constraint-based / multi-site inference** — never. Inference is one-level bidirectional per §4.1.
- **Retroactive type recovery from later uses** — never. A binding's type is fixed at its declaration.
- **Defaulting empty collections** to `Array<int32>`, `Array<never>`, or any other type — never. Empty literals without context are hard errors (§4.5).
- **Field-level initializers in class declarations** — never. Complete class literals inside the declaring class body establish every field (§4.7, §9.2).
- **Inference at class field scope** — never. Fields are always annotated.
- **Platform-width default integer** (`int` aliasing 32-bit on 32-bit hosts, 64-bit on 64-bit hosts) — never. The default is `int32`, fixed.
- **Terse type names** (`i32`, `u32`, `f64`) — never. The naming convention is `int32` / `uint32` / `float32` (§4.3).
- **Aliases like `int`, `uint`, `double`, `float`** — never.
- **Bottom-up inference of lambda parameter types from the body alone** — never. Parameters need context or annotation (§4.4).
- **Function signature inference at declaration sites** (inferring parameter or return types of `function` declarations from the body) — never. Function signatures are API boundaries and are always explicit.
- **Partial type-argument holes** (`Map<StringView, _>`) — never (§4.9).
- **`let x;` without annotation or initializer** — never (§4.10).
- **Inference across `if`/`else` branches into the declaring `let`** — never. Annotate the `let`, then assign per branch.

---

**Note on downstream sections.** This rewrite of §4 has knock-on effects elsewhere in the spec:

- [§5](#5-primitive-numeric-types) currently lists primitive numeric types as `i8`, `i16`, `i32`, `i64`, `isize`, `u8`, `u16`, `u32`, `u64`, `usize`, `f32`, `f64`. These must be renamed to the `int8` / `uint8` / `float32` / `intsize` convention from §4.3.
- [§6](#6-other-primitive-types-bool-char-void) references `bool`, `char`, `void`. (`never` was dropped from MVP — §6 rehomes its exit-analysis role onto a hardcoded terminator list.)
- [§9](#9-classes) owns class construction: no constructors, no `new`, no `init`; public static functions use privileged complete class literals to create values.
- Every example in §§5–51 using `i32`, `u32`, `usize`, `f64`, etc., needs to be retyped to the new naming convention. This is a mechanical pass.
- [§52](#52-mvp-compiler-scope) should be updated to list type inference (with the §4.1 bidirectional one-level form) as an explicit MVP feature.

These knock-on edits are tracked but not made in this section.

---
