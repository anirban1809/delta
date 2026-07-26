# Plan: Interfaces with Static Dispatch

Date drafted: 2026-07-25  
Status: **abandoned** — implemented on 2026-07-25, removed from the language on
2026-07-26 along with variadic type parameters and variadic value parameters.
Nothing in this document describes the current compiler; it is kept as the
design record for a feature that was tried and dropped.  
Primary goal: declared interface conformance for receiver methods and generic
constraints, lowered through monomorphized direct C calls.

## 1. Decision summary

Delta interfaces will initially be a compile-time feature.

- A type explicitly declares conformance with `implements`.
- Interface method declarations do not contain a receiver; each concrete
  receiver method supplies its own `&Concrete` or `edit &Concrete` receiver.
- The compiler verifies that every required receiver method exists with a
  compatible signature.
- Interface names may be used as generic bounds.
- Calls through a bounded generic parameter are resolved when the generic
  function is specialized, including receiver-capability validation against
  the selected concrete method.
- Interface declarations, conformance records, and bounds are erased from the
  generated C.
- Vtables, boxing, runtime type information, interface values, and dynamic
  dispatch are not part of the first implementation.

Dynamic dispatch may be added later with an explicit type form such as
`dynamic Writer`. It must not change the meaning or cost of the static
interface syntax described here.

## 2. Motivation

Interfaces let a function state the behavior it needs without accepting an
untyped value or coupling itself to one concrete record.

The immediate motivating example is formatted output:

```delta
interface Writer {
    function write(value: string): void | ioerror;
}

type struct stdout_writer = {} implements Writer;

function (writer: edit &stdout_writer) write(
    value: string
): void | ioerror {
    // Write all bytes to stdout.
}
```

A generic function can then require a `Writer`:

```delta
function write_message<W: Writer>(
    writer: edit &W,
    value: string
): void | ioerror {
    writer.write(value) as result;
    forward result;
    return;
}
```

When called with `stdout_writer`, the generated C calls the concrete
`stdout_writer.write` function directly.

## 3. Goals

The first interface release must support:

1. Top-level interface declarations.
2. Receiver-less method requirements whose receiver is supplied by each
   implementation.
3. Explicit `implements` lists on record declarations.
4. Compile-time conformance validation.
5. Imported and exported interfaces.
6. Interface bounds on generic functions and receiver functions.
7. Static method resolution through bounded generic values.
8. Monomorphized C lowering without vtables.
9. Package-interface generation for exported interfaces and conformances.
10. Compiler diagnostics and LSP support.

## 4. Non-goals for the first release

The following are deliberately deferred:

- Values whose runtime type is an interface.
- Function parameters written as `writer: &Writer`.
- `dynamic Writer`, `any Writer`, or similar interface objects.
- Vtables and indirect method calls.
- Boxing or implicit heap allocation.
- Runtime casts, type tests, downcasts, and reflection.
- Interface inheritance.
- Default method implementations.
- Interface fields or stored state.
- Associated types.
- Interface-defined constants or static functions.
- Conditional, computed, or higher-kinded bounds.
- Blanket implementations and implementation blocks for foreign types.
- User-defined overload sets with multiple requirements sharing one method
  name. The first implementation follows the compiler's current one-method-
  per-name model.

## 5. Surface syntax

### 5.1 Interface declaration

An interface is a top-level named declaration containing method requirements
without bodies:

```delta
interface Writer {
    function write(value: string): void | ioerror;
}
```

The interface declaration contains no receiver, receiver name, `Self` type, or
receiver capability. It describes the method's explicit parameters, generic
parameters, success types, and error types only.

The concrete implementation supplies its receiver:

```delta
interface Display {
    function display(): string;
}

type struct user = {
    name: string
} implements Display;

function (value: &user) display(): string {
    return value.name;
}
```

The implementation receiver must still obey Delta's existing receiver-method
rules: it must be `&Concrete` or `edit &Concrete`, and the concrete type must
be declared in the same module.

### 5.2 Read-only implementation

An implementation chooses `&Concrete` when the method only observes the value:

```delta
interface Display {
    function display(): string;
}

type struct user = {
    name: string
} implements Display;

function (value: &user) display(): string {
    return value.name;
}
```

