## 7. String Family Types

Section 7 covers Delta's four string types: owned and borrowed variants of both UTF-8 strings and NUL-terminated C strings. The recurring principles are **separate ownership from representation** (each axis — UTF-8 vs NUL-terminated, owned vs borrowed — gets its own type rather than being a runtime flag), **invariants are enforced by construction** (every value of each type is valid by the time it exists, so consumers never re-validate), and **cost is visible at the call site** (allocation, scanning, and copying never hide behind operators or implicit coercions that look free). Each sub-feature below follows the Proposal / Reason / Examples / Conclusion structure.

---

### 7.1 Type Set

**Proposal.** Four lowercase atom types form the string family:

- **`string`** — owned, immutable, heap-backed, valid UTF-8. Shape: `{ ptr, byteLength, ...allocator info per §35 }`.
- **`stringview`** — borrowed, immutable, valid UTF-8. Shape: `{ ptr, byteLength }`. Non-owning view into bytes owned by something else (`string`, `.rodata`, `StringBuilder` buffer, etc.).
- **`cstring`** — owned, NUL-terminated, FFI-compatible. Shape: `{ ptr }` pointing at heap-allocated bytes ending in `\0`. No embedded NUL.
- **`cstringview`** — borrowed, NUL-terminated. Shape: `{ ptr }` pointing at NUL-terminated bytes owned by something else (typically `.rodata` or C-returned memory).

