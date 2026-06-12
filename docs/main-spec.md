# Delta Language — Detailed Feature Specification Plan

**Version:** 0.1
**Source:** Derived from `delta-language-spec-v0.2.md`
**Purpose:** Decompose the language into individually-reviewable features. Each feature is presented as Proposal → Reason → Examples → Conclusion, so each can be independently stress-tested, scoped, and scheduled into the MVP and post-MVP roadmap.

---

## Table of Contents

1. [Source File Convention](#1-source-file-convention)
2. [Compilation Pipeline](#2-compilation-pipeline)
3. [Basic Syntax & Variable Bindings](#3-basic-syntax--variable-bindings)
4. [Type Inference](#4-type-inference)
5. [Primitive Numeric Types](#5-primitive-numeric-types)
6. [Other Primitive Types (bool, char, void)](#6-other-primitive-types-bool-char-void)
7. [String Family Types](#7-string-family-types)
8. [Type Declarations](#8-type-declarations)
9. [Classes](#9-classes)
10. [Interfaces & Traits](#10-interfaces--traits)
11. [Mutability Model (`const` vs `let`)](#11-mutability-model-const-vs-let)
12. [Safe References (`&`, `edit &`)](#12-safe-references)
13. [Memory Safety Model](#13-memory-safety-model)
14. [Ownership & Move Semantics](#14-ownership--move-semantics)
15. [Lifetimes](#15-lifetimes)
16. [Fixed Arrays](#16-fixed-arrays)
17. [Dynamic Arrays (`Array<T>`)](#17-dynamic-arrays-arrayt)
18. [Slices (`Slice<T>`)](#18-slices-slicet)
19. [Null Safety & Nullable Types](#19-null-safety--nullable-types)
20. [Fallible Function Signatures](#20-fallible-function-signatures)
21. [Error Type Shape](#21-error-type-shape)
22. [Returning Errors (`return error as`)](#22-returning-errors-return-error-as)
23. [Consuming Fallible Calls (`as result`)](#23-consuming-fallible-calls-as-result)
24. [The `check` Block](#24-the-check-block)
25. [Multiple Return Values](#25-multiple-return-values)
26. [`void | ErrorType` Returns](#26-void--errortype-returns)
27. [Explicit Error Ignoring (`ignore`)](#27-explicit-error-ignoring-ignore)
28. [Error Wrapping & Helpers](#28-error-wrapping--helpers)
29. [Enums](#29-enums)
30. [Tagged Unions & Exhaustiveness](#30-tagged-unions--exhaustiveness)
31. [Variant Dispatch (`switch type`)](#31-variant-dispatch-switch-type)
32. [Generics & Constraints](#32-generics--constraints)
33. [Compile-Time Constants & Const Generics](#33-compile-time-constants--const-generics)
34. [Automatic Disposal](#34-automatic-disposal)
35. [Disposal Order & Arbitrary Cleanup](#35-disposal-order--arbitrary-cleanup)
36. [Allocation Model](#36-allocation-model)
37. [`heap T` & Arena Allocation](#37-heap-t--arena-allocation)
38. [Standard Collections](#38-standard-collections)
39. [Bounds Checking](#39-bounds-checking)
40. [Runtime C Boundary](#40-runtime-c-boundary)
41. [C Interoperability](#41-c-interoperability)
42. [FFI-Safe Types](#42-ffi-safe-types)
43. [Concurrency & Atomics](#43-concurrency--atomics)
44. [Modules & Visibility](#44-modules--visibility)
45. [Function Types & Lambdas](#45-function-types--lambdas)
46. [Control Flow](#46-control-flow)
47. [Decorators](#47-decorators)
48. [Layout Rules (`@repr("c")`, `@packed`)](#48-layout-rules-reprc-packed)
49. [C Code Generation Strategy](#49-c-code-generation-strategy)
50. [Optimization & Build Modes](#50-optimization--build-modes)
51. [Standard Library Surface](#51-standard-library-surface)
52. [Package Configuration (`delta.json`)](#52-package-configuration-deltajson)
53. [MVP Compiler Scope](#53-mvp-compiler-scope)
54. [Standard Library Module Catalog](#54-standard-library-module-catalog)

---

## 1. Source File Convention

> 📄 See standalone document: [spec-sections/01-source-file-convention.md](spec-sections/01-source-file-convention.md)

---

## 2. Compilation Pipeline

> 📄 See standalone document: [spec-sections/02-compilation-pipeline.md](spec-sections/02-compilation-pipeline.md)

---

## 3. Basic Syntax & Variable Bindings

> 📄 See standalone document: [spec-sections/03-basic-syntax-and-variable-bindings.md](spec-sections/03-basic-syntax-and-variable-bindings.md)

---

## 4. Type Inference

> 📄 See standalone document: [spec-sections/04-type-inference.md](spec-sections/04-type-inference.md)

---

## 5. Primitive Numeric Types

> 📄 See standalone document: [spec-sections/05-primitive-numeric-types.md](spec-sections/05-primitive-numeric-types.md)

---

## 6. Other Primitive Types (bool, char, void)

> 📄 See standalone document: [spec-sections/06-other-primitive-types.md](spec-sections/06-other-primitive-types.md)

---

## 7. String Family Types

> 📄 See standalone document: [spec-sections/07-string-family-types.md](spec-sections/07-string-family-types.md)

---

## 8. Type Declarations

> 📄 See standalone document: [spec-sections/08-type-declarations.md](spec-sections/08-type-declarations.md)

---

## 9. Classes

> 📄 See standalone document: [spec-sections/09-classes.md](spec-sections/09-classes.md)

---

## 10. Interfaces & Traits

> ⚠️ **Stub — short notes only.** To be expanded into a standalone document in a later polish pass.

**Proposal.** Two related but distinct constructs sit between [§9 Classes](#9-classes) and the mutability model:

- **Interfaces** describe *shape* — a structural contract of fields and/or methods a type must provide. Already relied on as the minimum-shape requirement for error types ([§21](#21-error-type-shape)), as generic constraints ([§32](#32-generics--constraints)), and as FFI struct layouts ([§42](#42-ffi-safe-types), [§48](#48-layout-rules-reprc-packed)). Satisfaction is **structural**: any type with the required members conforms, with no explicit `implements` clause.
- **Traits** describe *capability* — compiler-recognized behavioral markers attached with `uses` ([§9](#9-classes)). The MVP trait set is **closed**: `Copyable`, `Disposable`, and `View of S`. Traits govern ownership, disposal, and reference-aliasing, not member shape, and conformance is an explicit `uses` declaration the compiler trusts.

**Reason.** Separating "what members a type has" (interface, structural) from "what the compiler may assume about a type's resource and aliasing behavior" (trait, nominal `uses` marker) keeps the two checks independent: interface satisfaction is a structural test, trait conformance is an explicit opt-in. Folding them into one construct would force either nominal interfaces (losing the TS feel) or structural traits (losing the explicit ownership opt-in that the reference and disposal models depend on).

**Examples.**
```ts
// interface — structural shape, no `implements` needed
interface Comparable<T> {
  compareTo(other: &T): int32;
}

// trait — capability marker via `uses` (closed set in MVP)
class Buffer uses Disposable {
  dispose(): void { /* ... */ }
}
```

**Conclusion.** Stub — to be polished separately. Open questions for that pass: whether interfaces may carry default method bodies; whether the trait set stays closed or admits user-defined markers post-MVP; and the precise relationship between an interface used as a generic constraint and a trait used as one ([§32](#32-generics--constraints)).

---

## 11. Mutability Model (`const` vs `let`)

> 📄 See standalone document: [spec-sections/11-mutability-model.md](spec-sections/11-mutability-model.md)

---

## 12. Safe References (`&`, `edit &`)

> 📄 See standalone document: [spec-sections/12-safe-references.md](spec-sections/12-safe-references.md)

---

## 13. Memory Safety Model

> 📄 See standalone document: [spec-sections/13-memory-safety-model.md](spec-sections/13-memory-safety-model.md)

---

## 14. Ownership & Move Semantics

> 📄 See standalone document: [spec-sections/14-ownership-and-move-semantics.md](spec-sections/14-ownership-and-move-semantics.md)

---

## 15. Lifetimes

> 📄 See standalone document: [spec-sections/15-lifetimes.md](spec-sections/15-lifetimes.md)

---

## 16. Fixed Arrays

**Proposal.** `T[N]` syntax declares an inline, statically-sized array. Indexing is bounds-checked by default; checks may be elided when the compiler can prove safety.

**Reason.** Stack-allocated buffers are essential for systems code (parsing, networking, embedded). The `T[N]` syntax keeps it close to C while bounds-checking by default keeps it safe. Elision under proof matches Rust's iterator optimization story.

**Examples.**
```ts
const values: int32[4] = [10, 20, 30, 40];
// int32_t values[4] = {10, 20, 30, 40};

let buffer: uint8[8192];                  // stack-allocated 8 KiB
```

**Conclusion.** Adopt. Define the proof obligations for elision (e.g., constant-bounded loops, slice-length comparisons) as part of the optimizer spec.

---

## 17. Dynamic Arrays (`Array<T>`)

**Proposal.** A standard, growable, heap-backed array type with safe indexing and built-in bounds checks.

**Reason.** Equivalent to `Vec<T>` in Rust or `std::vector<T>` in C++. No safe systems language can ship without it. Bounds checks may panic on out-of-range access — predictable, debuggable failure mode beats UB.

**Examples.**
```ts
let numbers = new Array<int32>();
numbers.push(10);
numbers.push(20);
console.writeLine(numbers[0]);          // bounds-checked
const bad = numbers[100];              // runtime bounds panic unless bound with `as result`
```

**Conclusion.** Adopt. Capacity-growth strategy (doubling? 1.5×?) should be specified for predictability.

---

## 18. Slices (`Slice<T>`)

**Proposal.** A non-owning view into contiguous memory, internally `{ptr, length}`. `Slice<T>` is a view value type marked `uses View of Array<T>` ([§9.1](#9-classes), [§12.4](#12-safe-references)), so the reference checker treats it as aliasing array storage. There is **no `mut Slice<T>` type**: element-write capability follows the binding/reference rules ([§11](#11-mutability-model-const-vs-let)) — writes are allowed through a `let` slice or an `edit &Slice<T>` parameter and rejected through a `const` slice or `&Slice<T>`. Indexing is bounds-checked. User code cannot extract the underlying pointer.

**Reason.** Slices unify "view into a fixed array," "view into a dynamic array," and "view into someone else's buffer" under one type. They are the universal function-argument shape for "sequence of T." Reusing the `const`/`let` and `&`/`edit &` capability rules — instead of a separate `mut Slice` type — keeps slice mutability consistent with every other value, and the `uses View of S` marker is what lets §12.4's call-level exclusivity guard the slice against the storage it aliases. Full lifetime tracking of slices is post-MVP ([§12.11](#12-safe-references)).

**Examples.**
```ts
function sum(values: Slice<int32>): int32 {
  let total: int32 = 0;
  for (const value of values) total += value;
  return total;
}

function fill(values: edit &Slice<int32>, value: int32): void {
  for (let i: uintsize = 0; i < values.length; i++) values[i] = value;
}
```

**Conclusion.** Adopt. Defer the trickier question — slice covariance across mutable/immutable boundaries — and keep slices invariant for the MVP.

---

## 19. Null Safety & Nullable Types

**Proposal.** All types are non-nullable by default. `T?` denotes a nullable version. Access through a `T?` requires a null check first; the compiler narrows the type inside the guarded block.

**Reason.** Tony Hoare's billion-dollar mistake. Most modern languages have come to this conclusion (Kotlin, Swift, TS strictNullChecks, Rust's `Option`). Delta picks the syntactic form (`T?`) over the wrapper-type form (`Option<T>`) because it composes more cleanly with the rest of the type system and lowers to a tagged representation invisibly.

**Examples.**
```ts
function findUser(id: uint64): User? {
  if (id === 0) return null;
  return { id, name: string.from("Alice") };
}

const user = findUser(10);
console.writeLine(user.name);          // compile error: user may be null

if (user !== null) {
  console.writeLine(user.name);        // ok, narrowed
}
```

**Conclusion.** Adopt `T?` syntax with flow-sensitive narrowing. Specify the representation (probably a tag bit + value, or sentinel for pointer-shaped types).

---

## 20. Fallible Function Signatures

**Proposal.** Fallible functions return `Success | ErrorType` or `A, B, ... | ErrorType` (multi-value success). The `| ErrorType` suffix applies to the entire success list. `void | ErrorType` is allowed.

**Reason.** Delta rejects exceptions (hidden control flow), `Result<T,E>` (verbose, wraps every value), and `try` (implicit propagation). The chosen form is a third path: errors are a *channel*, not a *value*, and the compiler enforces handling at every call site. The multi-value success means "happy path returns natural tuple" without wrapping.

**Examples.**
```ts
function readText(path: stringview): string | IOError;
function readFile(path: stringview): stringview, string | IOError;
function writeText(path: stringview, content: stringview): void | IOError;

// equivalent forms:
function readFile(path: stringview): stringview, string | IOError;
function readFile(path: stringview): (stringview, string) | IOError;
```

**Conclusion.** Adopt. This is Delta's most opinionated design choice and the one most likely to attract bikeshedding. Lock it in early.

---

## 21. Error Type Shape

**Proposal.** Any type used as an error must satisfy a minimum shape: `code: stringview; message: stringview;`. The standard `Error` interface defines exactly that. Custom errors may add fields.

**Reason.** A minimum shape gives generic error-handling code something to rely on (logging, propagation, wrapping) without forcing a sealed hierarchy or runtime type tagging. Referencing `stringview` rather than `string` means error construction is allocation-free in the common case.

**Examples.**
```ts
interface Error {
  code: stringview;
  message: stringview;
}

interface IOError {
  code: stringview;
  message: stringview;
  path: stringview;
}

interface ParseError {
  code: stringview;
  message: stringview;
  line: uint32;
  column: uint32;
}
```

**Conclusion.** Adopt the structural minimum. Defer the question of error-code conventions (`"io.empty_file_name"` style) to a style guide, not the language spec.

---

## 22. Returning Errors (`return error as`)

**Proposal.** Errors are constructed and returned through the error channel via `return error as ErrorType { ... };`. Success values return normally via `return val1, val2, ...;`.

**Reason.** A dedicated keyword makes error returns visually unmistakable in code review. `as ErrorType` forces the author to name the concrete error type at the return site, which catches "what error am I actually returning?" confusion when functions have many failure modes.

**Examples.**
```ts
function readFile(fileName: stringview): stringview, string | IOError {
  if (fileName == "") {
    return error as IOError {
      code: "io.empty_file_name",
      message: "file name cannot be empty",
      fileName,
    };
  }

  const fileContent = fs.readRaw(fileName);
  return fileName, fileContent;
}
```

**Conclusion.** Adopt. The keyword `error` is otherwise unused, so the syntax is unambiguous.

---

## 23. Consuming Fallible Calls (`as result`)

**Proposal.** Every fallible call must be bound with `as resultName`. The success values are accessible but marked *pending* by the compiler until a `check` block has handled the error path.

**Reason.** This is the keystone of the error-handling story. By making `as result` mandatory, the compiler always knows where a fallible call happened and can require error handling. No "forgot to check" failure mode is possible.

**Examples.**
```ts
const fileName, fileContent = readFile("hello.txt") as result;
console.writeLine(fileContent);        // compile error: result not checked

const fileName, fileContent = readFile("hello.txt") as result;
check result {
  return 1;
}
console.writeLine(fileContent);        // ok
```

**Conclusion.** Adopt. Reserves `as` (already used for type assertions) for two distinct purposes — disambiguate carefully in the parser.

---

## 24. The `check` Block

**Proposal.** `check resultName { ... }` runs when the result is in the error state. Inside the block, `resultName.error` is accessible. Every control-flow path inside the block must exit via `return`, `panic`, `break`, `continue`, `process.exit`, or `unreachable`. There is no `else` branch.

**Reason.** The exit-path requirement is what makes the "success values are valid after `check`" guarantee sound. If the block could fall through, the compiler couldn't narrow the success state. The lack of `else` is intentional — `check` is an *error guard*, not an `if`. Recovery flows through ordinary code after the block (or a future recovery-specific construct).

**Examples.**
```ts
check result {
  console.writeLine(result.error.message);
  return 1;
}
console.writeLine(fileContent);        // success values now valid

// inside a loop:
for (const path of paths) {
  const fileName, content = readFile(path) as result;
  check result {
    console.writeLine(result.error.message);
    continue;
  }
  process(content);
}

// invalid — fall-through means success values can't be valid:
check result {
  console.writeLine(result.error.message);
}                                       // compile error
```

**Conclusion.** Adopt. The exit-path analysis recognizes terminators via a closed, compiler-known list of statement-level intrinsics (`return`, `panic`, `break`, `continue`, `process.exit`, `unreachable`) — see [§6.9](#6-other-primitive-types-bool-char-void). There is no `never` type; divergence is a structural property of those statements, not a return type.

---

## 25. Multiple Return Values

**Proposal.** Functions may declare multiple comma-separated return types, destructured at the call site with comma-separated bindings.

**Reason.** Many functions naturally return tuples (parse → position+value, split → first+rest). Forcing them through a struct wrapper is ceremony. Multiple returns also pair cleanly with the multi-value success in fallible signatures.

**Examples.**
```ts
function splitName(fullName: stringview): stringview, stringview | ParseError {
  const index = fullName.indexOf(" ");
  if (index < 0) {
    return error as ParseError { code: "name.invalid", message: "...", line: 0, column: 0 };
  }
  return fullName.slice(0, index), fullName.slice(index + 1);
}

const firstName, lastName = splitName("Ada Lovelace") as result;
```

**Conclusion.** Adopt. Generated C uses a struct internally; the user never sees it.

---

## 26. `void | ErrorType` Returns

**Proposal.** A function with no useful success value may declare `void | ErrorType` and use a bare `return;` for success. Callers still bind with `as result` and use `check`.

**Reason.** Many fallible operations (write, flush, close) have no meaningful return on success — only failure. Forcing a dummy success value would be cargo-culting. `void | ErrorType` is uniform with all other fallible signatures.

**Examples.**
```ts
function writeText(path: stringview, content: stringview): void | IOError {
  if (path == "") {
    return error as IOError { code: "io.empty_path", message: "...", path };
  }
  fs.writeRaw(path, content);
  return;
}

writeText("out.txt", "hello") as result;
check result {
  return 1;
}
```

**Conclusion.** Adopt. No new machinery required.

---

## 27. Explicit Error Ignoring (`ignore`)

**Proposal.** A fallible call whose error is intentionally discarded must be prefixed with `ignore`. A bare fallible call (no `as result`, no `ignore`) is a compile error.

**Reason.** "Silently dropped error" is a common bug class. Making it lexically visible (`ignore logger.flush();`) means code review and linting can flag it trivially. Search-ability matters: `grep ignore src/` finds every intentional drop.

**Examples.**
```ts
logger.flush();                        // compile error if flush is fallible
ignore logger.flush();                 // ok, but auditable
```

**Conclusion.** Adopt. Consider a compile-mode flag (`--deny-ignore` or similar) for strict codebases.

---

## 28. Error Wrapping & Helpers

**Proposal.** Wrapping is done manually — read the inner error inside `check`, construct a new outer error in the `return error as ...` form. Standard helpers (`Error.new`, `Error.wrap`, `Error.is`) are available for ad-hoc cases.

**Reason.** Manual wrapping is verbose but explicit. Each wrapping site decides exactly what context to add. The standard helpers cover quick-and-dirty construction without committing the language to a magic wrap operator (no `try?`, no `?` postfix).

**Examples.**
```ts
function loadConfig(path: stringview): Config | ConfigError {
  const fileName, content = readFile(path) as readResult;
  check readResult {
    return error as ConfigError {
      code: "config.read_failed",
      message: readResult.error.message,
      path,
    };
  }
  // ...
}

Error.new(code, message);
Error.wrap(err, code, message);
Error.is(err, "io.not_found");
```

**Conclusion.** Adopt. The verbosity is intentional — it pushes designers toward fewer error layers, not more.

---

## 29. Enums

**Proposal.** C-style enums: ordered list of named variants, no associated data, lowered to integer constants.

**Reason.** Distinct from tagged unions ([§30](#30-tagged-unions--exhaustiveness)). Plain enums map directly to a `typedef enum` and have predictable memory layout for FFI. Mixing data-carrying variants into the same construct (as Rust does) would conflate two different use cases.

**Examples.**
```ts
enum Color { Red, Green, Blue }
const color = Color.Red;
```

**Conclusion.** Adopt. Optional features (explicit discriminants, exhaustive switch) can be added incrementally.

---

## 30. Tagged Unions & Exhaustiveness

**Proposal.** Tagged unions are declared as unions of **pre-declared named `type`s** ([§8.13](#8-type-declarations)): `type Token = Identifier | Number | Plus | Minus | Eof;`. The discriminant tag is **compiler-synthesized and not user-visible** — there are no user-written `kind` fields. Variant dispatch is done with the `switch type` statement ([§31](#31-variant-dispatch-switch-type)), which is **exhaustiveness-checked**: every variant must have a `case` (or a `default`), and a missing variant is a compile error. The union is the type-safe stand-in for null/optional — you cannot read a variant's fields without first establishing, through `switch type`, which variant you hold.

**Reason.** This is the natural representation for AST nodes, tokens, protocol messages, finite state machines, and the optional/recursive shapes (`List = Cons | Nil`, `Tree = Leaf | Branch`) that recursive data structures need. Nominal named variants keep the model structural-free (per §8.3/§8.13) and let the compiler synthesize the narrowest tag. Exhaustiveness checking catches missing cases when the union is extended — adding a variant turns every non-`default` `switch type` into a compile error until it is handled.

**Examples.**
```ts
type Identifier = { value: stringview };
type Number     = { value: float64 };
type Plus       = { };
type Minus      = { };
type Eof        = { };
type Token      = Identifier | Number | Plus | Minus | Eof;

function printToken(token: &Token): void {
  switch type (token) {
    case Identifier: { console.writeLine(token.value); }   // `token` narrowed to Identifier here
    case Number:     { console.writeLine(token.value); }
    case Plus:       { console.writeLine("+"); }
    case Minus:      { console.writeLine("-"); }
    case Eof:        { console.writeLine("EOF"); }
  }
}
```

**Conclusion.** Adopt. Variants are pre-declared named types with a compiler-synthesized tag; dispatch and exhaustiveness are provided by `switch type` ([§31](#31-variant-dispatch-switch-type)). C lowering uses a tag enum plus a union of payloads; field access through the wrong variant is a compile error.

---

## 31. Variant Dispatch (`switch type`)

**Proposal.** `switch type (scrutinee) { case Variant: { ... } }` dispatches over the variants of a tagged union. There is **no `match` keyword** — the previously reserved word is released. Rules:

- **Narrowing.** The scrutinee is a binding; inside `case Variant:` it is narrowed to that variant's type, so the variant's fields are directly accessible (`token.value`). Accessing a different variant's fields inside the wrong `case` is a compile error. Narrowing replaces payload-destructuring — there is no separate binding syntax.
- **Exhaustiveness is mandatory.** Every variant needs a `case`, or a `default:` catch-all. A missing variant is a compile error. This is the property that makes the union a safe null-replacement: the empty/absent case cannot be forgotten.
- **No fall-through.** Each `case` is a braced, self-contained scope (per [§3.4](#3-basic-syntax--variable-bindings) per-case scoping); control exits after the block. No `break` is needed or used.
- **Distinct from value `switch`.** The ordinary `switch (expr) { case literal: }` matches values (enums, integers); the `type` keyword after `switch` selects variant-dispatch-with-narrowing over a tagged union.

**Reason.** Folding variant dispatch into `switch` (rather than a separate `match` engine) collapses two constructs into one keyword with two forms, and is simpler to specify and implement. Type-narrowing the scrutinee removes the need for a destructuring/binding sub-grammar. Mandatory exhaustiveness is the safety guarantee — it is what lets a tagged union replace null without reintroducing the "forgot to check" bug class.

**Examples.**
```ts
type Leaf   = { };
type Branch = { value: int32; left: heap Tree; right: heap Tree; };
type Tree   = Leaf | Branch;

function sum(node: &Tree): int32 {
  switch type (node) {
    case Leaf:   { return 0; }
    case Branch: { return node.value
                        + sum(&node.left)
                        + sum(&node.right); }   // `heap` auto-derefs
  }
}
```

**Conclusion.** `switch type` is the single variant-dispatch construct: narrowing, no fall-through, exhaustiveness-checked. No `match` keyword. MVP scheduling for `switch type` (and tagged unions generally) is still to be finalized — see [§53](#53-mvp-compiler-scope).

---

## 32. Generics & Constraints

**Proposal.** TypeScript-style generic functions, interfaces, and classes (`function identity<T>(x: T): T`). Constraints via `extends`: `function max<T extends Comparable<T>>(...)`. Generics are monomorphized at C codegen.

**Reason.** Generics are essential for collections (`Array<T>`, `Map<K, V>`) and for ergonomic library APIs. Monomorphization (vs. type erasure) preserves performance and matches the C lowering — the alternative would require runtime type info and indirection. Constraints via structural interfaces (`Comparable<T>`) avoid the trait/typeclass complexity of Rust/Haskell.

**Examples.**
```ts
function identity<T>(value: T): T { return value; }

interface Pair<T, U> { first: T; second: U; }

interface Comparable<T> {
  compareTo(other: &T): int32;
}

function max<T extends Comparable<T>>(a: T, b: T): T {
  return a.compareTo(&b) >= 0 ? a : b;
}
```

**Conclusion.** Adopt. Watch for code-size blowup from monomorphization; offer `@no_monomorphize` or similar opt-out only if it becomes a problem in practice.

---

## 33. Compile-Time Constants & Const Generics

**Proposal.** `const X: T = ...;` at file scope is a compile-time constant. Const generic parameters (`class FixedBuffer<const N: uintsize>`) enable size-parameterized types whose sizes are known at compile time.

**Reason.** Compile-time constants are table stakes. Const generics let standard library types like `FixedArray<T, N>` participate in the type system without erasing the size — critical for stack-allocated buffers and FFI structs.

**Examples.**
```ts
const BUFFER_SIZE: uintsize = 1024 * 64;

class FixedBuffer<const N: uintsize> {
  private data: uint8[N];
  private lengthValue: uintsize = 0;
  push(value: uint8): void | BufferError { /* ... */ }
}
```

**Conclusion.** Adopt. Const generics may land slightly after type-parameter generics; the surface syntax is forward-compatible.

---

## 34. Automatic Disposal

**Proposal.** Disposal is automatic and implicit. Every owned value is disposed when its ownership ends — most commonly at scope exit — with no keyword to opt in. There is **no `using` keyword**. A type that needs custom cleanup declares `uses Disposable` and supplies a compiler-recognized `dispose(): void` hook ([§9.7](#9-classes)); `dispose()` is never called directly by user code. Files, sockets, locks, and arenas are all cleaned up this way: acquire the value into a binding and the cleanup is guaranteed on every exit path.

To bound a value's lifetime to a region narrower than the enclosing function, extract that region into its own function. Bare `{ ... }` blocks do not introduce a scope ([§3.4](#3-basic-syntax--variable-bindings)), and there is no early-disposal operator, so the function boundary is the unit of lifetime narrowing.

**Reason.** Deterministic cleanup beats GC for files, sockets, locks, and arenas. Making it automatic rather than opt-in is what makes the [§13](#13-memory-safety-model) safety promise hold without depending on the author remembering to register each value — a forgotten `using` would have been a silent leak. Tying every cleanup to a value's ownership (rather than a free-floating registration) keeps disposal analysis identical to the move/ownership analysis already specified in [§14](#14-ownership--move-semantics): a moved-from binding is not disposed; its new owner is.

The cost is the loss of in-function lifetime narrowing without a helper function. That trade is accepted: it keeps the language smaller (no `using`, no early-disposal intrinsic) and pushes tight resource scopes toward named functions, which read better than inline scoped blocks.

**Examples.**
```ts
function copyFile(srcPath: stringview, dstPath: stringview): void | IOError {
  const src = fs.openRead(srcPath) as srcResult;
  check srcResult { return error as IOError { /* ... */ }; }

  const dst = fs.openWrite(dstPath) as dstResult;
  check dstResult { return error as IOError { /* ... */ }; }

  // ... copy loop ...
  return;
  // `dst` then `src` are disposed automatically, LIFO, on every exit path
}

// the `Disposable` hook is compiler-recognized; see §9.7
class TempFile uses Disposable {
  private path: string;
  dispose(): void { fs.remove(this.path); }
}
```

**Conclusion.** Disposal is automatic, implicit, and guaranteed on every exit path. No `using` keyword. Custom cleanup is a `uses Disposable` hook. Narrow a lifetime by extracting a function.

---

## 35. Disposal Order & Arbitrary Cleanup

**Proposal.** Within a scope, owned values are disposed in **reverse declaration order (LIFO)**, matching the reverse-field-order disposal of a single value's fields ([§9.7](#9-classes)). There is **no `defer` keyword**. Cleanup that is not naturally a value's `dispose()` — restoring a global flag, decrementing a counter, unwinding any other side effect — is expressed by wrapping it in a small `Disposable` guard value whose `dispose()` performs the action.

**Reason.** LIFO is the only order that respects dependencies between resources: a value declared later may reference or depend on one declared earlier, so it must be torn down first. It also matches C++ destructor order and reads predictably.

Removing `defer` keeps a single cleanup mechanism instead of two. Go's `defer` and an opt-in `using` would each be a second path to "run this at scope exit"; collapsing everything onto value-tied disposal means there is exactly one rule to learn and one analysis to implement. The guard-value idiom recovers the arbitrary-cleanup case without a dedicated keyword — it is the same RAII-guard pattern C++ and Rust use, and it makes the cleanup auditable as a named type rather than an anonymous deferred expression.

**Examples.**
```ts
// arbitrary cleanup via a guard value instead of `defer`
class FlagGuard uses Disposable {
  // sets a flag on construction (in its static factory), clears it on disposal
  dispose(): void { setGlobalBusy(false); }
}

function process(): void | ProcessError {
  setGlobalBusy(true);
  const guard = FlagGuard.create();   // cleared automatically on every exit path

  const work = doWork() as result;
  check result { return error as ProcessError { /* ... */ }; }
  return;
  // `guard` disposed here (and on the early-return path above)
}
```

**Conclusion.** Disposal is LIFO. No `defer`. Arbitrary cleanup is modeled as a `Disposable` guard value tied to a binding's lifetime.

---

## 36. Allocation Model

**Proposal.** Allocators are first-class. The standard provides `Allocator.system()`, `Allocator.arena()`, `Allocator.pool()`. Containers accept an allocator parameter. Applications never see raw allocation pointers.

**Reason.** A single global allocator forces unrelated subsystems to fight for the same heap. Allocator-aware containers let parsers use arenas, request handlers use per-request pools, and long-lived state use the system allocator — all in the same program. The Zig/Odin school of design.

**Examples.**
```ts
const arena = new Arena(1024 * 1024);   // disposed automatically at scope exit
const users = new Array<User>({ allocator: arena.allocator() });
```

**Conclusion.** Adopt. The std `Allocator` interface must be specified before any container can be finalized.

---

## 37. `heap T` & Arena Allocation

**Proposal.** `heap T` is a single owned heap-stored value with move semantics. `Arena` is a region allocator with scope-bounded lifetime; references into an arena cannot escape its scope.

**Reason.** `heap T` covers "one heap value, one owner" (recursive data structures, polymorphic storage). `Arena` covers "many short-lived allocations, bulk free at the end" (parsers, request handling, compilers — Delta's own self-host). Lifetime-scoping arena refs prevents the classic "freed arena, dangling pointer" bug at compile time.

**Examples.**
```ts
const user: heap User = { id: 1, name: string.from("Alice") };
console.writeLine(user.name);
const other = move user;
console.writeLine(user.name);           // compile error: moved

function parseScoped(source: stringview): AstNodeRef | ParseError {
  const arena = new Arena(1024 * 1024);   // disposed at this function's exit
  const node = parse(source, edit &arena) as parseResult;
  check parseResult { return error as ParseError { /* ... */ }; }
  return node;                            // compile error: arena ref escapes its arena's scope
}
```

**Conclusion.** Adopt both. Arena lifetime analysis is non-trivial and likely lands post-MVP; `heap T` can land in the MVP.

---

## 38. Standard Collections

**Proposal.** Ship `Array<T>`, `FixedArray<T, N>`, `Map<K, V>`, `Set<T>`, `Queue<T>`, `Deque<T>`, `string`, `StringBuilder`, `Buffer`, `Slice<T>`, `Arena`, `Pool<T>`, with owning heap indirection provided by the built-in `heap T` type form.

**Reason.** Without a strong default collection set, every project reinvents the basics or pulls in heterogeneous third-party choices. A curated set with consistent ownership and error semantics gives the ecosystem a common foundation.

**Examples.**
```ts
let map = new Map<string, int32>();
map.set(string.from("health"), 100);
const value = map.get("health") as result;
check result { console.writeLine("missing"); return; }
console.writeLine(value);
```

**Conclusion.** Adopt the full set. MVP scope can ship `Array`, `FixedArray`, `Slice`, `string`, and `heap T`, with the rest in v0.2.

---

## 39. Bounds Checking

**Proposal.** Array, slice, and string indexing are bounds-checked by default. Failed checks panic with diagnostic information when used normally, and are recoverable through `as result` when the indexing or slicing expression is bound as a fallible result. The optimizer may elide checks when validity is proven (constant indices, loop bounds verified against length).

**Reason.** Bounds checks are the canonical safety guarantee. Defaulting them on, with provable elision, gets safety in debug builds and performance in release builds. The "elide when provable" rule is what makes this not a perf footgun.

**Examples.**
```ts
const value = numbers[index];          // checked; panics if out of bounds

const safeValue = numbers[index] as result; // recoverable bounds failure
check result { return error as BoundsError { /* ... */ }; }

// generated C (conceptual):
if (index >= numbers.length) delta_panic_bounds(index, numbers.length);
value = numbers.data[index];

for (let i: uintsize = 0; i < values.length; i++) {
  total += values[i];                   // checks usually elided
}
```

**Conclusion.** Adopt. The elision rules must be specified precisely enough that users can reason about them — "the optimizer might" isn't a contract.

---

## 40. Runtime C Boundary

**Proposal.** MVP has no `@trusted` Delta modules and no raw-pointer privileges in Delta source, including standard-library Delta source. Pointer-bearing implementation detail lives below the Delta language boundary in compiler-generated C and handwritten runtime C. Public Delta APIs expose only safe abstractions.

**Reason.** A trusted Delta subset would be a second language to audit. Keeping every Delta source file on the same safe surface preserves the memory-safety promise from [§13](#13-memory-safety-model), while still allowing the backend and runtime to implement arrays, strings, slices, and disposal with ordinary C machinery.

**Examples.**
```ts
@trusted
module std.memory { }                  // ERROR - no trusted Delta modules in MVP

type Raw = { ptr: pointer<uint8>; };    // ERROR - no raw pointer type in Delta
```

**Conclusion.** Adopt for MVP. Unsafe implementation detail exists only below the Delta boundary in generated/runtime C; Delta source, including std source, remains safe source.

---

## 41. C Interoperability

**Proposal.** `extern "c" { ... }` declares C function bindings. `extern type T;` declares opaque external types. C functions are called like Delta functions. For unsafe C APIs, binding authors are expected to write safe Delta wrappers.

**Reason.** Delta lowers to C; FFI should be cheap and direct. Calling existing C libraries (zlib, libcurl, sqlite, system APIs) is a hard requirement. Forcing safe wrappers at the binding layer keeps application code safe even when wrapping an unsafe C API.

**Examples.**
```ts
extern "c" {
  function puts(message: CString): int32;
}

extern type FILE;
extern "c" {
  function fopen(path: CString, mode: CString): OpaqueHandle<FILE>;
  function fclose(file: OpaqueHandle<FILE>): int32;
}

class CFile {
  private handle: OpaqueHandle<FILE>;
  static open(path: stringview): CFile | IOError { /* ... */ }
  dispose(): void { fclose(this.handle); }
}
```

**Conclusion.** Adopt. C interop is in scope post-MVP; MVP can ship a minimal version supporting just primitive types.

---

## 42. FFI-Safe Types

**Proposal.** A specified set of types are FFI-safe (cross the C boundary by definition): all primitive integers and floats, `bool`, `CString`, `OpaqueHandle<T>`, and `@repr("c")` interfaces. Anything else needs an explicit conversion.

**Reason.** Without a defined FFI-safe set, users will pass Delta `string` (with hidden allocator state) into C and get UB. Restricting the FFI surface to a fixed set makes mistakes impossible to make accidentally.

**Examples.**
```ts
@repr("c")
interface PluginInfo {
  version: uint32;
  name: CString;
}
```

**Conclusion.** Adopt. The compiler should error on any non-FFI-safe type at an `extern` boundary.

---

## 43. Concurrency & Atomics

**Proposal.** Standard library provides `Thread`, `Mutex<T>`, and `Atomic<T>`. `Mutex<T>.lock()` returns a lock guard that releases automatically when the guard's binding goes out of scope ([§34](#34-automatic-disposal)). `Atomic<T>` supports the standard operations with explicit `MemoryOrder`.

**Reason.** No language survives without a concurrency story. Wrapping the protected data inside the mutex (`Mutex<T>` not `Mutex + T`) is a reference from Rust — it makes "I forgot to lock" impossible to express. Explicit memory ordering avoids hidden sequential-consistency costs.

**Examples.**
```ts
const counter = new Mutex<int32>(0);

const t1 = Thread.spawn(() => {
  const lock = counter.lock();   // released automatically at lambda-scope exit
  lock.value += 1;
});

const atom = new Atomic<int64>(0);
atom.fetchAdd(1, MemoryOrder.Relaxed);
```

**Conclusion.** Adopt for v0.2+. MVP can ship without concurrency; the language semantics already accommodate it.

---

## 44. Modules & Visibility

**Proposal.** ES-module-style `import`/`export` with file-based modules. Visibility is two-tier with **no `internal` keyword**:

- **Module visibility.** A top-level declaration prefixed with `export` is part of the module's public surface and importable by other modules. A top-level declaration with no `export` is **implicitly internal to its module** — visible everywhere inside the module, never outside it. There is no `public`/`private`/`internal` modifier at module scope; the presence or absence of `export` is the whole story.
- **Class-member visibility.** Inside a class body, members are `private` by default (class-body access only) and `public` when explicitly marked (accessible wherever the class itself is visible). These are the only two member visibilities ([§9.4](#9-classes)). `type` records have no member visibility — all fields are public ([§8.5](#8-type-declarations)).

Exporting a class exports the class name together with its `public` members as one unit; its `private` members remain inaccessible outside the class body regardless of export.

**Reason.** TS-shaped `export`/`import` preserves familiarity. Collapsing module visibility to "exported or not" removes the `internal` tier entirely: a four-way `public`/`private`/`internal`/`export` model forced authors to learn which of two "not fully public" levels applied where, and the distinction between "module-internal" and "type-private" was already carried by *where* a declaration lives (top level vs. class body). Two orthogonal axes — `export` for the module boundary, `private`/`public` for the class boundary — cover the same ground with one concept each and no `friend`-style complexity.

**Examples.**
```ts
// exported across modules
export type User = { id: uint64; name: string; };
export function createUser(id: uint64, name: stringview): User { /* ... */ }

// no `export` → implicitly internal to this module
function validateId(id: uint64): bool { /* ... */ }

import { User, createUser } from "./user";
import * as fs from "std/fs";

// exported class: name + public members are the cross-module surface
export class Parser {
  private tokens: Slice<Token>;          // class-body access only
  public parse(): Ast | ParseError { /* ... */ }
}
```

**Conclusion.** Adopt the two-tier model: `export` for cross-module visibility (default is module-internal), `private` (implicit) / `public` for class members. No `internal` keyword. The exact resolution rules for `"std/..."` vs `"./..."` vs package imports need specification.

---

## 45. Function Types & Lambdas

**Proposal.** Function types declared with `type X = function(args): ret`. Lambdas use arrow syntax (`(a, b) => a + b`). Closures may capture references; ownership rules apply to captures.

**Reason.** Functions as values are required for callbacks, predicates, and higher-order utilities. Arrow syntax matches TS. The ownership story for captures is what makes this non-trivial — a lambda that captures a local `string` must either reference it (and not escape the scope) or move it.

**Examples.**
```ts
type Predicate<T> = function(value: &T): bool;

const add = (a: int32, b: int32): int32 => a + b;

function filter<T>(items: Slice<T>, predicate: Predicate<T>): Array<T> {
  const out = new Array<T>();
  for (const item of items) {
    if (predicate(&item)) out.push(item);
  }
  return out;
}
```

**Conclusion.** Adopt. The capture rules need explicit specification — likely "by-reference unless moved explicitly," with escape analysis preventing reference captures from outliving their source.

---

## 46. Control Flow

**Proposal.** `if`/`else`, `while`, `for (init; cond; step)`, `for (... of ...)`, `switch`, `break`, `continue`, `return`. No `do-while`, no labels (initially), no `goto`.

**Reason.** The minimum sufficient set. C-style `for` is needed for index-based iteration with explicit types (`for (let i: uintsize = ...)`). `for...of` is the ergonomic default. Omitting `do-while` and labels keeps the grammar tight; they can be added if real code demands them.

**Examples.**
```ts
if (value > 10) console.writeLine("large");
else            console.writeLine("small");

while (running) tick();

for (let i: uintsize = 0; i < values.length; i++) console.writeLine(values[i]);
for (const value of values) console.writeLine(value);
```

**Conclusion.** Adopt the listed set. Labels and `do-while` are easy retro-fits if needed.

---

## 47. Decorators

**Proposal.** Compile-time metadata via `@name` decorators. Initial set: `@inline`, `@extern("c")`, `@repr("c")`, `@packed`. Decorators do not produce runtime values. There is no `@trusted` decorator in MVP; see [§40](#40-runtime-c-boundary) and [§13](#13-memory-safety-model).

**Reason.** A small fixed set of decorators covers the cross-cutting concerns (ABI, layout, inlining) without inventing pragma soup. Limiting decorators to compiler-recognized names (no user-defined decorators initially) keeps the language predictable.

**Examples.**
```ts
@inline
function square(x: float32): float32 { return x * x; }

@extern("c")
export function pluginInit(): int32 { return 0; }

@repr("c")
interface Vec3 { x: float32; y: float32; z: float32; }

@packed
interface EthernetHeader {
  destination: uint8[6];
  source: uint8[6];
  etherType: uint16;
}
```

**Conclusion.** Adopt the closed set. User-defined decorators can be considered post-MVP if there's pressure.

---

## 48. Layout Rules (`@repr("c")`, `@packed`)

**Proposal.** By default, the compiler controls struct layout (free to reorder for alignment/size). `@repr("c")` enforces C-compatible field order and padding. `@packed` removes padding entirely; packed-struct field access may use compiler-generated unaligned reads.

**Reason.** Most code doesn't care about layout — letting the compiler optimize is a free win. C-interop code and binary-protocol code *must* care, and `@repr("c")` / `@packed` make that opt-in explicit. The compiler still handles unaligned reads safely for packed structs.

**Examples.**
```ts
@repr("c")
interface Header { magic: uint32; version: uint16; flags: uint16; }

@packed
interface PacketHeader {
  magic: uint32;
  version: uint16;
  flags: uint16;
}
```

**Conclusion.** Adopt. The default-layout-is-reorderable rule is a meaningful break from C and must be documented loudly.

---

## 49. C Code Generation Strategy

**Proposal.** Generated C should be readable, idiomatic C11/C17 — plain structs and functions, `typedef struct {...} T;`, monomorphized generics named via mangling (`Array_int32`, `Array_User`), fallible returns as anonymous structs with `is_error` + `union { ok; error; }`.

**Reason.** Readable generated C is debuggable C. When something goes wrong, users can read the output and understand what happened. It also keeps the compiler honest — if the generated code looks weird, the source language has a leaky abstraction.

**Examples.**
```c
// from: function add(a: int32, b: int32): int32
int32_t add(int32_t a, int32_t b) { return a + b; }

// from: function readFile(...): stringview, string | IOError
typedef struct {
  bool is_error;
  union {
    struct { DeltaStringView value0; DeltaString value1; } ok;
    IOError error;
  };
} ReadFile_Return;
```

**Conclusion.** Adopt. The mangling scheme should be specified up front to avoid churn.

---

## 50. Optimization & Build Modes

**Proposal.** Three modes: `--debug` (all checks on, low opt), `--release-safe` (bounds checks on, integer overflow checks on, high opt), `--release` (selected runtime checks, integer overflow checks on, high opt, LTO). Codegen favors patterns Clang/GCC optimize well: plain structs, monomorphized generics, `restrict` when alias analysis allows, simple loops.

**Reason.** Three modes cover the major use cases: developing (catch everything), shipping conservatively (keep bounds checks), shipping for performance (trust the optimizer). The "release-safe" middle ground is critical — most servers should ship there.

**Examples.**
```bash
delta build                       # default debug
delta build --debug
delta build --release-safe
delta build --release
```

| Mode | Bounds | Overflow | Debug | Opt |
|------|--------|----------|-------|-----|
| debug | Yes | Yes | Yes | Low |
| release-safe | Yes | Yes | Optional | High |
| release | Selected | Yes | Optional | High |

**Conclusion.** Adopt the three-mode model. Default to `--debug` for `delta build` (least surprise).

---

## 51. Standard Library Surface

**Proposal.** Initial std modules: `std/core`, `std/error`, `std/array`, `std/string`, `std/buffer`, `std/io`, `std/fs`, `std/path`, `std/time`, `std/math`, `std/thread`, `std/sync`, `std/net`, `std/json`, `std/c`.

**Reason.** A "batteries included" std avoids fragmentation in the early ecosystem. The chosen modules cover the targeted domains: CLI tools, services, parsers, infrastructure. `std/json` is included because JSON is the lingua franca of config and APIs.

**Examples.** (Module list, not code.)

**Conclusion.** Adopt the module list as the target. MVP can ship `std/core`, `std/error`, `std/array`, `std/string`, `std/io`, `std/fs`. The rest land incrementally.

---

## 52. Package Configuration (`delta.json`)

**Proposal.** Per-project manifest declares package identity (`name`, `version`, `schemaVersion`), entry point, target (backend, C standard, compiler), and per-mode build options. File format is JSONC (see [§1.2](#12-manifest-file-deltajson-and-delta-init) for the dialect rules and creation flow). Schema is versioned via `schemaVersion` to permit forward evolution.

**Reason.** Configuration in a manifest beats configuration in CLI flags or environment variables — reproducible, reviewable, version-controlled. JSONC over strict JSON because build config benefits from inline comments and trailing-comma-tolerant diffs. JSONC over TOML/YAML because the spec's original JSON commitment is preserved and JSONC is a minimal, well-supported superset.

**Examples.**
```jsonc
{
  "name": "example",
  "version": "0.1.0",
  "schemaVersion": 1,

  "entry": "src/main.delta",

  "target": {
    "backend": "c",
    "standard": "c17",
    "compiler": "clang",
  },

  "build": {
    "debug":   { "opt": "O0", "checks": true },
    "release": { "opt": "O3", "lto": true, "checks": "selected" },
    // Optional: redirect build artifacts (default: ./build)
    // "outDir": "build",
  },
}
```

**Conclusion.** Adopt with JSONC + `schemaVersion`. Workspace/multi-package fields (`"workspace": { "members": [...] }`) are reserved for a future schema version — see [§1.8](#18-explicit-non-goals-for-section-1).

---

## 53. MVP Compiler Scope

**Proposal.** The first compiler ships with: lexer/parser, primitives, `const`/`let`, functions, interfaces, basic classes, control flow, fixed arrays, slices, no-nullability absence handling through fallible signatures, error-shape checking, multi-return signatures, `return error as`, mandatory `as result`, `check` with exit analysis, modules, C codegen, a minimal std, and bundled Clang invocation. Post-MVP: advanced ownership, full lifetime-tracked views, arena lifetimes, user-defined generics, tagged unions, variant dispatch (`switch type`), concurrency, C FFI, package manager, formatter, language server, doc generator, recovery-oriented error syntax.

**Reason.** The MVP scope is deliberately the *minimum* needed to write non-trivial programs in Delta — and crucially, the minimum needed to begin self-hosting the compiler. Generics, tagged unions, and variant dispatch (`switch type`) are deferred because they're not required for that bootstrap.

**Examples.** (Scope list, not code.)

**Conclusion.** Adopt the scope verbatim. The biggest risk is `check` exit analysis and ownership tracking — these are the features most likely to drag MVP timeline, so they should be prototyped first.

---

## 54. Standard Library Module Catalog

**Proposal.** Expand the §51 module list into a tiered catalog covering the full "batteries included" surface area. Modules are grouped by tier; tier numbers are organizational, not a load order. Every module is governed by the cross-cutting rules at the end of this section.

### Tier 0 — Language Runtime (always linked)

- **`std/core`** — primitive ops; `Disposable`, `Copyable`, `Movable`, `Comparable`, `Hash`, `Ordering`, `Iterator`/`IntoIterator` traits; `Allocator` interface; `Pair`/`Tuple`; debug `assert`; `panic`; `unreachable`; `process.exit`.
- **`std/error`** — shared `ErrorType` base; common variants (`IoError`, `ParseError`, `NotFound`, `Unsupported`, `OutOfMemory`, `Overflow`, `Timeout`); error-set composition helpers used across the stdlib.
- **`std/mem`** — raw `alloc`/`realloc`/`free` over `Allocator`; `copy`, `move`, `set`, `compare`, `swap`; alignment helpers; `heap T` plumbing; arena allocator.
- **`std/c`** — opaque C types; `cstring` ↔ `String` conversion; `errno` mirror; `extern "c"` glue.

### Tier 1 — Containers & Data

- **`std/array`** — `Array<T>`, `FixedArray<T, N>` (const-generic), `Slice<T>`, `edit Slice<T>`.
- **`std/string`** — `String` (owned, UTF-8), `stringview` (referenced), `Char`, `StringBuilder`, case/normalization helpers.
- **`std/buffer`** — `Buffer` (owned bytes), `ByteSlice`, endian read/write, hex/base64 conversions.
- **`std/map`** — `HashMap<K, V>`, `OrderedMap<K, V>` (insertion-ordered), `TreeMap<K, V>`.
- **`std/set`** — `HashSet<T>`, `TreeSet<T>`, `BitSet`.
- **`std/queue`** — `Deque<T>`, `Queue<T>`, `Stack<T>`, `PriorityQueue<T>`, `RingBuffer<T, N>`.
- **`std/iter`** — adapters (`map`, `filter`, `take`, `zip`, `chain`, `fold`, `collect`) over the core `Iterator` trait.

### Tier 2 — Text, Encoding, Parsing

- **`std/fmt`** — typed formatter (no `printf`); `format(...)`, `print`/`println`; `Debug`/`Display` traits.
- **`std/unicode`** — codepoints, grapheme iteration, case folding, normalization (NFC/NFD).
- **`std/regex`** — non-backtracking regex (RE2-style) over `stringview`.
- **`std/json`** — parse/serialize, streaming decoder, schema-light bindings.
- **`std/toml`**, **`std/yaml`**, **`std/csv`** — common config/data formats.
- **`std/xml`** — minimal SAX-style + DOM.
- **`std/base64`**, **`std/hex`**, **`std/url`** — encoding utilities.

### Tier 3 — I/O & OS

- **`std/io`** — `Reader`/`Writer`/`Seeker` traits; `BufReader`, `BufWriter`; `stdin`/`stdout`/`stderr`; `copy`.
- **`std/fs`** — files, directories, metadata, permissions, temp files, atomic rename, `walkDir` iterator.
- **`std/path`** — pure path manipulation (no fs access), platform-aware.
- **`std/os`** — `args`, `env`, `cwd`, signals, exit codes, user/host info.
- **`std/process`** — spawn child processes, pipes, exit status.
- **`std/time`** — `Instant`, `Duration`, `SystemTime`, monotonic clock, sleep.
- **`std/date`** — civil dates, calendar arithmetic, timezone DB hook.
- **`std/log`** — leveled logger, structured fields, sinks.

### Tier 4 — Concurrency

- **`std/thread`** — OS threads, join, thread-local storage.
- **`std/sync`** — `Mutex<T>`, `RwLock<T>`, `Once`, `Condvar`, `Barrier`, `WaitGroup`; lock guards via `Disposable`.
- **`std/atomic`** — `Atomic<T>`, `MemoryOrder`.
- **`std/channel`** — typed bounded/unbounded MPMC channels.
- **`std/task`** — lightweight task scheduler / executor (post-MVP; namespace reserved now).

### Tier 5 — Numerics

- **`std/math`** — `sin`/`cos`/`exp`/`log`, constants, `clamp`, `lerp`, integer helpers.
- **`std/random`** — seedable PRNG (xoshiro); CSPRNG lives in `std/crypto/rand`.
- **`std/bigint`**, **`std/bigfloat`**, **`std/decimal`** — arbitrary precision.
- **`std/bits`** — popcount, leading/trailing zeros, byte swap.

### Tier 6 — Network

- **`std/net`** — TCP, UDP, Unix sockets; address parsing; DNS.
- **`std/net/tls`** — TLS client/server (wraps a pinned crypto backend).
- **`std/http`** — HTTP/1.1 + HTTP/2 client and server; `Request`/`Response`.
- **`std/ws`** — WebSocket client/server.

### Tier 7 — Crypto & Integrity

- **`std/crypto/hash`** — SHA-2, SHA-3, BLAKE3; MD5 (legacy).
- **`std/crypto/hmac`**, **`std/crypto/aead`** — HMAC; AES-GCM, ChaCha20-Poly1305.
- **`std/crypto/rand`** — CSPRNG.
- **`std/crypto/pkey`** — Ed25519, X25519, ECDSA P-256.
- **`std/checksum`** — CRC32/64, Adler32.
- **`std/compress`** — gzip, deflate, zstd.

### Tier 8 — Diagnostics & Dev Tooling

- **`std/test`** — test runner integration; `expect`/`expectError`; golden files; benchmarks.
- **`std/bench`** — microbench harness with statistical noise reporting.
- **`std/debug`** — backtrace capture; DWARF symbolication of generated C.
- **`std/trace`** — span-based tracing; exporter hooks.
- **`std/metrics`** — counters, gauges, histograms.

### Tier 9 — Reserved Namespaces (carve now, fill later)

- **`std/db`** — SQLite-first driver; generic `Connection`/`Statement`.
- **`std/uuid`**, **`std/ulid`** — identifier generation.
- **`std/cli`** — arg parsing, subcommands, help generation.
- **`std/embed`** — compile-time file embedding via the bundled toolchain.

### Cross-cutting rules for every stdlib module

1. **Reference-first APIs.** Readers take `&`; mutators take `edit &`. No by-value `String` consumption unless ownership genuinely transfers. (Reinforces the guideline in [`docs/improvement-ideas.md`](improvement-ideas.md).)
2. **No `new`.** All constructors are `.create(...)` or other named factories — consistent with [§9](#9-classes) and the user-class rule.
3. **Fallible everything.** I/O, parsing, allocation, and network calls surface as `Success | IoError` (etc.), never thrown. Callers bind with `as result` and discharge with `check` ([§30](#30-error-state-discharge)).
4. **Explicit allocator.** Every container takes an `Allocator` (defaulting to the process allocator) so arenas and test allocators slot in without rewriting call sites.
5. **No hidden globals.** `stdin`/`stdout`/`stderr`/env are accessed through `std/io` and `std/os` handles, not free-floating macros.

### Phasing relative to §51 MVP

§51 ships `core`, `error`, `array`, `string`, `io`, `fs` in MVP. This catalog adds **`std/mem`** and **`std/fmt`** to that MVP set — both are load-bearing for everything above them and small enough to land with the bootstrap. All other modules in tiers 1–9 land incrementally post-MVP, in roughly tier order.

**Reason.** Pinning the namespace up front prevents ecosystem fragmentation: third-party packages won't squat on `std/*`-shaped names, and downstream code can write `import { ... } from "std/http"` knowing the import path is stable before the module is fully implemented. Tiering communicates *load-bearingness*, not implementation priority — `std/fmt` is Tier 2 but ships in MVP because everything else prints through it.

**Examples.** (Module catalog, not code.)

**Conclusion.** Adopt the tiered catalog as the target stdlib surface. Promote `std/mem` and `std/fmt` into the MVP set alongside the §51 six. Treat tier numbers as documentation of dependency direction, not as a build schedule.

---

## Appendix: Cross-Cutting Risks

These are the design choices most likely to need revision once the MVP exists:

1. **Ownership classifier rule.** "Copyable when all fields copyable" is recursive — needs a precise base case and handling for types like `stringview` (reference, not owned).
2. **Lifetime inference.** Spec implies the compiler infers reference and slice lifetimes; no explicit lifetime syntax shown. If inference proves too weak, syntax must be added — preferably as an opt-in.
3. **Allocator interface.** Every container takes an allocator. The interface must be stable before any container is finalized.
4. **`as` keyword overloading.** Used for type assertions, fallible-result binding, and `error as ErrorType`. Parser must disambiguate cleanly.
5. **Monomorphization code-size.** Generics + heavy generic use = binary bloat. Watch carefully; an opt-out may be needed.
6. **Runtime C boundary.** Pointer-bearing implementation detail lives below Delta source in generated/runtime C. The exact contracts between safe Delta APIs and runtime C helpers need precise specification, or the boundary will become a junk drawer.

Each of these warrants its own grilling pass before MVP code is written.