This method can be called through either `&user` or `edit &user`.

### 5.3 Editable implementation

An implementation chooses `edit &Concrete` when it needs to mutate the value:

```delta
interface Writer {
    function write(value: string): void | ioerror;
}

type struct buffered_writer = {
    // Buffer state.
} implements Writer;

function (writer: edit &buffered_writer) write(
    value: string
): void | ioerror {
    // Append to the buffer.
}
```

Another implementation of the same interface may choose a read-only receiver:

```delta
type struct stdout_writer = {} implements Writer;

function (writer: &stdout_writer) write(
    value: string
): void | ioerror {
    // Valid conformance: writing to the process stdout does not mutate
    // stdout_writer itself.
}
```

Both types implement the same receiver-less `Writer.write` contract. Calls are
capability-checked against the selected concrete implementation:

- `edit &buffered_writer` is required for `buffered_writer.write`.
- `&stdout_writer` or `edit &stdout_writer` may call `stdout_writer.write`.
- A call through `&W` in generic code is valid only for specializations whose
  concrete method has a read-only receiver.
- A call through `edit &W` is valid for either concrete receiver form.

### 5.4 Multiple requirements

```delta
interface Writer {
    function write(value: string): void | ioerror;
    function flush(): void | ioerror;
}
```

The type conforms only when both methods are present:

```delta
type struct file_writer = {
    descriptor: int32
} implements Writer;

function (writer: edit &file_writer) write(
    value: string
): void | ioerror {
    // ...
}

function (writer: edit &file_writer) flush(): void | ioerror {
    // ...
}
```

Declaration order is irrelevant.

### 5.5 Multiple implemented interfaces

An implements list is comma-separated:

```delta
interface Writer {
    function write(value: string): void | ioerror;
}

interface Flushable {
    function flush(): void | ioerror;
}

type struct file_writer = {
    descriptor: int32
} implements Writer, Flushable;
```

The compiler validates each interface independently. A single concrete method
may satisfy compatible requirements from more than one interface.

If two interfaces require the same method name with incompatible signatures,
the type cannot implement both in the first release because Delta currently
has one receiver method per name.

### 5.6 Generic interface bound

A colon introduces an interface bound:

```delta
function write_message<W: Writer>(
    writer: edit &W,
    message: string
): void | ioerror {
    writer.write(message) as result;
    forward result;
    return;
}
```

Without `W: Writer`, member lookup on `W` fails:

```delta
function write_message<W>(
    writer: edit &W,
    message: string
): void | ioerror {
    // ERROR: type parameter W has no known method write.
    writer.write(message) as result;
    forward result;
    return;
}
```

### 5.7 Inferred generic argument

The concrete generic argument may be inferred:

```delta
let stdout = stdout_writer {};
write_message(stdout, "Hello");
```

The compiler infers:

```delta
W = stdout_writer
```

It verifies that `stdout_writer implements Writer`, then records and emits the
specialization.

An explicit generic argument remains valid:

```delta
write_message<stdout_writer>(stdout, "Hello");
```

### 5.8 Bound on a receiver function

Receiver functions may also have bounded type parameters:

```delta
type struct logger<W> = {
    destination: W
};

function (logger: edit &logger<W>) log<W: Writer>(
    message: string
): void | ioerror {
    logger.destination.write(message) as result;
    forward result;
    return;
}
```

The implementation must integrate with Delta's existing generic receiver
specialization and receiver-type substitution.

The exact placement of record-level bounds is deferred. Initially, bounds may
be placed on the receiver function that uses them.

### 5.9 Multiple bounds on one type parameter

The proposed intersection spelling is `&`:

```delta
function finish<W: Writer & Flushable>(
    writer: edit &W
): void | ioerror {
    writer.flush() as result;
    forward result;
    return;
}
```

This is an interface-bound separator in a type-parameter declaration, not a
reference marker. The parser can distinguish it from prefix `&T` by position.

The type argument must explicitly implement every listed interface.

### 5.10 Interface method with its own type parameter

Generic requirements are useful but add alpha-equivalent signature matching:

