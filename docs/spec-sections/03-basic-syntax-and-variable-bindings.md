## 3. Basic Syntax & Variable Bindings

Section 3 covers the surface syntax of Delta: what may appear at file scope, how statements are terminated, how variables are bound and initialized, how scoping and braces work, how functions are declared, how parameters and overloading behave, how conversions are written, the removal of nullability, the statement-vs-expression boundary, literal forms for numbers and strings, the operator set, comments, and identifier rules. Delta's surface is *TypeScript-shaped* — a TypeScript reader should recognize most of it — but every place where a TS feature is a footgun, an ambiguity, or unrelated to Delta's semantic guarantees, the stricter form is chosen. Each sub-feature below follows the Proposal / Reason / Examples / Conclusion structure.

---

### 3.1 Top-Level Forms

**Proposal.** The exhaustive list of constructs that may appear at file scope is: `function` declarations, `interface` declarations, `class` declarations, `enum` declarations, `type` aliases, `const` declarations, `import` and `export` statements (and `export`-prefixed versions of any declaration above), `extern "c" { ... }` blocks ([§40](#40-c-interoperability)), and decorators ([§46](#46-decorators)) attached to any of the above. **`let` at file scope is a hard compile error**; mutable global state is not expressible in user code.

**Reason.** §3 in the original draft listed `function`, `interface`, `class`, `enum`, `type`, `import`/`export` as "the top-level constructs" but the rest of the spec silently relied on additional forms:

- [§32](#32-compile-time-constants--const-generics) uses `const` at file scope.
- [§40](#40-c-interoperability) needs `extern "c"` blocks.
- [§46](#46-decorators) attaches decorators to top-level declarations.

Anyone writing a parser from §3 alone would reject programs from those sections. Making the list exhaustive removes the implicit-completion problem.

Banning top-level `let` is consistent with the ownership story ([§14](#14-ownership--move-semantics)): mutable globals are aliasable shared state, and Delta has no story for safe access to them in the MVP. The escape hatch — `const` plus interior mutability via concurrency primitives ([§42](#42-concurrency--atomics)) — exists for the rare cases where shared mutable state is genuinely needed, and forces those cases to be visibly concurrent.

**Examples.**
```ts
// allowed at file scope
const MAX_USERS: uintsize = 1024;
function add(a: int32, b: int32): int32 { return a + b; }
export type User = { id: uint64; name: string; };
class Counter { /* ... */ }
enum Color { Red, Green, Blue }
type Identifier = { value: stringview; };
type Eof = { };
type Token = Identifier | Eof;
import { parse } from "./parser";
export { add };

@extern("c")
export function pluginInit(): int32 { return 0; }

extern "c" {
  function puts(message: cstringview): int32;
}

// disallowed at file scope
let counter: int32 = 0;      // ERROR — let at file scope is forbidden
counter = counter + 1;       // ERROR — statements are not top-level forms
console.writeLine("hi");     // ERROR — top-level executable code is forbidden (§1.5)
```

**Conclusion.** The list above is the complete top-level grammar. Updates to other sections that introduce new top-level forms must also update §3.1.

---

### 3.2 Statement Terminators

**Proposal.** Every statement ends with a semicolon. There is no automatic semicolon insertion. A missing semicolon is a dedicated, specifically-worded diagnostic, not a generic "syntax error."

**Reason.** ASI is one of the most-cited TS/JS papercuts:

- The `return\n{...}` returns-undefined case.
- The leading-`[`/`(` continuation hazards.
- The multi-line ternary disambiguation.

Required semicolons are still TS-shaped — every TS codebase configured with a linter enforces them anyway — and produce an unambiguous parser with clean error recovery ([§2.10](#210-error-recovery)). The cost is one character per line; the benefit is that "is this a statement boundary or a continuation?" is never context-sensitive.

Delta's audience (people writing C, Rust, Zig, Go, modern TS) is already in the "always use semicolons" cohort. The dedicated diagnostic — `expected ';' at end of statement; insert ';' here` with a fix-it — exists because this will be the single most common syntax mistake for TS migrants in the first hour.

**Examples.**
```ts
const x: i32 = 10;            // OK
const y: i32 = 20             // ERROR — expected ';' at end of statement
const z = x + y;
```

**Conclusion.** Semicolons are mandatory; no ASI; the diagnostic for the omission case is specific and offers a fix-it.

---

### 3.3 Variable Bindings and Definite Assignment

**Proposal.** Two binding forms: `const` (read-only, non-consuming receiver capability per [§11](#11-mutability-model-const-vs-let)) and `let` (mutable, reassignable receiver capability). `const` always requires an initializer at the declaration site. `let` may be declared without an initializer only with an explicit type annotation; the compiler runs **definite-assignment analysis** and rejects any read, mutation, reference, or move on a path where the binding does not hold a complete value. **Partial initialization is not permitted** — an uninitialized binding can only be initialized by whole-value assignment. One binding per statement; the TS form `let a = 1, b = 2;` is disallowed. The comma-form `const a, b = expr;` is reserved exclusively for multi-return destructuring ([§24](#24-multiple-return-values)).

**Reason.** Each rule earns its place:

- **Declaration-with-later-assignment** is supported because forcing initialization at the declaration site (Java-style) is brittle when the initial value depends on conditional logic — the workaround is awkward ternaries or helper functions. The same whole-binding state machinery is already used by ownership ([§14](#14-ownership--move-semantics)) and the `check`-exit analysis ([§23](#23-the-check-block)), so the cost is amortized.
- **Whole-value initialization only** keeps values from entering half-valid states. A binding is either uninitialized or holds a complete value; field writes, indexed writes, references, reads, and moves are all rejected until the whole value has been assigned.
- **One binding per statement** resolves the syntactic collision with multi-return destructuring (the parser would otherwise need lookahead to distinguish `const a, b = f()` "two bindings" from `const a, b = f()` "one multi-return") and aligns with the ownership model where every `move`, `&`, `edit &`, or `clone` operation starts from a single named binding.

**Examples.**
```ts
// const requires an initializer
const max: usize = 1024;       // OK
const min: usize;              // ERROR — const without initializer

// let with or without initializer
let counter: i32 = 0;          // OK
let value: Config;             // OK — uninitialized
if (useDefault) { value = Config.default(); }
else            { value = parseConfig(path); }
console.writeLine(value.name); // OK — definitely assigned on every path

let other: Config;
console.writeLine(other.name); // ERROR — `other` may be read before assignment

// whole-value initialization only
let v: Vec3;
v = { x: 1, y: 2, z: 3 };      // OK
console.writeLine(v.x + v.y);  // OK — v is fully initialized

let w: Vec3;
w.x = 1;                       // ERROR — partial initialization is not allowed
console.writeLine(w.y);        // ERROR — `w` is not initialized

// one binding per statement
let a = 1;
let b = 2;                     // OK
let a = 1, b = 2;              // ERROR — multiple bindings per statement disallowed

// comma-form reserved for multi-return
const firstName, lastName = splitName("Ada Lovelace") as result;   // OK (§24)
```

**Conclusion.** `const` always initialized; `let name: T;` is permitted under definite-assignment but must be initialized by whole-value assignment; one binding per statement; the comma-form belongs to multi-return.

---

### 3.4 Scoping Rules

**Proposal.** A new lexical scope is created **exclusively** by the body of: a `function` declaration, a lambda / arrow expression, a class method, `if` / `else`, `while`, `for` and `for...of` (the init clause's bindings are scoped to the loop), `switch` (each `case` is its own scope), and `check`. **Bare `{ ... }` blocks are not a scope-creating construct** — `{ ... }` may only appear as the body of one of the listed constructs. **Shadowing is forbidden in every form**: a binding may not reuse the name of any binding visible in an enclosing scope (function parameters included), and a name already declared in the current scope may not be re-declared. Both cases are compile errors.

**Reason.** A finite, enumerated list of scope-introducing constructs is what makes shadowing rules and definite-assignment analysis tractable. The individual choices:

- **No bare blocks.** Allowing `{ ... }` for "I just want a local scope" is a C-ism Delta does not need — every scope worth introducing is naturally tied to control flow, and bare blocks would be the only construct in the language whose presence has no semantic justification beyond "I want shadowing here."
- **Per-case `switch` scoping** is a strict improvement over TS/C's shared-case scope. It prevents the `case "a": const x = 1; case "b": const x = 2;` name collision footgun without forcing the author to write a nested block.
- **No inner-scope shadowing.** Reusing an outer name in an inner scope reads as the same variable at a glance, but binds something different — a known footgun, especially around function parameters. Forbidding it forces the author to pick a distinct name that documents the distinction. Narrowing across a conditional is better served by typed flow-narrowing of the original binding than by a fresh declaration that hides it.
- **No same-scope shadowing.** The Rust pattern `let x = ...; let x = transform(x);` reads as a re-declaration bug to non-Rust eyes; forbidding it is consistent with §3.3's "one binding per statement" and removes the temptation to chain rebindings instead of picking a clearer name.

**Examples.**
```ts
// inner-scope shadowing forbidden
function f(x: int32): int32 {
  const x: int32 = 1;        // ERROR — `x` shadows the parameter `x`
  return x;
}

function f2(x: i32): void {
  const a = 10;
  if (x > 0) {
    const a = 20;            // ERROR — `a` shadows the outer `a`
    console.writeLine(a);
  }
  console.writeLine(a);
}

// bare blocks are not allowed
function g(): void {
  const a = 10;
  {                          // ERROR — bare block cannot introduce a scope
    const b = a + 1;
  }
}

// per-case switch scoping
switch (k) {
  case "a": { const x = 1; doSomething(x); break; }
  case "b": { const x = 2; doSomething(x); break; }  // OK — distinct scope, neither shadows an outer `x`
}

// same-scope shadowing forbidden
function h(): void {
  let buf = string.from("hello");
  consume(move buf);
  let buf = string.from("world");   // ERROR — `buf` already declared in this scope
}
```

**Conclusion.** Scope sources are the listed constructs only. No bare blocks. No shadowing — neither across nested scopes nor within a single scope.

---

### 3.5 Braces and Control-Flow Bodies

**Proposal.** `if`, `else`, `while`, `for`, `for...of`, and `switch` bodies are always enclosed in `{ ... }`. Brace-less single-statement bodies are syntax errors. `else if` is recognized as a chain: `if (...) { ... } else if (...) { ... } else { ... }` reads as a natural chain, with each clause requiring braces around its body.

**Reason.** Brace-less single-statement bodies are the source of the Apple `goto fail` security bug (CVE-2014-1266) and a recurring category of "indentation lies about structure" bugs.

Mandatory braces interact cleanly with the rest of Delta's strictness:

- `check` blocks already require braces and exit-path analysis ([§23](#23-the-check-block)).
- Always-braced bodies removes a category of formatter and linter rules.
- The cost (typically two characters) is nil; the benefit is that visual structure always matches lexical structure.

Go made this call years ago and the ecosystem has converged on "this is fine"; Rust requires braces for `if` and most consider it unremarkable.

**Examples.**
```ts
// required form
if (x > 0) {
  console.writeLine("positive");
} else if (x < 0) {
  console.writeLine("negative");
} else {
  console.writeLine("zero");
}

while (running) {
  tick();
}

for (let i: usize = 0; i < values.length; i += 1) {
  console.writeLine(values[i]);
}

// disallowed forms
if (x > 0) console.writeLine("positive");          // ERROR — missing braces
while (running) tick();                            // ERROR — missing braces
for (const v of values) total += v;                // ERROR — missing braces
```

**Conclusion.** Braces are mandatory on every control-flow body. `else if` is parsed as a chain.

---

### 3.6 Function Declaration Forms

**Proposal.** Functions may be declared in two **equivalent** forms, both available at file scope, inside function bodies, in class methods, and at any binding site:

- **Named form:** `function name(params): RetT { ... }`
- **Arrow-bound form:** `const name = (params): RetT => { ... };` or expression-bodied `const name = (params): RetT => expr;`

Equivalence is specified precisely:
- **Neither form is hoisted.** Both must appear textually before any use within a file.
- **Recursive arrow forms are supported** — the name is in scope inside the initializer, so `const fact = (n: i32): i32 => n <= 1 ? 1 : n * fact(n - 1);` is valid.
- **C codegen depends on captures, not on syntactic form.** A function (either form) with no captures from an outer scope lowers to a plain C function. A function with captures lowers to a closure (function pointer plus environment struct). The choice is driven by *what the function does*, not by which keyword was used to declare it.

Arrow lambdas are also expression-valid wherever an expression is expected — argument positions, return values, `const`-bound inside function bodies. There is no second-class restriction on the arrow form.

**Reason.** TS allows both forms with subtle differences (hoisting, `this` binding, ergonomic feel), and most TS style guides spend energy on "which form should this codebase use." Treating the two as truly equivalent removes that debate: the choice is purely stylistic, with no semantic consequence.

Three sub-decisions follow:

- **No hoisting in either form.** Aligns with the DAG-driven module ordering ([§2.5](#25-import-dag-and-execution-order)) — forward references are an import-graph concern, not an intra-file concern.
- **Recursive arrows supported.** The binding is in scope inside its own initializer; reading it before assignment is the standard definite-assignment error (which doesn't fire when the binding *is* being assigned).
- **Capture-driven codegen, not syntax-driven.** Library authors don't have to think about "does this declaration form generate a real symbol?" — the compiler picks the representation that matches the function's actual closure status.

**Examples.**
```ts
// equivalent
function add(a: i32, b: i32): i32 { return a + b; }
const add = (a: i32, b: i32): i32 => a + b;
const add = (a: i32, b: i32): i32 => { return a + b; };

// no hoisting in either form
main();                                       // ERROR — `main` used before declaration
function main(): uint8 { return 0; }

helper();                                     // ERROR
const helper = (): void => { /* ... */ };

// recursive arrow
const fact = (n: i32): i32 => n <= 1 ? 1 : n * fact(n - 1);

// captures determine codegen, not syntactic form
function makeAdder(n: i32): (i32) => i32 {
  return (x: i32): i32 => x + n;              // closure (captures `n`)
}

// arrow as expression in argument position
filter(items, (item: i32): bool => item > 0);
```

**Conclusion.** Both forms are first-class and semantically equivalent. Hoisting is off for both. Captures drive codegen representation.

---

### 3.7 Parameters and Overloading

**Proposal.** Function parameters support:

- **Default values:** YES, but the default expression must be a compile-time constant. Default-bearing parameters must come after all non-default parameters. A default may not reference earlier parameters.
- **Optional `?` parameters:** NO. The TS `paramName?: T` form is not part of Delta's grammar. The "I want to pass this argument or not" pattern is served by overloading.
- **Variadic / rest parameters:** YES, syntax `...args: T[]`. Must be the last parameter. The callee sees `args` as a `Slice<T>`. Spread at the call site is supported: `f("first", ...rest)` where `rest` is `Slice<T>` or `T[]`. Variadics are banned at the `@extern "c"` boundary (C varargs are type-unsafe).
- **Named arguments:** NO. All calls are positional.

**Function and method overloading** is supported with the following resolution rules:

- Overloads are distinguished by **arity** and by **parameter types**.
- **Return type alone cannot distinguish overloads** — return-type-only overloading is a compile error at declaration.
- **No implicit conversion during resolution.** Each argument must match exactly one overload's parameter type at its declared type. Mismatches require an explicit call-style conversion ([§3.8](#38-type-conversions-and-the-as-keyword)).
- **Concrete wins over generic.** When a call could resolve to a generic overload or a concrete overload, the concrete one wins. (Forward-looking — generics are post-MVP per [§52](#52-mvp-compiler-scope).)
- **Necessary ambiguity errors at declaration; contextual ambiguity errors at the call site.** `function f(x: i32, y: i32 = 0)` plus `function f(x: i32)` is a declaration error because every one-argument call is ambiguous. A pair of overloads that's only ambiguous under specific call shapes errors when that call is encountered.
- **Variadic vs fixed-arity:** the variadic overload fires only when no fixed-arity overload exactly matches the call's argument count.
- **Class methods overload by the same rules,** with the implicit `self` not participating in resolution.
- **Export of overloaded functions:** each overload is exported individually (i.e., each declaration needs its own `export` if visible across modules). Importing the name pulls in every exported overload visible in the source module.

**Reason.** Decisions and their justifications:

- **Defaults + overloading instead of optional `?`.** Together they cover the use cases optional parameters would have served, without introducing the "is this parameter present?" question into the type system.
- **Variadics included.** Needed for any logging or formatting API and for ergonomic constructors of variable-arity collections.
- **Variadics banned at FFI.** Keeps `extern "c"` declarations type-checkable; C varargs are not type-safe and would re-introduce the question at the boundary.
- **No implicit conversion during overload resolution.** Mirrors [§5](#5-primitive-numeric-types)'s no-implicit-numeric-widening rule — the language already commits to "every conversion is visible," and overload resolution must not be the place where that commitment leaks.
- **Concrete wins over generic.** The standard rule; produces the least-surprising behavior.
- **No return-type-only overloading.** Prevents the action-at-a-distance bug where adding a type annotation at a call site changes which function gets called.

**Examples.**
```ts
// defaults
function greet(name: StringView, greeting: StringView = "hello"): void {
  console.writeLine(`${greeting}, ${name}`);
}
greet("Ada");                 // uses default
greet("Ada", "hi");           // explicit

function f(x: i32 = compute()): void { /* ... */ }   // ERROR — default must be constant
function g(width: i32, height: i32 = width): void { /* ... */ }  // ERROR — default refers to earlier param

// overloading on arity
function greet(name: StringView): void { /* ... */ }
function greet(name: StringView, greeting: StringView): void { /* ... */ }

// overloading on type
function area(s: Square): f64 { /* ... */ }
function area(c: Circle): f64 { /* ... */ }

// no implicit conversion in resolution
function log(x: i32): void { /* ... */ }
const big: i64 = 100;
log(big);                     // ERROR — i64 does not match i32
log(i32(big));                // OK — explicit conversion

// return-type-only overloading is forbidden
function read(): i32 { /* ... */ }
function read(): f64 { /* ... */ }   // ERROR — return type alone cannot disambiguate

// variadic
function log(level: StringView, ...args: StringView[]): void {
  for (const a of args) { console.writeLine(`[${level}] ${a}`); }
}
log("info", "user", "logged", "in");
const messages: StringView[] = ["a", "b"];
log("info", ...messages);     // spread

// variadic + fixed overload: fixed wins on exact arity
function f(x: i32): void { /* ... */ }
function f(...xs: i32[]): void { /* ... */ }
f(42);                        // picks the fixed form
f(1, 2, 3);                   // picks the variadic
f();                          // picks the variadic with empty slice
```

**Conclusion.** Defaults are constant-only; no optional `?`; variadics with slice-view callee shape; overloading on arity and type only; no return-type-only overloading; concrete wins over generic; no implicit conversions during resolution.

---

### 3.8 Type Conversions and the `as` Keyword

**Proposal.** The keyword `as` has two — and only two — uses in Delta:

- **`expr as result`** — binds a fallible call's outcome ([§22](#22-consuming-fallible-calls-as-result)). The bareword `result` is reserved in this position.
- **`return error as Type { ... }`** — constructs an error of the named type for return through the error channel ([§21](#21-returning-errors-return-error-as)). Distinguished by the leading `return error`.

There is **no `expr as Type` cast form**. All type conversions — numeric widening and narrowing, primitive-to-primitive conversions, and any user-defined conversions — use **call-style syntax**: `int64(x)`, `float64(n)`, `cstring.from(view)`. Whether a conversion `Source -> Target` exists is declared explicitly: the standard library declares the valid conversion pairs for primitives; user types declare cast constructors when they want to be cast-targets. There is no blanket "every type can be cast to every other type." The named-constructor idiom `string.from(...)` / `cstring.from(...)` from [§7](#7-string-family-types) is retained for non-trivially-named conversions where additional parameters or behavior are involved.

**Reason.** `as` was at risk of being used for three different things (fallible binding, error construction, type cast), which would have pushed the parser into context-sensitive territory. Moving casts to call-style frees `as` to mean exactly two things, both of which are textually distinct and trivially disambiguated by what follows.

Call-style casts have further wins:

- **Visible conversion set.** Valid conversions are a set of named symbols rather than an open-ended type-system operation — easier to grep.
- **Auditability.** Easy to audit at FFI and representation boundaries because every conversion has a named surface.
- **Extensibility.** Easy to extend with checked, wrapping, or saturating variants.

The `from`-named constructors are retained for cases where the conversion isn't really a "cast" — it involves encoding choice, allocation policy, error handling, or other parameters.

**Examples.**
```ts
// fallible binding — `as result`
const fileName, content = readFile(path) as result;
check result { return 1; }

// error construction — `return error as Type`
return error as IOError { code: "io.empty", message: "...", path };

// numeric conversion — call-style cast
const wide: int64 = 100;
const narrow: int32 = int32(wide);       // explicit narrowing
const asFloat: float64 = float64(wide);  // explicit int to float

// disallowed
const narrow: int32 = wide as int32;     // ERROR — `as Type` cast form does not exist
const u: User = maybeUser as User;       // ERROR — there is no `T?` to narrow

// named constructor idiom retained
const s = string.from(view) as result;
check result { return 1; }
const c = cstring.from(view) as result;
check result { return 1; }
```

**Conclusion.** `as` does two things only. All casts are call-style. Cast validity is declared per (source, target) pair.

---

### 3.9 Removal of Nullability

**Proposal.** Delta does not have nullable types. `T?` is not part of the grammar. The literal `null` is not a keyword and is not an expression. The `if (x !== null)` flow-narrowing pattern does not exist.

The patterns that nullability would have covered are reorganized:

- **"May be absent" return values** are expressed as fallible signatures ([§19](#19-fallible-function-signatures)). `Map.get`, `Array.find`, `string.indexOf`, and any other "lookup or absence" API returns `T | NotFoundError` (or a more specific error type), consumed via `as result` and guarded with `check`.
- **C NULL at the FFI boundary** is trapped inside the binding wrapper. A future FFI declaration whose C signature can return NULL must convert the NULL into a fallible-signature error before the value escapes the FFI layer. User code never sees NULL.
- **Optional configuration / "may not provide a value"** is handled by overloading ([§3.7](#37-parameters-and-overloading)) or by structured input types (tagged unions in [§29](#29-tagged-unions--exhaustiveness), record fields with sensible defaults, etc.).

This removes [§18](#18-null-safety--nullable-types) from the language entirely.

**Reason.** A language with both nullable types (`T?`) and fallible signatures (`T | E`) has two competing answers to "may this value be absent?" and forces every API designer to pick which channel to use. Removing `T?` collapses that choice: absence is always an error type, and absence is always handled by the same machinery (`as result` + `check`) that handles every other failure.

The cost is a small ergonomics tax on the simplest "lookup or not" APIs — `if (x !== null)` becomes `check result`. The benefits:

- **One absence story** across the whole language.
- **Every absence is named** — `NotFoundError`, not the anonymous `null`.
- **`check` exit analysis** ([§23](#23-the-check-block)) covers absence handling for free.
- **Smaller type system** — loses an entire form (`T?`) without losing expressive power.

The Tony-Hoare-style "billion-dollar mistake" argument is satisfied not by tracking nullability but by removing the concept altogether.

**Examples.**
```ts
// lookup APIs are fallible
function findUser(id: uint64): User | NotFoundError {
  if (id === 0) {
    return error as NotFoundError { code: "user.not_found", message: "missing id", id };
  }
  return { id, name: string.from("Alice") };
}

const user = findUser(10) as result;
check result {
  console.writeLine(result.error.message);
  return 1;
}
console.writeLine(user.name);            // OK — `user` is a User after `check`

// FFI NULL trapped at the wrapper (shape illustrative; detailed FFI is §§40-41)
function fopenSafe(path: cstringview, mode: cstringview): OpaqueHandle<FILE> | IOError {
  const handle = fopen(path, mode);
  if (handle.isNull()) {
    return error as IOError { code: "io.fopen_failed", message: "...", path };
  }
  return handle;
}

// `null` and `T?` are not part of the grammar
function f(x: User?): void { /* ... */ }      // ERROR — `T?` is not a type form
const x = null;                                // ERROR — `null` is not an expression
```

**Conclusion.** No nullability. No `null`. Absence is always a fallible-signature error. [§18](#18-null-safety--nullable-types) is removed from the spec.

---

### 3.10 Statement and Expression Distinction

**Proposal.** Delta maintains a strict statement-vs-expression split.

- `if` / `else`, `while`, `for`, `for...of`, `switch`, blocks, and assignments are **statements**. None produce a value.
- The **ternary** `cond ? a : b` is the only expression-form conditional.
- **Chained ternaries** without parentheses are a syntax error. Nested ternaries must be parenthesized: `a ? b : (c ? d : e)` is valid; `a ? b : c ? d : e` is not.
- Blocks are **not** expressions; there is no "last expression of block is the value" rule.
- `return expr;` is mandatory in every non-`void` function. No implicit last-expression returns. In a `void` function, `return;` is allowed but not required at the end.
- Assignments are statements; `if ((x = f()) > 0) { ... }` is a syntax error. Separate the assignment from the test.

**Reason.** A strict statements/expressions split keeps the parser small, error messages precise, and any future formatter / LSP straightforward.

Individual calls:

- **`if` as statement, not expression.** The ergonomic argument — "I want `let x = if cond { a } else { b };`" — is already handled by the §3.3 declare-then-assign pattern under definite-assignment, which is one extra line at no semantic cost.
- **Ternary retained.** The inline form is universally useful for short conditionals and adds no parser pain.
- **No bare chained ternaries.** Parenthesized nesting prevents the multi-line nested-ternary readability hazard while still allowing structured nesting.
- **Assignment is a statement.** Eliminates an entire class of `==` / `=` confusions (e.g., the C `if (x = 5)` bug) and is consistent with the rest of §3's "one canonical way per concept" stance.

**Examples.**
```ts
// ternary — the only expression-form conditional
const sign = x > 0 ? 1 : -1;
const label = kind === "id" ? "identifier" : "other";

// nested ternary requires parens
const sign = x > 0 ? 1 : (x < 0 ? -1 : 0);   // OK
const sign = x > 0 ? 1 : x < 0 ? -1 : 0;     // ERROR — chained without parens

// if is a statement; use Q3 pattern for branched init
let value: Config;
if (useDefault) { value = Config.default(); }
else            { value = parseConfig(path); }

// disallowed
const x = if (cond) { a } else { b };        // ERROR — if is not an expression
const x = { const tmp = f(); tmp + 1 };      // ERROR — block is not an expression
function add(a: i32, b: i32): i32 { a + b }  // ERROR — implicit return; write `return a + b;`
if ((x = f()) > 0) { /* ... */ }             // ERROR — assignment is a statement
```

**Conclusion.** Statements stay statements. The ternary is the one expression-form conditional, with mandatory parens on nesting. `return expr;` is explicit.

---

### 3.11 Numeric Literals

**Proposal.** Three integer bases (decimal, hex with `0x` prefix, binary with `0b` prefix); octal in any form is **banned**. Hex digits are case-insensitive. Digit separators are `_` between digits — not adjacent to a base prefix, not leading, not trailing. **No type suffixes** (`42i32`, `3.14f32`) — literal type is determined by default or by the surrounding typed context. Default integer literal type is `i32` ([§4](#4-type-inference)); default float literal type is `f64`. In a typed context, a literal adopts the target type provided its value fits: `const a: u8 = 200;` typechecks; `const a: u8 = 256;` is a compile error. The literal-fits-target rule applies to **literals only**, not to general numeric values — there is no implicit conversion of a typed value to another numeric type ([§5](#5-primitive-numeric-types)). Integer literals do **not** auto-widen to float in a float-typed context — write `3.0` or `f64(3)`. Exponent notation `1e6`, `1.5e-3` is allowed and produces a float literal.

**Reason.** Per-decision justifications:

- **Three bases.** Cover every domain Delta targets — decimal for general code, hex for bitmasks and protocol fields, binary for register layouts and flag definitions.
- **No octal.** A C footgun (`017` is 15, not 17), and the `0o17` form is rarely used in practice. If a user genuinely needs octal, hex is one digit longer and unambiguous.
- **Digit separators.** Improve readability for constants like `1_000_000` or `0xFF_FF_FF_FF` at zero parser cost.
- **No type suffixes.** A redundant escape hatch when call-style casts ([§3.8](#38-type-conversions-and-the-as-keyword)) already exist: `u64(42)` for forced typing, otherwise let the context decide.
- **No int → float auto-widening.** Consistent with §5's broader no-implicit-conversion stance — a one-character fix (`3.0`) is preferable to a special-case rule about which conversions happen silently.

**Examples.**
```ts
// bases
const a = 255;
const b = 0xFF;
const c = 0xff;             // identical to b
const d = 0b1111_1111;      // 255

const e = 017;              // ERROR — leading-zero octal banned
const f = 0o17;             // ERROR — explicit-octal banned

// digit separators
const g = 1_000_000;        // OK
const h = 0xFF_FF_FF_FF;    // OK
const i = _100;             // ERROR — leading underscore
const j = 100_;             // ERROR — trailing underscore
const k = 0x_FF;            // ERROR — adjacent to base prefix

// no suffixes — use call-style for explicit type
const x = 42;               // i32 by default
const y = u64(42);          // forced u64
const z: u64 = 42;          // OK — literal-fits-target adopts u64

const w: u8 = 256;          // ERROR — out of range for u8

// integer does not auto-widen to float
const f: f64 = 3;           // ERROR — write 3.0 or f64(3)
const f: f64 = 3.0;         // OK
const f: f64 = f64(3);      // OK

// exponent notation
const big = 1e6;            // f64
const tiny = 1.5e-3;        // f64
```

**Conclusion.** Decimal, hex, binary. No octal. Underscore separators between digits. No suffixes. Default `i32` / `f64`. Literal-fits-target rule for literals only. No implicit int → float. Exponent notation is float-typed.

---

### 3.12 String Literals

**Proposal.** Three literal forms:

- **Plain `"..."`** — single-line, type `StringView` ([§7](#7-string-family-types)). Escape sequences are processed. A literal newline inside `"..."` is a syntax error.
- **Template `` `...${expr}...` ``** — backtick-delimited, multi-line allowed, escapes processed, `${expr}` interpolation supported. Result type is `string` (owned) because interpolation requires allocation. `${expr}` requires the expression to be a primitive with a defined string form or to have a `toStringView()` method. **Tagged template literals (e.g., `html\`...\``) are not supported.**
- **Raw `r"..."`** — no escape processing, type `StringView`. May span multiple lines. To embed `"` characters, use the hash-delimited form `r#"..."#`, `r##"..."##`, etc., where the opening and closing delimiters must have matching hash counts.

Supported escapes (in plain and template forms only): `\n`, `\t`, `\r`, `\\`, `\"`, `\0`, `\xHH` (one-byte hex), `\u{H...H}` (Unicode codepoint, braces required, 1–6 hex digits). The fixed-width `é` form from TS/JS is **not** supported — only the braced form. Single-quoted `'x'` is reserved for `char` literals ([§6](#6-other-primitive-types-bool-char-void)) and is not a string form.

**Reason.** Each design choice resolves a specific hazard:

- **Three forms.** Cover the three real use cases — cheap unchanging strings, dynamic interpolated strings, and paths/regex/JSON that contain backslashes.
- **One quote form for strings.** Prevents the "is `'x'` a string or a char?" ambiguity at the lexer.
- **`string` vs `StringView` split surfaces allocation cost at the point of use.** A plain literal is allocation-free; a template is not, and the type system reflects that.
- **No bare newlines in `"..."`.** Forces multi-line content into either the template form (interpolated, allocated) or the raw form (no escapes) — both have explicit semantics, no "looks single-line but contains a newline" ambiguity.
- **Braced-only `\u{...}`.** Removes the "is this six characters or one followed by digits?" ambiguity of the fixed-width form.

**Examples.**
```ts
// plain — StringView, single line
const name: StringView = "Delta";
const greet: StringView = "hello\nworld";       // \n is an escape, the literal is one line

const broken: StringView = "line one
line two";                                       // ERROR — newline inside "..."

// template — string (owned), multi-line, interpolation
const message: string = `Hello, ${name}!`;
const block: string = `line one
line two
line three`;

// raw — StringView, no escapes
const path: StringView = r"C:\Users\Ada\file.txt";
const regex: StringView = r"\d+\.\d+";
const json: StringView = r#"{"name": "Ada", "id": 1}"#;

// escapes
const e1 = "tab\there";
const e2 = "byte\x41";              // 'A'
const e3 = "smile\u{1F600}";        // 😀
const e4 = "accenté";          // ERROR — only the braced form is supported

// single quote is char only
const ch: char = 'δ';
const wrong: StringView = 'hello';  // ERROR — single quotes are for char literals
```

**Conclusion.** Plain `"..."`, template `` `...` ``, raw `r"..."` (with hash-delimited variant). No bare newlines in plain. Braced Unicode escape only. No tagged templates.

---

### 3.13 Operators

**Proposal.** Delta provides a deliberately tight operator set with strict semantics.

**Arithmetic:** `+`, `-`, `*`, `/`, `%`. Modulo uses **truncated-division semantics**: the sign of the result follows the dividend (`-7 % 3 == -1`).

**Comparison:** `==`, `!=`, `<`, `>`, `<=`, `>=`. Comparison requires both operands to have the same type; cross-type comparison is a compile error, not an implicit-conversion site. There is **no `===` or `!==`** — `==` is always strict because Delta has no implicit type coercion.

**Bitwise:** `&`, `|`, `^`, `~`, `<<`, `>>`. Right shift on signed integers is **arithmetic** (sign-extending). The unsigned-shift effect is obtained via `i32(u32(x) >> 1)`; a dedicated `>>>` operator is not provided in MVP.

**Logical:** `&&`, `||`, `!`. These are **boolean-only** and return `bool`. The JS-style "return the truthy operand" behavior is not provided. `inputName || "default"` does not typecheck when `inputName` is `StringView`.

**Assignment:** `=`, `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, `>>=`. No `**=`, no `||=`, no `&&=`, no `??=`.

**Banned operators:** `++`, `--`, `**`, `??`, the comma operator, `in`, `instanceof`. `+` does **not** concatenate strings — use template literals ([§3.12](#312-string-literals)) or `string.concat(a, b)`.

**Reason.** The banned set deserves explicit justification:

- **`++` and `--`.** Pre/post distinctions inside larger expressions are a recurring source of UB and unreadability in C; the savings are nil; `i += 1` is one character longer.
- **`**`.** Adds operator-precedence questions for no high-frequency win — `x * x` or `Math.pow(x, n)` cover the cases.
- **`??`.** Has nothing to do because nullable types are gone ([§3.9](#39-removal-of-nullability)).
- **`===` / `!==`.** Exist in TS only because of implicit coercion; Delta has none, so `==` is always strict.
- **Comma operator.** Implicitly out because assignments aren't expressions.
- **`in` and `instanceof`.** Runtime type queries that Delta resolves at compile time via nominal typing and tagged-union discriminants.
- **`+` for string concat.** The gateway to "what's the type of `1 + '2'`?" confusion; template literals are strictly more powerful and make allocation visible.

The kept semantics:

- **Truncated-division modulo** matches C, Rust, Go, and most current systems languages and is what programmers reading bitwise/arithmetic code expect.
- **Arithmetic right shift on signed integers** is the de-facto behavior in every modern target ABI; the unsigned-shift form is rare enough that requiring a cast is acceptable.

**Examples.**
```ts
// arithmetic and modulo
const a = 10 + 20;
const b = -7 % 3;            // -1, not 2

// comparison must be same-type
const c = 5 == 5;            // OK
const d = 5 == 5.0;          // ERROR — i32 vs f64
const e = 5 == i32(5.0);     // OK — explicit cast first... wait, see §3.8 conversion rules

// bitwise
const flags = 0b1010 | 0b0101;
const shifted = i32(-8) >> 1;   // arithmetic — preserves sign

// logical — boolean only
const valid = a > 0 && b < 100;
const name = inputName || "default";   // ERROR — || is boolean only

// banned operators
i++;                          // ERROR — use i += 1
const sq = x ** 2;            // ERROR — use x * x or Math.pow(x, 2)
const v = maybe ?? fallback;  // ERROR — no nullability, nothing to coalesce
"a" + "b";                    // ERROR — + does not concatenate strings
```

**Conclusion.** Tight set, strict same-type comparison, truncated-division modulo, arithmetic right shift on signed, no string concat via `+`, banned operators justified.

---

### 3.14 Comments

**Proposal.** Three comment forms:

- **Line:** `// ...` to end of line.
- **Block:** `/* ... */` — does **not** nest. The first `*/` closes the comment.
- **Doc:** `/** ... */` — attaches to the immediately following declaration. Body is markdown. This is the single doc-comment form; there is no Rust-style `///`.

**Reason.** Each choice serves a small, specific purpose:

- **One line form, one block form, one doc form.** Keeps the lexer and any future doc-tooling pipeline trivially simple.
- **JSDoc/TSDoc-shaped doc comments.** Every TS migrant already recognizes the form and editor tooling for it is universal.
- **No nested block comments.** Adds lexer complexity for a use case that's already solved by either line comments or an editor's "comment selection" command. The only argument for nesting is "I want to comment out code that contains a block comment," which loses to "use line comments or your editor."

**Examples.**
```ts
// line comment to end of line
const x: i32 = 10; // inline form also OK

/* block comment
   spans multiple lines */

/* outer /* inner */ still in outer */    // the first */ closes; "still in outer */" is a syntax error

/** Add two integers and return the sum.
 *
 * - `a` — left operand
 * - `b` — right operand
 */
function add(a: i32, b: i32): i32 {
  return a + b;
}

/// Add two integers.                     // ERROR — not a recognized comment form
function sub(a: i32, b: i32): i32 { return a - b; }
```

**Conclusion.** `//`, `/* */` (non-nesting), `/** */` for docs. No `///`, no nested block comments.

---

### 3.15 Identifiers and Case Conventions

**Proposal.** Identifier syntax is governed by [§1.7](#17-encoding-line-endings-and-case-sensitivity): Unicode UAX #31 with NFC normalization, ASCII-only operators and digit literals. **The compiler does not enforce a case convention** on identifiers — `MyFunction`, `myFunction`, `my_function`, and `MYFUNCTION` are all syntactically valid. Style — PascalCase for types, camelCase for values, etc. — is enforced (later) by a formatter and a linter, not by the grammar.

**Reason.** Compiler-enforced case conventions are a small, opinionated step that produces lots of friction for marginal benefit. Different ecosystems have valid preferences and the language has no business legislating them:

- **PascalCase for types** in some communities.
- **snake_case for locals** in others.
- **kebab-cased imported names** elsewhere.

The case convention that the Delta ecosystem will converge on — set by `delta init` templates, the std codebase, and a future linter — will be PascalCase for types, camelCase for values, lowercase for module file names. But that's a style policy, not a grammar rule.

**Examples.**
```ts
// all valid identifier shapes
function MyFunction() { /* ... */ }
function myFunction() { /* ... */ }
function my_function() { /* ... */ }

const Pi: f64 = 3.14159;
const PI: f64 = 3.14159;
const pi_value: f64 = 3.14159;

class user { /* ... */ }      // valid but non-idiomatic
class User { /* ... */ }      // idiomatic, but identical to the compiler
```

**Conclusion.** Identifier *shape* rules come from §1.7. Case *style* is unenforced at the language level.

---

### 3.16 Explicit Non-Goals for Section 3

The following are deliberately out of scope for §3, either deferred to a later section or excluded permanently:

- **Automatic semicolon insertion (ASI)** — never. Semicolons are mandatory ([§3.2](#32-statement-terminators)).
- **Top-level `let`** — never. Mutable global state is not expressible in user code ([§3.1](#31-top-level-forms)).
- **Bare `{ ... }` blocks as scope sources** — never ([§3.4](#34-scoping-rules)).
- **Brace-less single-statement control-flow bodies** — never ([§3.5](#35-braces-and-control-flow-bodies)).
- **Function hoisting** — never. Both declaration forms must appear textually before use ([§3.6](#36-function-declaration-forms)).
- **Optional `?` parameters** — never. Use overloading ([§3.7](#37-parameters-and-overloading)).
- **Named arguments** — never. All calls are positional ([§3.7](#37-parameters-and-overloading)).
- **Return-type-only overloading** — never ([§3.7](#37-parameters-and-overloading)).
- **`expr as Type` cast form** — never. All casts are call-style ([§3.8](#38-type-conversions-and-the-as-keyword)).
- **Nullable types (`T?`), the `null` literal, `if (x !== null)` narrowing, `??` coalescing** — never ([§3.9](#39-removal-of-nullability)). Removes [§18](#18-null-safety--nullable-types) from the spec.
- **`if` / blocks / `switch` / `switch type` as expressions** — never ([§3.10](#310-statement-and-expression-distinction)). Use declare-then-assign under definite-assignment.
- **Implicit last-expression returns from function bodies** — never. `return expr;` is mandatory.
- **Chained ternaries without parentheses** — never. Nested ternaries require explicit grouping.
- **Assignment as expression** — never. Separate the assignment from the test.
- **Octal integer literals** (any form) — never ([§3.11](#311-numeric-literals)).
- **Type suffixes on numeric literals** (`42i32`, `3.14f64`) — never. Use call-style casts.
- **Implicit integer-to-float widening in float-typed contexts** — never. Write `3.0` or `f64(3)`.
- **Bare newlines inside `"..."` string literals** — never. Use the template or raw form for multi-line content.
- **Fixed-width `\uHHHH` Unicode escapes** — never. Only the braced `\u{...}` form is supported.
- **Single-quoted string literals** — never. Single quotes are reserved for `char` literals.
- **Tagged template literals** — never.
- **`++`, `--`, `**`, `??`, `===`, `!==`, the comma operator, `in`, `instanceof`** — never ([§3.13](#313-operators)).
- **String concatenation with `+`** — never. Use templates or `string.concat`.
- **Rust-style `///` line doc comments** — never. Single doc-comment form is `/** */` ([§3.14](#314-comments)).
- **Nested block comments** — never. The first `*/` closes ([§3.14](#314-comments)).
- **Compiler-enforced case conventions** — never. Style is a formatter/linter concern ([§3.15](#315-identifiers-and-case-conventions)).
- **Dedented / heredoc-style multi-line literals** — deferred. May be revisited post-MVP.

---

**Note on downstream sections.** This rewrite of §3 has knock-on effects elsewhere in the spec:

- [§18](#18-null-safety--nullable-types) is removed entirely (§3.9). Any examples elsewhere using `T?` or `null` need to be rewritten to fallible signatures.
- [§44](#44-function-types--lambdas) should reference §3.6's "two equivalent forms" rule.
- [§45](#45-control-flow) examples using brace-less single-statement bodies need to be updated to add braces.
- [§49](#49-optimization--build-modes) overflow-check rules now also govern call-style numeric casts (§3.8).
- [§52](#52-mvp-compiler-scope) should stay aligned with §3.9: nullable types are not in scope; absence uses fallible signatures.

These knock-on edits are tracked but not made in this section.

---
