## 15. Lifetimes

Section 15 defines Delta's post-MVP lifetime model: how safe references and view values remain tied to the storage they observe, how returned references and stored references become legal, how lifetime-bearing aggregates are described, and how mutable reference exclusivity extends beyond a single call. The recurring principles are **references are non-owning values**, **a reference or view may not outlive its source**, **the compiler writes lifetime contracts into source**, and **ownership remains single-owner**: lifetimes constrain observation, never disposal responsibility.

The reference forms used throughout the spec are:

- **`&T`** is a read-only reference to `T`.
- **`edit &T`** is a mutable, exclusive reference to `T`.
- **`&x`** creates a read-only reference to addressable storage `x`.
- **`edit &x`** creates a mutable reference to addressable storage `x`.

---

### 15.1 Reference Values and Lifetime Sources

**Proposal.** A reference is a non-owning, non-null value that points at existing storage. A reference can read or mutate according to its capability, but it never owns, moves, releases, disposes, frees, or reallocates the referenced storage.

The lifetime checker tracks the **source** of every non-owning value:

- `&T`,
- `edit &T`,
- `Slice<T>`,
- `stringview`,
- `cstringview`,
- any class or record marked as a view type,
- any aggregate that transitively contains one of the above.

The core rule is:

> A reference or view may not outlive its source.

For an escaping value, valid source roots are:

- a reference parameter (`&T` or `edit &T`),
- a reference-typed local whose own source is still valid,
- `this`, when the result is derived from the receiver storage itself,
- a field path through `this` or a parameter that reaches an already-tracked reference or view,
- `static`, for program-lifetime storage such as string literals and file-scope compile-time constants.

Owned locals and owned by-value parameters may be referenced for local use, but they are not valid sources for a returned or stored escaping reference, because they are disposed when their scope or function exits.

Reference creation operands are addressable places: bindings, fields, heap auto-deref paths, and indexed elements whose container storage remains stable for the reference lifetime. Slice expressions produce view values rather than `&T` references and are lifetime-checked through view provenance.

**Reason.** "Reference" describes the user's mental model better than "referenced": `const r = &x` means `r` contains a reference to `x`, not ownership of `x`. The referent remains owned elsewhere. This keeps zero-copy APIs explicit while avoiding raw pointers, nullable references, pointer arithmetic, and manual cleanup.

Unifying views with references removes the MVP distinction between "fresh-derived" and "pass-through" views. Under the lifetime system, every view carries provenance. A view parameter is no longer a trusted opaque value; it is a non-owning value whose source is tracked across calls.

**Examples.**
```ts
function length(v: &Vec3): float32 {
  return sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function translate(pos: edit &Vec3, amount: Vec3): void {
  pos.x += amount.x;
  pos.y += amount.y;
  pos.z += amount.z;
}

length(&position);
translate(edit &position, delta);
```

References do not own:
```ts
unique class File {
  dispose(): void { /* close descriptor */ }

  public read(): int32 { /* ... */ }
}

function inspect(f: &File): int32 {
  return f.read();                    // OK - read through reference
}

function badReturn(f: &File): File {
  return f;                           // ERROR - reference is not an owner
}

function badMove(f: &File): void {
  consume(move f);                    // ERROR - cannot move from a reference
}
```

Local references are allowed when their source remains live:
```ts
let count: int32 = 41;
const r = &count;                     // r: &int32
print(r);                             // OK

const m = edit &count;                 // m: edit &int32
m += 1;                               // OK - mutates count through the reference
```

But a reference cannot outlive its source:
```ts
let r: &string;

{
  let s = string.from("hello") as result;
  check result { panic("allocation failed"); }
  r = &s;                             // ERROR - r would outlive s
}

print(r);
```

References cannot be made from temporaries:
```ts
inspect(&makeFile());                 // ERROR - cannot reference a temporary
read(&42);                            // ERROR - literal has no named storage
```

**Conclusion.** `&T` and `edit &T` are safe references, not raw pointers. They are non-owning values whose lifetime is bounded by their source. View values participate in the same lifetime system.

---

### 15.2 The `@lifetime(...)` Attribute