Naming follows the [§6](#6-other-primitive-types-bool-char-void) convention: lowercase for atomic non-generic types (`string`, `stringview`, `cstring`, `cstringview`, `int32`, `bool`, `char`); PascalCase for generic and container types (`Array<T>`, `Map<K, V>`, `Slice<T>`, `StringBuilder`). Owning heap indirection is spelled with the `heap T` type modifier, not a PascalCase generic type.

**Reason.** A single `string` type collapses ownership, sharing, and C interop into one type and forces hidden allocations or hidden copies at every boundary. Splitting along the **ownership axis** (owned vs borrowed) makes lifetime tracking visible in the type system. Splitting along the **representation axis** (length-prefixed UTF-8 vs NUL-terminated) makes C FFI a typed handoff rather than a per-call conversion.

The fourth type — `cstringview` — earns its place at the FFI boundary. The most common shape of a C function returning a string is "here is a `const char*` I still own"; without a borrowed C-string type, the binding would either lie (treat the pointer as an owned `cstring` and risk freeing C's memory) or fall back to raw `pointer<uint8>` (loses safety and length recovery). `cstringview` is the typed wrapper that makes that pattern safe.

Lowercase naming for atoms keeps `string` visually peer to `int32`, `bool`, `char` — types that the program is built on at every level. Reserving PascalCase for generic and container types preserves the type/identifier visual split (a function signature `fn f(s: string, xs: Array<int32>)` reads at a glance).

**Examples.**
```ts
const name: stringview  = "Delta";              // borrow from .rodata, zero cost
const owned: string     = "Delta";              // allocates, copies from .rodata
const cstr:  cstring    = "Delta";              // allocates with NUL, copies from .rodata
const cview: cstringview = "Delta";             // borrow NUL-terminated bytes from .rodata
```

**Conclusion.** Adopt all four lowercase atom types: `string`, `stringview`, `cstring`, `cstringview`. The remaining subsections specify invariants, literal storage, construction, conversions, and the operator/method surface for each.

---

### 7.2 The UTF-8 Invariant

**Proposal.** `string` and `stringview` are valid UTF-8 by construction. Every byte sequence held by either type decodes successfully under the UTF-8 grammar — no surrogate halves, no overlong encodings, no truncated multi-byte sequences. There is no runtime "is this still valid UTF-8?" predicate because the answer is statically "yes."

`cstring` and `cstringview` carry a weaker invariant: NUL-terminated, no embedded NUL. They are not guaranteed to be valid UTF-8, because they may originate from C code that produced arbitrary bytes. Conversions from `cstring` / `cstringview` to `string` / `stringview` therefore validate UTF-8 and are fallible.

For arbitrary bytes — including bytes that are not valid UTF-8 — use `Buffer` or `Slice<uint8>` from [§37](#37-standard-collections).

**Reason.** A UTF-8 invariant carried in the type system removes an entire class of bug from text processing. Iteration (`s.chars()`), display, encoding/decoding at FFI boundaries, and serialization can all be infallible: they decode bytes the compiler has already proven are valid. Languages that allow "maybe valid" string types end up with `Result<char>` on every iteration step or a separate `ValidatedString` type that splits the ecosystem.

Excluding the invariant from `cstring` / `cstringview` is a concession to FFI reality. C libraries return whatever bytes they return; pretending otherwise would either reject most C strings or silently mis-decode. Forcing validation at the C↔Delta boundary keeps the rest of the language honest.

Routing arbitrary-byte work through `Buffer` / `Slice<uint8>` ([§37](#37-standard-collections)) keeps `string` from doubling as a bag-of-bytes type — the C++ `std::string` mistake.

**Examples.**
```ts
const s: string = "café";                       // 5 bytes: 0x63 0x61 0x66 0xC3 0xA9
const v: stringview = s;                        // borrow, still valid UTF-8

// From cstring: fallible (might be invalid UTF-8)
const c: cstring = ...;
const sv = cstring.scan(c) as result;           // see §7.5; sv: stringview on success
check result { /* invalid UTF-8 or other failure */ return; }

// For arbitrary bytes that may not be UTF-8
const bytes: Slice<uint8> = file.readBytes(...);
```

**Conclusion.** `string` and `stringview` are valid UTF-8 by construction. `cstring` and `cstringview` are NUL-terminated only — UTF-8 validity is checked at conversion to the UTF-8 types. Arbitrary bytes use `Buffer` / `Slice<uint8>`.

---

### 7.3 Literal Forms and Storage Model

**Proposal.** Delta has three string-related literal syntaxes:

- **`"..."`** — double-quoted, single-line. Default unannotated type is `stringview` ([§4.2](#42-default-types-for-literals)); with a binding annotation, materializes as `string`, `cstring`, `cstringview`, or `stringview` per the [§3.11](#311-numeric-literals)-style literal-fits-target rule. Escape sequences processed.
- **`'a'`** — single-quoted, exactly one Unicode scalar value. Always `char` ([§6.2](#62-char--representation-literals-and-escapes)).
- **`` `...${expr}...` ``** — backtick-delimited. Supports multi-line content and `${expr}` interpolation. **Always produces `string`** (allocates). Not directly assignable to `stringview`, `cstring`, or `cstringview`.

There is no triple-quoted (`"""..."""`) form and no raw-string (`r"..."`) form in MVP.

The supported escape set inside `"..."` (and inside the literal-text portions of `` `...` ``) for MVP:

```
\n  \r  \t  \\  \"  \0  \u{NNNNNN}  \<newline>
```

`\u{NNNNNN}` takes 1–6 hex digits; the codepoint must be a valid Unicode scalar value (no surrogates, no values above `0x10FFFF`). `\<newline>` (a backslash followed by a literal line break) is a line continuation — the source line break is not part of the string. The set may expand post-MVP; additions are explicitly out of scope here.

Interpolation expressions inside `${...}` accept a fixed set of types — see [§7.4](#74-template-interpolation).

**Storage model.** Every string literal is emitted into the binary's read-only data segment (`.rodata`) with a trailing NUL byte appended by the compiler. The trailing NUL is invisible to `string` and `stringview` (which use the explicit `byteLength`) but enables `cstring` and `cstringview` literals to share the same underlying bytes. Cost: one byte per unique literal in the binary.

Construction cost by binding type:

| Binding | Backing | Runtime cost |
|---|---|---|
| `stringview = "..."` | `.rodata` borrow | zero |
| `cstringview = "..."` | `.rodata` borrow | zero |
| `string = "..."` | heap copy from `.rodata` | one malloc + memcpy |
| `cstring = "..."` | heap copy from `.rodata` (with NUL) | one malloc + memcpy |

The empty string literal `""` is a special case: a single shared sentinel exists in `.rodata`, and `string` / `cstring` destructors check for the sentinel before freeing. All four empty-literal forms point to it; none allocate.

**Reason.** The `.rodata` storage model is what makes `const v: stringview = "hello"` truly free: the bytes already exist in the binary image, and the view is just a `{ptr, byteLength}` pair pointing at them. No allocator is involved, no destructor runs, and the borrow is sound because `.rodata` outlives every possible scope.

Appending a trailing NUL to every literal unconditionally — rather than only when the literal appears in a `cstring`/`cstringview` context — keeps the lowering uniform. The compiler does not need to track which literals are referenced from FFI contexts; one byte per literal is a rounding error in any real binary.

Backticks doing double duty for multi-line and interpolation drops the triple-quoted form without losing capability. Two literal forms (single-line and multi-line/interpolated) is one fewer to teach, and matches the user expectation that multi-line text is the place where interpolation is most useful anyway. The cost is that no-interpolation backtick literals (e.g. `` `hello` ``) still allocate — but readers can see the backticks and know what they signal.

The MVP escape set covers what's strictly load-bearing. `\xNN` is excluded because a single byte above `0x7F` is not a valid UTF-8 sequence; allowing it would let lexer-time literals violate the UTF-8 invariant. The `\u{...}` form covers every codepoint unambiguously. Rare control codes (`\b`, `\f`, `\v`, `\a`) are excluded; if needed they can be written as `\u{...}`.

**Examples.**
```ts
// Single-line, escape-processed, binding-driven
const v: stringview  = "hello\nworld";          // .rodata borrow, zero cost
const s: string      = "hello\nworld";          // allocates, copies
const c: cstring     = "hello\nworld";          // allocates with NUL
const cv: cstringview = "hello\nworld";         // .rodata borrow

// char literal — always char
const ch: char = 'δ';

// Backtick — multi-line + interpolation, always string
const name: stringview = "world";
const msg: string = `hello,
${name}!
welcome.`;

// Backtick to stringview is a compile error
const bad: stringview = `hello, ${name}`;       // ERROR — template allocates,
                                                //   cannot bind to view

// Empty string — shared sentinel, no allocation in any binding
const e1: stringview = "";
const e2: string     = "";                      // sentinel-skip on drop
const e3: cstring    = "";                      // sentinel-skip on drop
const e4: cstringview = "";

// Escape set: legal forms
const a: string = "tab\there\nand newline";
const b: string = "smile: \u{1F600}";
const cont: string = "first \
second";                                        // single-line: "first second"

// Disallowed escapes
const bad1: string = "\x41";                    // ERROR — \xNN not in MVP set
const bad2: string = "\u{D800}";                // ERROR — surrogate codepoint
```

**Conclusion.** Three literal syntaxes: `"..."` (default `stringview`, binding-driven), `'a'` (`char`), `` `...` `` (always `string`). Literals live in `.rodata` with an appended NUL; view bindings are zero-cost; owned bindings allocate and copy. The MVP escape set is intentionally narrow.

---

### 7.4 Template Interpolation

**Proposal.** Inside `${expr}` of a backtick literal, `expr` must have one of a fixed set of types. The set is closed; user types are not interpolable.

Permitted types:

- The four string family types: `string`, `stringview`, `cstring`, `cstringview`.
- All numeric primitives: `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64`, `float32`, `float64`.
- `bool`.
- `char`.

Any other type — struct, interface, enum, tagged union, generic — produces a compile error at the interpolation site. The caller must convert explicitly:

```ts
struct Point { x: int32; y: int32; }
const p: Point = ...;
const s: string = `pos = ${p}`;                 // ERROR
const s: string = `pos = ${pointToString(p)}`;  // OK — caller chooses formatting
```

Formatting of permitted types follows fixed default rules (integers in decimal, floats with a default precision, `bool` as `true`/`false`, `char` as its single-scalar representation). Format-control syntax (precision, width, padding) is not part of §7; if it lands at all it will be in a future stdlib module.

**Reason.** A closed type set avoids the trait-and-runtime-dispatch machinery a general `Display`/`Stringify` interface would require. The permitted types together cover the overwhelming majority of real interpolations (numbers, bools, chars, strings); user types that need formatting are inherently caller-defined (which precision? which separator? which locale?), and forcing the caller to be explicit is no real burden.

Rejecting reflection-based default formatting heads off the noisy-output failure mode where a struct gets printed as `{x: 1, y: 2}` because someone forgot to write a custom formatter — a class of bug that's common in languages with permissive defaults.

**Examples.**
```ts
const name: stringview = "Delta";
const count: int32 = 42;
const pi: float64 = 3.14159;
const ok: bool = true;
const letter: char = 'A';

const s: string = `${name} ${count} ${pi} ${ok} ${letter}`;
// "Delta 42 3.14159 true A"

// User types must convert explicitly
struct Point { x: int32; y: int32; }
const p: Point = ...;
const bad: string = `pos = ${p}`;               // ERROR — Point not interpolable
```

**Conclusion.** Template interpolation accepts a fixed set: string family + numerics + `bool` + `char`. No traits, no reflection, no default user-type formatting.

---

### 7.5 Construction and Conversion

**Proposal.** The universal explicit constructor for any string family type `T` is **`T.from(x)`**, returning `T`. Implicit coercions exist for zero-cost cases. The rules:

**Owned construction (`string.from`, `cstring.from`):**
- `string.from(x)` accepts `string`, `stringview`, `cstring`, `cstringview` and **always allocates**. Returns `string`.
- `cstring.from(x)` accepts the same set and is **fallible**: returns `cstring | CStringError` because the source may contain an embedded NUL. Bind with `as result` per [§22](#22-consuming-fallible-calls-as-result).

**View construction (`stringview.from`, `cstringview.from`):**
- `stringview.from(x)` accepts `string` and `cstring` (and `stringview` as identity). Returns `stringview`. Zero-cost when borrowing a known-length source.
- `cstringview.from(x)` accepts `cstring` (and `cstringview` as identity). Returns `cstringview`. Zero-cost.

**Implicit owned→view coercion:** at a binding or call site, an owned type may be assigned to its view counterpart without `stringview.from` / `cstringview.from`:

```ts
const owned: string = "hello";
const view:  stringview = owned;                // implicit borrow, zero-cost
```

The implicit form is identical in semantics and codegen to the explicit `stringview.from(owned)`; readers may prefer either spelling.

**Binding-driven verbs.** Two operations are polymorphic in their return type, materializing differently depending on the binding's declared type:

- **`s.slice(start, end)`** — see [§7.8](#78-indexing-and-slicing). Returns `stringview` when bound to `stringview`, `string` when bound to `string`. Unannotated bindings are a compile error.
- **`cstring.scan(c)`** — extracts a length from a `cstring` or `cstringview` (O(n) NUL scan) and produces a UTF-8 string of the corresponding bytes. Returns `stringview` when bound to `stringview`, `string` when bound to `string`. The scan also validates UTF-8 and is fallible.

**Forbidden conversions** — direct calls that would hide cost:
- `stringview.from(cstring)` — compile error; the source has no length, the conversion is O(n), use `cstring.scan(c)` instead so the cost is visible.
- `stringview.from(cstringview)` — same reasoning; use `cstring.scan(cv)`.
- `string.from(cstring)`, `string.from(cstringview)` — same; use `cstring.scan(c)` with a `: string` binding.

**`cstring` literal NUL check.** When a string literal binds directly to `cstring` (e.g., `const c: cstring = "hello"`), the compiler verifies at compile time that the literal contains no `\0` byte. A literal containing `\0` produces a compile error, not a runtime failure.

**No `as` casts between string types.** The `as` keyword is reserved for `as result` ([§22](#22-consuming-fallible-calls-as-result)). All type changes use `T.from(x)`, binding-driven verbs, or implicit owned→view coercion.

**Conversion matrix.**

| from \ to       | → `string`                | → `stringview`                | → `cstring`                       | → `cstringview`              |
|-----------------|---------------------------|--------------------------------|------------------------------------|------------------------------|
| `string`        | `clone s as result` (deep copy) | implicit, or `stringview.from(s)` | `cstring.from(s) as result`     | `cstringview.from(cstring.from(s) as result)` |
| `stringview`    | `string.from(v)`          | assignment (copy — `{ptr,len}`, copyable) | `cstring.from(v) as result`        | via `cstring.from` then borrow |
| `cstring`       | `cstring.scan(c)` w/ `:string`     | `cstring.scan(c)` w/ `:stringview`   | `clone c as result` (deep copy) | implicit, or `cstringview.from(c)` |
| `cstringview`   | `cstring.scan(cv)` w/ `:string`    | `cstring.scan(cv)` w/ `:stringview`  | `cstring.from(cv) as result` (validates UTF-8 not required, NUL not possible) | assignment (copy — copyable) |

**Reason.** `T.from(x) → T` is a single uniform rule that scales beyond strings: any future type with a static `from` constructor produces a value of its own type, never something else. The earlier alternative — putting the converter under the *source* type's namespace (`string.view(x)` returning `stringview`) — would have created a per-pair convention to memorize, and would propagate to every view-shaped type pair (`Array.slice`, `Map.entries`, etc.). One rule is cheaper to teach than N conventions.

The forbidden direct conversions (`stringview.from(cstring)`, etc.) trade brevity for cost visibility. A `cstring` carries no length; producing a `stringview` from one requires walking to the NUL, which is genuinely O(n). Forcing the spelling `cstring.scan(c)` puts a verb at the call site that reads as "this does work" — the same discipline applied elsewhere to ban hidden allocations and hidden copies.

Binding-driven return type on `cstring.scan` and `.slice` is an extension of the literal-fits-target rule already established for primitive numeric literals ([§3.11](#311-numeric-literals)) and string literals ([§4.2](#42-default-types-for-literals)): a value whose representation can serve multiple types lets the binding pick which one. The compile error on unannotated bindings is what keeps the rule readable — the value's type is always evident at the binding site, never inferred from a default.

Compile-time NUL checking of `cstring` literals catches at lex/parse time what would otherwise be a runtime `cstring.from` failure. The information is available; using it is free.

**Examples.**
```ts
// Owned construction — always allocates
const v: stringview = "hello";
const s: string = string.from(v);               // allocates, copies bytes

// View construction — zero cost (string source)
const owned: string = "hello";
const view1: stringview = owned;                // implicit
const view2: stringview = stringview.from(owned); // explicit, same semantics

// cstring scan with binding-driven return
const c: cstring = ...;
const sv: stringview = cstring.scan(c) as result;   // O(n) scan + UTF-8 validation
check result { return; }
const so: string = cstring.scan(c) as result;       // also O(n); allocates
check result { return; }

// cstring literal: compile-time NUL check
const ok: cstring  = "hello";                       // OK
const bad: cstring = "hel\0lo";                     // ERROR — embedded NUL

// Forbidden direct view conversions from cstring
const x: stringview = stringview.from(c);           // ERROR — use cstring.scan(c)

// No as casts between string types
const y = owned as stringview;                      // ERROR — as is for result only
```

**Conclusion.** `T.from(x) → T` is the universal constructor; implicit owned→view coercion provides the zero-cost shortcut; binding-driven verbs (`.slice`, `cstring.scan`) materialize per binding. Conversions from `cstring`/`cstringview` to UTF-8 types route through `cstring.scan` so the O(n) cost is visible. `as` is exclusively `as result`.

---

### 7.6 Ownership, Coercion, and the Operator Surface

**Proposal.** `string` and `cstring` are owned, heap-backed, and therefore **move-only**, following the universal ownership model in [§14](#14-ownership--move-semantics):

- **Plain assignment / by-value passing** of an owned string is a **compile error** (it owns a heap buffer; assignment cannot copy it).
- **`move x`** — transfer ownership; the original binding becomes invalid.
- **`clone x`** — deep copy: allocates a fresh buffer and copies the bytes. Because it allocates, it is **fallible** and consumed with `as result` ([§14.4](#144-the-clone-operator)). There is no `copy` operator.
- **`borrowed x`** (read-only) / **`mod borrowed x`** (mutable) — references (see [§12](#12-safe-borrows-borrowed-mod-borrowed)).
- **Implicit** — view-shaped coercion at a binding or call site (`string` → `stringview`, `cstring` → `cstringview`), which is the zero-cost borrow path.

`stringview` and `cstringview` are non-owning views and *are* copyable by plain assignment (they own nothing; lifetime tracking keeps them from outliving their source).

Passing an owned string to a function expecting a view is an implicit coercion. Passing an owned string to a function expecting another owned value requires an explicit `move`, or a value prepared with `clone`:

```ts
fn takeView(v: stringview): void { /* ... */ }
fn takeOwned(s: string): void { /* ... */ }

const s: string = "hello";

takeView(s);                                    // implicit borrow — OK
takeOwned(s);                                   // ERROR — string is move-only; assignment can't copy it
takeOwned(move s);                              // transfer; s now invalid

// to keep the original, clone first (fallible), then move the copy:
const dup = clone s as result;
check result { return; }
takeOwned(move dup);
```

Lifetime tracking for borrows (a `stringview` outliving the `string` it borrows from, a `cstringview` outliving the buffer it points into) is the province of [§14](#14-ownership--move-semantics); §7 inherits whatever rules §14 defines and does not specify them locally.

**Reason.** Keyword-prefix `move` makes ownership transfer visible at the start of the expression, where it is hard to skim past in review, and generalizes to every owned type. Deep copy is the one operation that genuinely differs from a transfer — it allocates — so it is the explicit, fallible `clone` operator consumed with `as result`, symmetric with `move`. This matches the universal model in [§14](#14-ownership--move-semantics): assignment copies copyable values, `move` transfers, `clone` deep-copies; there is no `copy` operator.

Implicit owned→view coercion is the one ergonomic shortcut. Without it, every function taking a `stringview` would force callers to write `stringview.from(s)` or `s.view()` at every call site, which is noise — the conversion is zero-cost and unambiguous. Keeping the explicit form available preserves the option to spell it out when clarity wins.

**Examples.**
```ts
const s: string = "hello";

// View coercion at bindings
const v1: stringview = s;                       // implicit
const v2: stringview = stringview.from(s);      // explicit, same semantics

// View coercion at call sites
log(s);                                         // log(s: stringview), implicit borrow
write(move s);                                  // write(s: string), explicit transfer
// `s` is now invalid; further use is a compile error
```

**Conclusion.** Owned strings are move-only: `move x` transfers and `clone x` (fallible) deep-copies; there is no `copy` operator and assignment cannot copy an owned string. Views are copyable. View coercion is implicit. Lifetime rules live in [§14](#14-ownership--move-semantics).

---

### 7.7 Immutability and `StringBuilder`

**Proposal.** `string` and `cstring` are **immutable** once constructed. Their bytes never change after construction, and no method on either type mutates `self`. No in-place `.append()`, `.insert()`, `.remove()`, or similar.

Incremental construction of text uses **`StringBuilder`** (defined in [§37](#37-standard-collections)). The shape is:

```ts
let b = new StringBuilder();
b.append("hello");                              // accepts stringview
b.append(", ");
b.append(name);                                 // any stringview-coercible value
const s: string = b.finalize();                 // produces immutable string
```

`StringBuilder` owns a growable byte buffer; `finalize()` produces a `string` (either by transferring the buffer or by copying — implementation detail covered in [§37](#37-standard-collections)) and consumes the builder.

`stringview` and `cstringview` are non-owning views; they cannot be mutated independently of their backing storage.

**Reason.** An immutable `string` makes every operation on it cheap to reason about: a `stringview` borrowing from a `string` cannot have the underlying bytes mutated under it, so the view stays valid as long as the lifetime allows. Mutability would force either reference-counted snapshots, copy-on-write machinery, or runtime aliasing checks — all of which are larger than the cost of building text through `StringBuilder`.

Concentrating mutation in `StringBuilder` rather than spreading it across `string` methods also clarifies the cost model: `b.append(...)` may resize and reallocate the buffer; `s.something(...)` never does. Readers can see which expressions involve buffer growth.

**Examples.**
```ts
const greeting: string = "hello";
greeting.append(", world");                     // ERROR — string has no .append

// Idiomatic incremental construction
let b = new StringBuilder();
b.append("user=");
b.append(name);                                 // implicit stringview coercion
b.append(", id=");
b.append(`${userId}`);                          // template result is string, coerces to view
const log: string = b.finalize();

// For static-shape concatenation, prefer templates
const path: string = `${dir}/${file}`;
```

**Conclusion.** `string` and `cstring` are immutable. All mutation flows through `StringBuilder` ([§37](#37-standard-collections)), which finalizes to an immutable `string`.

---

### 7.8 Indexing and Slicing

**Proposal.** **No integer indexing** on any string family type. The expressions `s[0]`, `s[i]`, `s[i..j]` are compile errors. Access to substring content is exclusively via iteration ([§7.9](#79-iteration)), slicing, and search.

**`s.slice(start: ByteOffset, end: ByteOffset)`** is the substring operation. It is defined on `string` and `stringview` (and via `cstring.scan` for the C variants). Both arguments are of type `ByteOffset` — a newtype over `uint64` introduced in §7.

Slicing semantics:
- The half-open range `[start, end)` is taken.
- Return type is **binding-driven**: `stringview` when bound to `stringview`, `string` when bound to `string`. Unannotated bindings are a compile error.
- A single-argument form `s.slice(start)` is sugar for `s.slice(start, s.end)`.
- `s.start` and `s.end` are properties returning `ByteOffset` (the bounds of the string).
- Slicing on a non-codepoint boundary is a runtime trap. `ByteOffset` values come only from search results, iteration positions, or `s.start` / `s.end` — sources that are themselves on codepoint boundaries by construction.

```ts
const s: stringview = "hello, world";
const comma = s.find(",") as result;
check result { return; }
const head: stringview = s.slice(s.start, comma);
const tail: string     = s.slice(comma);
```

**`ByteOffset`** is a newtype that cannot be constructed from a bare integer literal. The only ways to obtain a `ByteOffset` are:
- `s.start`, `s.end` properties on a `string` / `stringview`.
- The success value of `s.find(...)`, `s.findLast(...)`, `s.indexOf(...)`.
- Positions produced by iteration adapters (specified in stdlib detail, not §7).

This is what makes "always on codepoint boundaries" enforceable: no arithmetic on raw integers can produce a `ByteOffset` from outside the closed set of safe sources.

**Reason.** Integer subscripting on a UTF-8 string is the single most common source of "I split a multi-byte character in half" bugs in languages that allow it. Rejecting it at compile time and routing all positional access through a type that's structurally restricted to codepoint boundaries eliminates the class of bug — without giving up O(1) substring operations the way "always decode to char position" would.

Binding-driven return type on `.slice()` follows the same rule established for literals and `cstring.scan`: the value's representation can serve both `string` and `stringview`, and the binding picks. Forcing annotation when ambiguous keeps the cost (allocation vs borrow) visible at the call site.

**Examples.**
```ts
const s: stringview = "héllo, world";

// Forbidden
const c = s[0];                                 // ERROR — no integer indexing
const sub = s[0..5];                            // ERROR

// Slicing with ByteOffset
const comma = s.find(",") as result;
check result { return; }

const head: stringview = s.slice(s.start, comma);
const rest: string     = s.slice(comma);        // allocates owned tail

// Unannotated slice is a compile error
const ambiguous = s.slice(s.start, comma);      // ERROR — must annotate

// ByteOffset cannot be constructed from integers
const bad: ByteOffset = 3;                      // ERROR — not constructible from int
```

**Conclusion.** No integer indexing. Substring access is via `s.slice(ByteOffset, ByteOffset)`. `ByteOffset` is a newtype constructible only from safe sources (string bounds, search results, iteration positions). Slice return is binding-driven.

---

### 7.9 Iteration

**Proposal.** There is no default iteration on any string family type. The expression `for (const x of s) { ... }` is a compile error when `s` is `string` / `stringview` / `cstring` / `cstringview`. The reader must explicitly choose an iteration axis.

Two explicit iterator methods on `string` and `stringview`:

- **`s.chars()`** — yields successive Unicode scalar values as `char`. Decoding is infallible because the source is valid UTF-8 by construction ([§7.2](#72-the-utf-8-invariant)).
- **`s.bytes()`** — yields successive bytes as `uint8`. Raw byte iteration; ignores UTF-8 structure.

There is no offset+char combined iteration adapter in §7. Callers who need byte offsets during iteration must track them manually or use search APIs returning `ByteOffset`.

`cstring` and `cstringview` do not expose direct `.chars()` / `.bytes()` iteration; they are FFI boundary types. To iterate, convert via `cstring.scan(c)` to a `stringview` first.

**Reason.** Default iteration on a string in other languages is a frequent source of confusion (codepoints? code units? bytes? graphemes?). Forcing the explicit form makes the choice visible at every loop and keeps the loop's body honest about what `c` is.

Omitting an `.indexed()` adapter from §7 is a minimality decision: in the common case, callers either need codepoints (use `.chars()`) or need a search result (use `.find` returning `ByteOffset`). The cases where both are needed simultaneously are rare enough to defer; the stdlib may add an adapter later without changing the language layer.

**Examples.**
```ts
const s: stringview = "héllo";

for (const c of s) { /* ... */ }                // ERROR — must choose axis

for (const c of s.chars()) {                    // c: char
    // ...
}

for (const b of s.bytes()) {                    // b: uint8
    // ...
}
```

**Conclusion.** No default iteration. `s.chars()` yields `char`; `s.bytes()` yields `uint8`. No combined offset-iterator in §7. `cstring` / `cstringview` route through `cstring.scan` before iterating.

---

### 7.10 Length, Equality, and Comparison

**Proposal.** **No `.length` property** on any string family type. Two explicit properties replace it:

- **`s.byteLength: uint64`** — O(1). The number of bytes in the UTF-8 encoding (for `string` / `stringview`) or in the bytes up to but not including the terminating NUL (for `cstring` / `cstringview`, requiring an O(n) scan on the C variants — see below).
- **`s.charCount: uint64`** — O(n). The number of Unicode scalar values. Always a scan; never cached.

On `cstring` / `cstringview`, **`.byteLength` is O(n)** because the length is not stored — the type carries only `{ptr}`. Use `cstring.scan(c)` with a `: stringview` binding once and reuse the resulting `stringview.byteLength` if multiple length queries are needed.

**No comparison operators on string family types.** The expressions `s == other`, `s != other`, `s < other`, `s > other`, `s <= other`, `s >= other` are **compile errors**. The same applies to mixed-type comparisons (`s == "literal"`, etc.).

All comparison is method-based. The §7 core surface:

```ts
s.equals(other): bool                           // byte-equal
s.compare(other): Ordering                      // byte / codepoint order
s.contains(other): bool
s.startsWith(other): bool
s.endsWith(other): bool
```

`Ordering` is a tagged union with cases `.less`, `.equal`, `.greater` (full definition in [§29](#29-tagged-unions--exhaustiveness)).

**Equality is byte-equal**: two strings are equal iff their UTF-8 byte sequences are byte-for-byte identical. Strings that look identical but use different Unicode normalization forms are **not** equal under `s.equals(other)` — `"café"` (NFC, one codepoint) and `"cafe\u{0301}"` (NFD, two codepoints) compare unequal. Canonical equality lives in stdlib `unicode`.

**Ordering is codepoint order** (which, for valid UTF-8, is identical to lexicographic byte order). Locale-aware comparison lives in stdlib.

Unicode-aware variants — `equalsNormalized`, `equalsIgnoreCase`, `compareNormalized`, `compareIgnoreCase` — are stdlib (`unicode` module), not §7. The reason is that they require Unicode normalization and case-fold tables, which are kilobytes of static data the language core should not link unconditionally.

**Hashing.** Deferred; the hash algorithm and hash-result type are specified in a later pass alongside the `Map<K, V>` design.

**Reason.** Removing `.length` eliminates a class of bug present in nearly every language with a string type: the programmer assumes the count is bytes (or chars, or code units, or graphemes), the language returns a different one, and the off-by-one shows up only on multi-byte input. Forcing two property names with explicit cost signals (`charCount` reads as "count chars," `byteLength` as "byte length") removes the ambiguity.

Removing comparison operators is a stronger version of the same discipline. `==` on strings in other languages variously means byte-equality, interned-pointer-equality, locale-equality, or normalized-equality depending on language and version. Forcing the spelling `s.equals(other)` ensures the reader sees the choice; if a future API adds `equalsNormalized`, the existing `equals` callers continue to mean byte-equal.

Byte equality at the language layer is the only equality the language can guarantee without linking Unicode tables. Anything richer is opt-in.

**Examples.**
```ts
const s: string = "café";                       // 5 bytes, 4 scalar values
const b: uint64 = s.byteLength;                 // 5  (O(1))
const c: uint64 = s.charCount;                  // 4  (O(n) scan)

const eq = s.equals("café");                    // true (same bytes)
const ne = s.equals("cafe\u{0301}");            // false (different bytes; same display)

// Operators are forbidden
const bad1 = s == "café";                       // ERROR
const bad2 = s < other;                         // ERROR

// Ordering
const ord = s.compare(other);
switch (ord) {
    case Ordering.Less:    { /* ... */ }
    case Ordering.Equal:   { /* ... */ }
    case Ordering.Greater: { /* ... */ }
}

// Predicates
const has   = s.contains("é");
const head  = s.startsWith("ca");
const tail  = s.endsWith("é");
```

**Conclusion.** No `.length`; explicit `.byteLength` and `.charCount`. No comparison operators on strings; all comparison through methods. Byte equality and codepoint ordering at the language layer; Unicode-aware variants in stdlib.

---

### 7.11 Concatenation

**Proposal.** **No `+` operator on strings** (consistent with [§3.13](#313-operators)). **No `.concat()` method** on any string family type. **No `string.concat(a, b, ...)` static method.**

Static-shape concatenation (a fixed number of pieces, known at the call site) is expressed through **template literals**:

```ts
const c: string = `${a}${b}`;                   // 2-piece concat
const path: string = `${dir}/${file}.${ext}`;   // mixed interpolation
```

Templates always allocate ([§7.3](#73-literal-forms-and-storage-model)); the compiler may size the destination buffer once given the operand byteLengths.

Dynamic-shape concatenation (unknown number of pieces, loop-driven) uses **`StringBuilder`** ([§7.7](#77-immutability-and-stringbuilder), [§37](#37-standard-collections)):

```ts
let b = new StringBuilder();
for (const piece of pieces) {
    b.append(piece);
}
const joined: string = b.finalize();
```

**Reason.** A `+` operator on strings is the operator most often abused for performance-pathological concatenation loops (`s = s + piece` in a loop, each iteration reallocating). Templates make single-shot concat obvious and one-allocation by construction; `StringBuilder` makes the dynamic case explicit. No `+` means no accidental quadratic loop.

A `.concat(other)` method on `string` would have to either mutate (impossible — `string` is immutable, [§7.7](#77-immutability-and-stringbuilder)) or return a new owned string (which is exactly what `` `${self}${other}` `` already does, more clearly). Neither earns its place.

A `string.concat(a, b, c, ...)` static method would be a third spelling for what templates already do.

**Examples.**
```ts
const greeting: string = "hello";
const name:     stringview = "world";

// Static concat — template
const msg: string = `${greeting}, ${name}`;

// Dynamic concat — StringBuilder
let b = new StringBuilder();
for (const w of words) {
    b.append(w);
    b.append(" ");
}
const sentence: string = b.finalize();

// Forbidden
const bad1 = greeting + name;                   // ERROR — no + on strings
const bad2 = greeting.concat(name);             // ERROR — no .concat method
```

**Conclusion.** Templates for static-shape concat; `StringBuilder` for dynamic. No `+`, no `.concat`.

---

### 7.12 Error Handling Without Nullable Types

**Proposal.** Delta has **no nullable types**. Every "maybe absent" string-family operation returns through the [§19](#19-fallible-function-signatures)–[§23](#23-the-check-block) error channel via `T | ErrorType` and is consumed with `as result` + `check`.

The string family operations that are fallible:

- **`cstring.from(x: stringview)`** — fails on embedded NUL. Returns `cstring | CStringError`.
- **`cstring.scan(c)`** — fails on invalid UTF-8 in the scanned bytes. Return type binding-driven (`stringview | ScanError` or `string | ScanError`).
- **`s.find(needle)`, `s.findLast(needle)`, `s.indexOf(c: char)`** — fail when the needle is not present. Return `ByteOffset | NotFoundError` (exact error-type sharing details deferred to API pass).
- **`stringview.from(c: cstring)` and the rest of the cstring → UTF-8 view conversions** — not provided directly; route through `cstring.scan` (see [§7.5](#75-construction-and-conversion)).

All error types satisfy the [§20](#20-error-type-shape) minimum shape (`code: stringview`, `message: stringview`). Specific additional fields per error type are an API-pass concern.

**Usage pattern** (per [§22](#22-consuming-fallible-calls-as-result), [§23](#23-the-check-block)):

```ts
const offset = s.find("world") as result;
check result {
    console.writeLine(result.error.message);
    return;
}
// offset is valid here; type is ByteOffset
const tail: stringview = s.slice(offset, s.end);
```

There is no `string?` type. Functions returning "perhaps no value" return `string | SomeError` (or `void | SomeError` for side-effecting calls, per [§25](#25-void--errortype-returns)).

**Reason.** A nullable type combined with a result-based error channel doubles the absence-modeling axes: callers must check both "is this null?" and "did the call fail?" for every operation, with subtly different rules for each. Removing nullables collapses both axes into one — every absence is an error, with a typed reason and a `check` block.

The pattern matches what §19–22 already establish for the rest of the language; §7 inherits it without locally redefining anything.

**Examples.**
```ts
const s: stringview = "hello, world";

// Search: ByteOffset | NotFoundError
const r = s.find("world") as result;
check r {
    return;
}
const offset: ByteOffset = r;
const part: stringview = s.slice(offset, s.end);

// cstring construction: cstring | CStringError
const cstr = cstring.from(s) as result;
check result {
    // result.error.message describes the embedded-NUL position
    return;
}

// No string? — function returning "maybe a name"
fn findName(): string | NotFoundError;          // not  string?
```

**Conclusion.** No nullable types. All absence is modeled through the [§19](#19-fallible-function-signatures)–[§23](#23-the-check-block) error channel. The string family's fallible operations are `cstring.from`, `cstring.scan`, and the search methods.

---

### 7.13 Non-Goals

**Proposal.** The following are explicitly **out of scope** for §7. Each is enumerated so readers do not bring expectations from other languages:

1. **Mutable strings.** `string` and `cstring` are immutable. All text mutation flows through `StringBuilder` ([§7.7](#77-immutability-and-stringbuilder), [§37](#37-standard-collections)). There is no `s.append(...)`, `s.insert(...)`, `s.remove(...)`, `s.setChar(...)`.

2. **Locale-aware comparison.** `s.equals`, `s.compare` are byte / codepoint operations only. Locale-aware comparison lives in stdlib (`std/unicode` or `std/locale`).

3. **Regex.** No regular-expression support in §7. A separate stdlib module owns regex.

4. **Grapheme clusters.** `char` is a Unicode scalar value, not a user-perceived character. Grapheme iteration (`"👨‍👩‍👧"` is one grapheme but four scalar values) is a stdlib `unicode` concern.

5. **Small-string optimization (SSO) guarantees.** Whether short `string` values are stored inline in the value rather than on the heap is an implementation detail. The spec makes no guarantee either way; programs must not depend on it.

6. **Other encodings.** `string` and `stringview` are UTF-8 only. UTF-16, UTF-32, Latin-1, Windows-1252, and other encodings are not supported as types. Conversion to and from them is stdlib (`std/encoding`).

7. **String interning / canonicalization.** Two equal strings are not guaranteed to share storage. There is no `intern(s)` operation, no `===` pointer-identity comparison.

8. **Integer indexing.** `s[i]`, `s[i..j]` are compile errors (see [§7.8](#78-indexing-and-slicing)). Substring access is via `.slice(ByteOffset, ByteOffset)`.

9. **The `+` operator for concatenation.** Forbidden by [§3.13](#313-operators) and confirmed here. Concatenation is via templates or `StringBuilder` ([§7.11](#711-concatenation)).

**Reason.** Each non-goal corresponds to a real expectation a reader from another language might bring. Listing them explicitly is cheaper than re-deriving them per-question from the rest of §7.

**Conclusion.** None of the items above is provided by §7. Several have stdlib or future-spec homes; some (1, 7, 8, 9) are permanent prohibitions.

---

### 7.14 Knock-on Edits

This section flags edits that other sections of the spec require as a consequence of §7's design. They are tracked here rather than applied inline so the rest of the document can be updated in a coordinated pass.

- **§20** (Error Type Shape) currently uses `StringView` (PascalCase) in its examples and interface definitions. Rename to lowercase `stringview` for consistency with the lowercase atom-type convention established in §6 and confirmed here.
- **§22** (Consuming Fallible Calls) currently mentions `as` is reused for "type assertions." Per §7, `as` is reserved exclusively for `as result`. The §22 wording must be updated to remove the type-assertion reference, and any examples elsewhere using `expr as Type` must be revised to use `T.from(x)`, binding-driven verbs, or implicit coercion as appropriate.
- **§18** (Null Safety & Nullable Types) is now substantially out of scope: Delta has no nullable types. §18 should be rewritten to specify that absence is modeled exclusively through the §19–22 error channel and `T | ErrorType` returns, with no `T?` syntax.
- **§3.12** (String Literals) currently anticipates `StringView` as the default literal type. Update to lowercase `stringview` and remove any reference to triple-quoted literals; the literal forms are `"..."`, `'a'`, and `` `...` ``.
- **§4.2** (Default Types for Literals) — confirm the default literal type is lowercase `stringview` and that backtick literals are always `string`.
- **§14** (Ownership & Move Semantics) — the universal model is: plain assignment copies copyable values, `move x` transfers ownership, and `clone x` (fallible) deep-copies owned types. There is **no `copy` operator**. Owned strings are move-only and cloneable; `clone x` is their deep-copy operator.
- **§35** (Allocation Model) — decide whether `string` and `cstring` carry their allocator in the type (`string<A>`) or in the value. §7 examples assume the value-carrying form but do not commit; resolve in §35.
- **§37** (Standard Collections) — name and specify `StringBuilder` (incremental construction → `string`) and `Buffer` (arbitrary-byte container) as referenced from §7.
- **§40** (C Interoperability) and **§41** (FFI-Safe Types) — confirm `cstring` and `cstringview` are the only FFI-safe string types; `string` and `stringview` are not directly FFI-safe (they carry a length, not a NUL).
- Throughout: any remaining PascalCase use of `String`, `StringView`, `CString` outside generic-type contexts must be lowercased.

---
