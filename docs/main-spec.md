# Delta Language Specification

**Status:** consolidated design draft
**Scope:** language syntax and semantics; implementation architecture is excluded except where it defines observable behavior.

This document consolidates the language rules from `docs/spec-sections/`, `docs/plans/`, the v0.5 goal, and the implemented-language notes. Where those sources conflict, the newest implemented rule or dated phase decision wins. In particular: records and receiver functions are the core object model; `owned<T>` replaces `heap T`; errors may be any declared struct; ownership uses tier-directed copy/clone/transfer; and conditional moves use drop flags. Items explicitly labeled **experimental** are not normative.

## 1. Source and lexical rules

- Source files use the `.delta` extension and UTF-8. Identifiers follow Unicode UAX #31, are NFC-normalized, and are case-sensitive. Operators and numeric digits are ASCII.
- Whitespace is insignificant except inside literals. Line endings are normalized for source positions.
- Statements end with `;`; there is no automatic semicolon insertion.
- Comments are `//` to end of line and non-nesting `/* ... */`. `/** ... */` is a Markdown documentation comment attached to the next declaration.
- A bare `{ ... }` is not a statement or scope. Braces are required for functions and all control-flow bodies.
- Standalone executable statements are forbidden at file scope. File scope accepts imports, exported or private functions, `const`, type declarations, receiver functions, and supported foreign declarations. File-scope `let` is forbidden.
- The reserved core words are `function`, `return`, `const`, `let`, `if`, `else`, `while`, `for`, `switch`, `case`, `default`, `break`, `continue`, `type`, `struct`, `enum`, `union`, `unique`, `import`, `export`, `from`, `extern`, `as`, `check`, `forward`, `error`, `edit`, `move`, `clone`, `new`, `owned`, `atomic`, `mutex`, `rwlock`, `sync`, and `rwsync`. Contextual words are reserved only in their grammatical positions.

### Literals

- Integer literals are decimal, hexadecimal (`0x`), or binary (`0b`). Octal is unsupported. `_` may separate digits but may not lead, trail, or immediately follow a base prefix.
- Float literals contain a decimal point or exponent. Unconstrained integers default to `int32`; unconstrained floats default to `float64`.
- A literal adopts an expected numeric type only when its value fits. This is literal typing, not an implicit conversion between typed values. Integer literals do not implicitly become floats.
- `true` and `false` are the only Boolean literals.
- A character literal contains exactly one Unicode scalar. `char` excludes surrogate values and values above U+10FFFF.
- A double-quoted string is single-line, escape-processed, stored in read-only data with a trailing NUL, and defaults to `stringview`. A backtick template may span lines, supports `${expression}`, always produces owned `string`, and may interpolate only strings, numeric primitives, `bool`, and `char`. There is no raw-string form in the core language.
- Supported string/character escapes are `\n`, `\r`, `\t`, `\\`, `\"`, `\0`, braced Unicode `\u{...}`, and backslash-newline continuation where applicable.
- `null`, nullable type syntax, and optional-parameter `?` syntax do not exist.

### Expressions and precedence

From lowest to highest: `||`; `&&`; bitwise `|`; `^`; `&`; `==` and `!=`; `<`, `<=`, `>`, `>=`; `<<`, `>>`; `+`, `-`; `*`, `/`, `%`; unary `-`, `!`, `~`, `move`, `clone`, `new`; then call, member, generic-argument, and index postfixes. Binary operators are left-associative. Calls and their arguments are evaluated left-to-right.

