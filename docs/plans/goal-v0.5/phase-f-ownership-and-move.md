# Plan: Phase F — Ownership, Move Semantics, and Safe References (v0.5b)

Date drafted: 2026-06-03
Revised: 2026-06-21 — classes dropped; ownership moved to records
Revised: 2026-06-21 — former Phase G (Safe References) merged in; `&T` / `edit &T` borrows are now part of this phase
Revised: 2026-07-16 — duplication made implicit: bare use of an Owned value clones, bare use of a Unique value moves. Runtime drop flags adopted to make conditional moves compile. `move` / `clone` remain as explicit keywords.
Status: planning, not started.

Predecessor: Phase **K** provides record declarations and structural field information. Phase **L** provides receiver-function declarations and `self`-receiver dispatch — the `dispose` hook and every method called through a borrow are receiver functions, so Phase F depends on Phase L rather than preceding it. Phase **B** provides CFG/dataflow machinery. Phase **C** provides fallible-result handling.
Successors: Phase **H** adds `owned<T>`; after Phase H the full v0.5 goal is reached.
Spec basis: [§11 Mutability](../../spec-sections/11-mutability-model.md), [§12 Safe References](../../spec-sections/12-safe-references.md), [§13 Memory Safety](../../spec-sections/13-memory-safety-model.md), [§14 Ownership & Move Semantics](../../spec-sections/14-ownership-and-move-semantics.md). Those sections still contain class-era wording and must be updated to match this plan before Phase F is considered specified.

## Goal

Give every Delta value statically known Copyable, Cloneable, and Unique capabilities, make every ownership transfer visible, guarantee that every owned value is disposed exactly once, and let code observe or mutate a value without taking ownership through `&T` / `edit &T` borrows whose exclusivity and non-escape are checked statically.

Records replace classes as the user-defined owning type. Copyability and cloneability are inferred from record fields. `unique` is the only ownership marker. A custom `dispose()` hook is legal only for a `unique type`, so a value with user-authored cleanup can never be copied or cloned accidentally.

```delta
type Point = { x: float32; y: float32; };       // Copyable + Cloneable
type Buffer = { bytes: Array<uint8>; };         // Cloneable
unique type File = { fd: int32; };              // Unique

function (file: edit &File) dispose(): void {
    os.close(file.fd);
}
```

After Phase F:

```delta
function consume(file: File): void { }

function main(): uint8 {
    let file = openFile("notes.txt") as result;
    check result { return 1; }

    consume(file);  // `File` is Unique: the bare argument transfers
    inspect(&file); // ERROR: use of moved binding `file`
    return 0;
}
```

`consume(move file)` is the same program with the transfer spelled out. The keyword is never required; it is available wherever a reader benefits from seeing the transfer, and it is the only way to opt out of an implicit clone on an Owned value.

Borrows let a value be observed or mutated without transfer. The reference-using calls compile and the negative variants are rejected with precise diagnostics:

```delta
function (counter: edit &Counter) add(amount: int64): void | OverflowError { /* ... */ }
function (counter: &Counter) get(): int64 { /* ... */ }

function readSum(a: &Counter, b: &Counter): int64 {
    return a.get() + b.get();
}

function main(): uint8 {
    let a = makeCounter(10);
    let b = makeCounter(20);

    a.add(5) as result;            // edit &a auto-borrowed for the `edit &Counter` receiver
    check result { return 1; }

    const total = readSum(&a, &b); // two overlapping immutable borrows: allowed
    // readSum(edit &a, &a);       // ERROR: exclusivity — `edit &a` conflicts with `&a` on root `a`
    return 0;
}
```

## Settled ownership model

### Inferred ownership and duplication capabilities

`owned` is a semantic property, not a source keyword. A type becomes resource-owning when it directly owns a compiler-known resource or contains a resource-owning member. Resource ownership propagates through records automatically and always makes the containing type non-Copyable.

Every record is Cloneable unless it is Unique. Copyability is narrower: a record is Copyable only when every member is Copyable, which necessarily means that it owns no resources.

| Operational class | Inferred properties | How a record enters it | Custom `dispose()` | Duplication |
|---|---|---|---:|---|
| **Plain** | non-owning, Copyable, Cloneable | Every member is non-owning and Copyable | no | Plain copy; explicit clone is redundant |
| **Owned** | resource-owning, non-Copyable, Cloneable | Contains `owned<T>`, `string`, `Array<T>`, or another Cloneable owner | no | `clone x` (aborts on OOM; `clone x as result` to handle it), or transfer with `move x` |
| **Unique** | non-Copyable, non-Cloneable; may be resource-owning | Declared `unique type`, or structurally contains a Unique member/capability | optional, only on explicitly `unique type` | Transfer with `move x` only |

The properties are related but not synonyms:

- **Resource-owning** means the value carries a cleanup obligation.
- **Copyable** means ordinary duplication is safe and duplicates no cleanup obligation.
- **Cloneable** means an explicit operation can create an independent value with its own cleanup obligations.
- **Unique** means no independent duplicate is permitted. A Unique value may represent a resource or merely an exclusive identity/capability.

The recursive classifier is:

- Numeric primitives, `bool`, `char`, enums, immutable borrows (`&T`), and immutable borrowed slices/strings are non-owning, Copyable, and Cloneable.
- Mutable borrows (`edit &T`) are non-owning exclusive capabilities. They are not implicitly duplicated; a record containing one is Unique and lifetime-bearing.
- `owned<T>`, `string`, `Array<T>`, and similar built-ins are ownership roots. They are never Copyable. They are Cloneable when their contents are Cloneable.
- A record is resource-owning iff any member is resource-owning or it has a validated custom `dispose()` hook.
- A record is Unique iff it is declared `unique type` or any member is Unique.
- A Unique record is neither Copyable nor Cloneable.
- Every non-Unique record is Cloneable.
- A non-Unique record is Copyable iff every member is Copyable. Because ownership roots are never Copyable, this also proves that a Copyable record owns no resources.
- A non-Unique record with any resource-owning member is therefore Owned: non-Copyable but Cloneable.
- A bare record that becomes Unique through a member does not need to repeat `unique`; a custom `dispose()` still requires an explicit `unique type` declaration.

There is no `owned type` declaration and `owned` is not reserved syntax. There are also no `uses Copyable`, `uses Cloneable`, or `uses Disposable` markers and no user-defined copy/clone hooks in v0.5. New Cloneable ownership roots are compiler/standard-library facilities; user records compose them structurally. User-defined leaf resources use `unique type` plus optional custom disposal.

### The three operations

There are exactly three ways to obtain another usable value from an existing value: copy, clone, and move. **Which one a bare use performs is determined by the operand's tier, not by syntax.** A bare use is any plain assignment, by-value argument, or `return`:

| Tier of `x` | `let b = x;` / `f(x)` | Source after |
|---|---|---|
| **Plain** (Copyable) | copy | live |
| **Owned** (non-Copyable, Cloneable) | recursive clone | live |
| **Unique** | move | **dead** |

This is the ergonomic core of the phase: ordinary code never names an ownership operation. A value that *can* be duplicated safely is duplicated; a value that cannot is transferred; either way the program means the obvious thing and the compiler proves it sound.

The keywords remain, and each retains a job that bare use cannot do:

- `move x` transfers and invalidates the source. On a Unique value it is the explicit spelling of the default. On an **Owned** value it is the opt-out from implicit cloning — the way to say "transfer this buffer, do not duplicate it." This is its most important role.
- `clone x` recursively duplicates a Cloneable value and leaves the source live. On an Owned value it is the explicit spelling of the default. Its load-bearing form is `clone x as result`, which is the **only** way to handle allocation failure: bare clone — implicit or explicit — aborts on OOM.
- There is no `copy` operator.

Exactly one redundancy warning exists, and this change does not add to it: `clone v` on a Copyable `v` warns "use assignment instead" (§14.11). Nothing else warns.

- `move v` on a Copyable `v` is **not** diagnosed. Per §14.3 and §14.11 it is a real transfer that invalidates `v`, so it is a deliberate operation rather than a redundant one. It is unnecessary — assignment already copies — but it is not pointless, and a warning would misdescribe it.
- `move f` on a Unique `f` and `clone doc` on an Owned `doc` restate the default exactly. Writing them for clarity at a transfer point is encouraged, not penalized.

There is still no implicit move **on last use**. Tier dispatch is position-independent: `f(x)` on a Unique `x` transfers whether or not `x` is used again, and a later use is an ordinary use-after-move error rather than a retroactive reinterpretation of the earlier call. Move state never depends on what comes after it.

`move` never allocates, so it has no failure mode and no `as result` form. Implicit clone allocates and therefore inherits clone's abort-on-OOM behavior — see "The cost of an implicit clone" below.

### The cost of an implicit clone

Implicit cloning is the one place this design hides real work: `let b = doc;` may deep-copy an `Array<uint8>` and, on allocation failure, abort the process. Three rules bound the exposure.