**Proposal.** Every declaration that returns or defines a lifetime-bearing value has a compiler-generated `@lifetime(...)` attribute. Humans do not write the attribute by hand; the compiler infers it from the body or fields and writes the result into source. If the attribute and body drift apart, compilation fails.

For direct returned references and views, the attribute lists source paths:

```ts
@lifetime(xs)
function first<T>(xs: &Slice<T>): &T {
  return xs[0];
}

@lifetime(a, b)
function pick(a: &int32, b: &int32, chooseA: bool): &int32 {
  if (chooseA) return a;
  return b;
}

@lifetime(static)
function greeting(): stringview {
  return "hello";
}
```

`@lifetime(a, b)` means the returned value is valid only while **all** listed sources are valid. It is an intersection: the result dies when the first listed source dies.

For returned lifetime-bearing aggregates, the attribute maps returned field paths to source paths:

```ts
@lifetime(source: src)
function makeParser(src: &string): Parser {
  return Parser { source: src, pos: 0 };
}

@lifetime(left: a, right: b)
function makePair(a: &Slice<int32>, b: &Slice<int32>): PairView {
  return PairView { left: a, right: b };
}

@lifetime(parser.source: src)
function makeStream(src: &string): TokenStream {
  return TokenStream { parser: Parser.create(src) };
}
```

The names before `:` are field paths in the returned value. The names after `:` are source paths visible in the returning function. They are not abstract lifetime variables.

When a single returned field is derived from multiple possible sources, the source side uses a parenthesized source list:

```ts
@lifetime(value: (a, b))
function pickBox(a: &int32, b: &int32, chooseA: bool): BoxedRef {
  if (chooseA) return BoxedRef { value: a };
  return BoxedRef { value: b };
}
```

**Reason.** Source-level contracts solve the producer, reviewer, consumer, and cross-module visibility problem without Rust-style lifetime variables. The compiler still performs inference, but the inferred result is recorded in the declaration where a reviewer can see it. A body change that broadens a lifetime dependency changes the generated attribute and becomes visible in the producer's diff.

Using field paths for aggregates preserves precision without introducing lifetime slots. The contract says exactly which returned field path is tied to which source.

**Examples.**
Missing direct-return annotation:
```ts
function bad(xs: &Slice<int32>): &int32 {
  return xs[0];
}
```

Diagnostic shape:
```txt
error: function returns reference type `&int32` but has no @lifetime(...)
hint: compiler would write `@lifetime(xs)`
```

Mismatched direct-return annotation:
```ts
@lifetime(static)
function bad(xs: &Slice<int32>): &int32 {
  return xs[0];
}
```

Diagnostic shape:
```txt
error: @lifetime(static) does not match returned value
note: returned reference is derived from parameter `xs`
```

Missing aggregate mapping:
```ts
function bad(src: &string): Parser {
  return Parser { source: src, pos: 0 };
}
```

Diagnostic shape:
```txt
error: function returns lifetime-bearing type `Parser` but has no @lifetime mapping
hint: compiler would write `@lifetime(source: src)`
```

Mismatched aggregate mapping:
```ts
@lifetime(source: static)
function bad(src: &string): Parser {
  return Parser { source: src, pos: 0 };
}
```

Diagnostic shape:
```txt
error: @lifetime mapping does not match returned value
note: returned field `source` is derived from `src`, not `static`
```

**Conclusion.** `@lifetime(...)` is mandatory and compiler-generated for returned references, returned views, and returned lifetime-bearing aggregates. Direct returns list sources; aggregate returns map returned field paths to sources.

---

### 15.3 Reference-Typed Fields in Classes and Records

**Proposal.** Classes and `type` records may contain reference-typed fields and view fields. Any declaration that directly or transitively contains such fields is lifetime-bearing and receives a compiler-generated `@lifetime(...)` attribute listing the lifetime-bearing field paths.

```ts
@lifetime(source)
class Parser {
  private source: &string;
  private pos: uintsize;
}

@lifetime(lexeme)
type Token = {
  kind: TokenKind;
  lexeme: stringview;
};

@lifetime(parser.source)
class TokenStream {
  private parser: Parser;
}
```

