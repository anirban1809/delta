# Plan: Phase D — `extern "c"` Interop (v0.5)

Date drafted: 2026-06-03
Status: planning, not started.
Predecessor: Phase **I** (multi-file modules) landed.
Successor: Phase J (`std/log`) uses an extern block to wrap `fprintf`; Phase A's panic helper depends on Phase D for its own `fprintf` call.
Spec basis: [spec-sections/03-basic-syntax-and-variable-bindings.md](../../spec-sections/03-basic-syntax-and-variable-bindings.md) §3, [spec-sections/07-string-family-types.md](../../spec-sections/07-string-family-types.md) (cstringview).

## Goal

Let Delta source declare C functions that exist outside the Delta world, including variadic ones, and let codegen emit them as plain forward declarations without mangling. Provide just enough `cstringview` to pass string literals to a C variadic. After Phase D:

```delta
extern "c" {
    function printf(fmt: cstringview, ...args): int32;
}

function main(): int8 {
    printf("hello\n");
    return 0;
}
```

…compiles, runs, prints `hello\n`, exits 0. With nothing else (no Phase A primitives beyond v0, no Phase J stdlib), this is the first time Delta source can produce visible output.

## In-scope language surface

- `extern "c" { ... }` block parsing at top-level.
- Variadic syntax `...args` (with optional type annotation) inside `extern "c"` declarations.
- `cstringview` primitive type, lowering to `const char*` in C.
- String literal `"..."` typed as `cstringview` when the surrounding context requires it (parameter, return, binding annotation).
- Codegen for extern: forward declarations with unmangled C names, variadic ellipsis in the C signature.
- Calls to extern functions, including variadic calls, type-checked against the fixed parameters and loosely-checked against the variadic tail.

## Explicitly out of scope for Phase D

| Feature | Reason | Eventual home |
|---|---|---|
| `extern "c"` function definitions (bodies) | Declarations only; Delta source cannot implement a C function in Phase D. | Never (by design — Delta source emits Delta-mangled symbols, not C ones). |
| Other ABIs (`extern "system"`, `extern "rust"`) | One ABI is enough; the spec hasn't committed to others. | Never planned for v0.5. |
| Full string family (`string`, `stringview`, `cstring`) | Only `cstringview` for literal passthrough. | Post-v0.5. |
| Template literals, string concatenation, `.slice()` | Same. | Post-v0.5. |
| `extern "c" {}` *types* — opaque structs imported from C | Phase D imports only functions. | Post-v0.5; needed eventually for FILE*, sockets, etc. |
| User-defined variadics (`function f(...args)` outside extern) | Spec defers Delta-side variadics; cost vs benefit is poor in v0.5. | Post-v0.5. |
| Including C header files / using C macros | Every C function we use must be re-declared in Delta. | Never planned. |

If a program uses an out-of-scope construct that the analyzer happens to accept, codegen emits a structured "Phase D: not supported" diagnostic.

## What's missing today

- No `extern` keyword in the tokenizer; `"c"` parses as a normal string literal which the parser doesn't expect at top-level.
- No `...` token sequence handler in the parser; variadic parameter syntax doesn't exist.
- No `cstringview` type in the analyzer's primitive set (`TypeString` exists but is a placeholder, currently rejected by codegen).
- String literal typing always falls back to `TypeString` — there's no binding-driven retype to `cstringview`.
- Codegen has no special path for variadic functions and would emit `printf` with module-mangled name.

## Decisions

