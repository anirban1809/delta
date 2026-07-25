# String primitive

Status: implemented compiler baseline (2026-07-22)

## Surface syntax

`string` is Delta's primitive type for a fixed-length-backed string slice. A string
literal may use double quotes or single quotes:

```delta
const name = "Anirban";
const name2 = 'Anirban';

function greeting(): string {
    return "hello";
}
```

The compiler infers `string` when a binding has no annotation. `string` is also
valid in binding annotations, parameters, return types, fields, and type
arguments.

Delta already uses a single-quoted, one-Unicode-scalar literal for `char`.
That syntax remains unambiguous: `'A'` is `char`, while `''` and any
single-quoted literal containing more than one scalar are `string`. A
one-character string can always be written with double quotes (`"A"`).

Both string delimiters accept the same escapes. The initial implementation
recognizes `\n`, `\r`, `\t`, `\0`, `\\`, `\"`, `\'`, `\xNN`, and `\u{...}`.

## Storage and lifetime

Each literal occurrence is UTF-8 encoded into its own statically allocated,
fixed-size character block. The compiler appends a NUL byte for C interop, so a
literal containing `N` UTF-8 bytes occupies `N + 1` bytes. The NUL terminator is
storage metadata and is not part of the Delta string's logical contents.

The character block is mutable storage and lives for the duration of the
program. A `const` declaration makes the Delta binding immutable; it does not
change the storage class of the literal block. Mutation operations are not yet
part of the string surface.

Literal length is known by the compiler and fixes the backing block's capacity.
Every `string` value also carries that logical UTF-8 byte length at runtime.
The read-only `value.length` property has type `uintsize` and excludes the
trailing NUL byte. This baseline does not support resizing, allocation,
concatenation, indexing, or string operators.

A mutable `let` binding may be rebound to another string slice. Rebinding copies
both the data pointer and the length, so the binding may point at a differently
sized static block without losing its slice metadata. It does not resize or
modify either backing block.

## Compile-time concatenation

`+` concatenates strings only when both operands are compile-time constants.
String literals, `const` bindings initialized from constant strings, and chains
of constant concatenations qualify:

```delta
const message = "Hello, " + "world";
const hello = "hello";
const world = hello + " world";
```

The compiler decodes both operands, concatenates their UTF-8 bytes, and emits a
new static block with one trailing NUL. The resulting slice length is the sum of
the operands' logical byte lengths. No runtime addition, allocation, or copy is
emitted.

Mutable bindings, parameters, function results, and other runtime values cannot
be concatenated as primitive strings. Those cases require the future
`dynamicstring.concat(...)` standard-library operation because they need owned
storage and may fail allocation.

## C lowering

The primitive type lowers to `delta_string`:

```c
typedef struct {
    char* data;
    uintptr_t length;
} delta_string;
```

A source literal is emitted as a named, fixed-size static block and expressions
evaluate to a slice containing a pointer to that block and its UTF-8 byte
length. For example, `"Hi"` has the conceptual lowering:

```c
static char __delta_string_0[3] = { 72, 105, 0 };
delta_string value = (delta_string) {
    .data = __delta_string_0,
    .length = 2,
};
```

Using numeric UTF-8 byte initializers keeps the result independent of the C
compiler's source encoding and makes the fixed allocation size explicit.
Distinct literal occurrences use distinct blocks, so future mutation support
will not introduce accidental aliasing merely because two literals have equal
contents.

## Deferred dynamic strings

Resizable and dynamically allocated strings are deliberately out of scope.
They will be implemented later in the standard library with explicit ownership,
capacity, allocation-failure, and disposal semantics.