```delta
interface Encoder {
    function encode<T: Display>(value: &T): void | encodeerror;
}
```

Implementation:

```delta
type struct text_encoder = {} implements Encoder;

function (encoder: edit &text_encoder) encode<U: Display>(
    value: &U
): void | encodeerror {
    // T and U are equivalent by position and bound, not by spelling.
}
```

The first implementation may stage generic interface methods after
non-generic requirements, but the AST and signature model should not prevent
them.

### 5.11 `Printable`

With generic interface methods available, formatted values can target any
writer:

```delta
interface Printable {
    function write_to<W: Writer>(writer: edit &W): void | ioerror;
}
```

Wrapper implementation:

```delta
type struct printable_string = {
    value: string
} implements Printable;

function (value: &printable_string) write_to<W: Writer>(
    writer: edit &W
): void | ioerror {
    writer.write(value.value) as result;
    forward result;
    return;
}
```

If receiver functions remain restricted to record receivers, primitive
implementations such as `string implements Printable` require a separate,
explicit extension to receiver methods. Interfaces should not silently remove
that restriction.

An initial standard library can instead wrap primitives or use compiler-known
implementations until primitive receiver functions are designed.

### 5.12 Relationship to heterogeneous `println`

Interfaces combine with heterogeneous argument packs by constraining the
variadic type parameter directly:

```delta
function printable_count<...Args: Printable>(
    ...values: Args
): uintsize {
    return values.length;
}
```

There is deliberately no trailing `where` clause. A declaration may have one
variadic type parameter, it must be final, and its constraint applies to every
concrete type in the pack. Likewise, `...values: Args` must be the final value
parameter and is represented during semantic analysis as `values: Args[]`.
Each specialization lowers the heterogeneous arguments to concrete C
parameters; `values.length` is therefore a compile-time constant. General
pack-expansion syntax for applying an operation to every element remains a
separate language feature.

## 6. Conformance model

### 6.1 Declared, nominal conformance

Conformance is explicit:

```delta
type struct stdout_writer = {} implements Writer;
```

Merely having a method named `write` is not enough:

```delta
type struct accidental_writer = {};

function (value: edit &accidental_writer) write(
    text: string
): void | ioerror {
}

// accidental_writer does not implement Writer.
```

Explicit conformance makes public API promises searchable, prevents accidental
matching, and gives package interfaces stable metadata.

### 6.2 No orphan implementations

The `implements` clause is attached to the concrete type declaration.
Therefore, the implementing type is always local to the declaring module.

An imported type cannot be retroactively made to implement an interface:

```delta
import net from "@std/net";

// ERROR: imported types cannot be reopened or given new conformance.
type net.socket implements Writer;
```

This is consistent with Delta's existing rule that receiver functions must be
declared in the same module as their record.

### 6.3 Signature matching

For a concrete method to satisfy an interface requirement:

- The method name must match.
- The explicit parameter count and order must match.
- Parameter names do not need to match.
- Parameter types must match.
- Return types must match.
- Error sets must match after their existing normalization.
- Generic parameter counts and bounds must be alpha-equivalent.
- The implementation must be a receiver method on the implementing concrete
  type.
- Receiver capability is not part of conformance; it is checked when a
  concrete call is resolved.
- The method must obey existing ownership, lifetime, and error-channel rules.

No implicit numeric conversion, covariance, contravariance, or error-set
widening is used during conformance matching in the first release.

### 6.4 Receiver capability at call sites

The interface does not constrain receiver capability. Capability is determined
by the concrete receiver method selected for a call.

| Call receiver    | Concrete method receiver | Result  |
| ---------------- | ------------------------ | ------- |
| `&Concrete`      | `&Concrete`              | valid   |
| `&Concrete`      | `edit &Concrete`         | invalid |
| `edit &Concrete` | `&Concrete`              | valid   |
| `edit &Concrete` | `edit &Concrete`         | valid   |

For ordinary concrete calls, this is Delta's existing receiver capability
check.

For a call on a bounded generic value, the analyzer records a deferred
interface-method call. Every monomorphized specialization resolves the
concrete method and applies the same table. Consequently, a generic function
accepting `edit &W` can call either kind of implementation, while one accepting
only `&W` can be instantiated only when the selected implementation is
read-only.

