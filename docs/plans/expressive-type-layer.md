# Expressive Type Layer (Experimental)

Status: **Draft / experimental.** A design plan, not yet specced or implemented. It proposes an opt-in family of type-system features that let a `type` carry far more meaning than "a bag of bytes" — value constraints, identity, provenance, physical units, lifecycle state, and absence — all checked at compile time and (almost entirely) erased at runtime.

This layer sits **beside** the capped generics system ([improvement-ideas.md #21](../improvement-ideas.md)), not inside it. Some features (refinement predicates, dimensional units) deliberately reopen a small, bounded slice of what #21 closed. That is intentional and must stay firewalled: each one is admitted as a *fixed, decidable theory*, never as general type-level computation. See [§11 Non-goals](#11-non-goals).

Two features discussed during design — **effect/capability types** and **linear/must-use types** — are explicitly **deferred** and not part of this plan ([§13](#13-deferred)).

---

## 1. The organizing idea

Most real-world data-modeling bugs come from a type that is *too permissive* — it admits values that should be impossible. The goal of this layer is **make illegal states unrepresentable**, across three independent axes:

| Axis | Question it answers | Features |
|------|---------------------|----------|
| **Value** | which *values* are legal? | Refinement types (§3) |
| **Identity** | *what is* this quantity? | Distinct newtypes (§2), Taint & provenance (§5), Units (§7) |
| **Shape & lifecycle** | how is it *structured / used over time*? | Illegal-states modeling & `never` (§8), Typestate (§6) |

The unifying mechanism for most of them is an **erasable annotation**: a piece of compile-time information the checker reasons about and the emitter discards. Refinement predicates erase to nothing; states (typestate/taint) and units erase to their base representation. Runtime cost is paid only where a genuinely-unprovable value crosses a boundary.

Note that **typestate (§6) and taint (§5) are one mechanism — `has states` — applied on two axes** (lifecycle vs provenance); they appear in separate sections only because they answer different modeling questions.

A second unifying idea — the **theory** — governs the features that need real reasoning (refinements, units). A theory is a relation the compiler knows natively, admissible only if it is **total, pure, and decidable**, exposing `{ evaluate, lower, implies }`. This is how expressiveness grows without ever admitting arbitrary compile-time code.

---

## 2. Distinct newtypes — *the foundation*

### Description
Today `type UserId = int32` is a transparent **alias** ([§8.2](../spec-sections/08-type-declarations.md)): a `UserId` is freely interchangeable with any `int32`. A **distinct newtype** has the same representation but is a separate, incompatible type.

```ts
type UserId  = distinct int32;
type OrderId = distinct int32;

function cancel(o: OrderId): void;
cancel(someUserId);   // COMPILE ERROR — distinct types, even though both are int32
```

### Benefits
- Eliminates the single most common data bug: passing a right-shaped, wrong-meaning value.
- Zero runtime cost — a `UserId` *is* an `int32` in the generated C.
- It is the **substrate** for tags (§5), units (§7), and typestate (§6) — all are newtypes plus an annotation. Build this first.

### Composition
Distinct newtypes combine with every other feature:
```ts
type Age = distinct (V >= 0 && V <= 150 where V: int32);   // distinct + refinement
```

---

## 3. Refinement types — *value constraints*

### Description
A refinement type narrows a base type with a **predicate** over its values — the subset type `{ V : T | P(V) }`. To avoid the record-literal collision (a `{ field: T }` RHS already means a struct, [§8.2](../spec-sections/08-type-declarations.md)), the predicate comes **first** and a `where` clause introduces the binder and its base type:

```ts
type NonZero  = V != 0 where V: int32;
type Positive = V > 0 where V: int32;
type Percent  = V >= 0 && V <= 100 where V: int32;
type Email    = V matches regex"^[^@]+@[^@]+$" where V: string;
```

`V` is the binder naming the value under test. Predicate-first means the RHS opens with an expression, so it never reads (or parses) as a record field.

**Grammar / disambiguation.** A type RHS becomes: record (`{…}`), alias/union, or refinement (`Expr where Binder: Type`). With no leading brace, the parser parses a *constraint expression* and commits to "refinement" the moment a top-level `where` appears; otherwise it was an alias/union. The cost is that the type-declaration parser must accept value-operator tokens (`!=`, `>`, `&&`) before `where`.

### The four-tier disposition ladder
How a value reaches a refinement type, in order of preference:

| Tier | How the value arrives | Result |
|------|-----------------------|--------|
| 1 | comptime-provable constant | accepted free; **compile error** if disprovable |
| 2 | flow-narrowed by a guard | accepted free |
| 3 | runtime, predicate implied elsewhere | accepted free |
| 4 | runtime, unprovable | **`as result`** + `check`, then guaranteed |

```ts
const a: Positive = 5;                          // tier 1 — proven (5 > 0)
const b: Positive = 0;                          // tier 1 — COMPILE ERROR (0 > 0 false)

let n = readInt();
if (n > 0) { const p: Positive = n; }            // tier 2 — guard implies predicate

const q: Positive = readInt() as result;         // tier 4 — must discharge
check result { return error as RangeError { }; } // q: Positive, guaranteed below
```

### `as result` for coercions
In tier 4, `as result` attaches to the **coercion into the declared type**, not to a fallible call — a deliberate generalization of "bind the pending error of this expression." It keeps [§13.8](../spec-sections/13-memory-safety-model.md)'s visible-fallibility rule satisfied.
- **Stacked fallibility:** if the RHS is itself fallible, one `as result` captures the union (`ParseError | RefinementError`).
- **Built-in error:** a failed coercion yields a universal `RefinementError` (failed predicate + offending value); the `check` may inspect or transform it.
- **Diagnosed both ways:** omitting `as result` when the coercion can fail is an error (fix-it: insert it); including it when the value is provable is also an error ("this coercion cannot fail").
- **No inline fallible coercions:** the `check` needs statement position, so bind a temporary rather than coercing inside a call argument.

### Predicate theories
The predicate language is a **closed set of theories**, never a hook for user functions (that would be comptime). Admission rule: total + pure + decidable.

- **Integer intervals — *ship first*.** Refined numerics denote intervals; arithmetic propagates them. `Byte + Byte → {0..510}`. Preservation is sound **exactly when the computed interval fits the base type**; otherwise it strips to base (or, if overflow is provable, errors). Subsumes [§5.12](../spec-sections/05-primitive-numeric-types.md) const-overflow and opens **static overflow elimination**.
- **Strings / regular languages.** `matches regex"…"`, `startsWith`/`endsWith`/`length` with constant args. Regex are first-class **literals** spelled `regex"…"` (not `/…/`, to avoid the divide-ambiguity). Known strings checked by a compile-time DFA; runtime strings checked on the `as result` path.

### Refinement subtyping
Because theories are decidable, a narrower refinement flows where a wider one is wanted, by proving **implication**: interval inclusion for numbers, language inclusion for regex.
```ts
function reserve(n: Positive): void;
const x: (V > 10 where V: int32) = ...;
reserve(x);   // OK — (V > 10) ⟹ (V > 0)
```

### Benefits
- **Preconditions become boundary-checked types** — `div(b: NonZero)` makes divide-by-zero a *call-site type error*.
- **Parse-don't-validate, enforced** — validate once at the edge; the guarantee then travels in the type, no re-checking.
- **A path to static overflow safety** via the interval theory.
- **Self-documenting** — the constraint and the documentation are the same artifact, machine-checked, surfaced by the LSP.

### What it expresses
Sign/zero (`Positive`, `NonZero`), bounded ranges (`Percent`, `Port`), modular/alignment (`Even`, `Aligned`), float ranges with free NaN exclusion (`Probability`, `NotNaN = V == V where V: float64`), char classes (`Digit`), struct invariants (`r.left <= r.right where r: Pair`), and string shape (`Email`, `Slug`). **Cardinality** (`NonEmpty = s.len > 0 where s: Slice<T>`) falls out for free, as does **valid flag-mask** (`(V & ~ALL_FLAGS) == 0 where V: int32` — a bitflag set is just a refined integer; the `has`/`with` surface is a stdlib container, not a language feature).

---

## 4. (reserved)

*Refinement cardinality is covered in §3; this section intentionally left as a pointer so numbering matches the axis table.*

---

## 5. Taint & provenance tracking — *provenance*

### Description
Trust and provenance are a **closed set of states** — a value is *Tainted* or *Clean* — so taint tracking uses the **same `has states` mechanism as typestate (§6)**. There is no separate "phantom tag" concept or generic parameter; a tracked value just declares its states like any other state family:

```ts
type Sql = distinct string has states { Tainted, Clean };
```

- `Sql.Tainted` and `Sql.Clean` are distinct state types sharing the `string` representation; they erase to **one** C type.
- Bare `Sql` means *a query in any trust state* — the union `Sql.Tainted | Sql.Clean`.
- State transitions are functions; the only producer of `Sql.Clean` is the sanitizer:

```ts
function readRequest(): Sql.Tainted;            // source: untrusted input
function sanitize(s: Sql.Tainted): Sql.Clean;   // the only Clean-producer
function query(q: Sql.Clean): Rows;             // sink requires Clean
function byteLength(s: &Sql): int32;            // any trust — bare union

const input = readRequest();
query(input);                 // COMPILE ERROR — Sql.Tainted ≠ Sql.Clean
query(sanitize(input));       // OK
```

### How it works
Identical to typestate: distinct sibling state types over a shared representation, checked by nominal type matching, transitioned only by consuming functions. **Changing a state requires a function, never a cast** (`value as Sql.Clean` is forbidden) — otherwise the guarantee leaks like a TS `as`. The difference from §6 is purely *intent*: typestate models a lifecycle (order of operations); taint models a trust property (must pass a sanitizer). Mechanically they are one feature on two axes.

**Optional ordering (lattice):** declare a trust ordering so "more trusted" flows where "less trusted" is accepted — `has states { Tainted, Clean } where Clean <: Tainted`. Ship the plain version first; add the ordering only if real code wants the upgrade direction.

### Benefits
- Turns "untrusted input reached the database" into a **compile error** — injection prevention by construction.
- Generalizes to validation status (`Email` with `{ Unvalidated, Validated }`), encoding (`Text` with `{ Utf8, Latin1 }`), canonicalization (`Path` with `{ Raw, Canonical }`).
- **No new machinery** — it is exactly the §6 mechanism applied to provenance, so taint and typestate cost one feature, not two.

---

## 6. Typestate — *lifecycle*

### Description
Encode an object's **state** in its type so the compiler forbids operations invalid for the current state. States are *not* a generic parameter (`File<State>` reads like an unbounded type parameter — easily confused with `List<T>` — when a lifecycle is really a fixed, closed set). Instead they are **declared as a closed family** on the type:

```ts
type File = distinct { fd: int32 } has states { Open, Closed };
```

- `File.Open` and `File.Closed` are distinct state types that **share** the `{ fd: int32 }` representation.
- Bare `File` means *a file in some state* — the union `File.Open | File.Closed`.
- The state set is closed and declared, so the compiler knows it completely (exhaustiveness in `switch type`; no undefined states like the old `File<AnyTag>`).

Transitions consume `self` (a move) and return the new-state type — Delta's ownership model does the enforcement:

```ts
function open(path: string): File.Open | IOError;
function read(f: &File.Open): Bytes;
function close(f: File.Open): File.Closed;   // consumes Open, yields Closed
function fd(f: &File): int32;                 // any state — takes the union

const f = open("log") as result; check result { return 1; }
const bytes = read(&f);
const closed = close(f);          // f moved → File.Closed
read(&closed);                    // COMPILE ERROR — read needs File.Open
```

### Benefits
- **Reads as a lifecycle, not a parametric container** — no angle brackets, no `List<T>` confusion.
- **Closed, declared state set** → exhaustiveness, and no constructible `File<RandomTag>`.
- **Any-state** operations take bare `File` (the union); **subset-of-states** operations take an explicit union (`File.Open | File.Reading`). Recovers everything the generic form gave, more readably.
- Protocol/lifecycle correctness checked statically: connections, builders that must be finalized, transactions, parsers.
- **Most differentiated feature** for Delta — it rides ownership + moves, which Delta has natively and most languages bolt on awkwardly.
- **Erases completely**: all states share one C struct (`{ fd: int32 }`); the state is compile-time only.

### Notes
- **Shared representation = zero cost.** If states need *different fields*, that is the illegal-states union (§8.1) with a runtime tag — a separate tool. `has states` is the zero-cost, shared-layout variant.
- **Naming:** `File.Open` (dotted, scoped, collision-free) recommended; flat `File_Open` is equivalent if Delta prefers flat names.
- **Same mechanism as taint (§5):** `has states` powers both — typestate (lifecycle) and taint/provenance (trust). They differ only in intent, so there is one feature to build, not two.

### Cost
Moderate — move analysis (already required for ownership) plus the state-family declaration and its union desugaring. Build after distinct newtypes (§2).

---

## 7. Units of measure — *dimensional safety (domain-gated)*

### Description
Attach physical units to numbers, check them at compile time, erase them at runtime. A unit is an **integer-exponent vector** over a fixed basis of base dimensions.

```ts
unit Length = [1, 0, 0]            // basis: (length, time, mass)
unit Time   = [0, 1, 0]
unit Area   = Length * Length      // derived → [2, 0, 0]
unit Speed  = Length / Time        // [1, -1, 0]

type L = float64 as Length;
type A = float64 as Area;

const x: L = 3.0;        // literal is unit-polymorphic → adopts Length
const y: L = 4.0;
const z   = x * y;       // z : A          ([1]+[1]=[2])
const ok  = x + y;       // L              (Length + Length = Length)
const r   = x / y;       // float64        (dimensionless drops the unit)
const bad = x + 5.0 as Time;   // COMPILE ERROR — [1,0,0] ≠ [0,1,0]
```

### Rules
1. **Numeric literals are unit-polymorphic** — they adopt the annotated unit (`const x: L = 3.0`).
2. **No implicit unit change** between already-unit'd values; convert explicitly.
3. **Attaching a unit to a raw computed float is explicit** (`expr as Length`).
4. **Unit identity is structural** (the exponent vector); names are labels. *This is a deliberate exception to §8's "nominal identity is the only identity," and is required — without it `x * y` could not be recognized as `Area`.*
5. **Arithmetic:** `+ -` require equal vectors (result same); `* /` add/subtract vectors; `^n` scales by a const int; `<`/`==` require equal vectors.
6. **Dimensionless `[0,…]` ≡ plain `float64`** — units drop when they cancel.
7. **All units erase** to the base numeric type in C — zero runtime cost.

The dimensional algebra is a **theory** (fixed, total, decidable: vector add/subtract/compare), not general type computation — that is what keeps it inside the #21 firewall.

### Benefits
Prevents an entire class of catastrophic and everyday bugs — the Mars Climate Orbiter (N·s vs lbf·s) and Gimli Glider (kg vs lb) classes, plus radians/degrees, bits/bytes, seconds/millis, and dimensionally-wrong formulas (`0.5*m*v` flagged as not-Energy).

### Design caveat (why it's domain-gated)
Delta's capped generics mean units **cannot** be a library (unlike C++/Rust, whose const generics/typenum host the algebra) — it's *built-in or nothing*. Most day-to-day unit *safety* is actually covered by **distinct newtypes** (§2: "don't mix USD and EUR," "don't mix s and ms"). The dimensional *algebra* (auto `Length*Length=Area`, formula checking) only pays off in scientific / engineering / simulation / robotics code. **Recommendation:** ship it behind the experimental gate and graduate it only if "Delta for numerical/engineering work" is a goal the project actually holds; otherwise newtypes suffice. Scale-siblings (m vs km, s vs ms) are modeled as *distinct base units* with explicit conversions (no silent scaling). **Affine units** (°C/°F offsets, calendar dates) are a known boundary — multiplicative dimensional analysis doesn't model offsets for free.

---

## 8. Illegal-states modeling and `never` — *shape*

### 8.1 Make illegal states unrepresentable
The highest-leverage *use* of Delta's existing tagged unions ([§8.13](../spec-sections/08-type-declarations.md)) + `switch type`: model each state as a variant carrying **only** the fields valid in that state, instead of a flat record with contradictory optional fields.

```ts
// BAD — booleans/fields that can contradict
type Conn = { connected: bool; addr: string; error: string };
// GOOD — states that cannot be malformed
type Conn = Disconnected | Connected | Failed;
type Connected = { addr: string; since: Timestamp };
type Failed    = { error: string };
```

This is also Delta's answer to **optional data** (see §8.3): a field that may be absent is modeled by *structure* (a variant that lacks it), not by a nullable sentinel.

### 8.2 The `never` type
`never` is the return type of a function that **always takes an exit path** — it ends in `panic`, `process.exit`, or a call to another `never`-returning function, so control never returns to the caller. That is its only role.

It is **not** used for the error channel: infallibility is expressed by the absence of an error arm (`: int32` means "no errors"); `never` in an error slot would be redundant and confusing.

```ts
function fatal(msg: string): never {   // always exits
  panic(msg);
}

function mustGetConfig(): Config {
  const c = loadConfig() as result;
  check result { fatal("config missing"); }   // exit path — no value need follow
  return c;
}
```

It integrates with exit-path analysis (§6.9): a call to a `never`-returning function counts as a terminator, so the compiler knows control does not continue past it.

### 8.3 No optionality type — absence is an error
Delta has **no `Option`/`None`/`nil`/`null`** and will not add one. A non-existent value is treated as an **error**, modeled and handled through the existing fallible path (`T | ErrorType` + `as result` + `check`) — the same single discharge mechanism as every other failure.

The reasoning: any dedicated "no value" inhabitant — whatever it is named — is a distinct value every consumer must remember exists, which is exactly the nullability hole the no-null decision removed. Routing absence through the error channel keeps **one** way to express and discharge "not there," not two.

Consequences for modeling absence:
- A **lookup** that may not yield a value returns `T | NotFoundError`; the caller binds with `as result` and `check`s it.
- An **optional field** is modeled by *structure*, not a sentinel — via illegal-states unions (§8.1, a variant that omits the field) or a **fallible accessor** (`middleName(): string | NotFoundError`).

```ts
function lookup(id: UserId): User | NotFoundError;
const u = lookup(id) as result;
check result { return error as NotFoundError { id }; }   // absence handled on the usual path
// u: User, guaranteed below
```

### Benefits
- Constructors can no longer build contradictory objects — whole bug classes vanish at the type level.
- `never` lets the compiler know a function always exits (panic / custom exit path), so control-flow analysis treats the call as a terminator.
- **One** absence mechanism: there is no nullable inhabitant to forget, narrow incorrectly, or leak — the no-null guarantee is preserved end to end.

---

## 9. (removed — bitflag / value sets)

A bitflag set is **not a type-system feature** and is removed from this plan. It decomposes into pieces already covered:
- its **element type** is an enum/union (`Read | Write | Execute`);
- the **validity of a flag combination** is a refinement on an integer (`(V & ~ALL_FLAGS) == 0`, see §3) — a bitflag set is a refined integer;
- the ergonomic surface (`has`, `with`, set literals, no manual masking) is a **stdlib container** (`FlagSet<E>`), built with capped generics over an enum and lowered to an integer mask.

So bitflag sets ship as a standard-library type over the existing primitives, not as a language feature.

---

## 10. Cross-cutting: pipeline & erasure

All features share one pipeline shape:

| Stage | Adds |
|-------|------|
| tokenizer | `distinct`, `unit`, `where`, `has states`, `regex"…"`, `enum`, unit-annotated literals |
| parser | newtype/unit/enum declarations; `has states { … }` clause; refinement RHS (`Expr where Binder: Type`); `T as Unit` |
| analyzer | refinement theories (intervals, strings); the dimensional theory; state-family checking (typestate + taint) — move-tracking + state-union desugaring; exhaustiveness for unions; `never` bottom-type handling |
| emitter | erase predicates, states (typestate/taint), and units to base representation; collapse each state family to one C type; lower tier-4 refinement checks via the existing `ConvTrap`/`delta_panic` pattern |

Everything erases: tiers 1–3 of refinement, all states (typestate/taint) and units cost nothing at runtime. Only tier-4 refinement boundary checks emit code.

---

## 11. Implementation priority

By value-per-cost, foundation-first; all fit within #21:

1. **Distinct newtypes** (§2) — trivial; substrate for §5, §6, §7.
2. **Refinement types** (§3) — broadest value; start with tier-1 intervals.
3. **Illegal-states modeling / `never`** (§8) — mostly rides existing unions; high modeling payoff.
4. **State families — `has states`** (§5 taint + §6 typestate) — one mechanism covering provenance and lifecycle; rides ownership; security + protocol wins.
5. **Units of measure** (§7) — domain-gated; last, behind the experiment gate.

(Bitflag/value sets are not in this list — they are a stdlib container over enum + refinement, §9.)

### Suggested first slices (refinement, as the template)
1. Tier-1 intervals: `type Positive = V > 0 where V: int32`; accept `5`, reject `0`; erase to `int32`.
2. Tier-4: `as result` coercion, `RefinementError`, `ConvTrap`-style lowering, the discharge/spurious diagnostics.
3. Tier-2: flow-narrowing.
4. Subtyping: interval implication.
5. Interval arithmetic + static overflow elimination.
6. String/regex theory.

Each newtype-derived feature (state families, units) is then an additive slice over the newtype substrate.

---

## 12. Non-goals

Normative "never (in this layer)" — these keep it from sliding into dependent types or comptime:

- **No user functions in predicates** — only blessed theories (`isValidEmail(V)` is comptime; `matches regex"…"` is a theory).
- **No quantifiers / collection-content predicates** — `Sorted<T>`, `AllPositive<T>` need iteration.
- **No cross-value / dependent predicates** — `{ i where i < arr.len }` (static bounds-check elimination) references another value → dependent typing → the #21 boundary. Index validity stays a runtime bounds check.
- **No general type-level computation** — units and refinements are *fixed decidable theories*, not user-definable type functions or conditional types.
- **No structural subtyping** — except the single, required units carve-out (§7 rule 4); identity stays nominal everywhere else.
- **No state change via cast** — state transitions (typestate and taint) go through functions only; `value as Sql.Clean` is forbidden.
- **No `Option`/`None`/`nil`/`null`** — a non-existent value is an error, modeled and discharged through the fallible `T | ErrorType` + `as result` path (§8.3). No dedicated absence inhabitant exists anywhere in the language.

---

## 13. Deferred

Discussed during design, intentionally **not** in this plan:

- **Effect / capability types** (purity, no-alloc, IO, blocking effect rows). High systems value, but the largest build; revisit if no-alloc/realtime becomes a target. Delta already has a seed in §13.8 allocation fallibility.
- **Linear / must-use types** (consume-exactly-once). A tightening of ownership for resources where dropping is a bug (transactions, one-shot tokens). Revisit after typestate, which shares machinery.

---

## 14. Open questions

- **Refinement syntax delimiter** — fully braceless (`P where V: T`, chosen here) vs a lightweight delimiter; the braceless form costs the type-RHS parser an expression grammar before `where`.
- **Overflow policy** — interval soundness depends on whether runtime overflow wraps or traps; reconcile with §5 before the arithmetic slice.
- **`RefinementError` shape** — one universal type (assumed) vs per-refinement generated errors.
- **Units graduation** — ship only if numerical/engineering use is a real goal; otherwise newtypes suffice.
- **Trust ordering (lattice)** — ship plain state families first; gate the `Clean <: Tainted` upgrade ordering (§5) on demand.
- **Feature gate** — granularity (one gate vs per-feature) and how loud, given the #21 reopenings.