Assignment is a statement, not a value. The assignment operators are `=`, `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, and `>>=`. The left side is evaluated once. `++`, `--`, `**`, `??`, `===`, `!==`, the comma operator, `in`, and `instanceof` are not part of the language.

## 2. Programs, modules, and visibility

- One file is one module. A module's stable identity is its project-relative path without `.delta`; path separators become namespace separators for generated symbols.
- Selective imports have the form `import { Name, Other } from "path";`. A file ending in `export module name;` exports its complete top-level scope, including imported bindings, and may be consumed with `import name from "path";` or `import name as local from "path";`. All imports must precede every non-import declaration. The current core has no selective-import renaming syntax.
- Relative paths must begin with `./` or `../` and resolve relative to the importing file. A manifest may define project-root-relative import mappings through `delta.json`'s `dependencies` object; dependency names have the form `@name` and match both exact imports and subpaths. `@std/...` is reserved for the compiler-shipped standard library and cannot be redefined. The legacy `std/...` spelling remains accepted. Other bare roots are rejected.
- The module graph is acyclic. Missing modules, missing names, import cycles, and imports of private declarations are compile errors.
- `export` on a top-level function, `const`, type, or receiver function makes it visible outside its module. Without `export module`, an unmarked declaration is module-private. `export module` exports every eligible local declaration and re-exports every imported binding as a group. Record fields are transparent; receiver functions travel with their receiver type.
- A record's receiver function must be declared in the same module as the record. Importing the record makes its exported receiver functions available; method names are not separately imported.
- A program has exactly one `function main(): int8`. Its returned value is the process exit status. Top-level code never runs implicitly.
- A project may be built from an explicit entry `.delta` file or a JSONC `delta.json`. A manifest may select the entry, build options, and import path aliases; comments and trailing commas are permitted, unknown fields are ignored, and the schema version is checked.

## 3. Names, scopes, and bindings

- Function bodies, receiver bodies, lambdas, `if`/`else`, loops, each `switch` case, and each `check` body create lexical scopes.
- A declaration may not duplicate a name in its scope or shadow a name visible from an enclosing scope. Parameters participate in this rule.
- `const name: T = value;` creates a read-only binding and always requires an initializer. `let name: T = value;` creates a mutable binding.
- `let name: T;` is legal. Definite-assignment analysis rejects every read, mutation, borrow, move, or clone on a path where the binding is uninitialized.
- Initialization is whole-value only. Fields or elements of an uninitialized aggregate cannot be assigned individually.
- A normal declaration introduces one binding. Comma-separated bindings are reserved for destructuring a function's multiple success values.
- `const` is recursively read-only through its normal access paths. `let` permits whole-value replacement and field/element mutation when the underlying type permits it.
- Whole-value replacement first obtains a valid replacement. If that operation fails, the old value remains unchanged; after success, the old owned value is disposed and the replacement is installed.
- Type inference is local and bidirectional only at defined contextual sites: annotated bindings, arguments, returns, aggregate fields, literals, and generic calls. Failure to infer a complete type is an error; there is no implicit dynamic type.

## 4. Types

### Primitive types

| Family            | Types and rules                                      |
| ----------------- | ---------------------------------------------------- |
| Signed integers   | `int8`, `int16`, `int32`, `int64`, `intsize`         |
| Unsigned integers | `uint8`, `uint16`, `uint32`, `uint64`, `uintsize`    |
| Floating point    | `float32`, `float64`, IEEE 754                       |
| Logical           | `bool`; only logical operators and equality apply    |
| Character         | `char`; a 32-bit Unicode scalar                      |
| Unit return       | `void`; legal only as a function's sole success type |

`intsize` and `uintsize` have target pointer width and remain nominally distinct from same-width fixed integers. Lengths, sizes, capacities, and indices use `uintsize`.

### String family

| Type          | Ownership        | Invariant                       |
| ------------- | ---------------- | ------------------------------- |
| `string`      | owned, immutable | valid UTF-8, length-bearing     |
| `stringview`  | non-owning view  | valid UTF-8, length-bearing     |
| `cstring`     | owned, immutable | NUL-terminated, no embedded NUL |
| `cstringview` | non-owning view  | NUL-terminated                  |

Owned-to-corresponding-view conversion is implicit and zero-cost. Other conversions use `T.from(value)` or a named operation such as `cstring.scan`; allocation, NUL validation, or UTF-8 validation is fallible where required. Strings have no `+`, comparison operators, default iteration, integer indexing, or ambiguous `.length`. They use templates or `StringBuilder` for concatenation, `.equals`/`.compare` for comparison, `.bytes()` or `.chars()` for iteration, and `.byteLength`/`.charCount` for size. UTF-8 slicing uses checked `ByteOffset` values and a binding-selected owned or view result.

### Compound and special types

- `T[N]` is a fixed inline array. `N` is a positive compile-time integer fitting `uintsize`; zero and runtime lengths are invalid. The array's identity includes element type and length. Literals must have exactly `N` elements when context supplies the type. Indexing requires `uintsize` and is bounds-checked.
- `T[]` is a non-owning contiguous slice represented by a pointer to `T` and a `uintsize` `size` property. A fixed array converts to a slice without copying, and a contextually typed array literal creates backing storage with the lifetime of its enclosing block. `[]` is valid when a `T[]` annotation, parameter, return, assignment, or field context supplies `T`; an untyped `[]` remains an inference error. `&T[]` and `edit &T[]` are references to the slice descriptor itself and lower to descriptor pointers.
- `Array<T>` is the planned growable owning array; the implemented non-owning view syntax is `T[]`. Other standard containers follow the ownership capability of their elements.
- `&T` is a read-only, non-null reference. `edit &T` is an exclusive mutable reference.
- `owned<T>` is the core non-null single-owner heap indirection. `shared<T>` is not a compiler type or reserved form; it is planned as an ordinary standard-library generic derived from `owned<T>`.
- `rawptr<T>` is a C-origin pointer with no Delta ownership, lifetime, aliasing, or validity guarantee. Delta source cannot fabricate it.
- A function type includes parameter types, ordered success types, and its declared error set.
- No type has a null value. Absence is represented by a fallible result or by a tagged union whose variants have the appropriate fields.

## 5. Numeric semantics

- Numeric operands must have the types required by the operator; there is no implicit widening, narrowing, sign change, or integer/float promotion.
- `+`, `-`, `*`, and `/` accept equal numeric types. `%` and bitwise operators accept equal integer types. Unary `-` accepts signed integers or floats; `!` accepts `bool`; `~` accepts integers.
- Shift left operands are integers and counts are exactly `uint32`. Counts at least the left operand's width trap. Signed right shift is arithmetic; unsigned right shift is logical.
- Integer `/` and `%` use truncation toward zero. Division or remainder by zero and signed minimum divided by `-1` trap.
- Integer overflow and underflow trap in every build mode, including unsigned arithmetic. Compile-time-known failures are compilation errors.
- Floating arithmetic follows IEEE 754 and may produce infinities or NaNs. Float-to-integer conversion traps on NaN, infinity, or out-of-range input. Integer-to-float conversion rounds according to IEEE 754.
- Call-style conversion `Target(value)` is the numeric conversion syntax. Narrowing and sign-changing conversions are checked. `bool` never converts to or from an integer; use a comparison or ternary.
- `char` converts freely to `uint32`; conversion to `char` validates the Unicode scalar range.
- Every runtime trap-capable numeric operation may instead be bound with `as resultName`; this converts the trap to the corresponding typed error. A provably infallible expression may not use `as resultName`.
- `Wrap<T>` selects modular integer arithmetic; `Saturate<T>` selects clamping arithmetic. Both are representation-transparent, integer-only tags. Entering a tag is contextual; leaving it uses `.value`. Mixing the tags is invalid.
- `bitCast<From, To>` reinterprets equal-size values without numeric conversion; unequal sizes are rejected at compile time.
- The optimizer may remove a check only when it proves the failure impossible. Optimization never changes overflow, bounds, panic, evaluation-order, error, ownership, lifetime, or disposal semantics.

## 6. User-defined types and generics

### Structs and aliases

- `type struct Name<T, ...> = { field: Type, ... };` declares a fresh nominal record. `unique type Name = { ... };` declares an explicitly non-duplicable record. `type Alias = Existing;` declares a transparent alias.
- Fields have no defaults or per-field visibility. Field names are unique. Direct or mutual by-value recursion is invalid; `owned<T>` breaks the size cycle.
- A struct value is written as `Name { field: value, ... }` or as a context-pinned object literal. Every field appears exactly once; field order is irrelevant. Unpinned object literals are invalid.
- Type composition may spread a struct into a declaration or intersect struct shapes. Field collisions are errors; there is no override. Value spread requires compatible structural fields and may not create duplicates.
- Structs do not receive compiler-derived `==`, `!=`, or ordering. Comparison is explicit behavior.

### Enums

- `type enum Name = { A, B, ... };` assigns consecutive `int32` values from zero. `type enum Name = { A: value, B: value, ... };` uses explicit `int32` literals. The two modes cannot be mixed.
- Member names are unique; duplicate numeric values are allowed. `Name.Member` has enum type and an `int32` constant representation.
- An integer literal may enter an enum-typed context only if it equals a declared member. A runtime integer requires a future checked conversion.
- Equality and ordering use the backing value. A `switch` over an enum is exhaustive unless it has `default`.

### Tagged unions

- `type union Name<T, ...> = VariantA<...> | VariantB<...> | ...;` declares a nominal tagged union over predeclared named types. A value is constructed with the selected variant's normal struct construction and is accepted only in a context expecting that union.
- A union's active payload is accessible only after variant discrimination. Variant dispatch is exhaustive unless a `default` is present, cases do not fall through, and each case has its own scope.
- Union equality and ordering are unsupported; users write explicit dispatch when comparison is meaningful.

### Generics

- Functions, structs, and unions may declare type parameters with `<T, U>`. Uses must supply the correct arity; nested instantiations are allowed, and duplicate parameter names are rejected.
- Function type arguments may be explicit or inferred from argument and expected-result types. Conflicting or incomplete inference is an error.
- Instantiations are monomorphized. Only concrete instantiations exist at runtime.
- Ownership bounds select one tier: `<T>` is copyable, `<clone T>` is cloneable, and `<unique T>` is unique. Structural interface constraints may use `extends`. A concrete overload outranks a generic overload.
- Overloads are selected by arity and exact parameter types, never by return type or implicit conversion. A fixed-arity exact match outranks a variadic match.

## 7. Functions, receiver functions, and calls

- A function is declared as `function name<T>(parameters): Success1, Success2 | Error1, Error2 { ... }`. Omitted success types mean `void`; `void` cannot be combined with another success type.
- Parameters are positional. Defaults, where supported, must be compile-time constants, follow all required parameters, and may not depend on earlier parameters.
- A Delta variadic parameter is last and has the form `...items: T[]`; the body observes a slice. Raw C variadics exist only in C-imported or `extern "c"` declarations and accept only C-ABI-passable arguments.
- A receiver function is declared as `function (self: &Record) name(...)` or `function (self: edit &Record) name(...)`. By-value receivers are forbidden.
- Receiver names share one namespace with fields. A receiver function may overload normally but may not collide with a field. There are no orphan receiver functions.
- `value.method(...)` auto-forms the required receiver reference. A `const` value or `&T` can call only `&T` receivers; a `let` value or `edit &T` can call either.
- A call may contextually auto-borrow an addressable argument for `&T` or `edit &T`. For a non-copyable argument, compatible borrow overloads rank ahead of by-value overloads; immutable borrow ranks ahead of mutable borrow. Explicit `&`, `edit &`, `move`, or `clone` fixes the intended operation.
- Function bodies must return on every reachable path when their success type is non-`void`. Unreachable statements are compile errors.

## 8. Control flow

- Conditions of `if` and `while` are exactly `bool`; Delta has no truthiness.
- The core loop forms are C-style `for (initializer; condition; step)`, counted range loops over `lo..hi` or `lo..=hi`, and iterable loops over a value that exposes the iteration protocol. Loop-bound variables are scoped to the loop.
- `break` and `continue` are legal only inside loops. They are recognized as divergent exits when validating `check` bodies.
- A value `switch` accepts compatible scalar or enum case constants. Duplicate labels are errors. Cases do not fall through and therefore do not need `break`.
- Tagged-union switching narrows the scrutinee to the selected variant and must be exhaustive unless `default` is present.
- `return`, `panic`, `process.exit`, `unreachable`, `break`, `continue`, `forward`, and a call returning `never` are divergent in the contexts where each is legal.

## 9. Fallible results and errors

- Any declared struct may be an error type; no mandatory `code` or `message` fields exist. A function declares a closed nominal error set after `|`. Duplicate entries are normalized; undeclared, primitive, or non-struct entries are invalid.
- Fallible success shapes are `T | E`, `T1, T2 | E1, E2`, and `void | E`. Errors use a separate tagged channel, not exceptions, nulls, or a user-visible `Result<T,E>` wrapper.
- Every fallible call or recoverable trap is introduced by one of: `const values = expression as resultName;`, `let value = expression as resultName;`, `storage = expression as resultName;`, or `expression as resultName;` for `void` success.
- Success bindings and target storage are pending until the named result is discharged. Pending values cannot be read, written, borrowed, moved, cloned, returned, or captured. A fallible assignment commits only after success.
- `check resultName { ... }` handles a single remaining error type. Inside it, `resultName.error` is readable, and every path must diverge. There is no `else`.
- For multiple errors, `check resultName as ErrorType { ... }` handles one variant. Checks may be sequential, each variant may appear once, and success remains pending until all variants are handled or the remainder is forwarded.
- `forward resultName;` returns every still-unhandled error unchanged. It is legal only when the remaining error set is a subset of the enclosing function's declared error set; on success it falls through and validates the pending values.
- A new error is returned with `return error as ErrorType { fields };`. The shorter `return error as { fields };` is valid only when the enclosing error set and fields uniquely identify one type. An already typed error value may be returned with `return error as value;`.
- Ordinary `return` returns success values. A fallible call without `as resultName`, an undisposed result at scope exit, duplicate checks, missing checks, or a non-diverging check body is a compile error.
- Panics are not catchable. Any failure meant to be recoverable must use the fallible channel.

## 10. Ownership, moves, cloning, and disposal

Every value belongs to one operational tier:

| Tier                        | Bare assignment/by-value call                     | Source afterward |
| --------------------------- | ------------------------------------------------- | ---------------- |
| Copyable                    | bitwise/value copy                                | live             |
| Cloneable (owned resources) | recursive deep clone; abort on allocation failure | live             |
| Unique                      | ownership transfer                                | moved            |

- Primitive values, enums, read-only references, views, and aggregates containing only copyable members are copyable.
- An aggregate containing cloneable owned storage is cloneable if every member can be copied or cloned. `owned<T>` is cloneable exactly when `T` is; it is never bitwise-copyable.
- `unique type`, unique standard resources, mutable reference fields, locks, guards, and aggregates containing a unique member are unique. Unique values cannot be cloned.
- `move value` transfers a whole live `let` binding or owned by-value parameter and invalidates it. It works in every tier and is the way to prevent an implicit clone of a cloneable value. It cannot consume a `const`, field, indexed element, reference, temporary, pending result, or already moved value.
- A bare use of a unique field is a forbidden partial move. The whole aggregate must transfer.
- `clone path` duplicates a readable copyable or cloneable value. For a cloneable value it recursively allocates and aborts on allocation failure; `clone path as resultName` is the only recoverable clone form. Clone construction is transactional and disposes partial work on failure.
- Returning a whole owned local or owned by-value parameter transfers it. For cloneable values this mandatory return clone-elision avoids duplicating a value that is about to leave scope. Returning fields, indexed elements, globals, captures, or referenced values does not transfer ownership.
- Move state is path-sensitive: uninitialized, live, moved, or maybe-moved. A move on every converging path yields moved; disagreement yields maybe-moved. A maybe-moved binding cannot be used but is safely disposed through a hidden drop flag.
- A moved or maybe-moved `let` binding may be revived only by whole-value assignment. Loop back-edges preserve move state; use on a later iteration requires the binding to have been revived.
- Owned values are disposed automatically on every exit path. Bindings are disposed in reverse declaration order and fields in reverse field order. Moved values are skipped; maybe-moved values are flag-gated. User code never calls disposal directly.
- A custom `function (x: edit &T) dispose(): void` is allowed only for an explicitly `unique type T`; it must not be fallible and is compiler-invoked. There is no `defer` or `using`; arbitrary cleanup is represented by a unique guard whose disposal performs it.
- The compiler has no shared-ownership tier. A future library `shared<T>` follows the ordinary ownership rules of its `owned<T>`-based representation and exposes sharing operations through its API.

## 11. References and lifetimes

- `&T` permits reads. `edit &T` permits reads, mutation, and whole-referent replacement. Mutable access may never be derived from a read-only source.
- References are non-owning, non-null, and do not dispose, move, or extend the life of their referent. A reference cannot satisfy a by-value parameter; an explicit clone of its referent may create an owned value when the type is cloneable.
- Reference operands are live addressable places: bindings, fields, and supported stable indexed places. Temporaries, literals, arbitrary computed expressions, pending values, and moved values cannot be referenced.
- Many overlapping read references may coexist, or one mutable reference may exist. In the call-scoped model, an `edit &` locks the syntactic root for the call and conflicts with any read, write, move, or aliasing view of that root. Full lifetime analysis refines this to overlapping places and permits disjoint fields.
- A reference or view may not outlive its source. Owned locals and owned by-value parameters may back local references, but never escaping references or views.
- Local/stored/returned references and lifetime-bearing aggregates require provenance tracking. The compiler infers and writes `@lifetime(...)` contracts; handwritten or stale contracts are rejected.
- A direct returned reference/view lists its source paths. A returned aggregate maps each lifetime-bearing result field path to a parameter, receiver path, or `static`. Multiple sources mean the result expires when the first source expires.
- Read-only reference and view fields are copyable while preserving provenance. A stored `edit &T` is a unique capability and makes its aggregate unique.
- Views such as `Slice<T>`, `stringview`, and `cstringview` participate in the same provenance rules. A view derived from `static` data may escape with static lifetime.

## 12. Allocation and synchronization

- `new value` allocates the target indirection selected by context. `new value as resultName` reports `AllocError`; bare `new` aborts on allocation failure.
- `owned<T>` points to one allocation, auto-dereferences for field/method access, transfers ownership on move, recursively clones into a new allocation, and drops the pointee before freeing.
- `shared<T>` has no privileged syntax, type identity, auto-dereference, copy rule, cycle-breaking rule, or code generation. The standard library may define it as an ordinary generic built from `owned<T>`.
- `mutex<T>.lock()` yields a unique mutable guard. `rwlock<T>.read()` and `.write()` yield read and write guards. Guards unlock automatically on disposal and cannot be cloned. Scoped `.with(...)` operations may not let the guard escape.
- Thread creation/join and static `Send`/`Sync`-style checking remain deferred.
- In the current v0.5 placement subset, explicit `owned<T>` annotations are restricted to fields and parameters, and bare indirection return types are rejected. Contextually produced local handles and records containing them are allowed. This restriction may be lifted without changing ownership semantics.

## 13. Standard collection and I/O contracts

- Standard containers are allocator-aware, bounds-checked, and ownership-aware. APIs borrow for observation, use `edit &` for mutation, and take values only when ownership genuinely transfers.
- Bounds failures panic by default and may use `as resultName` where the operation exposes a recoverable bounds error. The optimizer may elide only proven-safe checks.
- Collection clone, insertion, removal, growth, and replacement follow the element ownership tier. Allocation failure is either explicit through the error channel or aborting where the API is documented as infallible-at-source.
- Iterators and views are invalidated by storage mutation according to the container contract; the borrow/lifetime checker prevents statically visible overlap.
- I/O is partial by default: reads and writes report the amount transferred; end-of-file is distinct from an operational error. Handles are unique resources and close automatically on disposal. Explicit close, when exposed, consumes the handle so it cannot be closed twice.
- Standard APIs do not hide ambient mutable globals. Standard input/output/error, environment, clocks, and allocators are accessed through explicit handles or module functions.

## 14. C interoperability

- High-level inbound interop is `import c "header.h" as namespace;`. The compiler imports C functions, constants, records, enums, typedefs, and opaque types through Clang. Minimal hand declarations may use `extern "c" { function ...; }`; only declarations are allowed and names are not mangled.
- C pointers enter Delta as nullable-until-checked `rawptr<T>`. A C-returned pointer must use `as resultName` and be checked before use. After non-null checking, C ownership, lifetime, aliasing, alignment, initialization, allocator, and destructor rules remain the programmer's responsibility.
- Delta cannot construct a raw pointer, cast an integer to one, or expose a storable raw pointer from owned storage. Safe references, slices, strings, and managed handles may decay only for the duration of a C call.
- `ptr<T>` is the managed wrapper for an adopted foreign handle plus its destructor. Adoption is explicit because non-nullness does not prove ownership.
- C variadic arguments are limited to ABI-passable integer, float, and C-string forms. Values subject to C default promotions require explicit conversion.
- Outbound C headers project the module's public surface. Functions and methods use clean author-derived C names; collisions are compilation errors. Synthesized result, slice, and generic-instance types never appear in the public header.
- A fallible exported function projects to a status code plus success out-parameters; `void | E` needs only the status. Slices project to pointer/length pairs. Concrete generic instances require author-named aliases. Ownership-returning exports receive a paired destructor.
- Once ownership crosses into C, C must call the paired destructor exactly once and avoid use-after-free. Delta traps abort the entire process and cannot unwind through C; exported APIs intended to survive failure must convert every trap-capable operation to a fallible result.

## 15. Runtime and compilation guarantees

- Delta is statically typed and ahead-of-time compiled. Generated C is an internal representation; its layout and names are not source-level contracts except at an explicit C boundary.
- Observable expression evaluation is left-to-right. Optimization preserves side effects, traps, panic locations to the supported precision, error tags, moves, retains/releases, destruction order, and lifetime boundaries.
- A panic prints a source-located diagnostic and aborts. It is not an exception and cannot be caught. A panic hook may observe but not suppress termination.
- Debug and release modes do not change language safety semantics. Integer overflow, division, shift, cast, and required bounds checks remain enabled unless individually proven unnecessary.
- Floating-point optimization follows strict IEEE behavior by default; transformations that change NaN, infinity, signed-zero, rounding, or evaluation semantics require an explicit future fast-math mode.
- Build outputs and module symbol order are deterministic for identical sources, compiler, target, and configuration.

## 16. Experimental and deferred language surface

The following designs are recorded by plans but are not part of the normative core until promoted:

- **Distinct newtypes:** `type UserId = distinct int32;` creates a zero-cost nominal type incompatible with its base and sibling newtypes.
- **Refinement types:** `type Positive = V > 0 where V: int32;` restricts values using a closed, decidable predicate theory. Proven values enter freely, disproven constants fail at compile time, and unproved runtime values require `as resultName` and yield `RefinementError`.
- **State families:** `type File = distinct Base has states { Open, Closed };` creates zero-cost sibling state types. Transitions are consuming functions; casts between states are forbidden. The same mechanism models taint/provenance.
- **Units:** unit exponent vectors are checked structurally and erased at runtime. Addition/subtraction require equal units; multiplication/division combine exponents; unit conversion is explicit.
- **`never`:** the return type of a function that cannot return. It participates only in exit-path analysis, never as an error type or optionality mechanism.
- **Classes:** a future encapsulated type form with private-by-default fields, explicit public members, controlled construction, `edit` methods, and unique custom cleanup. Records plus receiver functions remain the core object model; inheritance is not planned.
- **Interfaces:** structural method/field constraints for generic APIs. Ownership capabilities remain separate and compiler-defined.
- **Lambdas and closures:** arrow syntax, capture-driven lowering, and lifetime/ownership checks on captures. Escaping reference captures are forbidden unless their provenance proves safety.
- **Decorators:** a closed compiler-recognized set such as representation, packing, inlining, and C-export metadata. User-defined decorators are deferred.

## Demonstration

```delta
import { info } from "std/log";

type struct OverflowError = { };
type struct Counter = { value: int32 };

export function (counter: edit &Counter) add(amount: int32): void | OverflowError {
    counter.value = counter.value + amount as arithmetic;
    check arithmetic {
        return error as OverflowError { };
    }
    return;
}

function main(): int8 {
    let counter: Counter = Counter { value: 0 };
    counter.add(1) as update;
    check update {
        return 1;
    }
    info("counter", int64(counter.value));
    return 0;
}
```