1. **`extern "c"` is the only ABI accepted.** Any other ABI string is a structured diagnostic with "only \"c\" is supported in v0.5." This keeps the parser-AST shape future-proof without committing to a multi-ABI story now.
2. **Variadic syntax is allowed *only* inside `extern "c"`.** A Delta-side function declaration with `...args` is rejected. The variadic-extern path is one-way: Delta callers can pass extra args; Delta callees can't receive them.
3. **Variadic type annotations are accepted but ignored at type-check time.** Spec writes `...args: T[]`, but in `extern "c"` the C ABI doesn't enforce a uniform tail type, and trying to do so in Delta would require generic arrays. For Phase D, the annotation is parsed for forward-compat and the analyzer treats variadic args as "any C-ABI-passable type."
4. **`cstringview` is a new primitive `TypeKind`, distinct from `TypeString`.** `TypeString` stays the placeholder for the future owned `string`. `cstringview` lowers to `const char*`. The analyzer's primitive-type table grows accordingly.
5. **String literal binding-driven typing.** A bare `"hello"` literal acquires `TypeCstringview` when its context demands it (parameter type, return type, binding annotation). With no context, it remains `TypeString` (and is still rejected by codegen — consistent with v0).
6. **Variadic arguments at the call site type-check against a "C-ABI-passable" set.** That set is: every integer primitive, every float, and `cstringview`. `bool` and `char` are *not* passable because of C's default argument promotion rules (a `bool` promoted to `int` in K&R-style varargs has undefined width across some ABIs). The user gets a diagnostic with a fix-it hint: "convert to int32 explicitly."
7. **No mangling for extern symbols.** `printf` in Delta source lowers to `printf` in C source, period. Mangling is for Delta-emitted symbols; extern symbols belong to libc.
8. **Extern declarations are not exportable.** An `export extern "c" { ... }` is rejected. Extern symbols already exist globally; re-exporting them across Delta modules makes no sense. Each module that needs `printf` declares its own.

## Tokenizer changes

- New reserved keyword: `extern`.
- New token kind `Op_Ellipsis` for `...`. The tokenizer's lookahead handles the distinction from `.` and `..`.

## Parser changes

