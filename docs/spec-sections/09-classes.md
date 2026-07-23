## 9. Classes

Section 9 covers Delta's class model: value-typed instances, controlled construction, static functions, field and method visibility, mutation marking, copy and move behavior, compiler-managed disposal, member lookup, identity, and how classes interact with tagged unions. The recurring principles are **classes protect invariants** (construction is owned by the class body), **ownership events are visible except at return boundaries** (assignment and argument passing never move implicitly), **copyability is opt-in and derived** (classes are move-only unless they explicitly use compiler-provided `Copyable`), and **classes carry behavior while `type` carries transparent data** (no inheritance, no structural equality, no public record-literal construction).

---

### 9.1 Core Model

**Proposal.** Classes are value-typed by default. A class instance lives inline: in a local slot, as a parameter value, as a return value, or as a field of another value. Heap allocation is explicit via the `heap ClassName` **type**, using the same `heap T` indirection syntax used for recursive `type` values. `heap` is a type modifier only — there is no `heap <expr>` allocation operator. A value is heap-allocated by placing it in a `heap T`-typed context (a binding annotation, field type, parameter, or return type); the compiler then allocates and moves the value into the allocation. This is the same type-context-driven allocation as for `heap T` fields in [§8.7](#87-recursion-and-indirection-heap-t).

Classes define state and behavior. They may contain fields, instance methods, static functions, and an optional compiler-recognized disposal hook through `uses Disposable`. Instantiation is exposed through public static functions that return complete class values. Classes do not support inheritance, nested declarations, static fields, associated constants, constructors, or a `Self` type.

The `uses` clause names compiler-recognized markers and is written as a comma-separated list (`class C uses Copyable`, `class C uses Cloneable`, `class C uses Disposable`, `class C uses View of Array<T>`). In MVP the markers are `Copyable` ([§9.6](#96-copy-and-move-semantics)), `Cloneable` ([§9.6](#96-copy-and-move-semantics), [§14.4](#144-the-clone-operator)), `Disposable` ([§9.7](#97-disposal-and-disposable)), and `View of S` ([§12.4](#124-exclusivity-and-root-locking), [§13.6](#136-fresh-derived-view-lifetimes)), which marks a non-owning type that aliases storage of type `S`. `Copyable` and `Disposable` are **mutually exclusive**, and `Cloneable` is likewise mutually exclusive with `Disposable` (a resource owner is never cloneable, [§14.1](#141-the-copyability-classifier)). `uses Cloneable` is **optional**: a qualifying class is deep-copyable through the markerless `clone` operator regardless, and the marker is needed only to supply *custom* clone behavior via a recognized `clone()` hook ([§14.4](#144-the-clone-operator)). `View of S` is always non-owning and copyable by construction; it may be combined with `Copyable` redundantly for readability, but it may not be combined with `Disposable`. The list form lets additional compatible markers be added without a grammar change.

Decorators ([§46](#46-decorators)) apply to classes as follows: `@inline` on instance methods and static functions (same as free functions). The layout/FFI decorators `@repr("c")` and `@packed` do **not** apply to classes, and there is no `@trusted` class or module escape hatch in MVP — see [§9.11](#911-explicit-non-goals-for-section-9) and [§13.2](#132-no-raw-pointers-in-delta-source).

Classes may be **generic** — taking type parameters and const generic parameters (`class Buffer<T>`, `class FixedBuffer<const N: uintsize>`). Generic classes are in MVP scope; the rules for generic declarations, constraints, and monomorphization are specified in the generics sections ([§31](#31-generics--constraints) / [§32](#32-compile-time-constants--const-generics)) and are not restated here. Everything in §9 applies per-instantiation.

Because class instances are inline, a class participates in the **same declaration-time fixed-size check** as `type` records ([§8.7](#87-recursion-and-indirection-heap-t)). The check is a single pass over the combined `type`/`class` field graph: any cycle — direct (`class Node { next: Node; }`) or indirect through other inline `type`/`class` fields — that does not pass through a `heap T` field or a heap-backed std type (`Array<T>`, etc.) has infinite layout and is a hard error, with the same diagnostic that names every declaration on the cycle and suggests introducing `heap`. Recursive class shapes are expressed by routing the recursion through `heap` (`next: heap Node`) or a heap-backed collection (`children: Array<Node>`).

**Reason.** Inline-by-default keeps the class model aligned with the rest of Delta's value semantics. A class is not implicitly a pointer; heap allocation is a visible cost. This preserves the "systems-language honest" property: if a value lives on the heap, the source says so.

No inheritance is a permanent design choice, not an MVP shortcut. Inheritance would add object identity questions, base-subobject layout, vtables, constructor chaining, override rules, and fragile base-class problems. Delta already has better-fitting tools for the use cases inheritance usually claims: tagged unions for closed polymorphism, `type` composition for data extension, and the reserved `interface` keyword for future behavior contracts.

Nested classes and static fields are excluded for the same reason: both add scope, initialization, and visibility complexity without strengthening the class model. File-scope `const` covers constants; top-level helper classes cover private implementation detail.

**Examples.**
```ts
class Counter {
  private value: int32;

  public static create(start: int32): Counter {
    return Counter { value: start };
  }

  public get(): int32 {
    return this.value;
  }

  public edit increment(): void {
    this.value += 1;
  }
}

let c = Counter.create(0);          // inline class value
let h: heap Counter = Counter.create(0);  // `heap Counter` annotation drives heap allocation
```

```ts
// permanently unsupported
class Base { }
class Derived extends Base { }       // ERROR - inheritance is not supported

class Parser {
  class State { }                    // ERROR - nested classes are not supported
}

class Config {
  public static DEFAULT_PORT: int32 = 8080; // ERROR - no static fields
}
```

**Conclusion.** Classes are inline value types with behavior and invariants. Heap allocation is explicit via `heap T`. Instantiation is through public static functions plus privileged class literals. Inheritance, nested classes, static fields, associated constants, constructors, and `Self` are not part of Delta.

---

### 9.2 Controlled Construction

**Proposal.** Delta has no `constructor`, `new`, or `init` keyword for classes. Outside code instantiates a class by calling a public static function. Inside the declaring class body, those static functions construct values with a privileged class-literal form:

```ts
ClassName { field: value, ... }
```

The class literal is available only inside the lexical body of the declaring class, including nested functions and lambdas written inside that class body. Outside code always constructs through public static functions.

Class literals must initialize every stored field exactly once. Missing fields, unknown fields, duplicate fields, partial construction, per-field class construction through local definite-assignment, and class-literal spread are all compile errors. Field initializers may be expressions with no error-channel fallibility. Fallible operations and `as result` are not allowed directly inside class literals; those values must be prepared and checked before construction.

**Reason.** Classes own their invariants. If outside code can write `File { fd }`, it can bypass whatever validation `File.open(...)` performs. Restricting class literals to the class body makes construction a private implementation tool, not a public data syntax.

Requiring complete construction in one expression prevents half-valid class values. This matches the general binding rule: a nominal value is either absent or complete, never partially initialized through field writes. A local `let value: SomeClass;` may still be assigned a whole class value later under ordinary definite-assignment rules, but its fields cannot be filled one by one from outside the class literal. A `const` binding of a class type must be initialized with a complete value at its declaration site; `const value: SomeClass;` without an initializer is not allowed (consistent with [§3.3](#3-basic-syntax--variable-bindings), where `const` always requires an initializer). The two legal forms for a class local are therefore "fully initialize at the declaration" or, for `let` only, "declare with `let value: T;` and assign a complete value before any read."

Forbidding error-channel-fallible field initializers keeps class literals from becoming hidden control-flow regions. A construction expression should assemble already-available values. Error handling remains explicit at the binding site with `as result` and `check`.

**Examples.**
```ts
export class File {
  private fd: FileDescriptor;
  private path: string;

  public static open(path: stringview): File | IOError {
    const fd = os.open(path) as result;
    check result {
      return error as IOError {
        code: "io.open_failed",
        message: result.error.message,
        path,
      };
    }

    const ownedPath = string.from(path);

    return File {
      fd,
      path: move ownedPath,
    };
  }
}
```

```ts
// outside the File class body
const f = File { fd, path };          // ERROR - class literal is private construction syntax
const f = File.open("log.txt");       // OK - construction goes through static function
```

```ts
class Logger {
  private file: File;
  private buffer: Buffer;

  public static open(path: stringview, size: uintsize): Logger | LoggerError {
    const file = File.open(path) as result;
    check result {
      return error as LoggerError {
        code: "logger.file_open_failed",
        message: result.error.message,
      };
    }

    const buffer = Buffer.create(size) as result;
    check result {
      return error as LoggerError {
        code: "logger.buffer_create_failed",
        message: result.error.message,
      };
    }

    return Logger {
      file: move file,
      buffer: move buffer,
    };
  }
}
```

```ts
return Logger {
  file: File.open(path) as result,       // ERROR - fallible initializer in class literal
  buffer: Buffer.create(size) as result, // ERROR
};
```

```ts
class Vec2 {
  private x: float32;
  private y: float32;

  public static create(x: float32, y: float32): Vec2 {
    return Vec2 {
      x: clamp(x, 0.0, 1.0),  // OK - infallible expression
      y: clamp(y, 0.0, 1.0),
    };
  }

  public static copyOf(v: &Vec2): Vec2 {
    return Vec2 { ...v };      // ERROR - no class-literal spread in MVP
  }
}
```

**Conclusion.** Class construction is static-function mediated. Class literals are complete, explicit, free of error-channel fallibility, and usable only inside the declaring class's lexical body.

---

### 9.3 Static Functions

**Proposal.** Static functions are declared inside the class body with the `static` keyword and are called as `ClassName.name(...)`. They have no `this` receiver, cannot be called on instances, and follow the same overload rules as ordinary functions. Static functions may be fallible and may return class values.

There is no reserved constructor name because constructors do not exist. `create` is the strong convention for the primary construction function, but classes may expose any public static functions that make sense: `open`, `openOrCreate`, `fromFd`, `parse`, `empty`, etc. Non-construction utility static functions are also allowed.

**Reason.** Static functions replace constructors without creating a second declaration form. They are just functions with class-private access and class-literal construction privilege. This makes named construction natural and avoids constructor overloading ceremonies.

Forbidding instance calls to static functions keeps lookup simple: `File.open(...)` means static; `file.open(...)` means instance method.

**Examples.**
```ts
export class File {
  private fd: FileDescriptor;

  public static open(path: stringview): File | IOError {
    const fd = os.open(path) as result;
    check result {
      return error as IOError { code: "io.open_failed", message: result.error.message, path };
    }
    return File { fd };
  }

  public static fromFd(fd: FileDescriptor): File {
    return File { fd };
  }

  public isOpen(): bool {
    return this.fd.isValid();
  }
}

const file = File.open("log.txt") as result;  // OK
check result { return 1; }

file.open("other.txt");                       // ERROR - static function called on instance
```

**Conclusion.** Static functions are ordinary class-scoped functions with no receiver. They are the construction surface and use normal function overload/error rules.

---

### 9.4 Fields, Methods, Visibility, and Member Names

**Proposal.** All class members are private by default: fields, instance methods, and static functions. `public` is required for external access.

Public fields are externally readable and writable, gated by receiver mutability. Private fields are accessible only inside the declaring class body. Privacy is class-scoped, not instance-scoped: code inside a class may access private fields of any instance of that same class.

Classes have a single member namespace, with one exception for overloading. A member *name* denotes exactly one **kind** of member: a field, an instance method, or a static function. The rules:

- **Fields are exclusive.** A field name may not be shared with anything — not another field, not a method, not a static function.
- **Overloading is allowed within a kind.** Several instance methods may share one name if they differ by signature (the overload rules of [§3.7](#3-basic-syntax--variable-bindings)); likewise several static functions may share one name. An overload set is a single named member with multiple signatures.
- **Static and instance may not share a name.** A name is either an instance-method member or a static-function member, never both — `File.open` (static) and `file.open` (instance) cannot coexist, so the call form unambiguously selects the member.

Exporting a class exports the class name and its public member surface as one unit. Private members remain inaccessible.

**Reason.** "Private by default" matches the invariant-bearing role of classes. A class author must explicitly choose which state and behavior becomes public API.

Class-scoped privacy enables useful helpers such as equality methods, copy-like factories, and comparators without forcing public getters. The single-namespace rule avoids ambiguous reads like `c.value` (field) versus `c.value()` (method) by forbidding a field to share a name with a function. Forbidding static/instance name sharing keeps lookup unambiguous: the receiver form (`ClassName.f` vs `instance.f`) always identifies the member, consistent with [§9.3](#93-static-functions)'s rule that statics cannot be called on instances. Overloading is exempt because an overload set is *one* named member resolved by argument shape, not two members fighting over a name.

**Examples.**
```ts
export class Vec2 {
  public x: float32;
  public y: float32;

  public static create(x: float32, y: float32): Vec2 {
    return Vec2 { x, y };
  }

  lengthSquared(): float32 {
    return this.x * this.x + this.y * this.y; // private method by default
  }
}

let v = Vec2.create(1.0, 2.0);
v.x = 3.0;                     // OK - public field, mutable receiver
const y = v.y;                 // OK
v.lengthSquared();             // ERROR - method is private
```

```ts
class Counter {
  private value: int32;

  public static create(value: int32): Counter {
    return Counter { value };
  }

  public static sameValue(a: &Counter, b: &Counter): bool {
    return a.value == b.value; // OK - same class private access
  }
}

class Thief {
  public static steal(c: &Counter): int32 {
    return c.value;            // ERROR - private field of another class
  }
}
```

```ts
class BadCounter {
  private value: int32;

  public value(): int32 {      // ERROR - field `value` and a function cannot share a name
    return this.value;
  }
}
```

```ts
class Parser {
  // OK - overloaded instance methods: same name, different signatures
  public parse(input: stringview): Ast | ParseError { /* ... */ }
  public parse(input: Buffer): Ast | ParseError { /* ... */ }

  // OK - overloaded static functions: same name, different signatures
  public static from(text: stringview): Parser { /* ... */ }
  public static from(bytes: Buffer): Parser { /* ... */ }
}

class BadParser {
  public static run(): void { /* ... */ }
  public run(): void { /* ... */ }   // ERROR - static and instance cannot share the name `run`
}
```

**Conclusion.** Class members are private unless marked `public`. Public fields are read/write through mutable receivers. Private access belongs to the declaring class body. A name denotes one kind of member; fields share names with nothing; instance methods and static functions may each be overloaded (multiple signatures under one name), but a static and an instance member may not share a name.

---

### 9.5 Instance Methods and `edit`

**Proposal.** Instance methods use an implicit `this` receiver. The receiver is not written in the parameter list.

A method that mutates the receiver is marked with the `edit` keyword. A method must be `edit` if it:

- directly assigns to a field of `this`,
- calls another `edit` method on `this`,
- calls an `edit` method on a field of `this`.

Non-`edit` methods cannot mutate through `this`; the compiler enforces this. Methods are callable according to the receiver capability:

| Receiver | Can call `edit`? | Can call non-`edit`? |
|---|---:|---:|
| `let c` | Yes | Yes |
| `const c` | No | Yes |
| `let h: heap T` | Yes | Yes |
| `const h: heap T` | No | Yes |
| `edit &Counter` | Yes | Yes |
| `&Counter` | No | Yes |

A mutable reference is written `edit &T`; a plain `&T` is read-only (the `readonly` keyword does not exist — read-only is the unmarked default; [§8.8](#88-references-on-type-values)). The `heap T` indirection is **transparent** for method calls: a heap-allocated instance has exactly the same capability as an inline one, determined by the binding (`let` vs `const`) or reference form. Auto-deref ([§8.7](#87-recursion-and-indirection-heap-t)) means `h.increment()` on a `let h: heap Counter` calls `increment` on the pointed-to value with no explicit dereference.

Methods are not first-class values in MVP. They may only be called through an instance. Instance methods and static functions use the same overload rules as ordinary functions.

**Reason.** `edit` makes mutation part of the method signature. A reader can see whether a method may change the instance without inspecting the body, and `const` / read-only `&` receivers have a clear call matrix.

The transitive rule prevents mutation from hiding behind helper methods or field methods. If `Logger.rotate()` mutates `this.file`, it is a mutating operation on `Logger`, even if the assignment happens through a field method.

First-class method values are deferred because they raise receiver-capture questions: does `c.get` copy, move, or reference `c`? How long does a captured mutable receiver live? Those questions belong to the closure/lifetime design, not MVP class semantics.

**Examples.**
```ts
class Counter {
  private value: int32;

  public static create(start: int32): Counter {
    return Counter { value: start };
  }

  public get(): int32 {
    return this.value;
  }

  public edit increment(): void {
    this.value += 1;
  }

  public edit add(amount: int32): void {
    this.increment();
    this.value += amount;
  }
}

let c = Counter.create(0);
c.increment();              // OK
const n = c.get();           // OK

const frozen = Counter.create(0);
frozen.get();                // OK
frozen.increment();          // ERROR - `edit` method on const receiver
```

```ts
class BadCounter {
  private value: int32;

  public reset(): void {
    this.value = 0;          // ERROR - method must be marked `edit`
  }
}
```

```ts
const getter = Counter.get;  // ERROR - methods are not values in MVP
const bound = c.get;         // ERROR - no bound method values in MVP
```

**Conclusion.** `edit` is the class mutation marker. Receiver capability controls which methods may be called. Methods are not first-class in MVP.

---

### 9.6 Copy and Move Semantics

**Proposal.** Classes are move-only by default. A class may opt into compiler-derived copying with `uses Copyable`.

`Copyable` for classes has these rules in MVP:

- It is compiler-provided and compiler-derived.
- Derivation is fieldwise. (For a Copyable type this is also a complete, independent copy: a Copyable type owns no indirection — see the `heap T` rule below — so a fieldwise copy shares nothing with the original. "Shallow" and "deep" coincide.)
- Derivation succeeds only if every stored field is Copyable.
- `heap T` is never Copyable.
- A class that uses `Disposable` cannot use `Copyable`.
- `edit` methods do not block `Copyable`.
- User-defined custom copy implementations are not supported in MVP.

There are exactly two value-level operations on bindings, and **there is no `copy` operator**:

- **Plain assignment / by-value argument passing** (`let b = a;`, `f(a)`) **copies** the value when its type is Copyable, and is a **compile error** for non-Copyable (move-only) types. Assignment never moves implicitly.
- **`move x`** transfers ownership for any owned value; the source binding is invalid afterward. Moving a Copyable value is legal but pointless, since assignment already produces an independent copy.

A standalone `copy x` operator is **not** part of the language: for Copyable values it would do exactly what assignment already does, and for move-only values duplication is never a trivial fieldwise operation (see deep copy below).

**Deep copy** is always explicit and goes through the `clone` operator ([§14.4](#144-the-clone-operator)), never through assignment. `clone x` allocates, so it is fallible and consumed with `as result`. Deep copy is **auto-derived markerlessly** for every cloneable class — one that is not `Disposable` and whose every field is copyable or cloneable ([§14.1](#141-the-copyability-classifier)). A class may declare `uses Cloneable` to supply *custom* clone behavior through a recognized `clone()` hook; the marker is optional and only customizes the otherwise-derived behavior. A resource-owning class is `Disposable` and therefore never cloneable: a class holding a `File` offers no clone, which is exactly what prevents duplicating the underlying OS handle.

`return` is an ownership-transfer boundary. Returning an owned local binding or by-value parameter transfers it to the caller without requiring explicit `move`, including for non-Copyable classes. This implicit return transfer does not apply to fields, indexes, referenced values, globals, or captured variables.

**Reason.** The compiler cannot infer class copyability from field structure alone. A `File` may contain only an `int32` descriptor, but fieldwise copying it would duplicate ownership of an OS resource. Therefore classes must be move-only unless the author explicitly asks for fieldwise copy derivation.

Keeping `move` explicit in assignment and function calls prevents ordinary-looking code from invalidating a binding. Return is the one ergonomic exception because return already leaves the current ownership context; transferring an owned local to the caller is unsurprising there.

A separate `copy` operator was considered and dropped: it carried no semantics that plain assignment did not already provide for Copyable values, and the genuinely distinct operation — deep duplication of an owned value — is the explicit, fallible `clone` operator. Keeping the surface to "assignment copies copyable values / `move` transfers / `clone` deep-copies" leaves three non-overlapping operations and no redundant keyword.

**Examples.**
```ts
class Counter uses Copyable {
  private value: int32;

  public static create(start: int32): Counter {
    return Counter { value: start };
  }

  public edit increment(): void {
    this.value += 1;
  }
}

let a = Counter.create(0);
let b = a;        // OK - fieldwise copy (Counter is Copyable)
let d = move a;   // OK - ownership transfer; `a` invalid afterward (legal but unnecessary for Copyable)
```

```ts
class File {
  private fd: FileDescriptor;

  public static open(path: stringview): File | IOError { /* ... */ }
}

let f = File.open("log.txt") as result;
check result { return 1; }

let g = f;        // ERROR - File is not Copyable; assignment cannot copy it
let i = move f;   // OK - ownership transferred; `f` invalid afterward
```

```ts
function consumeFile(file: File): void {
  // owns file
}

let f = File.open("log.txt") as result;
check result { return 1; }

consumeFile(f);        // ERROR - File is not Copyable
consumeFile(move f);   // OK
```

```ts
function identityFile(file: File): File {
  return file;          // OK - return transfers owned parameter to caller
}

function bad(file: &File): File {
  return file;          // ERROR - referenced value is not owned
}
```

```ts
class Holder uses Copyable {
  private counter: heap Counter;
}
// ERROR - cannot derive Copyable; field `counter: heap Counter` is not Copyable
```

```ts
// deep copy of a move-only value is explicit and fallible, via the `clone` operator
let a = string.from("hello") as result;
check result { return 1; }
let b = a;                 // ERROR - string is move-only; assignment cannot copy it
let b = clone a as result;
check result { return 1; } // clone allocates → fallible
// `a` and `b` are now independent buffers; `a` still valid
```

**Conclusion.** Classes are move-only unless marked `uses Copyable`. Copyable duplication is compiler-derived and fieldwise (and, because owned indirection is never Copyable, a complete independent copy). There is no `copy` operator: assignment copies Copyable values and is an error for move-only ones, `move` transfers ownership, and `clone x` is the explicit, fallible deep copy for owned types (auto-derived markerlessly for cloneable classes, [§14.4](#144-the-clone-operator)). Assignment and calls never move implicitly; return may transfer owned locals and by-value parameters.

---

### 9.7 Disposal and `Disposable`

**Proposal.** Disposal is automatic and implicit for **every** owned value, whether or not its class uses `Disposable`. There is no opt-in keyword (`using` and `defer` do not exist — see [§33](#33-automatic-disposal)/[§34](#34-disposal-order--arbitrary-cleanup)) and no way to call cleanup manually. A class whose own body needs custom cleanup declares `uses Disposable` and defines a `dispose(): void` hook; a class that does not still has its fields disposed automatically.

`dispose()` is compiler-recognized cleanup, not an ordinary callable method:

- User code cannot call `x.dispose()` directly.
- A class using `Disposable` cannot use `Copyable` or `Cloneable` (a resource owner is never duplicated, [§14.1](#141-the-copyability-classifier)).
- When a value is destroyed, its custom `dispose()` body (if any) runs first.
- After the custom body, stored fields are disposed automatically in **reverse declaration order**. This happens for all classes, including those without a `dispose()` hook.
- Moving a value transfers disposal responsibility to the new owner.
- A moved-from binding is invalid and is not disposed.

Compiler-driven disposal consumes a still-owned value. It runs at ownership end points such as local-scope exit, **reassignment of an owned `let` binding**, field replacement, discarded temporaries, discard bindings, and failed partial lowering paths internal to the compiler. When a scope exits, the owned bindings declared in that scope are disposed in **reverse declaration order (LIFO)**, so a later binding that depends on an earlier one is torn down first. User code observes only the source-level ownership rules.

Reassigning an owned `let` binding disposes the value it currently holds **before** installing the new one, mirroring field replacement ([§9.8](#98-field-mutation-and-replacement)) — so a binding never leaks the value it is overwriting and never observes a half-replaced state. If the binding is currently moved-from or not-yet-initialized, there is nothing to dispose and the new value is simply installed. (`const` bindings cannot be reassigned, so this applies only to `let`.)

A value's lifetime ends at the close of its enclosing scope; there is no early-disposal operator. To bound a value's lifetime more tightly, extract the region into its own function ([§33](#33-automatic-disposal)).

Disposal is driven by definite-assignment state: a binding is disposed at scope exit only on paths where it is definitely initialized and has not been moved out of. A `let value: T;` that is conditionally assigned ([§9.2](#92-controlled-construction)) is therefore disposed only on the paths where it actually holds a value — the same liveness tracking that already exempts moved-from bindings.

**Reason.** Cleanup is ownership consumption, not ordinary mutation. Treating `dispose()` as a normal `edit` method creates a tension with `const` and invites manual double-dispose errors. Making it compiler-recognized keeps cleanup deterministic while removing direct user misuse. Note this means `const` restricts *mutation*, not *destruction*: a `const` value still has its lifetime end and is still disposed at that point — `const` prevents you from changing the value, not from the compiler reclaiming it when its ownership ends.

Automatic field disposal after the custom hook prevents both missed cleanup and double cleanup. The class body handles resources not otherwise modeled as fields; field ownership remains compiler-managed.

**Examples.**
```ts
class File uses Disposable {
  private fd: FileDescriptor;

  public static open(path: stringview): File | IOError {
    const fd = os.open(path) as result;
    check result {
      return error as IOError { code: "io.open_failed", message: result.error.message, path };
    }
    return File { fd };
  }

  dispose(): void {
    os.close(this.fd);
  }
}

let f = File.open("log.txt") as result;
check result { return 1; }

f.dispose();     // ERROR - dispose is a cleanup hook, not a callable method
```

```ts
class Logger uses Disposable {
  private file: File;
  private buffer: Buffer;

  public edit rotate(next: File): void {
    this.file = move next;   // old file is disposed/replaced automatically
  }

  dispose(): void {
    flushLogs();
    // then `buffer` and `file` are disposed automatically in reverse declaration order
  }
}
```

```ts
let f = File.open("log.txt") as result;
check result { return 1; }

let g = move f;
// `f` is invalid and will not be disposed.
// `g` owns the file and will be disposed when its ownership ends.
```

```ts
// reassigning a live owned `let` disposes the old value first
let f = File.open("a.txt") as result;
check result { return 1; }

f = File.open("b.txt") as result;   // the "a.txt" file is disposed before "b.txt" is installed
check result { return 1; }
// at scope exit, only the currently-held value ("b.txt") is disposed
```

**Conclusion.** Disposal is automatic and implicit for every owned value, LIFO across bindings and reverse-declaration-order across fields. `Disposable` supplies an optional custom hook; the hook is not user-callable; fields are always cleaned automatically with or without it. There is no `using`, no `defer`, and no early-disposal operator.

---

### 9.8 Field Mutation and Replacement

**Proposal.** Field assignment is allowed through mutable receiver capability: a `let` binding, an `edit &T`, or inside an `edit` method on `this`. Field assignment follows normal Copyable-or-explicit-move rules.

Replacing a field automatically disposes/drops the old value before installing the new value. The field is never user-observable as uninitialized.

Moving a non-Copyable field out of a class value is not supported in MVP, even inside `edit` methods. Public non-Copyable fields may be read-referenced, mutably referenced when the receiver is mutable, and replaced, but not extracted by value.

**Reason.** Assignment should own replacement cleanup. Requiring users to manually clean the old value before every field assignment would create missed-cleanup and double-cleanup bugs.

Forbidding field moves keeps class instances from entering partially invalid states. Supporting partial moves would require tracking which fields remain initialized across method calls, a complexity that belongs outside MVP.

**Examples.**
```ts
class Session {
  private file: File;

  public edit replaceFile(next: File): void {
    this.file = next;       // ERROR - File is not Copyable
    this.file = move next;  // OK - old file disposed, new file installed
  }
}
```

```ts
class Socket {
  private handle: FileDescriptor;

  public edit intoRawFd(): FileDescriptor {
    return this.handle;     // ERROR - cannot move out of class field in MVP
  }
}
```

```ts
class Wrapper {
  public file: File;

  public static create(file: File): Wrapper {
    return Wrapper { file: move file };
  }
}

let w = Wrapper.create(move file);
inspect(&w.file);  // OK
const f = w.file;                    // ERROR - would move non-Copyable field out
w.file = move otherFile;             // OK if `w` is mutable; old field disposed/replaced
```

**Conclusion.** Field replacement is safe and automatic. Field extraction by moving is not part of MVP.

---

### 9.9 Equality and Identity

**Proposal.** Classes do not support `==` or `!=` in MVP, even if they use `Copyable` and all fields support equality. `Copyable` does not imply equality.

Class authors may expose equality as ordinary methods. Storage identity uses the existing `same(...)` intrinsic on indirected forms: `&T`, `edit &T`, and `heap T`. Inline class values cannot be passed directly to `same(...)`.

**Reason.** Fieldwise equality is appropriate for transparent `type` records. Classes hide invariants and may represent resources, handles, caches, or semantic identities whose equality is not their field tuple. Therefore equality is an API decision, not a compiler-derived operator.

Identity is still occasionally useful for classes. Keeping it under `same(...)` makes pointer/storage comparison explicit and distinct from value equality.

**Examples.**
```ts
class Counter uses Copyable {
  private value: int32;

  public static create(value: int32): Counter {
    return Counter { value };
  }

  public equals(other: &Counter): bool {
    return this.value == other.value;
  }
}

let a = Counter.create(1);
let b = Counter.create(1);

const bad = a == b;                     // ERROR - no `==` on class values
const ok = a.equals(&b); // OK
```

```ts
same(a, b);                             // ERROR - inline values have no storage identity
same(&a, &a);           // true
same(&a, &b);           // false
```

**Conclusion.** Classes have no equality operators in MVP. Use methods for semantic equality and `same(...)` for explicit storage identity.

---

### 9.10 Classes in Tagged Unions

**Proposal.** Tagged unions may include class variants as well as `type` variants. A class value widens into a tagged union after it has already been constructed through that class's public construction API.

Class literals are never used to construct union values outside the class body.

**Reason.** Some variants need behavior or invariants. Forcing those variants to be transparent `type` records would undercut the class model and push behavior into free functions unnecessarily.

The invariant boundary remains intact because the union receives an already-constructed class value; it does not gain access to class-private construction syntax.

**Examples.**
```ts
class Circle uses Copyable {
  private radius: float64;

  public static create(radius: float64): Circle {
    return Circle { radius };
  }

  public area(): float64 {
    return PI * this.radius * this.radius;
  }
}

class Square uses Copyable {
  private side: float64;

  public static create(side: float64): Square {
    return Square { side };
  }

  public area(): float64 {
    return this.side * this.side;
  }
}

type Shape = Circle | Square;

const c = Circle.create(2.0);
const shape: Shape = c;                  // OK - constructed variant widens to union

const bad: Shape = Circle { radius: 2.0 }; // ERROR - class literal not public
```

**Conclusion.** Classes can be tagged-union variants. The union does not weaken class construction privacy.

---

### 9.11 Explicit Non-Goals for Section 9

The following are deliberately out of scope, either deferred to a later section or excluded permanently:

- **Inheritance** — never. No base classes, subclassing, overriding, `super`, protected members, or virtual dispatch through inheritance.
- **Nested classes** — never. Classes are top-level declarations only.
- **`constructor`, `new`, or `init`** — never. Static functions plus privileged class literals are the construction model.
- **Public class-literal construction** — never. Outside code always uses static functions.
- **Same-module access to class literals** — never. Construction privilege belongs to the declaring class body only.
- **Static fields / associated constants in classes** — never. Use file-scope `const`.
- **A `Self` type** — never. Spell the class name explicitly.
- **Class-literal spread** — out of scope for MVP.
- **Partial / uninitialized class construction** — never.
- **Fallible field initializers inside class literals** — never. Bind and check fallible values before construction.
- **Implicit move in assignment or function arguments** — never. Use `move`.
- **A `copy` operator** — never. A bare use copies Copyable values; `move` transfers; `clone x` deep-copies owned types. A standalone `copy x` would duplicate a bare use's behavior and is not part of the language ([§9.6](#96-copy-and-move-semantics), [§14.2](#142-the-three-operations)).
- **Custom Copyable implementations** — out of scope for MVP. `Copyable` is compiler-derived only.
- **Cloning a `Disposable` (resource-owning) class, or `uses Cloneable` together with `uses Disposable`** — never. Compiler-derived deep copy via the `clone` operator *is* in MVP for cloneable classes — auto-derived markerlessly (deep, recursive, fieldwise, transactional on failure), with `uses Cloneable` supplying optional custom behavior through a recognized `clone()` hook ([§14.4](#144-the-clone-operator)). It is excluded only for `Disposable` types, which cannot be meaningfully duplicated. (Earlier drafts deferred derived clone to post-MVP; it is now in scope.)
- **`heap T` being Copyable** — never in MVP.
- **`View of S` plus `Disposable`** — never in MVP. A view is non-owning and cannot clean up the storage it observes ([§13.5](#135-ownership-disposal-and-double-free-prevention)).
- **`@trusted` classes or trusted Delta modules** — not in MVP. No Delta source, including std/internal Delta source, gets raw-pointer privileges ([§13.2](#132-no-raw-pointers-in-delta-source)).
- **`@repr("c")` / `@packed` on classes, and classes at an FFI boundary** — never. Classes are opaque, move-only, behavior-bearing values with compiler-managed layout and disposal; they are not FFI-safe and do not take layout decorators. To cross the C boundary, use a `@repr("c")` `type` record ([§41](#41-ffi-safe-types) / [§47](#47-layout-rules-reprc-packed)).
- **Manual calls to `dispose()`** — never. It is a cleanup hook.
- **Moving fields out of class instances** — out of scope for MVP.
- **Consuming `this` methods** — out of scope for MVP.
- **First-class method values** — out of scope for MVP.
- **Class equality operators** — out of scope for MVP.
- **Referenced return values from class methods** — deferred to the lifetime design in [§12](#12-safe-references).
- **Interior mutability** — deferred. Patterns like caches, memoization, `Cell<T>`, atomics, and mutex-backed mutation are not specified here.
- **General trait grammar and trait composition** — deferred to the future trait/interface section. Section 9 only relies on the compiler-recognized `Copyable`, `Disposable`, and `View of S` markers.

---

### 9.12 Knock-on Edits

This section requires coordinated edits elsewhere in the spec:

- **§8.7, §8.13, §36** — use `heap T` consistently for owning heap indirection.
- **§8.10** — confirm `same(...)` applies to referenced and heap class values under the same indirection rules as other nominal values.
- **§11** — class `edit` callability should be referenced from the `const` / `let` mutability model.
- **§12 / §14** — account for explicit `move`, the `clone` operator (no `copy` operator), markerless-derived `Cloneable` with an optional custom `clone()` hook, class move-only defaults, the `&` / `edit &` reference forms, and deferred referenced returns.
- **§29** — tagged unions may include class variants; construction uses already-constructed variant values.
- **§30** — variant dispatch is `switch type` (the `match` keyword is removed); its narrowing/exhaustiveness details belong to the tagged-union control-flow section, not to classes.
- **§33 / §34** — `using` and `defer` are removed; disposal is automatic and implicit for every owned value (LIFO), with `Disposable` as the optional custom-hook marker. Lifetime narrowing is by function extraction; arbitrary cleanup uses a `Disposable` guard value.
- **§36** — user-visible heap indirection is `heap T`.
- **§52** — MVP scope includes classes with static construction functions, private-by-default members, `edit` methods, compiler-derived `Copyable`, markerless-derived `Cloneable` (with optional custom `clone()` hook), compiler-recognized `Disposable`, explicit class move and `clone` semantics, and no inheritance or constructors.
