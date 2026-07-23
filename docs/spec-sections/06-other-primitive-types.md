## 6. Other Primitive Types (bool, char, void)

Section 6 covers Delta's non-numeric primitive surface: the boolean type, the Unicode scalar character type, and the return-position-only `void` marker. It also pins down what becomes of the previously-proposed `never` type — dropped from MVP, with the exit-path-termination role it would have served rehomed onto a closed list of statement-level intrinsics — and the keyword classification of the primitive type names introduced across §§4–6. The recurring principles are **types carry invariants, not just bit patterns** (every `char` is a valid Unicode scalar value; every `bool` is one of two states) and **non-numeric primitives stay non-numeric** (no implicit conversion to or from integers in either direction, no arithmetic, no ordering where there is no natural order). Each sub-feature below follows the Proposal / Reason / Examples / Conclusion structure.

---

### 6.1 Type Set

**Proposal.** Section 6 introduces three non-numeric primitive types:

- **`bool`** — single byte, two states (`true` and `false`).
- **`char`** — 32-bit Unicode scalar value, surrogates excluded by construction.
- **`void`** — return-position-only marker indicating "no useful value." Not a first-class type.

The previously-proposed `never` type is **not part of MVP**. The control-flow termination role `never` would have served — making `panic`, `process.exit`, and `unreachable` recognizable as terminators in [§23](#23-the-check-block)'s `check`-block exit analysis — is filled instead by a closed list of statement-level intrinsics. See [§6.9](#69-exit-path-terminators).

**Reason.** Each inclusion earns its place:

- **`bool` is universal** — every typed language has it, and removing it pushes its job onto integers, which §5 has already separated from logical values.
- **`char` as a scalar value, not a byte or UTF-16 code unit,** matches [§1.7](#17-encoding-line-endings-and-case-sensitivity)'s commitment to Unicode-aware source handling. A byte-typed `char` would force "is this byte a complete code unit?" into every text-handling API; a UTF-16 code unit would re-introduce the JavaScript surrogate-pair trap.
- **`void` distinguishes "returns nothing" from "no return type."** Without it, the type system would have to either require every function to return a value (cumbersome) or invent a unit value (un-Delta — see [§3.10](#310-statement-and-expression-distinction)'s rejection of expression-shaped blocks).

The exclusion of `never` rests on a different argument: every place where the spec previously needed it is served as well by a hardcoded terminator list. The mechanism — non-catchable panic, optional pre-abort hook, optimizer-never-assumes-unreachable — is already specified in [§5.15](#515-the-panic-mechanism); promoting `panic`, `process.exit`, and `unreachable` to statement-level intrinsics rather than `never`-returning functions removes one primitive type from the language without removing any expressive power that MVP requires.

Custom diverging functions — a user-defined `fatal(code, msg)` that always panics — are not expressible in MVP. Authors who want one inline the panic at every call site, or call the diverging helper followed by `unreachable();`. A `noreturn` keyword to recover the user-extensibility is post-MVP territory and intentionally not added now.

**Examples.**
```ts
const flag: bool = true;
const c: char = 'δ';

function log(msg: StringView): void { /* ... */ }

// `panic`, `process.exit`, `unreachable` are statement-level intrinsics — not
// functions, not typed by `never`. See §6.9.
panic("invariant violated");
process.exit(1);
unreachable();
```

**Conclusion.** `bool`, `char`, `void`. `never` is dropped from MVP; the role it served is rehomed onto a hardcoded terminator list (see [§6.9](#69-exit-path-terminators)).

---

### 6.2 `char` — Representation, Literals, and Escapes

**Proposal.** `char` is a 32-bit value holding a Unicode scalar value: any codepoint in `0x0000..=0xD7FF` or `0xE000..=0x10FFFF`. Surrogate codepoints (`0xD800..=0xDFFF`) are excluded by construction; no operation in the language can produce a `char` holding a surrogate value.

The literal form is single-quoted, containing exactly one Unicode scalar value:

```ts
const letter: char = 'A';
const greek:  char = 'δ';
const emoji:  char = '😀';
const nul:    char = '\0';
```

Supported escapes inside `'...'`:

- `\n`, `\t`, `\r`, `\\`, `\'`, `\0` — standard one-character escapes.
- `\xHH` — one-byte hex escape, **restricted to `0x00..=0x7F`** (ASCII range). Bytes above `0x7F` are not standalone scalar values, so `\x80` and above are syntax errors inside a `char` literal; use `\u{...}` instead.
- `\u{H...H}` — Unicode codepoint, 1–6 hex digits, braces required. The codepoint must be a valid scalar value: surrogates (`0xD800..=0xDFFF`) and values above `0x10FFFF` are syntax errors.

The escape `\"` is not recognized inside `'...'` because the delimiter is `'`, not `"` — symmetric with [§3.12](#312-string-literals)'s "delimiter you used dictates which closing-quote escape is meaningful."

A `char` literal must contain exactly one scalar value:

- `''` is a syntax error (empty literal).
- `'ab'` is a syntax error (two scalars).
- `'a\u{0301}'` (the sequence `a` + combining acute) is a syntax error: visually one grapheme, but two scalar values.
- `'\u{1F600}'` is valid: one scalar value, displayed as 😀.

**Reason.** A scalar-value-typed `char` makes the invariant load-bearing for every operation that produces a `char`. Codepoint validity is checked at construction sites — literal parsing, the `char(uint32)` conversion ([§6.3](#63-char--conversions-and-literal-fits-rules)) — and is then maintained by the type system, so consumers (iteration, comparison, FFI ingress) never need to re-validate.

Restricting `\xHH` to ASCII preserves that invariant at the lexer layer. A single byte above `0x7F` is not a complete UTF-8 sequence and not a valid scalar value; allowing it inside `'...'` would require a runtime check on what is otherwise a compile-time-known literal. The `\u{...}` form is one character longer and covers every non-ASCII codepoint unambiguously.

Rejecting multi-scalar literals (the `'a\u{0301}'` case) sidesteps the grapheme-cluster trap. A "user-perceived character" can be many scalar values joined by zero-width joiners; treating any such sequence as a single `char` would lie about the type's content. Grapheme iteration is a [§7](#7-string-family-types) / `std/unicode` concern, expressed as an iterator over a `StringView`, not as a primitive.

**Examples.**
```ts
const a: char = 'A';                  // U+0041, valid
const d: char = 'δ';                  // U+03B4, valid
const e: char = '😀';                 // U+1F600, valid
const n: char = '\0';                 // U+0000, valid (NUL is a legal char,
                                      //   unlike CString which forbids embedded NUL)

const x: char = '\x41';               // 'A' — ASCII hex escape, valid
const y: char = '\u{1F600}';          // emoji via braced escape, valid

const bad1: char = '';                // ERROR — empty char literal
const bad2: char = 'ab';              // ERROR — multiple scalar values
const bad3: char = '\x80';            // ERROR — \xHH limited to ASCII; use \u{}
const bad4: char = '\u{D800}';        // ERROR — surrogate codepoint
const bad5: char = '\u{110000}';      // ERROR — above 0x10FFFF
const bad6: char = 'a\u{0301}';       // ERROR — two scalar values (one grapheme)
```

**Conclusion.** `char` is a 32-bit Unicode scalar value with surrogates excluded by construction. Single-quoted literals, exactly one scalar each, ASCII-restricted `\xHH`, scalar-validated `\u{...}`. Graphemes are not a primitive concept.

---

### 6.3 `char` — Conversions and Literal-Fits Rules

**Proposal.** Conversions between `char` and integer types follow [§3.8](#38-type-conversions-and-the-as-keyword)'s call-style cast rule. The directions are asymmetric:

- **`char` → `uint32`** via `uint32(c)`. Always succeeds; the result is the underlying scalar value. Free at runtime — a no-op at the bit level.
- **`uint32` → `char`** via `char(n)`. **Fallible**: traps if `n` is a surrogate (`0xD800..=0xDFFF`) or above `0x10FFFF`. Recoverable via `char(n) as result` per [§5.5](#55-recoverable-failures-via-as-result), producing `char | CastError`.

No other integer type converts to or from `char` directly. To go through:

- `uint8(c)` — write `uint8(uint32(c))`. The outer narrowing cast traps per [§5.3](#53-the-complete-trap-set) row 6 if the scalar value is outside `0x00..=0xFF`.
- `int32(c)` — write `int32(uint32(c))`. The outer sign-flip cast traps per [§5.3](#53-the-complete-trap-set) row 7 if the scalar value is above `INT32_MAX` (impossible for a valid scalar value, but the cast still goes through the standard rule rather than being special-cased).
- `char` from any non-`uint32` integer — narrow or widen to `uint32` first, then call `char(...)`.

The [§3.11](#311-numeric-literals) **literal-fits-target rule does not extend to `char`**:

- `const c: char = 65;` is a compile error. `65` is an integer literal; `char` is non-numeric; the literal-fits rule covers only numeric types.
- `const n: uint32 = 'A';` is also a compile error. `'A'` is a char literal; conversion to `uint32` is explicit only.

The canonical way to build a `char` with a known scalar value is the char literal: `'A'`, `'\u{03B4}'`. The `char(uint32)` cast is for values computed at runtime.

**Reason.** Two-direction explicit conversion preserves the [§6.2](#62-char--representation-literals-and-escapes) invariant: every `char` is a valid scalar value, because the only ingress points (literal parsing, `char(n)` with surrogate/range trap) enforce the rule.

Routing every other integer type through `uint32` keeps the conversion matrix small and predictable. The alternative — direct `char(int8)`, `char(int16)`, `char(uint64)`, ... — would add eight cast pairs whose semantics are derivable from the two-step composition and which add no new capability. One canonical path per conversion is the same discipline §5 applies to numeric narrowing and sign-flipping.

The literal-fits prohibition is symmetric with [§5.13](#513-conversions-to-and-from-bool)'s bool↔int ban: `char` is a non-numeric primitive carrying a typed invariant, and silently letting an integer literal "become a char" would re-introduce the C confusion where char is secretly a 21-bit unsigned integer with a costume. Writing `'A'` is one character shorter than `char(65)` *and* surfaces the intent (a letter, not a magic number). The integer-literal path earns nothing.

**Examples.**
```ts
const c: char = 'A';

// char → uint32: free, total
const n: uint32 = uint32(c);                  // 65

// uint32 → char: fallible
const ok: char = char(0x03B4 as uint32) as result;
check result { return 1; }
// `ok` is δ

const bad: char = char(0xD800 as uint32) as result;
check result {
  // surrogate codepoint — recoverable here
  return error as CastError { code: "char.surrogate", message: "...", value: 0xD800 };
}

// through uint32 for other integer types
const big: int64 = 65;
const ch: char = char(uint32(big)) as result;
check result { return 1; }

// extracting an ASCII byte
const ascii: uint8 = uint8(uint32(c));        // traps if c > U+00FF; here OK

// disallowed implicit conversions
const c2: char   = 65;                        // ERROR — no literal-fits for char
const n2: uint32 = 'A';                       // ERROR — no implicit char → uint32
const c3: char   = uint32(65);                // ERROR — no implicit uint32 → char
```

**Conclusion.** `uint32(c)` is free and total; `char(n)` is fallible via [§5.5](#55-recoverable-failures-via-as-result). All other integer ↔ `char` conversions route through `uint32`. The literal-fits-target rule does not extend to `char`.

---

### 6.4 `char` — Operators, Comparison, and Methods

**Proposal.** The operator surface on `char` is deliberately tight:

- **Equality:** `==`, `!=` — compare by scalar value.
- **Ordering:** `<`, `>`, `<=`, `>=` — compare by scalar value (codepoint order). Same-type rule from [§3.13](#313-operators) applies; `'A' < 65` is a compile error.
- **Arithmetic:** none. `'a' + 1`, `'b' - 'a'`, `c * 2`, etc. are compile errors. To do codepoint arithmetic, convert: `char(uint32('a') + 1) as result`.
- **Bitwise:** none.
- **Logical:** none (those are `bool`-only per [§3.13](#313-operators)).

`char` has **no methods.** No `.isAscii()`, `.isDigit()`, `.isLetter()`, `.toLower()`, `.toUpper()`, `.toString()`. Character classification and case conversion live in `std/unicode` as free functions: `unicode.isAscii(c)`, `unicode.isDigit(c)`, `unicode.lowercase(c)`, etc.

Equality and ordering are by raw scalar value — no locale-aware comparison, no case-insensitive equality, no Unicode collation. Locale-aware comparison is a `std/locale` concern with allocator dependencies and Unicode-version sensitivity; the `<` operator does not silently invoke it.

**Reason.** Banning `char` arithmetic is symmetric with [§5.13](#513-conversions-to-and-from-bool)'s bool↔int ban: `char` is a non-numeric primitive, and arithmetic on it would erode the "every `char` is a valid scalar value" invariant. `'a' + 1` would have to either trap on every operation (because the result might be a surrogate or above-range) or silently produce an invalid char. Routing arithmetic through `uint32` makes the codepoint-math nature of the operation visible at every site, and the conversion back via `char(...)` re-validates.

Codepoint ordering is the only ordering Delta can guarantee at the language level. Locale-aware ordering is version-dependent, allocator-dependent, and culturally specific; it does not belong at the operator. Languages that bake locale into `<` inherit cross-platform, cross-version comparison instability.

The no-methods stance matches the [§5.8](#58-float-semantics-ieee-754) float-predicates argument inverted: floats got `.isNaN()` / `.isFinite()` / `.isInf()` because no operator can express NaN-testing, and the predicate is fundamental to IEEE arithmetic. `char` classification has the opposite shape: many predicates (`isDigit`, `isLetter`, ...), all derivable from std-shipped Unicode tables, none fundamental to the language semantics. Free functions in `std/unicode` let the Unicode database evolve independently of the language.

**Examples.**
```ts
const a: char = 'A';
const b: char = 'B';

const sameLetter = (a == b);                  // false
const inOrder    = (a < b);                   // true (65 < 66)
const ordering   = a <= b && b <= 'Z';        // true

// arithmetic disallowed
const next = a + 1;                           // ERROR — no char arithmetic
const diff = b - a;                           // ERROR

// idiomatic codepoint arithmetic
const nextChar = char(uint32(a) + 1) as result;
check result { return error as CastError { code: "...", message: "..." }; }
// `nextChar` is 'B'

// classification via std/unicode
import { unicode } from "std";
if (unicode.isDigit(c)) { /* ... */ }
if (unicode.isAscii(c)) { /* ... */ }

const lower = unicode.lowercase(c);           // returns char

// no locale-aware comparison
const aLow: char = 'a';
const aCap: char = 'A';
const eq = (aLow == aCap);                    // false — value comparison only
```

**Conclusion.** Equality and codepoint ordering. No arithmetic, no bitwise, no methods. Classification and case conversion in `std/unicode`.

---

### 6.5 `char` — FFI Boundary

**Proposal.** `char` is **not** in [§41](#41-ffi-safe-types)'s FFI-safe set. A `char` in any `extern "c"` parameter or return position is a compile error. To cross the boundary, convert to `uint32` (outgoing) or call `char(...) as result` on the ingress side.

Specifically:

- **C `char`** (one byte, possibly signed) binds in Delta as **`uint8`** (or `int8` when signedness matters). It does **not** bind as Delta `char`. The names happen to collide; the semantics and widths do not.
- **C `char32_t`** (four bytes, scalar value with no surrogate-exclusion invariant) binds in Delta as **`uint32`**. It does not bind as Delta `char` even though the representation is byte-identical, because the surrogate-exclusion invariant of Delta `char` is not a C-side guarantee — values arriving from C must be re-validated via `char(value) as result`.
- **C `wchar_t`** is platform-dependent (16-bit on Windows, 32-bit on most Unix-likes) and binds in Delta as `uint16` or `uint32` on a per-platform basis. Delta `char` never crosses this slot directly.
- **C `wint_t`** binds as the appropriate integer type per platform.

The FFI wrapper specified by [§40](#40-c-interoperability) / [§41](#41-ffi-safe-types) is the audit boundary: it converts at the boundary so application code only sees `char`. MVP has no trusted Delta-source block with raw-pointer privileges ([§13.2](#132-no-raw-pointers-in-delta-source)).

**Reason.** Two failure modes drive the ban:

- **Invariant leakage.** Delta `char` carries "valid Unicode scalar value, surrogates excluded." No C type carries this. Letting `char` cross the boundary directly would let invalid bit patterns enter safe Delta code without a runtime check, breaking the construction-time invariant.
- **Name-collision ABI mismatch.** Without the ban, a binding author writing `extern "c" { function get_ascii_lower(c: char): char; }` would ship code that passes a 4-byte Delta scalar value to a C function expecting a 1-byte `char`. Silent ABI corruption on every call. The ban forces the author to confront the size and semantics at declaration time: `extern "c" { function get_ascii_lower(c: uint8): uint8; }` is what the C side actually wants, and the safe wrapper does the `char ↔ uint8` translation explicitly.

One extra cast per crossing is paid by binding authors in concentrated wrapper code, not by every user. Application code never sees `uint32` at the boundary; it sees the safe `char`-returning wrapper.

The `char32_t`-specific allowance — "let `char` bind directly to `char32_t` because the representation matches" — was considered and rejected. The representation match is real, but the invariant mismatch is the actual concern, and a value coming back from C still needs the surrogate/range re-validation via `char(value) as result`. Saving one cast on outgoing calls is not worth the asymmetry.

**Examples.**
```ts
// suppose libunicode.h declares:
//   int  unicode_category(char32_t cp);
//   char get_ascii_lower(char c);

// inside an FFI wrapper module — declares C surface in FFI-safe types
extern "c" {
  function unicode_category(cp: uint32): int32;
  function get_ascii_lower(c: uint8): uint8;
}

// safe wrappers translate at the boundary
export function category(c: char): int32 {
  return unicode_category(uint32(c));         // outgoing: free
}

export function asciiLower(c: char): char | CharError {
  const byte = uint8(uint32(c)) as result;
  check result {
    return error as CharError { code: "char.non_ascii", message: "...", value: c };
  }
  const lowered = get_ascii_lower(byte);
  return char(uint32(lowered)) as result;     // ingress: re-validate
  // (in practice std exposes a char.fromAscii(uint8) infallible helper)
}

// disallowed direct binding
extern "c" {
  function bad(c: char): char;                // ERROR — char not FFI-safe
}
```

**Conclusion.** `char` is not FFI-safe. C `char` binds as `uint8` / `int8`; C `char32_t` binds as `uint32`. Wrappers convert at the boundary.

---

### 6.6 `bool` — Representation, Literals, and FFI

**Proposal.** `bool` is a one-byte type with exactly two states. Its in-memory representation is:

- `false` → `0x00`
- `true`  → `0x01`

`true` and `false` are **reserved keywords**, not identifiers in `std/core`. They cannot be shadowed, imported, exported, or used as identifiers anywhere.

`bool` is **FFI-safe** and matches the C `_Bool` / `<stdbool.h>` `bool` representation on every platform Delta targets. A Delta `bool` passes directly across `extern "c"` boundaries with no wrapper.

A `bool` value arriving from FFI is trusted to hold `0x00` or `0x01`. The language does not insert a runtime check on FFI bool reads. Bindings to C APIs that may return non-canonical bytes (e.g., a C function returning `int` interpreted as a bool) are responsible for normalizing via `(byte != 0)` in the FFI wrapper before letting the value escape into safe Delta code.

**Storage in collections:** `Array<bool>`, `Slice<bool>`, `FixedArray<bool, N>` are **byte-per-element**. `sizeof(bool) == 1`; indexing across a `bool` slice advances by one byte per element in the backend representation. Bit-packed boolean storage is a separate library type (`BitSet` or `BitArray`) added later if needed; it does not replace `Array<bool>` and does not participate in the slice model.

**Reason.** One-byte over one-bit is forced by the [§17](#17-slices-slicet) slice model: `Slice<bool>` must be a real `{ptr, length}` pair with a fixed per-element size. A bit-packed slice would require special-casing `Slice<T>` for `T = bool`, breaking the uniform slice representation and complicating every generic function that takes `Slice<T>`. The memory cost (8× over a packed representation) is real but predictable; code that has huge bool arrays wants a `BitSet` anyway — different access patterns, different API.

Matching C `_Bool` makes FFI a zero-cost pass-through. Every modern ABI ships a one-byte `_Bool`; deviating would force a per-call conversion that has no upside.

Keyword classification of `true` / `false` (rather than std-core constants) prevents shadowing and removes a bootstrap question — `std/core` itself can use `true` and `false` without having to first declare them.

Trusting FFI on the bit pattern is the FFI audit-boundary stance: the boundary wrapper validates or normalizes values as needed, and the safe surface assumes well-formed values. The rare bug where a misbehaving C function writes `0x02` into a `bool` is caught by the bindings author, not by every operator on every bool in the program.

**Examples.**
```ts
const flag: bool = true;
const empty: bool = false;

// Array<bool> is byte-per-element
const flags: Array<bool> = [true, false, true, false];
const len: uintsize = flags.length;          // 4
// flags' backing storage uses one byte per element in the backend;
// Slice<bool> indexing advances by one byte per element.

// keyword classification
const true: int32 = 1;                       // ERROR — `true` is a reserved keyword

// FFI pass-through
extern "c" {
  function process(flag: bool): bool;        // OK — bool is FFI-safe
}

// FFI ingress normalization (wrapper shape illustrative)
extern "c" {
  function legacy_is_open(): int32;          // C side returns 0 or non-zero
}

export function isOpen(): bool {
  return legacy_is_open() != 0;              // normalize to a clean bool
}
```

**Conclusion.** One byte, FFI-safe, keyword literals, byte-per-element collections. Bit-packed bool storage is a separate library concern.

---

### 6.7 `bool` — Operators

**Proposal.** The operator surface on `bool` is intentionally minimal:

- **Equality:** `==`, `!=` — defined.
- **Ordering:** `<`, `>`, `<=`, `>=` — **not defined.** `true < false` is a compile error.
- **Logical:** `&&`, `||`, `!` — defined per [§3.13](#313-operators), return `bool`.
- **Bitwise:** `&`, `|`, `^`, `~`, `<<`, `>>` — **not defined** on `bool`.
- **Arithmetic:** none.
- **Conversion to / from integers:** none, in either direction — locked by [§5.13](#513-conversions-to-and-from-bool).

The patterns that absent operators would have covered:

- **Bool ↔ integer flag for FFI:** `flag ? 1 : 0` (going out), `n != 0` (coming back). [§5.13](#513-conversions-to-and-from-bool) already commits to this.
- **Sorting by bool key:** the comparator uses the ternary pattern at the comparison site: `(a.flag ? 1 : 0) - (b.flag ? 1 : 0)` (or whatever signature the sort API expects).
- **Bitwise-and as non-short-circuiting and:** write `f() && g()` and accept short-circuiting, or compute both sides explicitly: `const x = f(); const y = g(); const both = x && y;`.

**Reason.** `bool` is a **logical type**, not a numeric type. Ordering implies a total order with arithmetic meaning; the order on `{false, true}` only has meaning under the integer encoding (`false=0, true=1`), which [§5.13](#513-conversions-to-and-from-bool) has already banned from being implicit. Allowing `<` on bool would re-introduce that encoding through the operator backdoor.

Banning bitwise on bool prevents the C trap where `&` "almost" works like `&&` except for short-circuiting. Authors who write `a & b` instead of `a && b` get subtle behavior differences when the operands have side effects; in Delta, the operand has no other plausible meaning (`bool` is one bit of information), so the operator simply does not exist.

The cost is real but small: generic code that's parametric over "any comparable type" cannot include `bool`. That is a feature — `Array<bool>` has no meaningful natural sort order, and code that wants one should pick an encoding explicitly. `Map<bool, V>` and `Set<bool>` work fine (equality + hash, no ordering required).

**Examples.**
```ts
const a: bool = true;
const b: bool = false;

// equality
const same = (a == b);                       // false
const diff = (a != b);                       // true

// logical
const both = a && b;                         // false
const either = a || b;                       // true
const negA = !a;                             // false

// ordering — not defined
const ord = a < b;                           // ERROR — `<` not defined on bool

// bitwise — not defined
const and = a & b;                           // ERROR — `&` not defined on bool
const xor = a ^ b;                           // ERROR

// numeric conversion — not defined (already §5.13)
const n: int32 = int32(a);                   // ERROR
const flag: int32 = a ? 1 : 0;               // OK — canonical form
```

**Conclusion.** Equality and logical operators only. No ordering, no bitwise, no arithmetic, no integer conversion.

---

### 6.8 `void` — Return-Position-Only Marker

**Proposal.** `void` is a marker indicating "no useful value." It appears in exactly two syntactic positions:

- As the return-type annotation of a function declaration: `function f(...): void { ... }`.
- As the return type in a function-type spelling: `type Handler = (Event) => void`.

`void` is **not** legal:

- As a parameter type.
- As a field type in an interface or class.
- As the type of a `let` or `const` binding.
- As a type argument to a generic: `Array<void>`, `Map<K, void>`, `Slice<void>` — all errors.
- As an element type of a fixed array: `void[N]` — error.
- As one slot of a multi-return signature: `function f(): int32, void | Error` — error.
- As inferable in any of the above positions: a generic `R` parameter cannot be inferred to `void` from a `void`-returning function in an argument slot.

A call to a `void`-returning function is a **statement, not an expression**:

- `log("hi");` is a complete statement.
- `const x = log("hi");` is a syntax error (no value to bind).
- `f(log("hi"))` is a syntax error (no value to pass).

There is no `void` value, no unit literal, no `()` syntax. `return;` is allowed at the end of a `void` function body but not required; falling off the end is legal.

**Reason.** Banning `void` from type-argument positions is the load-bearing decision. If `Array<void>` were legal, the type system would have to decide what `.push()` looks like on it (no argument? a phantom?), what its in-memory representation is (zero-sized? one byte?), and what happens to `Map<K, void>` (a set-shaped map). Every one of these forces a special case. The ban eliminates the category outright; the cost — generic code can't be parametric over "may or may not return a value" — is paid by writing two overloads or a tagged-union return type, which MVP's std-only generics do not need.

Making `void`-returning calls statements rather than expressions composes cleanly with [§3.10](#310-statement-and-expression-distinction)'s strict statement/expression split. The unit-type alternative (Rust `()`, Haskell `()`) earns its keep in expression-based languages where blocks, `if`, and `match` need to produce a value even when there is nothing meaningful to produce. Delta is statement-based; there is nothing for a unit value to do.

C lowering is direct: `void`-returning Delta function → C function returning `void`.

The `void`-not-inferable rule keeps the type-argument ban airtight. Without it, a generic `function map<T, R>(items: Slice<T>, f: (T) => R): Array<R>` would silently allow `R = void` when called with a `void`-returning lambda, producing `Array<void>` in violation of the type-argument ban. Refusing the inference forces the user to call the side-effect-only API differently — typically `forEach(items, f)` with an `R`-less signature.

**Examples.**
```ts
// return-position uses — OK
function log(msg: StringView): void {
  console.writeLine(msg);
}

type Handler = (Event) => void;

// disallowed uses
function f(x: void): int32 { return 0; }     // ERROR — void as parameter type

interface Bad {
  field: void;                                // ERROR — void as field type
}

let v: void;                                  // ERROR — void as binding type
const v: void = log("hi");                    // ERROR — void is not a value

const xs: Array<void> = [];                   // ERROR — void as type argument
const m:  Map<StringView, void> = new Map();  // ERROR

function f(): int32, void | Error { /* ... */ } // ERROR — void in multi-return slot

// void-returning calls are statements
log("hi");                                    // OK
const x = log("hi");                          // ERROR — no value
f(log("hi"));                                 // ERROR

// generic inference cannot pick void
function each<T, R>(xs: Slice<T>, f: (T) => R): Array<R> { /* ... */ }
each(items, (x) => log(x.name));              // ERROR — R cannot be inferred to void
                                              //   use a side-effect-only overload instead
```

**Conclusion.** `void` is a return-position marker only. Not a value, not a parameter/field/binding/generic-argument/multi-return type, not inferable.

---

### 6.9 Exit-Path Terminators

**Proposal.** The role that `never` would have served in MVP — making `panic`, `process.exit`, and `unreachable` recognizable as terminators for [§23](#23-the-check-block)'s `check`-block exit analysis and for general unreachability analysis — is filled by a **closed list of statement-level terminators** known to the compiler:

| Statement              | Source                                      |
|------------------------|---------------------------------------------|
| `return ...;`          | language keyword                            |
| `break;`               | language keyword                            |
| `continue;`            | language keyword                            |
| `panic(msg);`          | compiler intrinsic                          |
| `process.exit(code);`  | compiler intrinsic                          |
| `unreachable();`       | compiler intrinsic                          |

`panic`, `process.exit`, and `unreachable` are **intrinsics**, not ordinary functions:

- They look like calls at the syntax level but have no signature visible to the type system.
- They cannot be aliased, passed as arguments, or assigned to bindings.
- They cannot be shadowed by user code (the names are reserved at module scope).
- They are statements, not expressions: `const x = panic("...");` is a syntax error — there is no value at all, not even a `void`-shaped one.
- They lower to known C runtime calls annotated `_Noreturn` so Clang's optimizer can drop post-call C code; Delta's own reachability analysis is what governs Delta-level dead-code elimination, per [§5.15](#515-the-panic-mechanism)'s "the optimizer never assumes a panic is unreachable" rule (which is a Delta-level rule on Delta-level analyses; the C-side `_Noreturn` annotation is a separate hint that Clang uses within the C TU).

`panic` carries the message argument (`StringView`) and feeds the [§5.15](#515-the-panic-mechanism) panic mechanism. `process.exit` carries the exit code (`int32`). `unreachable` takes no argument and asserts that the program point is provably unreachable; reaching it at runtime panics with a fixed diagnostic.

**User-defined diverging functions are not expressible in MVP.** An author who wants a custom `fatal(code, msg)` helper either inlines the panic at every site or writes `fatal(...); unreachable();` to satisfy the exit-path analysis (the `unreachable()` is what the analyzer keys on). Post-MVP may revisit by adding a `noreturn` keyword that opts a user function into the terminator list; the current spec does not.

**Reason.** The mechanism specified in [§5.15](#515-the-panic-mechanism) — non-catchable, hits `abort()`, optional pre-abort hook — is what's load-bearing. That mechanism does not need a *type* to exist; it needs a way to be invoked from source. An intrinsic statement is sufficient.

Hardcoding the terminator list to six entries is a small function in the analyzer. Adding a seventh terminator (post-MVP) is a compiler change rather than a library change, which is the correct cost trade for the MVP: the list has been stable across every language that ships this analysis, and locking it down removes the `never` primitive from the language surface entirely.

Banning custom diverging functions in MVP is the honest version of the tradeoff. The [§52](#52-mvp-compiler-scope) self-hosting target does not need them — the compiler uses `panic(...)` inline at its trap sites, not custom wrappers.

**Examples.**
```ts
// check-block exit analysis recognizes all six terminators
function loadUser(id: u64): User | NotFoundError {
  const user = findUser(id) as result;
  check result {
    panic("invariant violated: lookup failed for valid id");   // terminator
  }
  return user;
}

function processAll(ids: Slice<u64>): void {
  for (const id of ids) {
    const user = loadUser(id) as result;
    check result {
      continue;                                                // terminator
    }
    handle(user);
  }
}

// process.exit and unreachable
function main(): int8 {
  const config = loadConfig() as result;
  check result {
    process.exit(1);                                           // terminator
  }

  switch (config.mode) {
    case "a": runA(); break;
    case "b": runB(); break;
  }
  unreachable();                                               // analyzer keys on this
}

// intrinsics cannot be aliased or shadowed
const myPanic = panic;                                        // ERROR — panic is not a value
function panic(msg: StringView): void { /* ... */ }            // ERROR — name reserved

// custom diverging function — workaround in MVP
function fatal(code: int32, msg: StringView): void {
  log(msg);
  process.exit(code);
}

// at the call site, the analyzer doesn't know `fatal` diverges; help it:
check result {
  fatal(1, "config load failed");
  unreachable();
}
```

**Conclusion.** Six statement-level terminators: `return`, `break`, `continue`, `panic`, `process.exit`, `unreachable`. The last three are compiler intrinsics, not functions. User-defined diverging functions are post-MVP.

---

### 6.10 Keyword Classification

**Proposal.** The primitive type names introduced in §§4–6 are **reserved keywords**, not identifiers exported from `std/core`. The complete set:

- **Numeric:** `int8`, `int16`, `int32`, `int64`, `intsize`, `uint8`, `uint16`, `uint32`, `uint64`, `uintsize`, `float32`, `float64`.
- **Non-numeric:** `bool`, `char`, `void`.
- **Literal keywords:** `true`, `false`.

The compiler-intrinsic names `panic`, `process`, `unreachable` ([§6.9](#69-exit-path-terminators)) and the special-value intrinsics `NaN`, `Inf` ([§5.10](#510-numeric-constants-and-special-float-values)) are also reserved.

Beyond the type-name keywords above, the following are reserved words of the grammar:

- **Declarations:** `function`, `class`, `enum`, `type`, `const`, `let`, `import`, `export`, `extern`, `uses` (the `Copyable` / `Disposable` marker clause, [§9](#9-classes)).
- **Control flow:** `if`, `else`, `while`, `for`, `switch`, `case`, `default`, `return`, `break`, `continue`, `check` ([§23](#23-the-check-block)). The `switch type` variant-dispatch form ([§30](#30-variant-dispatch-switch-type)) uses the existing `switch` keyword followed by the existing `type` keyword; no new word is introduced.
- **Ownership / value operators:** `move`, `clone`, `heap`, `&`. (`heap` and `&` are also type modifiers; `move` and `clone` are value-level operators — `move` transfers ownership, `clone` deep-copies an owned value and is fallible ([§14.4](#144-the-clone-operator)). There is no `copy` operator and no `heap <expr>` operator — see [§9.6](#96-copy-and-move-semantics), [§14.2](#142-the-three-operations), and [§9.1](#91-core-model).) There is **no `readonly` keyword**: a reference is read-only by default, and `edit &T` is the mutable form ([§8.8](#88-references-on-type-values)).
- **Class member modifiers & mutable-reference marker:** `public`, `edit`. `edit` marks a mutating method ([§9.5](#95-instance-methods-and-edit)) and also forms the mutable-reference type/expression `edit &T` / `edit &x` ([§8.8](#88-references-on-type-values)) — one keyword, one meaning ("may mutate"). (`private` is the implicit default and need not be written, but is reserved.)
- **Error channel:** `error` (in `return error as ...`), `ignore` ([§26](#26-explicit-error-ignoring-ignore)). `result` is **contextually** reserved only immediately after `as` (the `as result` binding form); elsewhere it is an ordinary identifier.

The following words are **not** reserved and are available as ordinary identifiers: `match`, `using`, `defer` (variant dispatch is `switch type`, and disposal is automatic — there is no `using`/`defer`; see [§30](#30-variant-dispatch-switch-type) and [§33](#33-automatic-disposal)). `internal` is likewise not a keyword (module visibility is `export` or implicit; [§43](#43-modules--visibility)).

Keyword rules:

- A keyword cannot be used as an identifier in any position: no `class bool { ... }`, no `interface char { ... }`, no `const void = ...`, no `let int32 = 0;`, no `function true(): bool { ... }`.
- Keywords cannot be shadowed in any scope, inner or outer. This is a stronger statement than [§3.4](#34-scoping-rules)'s ban on identifier shadowing only in that it also forbids using the keyword as a declared name at all (whereas §3.4 forbids reusing an already-declared identifier name).
- Keywords cannot be imported, exported, or re-exported.
- Errors involving keywords are reported at the lexer or parser layer with a specific diagnostic ("`int32` is a reserved keyword"), not as a downstream type error.

The string-family type names — `string`, `StringView`, `CString` — are **not** keywords. They are library identifiers in `std/core` (or wherever [§7](#7-string-family-types) places them), even though string literals default to `StringView` per [§4.2](#42-default-literal-types). The asymmetry is deliberate: numeric and primitive-non-numeric types are baked into the type system at the value-shape level; string types are library types with heap representations whose design may evolve.

**Reason.** Each rule earns its place:

- **Consistency with the rest of [§3](#3-basic-syntax--variable-bindings)'s lexical category.** `function`, `interface`, `class`, `enum`, `type`, `const`, `let`, `import`, `export`, `if`, `else`, etc. are all keywords. Primitive type names sit in the same category — they are load-bearing parts of the grammar, not library symbols.
- **No bootstrapping question.** If `int32` were a `std/core` identifier, then `std/core` itself could not use `int32` until it had imported the name from somewhere, and the language would need a way to *define* the primitive types in source. Keyword classification cuts the knot: the compiler knows the names; the std does not have to declare them.
- **Compatibility with [§5.10](#510-numeric-constants-and-special-float-values)'s split.** The numeric-boundary constants (`INT32_MAX`, `FLOAT64_EPSILON`, ...) are SCREAMING_SNAKE_CASE identifiers in `std/core`. The type names (`int32`, `float64`) are lowercase keywords. The convention separation makes the categories visually distinct.
- **The `string` exception is honest.** Locking `string` as a keyword would bake a particular heap representation into the language. The current [§7](#7-string-family-types) is sketchy enough that the design may change; keeping the name as a library identifier preserves room to evolve.

**Examples.**
```ts
// keyword usage — OK
const x: int32 = 10;
const c: char = 'A';
const flag: bool = true;

// keyword-as-identifier — all errors
class bool { /* ... */ }                     // ERROR — `bool` is a reserved keyword
interface char { /* ... */ }                 // ERROR
const int32: int32 = 0;                      // ERROR — cannot bind to a keyword
function true(): bool { return true; }       // ERROR
let void = 0;                                // ERROR

// shadowing — disallowed even in inner scope
function f(): void {
  if (cond) {
    const int32 = 5;                         // ERROR — keyword
  }
}

// import / export — disallowed
import { int32 } from "./types";             // ERROR — keyword cannot be imported
export const bool: int32 = 1;                // ERROR — keyword cannot be the name of an export

// std-core constants ARE identifiers (not keywords) — fine
const max: int32 = INT32_MAX;                // OK
const tiny: float64 = FLOAT64_EPSILON;       // OK

// string-family names are identifiers, not keywords
const s: StringView = "hello";               // OK — StringView is a std identifier
type MyString = string;                      // OK — `string` is shadowable / aliasable
```

**Conclusion.** Primitive type names, `true`, `false`, and the compiler intrinsics are reserved keywords. String-family names remain library identifiers.

---

### 6.11 Explicit Non-Goals for Section 6

The following are deliberately out of scope, either deferred to a later section or excluded permanently:

- **`char` as a UTF-8 byte** (8-bit interpretation, alias for `uint8`) — never. Use `uint8` directly for byte work; `char` is a scalar value.
- **`char` as a UTF-16 code unit** — never. Surrogate pairs are not a primitive concept.
- **`char` holding a surrogate codepoint** — never. Surrogates are excluded by construction at every ingress point.
- **`char` as a grapheme cluster** — never. Graphemes are an iterator concern in `std/unicode` / [§7](#7-string-family-types), not a primitive.
- **Implicit `char` ↔ integer conversion in either direction** — never. Explicit `uint32(c)` and `char(n) as result` only.
- **Direct `char` ↔ `uint8` / `int32` / `int64` / etc. casts** — never. All routes go through `uint32`.
- **Literal-fits-target adoption from integer literals into `char`** (`const c: char = 65;`) — never (symmetric with [§5.13](#513-conversions-to-and-from-bool)'s bool↔int prohibition).
- **Arithmetic operators on `char`** (`+`, `-`, `*`, `/`, `%`) — never. Convert via `uint32` for codepoint math.
- **Bitwise operators on `char`** — never.
- **Methods on `char`** (`.isAscii()`, `.toLower()`, `.toString()`, ...) — never. Classification and case conversion are free functions in `std/unicode`.
- **Locale-aware comparison through the `<` operator** — never. Operators compare by scalar value only; locale is a `std/locale` concern.
- **`char` in the [§41](#41-ffi-safe-types) FFI-safe set** — never. Forced through `uint32` at the boundary.
- **`char32_t`-specific FFI allowance for `char`** — never.
- **Ordering operators on `bool`** (`<`, `>`, `<=`, `>=`) — never.
- **Bitwise operators on `bool`** — never.
- **Methods on `bool`** — never.
- **`bool` ↔ integer conversion in either direction** — never (locked by [§5.13](#513-conversions-to-and-from-bool)).
- **Bit-packed `Array<bool>` / `Slice<bool>`** — never. Use a separate `BitSet` library type.
- **`void` as a value** — never. There is no unit literal, no `()` syntax.
- **`void` as a parameter, field, binding, generic argument, array element, or multi-return slot** — never.
- **`void` inferred as a generic type argument** — never.
- **`never` as a type in MVP** — dropped. Exit-path analysis uses a hardcoded statement list ([§6.9](#69-exit-path-terminators)).
- **User-defined diverging functions** — post-MVP. A future `noreturn` keyword may revisit.
- **`panic` / `process.exit` / `unreachable` as ordinary functions** — never. They are compiler intrinsics, not values.
- **Catchable panics, panic recovery, `try` / `recover`** — never (already [§5.16](#516-explicit-non-goals-for-section-5)).
- **A `byte` alias for `uint8`** — never.
- **A `unit` type as a substitute for `void`** — never.
- **`null` or `T?`** — never (already [§3.9](#39-removal-of-nullability)).
- **Primitive type names as `std/core` identifiers rather than keywords** — never.
- **Shadowing of `true`, `false`, or any primitive type name** — never.

---

**Note on downstream sections.** This rewrite of §6 has knock-on effects elsewhere in the spec:

- **[§18](#18-null-safety--nullable-types)** — already removed by [§3.9](#39-removal-of-nullability); no further action needed here.
- **[§23](#23-the-check-block)** — the exit-path analysis rule is rewritten to reference [§6.9](#69-exit-path-terminators)'s closed terminator list. The canonical wording is "every path must exit via `return`, `panic`, `break`, `continue`, `process.exit`, or `unreachable`"; `never` is not mentioned.
- **[§28](#28-enums)** — `char` is not an enum discriminant type. Discriminants are integer-valued only.
- **[§41](#41-ffi-safe-types)** — the FFI-safe set is updated to: primitive numeric types, `bool`, `CString`, `OpaqueHandle<T>`, `repr "c"` interfaces. `char` is explicitly excluded.
- **[§48](#48-c-code-generation-strategy)** — `void`-returning Delta functions lower to C `void`. The three terminator intrinsics lower to known runtime calls annotated `_Noreturn` on the C side; the names of the runtime symbols are codegen details, not user-visible.
- **[§52](#52-mvp-compiler-scope)** — MVP scope reflects: primitives `bool`, `char`, `void`; exit-path terminators as intrinsic statements; no `never`; no user-defined diverging functions.
- **Original §6 prose** — fully replaced by §§6.1–6.11 above. The example `function panic(msg: StringView): never;` is removed; `panic(msg);` is a statement-level intrinsic invocation, not a function declaration.

These knock-on edits are tracked but not made in this section.

---