### 6.5 Visibility

Private conformance may use private methods inside one module.

If an exported type publicly implements an exported interface, every required
method used for that public conformance must also be exported, either
individually or through `export module`.

Example:

```delta
export interface Writer {
    function write(value: string): void | ioerror;
}

export type struct stdout_writer = {} implements Writer;

export function (writer: edit &stdout_writer) write(
    value: string
): void | ioerror {
    // ...
}
```

This guarantees that a specialization emitted in a consuming module can link
to the concrete method.

## 7. Invalid-program examples and diagnostics

Diagnostic identifiers should be assigned in the diagnostics catalog when
implementation begins. The wording below is normative enough for tests but the
numeric codes are intentionally not preallocated here.

### 7.1 Missing method

```delta
interface Writer {
    function write(value: string): void | ioerror;
}

type struct stdout_writer = {} implements Writer;
```

Diagnostic:

```text
type `stdout_writer` declares that it implements `Writer` but is missing method
`write(string): void | ioerror`
```

### 7.2 Wrong parameter type

```delta
function (writer: edit &stdout_writer) write(
    value: int32
): void | ioerror {
}
```

Diagnostic:

```text
method `stdout_writer.write` does not satisfy `Writer.write`: parameter 1 must
be `string`, got `int32`
```

### 7.3 Wrong return type

```delta
function (writer: edit &stdout_writer) write(
    value: string
): bool | ioerror {
}
```

Diagnostic:

```text
method `stdout_writer.write` does not satisfy `Writer.write`: return type must
be `void`, got `bool`
```

### 7.4 Wrong error set

```delta
function (writer: edit &stdout_writer) write(
    value: string
): void | network_error {
}
```

Diagnostic:

```text
method `stdout_writer.write` does not satisfy `Writer.write`: error set must be
`ioerror`, got `network_error`
```

### 7.5 Receiver capability mismatch at specialization

```delta
interface Display {
    function display(): string;
}

type struct user = {
    name: string
} implements Display;

function (value: edit &user) display(): string {
    return value.name;
}

function show<T: Display>(value: &T): string {
    return value.display();
}

let value = user { name: "Delta" };
const text = show(value);
```

Diagnostic:

```text
cannot specialize `show<user>`: `user.display` requires `edit &user`, but the
call receiver is `&user`
```

The `user implements Display` declaration is valid. The failure occurs only
when this concrete implementation is called through insufficient receiver
capability.

### 7.6 Constraint failure at a call

```delta
type struct memory_block = {};
let block = memory_block {};

write_message(block, "Hello");
```

Diagnostic:

```text
type argument `memory_block` does not implement required interface `Writer`
```

The diagnostic should point to the argument or explicit type argument and also
point back to the `W: Writer` bound.

### 7.7 Interface used as a runtime type

```delta
function output(writer: edit &Writer) {
}
```

Diagnostic:

```text
interface `Writer` is a compile-time constraint and cannot be used as a value
type; use a generic parameter constrained by `Writer`
```

Suggested replacement:

```delta
function output<W: Writer>(writer: edit &W) {
}
```

### 7.8 Unknown interface

```delta
type struct stdout_writer = {} implements MissingWriter;
```

Diagnostic:

```text
unknown interface `MissingWriter`
```

### 7.9 Duplicate conformance

```delta
type struct stdout_writer = {}
    implements Writer, Writer;
```

Diagnostic:

```text
type `stdout_writer` lists interface `Writer` more than once
```

### 7.10 Incompatible overlapping requirements

```delta
interface TextWriter {
    function write(value: string): void;
}

interface ByteWriter {
    function write(value: uint8[]): void;
}

type struct output = {} implements TextWriter, ByteWriter;
```

Diagnostic:

```text
interfaces `TextWriter` and `ByteWriter` require incompatible overloads of
`write`; receiver-method overloading is not supported
```

## 8. AST and parser changes

### 8.1 Tokens

Add keywords:

```text
interface
implements
```

No `Self` token or contextual type is needed because interface requirements do
not declare receivers.

### 8.2 AST

Add an interface declaration node:

```ts
type InterfaceDeclaration = {
    kind: "interface_declaration";
    position: Position;
    name: Identifier;
    methods: InterfaceMethodRequirement[];
    documentation?: string;
    exported?: boolean;
    external?: { abi: "delta"; moduleName?: string };
};
```

Interface requirements should reuse `FunctionParameter`, `Type`, return types,
error types, and type-parameter representation where possible:

```ts
type InterfaceMethodRequirement = {
    position: Position;
    name: Identifier;
    parameters: FunctionParameter[];
    returnTypes: Type[];
    errorTypes: Type[];
    typeParameters?: Type[];
    documentation?: string;
};
```

Extend record declarations with resolved and unresolved conformance metadata:

```ts
type StructDecl = {
    // Existing fields...
    implementedInterfaces?: Type[];
};
```

Generic type parameters need bounds:

```ts
type TypeParameter = {
    name: Identifier;
    ownershipBound?: "copy" | "clone" | "unique";
    interfaceBounds: Type[];
};
```

The current AST represents type parameters as ordinary `Type` nodes. It may be
extended for the first release, but a dedicated `TypeParameter` node will avoid
overloading `Type` with declaration-only information.

### 8.3 Grammar

Proposed grammar:

```ebnf
interface-declaration
    = ["export"] "interface" identifier
      "{"
      { interface-method }
      "}" [";"] ;

interface-method
    = "function"
      identifier
      [type-parameter-list]
      parameter-list
      [":" return-types]
      ["|" error-types]
      ";" ;

implements-clause
    = "implements" type-reference
      { "," type-reference } ;

struct-declaration
    = ["export"] ["unique"] "type" "struct" identifier
      [type-parameter-list]
      "=" struct-body
      [implements-clause]
      ";" ;

type-parameter
    = identifier [":" interface-bound-list] ;

interface-bound-list
    = type-reference { "&" type-reference } ;
```

Interface methods are declaration-only in ordinary `.delta` files; they do not
need the `.ffi.delta` exception used for ordinary declaration-only functions.

### 8.4 Parser recovery

Top-level synchronization must recognize `interface` as a declaration start.
Within an interface body, malformed requirements should recover at the next
semicolon or closing brace so one error does not hide every later requirement.

`export` diagnostics must include `interface` in the list of legal following
declarations.

## 9. Semantic-analysis changes

### 9.1 Registration order

Analysis should use these graph-wide passes:

1. Register records, aliases, enums, unions, and interfaces.
2. Bind imports and exported declarations.
3. Register ordinary functions.
4. Register concrete receiver methods.
5. Resolve interface requirement signatures.
6. Resolve each record's `implements` list.
7. Validate conformance after all receiver methods are registered.
8. Analyze function bodies and constrained calls.

This preserves declaration-order independence.

### 9.2 Scope representation

Add interface symbols:

```ts
SymbolKind.SymbolInterfaceDecl;
```

The scope should retain:

```ts
interfaces: Map<string, InterfaceDefinition>;
implementations: Map<concreteTypeName, Set<interfaceName>>;
```

An `InterfaceDefinition` contains normalized requirement signatures. It should
not contain C layout or vtable information.

Imported interface names and imported concrete conformances must be rewritten
in the same way imported record and method names are rewritten today,
including namespace-qualified names such as:

```delta
import io from "@std/io";

function output<W: io.Writer>(writer: edit &W) {
}
```

### 9.3 Conformance validation

For every interface listed by a record:

1. Resolve the interface name.
2. Reject non-interface entries.
3. Reject duplicates.
4. Find each required method in the concrete type's existing receiver-method
   table.
5. Compare the explicit parameters, generic parameters, success types, and
   error types.
6. Confirm that the method receiver names the implementing concrete type.
7. Record the method's actual `&Concrete` or `edit &Concrete` capability for
   later call resolution.
8. Check public visibility when conformance crosses a module boundary.
9. Record the validated implementation relation.

Invalid conformance must not be entered into the implementation relation, which
prevents later generic calls from generating misleading secondary errors.

### 9.4 Bound validation

When a generic call resolves concrete type arguments, the analyzer must:

1. Resolve every bound named by the type parameter.
2. Verify that the bound is an interface.
3. Verify declared conformance for the concrete type.
4. Report all failed bounds at the call site.
5. Record the specialization only after bounds succeed.

### 9.5 Member lookup on bounded type parameters

Today, receiver member lookup expects a known concrete record. Extend it so a
generic type parameter can expose the union of methods guaranteed by its
interface bounds.

For:

```delta
function send<W: Writer>(writer: edit &W, text: string) {
    writer.write(text);
}
```

`writer.write` resolves to the `Writer.write` requirement during generic body
analysis, without assuming a receiver capability. The call expression records:

- the declaring interface,
- the selected requirement,
- the generic receiver parameter,
- the capability available at the generic call site,
- the eventual concrete receiver type for each specialization.

If multiple bounds provide an identical compatible requirement, the call is
unambiguous. If they provide incompatible requirements, analysis reports an
ambiguity.

When a specialization is created, the analyzer resolves the concrete witness
method and verifies that the generic call-site capability can invoke its
receiver. A failed capability check rejects that specialization with a
diagnostic at the call that requested it.

## 10. C lowering

### 10.1 Interface declaration

This Delta declaration:

```delta
interface Writer {
    function write(value: string): void | ioerror;
}
```

emits no C declaration by itself.

The interface is compile-time metadata only.

### 10.2 Concrete method

Delta:

```delta
type struct stdout_writer = {} implements Writer;

function (writer: edit &stdout_writer) write(
    value: string
): void | ioerror {
    // ...
}
```

uses the existing receiver-function lowering, conceptually:

```c
delta_result_void_ioerror
delta__module__stdout_writer_write(
    delta__module__stdout_writer *writer,
    delta_string value
) {
    /* ... */
}
```

The exact result type continues to use Delta's existing fallible-function ABI.
Interfaces do not introduce a second error representation.

The record uses the existing record layout. If the C backend needs a non-empty
representation for an empty record, that is a general record-lowering concern,
not interface-specific storage.

### 10.3 Generic specialization

Delta:

```delta
function write_message<W: Writer>(
    writer: edit &W,
    value: string
): void | ioerror {
    writer.write(value) as result;
    forward result;
    return;
}
```

Call:

```delta
let writer = stdout_writer {};
write_message(writer, "Hello");
```

Conceptual generated C:

```c
delta_result_void_ioerror
delta__module__write_message__stdout_writer(
    delta__module__stdout_writer *writer,
    delta_string value
) {
    return delta__module__stdout_writer_write(writer, value);
}
```

The interface call is replaced with the concrete receiver symbol while
emitting the specialization. There is no interface object and no indirect
call.

### 10.4 Multiple concrete types

```delta
let stdout = stdout_writer {};
let file = file_writer { descriptor: 1 };

write_message(stdout, "console");
write_message(file, "file");
```

produces two specializations:

```c
delta__module__write_message__stdout_writer(...);
delta__module__write_message__file_writer(...);
```

Each specialization directly calls its concrete `write` method.

### 10.5 No runtime interface representation

The following artifacts must not be generated in v1:

```c
struct Writer;
struct WriterVTable;
void *boxed_writer;
```

The only runtime data is the original concrete value.

## 11. Modules, exports, and packages

### 11.1 Named import

```delta
import { Writer } from "@std/io";

function send<W: Writer>(writer: edit &W) {
}
```

### 11.2 Module namespace import

```delta
import io from "@std/io";

function send<W: io.Writer>(writer: edit &W) {
}
```

Qualified interface names should use the same binding and type-rewriting path
as qualified record types.

### 11.3 Group export

```delta
interface Writer {
    // ...
}

type struct stdout_writer = {} implements Writer;

export module io;
```

`export module` exports the interface, the record, and eligible receiver
methods under the existing group-export rules.

### 11.4 Generated `.ffi.delta` interface

An exported library interface must preserve declarations and conformance:

```delta
ffi module "io";
ffi dynamic "./libio.dylib";

export interface Writer {
    function write(value: string): void | ioerror;
}

export type struct stdout_writer = {} implements Writer;

export function (writer: edit &stdout_writer) write(
    value: string
): void | ioerror;
```

