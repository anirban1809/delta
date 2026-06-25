# Ergonomics & Improvement Ideas

Working notes. Each entry is a candidate change with a current decision and rough rationale, to be polished against the spec sections later. Format: **Status** (Accepted / Rejected / Open) — short pitch — rationale — affected sections.

---

## Decided

### 1. `forward result` statement — **Accepted**

Add a `forward result` statement that propagates the error of a pending fallible binding to the caller unchanged. Composes with existing `check result { ... }`:

```ts
const y = doBackup() as result
forward result          // propagate error up; on success, `y` is bound below

const z = doBackup() as result
check result { return error as MyError { ... } }   // handle / transform / wrap
```

**Why:** Removes the dominant boilerplate in real code — the recurring `check result { return error as XError { code, message: result.error.message, ... } }` shape that shows up on every fallible call. Stays inside the design rules that made the spec reject `?` / `try`: the return is on its own line (no hidden control flow), no `Result<T,E>` wrapper, no `try` block.

**Design details to nail down:**
- **Type rule:** `forward result` only compiles when the enclosing function's return type already admits `result`'s error type. No silent widening. Diagnostic shape: *"cannot forward `IOError`; this function returns `Success | NetError`."*
- **Desugaring:** equivalent to `check result { return error as <inferred> { ...result.error... } }`. No new analysis; automatic disposal (§33), pending-value rules (§14.10), and move-state at merges (§14.5) all keep working unchanged.
- **No transformation.** If you need to add context, change the code, or wrap, you must use `check`. `forward` is strictly identity-propagation. That's what keeps it cheap to read.
- **Grammar:** spell the binding name (`forward result`) to mirror `check result { ... }`.

**Affected:** §13.7, §22 (consuming fallible calls), §26 (error handling). Add to §14.12 cross-section alignment that pending bindings can also be `forward`ed.

---

### 2. `&` → `ref` — **Rejected**

Considered shortening `&` / `edit &` to `ref` / `edit ref`.

**Why rejected:**
- `ref` carries the wrong semantic baggage from C# (mutable pass-by-ref, no aliasing rules), C++ (`&`), Rust (`&` / `&mut`). None match Delta's "non-owning, call-scope, exclusivity-checked, non-null" semantics. Readers from those languages will project the wrong rules onto it.
- The rest of the language consistently chooses teaching over terseness (`function`, `const`/`let`, `interface`, `edit &`). Picking the short word here breaks the pattern.
- `function length(v: &Vec3)` reads as English ("v is a referenced Vec3"); `ref Vec3` doesn't.
- IDE autocomplete neutralizes the typing-cost argument; the visual density of `&` is part of how the model gets taught.

**Compromise if revisited:** `borrow` (drop `-ed`) — 6 chars, still unique-to-Delta vocabulary, still reads as English. But leaving it as `&` is the recommendation.

---

## Open — worth exploring next

### 3. Field-disjoint mutable references

Currently §12.4 keys exclusivity off the **root binding**, so `fillTwo(edit &pair.left, edit &pair.right)` is rejected even when the two fields can't alias. The spec marks field-disjoint analysis post-MVP. Pulling it forward will matter more than almost any other single ergonomic feature — it's the #1 thing Rust users miss when working in a stricter dialect, and root-level rejection of obviously-safe code is the most common "fighting the checker" complaint.

**Affected:** §12.4, §12.7 (the same rule blocks `normalizePair(line.start, line.end)`).

---

### 4. Panicking `clone!` form — **dropped**

Originally proposed for "consistency with §13.7's panic-by-default pattern (arithmetic, indexing)." That reasoning is wrong: [§13.8](spec-sections/13-memory-safety-model.md) deliberately pulls allocation-facing APIs out of §13.7's tier into a stricter "must be visibly acknowledged" category. Allocation is not in the same bucket as bounds checks.

