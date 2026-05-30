## 5. Primitive Numeric Types

Section 5 covers Delta's primitive numeric surface: the type set and naming convention, the trap-by-default semantics for every arithmetic operation, the three escape hatches that preserve ergonomic algorithms (wrap, saturate, recoverable error), the strict-IEEE story for floating point, the boundary back to integer land, the constants and intrinsics that complete the surface, the rules for compile-time constant evaluation, the conversion rules to and from `bool`, the pointer-width types, and the panic mechanism that the trap sites share with the rest of the language. The recurring principles are **no silent wrong answers** (every potentially-failing operation either traps or is recoverable via an explicit form) and **every conversion is visible** (no implicit widening, no implicit sign flipping, no implicit float-int promotion).

---

### 5.1 Type Set and Naming

**Proposal.** Delta provides three families of primitive numeric types under the verbose `type+width` naming convention introduced in [§4.3](#43-primitive-type-naming-convention):

- **Signed integers:** `int8`, `int16`, `int32`, `int64`, `intsize`.
- **Unsigned integers:** `uint8`, `uint16`, `uint32`, `uint64`, `uintsize`.
- **Floating-point:** `float32`, `float64`.

`intsize` and `uintsize` are the pointer-width integer types on the target platform (see [§5.14](#514-intsize-and-uintsize)). There are no terse aliases (`i32`, `u32`, `f64`), no length-anonymous aliases (`int`, `uint`, `double`), and no implicit widening or narrowing between any two numeric types — every conversion is written as a call-style cast per [§3.8](#38-type-conversions-and-the-as-keyword).

**Reason.** The verbose naming was justified in [§4.3](#43-primitive-type-naming-convention); the no-implicit-conversion stance was justified in [§3.8](#38-type-conversions-and-the-as-keyword) and [§3.11](#311-numeric-literals). This section gathers them as the type-set baseline so the rest of §5 can refer to a settled vocabulary.

The hard rule "no implicit conversion across widths or across signedness" earns its keep on the C-lowering side: sign-extension and truncation bugs that hide in C's implicit-conversion rules are the kind of footgun Delta exists to eliminate. Forcing `int64(small32)` or `uint32(signedValue)` at every conversion site costs one call's worth of source per conversion and surfaces the bit-level decision every time.

**Examples.**
```ts
const a: int32 = 10;
const b: uint64 = 20;
const c: float64 = 3.14;

const d: int64 = a;             // ERROR — no implicit int32 → int64 widening
const d: int64 = int64(a);      // OK — explicit cast

const e: uint32 = a;            // ERROR — no implicit sign change
const e: uint32 = uint32(a);    // OK if a >= 0, traps otherwise (see §5.3)

const length: uintsize = arr.length;  // length, size, capacity, index types are uintsize
```

**Conclusion.** Adopt the eleven types listed above. The naming is final; no aliases. Every cross-type conversion is a call-style cast.

---

### 5.2 Default Trap-on-Overflow Semantics

**Proposal.** Every arithmetic operation on a primitive integer type that overflows, divides by zero, shifts out of range, or otherwise produces an out-of-range result **traps at runtime with a panic** in every build mode — `--debug`, `--release-safe`, and `--release`. Signed and unsigned types follow the same rule; there is no "unsigned wraps silently" exception. The optimizer is **never** permitted to assume that a trap site is unreachable. Trapping behavior is mode-uniform: a program that runs in debug runs the same arithmetic checks in release.

**Reason.** A trap-by-default default rests on three premises that hold across Delta's target domains:

- **Overflow is essentially never intentional.** The legitimate cases (hash functions, CRCs, PRNGs, ring buffers, saturating UI math) are handled by explicit escape hatches per [§5.6](#56-wrapt-and-saturatet-type-tags) and [§5.5](#55-recoverable-failures-via-as-result). The default is what runs when the user has not opted into one of them.
- **The silent-wrong-answer failure mode is the worst possible outcome.** Wrap-in-release (Rust's default) means production binaries can produce silently corrupted values from input that the debug build correctly trapped on. Mode-uniform trapping eliminates the "works in debug, broken in release" class.
- **There is no in-band representation of "this integer is wrong."** Unlike floats, where IEEE 754 supplies Inf/NaN as failure signals, integers have no spare bit pattern. Either every operation can fail visibly, or wrong values flow through the program until something else notices.

The cost is a bounded perf overhead (commonly ~5–15% on integer-heavy hot loops the optimizer can't prove safe; often zero on loops where induction variables are statically bounded). For hot loops where this matters, [§5.6](#56-wrapt-and-saturatet-type-tags)'s `Wrap<T>` form makes the trade-off explicit at the binding.

**Examples.**
```ts
function sumPositives(values: Slice<int32>): int32 {
  let total: int32 = 0;
  for (const v of values) {
    if (v > 0) { total += v; }
  }
  return total;
}

// in any build mode:
sumPositives([2_000_000_000, 2_000_000_000]);
// → panic: arithmetic overflow in `+=`
//   at src/stats.delta:4
```

The panic is identical in debug and release. The diagnostic carries the source location via the `#line` directives from [§2.8](#28-source-mapping). No silent wrap, no UB, no "release build behaves differently" footgun.

**Conclusion.** Trap on overflow, mode-uniform, signed and unsigned alike. The optimizer never assumes a trap is unreachable.

---

### 5.3 The Complete Trap Set

**Proposal.** The set of operations that may trap on a primitive numeric type is **closed** and **enumerated**. No other arithmetic or conversion operation in user code can panic. The set is:

| # | Operation | Traps when |
|---|-----------|------------|
| 1 | `+`, `-`, `*` on integers | the result does not fit the destination type |
| 2 | `/`, `%` on integers | the divisor is zero |
| 3 | `/`, `%` on signed integers | dividend is `int{N}_MIN` and divisor is `-1` (produces a value outside the destination range) |
| 4 | `<<`, `>>` on integers | shift count is `≥` the operand's bit width |
| 5 | `<<`, `>>` on integers | shift count is negative (rejected at the type level — see [§5.4](#54-shift-operator-semantics)) |
| 6 | Narrowing cast `int{M}(wider)` | the value is outside the destination range |
| 7 | Sign-flipping cast `intN(uintN_value)` / `uintN(intN_value)` | the value does not fit the destination signed/unsigned range |

Every trap site shares the panic mechanism described in [§5.15](#515-the-panic-mechanism). Every trap site is recoverable via the `as result` form in [§5.5](#55-recoverable-failures-via-as-result), or sidestepped via the `Wrap<T>` / `Saturate<T>` forms in [§5.6](#56-wrapt-and-saturatet-type-tags) / [§5.7](#57-wrap-and-saturate-as-cast-constructors).

**Reason.** An enumerated trap set is what makes the rest of §5 reviewable. Without it, "this operation traps" is folklore; with it, codegen has a checklist and the optimizer's elision proofs have a closed obligation.

Two corners earn their own rows:

- **Signed `int_MIN / -1`** (row 3) is the corner that is *not* covered by row 2 (divisor is non-zero) but still produces an out-of-range value (`int32_MAX + 1` doesn't fit `int32`). On x86 the hardware raises `SIGFPE`; on ARM the hardware returns `int_MIN` silently. To make the behavior portable, Delta codegen emits an explicit `if (a == INT{N}_MIN && b == -1) panic;` guard before every signed division and modulo. The optimizer elides this guard when either operand is constant.
- **Shift count out of range** (row 4) is C undefined behavior; many ABIs silently mask the count to the lower bits. Delta traps to keep the algorithm meaningful (`1 << 32` on `int32` is a bug, not "shift by zero").

Row 5 (negative shift count) is enforced at the type level: shift counts are `uint32` (see [§5.4](#54-shift-operator-semantics)), so a negative value is a compile error, not a runtime panic.

**Examples.**
```ts
// 1. additive overflow
const sum: int32 = INT32_MAX + 1;          // panic

// 2. division/modulo by zero
const q: int32 = 10 / 0;                   // panic
const r: int32 = 10 % 0;                   // panic

// 3. int_MIN / -1
const z: int32 = INT32_MIN / -1;           // panic

// 4. shift count out of range
const v: int32 = 1;
const shift: uint32 = 32;
const w = v << shift;                      // panic

// 5. negative shift — rejected at the type level
const bad: int32 = -1;
const w = v << bad;                        // ERROR — shift count must be uint32

// 6. narrowing out of range
const big: int64 = 5_000_000_000;
const small = int32(big);                  // panic

// 7. sign-flipping out of range
const neg: int32 = -1;
const u = uint32(neg);                     // panic
```

**Conclusion.** Seven rows, closed list. Every other arithmetic or conversion operation in user code is panic-free.

---

### 5.4 Shift Operator Semantics

**Proposal.** The shift operators `<<` and `>>` follow strict rules:

- **Shift count type is always `uint32`,** regardless of the operand's width. `int32 << uint32` is the canonical shape; passing an `int32` or any other integer type as the count is a compile error. The uniform count type forbids negative counts at the type level.
- **Right shift on signed integers is arithmetic** (sign-extending), consistent with [§3.13](#313-operators).
- **Right shift on unsigned integers is logical** (zero-fill).
- **No implicit masking** of the count. A count of `≥` the operand's bit width traps per [§5.3](#53-the-complete-trap-set) row 4 — it is never silently truncated to `count mod width`.
- **No dedicated unsigned shift operator** (`>>>`) in MVP. The C-style "logical shift on signed" is obtained via `int32(uint32(x) >> count)`, which is the existing combination of sign-flip cast and unsigned shift.

**Reason.** The uniform `uint32` count type is borrowed from Rust and matches what users expect from "shift count is a small positive integer." Per-operand-width count types (`uint8` for `int8`, `uint16` for `int16`, ...) would add five rules with no semantic benefit and force conversions at every shift site.

No-implicit-masking matches the rest of §5's no-silent-wrong-answer stance. C's masking (`x << 32` becomes `x << 0` on x86) was the source of countless codec and protocol bugs; Java specified the masking but the result is still wrong half the time. Trapping forces the algorithm to be honest about its shift amounts.

Arithmetic right shift on signed integers is the de-facto behavior in every modern target ABI; Delta codifies it so the lowering is platform-independent.

**Examples.**
```ts
// shift count is uint32
const v: int32 = 1;
const n: uint32 = 5;
const w = v << n;                          // 32

const bad: int32 = 5;
const w2 = v << bad;                       // ERROR — shift count must be uint32, not int32

// out-of-range count traps
const overflow: uint32 = 32;
const w3 = v << overflow;                  // panic
const w3 = v << overflow as result;        // recoverable

// arithmetic right shift on signed preserves sign
const s: int32 = -8;
const r1 = s >> 1;                         // -4 (sign extended)

// logical right shift on unsigned zero-fills
const u: uint32 = 0xFFFF_FFFF;
const r2 = u >> 1;                         // 0x7FFF_FFFF

// "logical shift on a signed value" — explicit combination
const x: int32 = -1;
const r3 = int32(uint32(x) >> 1);          // 0x7FFF_FFFF as int32
```

**Conclusion.** `uint32` count type; arithmetic right shift on signed; logical on unsigned; no implicit masking; no `>>>` operator in MVP.

---

### 5.5 Recoverable Failures via `as result`

**Proposal.** Every trapping operation listed in [§5.3](#53-the-complete-trap-set) is recoverable via the same `as result` binding form used for fallible function calls in [§22](#22-consuming-fallible-calls-as-result). Writing `expr as result` makes the expression produce a fallible value: `T | ArithmeticError` (or the appropriate error type for the failure kind). The standard `check result { ... }` ([§23](#23-the-check-block)) handles the error path.

Constraints on the form:

- The expression bound with `as result` may contain **at most one failure source**. A mixed expression that combines a fallible function call with potentially-overflowing arithmetic must be split into two separate `as result` bindings. Implicit error-type unions are not introduced.
- An expression bound with `as result` must be capable of failure. Binding a provably-infallible expression with `as result` (e.g., `const x = 5 as result;` or `const x = 5 + 5 as result;` where constant-folding proves no overflow) is a hard compile error.
- `as result` covers the entire preceding expression's failure sources — overflow, division by zero, shift out of range, narrowing cast out of range, sign-flip out of range, and float-to-int boundary failures from [§5.9](#59-the-float-to-integer-boundary).
- There is no `checked` keyword. `as result` is the sole recoverable-failure binding form.

**Reason.** Reusing `as result` from [§22](#22-consuming-fallible-calls-as-result) collapses two concepts (fallible call binding, recoverable-arithmetic binding) into one surface. Readers who learn `as result` for I/O and parsing get the arithmetic-error story for free.

The mixed-expression prohibition keeps the model honest about "one error type per binding." Implicit error unions across composed expressions would require either (a) generating new sum types in the type system at every composed site or (b) erasing error information into a common supertype. Neither is acceptable in MVP. The workaround — split the expression into two `as result` bindings — is straightforward and makes the error-path discrimination obvious.

The provably-infallible prohibition prevents `as result` from becoming defensive ritual. If users could write `as result` on any expression, the form would lose its signal value ("this might fail; I am handling it"). Forcing the compiler to reject infallible uses keeps the form load-bearing.

**Examples.**
```ts
// recover from overflow
const total = a + b as result;
check result {
  return error as MathError { code: "math.overflow", message: "...", a, b };
}

// recover from division by zero
const ratio = numerator / denominator as result;
check result {
  return error as MathError { code: "math.div_by_zero", ... };
}

// recover from a narrowing cast
const small = int32(largeValue) as result;
check result {
  return error as CastError { code: "cast.out_of_range", value: largeValue };
}

// chained arithmetic — still ergonomic
const area = width * height - padding * 2 as result;
check result { return error as MathError { ... }; }

// shift-count failures recover
const shifted = value << shiftCount as result;
check result { return error as MathError { code: "math.shift_out_of_range", ... }; }

// mixed-failure expression — disallowed
const total = parseInt(s) + 1 as result;  // ERROR — multiple failure sources
                                          // split into two bindings:
const parsed = parseInt(s) as result;
check result { return error as ParseError { ... }; }
const total = parsed + 1 as result;
check result { return error as MathError { ... }; }

// provably-infallible — disallowed
const x = 5 as result;                    // ERROR — expression cannot fail
const x = 5 + 5 as result;                // ERROR — constant-folded, no fail point
```

**Conclusion.** `as result` is the unified recoverable-failure binding form. Mixed-failure expressions split; infallible expressions are an error.

---

### 5.6 `Wrap<T>` and `Saturate<T>` Type Tags

**Proposal.** The standard library provides two generic wrapper types — `Wrap<T>` and `Saturate<T>` — that act as **type-level tags** on a primitive integer `T`. The tag selects the arithmetic operator semantics for values of the tagged type:

- `Wrap<T>` arithmetic wraps on overflow (two's-complement wrap for signed; modular wrap for unsigned). No traps.
- `Saturate<T>` arithmetic clamps results to `[T_MIN, T_MAX]`. No traps.

Key properties:

- **Zero runtime cost.** A `Wrap<int32>` value has the same in-memory representation as an `int32`; the tag exists only in the type system and selects which operator overload fires.
- **Closed set.** `Wrap` and `Saturate` are defined exclusively in the standard library for the primitive integer types. User code may not define new transparent type tags in MVP; this is parked for post-MVP alongside user-defined generics ([§52](#52-mvp-compiler-scope)).
- **Implicit tag-on** (`T → Wrap<T>`, `T → Saturate<T>`): a plain integer value flows implicitly into a wrapper-tagged slot under [§4.1](#41-inference-direction) bidirectional inference. Literals flow per [§3.11](#311-numeric-literals).
- **Explicit tag-off** via the `.value` field: a `Wrap<T>` does not implicitly convert back to a plain `T`. The user must write `.value` to leave the tagged zone.
- **No mixing** of `Wrap<T>` and `Saturate<T>` in a single expression: an operator with one operand of each tag is a compile error.
- `Wrap<T>` and `Saturate<T>` apply to integer types only. Floats follow IEEE-754 (Inf/NaN as in-band failure signals) and have no analog tag.

**Reason.** A type-tag form, rather than a method family (`a.wrappingAdd(b)`, `a.saturatingMul(b)`) or an arithmetic block, was chosen because it puts the intent at the *binding*. Reading `let hash: Wrap<uint32> = 0;` declares once that all arithmetic on `hash` is wrap-semantic; the operator surface (`+`, `*`, `^`, etc.) stays the textbook shape. The method family by contrast forces the algorithm to be rewritten with `wrappingMul` at every operator, and a block form (`unchecked { ... }`) loses the per-operator visibility a code reviewer wants.

The asymmetry (implicit ingress, explicit egress) is what keeps the tag from leaking. A `Wrap<uint32>` cannot silently become a `uint32` and lose its wrap semantics partway through a computation; the `.value` access is the visible exit point.

The tag is consistent with Delta's existing wrapper-type idiom in [§42](#42-concurrency--atomics) (`Mutex<T>`, `Atomic<T>`). Those are *behavioral* wrappers (they change runtime representation or semantics); `Wrap<T>` and `Saturate<T>` are *transparent* wrappers (zero-cost type tags). The category is distinguished by the implicit-tag-on rule, which applies only to the transparent kind. Implicit `T → heap T` does *not* apply — `heap T` heap-allocates and demands an explicit construction.

Forbidding user-defined transparent tags in MVP keeps the precedent narrow. A future post-MVP design may open the category up via a marker decoration or interface; until then, `Wrap` and `Saturate` are the only two.

**Examples.**
```ts
// FNV-1a hash — wrap semantics applied to every arithmetic op
function fnv1a(bytes: Slice<uint8>): uint32 {
  let hash: Wrap<uint32> = 2166136261;       // literal flows via literal-fits-target
  for (const b of bytes) {
    hash = hash ^ uint32(b);                 // uint32 implicitly tags to Wrap<uint32>
    hash = hash * 16777619;                  // literal tags to Wrap<uint32>; bare `*` wraps
  }
  return hash.value;                         // explicit untag at the function boundary
}

// saturating brightness
function brighten(channel: uint8, amount: uint8): uint8 {
  const result: Saturate<uint8> = channel + amount;   // both tag implicitly; saturating `+`
  return result.value;                                // 250 + 20 → 255, not 14
}

// mixed-zone arithmetic
const a: Wrap<int32> = 100;
const b: int32 = 50;
const c = a + b;                             // b tags to Wrap<int32>; c: Wrap<int32>
const d: int32 = a + b;                      // ERROR — result is Wrap<int32>, no implicit untag
const e: int32 = (a + b).value;              // OK — explicit untag at assignment

// mixing wrap and saturate
const s: Saturate<int32> = 200;
const bad = a + s;                           // ERROR — Wrap<int32> and Saturate<int32> cannot mix
```

**Conclusion.** Wrap and Saturate are zero-cost type tags. Tag-on is implicit; tag-off is explicit via `.value`. Wrap/Saturate mixing is a hard error.

---

### 5.7 Wrap and Saturate as Cast Constructors

**Proposal.** `Wrap<T>` and `Saturate<T>` serve a second role: as **cast constructors** that perform a possibly-narrowing or sign-flipping conversion with wrap-on-overflow or saturate-on-overflow semantics, respectively.

```ts
// trap-on-out-of-range cast (default)
const small: int32 = int32(largeValue);          // panic if out of range

// wrap-on-out-of-range cast — bit pattern preserved, result is Wrap<int32>
const truncated = Wrap<int32>(largeValue);
const asPlain: int32 = Wrap<int32>(largeValue).value;

// saturate-on-out-of-range cast — clamped to [int32_MIN, int32_MAX], result is Saturate<int32>
const clamped: int32 = Saturate<int32>(largeValue).value;

// recoverable form
const safe = int32(largeValue) as result;
check result { /* ... */ }
```

The constructor semantics:

- `Wrap<T>(value)` accepts any integer type and produces a `Wrap<T>`. If `value` is out of `T`'s range, the underlying bits are truncated/reinterpreted (modular wrap for unsigned, two's-complement for signed; sign-flip preserves bit pattern).
- `Saturate<T>(value)` accepts any integer type and produces a `Saturate<T>`. If `value` is below `T_MIN` or above `T_MAX`, the result is clamped to the boundary.
- Cast-constructor calls **do not propagate tag semantics into their argument expression**. The argument is evaluated in its own type context, exactly like any other function call. To get wrap semantics on an arithmetic expression, use the binding-target form from [§5.6](#56-wrapt-and-saturatet-type-tags) or wrap each operand explicitly.
- `Wrap<int>(NaN)` (the float-to-int boundary case) maps NaN to 0 by convention, matching WebAssembly's `i32.trunc_sat_f64_s` semantics; `Wrap<int>(±Inf)` clamps to the destination boundary.

**Reason.** Unifying tags and cast constructors under one type avoids a parallel vocabulary (`.wrappingFrom` static methods would have been an alternate). One `Wrap<T>(...)` form covers both arithmetic-tag construction and lossy-cast construction; the user does not learn two surfaces.

The constructor-does-not-propagate rule is the same principle that ruled out the `checked(expr)` macro form in earlier design discussion: a function-shaped call should not change the meaning of operators inside its argument. If a user wants whole-expression wrap semantics, the *binding-target* form is the canonical path — target type propagates inward under [§4.1](#41-inference-direction), and operator dispatch follows operand types within that propagated context. The cast constructor is for one explicit value-level conversion at a time.

**Examples.**
```ts
// wrap-narrowing
const big: int64 = 5_000_000_000;
const small: int32 = Wrap<int32>(big).value;    // truncates to int32 range; no panic

// sign-flip with bit preservation
const neg: int32 = -1;
const u: uint32 = Wrap<uint32>(neg).value;      // 0xFFFFFFFF

// saturating narrowing
const clamped: int32 = Saturate<int32>(big).value;   // INT32_MAX

// saturating sign-flip
const u2: uint32 = Saturate<uint32>(neg).value;      // 0

// constructor does NOT propagate wrap into its argument
const X = Wrap<int32>(INT32_MAX + 1).value;          // ERROR — inner `+` overflows in plain int32

// binding-target form does the propagation
const X: Wrap<int32> = INT32_MAX + 1;                // OK — target type propagates inward
                                                     // INT32_MAX and 1 both tag to Wrap<int32>;
                                                     // `+` wraps; result is INT32_MIN
const Xv: int32 = X.value;
```

**Conclusion.** Wrap and Saturate double as cast constructors. The constructor does not propagate tag semantics into its argument; the binding-target form does.

---

### 5.8 Float Semantics (IEEE 754)

**Proposal.** Floating-point arithmetic in Delta follows **strict IEEE 754 semantics** in every build mode. The default integer trap model does not extend to floats. Specifically:

- `+`, `-`, `*`, `/` on floats produce results per IEEE 754; no traps. Overflow produces `±Inf`; underflow produces a subnormal or `0.0`; the IEEE invalid cases (`0.0 / 0.0`, `Inf - Inf`, `0.0 * Inf`) produce `NaN`.
- Comparisons follow IEEE ordered rules: `NaN == NaN` is `false`; `NaN != NaN` is `true`; every other comparison with `NaN` is `false`.
- Subnormals are preserved per IEEE; no flush-to-zero default. There is no fast-math opt-in in MVP — strict IEEE is the only mode.
- Constant evaluation also follows IEEE: `const x = 0.0 / 0.0;` folds to `NaN` (no error), `const y = 1.0 / 0.0;` folds to `+Inf` (no error). See [§5.12](#512-compile-time-constant-evaluation).
- Mixed-precision arithmetic (`float32 + float64`) is a compile error per [§5.1](#51-type-set-and-naming). Explicit conversion is required at every cross-precision site.
- Three predicate methods are provided on every float type for explicit NaN/Inf testing: `.isNaN()`, `.isFinite()`, `.isInf()`.

**Reason.** Three properties make the integer trap model wrong for floats:

- **IEEE 754 supplies in-band failure signals.** `NaN` and `Inf` *are* the failure representations. Numerical algorithms expect them to propagate through inner loops and be checked at the end. Trapping at every NaN/Inf production would force every numerical algorithm to be rewritten with `as result` plumbing through inner loops.
- **NaN and Inf are sometimes the correct result.** Limit computations, initial conditions for iterative solvers, sentinel values — all rely on the IEEE production rules.
- **The performance cost would be catastrophic.** Numerical code does millions of float ops per second; adding `isnan` / `isinf` checks at every operation would destroy throughput and prevent vectorization.

No fast-math in MVP because all the fast-math options (reassociation, finite-math assumptions, reciprocal approximation) break IEEE in subtle ways, and the only sane way to opt into them — a per-function attribute — was deleted with the rest of the decorator category (see [§5.15](#515-the-panic-mechanism) cross-cutting impact). Numerical users who need vectorized reductions write the explicit-accumulator form by hand or drop to C via FFI.

Mixed-precision requires explicit conversion to match the rest of §5's no-implicit-widening stance — `float32 + float64` is a real precision decision that deserves visibility at every site.

**Examples.**
```ts
// IEEE arithmetic — no traps
const a: float64 = 1e308;
const b = a * a;                            // +Inf, not a panic
const c = 0.0 / 0.0;                        // NaN, not a panic
const d = b - b;                            // NaN (Inf - Inf)

// NaN comparison rules
const isEqual = c == c;                     // false — NaN == NaN is false
const isNotEqual = c != c;                  // true — canonical NaN test (also: c.isNaN())

// predicate methods
if (c.isNaN()) { /* ... */ }
if (b.isFinite()) { /* ... */ }
if (b.isInf()) { /* ... */ }

// no mixed precision
const f32: float32 = 1.0;
const f64: float64 = 2.0;
const sum = f32 + f64;                      // ERROR — explicit conversion required
const sum = float64(f32) + f64;             // OK

// no fast-math
@fast_math                                  // ERROR — decorators do not exist in Delta
function dot(...): float64 { /* ... */ }
```

**Conclusion.** Strict IEEE 754 in every build mode. No fast-math. NaN/Inf propagate; explicit `.isNaN()` / `.isFinite()` / `.isInf()` methods test for them.

---

### 5.9 The Float-to-Integer Boundary

**Proposal.** Float-to-integer conversion is the one place where the integer trap model picks back up on the float side. The trap surface:

- `int{N}(floatValue)` panics if the float value is `NaN`, `±Inf`, or outside the destination integer range. Recoverable via `int{N}(floatValue) as result`.
- `Wrap<int{N}>(floatValue)` performs the conversion with truncation semantics: NaN maps to 0, Inf clamps to the destination boundary, in-range values are truncated toward zero per IEEE.
- `Saturate<int{N}>(floatValue)` clamps to the destination range: NaN maps to 0, `±Inf` map to `int{N}_MAX` / `int{N}_MIN`, in-range values truncate toward zero.
- Integer-to-float conversion (`float64(intValue)`) is exact for values that fit `float64`'s mantissa precision (53 bits for `float64`, 24 for `float32`); larger values round to nearest under the current IEEE rounding mode (round-half-to-even by default).

**Reason.** The boundary back from floats into integers re-enters the no-silent-wrong-answer regime. `int32(NaN)` in C is undefined behavior; in C++ it is implementation-defined; in C# it returns `int.MinValue`. Each of these is a bug surface. Delta's choice (trap with recovery) gives a single portable behavior across targets and preserves the `as result` ergonomics already established for integer-side narrowing.

The NaN-to-0 convention for `Wrap` and `Saturate` cast constructors mirrors WebAssembly's saturating-trunc instructions, which is the most cited prior art for "what should a non-trapping float-to-int do when given NaN." There is no value that is both consistent with truncation semantics and meaningful for NaN; mapping to 0 is the established choice.

Integer-to-float being exact-when-possible is the IEEE rounding default; no surprise.

**Examples.**
```ts
const x: float64 = computeStuff();

// default — trap on NaN, Inf, or out-of-range
const i = int32(x);                          // panic if x is NaN, Inf, or out of int32 range

// recoverable
const i = int32(x) as result;
check result { return error as CastError { ... }; }

// truncation cast — NaN → 0, Inf → boundary
const i = Wrap<int32>(x).value;

// saturating cast — NaN → 0, +Inf → INT32_MAX, -Inf → INT32_MIN, others clamp
const i = Saturate<int32>(x).value;

// integer to float — exact when value fits mantissa
const big: int64 = 1_000_000_000_000;
const f = float64(big);                      // exact (1e12 fits float64)
const bigger: int64 = (1 as int64) << 60;
const f = float64(bigger);                   // rounds to nearest representable float64
```

**Conclusion.** Float-to-int casts trap on NaN, Inf, or out-of-range; recoverable via `as result`. `Wrap` and `Saturate` cast constructors map NaN to 0 and Inf to the destination boundary. Int-to-float is exact when possible, rounds to nearest otherwise.

---

### 5.10 Numeric Constants and Special Float Values

**Proposal.** Boundary constants for primitive numeric types are exposed as **global identifiers in `std/core`** (implicitly available, no import needed), under SCREAMING_SNAKE_CASE naming. Special float values are exposed as **compiler intrinsics** — bare identifiers known to the compiler:

```ts
// integer boundary constants (signed have MIN; unsigned have only MAX since MIN is 0)
INT8_MIN,  INT8_MAX,  INT16_MIN, INT16_MAX
INT32_MIN, INT32_MAX, INT64_MIN, INT64_MAX
INTSIZE_MIN, INTSIZE_MAX               // target-dependent
UINT8_MAX, UINT16_MAX, UINT32_MAX, UINT64_MAX, UINTSIZE_MAX

// float boundary and precision constants
FLOAT32_MAX, FLOAT32_MIN_NORMAL, FLOAT32_MIN_SUBNORMAL, FLOAT32_EPSILON
FLOAT64_MAX, FLOAT64_MIN_NORMAL, FLOAT64_MIN_SUBNORMAL, FLOAT64_EPSILON

// special float values — compiler intrinsics
NaN                                     // float64 by default
Inf                                     // float64 by default, positive; use `-Inf` for negative
```

`NaN` and `Inf` for `float32` are obtained via explicit conversion: `float32(NaN)`, `float32(Inf)`. There are no `FLOAT32_NAN` / `FLOAT64_NAN` constants — the intrinsic form is canonical.

**Reason.** Two routes were considered:

- **Type-static fields** (`int32.MAX`, `float64.NaN`) — clean syntactically but turn `int32` into a third role (it is already a type and a call-style cast constructor). Delta's policy is "each identifier has one role." Adding namespace-of-statics overloading was rejected on consistency grounds.
- **Global constants + compiler intrinsics** (chosen) — keeps `int32` as type-and-cast only, puts boundary values in the global namespace where they participate in normal binding lookup, and uses compiler intrinsics for the genuinely-not-constant cases (`NaN` has no single bit pattern; it is a *category* of values, not a value).

The SCREAMING_SNAKE_CASE naming aligns with C's `<stdint.h>` (`INT32_MAX`) and reinforces the "compile-time constant" reading. `NaN` and `Inf` as PascalCase / capitalized identifiers match the intrinsic-as-keyword reading.

**Examples.**
```ts
// integer constants
const max: int32 = INT32_MAX;                // 2_147_483_647
const min: int32 = INT32_MIN;                // -2_147_483_648
const usizeMax = UINTSIZE_MAX;               // target-dependent (UINT64_MAX on 64-bit)

// float boundary
const tiny = FLOAT64_EPSILON;                // 2.220446049250313e-16

// special float values
const sentinel: float64 = NaN;               // OK — NaN is float64 by default
const ceiling: float64 = Inf;
const floor: float64 = -Inf;

// float32 special values via cast
const sentinel32: float32 = float32(NaN);    // explicit conversion required

// constants are usable in const contexts
const HALF: int32 = INT32_MAX / 2;           // OK — folded at compile time
const TOO_BIG: int32 = INT32_MAX + 1;        // ERROR — overflow at compile time (§5.12)
```

**Conclusion.** Global constants in `std/core` for boundary values; compiler intrinsics `NaN` and `Inf` for special float values. SCREAMING_SNAKE_CASE for constants; bare identifiers for intrinsics.

---

### 5.11 Bit Reinterpretation via `bitCast`

**Proposal.** A single standard-library generic function provides bit-level reinterpretation between types of the same size:

```ts
// std/mem
function bitCast<From, To>(value: From): To
  where sizeof(From) == sizeof(To);
```

The function returns the bits of `value` as if they were a `To`. The compile-time `sizeof` constraint rejects any call where the source and destination differ in width. Type arguments are inferable from binding annotations and parameter slots per [§4.9](#49-generic-type-argument-inference); explicit `bitCast<From, To>(...)` is required only when no target context exists.

Common use cases: float ↔ integer bit pattern access (hash mixing, NaN-boxing, IEEE 754 manipulation), sign reinterpretation without value change (when the bit pattern is what matters, not the value).

**Reason.** Bit reinterpretation is distinct from value-level casting. `int32(uint32_value)` may trap if the value does not fit the signed range; `bitCast<uint32, int32>(uint32_value)` always succeeds with the same bit pattern. A dedicated function (rather than a syntax form) is enough because the use case is rare and obviously low-level. The library form composes with the std-only generics machinery promoted to MVP per [§52](#52-mvp-compiler-scope), so no new mechanism is introduced.

The size-match constraint at compile time prevents the most common bit-cast bug (cross-size reinterpretation that silently truncates or zero-extends). This is the first place in Delta that requires a `where` clause expressing a compile-time predicate on type parameters — the predicate kind (`sizeof(X) == sizeof(Y)`) is closed-set in MVP and not exposed as a general user-facing constraint syntax.

**Examples.**
```ts
import { bitCast } from "std/mem";

// hash mixing — interpret a float's bit pattern as an integer
const f: float64 = 3.14159;
const bits: uint64 = bitCast(f);             // 4614256650576692846

// NaN-boxing — pack a tagged uint64 into a float64
const tagged: uint64 = 0x7FF8_0000_0000_0001;
const asFloat: float64 = bitCast(tagged);

// sign reinterpretation without value change
const raw: uint32 = readPacket();
const signed: int32 = bitCast(raw);          // bit pattern preserved

// type arguments must be explicit when no target context
const y = bitCast(x);                        // ERROR — To cannot be inferred
const y = bitCast<uint32, float32>(x);       // OK — explicit

// size mismatch is a compile error
const wrong = bitCast<int32, int64>(x);      // ERROR — sizeof mismatch
```

**Conclusion.** `bitCast<From, To>(value)` in `std/mem` with a compile-time `sizeof` constraint. Type arguments inferable from context per [§4.9](#49-generic-type-argument-inference).

---

### 5.12 Compile-Time Constant Evaluation

**Proposal.** The compiler's constant evaluator follows the same arithmetic rules as runtime, with one key difference: failures become **compile-time errors** instead of runtime panics.

- An integer arithmetic operation in a `const` declaration, const generic argument, or default parameter value that overflows, divides by zero, or shifts out of range is a hard compile error at the declaration site. The diagnostic carries the same shape as the runtime panic (operator, file, line).
- Float arithmetic at compile time follows strict IEEE 754: `const X = 0.0 / 0.0;` folds to `NaN` with no error; `const Y = 1.0 / 0.0;` folds to `+Inf`. Consistent with [§5.8](#58-float-semantics-ieee-754).
- `as result` does not apply to compile-time-known failures. A constant expression that the evaluator proves will fail cannot be "recovered" — there is no runtime branch. `const x = INT32_MAX + 1 as result;` is a hard error with the message "this expression overflows at compile time; `as result` only recovers from runtime failures."
- `Wrap<T>` and `Saturate<T>` work identically at compile time — a `Wrap<int32>`-typed constant computes its arithmetic with wrap semantics, statically.

The contexts where constant evaluation runs are limited to:

1. `const` declarations at any scope.
2. Const generic arguments (e.g., `FixedArray<int32, SIZE + 1>` where `SIZE` is a const).
3. Default parameter values (per [§3.7](#37-parameters-and-overloading), constants only).

Other expressions (anything in a `let` binding, inside a function body, etc.) follow runtime rules.

**Reason.** Promoting runtime failures to compile-time errors for fully-static expressions is the right default — "compiles successfully, panics on first run" is the worst possible outcome for an expression the compiler could evaluate entirely. The diagnostic is the same shape so the user's mental model is uniform: the failure is identified the same way, the only difference is when.

The float-IEEE exception preserves intentional NaN/Inf construction (sentinel values, initial conditions). The cost is that float constants do not earn "compile-time NaN protection" — but [§5.8](#58-float-semantics-ieee-754) already commits to "NaN is not an error" at runtime, and inverting that rule for compile-time would be a confusing local inconsistency.

The `as result` prohibition at compile time is the most subtle rule. The `as result` form *exists* to convert a runtime failure into a runtime-handleable value; a compile-time-known failure has no runtime branch to take. Silently accepting it would have the compiler emit code that always takes the error path, which both wastes the static information and produces confusing IR.

**Examples.**
```ts
// integer compile-time failures
const X: int32 = INT32_MAX + 1;              // ERROR: arithmetic overflow at compile time
const Y: int32 = 1 / 0;                      // ERROR: division by zero at compile time
const Z: int32 = 1 << 32;                    // ERROR: shift count out of range at compile time

// floats — IEEE, no errors
const W: float64 = 0.0 / 0.0;                // OK — folds to NaN
const V: float64 = 1.0 / 0.0;                // OK — folds to +Inf

// Wrap/Saturate work at compile time
const A: Wrap<int32> = INT32_MAX + 1;        // OK — folds to INT32_MIN (wraps)
const Av: int32 = A.value;                   // -2_147_483_648

const S: Saturate<int32> = INT32_MAX + 1;    // OK — folds to INT32_MAX (clamps)
const Sv: int32 = S.value;

// as result doesn't apply at compile time
const E: int32 = INT32_MAX + 1 as result;    // ERROR — `as result` only recovers from runtime failures
```

**Conclusion.** Compile-time overflow → compile error. IEEE for compile-time float. `Wrap` / `Saturate` work statically. `as result` is runtime-only.

---

### 5.13 Conversions to and from `bool`

**Proposal.** Conversions between `bool` and integer types are **disallowed in both directions**. The patterns these conversions would have covered are expressed using the ternary operator (for `bool → int`) and explicit comparison (for `int → bool`):

```ts
// bool → int — disallowed
const flag: bool = true;
const n = int32(flag);            // ERROR — no bool → int conversion

// canonical form
const n = flag ? 1 : 0;

// int → bool — disallowed
const back = bool(n);             // ERROR — no int → bool conversion

// canonical form
const back = (n != 0);
```

`bool` and integers do not implicitly or explicitly convert. The cast-syntax form `int32(boolValue)` does not exist, even though it would be syntactically symmetric with other call-style casts.

**Reason.** Two-direction prohibition is the symmetric and consistent choice:

- The `int → bool` direction has no natural rule. C's "zero is false, non-zero is true" is the source of countless implicit-truthiness bugs. Any other rule (only `1` is true, only `0` is false, everything else is invalid) creates a different footgun.
- The `bool → int` direction has a well-defined mapping (`true → 1`, `false → 0`), but allowing one direction without the other is inconsistent. The cost of writing `flag ? 1 : 0` is one character longer than `int32(flag)` and removes any ambiguity at the call site.
- Symmetric prohibition aligns with `bool` being a *non-numeric* primitive in [§6](#6-other-primitive-types-bool-char-void). Bool is a logical type with two states, not a one-bit integer.

This rule does not affect bitwise operations on bool (which Delta does not provide — `&&` / `||` / `!` are boolean-only per [§3.13](#313-operators)) or boolean-to-flag packing in FFI scenarios (which use the ternary form).

**Examples.**
```ts
// canonical bool → int via ternary
const isOpen: bool = true;
const cFlag: int32 = isOpen ? 1 : 0;        // for C FFI passing an int flag
const cFlag: int32 = isOpen ? 1 : 0;        // same shape, all bool → int sites

// canonical int → bool via comparison
const errno: int32 = readErrno();
const hasError: bool = errno != 0;

const refCount: uint32 = obj.refs;
const isAlive: bool = refCount > 0;

// disallowed forms — no implicit, no explicit
const n: int32 = flag;                       // ERROR — no implicit conversion
const n: int32 = int32(flag);                // ERROR — no explicit conversion either
const b: bool = 1;                           // ERROR
const b: bool = bool(1);                     // ERROR
```

**Conclusion.** Bool and integer do not convert in either direction. Ternary for one direction, comparison for the other.

---

### 5.14 `intsize` and `uintsize`

**Proposal.** `intsize` and `uintsize` are the pointer-width signed and unsigned integer types on the target platform.

- **Width:** on a 64-bit target, `intsize` is 64-bit and `uintsize` is 64-bit. On a 32-bit target (post-MVP), each would be 32-bit. MVP supports only 64-bit targets per [§2.14](#214-explicit-non-goals-for-section-2).
- **Nominal distinctness:** `intsize` is *not* a structural alias for `int64`, even on 64-bit targets where the widths coincide. Conversion in either direction requires an explicit cast: `int64(sizeValue)` or `intsize(int64Value)`.
- **Canonical use sites:** all length, size, capacity, and index types in the standard library use `uintsize`. `Array<T>.length`, `Slice<T>.length`, `string.byteLength`, `Map<K, V>.size`, `sizeof<T>()` — all `uintsize`. Array indexing requires `uintsize`.
- **Underflow behavior:** `uintsize` arithmetic follows the trap-on-overflow rule. `arr.length - 1` on an empty array panics rather than wrapping to a huge value.
- **Constants:** `INTSIZE_MAX`, `INTSIZE_MIN`, `UINTSIZE_MAX` are target-dependent compile-time constants.
- `intsize` exists primarily for FFI with `ptrdiff_t` and for pointer-difference arithmetic; application code rarely needs it directly.

**Reason.** Nominal distinctness is the load-bearing decision. A structural alias for `int64` on 64-bit would *seem* to make 64-bit code "just work" — but the same code would silently break on 32-bit when `intsize` quietly became `int32` and every implicit conversion to `int64` started failing. The cost of explicit conversion at every cross-type site is the upfront tax that buys cross-target portability; bugs that ship today on 64-bit are caught at the source level when post-MVP brings 32-bit targets online.

Unsigned (`uintsize`) for length / size / index types eliminates the "negative length" representation entirely. Combined with trap-on-underflow, this catches `arr.length - 1` on an empty array at the point of the bug rather than several lines later when the bad index is dereferenced. Languages that use signed length types (Java, C#) pay for this with class-of-bug litigation that Delta sidesteps by construction.

**Examples.**
```ts
const arr = new Array<int32>();
arr.push(10);
arr.push(20);

const len: uintsize = arr.length;            // length is uintsize
const total: uint64 = sum;
const combined = len + total;                // ERROR — uintsize and uint64 are distinct
const combined = uint64(len) + total;        // OK — explicit

// indexing requires uintsize
const i: uintsize = 0;
const value = arr[i];                        // OK
const j: int32 = 0;
const value = arr[j];                        // ERROR — index must be uintsize

// underflow traps
const empty = new Array<int32>();
const prev = empty.length - 1;               // panic — uintsize underflow

const prev = empty.length - 1 as result;     // recoverable
check result { /* empty array */ }

// target-dependent constants
const max = INTSIZE_MAX;                     // INT64_MAX on 64-bit targets
const umax = UINTSIZE_MAX;                   // UINT64_MAX on 64-bit targets

// literal-fits-target works
const x: intsize = 1024;                     // OK — literal adopts intsize
const y: uintsize = 0;                       // OK
```

**Conclusion.** `intsize` and `uintsize` are pointer-width, nominally distinct from `int64` / `uint64`, used for all length/size/index types, with trap-on-underflow guarding length math. MVP is 64-bit-only; the type system is forward-compatible with future 32-bit targets.

---

### 5.15 The Panic Mechanism

**Proposal.** Every trap site in §5 — and every other runtime safety check in the language (bounds checks per [§38](#38-bounds-checking), divide-by-zero, etc.) — shares one panic mechanism with the following properties:

- **Not catchable.** A panic prints a diagnostic to stderr, runs an optional pre-abort hook, then calls `abort()` with non-zero exit code (134 by SIGABRT convention). User code cannot intercept, recover from, or resume past a panic.
- **One global pre-abort hook:** `runtime.setPanicHook(handler: (info: PanicInfo) => void): void`. Runs before abort; can log, flush buffers, send crash reports. Cannot prevent the abort.
- **Diagnostic format:** the panic message includes the failure kind, source location (file and line via `#line` directives from [§2.8](#28-source-mapping)), and the function name. A backtrace is included by default in `--debug`, suppressed by default in `--release-safe` and `--release`. The `DELTA_BACKTRACE=1` environment variable forces backtrace on for release builds.
- **Cross-FFI behavior:** a panic that occurs in Delta code consumed from C aborts the entire process. C callers cannot intercept the panic. Delta libraries that need to surface failures across the FFI boundary must declare their exported functions as fallible (e.g., `int32 | SomeError`) and translate errors into C-friendly return codes; C never sees Delta panics.
- **Optimizer constraint:** the compiler **never** assumes a panic is unreachable. Code paths that would panic are treated as live for the purposes of code motion, dead-code elimination, and aliasing analysis.

**Reason.** A non-catchable panic preserves Delta's "errors are values in a typed channel" stance from [§19](#19-fallible-function-signatures). A second, untyped, unwinding error channel would compete with the typed channel and re-introduce the "hidden control flow" that [§19](#19-fallible-function-signatures) explicitly rejected.

The legitimate use case for "isolate this operation that might fail" is already served by [§5.5](#55-recoverable-failures-via-as-result)'s `as result` form. If a user wants to recover, they write `as result`; if they didn't, the panic is by definition an unrecoverable bug.

Cross-FFI process-abort matches the "no unwinding through C frames" rule. Unwinding through foreign frames is the source of essentially every "ABI mismatch between exception models" bug across C++ / Rust / Swift; making it impossible by construction is the simplest correct design.

The non-reachability optimizer constraint is what guarantees that trap-by-default does not silently become UB. C compilers exploit "undefined behavior implies the program reached an impossible state" to eliminate code that exercises the check; Delta forbids this exploitation, so a trap site is always live and the panic always fires.

**Examples.**
```
$ ./build/release/bin/my-app
delta panic: arithmetic overflow in `*`
  at src/parser.delta:142
  in function parseLength(int32, int32) -> int32

# in --debug, includes backtrace by default:
$ ./build/debug/bin/my-app
delta panic: arithmetic overflow in `*`
  at src/parser.delta:142
  in function parseLength(int32, int32) -> int32
backtrace:
  0: parseLength    at src/parser.delta:142
  1: parseRecord    at src/parser.delta:67
  2: main           at src/main.delta:14

# release build with env override:
$ DELTA_BACKTRACE=1 ./build/release/bin/my-app
(backtrace included)
```

```ts
// optional pre-abort hook
import { runtime } from "std";

function logCrash(info: PanicInfo): void {
  fs.writeText("/var/log/myapp/crash.log", info.message);
}

function main(): int32 {
  runtime.setPanicHook(logCrash);
  // ... rest of main
  return 0;
}
```

**Conclusion.** Single non-catchable panic mechanism. Diagnostic with source location; backtrace conditional on mode and `DELTA_BACKTRACE`. One global pre-abort hook. Cross-FFI panics abort the process. The optimizer never assumes a panic is unreachable.

---

### 5.16 Explicit Non-Goals for Section 5

The following are deliberately out of scope, either deferred to a later section or excluded permanently:

- **Implicit numeric conversion** of any kind (widening, narrowing, sign change, int-to-float, float-to-int, bool-to-int, char-to-int) — never. Every conversion is a call-style cast per [§3.8](#38-type-conversions-and-the-as-keyword).
- **Silent wrap on overflow in release mode** — never. Trap is mode-uniform.
- **The optimizer assuming an overflow check is unreachable** — never.
- **A `checked` keyword or `checked(expr)` macro form** — never. `as result` is the unified recoverable-failure binding form.
- **Mixed-failure expressions bound with a single `as result`** — never. Split into separate bindings.
- **`as result` on provably-infallible expressions** — never. Hard compile error.
- **`as result` recovering from a compile-time-known failure** — never. Compile-time failures are compile errors.
- **User-defined transparent type tags** (analogs of `Wrap<T>` / `Saturate<T>` on user types) — post-MVP. The MVP closes the precedent at the two std-defined types.
- **`Wrap<T>` / `Saturate<T>` on `float`, `bool`, `char`, or any non-integer type** — never.
- **Cast constructors propagating tag semantics into their argument expression** — never. Use the binding-target form for whole-expression wrap or saturate semantics.
- **Mixing `Wrap<T>` and `Saturate<T>` in one expression** — never. Hard error.
- **`.wrappingAdd` / `.saturatingMul` / `.wrappingFrom` / `.saturatingFrom` method families** — never. `Wrap<T>` and `Saturate<T>` cover both arithmetic-tag and cast-constructor roles.
- **Fast-math** (reassociation, finite-math, reciprocal approximation) at any granularity — post-MVP. MVP is strict IEEE 754.
- **Compile-time errors for float NaN / Inf production** — never. IEEE folding applies at compile time too.
- **`bool ↔ int` conversion in either direction** — never.
- **`>>>` unsigned-shift-on-signed operator** — post-MVP. Use `int32(uint32(x) >> count)`.
- **Implicit shift-count masking** (C-style or Java-style) — never. Out-of-range counts trap.
- **`intsize` as a structural alias for `int64`** — never. Nominally distinct.
- **Signed length / size / index types in the standard library** — never. All `uintsize`.
- **Catchable panics, panic recovery, `try` / `catch_unwind` / `recover`** — never.
- **Panic unwinding across the FFI boundary** — never. Cross-FFI panics abort.
- **`int.MAX` / `float64.NaN` type-static-field form** — never. Global constants and compiler intrinsics instead.
- **`@fast_math` or any other `@`-prefixed decorator** — never. The decorator syntactic category is deleted; see the note on downstream sections below.
- **Type suffixes on numeric literals** (`42i32`) — never (already established by [§3.11](#311-numeric-literals)).

---

**Note on downstream sections.** This rewrite of §5 has knock-on effects elsewhere in the spec:

- **[§6](#6-other-primitive-types-bool-char-void)** — `char ↔ int` conversion rules are deferred to this section. The §5 prohibition on `bool ↔ int` stands.
- **[§31](#31-generics--constraints) and [§52](#52-mvp-compiler-scope)** — MVP scope is amended: standard-library-only generic types and standard-library-only operator overloading land in MVP. User-defined generics and user-defined operator overloading remain post-MVP. The locked overloadable operator set is `+ - * / % ^ & | << >> == != < > <= >=` (no `=`, `&&`, `||`, `!`, or custom operators).
- **[§38](#38-bounds-checking)** — uses the same panic mechanism as §5's trap sites. The §38 elision-proof story is independent but the diagnostic format is shared.
- **[§39](#39-runtime-c-boundary) / [§13](#13-memory-safety-model)** — MVP has no `@trusted` decorator, no `trusted { ... }` block, and no raw-pointer privileges in Delta source; pointer-bearing implementation detail lives below the Delta boundary in generated/runtime C.
- **[§40](#40-c-interoperability)** — `@extern("c")` decorator deleted in favor of the existing `extern "c" { ... }` block form (already specified in §40).
- **[§46](#46-decorators)** — the entire section is **deleted**. The `@`-prefix syntactic category is removed from the language. Each decorator is rehomed: `@extern("c")` → block form in §40; `@repr("c")` and `@packed` → prefix-keyword forms in §47; `@inline` → deleted entirely (the compiler decides inlining). No trusted Delta-source replacement is introduced in MVP.
- **[§47](#47-layout-rules-reprc-packed)** — `@repr("c")` becomes the prefix-keyword form `repr "c" interface Foo { ... }`; `@packed` becomes `packed interface Foo { ... }`. Both keywords compose: `packed repr "c" interface PacketHeader { ... }`.
- **[§49](#49-optimization--build-modes)** — the overflow column in the mode table changes from "Yes / Selected / Selected" to "Yes / Yes / Yes". All three build modes trap on overflow. The optimizer-assumes-no-panic rule stays disabled in every mode.
- **[§52](#52-mvp-compiler-scope)** — MVP scope additions: integer trap semantics, `Wrap<T>` / `Saturate<T>` tag types, `as result` arithmetic recovery form, std-only generics and operator overloading, IEEE-754 floats with float-to-int boundary, panic mechanism, `bitCast<From, To>`, numeric constants in `std/core`. Removed from scope: fast-math, catchable panics, the decorator syntactic category.

These knock-on edits are tracked but not made in this section.

---