- New top-level node `ExternBlock { ABI string; Declarations []FunctionDeclaration; Position }`.
- `FunctionDeclaration` grows:
  - `Variadic bool`
  - `VariadicName string` (when `Variadic`, the trailing param's name)
  - `IsExtern bool` (set when the parent is an `ExternBlock`)
- Variadic param parse rule: trailing parameter may take the form `...name` or `...name: TypeRef`. The type annotation is accepted in any extern function; it is rejected elsewhere.
- Parsing rule: inside `extern "c" { ... }`, only function declarations may appear. Each must lack a body (the `;` ends the declaration). Bodies inside extern are a structured error.

## Semantic analyzer changes

- Add `TypeCstringview` to `TypeKind` and the printable-name table; `lookupPrimitive("cstringview")` returns it.
- Extern functions register as `SymbolFunction` with `IsExtern: true` and `Variadic: true|false` flags. The mangling pass skips them.
- Fixed-parameter type checks proceed as for any function call.
- Variadic-tail type check: each trailing argument must satisfy `IsCABIPassable(t)`:
  ```go
  func IsCABIPassable(t Type) bool {
      return IsInteger(t.Kind) || IsFloat(t.Kind) || t.Kind == TypeCstringview
  }
  ```
  Failures get "variadic arg of type X cannot be passed through C ABI; convert explicitly with `int32(...)` or similar."
- String-literal binding-driven typing: at the use site of a `StringLiteral`, walk up to the nearest typing context; if that context demands `cstringview`, type the literal `cstringview`. Otherwise leave it `TypeString` (analyzer-only; codegen still rejects).
- Reject `extern "c"` bodies (parser already caught them, but the analyzer double-checks the AST shape).
- Reject `export extern "c" { ... }` with "extern declarations cannot be exported."

## Codegen changes

- New type mapping row: `cstringview → const char*`.
- Extern block lowering: emit each declared function as a plain forward declaration at the top of the TU, *unmangled*. Variadic functions get C `...` in the signature:
  ```c
  extern int32_t printf(const char *fmt, ...);
  ```
- String literal in `cstringview` context: emit a C string literal with proper escaping (newlines, quotes, backslashes); store in `.rodata`. The literal is not heap-allocated, which is correct for `cstringview`.
- Variadic call lowering: emit the call with all arguments in source order. Trailing args pass through verbatim; the C compiler handles the variadic ABI.
- No-op for extern in the "module-mangled exports" pass — `IsExtern` symbols skip mangling.
- Fail-closed: if a `StringLiteral` reaches codegen still typed `TypeString` (no context, none demanded), emit "string literal in non-`cstringview` context is unsupported in Phase D."

## Testing strategy

Initial fixtures under `test-source/tests/codegen/extern/`:

- `extern_printf_ok.delta` — declares `printf`, calls it with a string literal, asserts the binary prints the literal and exits 0.
- `extern_variadic_int_ok.delta` — passes an `int32` through `printf("%d\n", value)`, asserts both stdout and exit code.
- `extern_non_c_abi_err.delta` — `extern "rust" {}`; expect "only \"c\" is supported."
- `extern_body_err.delta` — extern function with a body; expect "extern declarations cannot have bodies."
- `variadic_outside_extern_err.delta` — Delta-side `function f(...args)`; expect "variadic parameters allowed only in `extern \"c\"` blocks."
- `non_passable_variadic_arg_err.delta` — `printf("%d\n", true)`; expect "variadic arg type bool cannot be passed through C ABI."
- `extern_export_err.delta` — `export extern "c" {}`; expect "extern declarations cannot be exported."
- `string_literal_no_context_err.delta` — `let x = "hello";` with no annotation; expect "string literal in non-`cstringview` context is unsupported in Phase D" from codegen.

The existing project fixtures from Phase I continue to pass; the v0 codegen fixtures continue to pass.

## Stage-by-stage implementation order

1. Tokenizer: `extern` keyword, `...` token.
2. Parser: `ExternBlock` node, variadic param parse, body-rejection inside extern.
3. Analyzer: `TypeCstringview` primitive; extern symbol registration; variadic-call type check; string-literal binding-driven typing; rejection of `export extern`.
4. Codegen: type mapping, extern forward decls, string-literal-in-context emission, variadic-call passthrough.
5. Fail-closed: codegen-level diagnostic for `TypeString`-untyped string literals.
6. Fixture suite.

Steps 1–2 are mechanical. Step 3 introduces the first binding-driven retype in the analyzer; the pattern reused later by Phase A for integer-literal typing. Step 4 is small.

## Risks and open questions

- **Libc linkage.** clang implicitly links libc on every Unix-like platform we care about. No flag changes needed. If Windows ever ships, this is a separate problem.
- **Quoted-string escapes.** Delta's string-literal escape set (`\n`, `\t`, `\r`, `\\`, `\"`, `\0`, `\u{...}`, `\<newline>` line continuation) does not match C's exactly. The emitter has to translate. For Phase D's narrow scope, only `\n`, `\t`, `\r`, `\\`, `\"`, `\0` are likely to appear in literals passed to C; `\u{...}` requires UTF-8 byte-expansion before emission. Land Phase D with the simple-escape set; reject `\u{...}` in `cstringview` literals with "Unicode escape in cstringview literal not supported in Phase D" until needed.
- **`stderr` is a macro.** `stderr` and `stdout` are macros in `<stdio.h>`, not symbols. Programs that want to call `fprintf(stderr, ...)` from Delta need a shim. Phase D doesn't ship one — Phase J does. So Phase D's working `printf` example uses stdout only.
- **Binding-driven typing without full bidirectional inference.** The Phase D string-literal retype is a one-off shortcut: it works because parameter type annotations are visible at call type-check time. The general "annotation drives inference" pass is still pending per compiler-status.md. The shortcut here is contained to one literal kind in one context type — no broader commitment.

## Definition of done

- `extern_printf_ok` runs, prints `hello\n`, exits 0.
- All eight extern fixtures pass with their declared expectations.
- Module fixtures from Phase I continue to pass.
- v0 codegen fixtures continue to pass.
- The Phase J plan can begin: import path resolution works, extern variadics work, `cstringview` is real. Phase J only adds content (a `stdlib/log.delta` source + a shim) on top of Phase I + Phase D's machinery.