The paths in class and record annotations are real field paths, not named lifetime slots. They may mention private fields. In annotation context, those paths are provenance metadata, not ordinary field access, and they do not grant user code permission to read private fields.

An exported type's generated lifetime field paths are part of its source-level contract. Renaming a private field that appears in generated lifetime metadata changes that contract and appears in source diffs.

**Reason.** A type containing a reference is not an ordinary self-contained value. The type declaration itself must reveal that values of the type are tied to external storage, or separate compilation cannot reason about values that cross module boundaries.

Using real field paths avoids Rust-style lifetime parameters and avoids a second namespace of lifetime slots. The tradeoff is that private field names can appear in generated metadata; this is accepted because the compiler writes the metadata and because it is needed for precise cross-module checking.

**Examples.**
Iterator over a referenced slice:
```ts
@lifetime(source)
class SliceIter<T> {
  private source: &Slice<T>;
  private index: uintsize;

  @lifetime(source: xs)
  public static create(xs: &Slice<T>): SliceIter<T> {
    return SliceIter { source: xs, index: 0 };
  }

  @lifetime(this.source)
  public edit next(): &T | None {
    if (this.index >= this.source.len()) {
      return None;
    }
    const item = &this.source[this.index];
    this.index += 1;
    return item;
  }
}
```

Parser holding referenced source:
```ts
@lifetime(source)
class Parser {
  private source: &string;
  private pos: uintsize;

  @lifetime(source: src)
  public static create(src: &string): Parser {
    return Parser { source: src, pos: 0 };
  }

  @lifetime(lexeme: this.source)
  public edit parseToken(): Token {
    /* returns a token whose lexeme is a view into source */
  }
}
```

Missing declaration annotation:
```ts
class BadParser {
  private source: &string;
  private pos: uintsize;
}
```

Diagnostic shape:
```txt
error: class `BadParser` contains lifetime-bearing field `source` but has no @lifetime(...)
hint: compiler would write `@lifetime(source)`
```

Nested field path:
```ts
@lifetime(parser.source)
class TokenStream {
  private parser: Parser;

  @lifetime(parser.source: src)
  public static create(src: &string): TokenStream {
    const parser = Parser.create(src);
    return TokenStream { parser };
  }
}
```

**Conclusion.** Reference and view fields are legal in classes and records under the lifetime system. The declaration records real lifetime-bearing field paths with compiler-generated `@lifetime(...)`.

---

### 15.4 Constructing, Assigning, and Returning Lifetime-Bearing Values

**Proposal.** Construction of a lifetime-bearing aggregate checks that every reference or view field is initialized from a source that will outlive the constructed value. Returning or storing such a value requires a `@lifetime(...)` mapping when the value escapes the current function or scope.

For local values, owned locals and owned by-value parameters may be referenced as long as the lifetime-bearing value dies before the source:

```ts
function parseOwned(src: string): Ast | ParseError {
  let parser = Parser.create(&src);     // OK - parser dies before src
  return parser.parseExpr();
}
```

For returned values, owned locals and owned by-value parameters are not valid sources:

```ts
@lifetime(source: src)
function bad(src: string): Parser {
  return Parser.create(&src);           // ERROR - src is owned by this function
}
```

**Reason.** Lifetimes are checked at the place where a non-owning value is created or made to escape. Local references to owned storage are useful and safe when the compiler proves the non-owning value dies first. Returning that non-owning value would expose a pointer to storage that is about to be disposed.

**Examples.**
Returning a parser tied to a reference parameter:
```ts
@lifetime(source: src)
function parserFor(src: &string): Parser {
  return Parser.create(src);            // OK
}
```

Storing a parser beyond its source:
```ts
let p: Parser;

{
  let src = string.from("let x = 1") as result;
  check result { panic("allocation failed"); }
  p = Parser.create(&src);              // ERROR - p would outlive src
}

p.parseExpr();
```

Diagnostic shape:
```txt
error: `Parser` value would outlive referenced source `src`
note: field `Parser.source` is tied to `src`, which ends at the block
```

Returning a value with a local source:
```ts
@lifetime(source: static)
function badParser(): Parser {
  let src = string.from("let x = 1") as result;
  check result { panic("allocation failed"); }
  return Parser.create(&src);           // ERROR
}
```