The interface declaration and `implements` clause are ABI metadata; only the
concrete exported receiver function names a linkable symbol.

### 11.5 Generic package limitation

The current package generator rejects exported generic functions because
prebuilt generic ABI specializations are not supported.

Therefore, an interface-based generic function may be:

- compiled and specialized within the same source compilation graph, or
- kept in source form for consumers,

but it cannot yet be exported as an ordinary prebuilt generic function in a
`.ffi.delta` package.

Interface packaging should preserve concrete conformance first. Exported
prebuilt generics need their own ABI/template-distribution design.

## 12. LSP and formatter support

The language tooling should add:

- Keyword highlighting for `interface` and `implements`.
- Formatting for interface bodies and implements lists.
- Document symbols for interfaces and requirements.
- Go-to-definition from an implemented interface name.
- Go-to-definition from a generic bound.
- Go-to-definition from a constrained method call to the interface
  requirement, with the concrete method available when specialization context
  is known.
- Hover text showing requirements and known implementers.
- Completion of interface names after `implements` and after a generic bound
  colon.
- Member completion on bounded generic values.
- Rename support for interfaces and their requirements.
- Workspace indexing of exported interfaces from `.delta` and `.ffi.delta`
  files.

Generating missing method stubs is useful but can follow the initial semantic
support.

## 13. Implementation phases

### Phase A: syntax and AST

- Add `interface` and `implements` tokens.
- Add interface and requirement AST nodes.
- Parse implements lists.
- Parse interface bounds on generic type parameters.
- Update parser recovery and formatter.

Gate:

- Valid examples produce complete ASTs.
- Receiver clauses and method bodies inside interfaces are rejected.

### Phase B: interface registration

- Register interface symbols before methods.
- Normalize requirement signatures.
- Reject duplicate interfaces and duplicate requirement names.
- Bind exported and imported interface symbols.

Gate:

- Interfaces resolve across relative, dependency, and `@std` imports.

### Phase C: concrete conformance

- Record implements lists on records.
- Match receiver methods and signatures.
- Record concrete receiver capability and enforce visibility rules.
- Add focused diagnostics.

Gate:

- All valid conformance examples pass.
- Every invalid-program example in section 7 has a regression test.

### Phase D: bounded generics

- Represent interface bounds on type parameters.
- Check bounds during explicit and inferred generic resolution.
- Expose interface requirements during generic member lookup.
- Record the chosen requirement and available receiver capability on call
  expressions.
- Validate concrete witness receiver capability when creating each
  specialization.

Gate:

- A generic `write_message<W: Writer>` type-checks.
- Passing a non-implementer produces one precise call-site diagnostic.

### Phase E: static C lowering

- Substitute the concrete receiver type in each specialization.
- Rewrite constrained interface calls to concrete receiver function names.
- Reuse existing generic mangling and fallible result ABI.
- Verify no vtable or interface storage is emitted.

Gate:

- Compile-and-run fixtures dispatch correctly for at least two implementing
  records.
- Generated C contains direct calls to both concrete methods.

### Phase F: modules and packages

- Export and import interface declarations.
- Copy implementation relations through module binding.
- Preserve qualified names under namespace imports.
- Emit exported interfaces and conformances in generated `.ffi.delta` files.
- Validate generated package interfaces.

Gate:

- An application imports an interface and implementing type from a packaged
  dynamic library, specializes a local generic function, links, and runs.

### Phase G: LSP and documentation

- Add indexing, navigation, hover, completion, and formatting.
- Update the main specification and compiler-status document.
- Reconcile older documents that assume all interfaces use dynamic dispatch.

Gate:

- LSP tests cover source interfaces, packaged interfaces, namespace imports,
  constrained completion, and same-library behavior.

### Phase H: generic interface methods

- Match alpha-equivalent method type parameters and bounds.
- Specialize nested generic receiver calls.
- Validate the `Printable.write_to<W: Writer>` example.

This phase may land with Phase D/E if the existing generic machinery makes it
small; otherwise it is an explicit second static-interface milestone.

## 14. Test plan

The executable fixtures are in
[`test-source/tests/interfaces`](../../test-source/tests/interfaces). The suite
is expected to remain red until each implementation phase lands.