With `forward result` (#1), the three real intents are already covered without a new operator:

| Intent | Spelling |
|---|---|
| Handle / transform / wrap | `clone x as result` + `check result { ... }` |
| Propagate unchanged | `clone x as result` + `forward result` |
| Crash (genuinely correct) | `clone x as result` + `check result { panic("...") }` |

The explicit `check result { panic(...) }` form is better than a `!` suffix would have been — the "I'm choosing to crash here" decision is visible to the reviewer, matching Delta's "no hidden control flow" stance. A `!` suffix would have hidden it.

The signature-virality cost (every function that clones picks up `| AllocError`) is real but is exactly what §13.8 is asking for. Adding `clone!` would give users a way to silently dodge that, undermining §13.8's intent.

---

### 5. Multi-bind shared `check` block

Today each `as result` introduces a fresh `check` requirement. A common shape in real code is "do three fallible things, bail on any of them":

```ts
// Current
const a = step1() as result
check result { return error as X { ... } }
const b = step2() as result
check result { return error as X { ... } }
const c = step3() as result
check result { return error as X { ... } }
```

Possible shorthand — bind several, discharge once:

```ts
const a = step1() as result
const b = step2() as result
const c = step3() as result
check result { return error as X { ... } }   // covers a, b, c
```

The lexical-visibility rule still holds (the `check` block is right there) but the boilerplate collapses. Open question: how does this interact with the §14.10 "pending values can't be used" rule when `a` and `b` are pending in the lines between? Likely fine — they stay pending until the trailing `check` discharges them all. Needs a careful read of §22 before committing.

(With `forward` from #1, the common case `forward result` after each call already shrinks this a lot — so the multi-bind form is mostly for the *transforming* case.)

**Affected:** §22.

---

### 6. `defer` for non-`Disposable` cleanup

Automatic disposal (§33) handles owned resources. But sometimes you want cleanup that isn't tied to ownership: emit a metric, log a span end, decrement a counter, restore a flag. Go's `defer` covers this — write the cleanup at the point of acquisition, runs on every exit path.

```ts
metrics.startTimer("backup")
defer metrics.stopTimer("backup")    // runs on every return / panic / forward path
```

Composes with §6.9 exit-path terminators and the existing disposal machinery. Strictly additive — doesn't change ownership rules.

**Affected:** new section, cross-aligns with §6.9, §33.

---

### 7. Named arguments at call sites

For functions with many parameters (especially booleans), positional calls are unreadable. TS works around this with object-destructuring parameters; Delta could support native named arguments without that ceremony:

```ts
function openFile(path: stringview, write: bool, truncate: bool, create: bool): File | IOError;

openFile("/tmp/x", true, false, true)                                   // unreadable
openFile(path: "/tmp/x", write: true, truncate: false, create: true)    // clear
```

Rules to think through: ordering (must match? any order?), mixing with positional (allowed for prefix only?), interaction with default parameter values, interaction with overload resolution.

**Affected:** new section near §3 / function declarations.

---

### 8. Library shape, not language rules

Stdlib ergonomics has more leverage on day-to-day "felt friction" than any single language feature. Concretely:

- Collections, string APIs, and parsers should take `&` / view parameters by default, not by-value owned.
- Builders should return `edit &Self` for chaining instead of moving `self`.
- Iteration APIs should expose `&T` items, not owned.

Get this right early and users will pass `&x` constantly without thinking about it — most "fighting the reference checker" in Rust is actually "fighting the stdlib's by-value APIs."

Not a spec change; a guideline for whoever writes the std.

---

### 9. Fix-it diagnostics with applicable edits

Rust became tolerable in 2018–2020 not because rules relaxed but because `rustc` started saying *"help: consider referencing here: `&value`"* with a copy-pasteable suggestion. The single highest-leverage ergonomic investment for Delta is making the eventual checker emit applicable suggestions:

- "insert `move`"
- "add `as result` + `forward result`"
- "this would work with `clone x as result`"
- "reference originates here; consider `clone` to obtain an owned value"

Pair with LSP quick-fixes. The felt experience of the checker is completely different when 80% of errors come with a one-keystroke fix. Not a spec change; a checker / LSP work item.

---

### 10. Optional chaining `?.` — **stale / needs reconciliation**

This entry was written against a prior version of the spec that still had `T?` and §18 Null Safety. [§3.9](spec-sections/03-basic-syntax-and-variable-bindings.md) now explicitly removes nullability ("`T?` is not part of the grammar. The literal `null` is not a keyword. This removes §18 from the language entirely"). Absence is modeled exclusively as fallible-signature errors (`T | NotFoundError`) consumed with `as result` + `check`.

So `?.` has nothing to chain: there is no `null` to short-circuit on, and the "deeply nested optional access" pattern doesn't exist — at each step that might be absent, you bind with `as result` and either `check` or `forward`.

If a "navigate through a chain of possibly-failing lookups" ergonomic problem still exists in practice (e.g. nested `Map.get` calls), the right shape is probably a **chained-fallible-access** sugar that desugars to nested `as result` + `forward`, not optional chaining. Defer until a real codebase shows the pattern is painful.

**Action:** leave this entry until the design discussion above lands; do not implement as written.

---

### 11. Range expressions `0..n` / `0..=n` and slice syntax `arr[i..j]`

Three places this matters:

```ts
for (const i of 0..count) { ... }          // iteration
for (const i of 0..=count) { ... }         // inclusive
const middle = arr[1..5];                  // returns Slice<T>
```

The semantics largely fall out of existing pieces: `arr[i..j]` returns `Slice<T>`, which already has defined ownership/exclusivity rules via `uses View of S` (§12.4). Range expressions themselves can be a built-in `Range<T>` view type. Mostly a grammar addition; the type-system work is already done.

**Affected:** §3.13 (operators), §12, possibly §38 (bounds checks apply on slice creation).

---

### 12. Trailing closure / lambda syntax

For the common "last argument is a callable" pattern, lift the lambda outside the parens:

```ts
xs.forEach { item -> console.writeLine(item); }
xs.filter { x -> x > 0 }.map { x -> x * 2 }
```

Big win in iteration-heavy and builder-style code. Syntactic only — interacts with §44 lambda-capture rules (deferred) but doesn't require them. Open question: parameterless form (`xs.run { ... }`) and how it interacts with method-call grammar.

**Affected:** §44 (function types & lambdas).

---

### 13. Spread / rest `...`

```ts
function log(prefix: stringview, ...values: Slice<int32>): void { ... }
log("nums", 1, 2, 3);
log("nums", ...existingSlice);

const updated = { ...original, name: "new" };       // object spread
```

Common TS feature. Ownership questions to settle:
- Variadic parameter is probably `&Slice<T>` by default, not owned.
- Object spread interacts with copyability — copyable fields copy, owned fields would need explicit `move`/`clone` per field, or the spread is rejected.

**Affected:** §3 (function parameters), §8 (type literals), §14 (ownership rules at spread sites).

---

### 14. Object literal property shorthand `{ x, y }`

```ts
const point = { x, y, z };                              // = { x: x, y: y, z: z }
return error as IOError { code: "io.read", message, path };  // partial shorthand
```

TS has this. Likely intended but I didn't find it called out in §3 or §8 — confirm it's implicit or specify it explicitly. Low-risk, high-frequency win.

**Affected:** §8 (type literals), §3 (object-literal grammar).

---

### 15. Bounded integer types `int32<lo..hi>` *(longer-term)*

Speculative response to "stop integer overflow at compile time." Today, §5.12 already promotes overflow in *const* expressions to compile errors. For runtime arithmetic, the compiler has no way to prove `a + b` won't overflow without value-range information.

Ranged integer types would let the compiler prove some arithmetic safe statically — Ada has them; refinement types in F* generalize the same idea. Significant addition (range arithmetic in the type checker, narrowing on `if` bounds checks, interaction with `Wrap<T>`/`Saturate<T>`). Park here so it isn't forgotten; not a near-term proposal.

**Affected:** §5 broadly; new section.

---

### 16. `==` / `!=` for byte-equal string comparison

[§7.10](spec-sections/07-string-family-types.md) currently bans `==` on strings and forces `s.equals(other)`. The spec's argument — locale/normalization ambiguity — is correct in principle but doesn't justify a compile-time ban; it justifies *picking the right default*. §7.10 already commits to byte equality as the only equality the language can guarantee without linking Unicode tables; make `==` mean exactly that.

`equalsNormalized` / `equalsIgnoreCase` stay in `std/unicode` for the cases where the developer wants something richer. Same-family-type rule applies (mixed-type `s == cs` stays an error).

**Why:** every TS / Java / C# / JS dev reaches for `==` on strings constantly. The forced method form is the single biggest unexpected paper cut for migrants, with no compensating safety win — the byte-equality default is already what `.equals()` does.

**Affected:** §3.13, §7.10.

---

### 17. `+` for string concatenation between same-family types

[§3.13](spec-sections/03-basic-syntax-and-variable-bindings.md) and [§7.11](spec-sections/07-string-family-types.md) ban `+` on strings. The two arguments don't survive scrutiny in Delta:

1. *"What's the type of `1 + '2'`?"* — already a compile error from §3.13's same-type operand rule. The cross-type footgun the ban prevents doesn't exist here.
2. *Quadratic concat loops (`s = s + piece` inside a loop) are pathological.* — Real, but a lint that warns on `+=` on strings inside loop bodies catches it without removing the operator from one-shot concat sites.

Allow `+` between two values of the same string family type; lower to the template-literal equivalent (one allocation, sized from operand byteLengths). Cross-family `+` (`string + cstring`) stays an error.

**Affected:** §3.13, §7.11.

---

### 18. `using` block for scoped resource lifetime

Sharpens the speculative `with` entry below. [§9.7](spec-sections/09-classes.md) says *"to bound a value's lifetime more tightly, extract the region into its own function"* — that's a function call's ceremony for what Java (`try-with-resources`), C# (`using`), and Python (`with`) handle in one line:

```ts
using file = File.open(path) as result {
  check result { return 1; }
  // ... use file ...
}                              // file disposed at block exit
```

Distinct from `defer` (#6): `defer` registers cleanup at function exit; `using` block *is the lifetime*. Both have real demand. `using` is for tightening an owned value's scope; `defer` is for cleanup unrelated to ownership.

**Affected:** §3.4 (add to scope-creating constructs), §9.7 / §33.

---

### 19. Fluent method chaining via `edit &Self` returns

[§12.1](spec-sections/12-safe-references.md) forbids referenced returns in MVP, so `b.append("x").append("y").finalize()` is structurally impossible — every builder method must be its own statement. Java / C# / JS / TS lean on fluent builders heavily; [improvement-ideas.md #8](improvement-ideas.md) (library shape) even calls for builders to *return* `edit &Self`, which the spec then forbids.

Pull forward the *narrowest* useful case: an `edit` method may return `edit &Self` (the receiver itself), and only the receiver. Not field paths; not derived views. No general lifetime parameters needed — the receiver is the reference source, not derived from it, so the §13.6 fresh-derived-view escape rule isn't triggered.

```ts
let b = new StringBuilder();
const s = b.append("user=").append(name).append(", id=").finalize();
```

**Affected:** §12.1, §12.11 (move "referenced return values" off the never-MVP list — narrowly), §14.

---

### 20. `new` keyword and dedicated constructor — **Rejected**

Confirmed: Delta will not have a `new` keyword or a dedicated `constructor` form. Stdlib generic containers will use `.create()` (or whatever named static factories make sense per type) for consistency with user classes.

**The spec inconsistency to fix:** [§3.1](spec-sections/03-basic-syntax-and-variable-bindings.md) / [§4.5](spec-sections/04-type-inference.md) examples currently use `new Array<int32>()`, `new Map()`, `new StringBuilder()`. [§9](spec-sections/09-classes.md) says user classes have no `new`. Rewrite the stdlib examples to drop `new`. `Array<int32>.create()`, `Map<K, V>.create()`, `StringBuilder.create()`. One rule across the language.

**Why `new` was rejected.** In Java/C# a constructor is conventionally infallible — failures use exceptions. Delta has no exceptions ([§13.11](spec-sections/13-memory-safety-model.md)) and [§13.8](spec-sections/13-memory-safety-model.md) requires allocation-facing APIs (which most constructors are) to be visibly fallible via `as result`. The only coherent way to bolt `new` onto this is to make `new ClassName(...)` itself a fallible expression:

```ts
// Static factory (chosen)
const f = File.open("log.txt") as result
check result { return 1; }

// `new` + fallibility (rejected)
const f = new File("log.txt") as result
check result { return 1; }
```

Same line count, same semantics. `new` contributes zero information the type system doesn't already carry. Worse, `new` *removes* the ability to name distinct construction paths: a class with `open`, `openOrCreate`, `create`, `fromFd`, `parse` static functions cannot be expressed via `new` without overloading by parameter type — which collapses when two paths take the same input shape (`open(stringview)` vs `create(stringview)`). Static factories disambiguate by name; constructors can't. This is exactly the argument *Effective Java* item 1 makes — modern Java/C# codebases already favor static factories for non-trivial construction.

**Affected:** §3.1, §4.5, §9.1, §37 (collection constructors).

---

### 21. Generics: a small, deliberately-bounded subset (not the C++/Rust kitchen sink) — **Accepted (direction); details Open**

Decision: Delta keeps generics, but a tightly-restricted subset. We considered dropping generics and generic-like syntax *entirely* and rejected it — not because generics are harmless, but because "drop entirely" doesn't actually remove parametricity, it **scatters** it. Intrinsic generic arrays, intrinsic generic maps, `Option`/`Result`, and the interface-arm devirtualization pass are all parametric. The real choice is "one uniform generic mechanism" vs "four special-cased intrinsics that each behave a little differently and don't compose." We take the uniform mechanism, capped hard.

**Why a subset and not nothing.** The starting motivation was "generics are abused and hurt readability." But the abuse lives in *specific* features (HKT, conditional types, specialization, associated-type projections), not in `List<int>` or `Option<File>`. And the alternatives we walked through each collapse back into generics anyway:
- Tagged/concrete unions are **closed** — they can't express an open container (`List<T>` would require enumerating every element type up front).
- Interface arms in a union are **open** but force boxing + vtable (a trait object), and lose exhaustiveness.
- Call-site monomorphization ("look at where concrete types flow in, generate C accordingly") *is* generics with the `<T>` made implicit — and it can't handle runtime-varying concrete types (`let v: B = cond ? foo() : bar()`) or separate compilation. So it can only be an **optimization**, not the semantics.

**IN (the minimal coherent system):**
- Type parameters on **type definitions** — generic structs and unions: `List<T>`, `Option<T>`, `Result<T, E>`. Payoff: array / map / `Option` / `Result` become ordinary library types written in Delta, not compiler magic, and users can write `Set<T>`, `RingBuffer<T>`, ordered maps, trees.
- Type parameters on **functions** — `function first<T>(xs: List<T>): T`.
- **Flat bounds, two kinds only:** ownership tiers (existing `<T>` / `<clone T>` / `<unique T>`) and interface bounds (`<T: Hashable>`, needed for map keys). A type parameter carries a flat list of bounds — nothing more.
- **Monomorphized lowering** — each instantiation stamps out concrete C. This unifies the two polymorphism stories: **generics = static/monomorphized; interfaces = dynamic/boxed**; the programmer chooses. The call-site concrete-type collection becomes a *devirtualization optimization* that erases the box when flow analysis proves a unique type, falling back to the boxed trait object otherwise.

**OUT (hard exclusions — write these into the spec as normative "never," not "later," or the slope reappears):**
- No higher-kinded types (`F<_>`, generic-over-type-constructors). This single exclusion is what keeps us out of Haskell/Scala unreadability.
- No associated types / type projections (`T::Item`). Bounds say "T implements I," full stop.
- No conditional / computed types (`T extends U ? X : Y`).
- No specialization / overlapping impls.
- No const/value generics (`[N: usize]`), no variance annotations, no where-clause soup / bounds-on-bounds.

Net result is essentially **Go 1.18-style generics** — proof that "small generics" is a stable, shippable design point and not a slippery slope, *provided the cut list is normative.* Taking it now (rather than shipping without and bolting it on later) avoids Go's exact retrofit seam.

**The deciding question (recorded in case we revisit):** *will users ever need to define their own typed data structures, or is `array + map + unions` enough forever?* We answered "they will" — given ownership tiers, the heap-indirection phase, and the self-hosting ambition, user-defined containers are inevitable, so the blessed-intrinsic-only path (Option 1) would force a later reversal.

**Still Open / to nail down later:**
- Exact surface syntax for bounds (combining tier + interface bounds in one list).
- Interface-arm-in-union rules from the prior discussion: boxed, **dispatch-only (no downcast → no RTTI, consistent with no-`any`)**, and a **disjointness rule** for arms (a value satisfying two interface arms is ambiguous — likely forbid).
- The owned-vector vs borrowed-slice split (`Vec<T>` owns its buffer / `[]T` is a lifetime-tied view) — a consequence of no-GC + ownership; ties into Phase F/G/H.
- `Hashable` (and later `Ord`) interface for map keys ships together with intrinsic maps, not separately.
- Where the devirtualization/monomorphization pass lands in the analyzer→emitter pipeline (a specialization step between type analysis and C emission, not a required global instantiation phase).
- Reconcile with the self-hosting plan's **OO-AST** assumption — with generic unions available, the AST may want to be a union, not an OO hierarchy.
- Code-size / compile-time budget for monomorphization (N copies per instantiation).

**Affected:** new top-level generics section; §12 (Vec/slice split), §30 (unions), §37 (collections), the self-hosting plan doc, and the ownership-tier bound syntax in §14.

---

## Worth flagging but more controversial

- **UFCS / method-call sugar on free functions** (`5.doubled()` → `doubled(5)`) — lets the std look method-rich without bloating type definitions. Tension with the spec's "each identifier has one role" leaning (e.g. §5.10 rejected `int32.MAX`). Raise for opinion before adding.
- **`this.` elision in method bodies** — real ergonomic win but invites parameter-shadowing bugs. Probably not worth it given `private` field declarations already mark intent.

## Speculative — needs more thought

- **Pipe operator `|>`** for chaining transforms — trendy but real ergonomic win for functional patterns. Conflicts with how postfix-fluent code reads today.
- **`with` block** scoping a `Disposable` to a sub-function-scope so it disposes earlier than function exit. Useful but partially redundant with §33.
- **Sugar for `error as X { code, message: result.error.message, ... }`** — even with `forward`, the *transforming* `check` shape is verbose. A `wrap result as X { context: "..." }` form that auto-fills `code` / `message` from the source error could be worth it.

---

## Rejected outright (do not revisit)

- **Per-build "permissive" / strictness flags** — gives back the safety boundary §13.2 explicitly bought; introduces two-language audit problem. See conversation history for the longer argument.
- **`unsafe { ... }` blocks / `@trusted` modules** — §13.11 already lists these as never-MVP; same two-language argument.
- **`?` / `try` syntax** — supplanted by `forward result` above, which preserves lexical visibility of the return.
- **`copy` operator** — §14.12 already excludes; assignment copies copyable values, `move` transfers, `clone` deep-copies.
- **Drop flags / conditional-move bookkeeping** — §14.12 excludes; static uniformity is load-bearing.
- **Implicit `&` at call sites** — §12.11 excludes; visible capability at the boundary is the point.
- **`if` / blocks / `switch` / `switch type` as expressions** — §3.10 closes this as a never. Use declare-then-assign under definite-assignment.
- **Nullish coalescing `??`** — §3.13 lists it among banned operators.
- **`+` for string concat** — §3.13 banned; use template literals or `string.concat`.
- **`++`, `--`, `**`, comma operator, `in`, `instanceof`** — §3.13 banned.
- **Tagged template literals** — §3 closes as never.
- **Type suffixes on numeric literals** (`42i32`) — §3.11 / §5.16 closes as never.

## Already in the spec (don't re-propose)

Common asks that *look* like ergonomic gaps but are already specced:

- **`T?` nullable types with flow narrowing** — main spec §18.
- **Tagged unions + exhaustive `switch type`** — §30 (referenced from main spec).
- **Template literal interpolation `` `${x}` ``** — §3.12 (produces owned `string`).
- **`_` discard binding** (runs disposal for owned types) — §4.7.
- **Multi-return + destructuring `const a, b = expr`** — §24.
- **Bidirectional one-level type inference** — §4.
