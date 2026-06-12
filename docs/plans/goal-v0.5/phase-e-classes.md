# Plan: Phase E — Classes (v0.5a final)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phases **I, D, J, A, B, C** landed. Phase E is the **last** phase of v0.5a.
Successor: Phase F (ownership) introduces `move` / `clone` and tightens the v0.5a-intentional struct-copy gap. Phase G adds references of class instances. Phase H adds `heap T` indirection.
Spec basis: [spec-sections/09-classes.md](../../spec-sections/09-classes.md), [spec-sections/11-mutability-model.md](../../spec-sections/11-mutability-model.md).

## Goal

Land classes as inline value types: private-by-default fields, public/private modifiers, class literals (only inside class body), static functions, instance methods with implicit `this`, the `edit` method marker, capability-based dispatch (`const` binding cannot call `edit` methods), single-namespace-per-class, and automatic field disposal at scope exit.

After Phase E, the acceptance program from the goal doc compiles *except* for the `move`, `&`, and `edit &` parts (those are Phase F/G):

```delta
class Counter {
    private value: int64;

    public static new(start: int64): Counter {
        return Counter { value: start };
    }

    public get(): int64 {
        return this.value;
    }

    public edit add(delta: int64): void | OverflowError {
        this.value = this.value + delta as result;
        check result {
            return error as OverflowError { };
        }
        // this.value is now valid (committed only on fall-through)
        return;
    }
}

function main(): int32 {
    let a = Counter.new(10);
    a.add(5) as result;
    check result {
        return 1;
    }
    info("a", a.get());
    return 0;
}
```

…compiles, runs, prints `[INFO] a: 15`, exits 0.

The intentional unsoundness at end of v0.5a: passing a class by value generates a struct copy with no move tracking. The v0.5b phases close this gap.

## In-scope language surface

- `class Name { ... }` top-level declarations, exportable via `export class Name { ... }`.
- Field declarations: `<access> <name>: <type>;` where access is `public` or `private`. Default is `private`.
- Class literal `Name { field: value, ... }` legal **only inside the class body** (any static function or instance method of the class).
- Static functions: `public static name(params): RetType { body }`. Construction idiom is `public static new(...) { return ClassName { ... }; }`.
- Instance methods: `<access> name(params): RetType { body }`. Implicit `this` receiver.
- `edit` marker: `<access> edit name(params): RetType { body }` declares a mutating method.
- Method dispatch via member access: `instance.method(args)`.
- Capability rule: `const` binding may not call `edit` methods. `let` binding may call both.
- Field access: `instance.field`. From outside the class body, only `public` fields are visible.
- Method-overloading-within-name (same method name, different arity/types) — narrowly: only inside one class, only for methods of the same kind (instance vs static).
- Single-namespace check: no name collision between fields and methods within a class.
- Automatic field disposal at scope exit: for each owned class-instance binding, the compiler emits a dispose call in reverse declaration order at the end of the binding's scope. Field disposal cascades.

## Explicitly out of scope for Phase E

| Feature | Reason | Eventual home |
|---|---|---|
| Inheritance | Spec excludes. | Never. |
| Nested classes | Spec excludes. | Never. |
| Static fields | Spec excludes. | Never. |
| Constructors (special-named) | Spec excludes — use static functions. | Never. |
| User-defined `==` | Spec excludes; equality is method-based or via `same(...)`. | Never planned. |
| `uses Disposable` custom dispose | User-supplied dispose hooks. | Post-v0.5. |
| `uses Copyable` / `uses Cloneable` user-supplied hooks | Auto-derived only in v0.5. | Post-v0.5. |
| `move x` / `clone x` operators | Phase F. | Phase F. |
| `&` / `edit &` parameters | Phase G. | Phase G. |
| `heap T` indirection | Phase H. | Phase H. |
| Method calls through interfaces / generic dispatch | Out of v0.5 entirely. | Post-v0.5. |
| Object literals for non-class types (anonymous structs) | Spec forbids — class literals only. | Never planned. |

## What's missing today

- No `class`, `static`, `public`, `private`, `edit`, `this` keywords in the tokenizer.
- No class AST nodes, no member-access expression beyond Phase A's minimal `Type.from(x)`.
- No object/class literal parsing.
- No `SymbolClass`, `SymbolMethod`, `SymbolField`, `SymbolStaticFunction`.
- No class-scope handling, no capability tracking on bindings beyond the existing `const`/`let` distinction.
- No scope-exit cleanup pass in codegen.
- No struct emission, no method-as-free-function lowering.