Diagnostic shape:
```txt
error: returned `Parser.source` would reference local `src`
note: `src` is disposed when `badParser` returns
```

Pending fallible bindings cannot be referenced before they are checked:
```ts
function bad(path: stringview): void {
  const file = File.open(path) as result;
  inspect(&file);                       // ERROR - file is pending fallible result

  check result { return; }
  inspect(&file);                       // OK
}
```

**Conclusion.** Lifetime-bearing construction is local and explicit: every field's source must outlive the constructed value. Escaping values cannot be tied to owned locals, owned by-value parameters, temporaries, or pending fallible results.

---

### 15.5 Methods, `this`, and Field-Path Provenance

**Proposal.** Method lifetime annotations may refer to:

- `this`, when the returned value is derived from the receiver storage itself,
- `this.field.path`, when the returned value is derived from a lifetime-bearing field path stored inside the receiver,
- ordinary parameters or parameter field paths.

`@lifetime(this)` and `@lifetime(this.source)` are different contracts.

`@lifetime(this)` means the returned reference or view cannot outlive the receiver value:

```ts
class Point {
  private x: int32;

  @lifetime(this)
  public xRef(): &int32 {
    return &this.x;
  }
}
```

`@lifetime(this.source)` means the returned value is tied to the source carried by the receiver field path, and may outlive the receiver object if that source outlives it:

```ts
@lifetime(source)
class Parser {
  private source: &string;
  private pos: uintsize;

  @lifetime(lexeme: this.source)
  public edit parseToken(): Token {
    /* token.lexeme points into this.source */
  }
}
```

**Reason.** A parser-produced token usually points into the original source text, not into the parser object itself. Tying such a result to `this` would be needlessly restrictive and would reject common safe patterns where the parser is local but the input remains live.

**Examples.**
Returning a token while the parser is local:
```ts
@lifetime(lexeme: src)
function parseOne(src: &string): Token {
  let parser = Parser.create(src);
  return parser.parseToken();           // OK - token tied to src, not parser
}
```

If `parseToken` were annotated as `@lifetime(this)`, the same code would fail:
```txt
error: returned `Token` would outlive local `parser`
note: method result is tied to `this`, which ends when `parseOne` returns
```

Returning a reference to receiver-owned storage:
```ts
class BufferCursor {
  private pos: uintsize;

  @lifetime(this)
  public positionRef(): &uintsize {
    return &this.pos;                   // tied to receiver storage
  }
}
```

**Conclusion.** `this` names receiver storage. `this.field.path` names provenance carried by a lifetime-bearing field path. Methods use whichever source the returned value actually observes.

---

### 15.6 Mutability, Exclusivity, and `edit &T`

**Proposal.** Read-only references may coexist. An `edit &T` reference is an exclusive mutable capability: while it is live, no other read-only reference, mutable reference, move, replacement, or disposal of the same place may occur through another path.

Creating an `edit &T` requires an edit-reachable source. A returned `edit &T` must be derived from an `edit &T` source or another edit-reachable path. An `edit &T` cannot be derived from `&T`.

```ts
@lifetime(buf)
function firstByte(buf: edit &Buffer): edit &byte {
  return edit &buf[0];
}

@lifetime(buf)
function bad(buf: &Buffer): edit &byte {
  return edit &buf[0];                  // ERROR - source is not mutable
}
```

The lifetime system replaces MVP's root-level exclusivity with place-level exclusivity. Two mutable references to disjoint fields are allowed; overlapping paths are rejected.

**Reason.** `edit &T` is the safe reference form of exclusive mutable access. Extending exclusivity over time is what makes reference fields, local reference bindings, iterators, cursors, and transaction guards safe. Place-level tracking removes the MVP false positive where independent fields of the same root cannot be passed mutably in one call.

**Examples.**
Field-disjoint mutable references:
```ts
type Line = {
  start: Point;
  end: Point;
};

function normalizePair(a: edit &Point, b: edit &Point): void { /* ... */ }

let line = makeLine();
normalizePair(edit &line.start, edit &line.end);  // OK - disjoint places
```