1. **Auto-borrow outranks implicit clone at calls.** Given a `&T` parameter or overload, `f(doc)` borrows rather than clones (see "Contextual auto-borrowing at calls"). Implicit clone fires at an argument position only when the callee has no borrow-taking alternative — that is, only when it genuinely demands ownership. Most hot paths take `&T` and never clone.
2. **`move x` is always available** to convert an implicit clone into a transfer at zero cost.
3. **The cost is proportional to the tier the author already declared.** A record is Owned only because it structurally contains an ownership root; the author chose those fields.

The residual risk is a by-value ownership-taking callee invoked in a loop, which silently clones per iteration. This is the C++ copy-constructor footgun in miniature and it is a **deliberate, accepted** cost of the ergonomics decision. A post-v0.5 lint (`implicit clone in loop body`) is the intended mitigation, not a language rule.

### Heap allocation with `new`

`new x` allocates `x` on the heap and yields `owned<T>`, the single-owner heap-indirection type (`T` is the operand's type). It is a prefix keyword operator in the same family as `move` / `clone`, not a function — `new literal`, never `new(literal)`.

- It is the **sole** heap-allocation form. The earlier `owned<T> { ... }` heap-literal construction is **removed**; write `new T { ... }` instead.
- The operand is any value expression: a record literal (`new Point { x: 1, y: 2 }`), a primitive (`new 42`), or a transferred binding (`new move existing`).
- Transfers stay visible: a non-Copyable named operand must be moved explicitly (`new move owned`), exactly as elsewhere. Literals and Copyable operands need no `move`.
- OOM behaves like `clone`: `new x` aborts the program on allocation failure; `new x as result` surfaces `AllocError` through Phase C's `check`/`forward`.
- `new` uses the default allocator. Custom allocators are deferred (a future `new x in <allocator>` clause); v0.5 threads no allocator.
- `owned<T>` is move-only — copying the owning pointer would alias ownership and double-free at dispose. It is Cloneable exactly when `T` is, and `clone` of a `owned<T>` recursively reallocates.

This phase reserves `new` and fixes its grammar, precedence, and abort/`as result` rule so the ownership-operator family is complete. `owned<T>` typing, auto-deref, lowering, and disposal are implemented in Phase H; until then `new` parses but is not lowered.

## Unique records and disposal

`unique type` is the sole explicit ownership-related declaration marker:

```delta
unique type TempFile = {
    fd: int32;
    path: string;
};

function (file: edit &TempFile) dispose(): void {
    os.close(file.fd);
    os.unlink(&file.path);
}
```

The compiler recognizes `dispose` as a reserved receiver hook with these rules:

1. Its receiver must be exactly `edit &T`, where `T` is an explicitly declared `unique type`.
2. It must be declared in the same module as `T`; orphan disposal hooks are forbidden.
3. It takes no ordinary parameters, returns `void`, is not overloadable, and cannot be exported as a normal callable API.
4. User code cannot invoke it directly. Only compiler-generated scope-exit cleanup may call it.
5. The custom body runs at most once for each live owner, before the compiler disposes owned fields in reverse declaration order.
6. A `unique type` need not define `dispose()`. Identity tokens and capabilities can be non-duplicable without requiring custom cleanup.
7. Defining `dispose()` on a bare `type` is an error with the fix: `declare this record as unique type`.

Automatic field disposal applies to every owned record, not only Unique records. The custom hook is extra cleanup beyond fields.

This restriction is the “no double dispose” guarantee: anything with custom cleanup is non-copyable and non-cloneable, so every use of it is a transfer, and a moved-from binding is never disposed at the source — statically omitted where its state is known, and gated on a drop flag where it is not.

## Borrow model

Borrows are implemented in this phase. The MVP keeps them deliberately small: borrows appear **only in parameter positions and call-argument positions**, and their lifetime is exactly the duration of the enclosing call. Escaping borrows — returning one, storing one in a record field, or binding one to a local — are out of scope here and are rejected structurally; the `viewing <source>` lifetime clause is the settled forward contract for when escape is later allowed (see "Lifetime: call-scoped MVP and the `viewing` forward contract" below).

Core types and rules:

- `T` is an owned or Copyable value.
- `&T` is an immutable borrow type. Lowers to `const T*`.
- `edit &T` is a mutable, exclusive borrow type. Lowers to `T*`. The mutability modifier precedes the reference operator: `edit &T`, `edit &x`.
- A borrow never owns, moves, clones, frees, or disposes its source.
- Binding capability: a `const` source yields `&` only; a `let` source yields both `&` and `edit &`. An `edit &T` parameter may itself be reborrowed as `&T` or `edit &T`.
- Many overlapping immutable borrows are allowed; within a single call's argument list an `edit &` on a root excludes every other borrow or move on that same root.
- Moving a source that is borrowed in the same call's argument list is forbidden.
- Borrows cannot satisfy a by-value parameter; passing `&x` where an owned `T` is expected is a structured error whose fix hint suggests `clone`.

Borrows are formed two ways:

- **Contextual auto-borrowing.** A call auto-borrows from the resolved parameter type: `read(value)` forms `&value` for a `&T` parameter, and `mutate(value)` forms `edit &value` for an `edit &T` parameter. The same applies to receiver dispatch: `value.get()` auto-borrows `&value` for a `&Self` receiver and `value.add(5)` auto-borrows `edit &value` for an `edit &Self` receiver.
- **Explicit `&value` / `edit &value`.** These remain available for overload disambiguation and any position without an expected parameter type. They are not required at ordinary calls and lower identically to the auto-borrowed form.

Views are borrow types, not a separate Copyable "view value" tier:

- `Slice<T>` becomes `&T[]`.
- Mutable slices use `edit &T[]`.
- `stringview` becomes `&string`.
- There is no `uses View of S` marker and no pass-through-view exception.

### Lifetime: call-scoped MVP and the `viewing` forward contract

In this phase every borrow lives exactly as long as the call it is passed to. The call scope dominates any nested call, so a `&T` / `edit &T` parameter may be re-passed to a nested call as `&T` / `edit &T` with no re-reference operator and no lifetime variables. Because borrows never outlive their call, there is no region/lifetime system to build yet: non-escape is a structural property, not a dataflow result.

The `viewing <source>` clause is documented now as the settled forward contract for when borrows are later allowed to escape (returns, stored borrow fields). It is **not implemented in this phase**:

- Source names and paths will refer to actual parameters, receivers, or fields — never abstract lifetime variables such as `'a`.
- A borrow may never outlive its source, including across returns, field storage, captures, and control-flow joins.
- The source is elided when unambiguous from parameters and return position; multiple possible return sources or stored borrow fields will require an explicit `viewing <source>` clause.

The classification rule that an aggregate storing an `edit &T` is Unique and lifetime-bearing is likewise part of this forward contract: since borrow-typed fields are rejected in this phase, the rule cannot yet be triggered, but it is recorded so the capability table stays stable when stored borrows land.

## In-scope Phase F surface

- `unique type Name = { ... };` parsing and registration.
- Recursive Copyable / Cloneable / Unique capability inference for records and built-ins available in v0.5.
- `move x` for whole live owned bindings.
- `clone x` (aborting on allocation failure) plus the optional fallible `clone x as result` for readable Copyable/Cloneable paths.
- Per-binding move-state tracking over the Phase B CFG.
- Tier-directed implicit duplication at bare assignment, bare by-value argument, and `return`: copy for Plain, clone for Owned, move for Unique.
- Drop-flag synthesis for bindings that are `MaybeMoved` at a cleanup point, and static cleanup for every binding that is not.
- Loop back-edge checks.
- Revival of moved-from `let` bindings by whole-value reassignment.
- Automatic reverse-order field disposal and move-aware cleanup suppression.
- Receiver-based custom `dispose()` validation and lowering for explicitly Unique records.
- Recursive, transactional derived-clone helpers for non-Copyable Cloneable records.
- `&T` and `edit &T` parameter types, lowering to `const T*` / `T*`.
- Contextual auto-borrowing at calls and receiver dispatch, plus explicit `&value` / `edit &value` operating on named storage paths.
- Binding-capability checks at borrow creation (`const` → `&` only; `let` → both).
- Root-based borrow exclusivity within a single call's argument list, including the move-vs-borrow overlap rule.
- Capability dispatch through borrows: a `&Self` receiver cannot call an `edit` receiver method.
- Structural non-escape enforcement: borrows may not be returned, stored in record fields, or bound to locals.
- Reserve and parse the `new` heap-allocation operator (prefix keyword, `as result` form); `owned<T>` typing, auto-deref, lowering, and disposal land in Phase H.

## Explicitly out of scope

| Feature | Decision |
|---|---|
| Classes | Dropped; records plus receiver functions are the object model. |
| User copy/clone hooks | Not in v0.5; copy and clone are structural. |
| Manual `dispose()` calls | Rejected permanently; cleanup is ownership-driven. |
| Partial moves (`move x.field`, `move xs[i]`) | Rejected; aggregates move as a whole. |
| Implicit last-use moves | Rejected. Tier dispatch is position-independent: a bare use of a Unique value transfers regardless of whether it is the last use. Move state never depends on later code. |
| Use of a `MaybeMoved` binding | Rejected. Drop flags make a maybe-moved binding *disposable*, not *usable*; reads, borrows, clones, and moves still require `Live`. |
| Runtime reference counting or tracing GC | Not part of this ownership model. Drop flags are the only runtime ownership mechanism, and they carry no per-object metadata. |
| `copy` operator | Not introduced; copying is what a bare use of a Copyable value already does. |
| Abstract lifetime variables such as `'a` | Rejected in favor of source-based `viewing <source>`. |
| Separate view types (`Slice<T>`, `stringview`, `uses View`) | Replaced by borrows. |
| Borrows of temporaries or general expressions | Operand must be a named storage path; bind it first. |
| `&T` / `edit &T` as a local binding type | Parameter-only in v0.5; deferred post-v0.5. |
| Borrows stored in record fields | Requires the `viewing <source>` lifetime story; deferred. |
| Escaping/returned borrows | Non-escape is enforced structurally this phase; `viewing` is the forward contract. |
| Re-reference / explicit re-referencing operators | Unneeded; a borrow parameter re-passes to nested calls directly. |

## Move-state decisions

1. Move state is tracked per binding with `Uninitialized`, `Live`, `Moved`, and `MaybeMoved` states. Revival is a transition from `Moved` to `Live`, not a separate steady state.
2. A transfer — implicit or via `move` — accepts only a whole live local binding or owned by-value parameter. Fields, indexed elements, temporaries, `const` bindings, and borrows cannot be moved. A bare use of a Unique field path such as `f(x.handle)` is therefore a partial-move error, not an implicit move, and carries the same "move the whole value" diagnostic as explicit `move x.handle` (E0704).
3. Reading, mutating, borrowing, cloning, or moving a `Moved` binding is an error until whole-value reassignment revives a `let` binding.
4. At a control-flow merge the join is by state: `Live ⊔ Live = Live`, `Moved ⊔ Moved = Moved`, and only a `Live`/`Moved` disagreement yields `MaybeMoved`. A value moved on **every** converging branch is simply `Moved` after the merge — no flag needed. `MaybeMoved` arises only when some, but not all, converging paths moved it. Paths that diverge before the merge do not participate.
5. **A `MaybeMoved` binding may be cleaned up but not used.** Cleanup is gated on a drop flag; any read, write, borrow, clone, or move still requires `Live` and is otherwise an error. Drop flags resolve the *disposal* ambiguity, never the *use* ambiguity.
6. A loop back-edge may leave a binding `Moved` or `MaybeMoved` provided the next iteration does not use it; cleanup at loop exit is flag-gated. A binding that is used in the next iteration must be `Live` at the back-edge, which for a moved binding means reviving it first (E0705).
7. Assigning `x = value` revives moved `let x` and sets its drop flag if it has one; assigning `x.field = value` does neither.
8. `move` emits no runtime operation of its own beyond clearing a drop flag when the binding has one. It introduces no sentinel, no zeroing, and no pointer nulling.
9. Function parameters passed by value are owned by the callee. The caller copies, clones, or moves according to the argument's tier, with no keyword required.
10. At scope exit, every owned binding is cleaned up exactly once. `Moved` bindings are skipped statically, `Live` bindings are dropped unconditionally, and `MaybeMoved` bindings are dropped under their flag.
11. A binding borrowed in the current call's argument list cannot also be moved in that same argument list: `f(move x, &x)` and `f(edit &x, move x)` are rejected — as is `f(x, &x)` when `x` is Unique, since the bare argument is a transfer. Because borrows do not outlive their call, a borrow in one statement never blocks a move in a later statement: `g(&x); consume(x);` is legal.

### Conditional moves and drop flags

Moving a binding on **every** branch that reaches a merge joins to `Moved`: nothing to clean up, no flag, no runtime test.

```delta
let f = openFile() as result; check result { return 1; }
if (cond) {
    consume(f);
} else {
    archive(f);
}
// moved on both paths → `f` is Moved here; using it now is an ordinary use-after-move error
```

An *asymmetric* merge — the classic `if` with no `else` that moves — joins to `MaybeMoved`. The compiler cannot decide statically whether `f` needs disposal at scope exit, so it emits a **drop flag**: a hidden `bool` that the move site clears and the cleanup site tests.

```delta
let f = openFile() as result; check result { return 1; }
if (cond) {
    consume(f);
}
return 0;              // accepted: cleanup is flag-gated
```

```c
delta__File f = /* ... */;
bool f__live = true;
if (cond) {
    delta__consume(f);
    f__live = false;
}
if (f__live) { delta__File_drop(&f); }
return 0;
```

This is what adopting drop flags buys, and it is the whole of what it buys. **A `MaybeMoved` binding is still unusable:**

```delta
if (cond) {
    consume(f);
}
inspect(&f);           // ERROR: use of maybe-moved binding `f`
```

The flag answers "must this be disposed?", which is a question the runtime can answer cheaply and locally. It does not answer "is this still a valid value?", which is a question the type system must answer statically or not at all. Reads, borrows, clones, and moves therefore continue to require `Live`, and the diagnostic for a use of a `MaybeMoved` binding names both the moving and non-moving predecessors. Diverging the moving branch remains the way to make a binding unambiguously `Live` after the merge; it is now an idiom rather than a requirement.

Flags are emitted **only** for bindings that are `MaybeMoved` at some cleanup point. A binding whose state is known at every exit — the overwhelming majority — lowers to exactly the static cleanup this plan specified before, with no flag and no branch. Where a flag is emitted, it is provably constant along most paths and the C optimizer removes the test; the residue is one stack byte and one predictable branch per genuinely ambiguous binding.

## Clone decisions

- Cloning reads its source and never changes its move state. This holds for an implicit clone exactly as for `clone x`.
- `clone x` yields an owned value of type `T`. Allocation failure **aborts the program** by default — this matches every current systems language, which exposes no routine OOM-handling path. Handling failure is opt-in: `clone x as result` instead yields the Phase C result carrier and routes `AllocError` through `check`/`forward`.
- **An implicit clone always takes the aborting form.** `let b = doc;` is exactly `let b = clone doc;`, including its abort-on-OOM edge. There is no implicit fallible form: `as result` is a statement-level wrapper from Phase C and cannot attach to an argument buried in an expression. Code that must survive allocation failure writes `clone x as result` explicitly, which is the reason the keyword still exists.
- All three forms — implicit, bare `clone`, and `clone ... as result` — share one synthesized helper (which is internally fallible); only the call-site lowering differs. The implicit and bare forms abort on the error tag; `as result` propagates it.
- Non-Copyable Cloneable records receive a synthesized recursive clone helper. Copyable records satisfy clone by ordinary copying and need no helper.
- Copyable fields are assigned directly; Cloneable fields call their helper.
- Clone is transactional: if a later field clone fails, every already-cloned field is disposed before the helper reports the error (the bare form then aborts; the `as result` form returns it).
- Unique values cannot be cloned.
- Once borrows land, cloning through `&T` or `edit &T` clones the referent into a new owned `T` when `T` is Copyable or Cloneable; it never duplicates the borrow as ownership.

## Parser requirements

### Tokens and grammar

Reserve `unique`, `move`, `clone`, and `new`. Reserve `&` as a type/expression operator and `edit` as its mutability modifier (both belong to this phase's borrow grammar). Do not reserve `owned`; there is no `owned type` declaration. No new symbol operators beyond `&` are introduced; `new` is a keyword.

The relevant declaration and expression grammar is:

```ebnf
type-declaration  = [ "export" ] [ "unique" ] "type" identifier "=" type-rhs ";" ;
move-expression   = "move" identifier ;
clone-expression  = "clone" storage-path ;
new-expression    = "new" unary-expression ;
reference-type    = [ "edit" ] "&" type-reference ;
reference-expr    = [ "edit" ] "&" storage-path ;
storage-path      = identifier { "." identifier | "[" expression "]" } ;
```

A `reference-type` is legal **only** in a parameter type position. Appearing as a local binding type (`let x: &T = ...;`), a return type, or a record field type is a structured parse-level error so the user gets a friendly diagnostic rather than a "type not allowed here" surprise.

Requirements:

1. `unique` is legal only immediately before `type`. `type unique File` and standalone `unique` are syntax errors.
2. The parser records `unique` on the declaration; the analyzer later requires the resolved RHS to be a record. This keeps aliases/compositions in the existing type grammar while producing a semantic diagnostic such as “`unique` may only declare a record type.”
3. `move` and `clone` parse at unary-expression precedence. Member/index access belongs to the operand before the ownership operator is finalized, so `clone doc.title` means `clone (doc.title)`.
4. A move operand is a bare identifier. If `.` or `[` follows it, consume enough of the path to issue the dedicated parse error “partial move is not supported; move the whole binding `x`.” Do not accidentally parse `move x.field` as `(move x).field`.
5. A clone operand is parsed as a storage path. Literals, binary expressions, calls, and other temporaries receive “clone source must be a readable storage path; bind the value first.”
6. Bare `clone x` is an ordinary expression of type `T`; no fallible grammar is involved. The optional `clone x as result` continues to use Phase C's existing fallible-statement grammar: the inner expression is `CloneExpression`, and `as result` wraps the containing declaration/assignment/call statement in `FallibleStatement`.
7. Recovery synchronizes at `;`, `}`, or the next declaration keyword so a malformed ownership expression does not swallow the remainder of the function.
8. `&` and `edit &` parse at the same unary precedence as `move`/`clone`, looser than member/index access. `edit &x.field.subfield` therefore parses as a borrow of the storage path `x.field.subfield`; the storage path is parsed first and then wrapped in the reference expression.
9. A reference operand is a storage path. Literals, calls, arithmetic, and other temporaries at the operand position receive "reference operand must be a named storage path; bind it first." The analyzer re-checks the AST shape but the parser enforces it eagerly.
10. `new` parses at the same unary precedence as `move`/`clone`/`&`. Unlike `move`/`clone`, its operand is a full unary expression rather than a storage path, so `new Point { x: 1 }` is `new (Point { x: 1 })` and `new foo.bar()` is `new (foo.bar())`. `new x as result` reuses Phase C's fallible-statement wrapper exactly like `clone x as result`; bare `new x` is an ordinary expression of type `owned<T>`.

### AST additions

Extend the existing nodes along these lines:

```go
type TypeDeclaration struct {
    Position
    Name     Identifier
    RHS      TypeRHS
    Exported bool
    Unique   bool // true for `unique type`
}

type MoveExpression struct {
    Position
    Source Identifier // whole binding only
}

type CloneExpression struct {
    Position
    Source Expression // parser guarantees a storage-path shape
}

type NewExpression struct {
    Position
    Value Expression // value/initializer to box on the heap; result type is `owned<T>`
}

type ReferenceType struct {
    Position
    Mutable bool          // true for `edit &T`
    Inner   TypeReference // the borrowed type T
}

type ReferenceExpression struct {
    Position
    Mutable bool        // true for `edit &x`
    Source  Expression  // parser guarantees a storage-path shape
}
```

All new expressions implement `Expression`, and `ReferenceType` implements `TypeReference`. Preserve the source position of the ownership/borrow keyword separately from the operand position for diagnostics and LSP highlighting.

Receiver parsing remains Phase L's existing `FunctionDeclaration.Receiver` shape. The parser does not special-case the name `dispose`; semantic registration recognizes a function named `dispose` whose receiver is `edit &T`.

Call syntax does not gain a borrow marker or new AST node. For `read(value)` the parser stores the ordinary `value` argument. After overload resolution, the analyzer annotates that argument as `Value`, `Borrow`, `EditBorrow`, or `BorrowPassThrough`; codegen consumes that checked-call metadata. The parser must not eagerly rewrite bare arguments because it does not yet know the selected parameter type.

`edit &` parses in this phase. `viewing` is deferred with the rest of the lifetime story and is not parsed yet; only its spelling is settled. The mutability modifier precedes the reference operator: `edit &T` / `edit &x`.

## Analyzer requirements

### Ownership metadata and pass ordering

Add explicit ownership capabilities to resolved types:

```go
type CustomRecord struct {
    // existing fields...
    DeclaredUnique bool
    OwnsResources  bool
    Copyable       bool
    Cloneable      bool
    Unique         bool
    DisposeMethod  *ResolvedFunction // nil when no custom hook exists
}
```

Enforce these invariants: `OwnsResources` implies `!Copyable`; `Unique` implies `!Copyable && !Cloneable`; every non-Unique record has `Cloneable == true`; and `Copyable` implies `Cloneable && !OwnsResources`.

The semantic pipeline order is fixed:

1. Register all record declarations and receiver-function signatures.
2. Resolve field types and record-composition output.
3. Validate `dispose` hook signatures against explicit `unique type` declarations.
4. Infer ownership properties and duplication capabilities for all types.
5. Synthesize clone/drop plans.
6. Type-check function bodies and ownership operations.
7. Run definite assignment.
8. Run move-state dataflow.
9. Run borrow analysis: reference-expression typing, binding-capability checks, per-call root exclusivity, capability dispatch through borrows, and non-escape enforcement.
10. Hand the checked AST plus ownership/cleanup metadata to codegen.

Move analysis must precede borrow analysis because a borrow of a moved binding is immediately invalid; borrow analysis then adds the converse constraint that a borrow in a call's argument list prevents a move of the same root in that argument list. Because borrows are call-scoped, no region/lifetime fixpoint is required — non-escape is structural.

### Capability inference

Use a memoized DFS or SCC pass over resolved types. Each type enters `Unresolved`, `Resolving`, or `Resolved(capabilities)` state.

- Primitive and compiler-known capabilities come from one canonical table. That table marks `owned<T>`, `string`, `Array<T>`, and similar facilities as resource-owning and permanently non-Copyable.
- For each record, set `OwnsResources` when any member owns resources or when the record has a validated custom dispose hook.
- A declared `unique type` resolves with `Unique: true` after its members are type-checked.
- A bare record containing any Unique member also resolves with `Unique: true`.
- Every non-Unique record resolves with `Cloneable: true`.
- A non-Unique record additionally resolves with `Copyable: true` iff every member is Copyable. `OwnsResources: true` therefore always forces `Copyable: false`.
- Aliases inherit the target capabilities and do not create a new ownership identity.
- Record compositions classify the fully expanded field set and preserve an explicit `unique` marker on the resulting declaration.
- Direct by-value recursion encountered in `Resolving` state is rejected as infinitely sized. Recursion through `owned<T>` is a boundary and uses `owned<T>`'s compiler-known capabilities.
- Fixed arrays inherit Copyable only when their element is Copyable, inherit Unique when their element is Unique, and are otherwise Cloneable. Result/error carriers apply the same rule across every stored success/error payload.
- `&T` is Copyable and non-owning. `edit &T` is an exclusive capability; an aggregate storing one is Unique and lifetime-bearing.

Capability inference is deterministic and module-independent: importing the same exported record must produce the properties recorded in its module interface. The interface therefore exports `DeclaredUnique`, `OwnsResources`, inferred capability flags, member properties needed for validation, and whether a custom dispose hook exists.

### Disposal-hook validation

After receiver registration, reserve the receiver method name `dispose` and require all of the following:

- receiver type is exactly `edit &T`;
- `T` is an explicitly declared `unique type` in the same module;
- no ordinary parameters;
- success return is `void` and there is no error channel;
- method is not exported, overloaded, generic, or callable as an ordinary member;
- at most one hook exists for `T`.

Reject a hook on a structurally Unique but unmarked record: custom cleanup requires the explicit `unique` declaration as an auditable API promise. Record the validated hook on `CustomRecord.DisposeMethod`.

### Ownership checking at expression sites

Every value-producing or consuming site consults the resolved capabilities:

| Site | Copyable (also Cloneable) | Clone-only (Owned) | Unique |
|---|---|---|---|
| `let b = a`, `b = a` | copy | implicit deep clone (aborts on OOM) | implicit transfer |
| by-value argument `f(a)` | copy | implicit deep clone (aborts on OOM) | implicit transfer |
| `return a` | copy | implicit deep clone (aborts on OOM) | implicit transfer |
| `move a` | transfer (no warning; §14.11) | transfer | transfer |
| `clone a` / `clone a as result` | warning; copy success | deep clone (bare aborts on OOM; `as result` surfaces it) | error |
| `&a` / `edit &a` | borrow | borrow | borrow |

No cell in this table is an error except `clone` of a Unique value, which is the point of the change: a bare non-Copyable value is no longer a diagnostic. E0706 ("cannot copy `T`; it owns a resource and is move-only", with the hint "use `move x` to transfer it or `clone x` to duplicate it") is therefore **retired** outright — it described a situation that no longer exists, and its hint has nowhere to migrate to because the compiler now simply picks the operation the hint used to ask the user for.

`return a` on an Owned value clones rather than transfers. This is the one place the new rule *costs* something the old rule did not: the old plan made `return` the single implicit-transfer boundary, and a factory returning a `Document` moved it out for free. Under tier dispatch a bare `return doc` deep-copies a local that is about to die. Two mitigations, in order of preference:

- **Return-value transfer is a special case.** When the returned operand is a whole local binding or owned by-value parameter that is dead on every path after the `return`, the analyzer transfers instead of cloning. This is not a last-use rule in disguise — a `return` *is* the end of the binding's life, so the two readings coincide and no later code can observe the difference. The clone is elided with no diagnostic.
- `return move doc` remains available and is what the elision above makes unnecessary.

This special case must be implemented; without it, every ownership-returning factory silently deep-copies and the tier-dispatch design is a net ergonomic loss on the most common ownership pattern in the language.

The only redundancy warning is `clone v` on Copyable `v` — "`clone` on a Copyable value is a plain copy; assignment is equivalent" (§14.11). `move v` on Copyable `v` is not diagnosed: it transfers and invalidates `v` like any other `move`, which is a meaningful operation, not a redundant one.

### Contextual auto-borrowing at calls

For each candidate function, match an argument against its parameter using these coercions:

| Parameter | Argument | Result |
|---|---|---|
| `T` | `T` | tier dispatch: copy, implicit clone, or implicit move; never auto-borrow |
| `&T` | addressable `T` | form an immutable borrow for the call |
| `edit &T` | mutable addressable `T` | form an exclusive mutable borrow for the call |
| `&T` | existing `&T` | pass/reborrow immutably |
| `&T` | existing `edit &T` | form a read-only reborrow |
| `edit &T` | existing `edit &T` | form a mutable reborrow |
| `edit &T` | existing `&T` | error: insufficient capability |

Auto-borrow operands follow the MVP storage-path rule: a binding or binding-rooted field/index path. Calls and other temporaries are not auto-borrowed; diagnose “cannot borrow temporary for parameter `p`; bind it first.”

An `edit &T` auto-borrow requires a mutable source (`let` or an existing `edit &` path). A `const` source may satisfy only `&T`. Every implicit borrow enters the same root-based exclusivity and move-conflict checker as an explicit borrow. Thus `f(value, value)` is rejected when the selected parameters are `(edit &T, &T)`.

**Overload ranking is inverted for non-Copyable arguments.** The old rule — "an ownership-valid exact by-value match outranks auto-borrowing" — rested on a bare by-value use of a non-Copyable value being *non-viable*, which made the borrow overload win by default. Tier dispatch makes every by-value use viable, so that rule would now select the by-value candidate and silently deep-clone. The ranking is therefore, highest first:

1. Exact by-value match on a **Copyable** argument (unchanged; copying is free and the caller sees no difference).
2. Immutable auto-borrow (`&T`).
3. Mutable auto-borrow (`edit &T`).
4. By-value match on a **non-Copyable** argument — implicit clone or implicit move.

Rules 2 and 3 keep the least-capability preference between themselves. Rule 4 sitting last is what confines implicit clone to callees that have no borrow-taking alternative: given both `f(&Document)` and `f(Document)`, the call `f(doc)` borrows. Explicit `&value`, `edit &value`, `move value`, or `clone value` overrides the ranking and forces the corresponding candidate.

This ranking is the single most important mitigation for implicit clone's cost, and it is why implicit clone at argument positions is acceptable at all. It must not be relaxed without revisiting that decision.

An auto-borrow lasts for the call and carries the source provenance of the argument path. It never changes move state or transfers cleanup responsibility. Returned/stored borrows derived from the parameter use that same source in lifetime elision or `viewing <source>` analysis.

Clone accepts a readable binding, field path, indexed path, or borrow dereference. It leaves the source state unchanged. Moving accepts only a whole live owned binding and never extracts ownership through a borrow.

Call arguments are ownership-checked in source order. A single call such as `f(move x, x)` reports the second use as use-after-move. Codegen must preserve Delta's source-order evaluation whenever lowering introduces helper calls or temporaries.

Assignment to a live owned destination is replacement, not initialization. The analyzer requires the RHS to produce ownership legally, then schedules cleanup of the old destination before the new value is stored. This applies to whole bindings, owned fields, and owned indexed elements reached through an `edit &` capability. If a fallible RHS fails, the old destination remains live and unchanged. Self-replacement such as `x = move x` is rejected; it does not represent a transfer between distinct owners. Bare `x = x` is rejected on the same grounds when `x` is Unique (it is a self-move) and warns as a no-op self-clone when `x` is Owned.

### Borrow typing, exclusivity, and non-escape

The auto-borrow coercion above produces, and explicit `&x` / `edit &x` expressions also produce, a `ReferenceType` value that the analyzer validates with one shared pipeline. Whether the borrow was implicit or explicit, identical checks and identical metadata result.

**Reference-kind on parameter symbols.** A parameter symbol carries a `ReferenceKind` of `None`, `Ref`, or `EditRef`. Capability lookups, mutability checks, and method dispatch on that parameter consult this kind instead of the owned-binding `const`/`let` distinction.

```go
type SymbolParameter struct {
    // existing fields...
    ReferenceKind ReferenceKind // None | Ref | EditRef
}
```

**Reference-expression typing.**
- The operand must resolve to a storage path. The analyzer double-checks the AST shape even though the parser already enforced it.
- Resolve the root binding (the leftmost identifier). The expression's type is `ReferenceType{Mutable, Inner: the type reached along the field/index path}`.
- Capability: `&x` requires `x` readable — any owned binding (`const` or `let`) or a `Ref`/`EditRef` parameter, whose move-state is `Live`. `edit &x` requires `x` to be a `let` binding or an `EditRef` parameter; `edit &c` on a `const` binding or a `Ref` parameter is rejected with "cannot form `edit &` from read-only `c`."
- The root binding's move-state at the borrow site must be `Live`; otherwise emit "borrow of moved binding `x`."

**Root-based exclusivity at each call.** For every call:
1. Walk the argument list and collect, for each borrow operand (implicit or explicit), an entry `(root, capability)` where capability is `Shared` for `&` and `Exclusive` for `edit &`. Add each `move x` operand as a synthetic `Exclusive` entry on root `x`.
2. Group entries by root.
3. Reject any group that contains an `Exclusive` entry and has size greater than one. The diagnostic lists every conflicting argument position and names the shared root.

Thus `f(&a, &a)` is allowed (many readers), while `f(edit &a, &a)`, `f(edit &a, edit &a)`, and `f(move a, &a)` are rejected. Grouping is by root only: `f(edit &obj.a, &obj.b)` is conservatively rejected because both roots are `obj`; the fix hint reads "borrow exclusivity in v0.5 is root-based; pass owned values or split the call."

**Capability dispatch through borrows.** For `e.method(args)` where `e` has type `&T`, look up `method` among `T`'s receiver functions: an `edit &Self` receiver method is rejected with "cannot call `edit` method through `&`"; a `&Self` receiver method is legal. For `edit &T`, both receiver kinds are legal. This is the Phase L receiver-capability check generalized to borrow-kind receivers; there is no separate "class scope."

**Non-escape enforcement.** Because `ReferenceType` is accepted only in parameter positions, escape is structurally impossible — but the analyzer still emits friendly diagnostics rather than raw "type not allowed" errors:
- `return <borrow>;` or a function whose return type is or contains a borrow → "borrows cannot be returned in v0.5."
- a record field of borrow type → "borrows cannot be stored in record fields in v0.5."
- a local declared with a borrow type → "borrows are parameter-only in v0.5; pass it at the call instead."
A `&T` parameter may be re-passed to a nested call as `&T` (and `edit &T` as `edit &T` or `&T`); the call scope dominates the nested call, so this needs no re-reference operator and no lifetime check.

**Borrow where an owned value is expected.** Passing a borrow (`&x` / `edit &x`, or a borrow-typed parameter) where the callee expects an owned `T` is a structured error whose fix hint suggests `clone x`.

**Reborrow vs. over-asking.** The coercion table governs how an *existing* borrow binding flows into a borrow parameter: an existing `edit &T` reborrows down to a `&T` parameter automatically, but an existing `&T` cannot upgrade to an `edit &T` parameter ("insufficient capability"). An *explicit* `edit &x` written directly at a `&T` parameter, by contrast, is over-asking and is rejected with "pass `&x` here," matching the auto-borrow ranking that prefers the least capability. The two rules do not conflict: reborrow concerns capability already held, over-asking concerns capability freshly requested.

### Move-state dataflow

Track `Uninitialized`, `Live`, `Moved`, and `MaybeMoved` per local and owned by-value parameter, Copyable or not. Copyable bindings still need a move-state slot: an explicit `move x` invalidates the source regardless of tier (§14.3), so a subsequent use of a moved-from Copyable binding must be rejected like any other use-after-move. (What Copyable changes is only the *implicit* paths — plain assignment and by-value passing copy and leave the source `Live` — not the explicit `move`.)

- Declaration/successful fallible commit initializes to `Live`.
- A transfer changes `Live → Moved` after evaluating the consuming expression. Transfers are `move x`, a bare use of a Unique `x`, and a return-value transfer per the elision rule above.
- An implicit or explicit **clone** leaves the source `Live`. Tier therefore decides whether a bare use is a state transition at all.
- Whole assignment to moved `let x` changes `Moved → Live`; assignment must first evaluate and validate the new RHS.
- Field/index assignment through moved `x` is rejected and cannot revive it.
- Merge joins by state: `Live ⊔ Live = Live`, `Moved ⊔ Moved = Moved`, `Live ⊔ Moved = MaybeMoved`. A binding moved on every converging branch stays `Moved` (no flag, no cleanup).
- A `MaybeMoved` binding rejects any subsequent read, write, borrow, clone, or move, and is disposed under a drop flag at cleanup points that it reaches.
- A diverging edge does not join its state into later code.
- Loop fixed-point analysis accepts a back-edge that carries `Moved`/`MaybeMoved` state, and rejects only a use of a non-`Live` binding in the next iteration (E0705). Loop-exit cleanup for a binding that is `MaybeMoved` at the exit edge is flag-gated.
- Scope-exit metadata records, for every CFG exit edge, which owning bindings are `Live` (drop unconditionally), which are `Moved` (skip), and which are `MaybeMoved` (drop under flag), plus the required reverse cleanup order.

**Drop-flag allocation.** After the dataflow fixed point, a binding requires a drop flag iff it is `MaybeMoved` on some CFG edge that reaches a cleanup point for it. Every other binding is cleaned up statically exactly as before. The analyzer records the flag requirement per binding and hands it to codegen; it does not decide flag representation.

### Derived clone and cleanup plans

For each non-Copyable Cloneable record, synthesize an ordered clone plan containing one step per member: `Copy(member)` or `Clone(member, helper)`. Associate each fallible step with the reverse list of completed owned members to clean up on failure. Copyable records need no generated helper because their clone operation lowers to a plain copy with a redundancy warning.

For every record that transitively owns storage or has custom cleanup, synthesize a drop plan:

1. call the custom `dispose` hook, if any;
2. drop owned fields in reverse declaration order;
3. do nothing for Copyable/borrow fields.

Unique records never receive clone plans. A `dispose` body is checked like an `edit &T` receiver body, except direct calls to any `dispose` hook remain forbidden.

## Codegen specification

### C type and helper naming

Record layout remains the Phase K C struct layout; `unique` changes semantics, not representation:

```delta
unique type TempFile = { fd: int32; path: string; };
```

```c
typedef struct delta__TempFile {
    int32_t fd;
    delta_string path;
} delta__TempFile;
```

Use distinct helpers:

- `delta__<module>__<Type>_clone(const T* src)` — compiler-derived clone for non-Copyable Cloneable records. It is internally fallible (returns a result carrier); both `clone x` and `clone x as result` call it and differ only at the call site. Copyable records clone by copying and emit no helper.
- `delta__<module>__<Type>_dispose(T* self)` — lowered user receiver hook; explicitly Unique only.
- `delta__<module>__<Type>_drop(T* value)` — compiler-generated total cleanup (custom hook plus fields).

For the root module, existing mangling may omit the module segment, as current record/method codegen does. Helpers are `static` unless they must be referenced from another translation unit; module interfaces expose declarations without making them Delta-callable.

### Copy and move lowering

Copyable records use ordinary C assignment:

```delta
const b = a; // Point is Copyable
```

```c
const delta__Point b = a;
```

A transfer emits no runtime operation, whether written or implied:

```delta
consume(file);       // `file` is Unique — bare use transfers
consume(move file);  // identical lowering
```

```c
delta__consume(file);
/* no delta__TempFile_drop(&file): analyzer marks source as Moved */
```

When the source carries a drop flag, the transfer additionally clears it (`file__live = false;`). That is the only code a transfer ever emits.

C pass-by-value may physically copy the struct as transport. Delta treats that copy as the new sole owner; the callee drops its owned parameter, and the caller never drops or accesses the moved source.

### Implicit clone lowering

An implicit clone lowers to the same helper call as bare `clone`, with the same abort edge. These two programs generate identical C:

```delta
let b = doc;          // Document is Owned
let b = clone doc;
```

```c
delta_result_delta__Document __delta_result_0 = delta__Document_clone(&doc);
if (__delta_result_0.tag != 0) {
    delta_abort("allocation failed in implicit clone");
}
const delta__Document b = __delta_result_0.value;
```

The abort message distinguishes the implicit form so a crash report points at a `let b = doc;` line without the reader wondering where the allocation came from. Implicit clones at argument positions materialize into a temporary in source order before the call, on the same rules as any other lowering-introduced temporary.

### Auto-borrow call lowering

Given:

```delta
function inspect(document: &Document): void { }
function revise(document: edit &Document): void { }

inspect(document);
revise(document);
```

lower the contextual borrows to addresses at the C boundary:

```c
delta__inspect(&document); /* parameter: const delta__Document* */
delta__revise(&document);  /* parameter: delta__Document* */
```

When the argument is already represented as a C pointer (`&T` or `edit &T`), pass that pointer through; an `edit &T → &T` reborrow relies on the callee's `const T*` parameter. Field/index paths lower to their address after evaluating each index exactly once. Implicit and explicit borrows generate identical C and identical analyzer metadata. No drop, clone, move, or ownership flag is emitted for an auto-borrow.

### Borrow parameter and receiver lowering

On the callee side a borrow parameter is a C pointer, and member access through it uses `->`:

- `&T` → `const <CType>* name`.
- `edit &T` → `<CType>* name`.
- `param.field` → `param->field`.
- `param.method(args)` → `delta__<module>__<Type>_method(param, args...)`, passing the parameter pointer straight through as the receiver. This is identical to Phase L receiver dispatch, where the receiver was already a pointer in the C ABI; no extra address-of or deref is emitted.
- Re-passing a borrow parameter to a nested call forwards the pointer unchanged (`&T` → `&T`, `edit &T` → `edit &T`, or `edit &T` reborrowed as the nested `const T*`).

Const-qualification is belt-and-suspenders: the analyzer has already rejected every mutation through a `&T`, and the C `const T*` makes the same guarantee at the C level. Two `edit &` arguments on the same root are rejected by the exclusivity check, so distinct `T*` arguments never alias; `restrict` is **not** emitted in this phase (a post-v0.5 optimization, not a correctness need).

Given:

```delta
function (document: &Document) inspect(): void { /* reads only */ }
function (document: edit &Document) revise(): void { /* mutates */ }

document.inspect();
document.revise();
```

lower to:

```c
delta__Document_inspect(&document); /* receiver: const delta__Document* */
delta__Document_revise(&document);  /* receiver: delta__Document* */
```

Owned replacement first materializes the incoming value, then drops the old value, then stores the replacement. For example:

```delta
current = move next;
```

```c
delta__Document __delta_replacement_0 = next;
delta__Document_drop(&current);
current = __delta_replacement_0;
/* next is Moved and is not dropped */
```

For `current = clone source as result`, the clone result is checked before `current` is dropped. Thus allocation failure leaves `current` untouched. Bare `current = clone source` calls the same helper and aborts on the error tag, so `current` is dropped and replaced only on success — failure likewise never leaves a partial value. Indexed destinations and source paths with non-trivial index expressions are evaluated exactly once into temporaries before clone/drop helpers are called.

### Derived clone lowering

Given a non-Copyable Cloneable record:

```delta
type Document = { title: string; bytes: Array<uint8>; revision: uint64; };
```

the generated shape is:

```c
typedef struct delta_result_delta__Document {
    uint8_t tag;              /* 0 = success; non-zero = AllocError */
    delta__Document value;
} delta_result_delta__Document;

static delta_result_delta__Document
delta__Document_clone(const delta__Document* src) {
    delta__Document dst;

    delta_result_string title = delta_string_clone(&src->title);
    if (title.tag != 0) {
        return (delta_result_delta__Document){ .tag = title.tag };
    }
    dst.title = title.value;

    delta_result_Array_u8 bytes = delta_Array_u8_clone(&src->bytes);
    if (bytes.tag != 0) {
        delta_string_drop(&dst.title);
        return (delta_result_delta__Document){ .tag = bytes.tag };
    }
    dst.bytes = bytes.value;
    dst.revision = src->revision;

    return (delta_result_delta__Document){ .tag = 0, .value = dst };
}
```

The exact result typedef follows Phase C's result ABI. The invariant is that every failure edge drops all previously completed owned fields in reverse order and never exposes a partially initialized `dst`.

A use site:

```delta
const copy = clone original as result;
check result { return 1; }
```

lowers through the existing pending-result/commit pattern:

```c
delta_result_delta__Document __delta_result_0 = delta__Document_clone(&original);
if (__delta_result_0.tag != 0) {
    delta__Document_drop(&original); /* if live on this return edge */
    return 1;
}
const delta__Document copy = __delta_result_0.value;
```

The result temporary does not independently own `.value` after commit; ownership transfers into `copy` without another drop obligation.

The bare, aborting form needs no `check`:

```delta
const copy = clone original;
```

```c
delta_result_delta__Document __delta_result_0 = delta__Document_clone(&original);
if (__delta_result_0.tag != 0) {
    delta_abort("allocation failed in clone");
}
const delta__Document copy = __delta_result_0.value;
```

The same helper is called; only the failure edge differs — it aborts instead of routing to a handler. No scope-exit cleanup runs on the abort path, because abort terminates the process.

### Custom disposal and total drop lowering

For:

```delta
function (file: edit &TempFile) dispose(): void {
    os.close(file.fd);
}
```

emit the user hook and compiler wrapper separately:

```c
static void delta__TempFile_dispose(delta__TempFile* file) {
    delta_os_close(file->fd);
}

static void delta__TempFile_drop(delta__TempFile* value) {
    delta__TempFile_dispose(value); /* custom cleanup first */
    delta_string_drop(&value->path); /* then owned fields, reverse order */
    /* fd is Copyable and needs no field cleanup */
}
```

A Unique record without a custom hook still gets `_drop` when it owns droppable fields. A primitive-only Unique identity token needs no emitted helper; its ownership is enforced entirely by the analyzer.

### Scope-exit cleanup lowering

At every normal or early exit, emit `_drop` calls for the bindings proven live on that CFG edge, in reverse lexical declaration order. For example:

```delta
let a = makeDocument() as result;
check result { return 1; }
let b = clone a as result;
check result { return 2; }
return 0;
```

has the successful-exit shape:

```c
/* a and b constructed above */
delta__Document_drop(&b);
delta__Document_drop(&a);
return 0;
```

Each early result-error edge emits only cleanup for values live at that edge. Codegen may inline the calls before each terminator or branch to deduplicated cleanup labels; either form must preserve reverse lexical order and custom-before-fields order.

An implicit-transfer return materializes the return value, cleans up every other live owner, and returns without dropping the transferred source:

```delta
return document;
```

```c
delta__Document __delta_return_0 = document;
/* drop other live locals in reverse order; do not drop document */
return __delta_return_0;
```

Owned by-value parameters participate in the same exit cleanup as locals unless they were moved onward or returned.

Moved bindings are omitted statically:

```delta
consume(a);
return 0;
```

```c
delta__consume(a);
return 0; /* callee owns/disposes a; caller emits no drop */
```

### Drop-flag lowering

For each binding the analyzer marked as requiring a flag, declare `bool <name>__live` immediately after the binding, initialized to the binding's state at that point (`true` after a successful initialization, `false` for a declared-but-unassigned binding). Then:

- every transfer of the binding appends `<name>__live = false;`;
- every revival appends `<name>__live = true;`;
- every cleanup site for the binding on an edge where it is `MaybeMoved` emits `if (<name>__live) { <Type>_drop(&<name>); }` in place of the unconditional drop.

Reverse lexical order is unchanged; a flag-gated drop occupies the same slot in the sequence its unconditional form would have.

```delta
let doc = makeDocument() as result; check result { return 1; }
let tmp = openTemp() as result;     check result { return 2; }
if (cond) {
    archive(tmp);
}
return 0;
```

```c
/* doc, tmp constructed above */
bool tmp__live = true;
if (cond) {
    delta__archive(tmp);
    tmp__live = false;
}
if (tmp__live) { delta__TempFile_drop(&tmp); }  /* flag-gated: tmp is MaybeMoved */
delta__Document_drop(&doc);                     /* unconditional: doc is Live */
return 0;
```

`doc` gets no flag: it is `Live` on every edge reaching the exit. Only `tmp` pays, and only because its state is genuinely ambiguous. A flag never escapes its function, is never stored in a record, and is never consulted by a `_drop` helper — helpers remain unconditional, and gating happens entirely at the call site. This keeps flags a property of *code*, not of *values*: record layout (line "Record layout remains the Phase K C struct layout") is untouched, and a value's flag state never travels with it across a function boundary.

Beyond drop flags, no generated ownership path uses pointer nulling, zeroing, reference counts, per-object metadata, or hidden heap allocation.

## Testing strategy

Add fixtures under `test-source/tests/ownership/`.

**Ownership and capability inference**

- Copyable primitive-only record copies and passes by value.
- `owned<T>`, `string`, and `Array<T>` are ownership roots and never Copyable.
- A record containing an ownership root becomes Owned transitively and is not Copyable.
- Nested records propagate `OwnsResources` through every containing record.
- Heap-owning record is Owned/Cloneable, not Unique.
- Primitive-only record is both Copyable and Cloneable.
- Any non-Copyable member prevents the containing record from being Copyable.
- Explicit `unique type` is Unique even with only primitive fields.
- Records containing Unique members become structurally Unique and cannot clone.
- Nested Clone-only records derive recursive clone helpers.
- `owned type X = { ... };` is not recognized as a declaration form.

**Unique disposal**

- Valid same-module `function (x: edit &T) dispose(): void` on `unique type`.
- `dispose` on bare record is rejected with a `unique type` hint.
- Wrong receiver, parameters, return type, overload, orphan hook, export, and manual call are rejected.
- Custom cleanup precedes reverse-order field cleanup.
- A moved owner is not disposed at the source; its destination is disposed once.
- Unique record without custom `dispose` is accepted.

**Tier dispatch on bare use**

- Bare `let b = a;` copies a Plain record, clones an Owned record (source still usable), and moves a Unique record (source unusable afterward).
- Bare `f(a)` does the same at an argument position when the parameter is by-value `T`.
- A bare use and its explicit spelling generate identical C: `f(a)` vs `f(move a)` for Unique, `let b = a;` vs `let b = clone a;` for Owned.
- Adding a `unique` field to a record flips a previously-cloning bare use to a transfer; a second use of the source then fails with use-after-move rather than compiling silently. (Guards the "tier changes are loud in the breaking direction" claim.)
- `f(x.handle)` on a Unique field path is a partial-move error (E0704), not an implicit move.
- `clone v` on Copyable `v` warns. `move v` on Copyable `v` does **not** warn and does invalidate `v` (§14.11). `move f` on Unique `f` and `clone doc` on Owned `doc` do not warn.

**Move dataflow**

- Simple move, double move, use after move, and move of uninitialized/const/borrowed values.
- Both-branch move joins to `Moved` with no flag emitted.
- Diverging-branch move leaves the survivor `Live` with no flag emitted.
- Loop move with and without revival.
- Whole-value revival succeeds; partial revival fails.
- Implicit return transfer succeeds.
- **Return-value clone elision**: `return doc;` on an Owned local transfers rather than cloning; codegen shows no `_clone` call and no drop of `doc`. A `return doc;` where `doc` is *also* borrowed or used on another reaching path still behaves correctly.

**Drop flags**

- One-branch move compiles; codegen shows `bool f__live`, the clearing assignment in the moving branch, and the `if (f__live)` gate at the exit.
- Use of a `MaybeMoved` binding is **still rejected**, and the diagnostic names both the moving and non-moving predecessors.
- A binding that is `Live` on every reaching edge gets no flag and an unconditional drop; a binding that is `Moved` on every reaching edge gets no flag and no drop. (Guards "flags only where genuinely ambiguous".)
- Revival sets the flag back to `true`; a moved-then-revived binding is dropped exactly once.
- Loop carrying a `MaybeMoved` binding across the back-edge compiles when the binding is unused in the next iteration; using it there is rejected (E0705).
- Multiple flagged bindings drop in reverse lexical order, with flag gates in the correct slots.
- No `_drop` helper consults a flag; no flag appears in any record layout.

**Clone**

- Clone-only record clones via bare `clone` (type `T`) and via `clone ... as result`; source and clone remain independently usable in both.
- Bare `clone` of a Clone-only record produces a value usable without a `check`; codegen shows the abort-on-error-tag edge.
- Implicit clone lowers to the same helper and the same abort edge, with an abort message identifying the implicit form.
- Copyable record accepts clone as a warned plain copy without generating a clone helper.
- Unique clone is rejected — the one remaining hard error in the ownership-site table.
- Copyable clone warns (both bare and `as result`).
- Mid-clone allocation failure disposes completed fields transactionally before the helper reports the error (`as result` returns it; bare and implicit abort).

**Overload ranking**

- Given both `f(&Document)` and `f(Document)`, the call `f(doc)` selects the borrow overload and emits no clone.
- With only `f(Document)` in scope, `f(doc)` implicitly clones.
- `f(move doc)` and `f(clone doc)` force the by-value candidate over an available borrow overload.
- Given both `f(&Point)` and `f(Point)` with Copyable `Point`, `f(p)` still selects by-value (rule 1 is unchanged).

**Borrow basics and capability**

- `&T` / `edit &T` parameter accepted; reads and mutations through them compile.
- `&Self` receiver method calls a non-`edit` method; a `&Self` receiver calling an `edit` method is rejected.
- `edit &Self` receiver calls both `edit` and non-`edit` methods.
- `&T[]` / `&string` classify as non-owning borrows; diagnostics consistently spell mutable borrows `edit &`.

**Borrow creation capability**

- `const a` → `&a` ok; `const a` → `edit &a` rejected.
- `let a` → both `&a` and `edit &a` ok (sequential calls).
- Bare addressable `T` arguments auto-borrow for `&T` parameters; mutable bare `T` auto-borrows exclusively for `edit &T`, and a `const` source is rejected for an `edit &T` parameter.
- An existing `edit &T` reborrows down to `&T`; an existing `&T` cannot upgrade to `edit &T`.
- An explicit `edit &x` at a `&T` parameter is rejected with a "pass `&x`" hint.
- Auto-borrowing a temporary is rejected with a bind-first diagnostic; implicit and explicit borrows produce identical C and identical metadata.

**Exclusivity within a call**

- `f(&a, &a)` ok (multiple immutable readers).
- `f(edit &a, &a)` rejected; `f(edit &a, edit &a)` rejected; `f(edit &a, edit &b)` ok.
- `f(move a, &a)` rejected (move/borrow overlap in one arg list).
- Field-path operands group by root: `f(edit &a.x, &a.y)` is rejected on root `a`; the diagnostic names the shared root and conflicting positions.

**Non-escape**

- `let x: &T = ...;` rejected (borrows are parameter-only).
- A function returning `&T` is rejected.
- A record field of borrow type is rejected.
- A `&T` parameter re-passed to a nested `&T`/`edit &T` call is accepted.

**Borrow sequencing with move-state**

- `g(&a); consume(move a);` legal (the borrow ended with the prior call).
- `consume(move a); g(&a);` rejected as borrow-of-moved.

**Borrow vs. by-value**

- Passing `&x` where the callee expects owned `T` is rejected with a `clone` hint.

**Codegen snapshots**

- `read(value)` lowers to `delta__read(&value)`; `value.inspect()` lowers to `delta__<Type>_inspect(&value)`; existing borrow parameters pass the pointer through; field access through a borrow uses `->`.

**Deferred (forward-contract only, not tested in this phase)**

- Returned/stored borrows and the `viewing <source>` clause — out of scope until escape is allowed.
- Moving a source with a live returned/stored borrow — depends on escaping borrows.

All earlier record, receiver, and control-flow fixtures continue to pass.

## Implementation order

1. Parse and register `unique type`.
2. Implement recursive capability inference for primitives and records.
3. Add `move` / `clone` AST and type checking; reserve and parse `new` (its `owned<T>` typing and lowering are deferred to Phase H).
4. Implement tier dispatch at bare assignment, bare by-value argument, and `return`, including the return-value clone-elision rule. Do this *after* step 3 so the explicit keywords are the reference semantics and the implicit forms desugar onto them rather than the reverse — every implicit site should lower through the same path as its explicit spelling, which is what makes the "identical C" fixtures cheap to write.
5. Implement move-state dataflow, joins, loops, and revival.
6. Implement drop-flag allocation (which bindings need one) and lowering (declare, clear at transfers, set at revivals, gate cleanup). Land this immediately after the dataflow and before the fixture matrix, because the one-branch-move case is unreachable-but-accepted until the flag exists.
7. Generate structural clone helpers and transactional cleanup.
8. Generate automatic field cleanup and gate it with move state.
9. Validate and lower receiver-based `dispose()` for explicitly Unique records.
10. Reserve `&`; parse `ReferenceType` / `ReferenceExpression`; reject reference types outside parameter positions.
11. Add `SymbolParameter.ReferenceKind`; type reference expressions (operand validity, creation capability, root resolution, move-state check).
12. Implement root-based exclusivity at call sites, including the move-vs-borrow overlap rule, and contextual auto-borrowing during overload/receiver resolution. Apply the inverted ranking here: auto-borrow outranks by-value for non-Copyable arguments. Step 4's implicit clone is a silent perf regression at every call site until this lands, so the two should be reviewed together even though they are ordered apart.
13. Implement capability dispatch through borrows and the non-escape diagnostics.
14. Lower borrow parameters to C pointers, member access to `->`, and receiver dispatch through borrows; verify auto-borrow and explicit borrows emit identical C.
15. Add the ownership, tier-dispatch, drop-flag, and borrow fixture matrices.

## Risks and open questions

- **Root-based exclusivity is conservative.** Grouping borrow operands by root identifier rejects `f(edit &obj.a, &obj.b)` even though the sub-paths are disjoint. This is the spec's MVP rule; path-sensitive exclusivity is a possible post-v0.5 refinement.
- **Lifetime beyond call scope.** The MVP relies on borrows never outliving their call, so no region/lifetime variable system is built. When borrows are later allowed to escape (returns, stored fields), the `viewing <source>` contract and the lifetime-design document must grow into real analysis; the capability table already reserves the "aggregate containing `edit &` is Unique" rule for that moment.
- **Fallible methods through borrows.** An `edit &Counter` calling a method returning `void | OverflowError` reuses the result-struct ABI and the receiver-as-pointer pattern unchanged — verified by the `bump`-style acceptance fixture.
- **`restrict` on `edit &` parameters.** Exclusivity guarantees non-aliasing C pointers, so `restrict` could be emitted, but it is deferred as a perf optimization with a large correctness-testing surface.
- **Open: returning an owned `const` local.** `return x` is described as an implicit transfer of a non-Copyable `x`, but §11 says `const` is non-consuming. Whether a non-Copyable `const` local may be returned (forcing `let` for factories) or is rejected is unresolved and should be pinned down with §11. Tier dispatch makes this *more* urgent: with the clone-elision rule, `return doc` on a `const` Owned local is either a transfer (contradicting §11) or a silent deep copy (a perf cliff on the most common factory shape). Both readings are bad; §11 needs an answer before step 4.
- **Fixed in this revision: `move` on a Copyable value.** The ownership-site table previously read "warning; copy, source remains live," which contradicted both the move-state dataflow section in this plan and §14.3/§14.11 in the spec. The spec had already settled it — `move` on a copyable value transfers, invalidates the source, and is **not** diagnosed — and the table has been corrected to match. No open question remains; the entry is kept so the correction is visible to anyone working from an older copy of the table.
- **Implicit clone in a loop is an accepted footgun.** A by-value ownership-taking callee invoked in a loop silently clones per iteration and can abort on OOM. The overload ranking confines this to callees with no borrow-taking alternative, but it does not eliminate it. Mitigation is a post-v0.5 lint, not a language rule. This is the deliberate price of the ergonomics decision and should be re-examined if it shows up in real code more often than expected.
- **Tier is invisible at the use site.** Whether `let b = a;` copies, clones, or kills `a` depends on `a`'s inferred tier, which depends transitively on field types across module boundaries. Removing a `unique` field turns a transfer into a silent deep clone at every distant bare use — a perf change with no diagnostic. The reverse direction (adding a `unique` field) fails loudly with use-after-move, so the dangerous direction is the quiet one. Editor affordance (tier shown on hover / inlay hint) is the intended mitigation and should be treated as part of the language's usability story rather than an IDE nicety.
- **Settled: static type of `clone`.** `clone x` has type `T` and aborts on allocation failure; `clone x as result` has the Phase C result-carrier type and surfaces `AllocError`. This removes the earlier "is clone uniformly fallible" ambiguity.
- **Settled: drop flags.** Conditional moves compile; cleanup for a `MaybeMoved` binding is gated on a hidden `bool`. Flags are emitted only where the state is genuinely ambiguous, never travel with a value, and never appear in a record layout. This supersedes the earlier no-drop-flags decision and the "diverge the moving branch" workaround, which is now an idiom rather than a requirement. Uses of a `MaybeMoved` binding remain rejected — flags make it disposable, not usable.

## Definition of done

- Every value has statically known resource-ownership, Copyable, Cloneable, and Unique properties satisfying the model invariants.
- A bare use of any value is accepted and does the tier-appropriate thing: copy for Plain, clone for Owned, transfer for Unique. Ordinary code names no ownership operation.
- Each bare use and its explicit spelling (`move` / `clone`) generate identical C.
- `move x` opts an Owned value out of implicit cloning; `clone x as result` is the only way to handle allocation failure. Both keywords retain a job that bare use cannot do.
- Redundancy warnings fire only on the Copyable tier, where the keyword misrepresents what happens.
- `return` on an Owned local elides the clone and transfers, so factories do not deep-copy their result.
- Use-after-move is rejected statically, including use of a `MaybeMoved` binding.
- Conditional moves compile. A binding that is `MaybeMoved` at a cleanup point is disposed under a drop flag; every other binding is disposed statically with no flag and no branch.
- Auto-borrow outranks by-value for non-Copyable arguments, so `f(doc)` borrows whenever the callee offers a `&T` alternative.
- Every non-Unique record is Cloneable; non-Copyable records clone recursively. `clone x` aborts on allocation failure by default, and the optional `clone x as result` surfaces `AllocError` transactionally.
- Custom cleanup is expressible only by an explicitly Unique record and cannot be called manually.
- Generated cleanup disposes each live owner exactly once, skips moved-from sources, and gates ambiguous ones on their flag. No flag appears in a record layout or crosses a function boundary.
- No class dependency remains in Phase F.
- `&T` / `edit &T` parameters compile and lower to `const T*` / `T*`; the acceptance program's borrow-using calls (`readSum(&a, &b)`, `a.add(5)`) compile and run, and the exclusivity-violating variants are rejected with diagnostics that name the shared root and conflicting positions.
- Contextual auto-borrowing and explicit `&x` / `edit &x` produce identical C and identical analyzer metadata; `const` sources yield `&` only.
- A `&Self` receiver cannot call an `edit` receiver method; capability dispatch through borrows is enforced.
- Borrows cannot escape: no borrow return type, record field, or local binding; re-passing a borrow to a nested call is accepted.
- A borrowed root cannot be moved within the same call's argument list, and a moved binding cannot be borrowed.
- The `viewing <source>` lifetime story and escaping borrows remain a documented forward contract, not implemented in this phase.