## Decisions

1. **A class lowers to a C struct + a set of free functions for its methods + an auto-generated dispose function.**
   - Struct name: `delta__<module>__<Class>`. Fields in declaration order.
   - Instance method `m`: free C function `delta__<module>__<Class>_m` taking `delta__<module>__<Class>* self` as first parameter.
   - Static function `s`: free C function `delta__<module>__<Class>_static_s` with no `self`.
   - Dispose function: `delta__<module>__<Class>_dispose(delta__<module>__<Class>* self)`. Phase E body is empty (no user dispose hook, no heap fields yet) but the dispose function exists for v0.5b to extend.
2. **Class literals live inside the class body only.** The analyzer maintains an "enclosing class" stack during type-check; a class literal that names class C may only appear when C is on the stack. Outside the body, the diagnostic is "class literal for `Counter` may only appear inside Counter's class body; use `Counter.new(...)` or another static factory."
3. **`this` is a context-bound identifier in the analyzer.** Inside instance methods (including `edit` methods), `this` resolves to a synthetic local of type `<Class>` with binding capability matching the method's receiver kind (`const` for non-`edit`, `let` for `edit`). Outside instance methods, `this` is "unknown identifier `this`."
4. **Capability check at the call site, not at the method definition.** When the analyzer sees `obj.m(...)`, it walks `obj`'s binding kind (or, post-Phase G, the reference capability) and the method's `edit` flag. Mismatch → "cannot call `edit` method `m` on `const`-bound `obj`."
5. **Field/method namespace is shared.** Inside one class, a name belongs either to a field or to a method (possibly an overloaded set), never both. The analyzer rejects collisions at class-registration time.
6. **Method overloading within a class is supported for instance methods and for static functions, separately.** Two `public get(): int32` declarations collide. Two `public set(x: int32)` and `public set(x: int64)` are distinct overloads, resolved by argument types at the call site. Reuse the same call-resolution machinery the analyzer already uses; the call-site matches arity first, then types. Ambiguity is a structured error.
7. **Disposal pass.** Codegen gains a scope-exit cleanup hook. For each scope, track owned class-instance bindings in declaration order. At each scope exit (`}` of a block, `return` in the middle, future `break`/`continue`/`panic` divergence), emit dispose calls in reverse declaration order before the actual exit. The dispose function is `delta__<module>__<Class>_dispose`.
8. **Phase E disposal is a no-op at runtime (per class).** The synthesized dispose body is empty because no fields can yet require disposal (primitives are trivially disposed; class-typed fields would recurse, which is fine but rarely happens in Phase E because constructing one class instance inside another is allowed but doesn't add work — the inner field's dispose is called, which is also empty). The scaffolding is in place for Phase H (heap fields) and a future `uses Disposable` to plug in.
9. **No `==` on classes.** The analyzer rejects `a == b` where either operand is a class instance, with a fix-suggestion: "use a method or `same(a, b)` for identity." (`same(...)` is not implemented in Phase E but the message names it correctly.)
10. **Class instances are move-only by default starting in Phase F.** Phase E provides the struct-copy semantics that pass-by-value gets in C; that's the intentional unsoundness gap until Phase F closes it.

## Tokenizer changes

- New reserved keywords: `class`, `static`, `public`, `private`, `edit`, `this`.

## Parser changes

- AST nodes:
  ```go
  type ClassDeclaration struct {
      Name     string
      Exported bool
      Members  []ClassMember
      Position Position
  }
  type FieldDeclaration       struct { Access AccessModifier; Name string; Type TypeReference; Position Position }
  type MethodDeclaration      struct { Access AccessModifier; Edit bool; Name string; Params []FunctionParameter; ReturnTypes []TypeReference; ErrorTypes []TypeReference; Body *BlockStatement; Position Position }
  type StaticFunctionDeclaration struct { /* same as MethodDeclaration minus Edit */ }
  type ClassLiteralExpression struct { ClassName string; Fields []FieldInitializer; Position Position }
  type FieldInitializer       struct { Name string; Value Expression; Position Position }
  type ThisExpression         struct { Position Position }
  ```