Overlapping paths:
```ts
editWholeAndPart(edit &line, edit &line.start);   // ERROR - prefix overlap
readAndEdit(&line.start, edit &line.start);      // ERROR - read and write same place
moveAndRead(move line, &line.start);            // ERROR - move overlaps reference
```

Local mutable reference extends the lock:
```ts
let buffer = makeBuffer();
const cursor = edit &buffer;

append(edit &buffer, 1);                 // ERROR - buffer already held by cursor
cursor.push(1);                         // OK
```

Graph aliasing not visible through field paths may still require runtime guards:
```ts
function swap(a: edit &Node, b: edit &Node): void {
  if (same(a, b)) { return; }            // runtime guard for graph aliasing
  /* ... */
}
```

**Conclusion.** `edit &T` is exclusive for its whole lifetime. The post-MVP lifetime checker uses place-level overlap instead of MVP root locking, while still relying on runtime identity checks for aliases the place model cannot see.

---

### 15.7 Ownership Tiers for Reference-Bearing Aggregates

**Proposal.** Reference-bearing aggregates participate in the ordinary ownership classifier.

- A read-only reference field (`&T`) is copyable as a value. Copying it copies the non-owning reference and preserves the same provenance.
- A view field such as `Slice<T>` or `stringview` is copyable as a value and preserves the same provenance.
- Cloneable owned fields still require `clone` to duplicate. Cloning an aggregate clones its owned cloneable fields and preserves reference/view provenance.
- A stored `edit &T` field is a unique capability. A class containing an `edit &T` field must be declared `unique class`. A record containing an `edit &T` field is unique-tier by structure.
- `dispose()` is permitted only on `unique class`, including unique classes whose reason for uniqueness is an `edit &T` field.

**Reason.** A read-only reference does not own or mutate its source, so duplicating the reference value is safe as long as all copies remain lifetime-checked. A mutable reference is different: duplicating it would create two exclusive capabilities to the same place, so any aggregate that stores one must be unique-tier.

This aligns references with Delta's ownership rules: copyable values may be duplicated by assignment, cloneable values require visible `clone`, and unique values can only be moved.

**Examples.**
Read-only reference fields can be copyable:
```ts
@lifetime(source)
class SliceIter<T> {
  private source: &Slice<T>;
  private index: uintsize;
}

let a = SliceIter.create(&xs);
let b = a;                            // OK if all fields are copyable
```

Cloneable owned fields keep the value cloneable, not copyable:
```ts
@lifetime(source)
class ParserWithErrors {
  private source: &string;
  private errors: Array<ParseError>;   // cloneable
}

let p = ParserWithErrors.create(&src);

consume(p);                           // ERROR - cloneable bare-pass forbidden
consume(&p);                          // OK - pass a reference
consume(move p);                      // OK - transfer ownership
consume(clone p);                     // OK - clone errors, preserve source provenance
```

Recoverable clone remains explicit:
```ts
let copy = clone p as result;
check result { return; }
```

Transaction guard with a mutable reference field:
```ts
@lifetime(db)
unique class Transaction {
  private db: edit &Database;
  private committed: bool;

  @lifetime(db: database)
  public static begin(database: edit &Database): Transaction {
    database.beginRaw();
    return Transaction { db: database, committed: false };
  }

  public edit commit(): void {
    this.db.commitRaw();
    this.committed = true;
  }

  dispose(): void {
    if (!this.committed) {
      this.db.rollbackRaw();
    }
  }
}
```

Using the guarded source while the transaction lives:
```ts
let tx = Transaction.begin(edit &db);

query(&db);                           // ERROR - db is held by tx.db
update(edit &db);                      // ERROR - db is held by tx.db
tx.commit();                          // OK
finish(move tx);                      // OK - unique values move
```

Missing `unique`:
```ts
@lifetime(db)
class BadTransaction {
  private db: edit &Database;
}
```

Diagnostic shape:
```txt
error: class `BadTransaction` contains mutable reference field `db`
note: stored `edit &T` fields require `unique class`
```