### 14.1 Tokenizer and parser

- Empty interface.
- One and several requirements.
- Rejection of receiver clauses in interface requirements.
- Return and error channels.
- Generic interface method.
- One and several implemented interfaces.
- One and several generic bounds.
- Exported interface.
- Interface in `.ffi.delta`.
- Recovery after malformed requirements.

### 14.2 Semantic conformance

- Method declared before and after the record.
- Exact match.
- Read-only receiver implementation.
- Editable receiver implementation.
- Missing method.
- Parameter-count mismatch.
- Parameter-type mismatch.
- Return mismatch.
- Error-set mismatch.
- Duplicate conformance.
- Unknown interface.
- Non-interface in implements list.
- Conflicting requirements from multiple interfaces.
- Private and public conformance visibility.
- No orphan conformance.

### 14.3 Generic analysis

- Explicit type argument satisfying a bound.
- Inferred type argument satisfying a bound.
- Failed bound.
- Read-only generic receiver with a read-only implementation.
- Read-only generic receiver rejected for an editable implementation.
- Editable generic receiver with both implementation receiver forms.
- Multiple bounds.
- Constrained member lookup.
- Unconstrained member lookup rejection.
- Bound through a namespace import.
- Bound on a receiver method.
- Generic requirement alpha-equivalence.

### 14.4 Code generation

- One specialization and direct call.
- Two concrete specializations.
- Editable and read-only concrete receivers.
- Fallible interface method.
- Interface method returning a value.
- Generic interface method.
- No generated vtable symbols.
- No interface-induced allocation.

### 14.5 Modules and packages

- Exported interface imported by name.
- Exported interface imported through a module namespace.
- `export module` group export.
- Concrete type implements an imported interface.
- Generated `.ffi.delta` preserves conformance.
- Dynamic-library method symbols link from a consumer specialization.

### 14.6 Regression

- Existing receiver-method tests remain unchanged.
- Existing generic specializations retain their C names.
- Existing module and package tests remain unchanged.
- Existing ownership and mutability diagnostics remain unchanged.

## 15. Acceptance example

The static-interface milestone is complete when this shape compiles, links, and
runs without a vtable:

```delta
type struct ioerror = {
    code: int32
};

interface Writer {
    function write(value: string): void | ioerror;
}

type struct stdout_writer = {} implements Writer;
type struct counting_writer = {
    writes: uintsize
} implements Writer;

function (writer: edit &stdout_writer) write(
    value: string
): void | ioerror {
    // Write value to stdout.
}

function (writer: edit &counting_writer) write(
    value: string
): void | ioerror {
    writer.writes = writer.writes + 1;
}

function write_line<W: Writer>(
    writer: edit &W,
    value: string
): void | ioerror {
    writer.write(value) as text_result;
    forward text_result;

    writer.write("\n") as newline_result;
    forward newline_result;
    return;
}
```

Calls with both writer types must produce two monomorphized `write_line`
functions, each containing direct calls to the corresponding concrete `write`
method.

## 16. Future dynamic dispatch

Runtime polymorphism should be a separate, explicit feature:

```delta
function output(
    writer: edit &dynamic Writer,
    value: string
): void | ioerror {
    writer.write(value) as result;
    forward result;
    return;
}
```

Only this explicit form would require a runtime representation such as:

```c
typedef struct {
    void *data;
    const delta_writer_vtable *vtable;
} delta_dynamic_writer;
```

That future plan must define object safety, ownership of boxed values,
borrowed interface references, lifetime propagation, vtable layout, package
ABI stability, and whether allocation is ever implicit.

None of those decisions are prerequisites for the static interface plan.

## 17. Open decisions

The following decisions should be confirmed before implementation:

1. Whether `&` is the final separator for multiple interface bounds.
2. Whether public conformance requires explicit `export` on every witness
   method or makes witness symbols link-visible automatically.
3. Whether generic interface methods ship in the first milestone or the
   immediately following static-interface milestone.
4. Whether receiver methods on primitive types are introduced for
   `string implements Printable`, or the standard library initially uses
   wrappers/compiler-known implementations.
5. How source-defined exported generic functions are distributed through
   prebuilt packages.