- `MemberAccessExpression { Receiver Expression; Member string; Position Position }` — generalizes Phase A's `Type.from` path. The parser produces it for any `expr.identifier` shape. The analyzer interprets it.
- Class-member parsing: inside a `class { ... }` body, the parser dispatches on the first non-modifier token (`static` → static function, `edit` → method with edit, otherwise field if followed by `:`, or method if followed by `(`).

## Semantic analyzer changes

- **New symbol kinds:** `SymbolClass`, `SymbolField`, `SymbolMethod` (with `Mod bool` and `Overloads []FunctionSignature`), `SymbolStaticFunction`.
- **Class-scope creation.** Each class opens a scope at registration time. Fields and methods are members of that scope. The class scope is *not* a normal lexical scope reachable from outside; access is gated by the receiver's type at member-access sites.
- **Class-literal validation.** The analyzer tracks an "enclosing class" stack on entry/exit of static functions and instance methods. A `ClassLiteralExpression` for class `C` is valid only when `C` is on the stack. Otherwise: structured error with the suggested-factory hint.
- **`this` resolution.** Inside instance method bodies, the analyzer pushes a synthetic `this` binding of class type, capability matching the receiver kind. Inside static functions, `this` is not bound.
- **Member-access typing.**
  - Receiver type is a class C.
  - Member name resolved in C's scope.
  - Field access: success type is the field's type; access denied if the field is private and the access site isn't inside C's body.
  - Method access: resolved to a `SymbolMethod` (possibly overloaded). The expression's type is "callable bound to receiver"; the actual call-site picks the overload by argument types.
- **Capability check at call.** Method call `obj.m(args)` — resolve `obj`'s capability (`const`/`let` for owned bindings; later, referenced-receiver kinds add to the lattice). If method is `edit` and capability is `const`: structured error "cannot call edit method `m` on const-bound receiver."
- **Static function call.** `ClassName.s(args)` — resolved by looking up `s` in `ClassName`'s static-function scope. Visibility honored (`private static` callable only inside class body).
- **Single-namespace check.** At class registration, collect field names and method/static-function names. Any cross-kind collision is "name `n` declared as both field and method; choose one."
- **Equality rejection.** `==`/`!=` with a class operand is a structured error with the fix-suggestion.

## Codegen changes

- **Class struct emission.** For each class, emit a C struct in the TU's preamble:
  ```c
  typedef struct delta__counter__Counter {
      int64_t value;
  } delta__counter__Counter;
  ```
  Field order matches declaration order; no padding tricks.