Invalid duplication:
```ts
let tx = Transaction.begin(edit &db);

let tx2 = tx;                         // ERROR - unique values cannot copy
let tx3 = clone tx;                   // ERROR - unique values cannot clone
consume(tx);                          // ERROR - unique bare-pass forbidden
consume(move tx);                     // OK
```

**Conclusion.** Read-only reference and view fields are copyable non-owning values. Stored mutable references are unique capabilities and force unique-tier behavior.

---

### 15.8 Views Under the Lifetime System

**Proposal.** `Slice<T>`, `stringview`, `cstringview`, and user-defined view types participate in the same lifetime model as references. The MVP fresh-derived/pass-through distinction is replaced by always-tracked provenance:

- A view derived from owned storage is tied to that storage.
- A view parameter carries source provenance from its caller.
- A returned or stored view must have a visible `@lifetime(...)` contract.
- A view sourced from `static` storage may be returned or stored with `@lifetime(static)`.

**Reason.** The MVP rule was intentionally local: it rejected views freshly derived from visible storage but trusted pass-through view values. Once lifetimes exist, that split is no longer needed. Treating every view as provenance-bearing closes the pass-through hole and makes views compose with references, fields, and returns.

**Examples.**
Pass-through now has an explicit contract:
```ts
@lifetime(v)
function passThrough(v: stringview): stringview {
  return v;
}
```

Derived view from a reference parameter:
```ts
class Document {
  private text: string;

  @lifetime(this)
  public viewText(): stringview {
    return this.text;
  }
}

@lifetime(doc)
function textOf(doc: &Document): stringview {
  return doc.viewText();
}
```

Stored view in a record:
```ts
@lifetime(text)
type CacheEntry = {
  text: stringview;
};

@lifetime(text: doc)
function cache(doc: &Document): CacheEntry {
  return { text: doc.viewText() };
}
```

String literal:
```ts
@lifetime(static)
function keyword(): stringview {
  return "return";
}

@lifetime(text: static)
function keywordEntry(): CacheEntry {
  return { text: "return" };
}
```

Owned local cannot escape through a view:
```ts
@lifetime(static)
function bad(): stringview {
  let s = string.from("hello") as result;
  check result { panic("allocation failed"); }
  return s;                            // ERROR - view is derived from local s
}
```

**Conclusion.** Views are lifetime-tracked non-owning values. The lifetime system generalizes and replaces MVP's local fresh-derived view escape rule.

---

### 15.9 Attribute Field Paths, Privacy, and API Surface

**Proposal.** Field paths in `@lifetime(...)` are provenance paths. They may refer to private fields of the declaring type or private fields inside another lifetime-bearing type. Such paths do not grant ordinary access to those fields.

```ts
@lifetime(source)
export class Parser {
  private source: &string;
}

@lifetime(lexeme: parser.source)
export function nextToken(parser: edit &Parser): Token {
  return parser.parseToken();
}
```

The external function above may mention `parser.source` in generated lifetime metadata even though user code cannot read `parser.source`.

**Reason.** Delta rejected separate lifetime slot names. With no slots, the precise contract must use real field paths. For exported APIs, this means lifetime-bearing private field names can become visible in generated metadata. The compiler owns these annotations, and their visibility is accepted as the cost of keeping the surface syntax source-name based instead of introducing Rust-style lifetime parameters.

**Examples.**
Annotation context does not bypass privacy:
```ts
function bad(parser: &Parser): &string {
  return &parser.source;               // ERROR - private field access
}
```

But generated metadata may mention the same path:
```ts
@lifetime(lexeme: parser.source)
function ok(parser: edit &Parser): Token {
  return parser.parseToken();          // OK
}
```

Bad path:
```ts
@lifetime(lexeme: parser.text)
function bad(parser: edit &Parser): Token {
  return parser.parseToken();
}
```

Diagnostic shape:
```txt
error: lifetime path `parser.text` does not exist
note: available lifetime-bearing path is `parser.source`
```

**Conclusion.** Lifetime field paths are metadata, not access. They can expose private provenance shape in generated contracts because there are no abstract lifetime slot names.

---

### 15.10 Diagnostics

**Proposal.** Lifetime diagnostics should name:

- the lifetime-bearing value or reference,
- the field path involved, when any,
- the source it is tied to,
- the place where that source ends,
- and the generated annotation the compiler expected, when helpful.

**Reason.** Lifetime failures are easiest to understand when the compiler reports the concrete source path rather than an abstract region. Delta's design intentionally uses ordinary source names, so diagnostics should preserve that clarity.

**Examples.**
Escaping local:
```txt
error: returned `Parser.source` would reference local `src`
note: `src` is disposed when `makeParser` returns
```

Escaping block-local:
```txt
error: `Token.lexeme` would outlive referenced source `line`
note: `line` ends at the close of this block
```

Mutable conflict:
```txt
error: cannot create read-only reference `&db` while `db` is held mutably
note: mutable reference is stored in live field `tx.db`
```

Annotation mismatch:
```txt
error: @lifetime(lexeme: static) does not match returned value
note: returned field `lexeme` is derived from `parser.source`
hint: compiler would write `@lifetime(lexeme: parser.source)`
```

**Conclusion.** Lifetime diagnostics name concrete values, field paths, and sources. They should prefer generated-fix hints over abstract lifetime terminology.

---

### 15.11 Explicit Non-Goals for Section 15

The following are deliberately out of scope or permanently excluded:

- **Rust-style lifetime parameters** such as `'a` or `Parser<'a>` - never in Delta source.
- **Human-written lifetime annotations** - `@lifetime(...)` is compiler-generated. Human edits that do not match inference are rejected.
- **Raw pointers, nullable references, pointer arithmetic, or manual free** - never part of safe Delta source.
- **Self-referential aggregates** - a value may not store a reference or view into its own owned fields.
- **Multi-return reference contracts** - functions returning several independent references in a tuple are deferred. A future spelling may map tuple positions, but this section does not specify it.
- **Early disposal to shorten a lifetime** - there is no manual dispose call. Narrow a lifetime with block structure or helper functions.
- **Whole-program graph alias proof** - place analysis handles syntactic field paths; graph aliasing through heap nodes may still require runtime `same(...)` checks.

**Examples.**
Self-referential aggregate:
```ts
class Bad {
  private text: string;
  private view: stringview;

  public static create(): Bad {
    let text = string.from("hello") as result;
    check result { panic("allocation failed"); }
    let view: stringview = text;
    return Bad { text: move text, view };   // ERROR - view points into same value
  }
}
```

Multi-return references deferred:
```ts
function ends<T>(xs: &Slice<T>): (&T, &T) {
  return (xs[0], xs[xs.len() - 1]);          // ERROR - multi-reference returns deferred
}
```

Manual disposal remains impossible:
```ts
let tx = Transaction.begin(edit &db);
tx.dispose();                               // ERROR - dispose is compiler cleanup
```

**Conclusion.** Section 15 lifts returned references, local references, stored references, and lifetime-bearing views, but it does not introduce raw pointers, self-referential values, manual disposal, or tuple-level multi-reference contracts.

---

### 15.12 Cross-Section Alignment

This section updates and aligns the following rules elsewhere in the spec:

- **§8 / §12 terminology** - the `&T` / `edit &T` reference syntax is used uniformly across the spec.
- **§11** - `const` and `let` still describe binding capability. A `const` binding may hold an `edit &T`; the binding is not reassignable, but the reference capability may still mutate its referent.
- **§12.4** - root-level call-only exclusivity is the MVP rule. Section 15 replaces it with place-level exclusivity over the lifetime of references and reference-bearing values.
- **§12.11** - returned references, local reference bindings, and reference fields are no longer non-goals under the lifetime system.
- **§13.6** - the fresh-derived/pass-through view rule is the MVP fallback. Section 15 replaces it with always-tracked view provenance.
- **§14** - ownership remains single-owner. References and views never own their sources. Unique values still move only; cloneable values still require `clone`; bare `clone x` aborts on allocation failure while `clone x as result` opts into recovery.
- **§9** - classes with stored `edit &T` fields must be `unique class`; `dispose()` remains legal only on unique classes.

**Conclusion.** Lifetimes are provenance constraints over non-owning values. They extend, but do not replace, Delta's ownership, mutability, construction, and disposal rules.