- **Method lowering.** Each method becomes a free C function with `<ClassStruct>* self` as the first parameter. The body translates `this.field` → `self->field`, `this.method(...)` → recursive method-as-free-function call.
- **Static function lowering.** Free C function with no `self`. Class-literal inside the static function lowers to a C compound literal: `(delta__counter__Counter){ .value = start }`.
- **Class literal lowering.** A `Counter { value: 10 }` expression emits `(delta__counter__Counter){ .value = 10 }`.
- **Overload mangling.** When a method has overloads, append a suffix to the mangled name based on the parameter-type list: `delta__counter__Counter_set_i32`, `delta__counter__Counter_set_i64`. The exact suffix scheme is deterministic but internal.
- **Dispose function emission.** For each class, emit `void delta__counter__Counter_dispose(delta__counter__Counter* self) { /* fields disposed here in reverse order */ }`. Phase E body is empty.
- **Scope-exit cleanup pass.** Codegen tracks owned bindings per scope. At each scope-exit point (closing `}`, `return`, `break`, `continue`, Phase B's diverging terminators), emit dispose calls in reverse declaration order:
  ```c
  delta__counter__Counter_dispose(&a);
  ```
  For Phase E this generates no-op calls (the dispose body is empty), but the calls are emitted so v0.5b's hooks land cleanly.
- **`main` entry shim.** Unchanged from Phase I. If `main` is in a module that defines classes, the dispose calls precede `return` from `delta_main`.

## Testing strategy

New fixtures under `test-source/tests/codegen/classes/`:

**Basics (5)**
- `class_basic_ok` — Counter with one private field, new + get, prints value.
- `class_edit_method_ok` — `edit` method that mutates; `let` binding can call it.
- `const_to_edit_call_err` — `const a = ...; a.modMethod();` rejected.
- `private_field_outside_err` — accessing `a.value` outside class body rejected.
- `static_construction_ok` — class with multiple static factories.

**Class literal scope (3)**
- `class_literal_in_static_ok` — literal inside static function.
- `class_literal_in_method_ok` — literal inside instance method (e.g. a "clone" pattern; trivially).
- `class_literal_outside_err` — literal in `main` rejected.

**Namespace & overloads (3)**
- `field_method_collision_err` — class has `value` field and `value()` method; rejected.
- `method_overload_ok` — two methods with same name, different arity, both callable.
- `method_overload_ambiguous_err` — ambiguous overload at call site rejected.

**`this` (2)**
- `this_outside_method_err` — top-level `this` rejected.
- `this_in_static_err` — `this` inside static function rejected.

**Disposal scaffolding (2)**
- `dispose_called_ok` — snapshot test asserting the generated C contains a `delta__<Class>_dispose` call at scope exit.
- `dispose_reverse_order_ok` — two class bindings; snapshot asserts dispose order is reverse of declaration.

**Equality rejection (1)**
- `class_equality_err` — `a == b` with class operands rejected; diagnostic mentions `same(...)`.

**Fallible methods (2)**
- `fallible_method_ok` — the acceptance-program `add` method returning `void | OverflowError`, called with `check`.
- `fallible_method_propagation_ok` — caller propagates the error through `check`.

All earlier-phase fixtures continue to pass.

## Stage-by-stage implementation order

1. Tokenizer: new keywords.
2. Parser: `ClassDeclaration` and members, `MemberAccessExpression`, `ClassLiteralExpression`, `ThisExpression`. Reuse Phase A's `Type.from` MemberAccess plumbing.
3. Analyzer scope machinery: class scope, enclosing-class stack, `this` synthetic binding.
4. Analyzer symbol registration: classes, fields, methods, static functions, overload sets, namespace collision check.
5. Analyzer typing: member access (field + method), class-literal validity, capability check at method call, static-function dispatch.
6. Analyzer rejections: equality on classes, `this` outside methods, class literal outside body.
7. Codegen: struct emission per class.
8. Codegen: method-as-free-function lowering with overload mangling.
9. Codegen: static-function lowering and class-literal emission.
10. Codegen: dispose-function synthesis (empty body) per class.
11. Codegen: scope-exit cleanup pass emitting dispose calls (no-op at runtime, scaffolding for v0.5b).
12. Fixture suite.

Steps 1–6 are analyzer-heavy. Steps 7–11 are codegen-heavy. Step 11 is the key architectural piece for v0.5b.

## Risks and open questions

- **Scope-exit cleanup at non-`}` exits.** `return` mid-function, `break`, `continue`, Phase B's `panic` divergence — each requires the cleanup hook to fire for every owned binding from the current scope back to the relevant boundary (function exit for `return`/`panic`; loop scope for `break`/`continue`). Build the cleanup pass with the CFG's exit traversal so it stays correct as the language grows.
- **Overload resolution complexity.** Two-step (arity then types) is enough for v0.5. No conversion-rank tie-breaking; ambiguity is rejected. Keep the comparison simple.
- **Class-literal context vs object-literal future.** The spec rules out anonymous object literals — only class literals exist, and only inside class body. The parser shape (`Identifier { ... }`) is unambiguous when prefixed by a class name. Bare `{ ... }` at expression position remains unparseable.
- **Methods returning fallible types.** Methods can return `T | E`. The Phase C result-struct machinery already handles this; no new shape needed.
- **Self-referential class fields.** A field of type `Counter` inside `Counter` would create infinite size. The analyzer rejects with "class `Counter` cannot contain a field of its own type" (per spec §8 fixed-size check). Phase H's `heap Counter` becomes the answer.
- **Empty dispose function cost.** Each class emits a dispose function called at every scope exit. clang inlines and dead-code-eliminates the empty body — zero runtime cost. The artifact is a slightly larger generated `.c` file. Acceptable.

## Definition of done

- The Phase E acceptance program (Counter with `new`/`get`/`add`, called from `main`) compiles and runs, printing the expected value.
- All Phase E fixtures pass.
- All earlier-phase fixtures continue to pass.
- The generated C contains dispose calls at every scope exit for owned class bindings, in reverse declaration order (verified by snapshot test).
- Phase F can begin: the dispose-call scaffolding is the right place to hook move-state-aware skipping; the class struct + free-function-method layout is the right shape for move/clone codegen.
- **v0.5a is now complete.** A user can build multi-file projects, use the full primitive numeric surface, classes with capability dispatch, the error model, and `std/log` for output. The remaining v0.5b phases (F, G, H) close the ownership/reference/heap story.
