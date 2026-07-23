# Generics implementation changes

This document records the changes made to implement and complete the generics
test suite.

## Source changes

The line numbers below are the current working-tree line numbers.

| File and lines | Change | Why |
| --- | --- | --- |
| `src/ast/types.ts:93`, `122-143`, `166-175`, `335-341`, `370-380` | Added `typeParameters` to types, structs, unions, functions, object literals, and calls; added concrete-type maps to generic declarations and expressions. | The parser, analyzer, and emitter need somewhere to retain declared parameters, supplied arguments, and requested specializations. |
| `src/ast/parser.ts:153-301` | Updated function parameter and return-type parsing to accept nested type arguments and resolve references to the enclosing function's generic parameters. | Makes signatures such as `Result<T, E> -> Result<T, E>` represent `T` and `E` as generic placeholders rather than unknown custom types. |
| `src/ast/parser.ts:329-400` | Expanded `parseTypeParams` to parse nested arguments and arrays, split a `>>` token when it closes nested generic lists, and reject duplicate parameter names for declarations. | Supports nested declarations such as `Result<Result<int32, char>, bool>` and reports invalid `<T, T>` declarations. |
| `src/ast/parser.ts:403-415` | Added `resolveFunctionTypeParameters`. | Recursively resolves generic identifiers inside a custom type's argument list. |
| `src/ast/parser.ts:1974-2058`, `2169-2219` | Parsed generic struct fields and generic-union declarations/variants. | Supports `Box<T> { value: T }` and `Result<T, E> = Ok<T> | Error<E>`. |
| `src/analysis/declarations.ts:52-64`, `97-224` | Stored function declarations and their type parameters in function symbols; added signature-type validation that treats `TypeCustom` and `TypeGeneric` differently. | Enables concrete-function emission and reports undeclared generic parameters while continuing to allow declared named types. |
| `src/analysis/declarations.ts:255-273`, `301-357` | Registered union and struct type parameters; stored struct declarations on their symbols; added the direct self-by-value cycle check at `303-314`. | Enables later specialization of unions/structs and makes `Node<T> { next: Node<T> }` fail instead of producing an invalid infinite-size type. |
| `src/analysis/type_analyzer.ts:23-40`, `119-137` | Added recursive `substituteType` and extended custom-type matching to compare type arguments. | A specialization replaces `T`/`E` in nested fields and union variants, and `Result<int32, char>` must not match `Result<bool, char>`. |
| `src/analysis/statements/variable_declaration.ts:133-171` | Resolved annotated custom types using their supplied arguments, checked arity, and preserved the specialized arguments on the resolved type. | Lets variables keep their exact types, e.g. `const x: Result<int32, char>`. |
| `src/analysis/statements/return_statement.ts:20-39` | Resolved a generic custom return type before comparing it with the returned expression. | Permits returning a concrete generic struct or union from a generic function. |
| `src/analysis/expression_analyzer.ts:79-90` | Prevented identifier analysis from replacing an already-specialized custom type with the unspecialized global declaration. | This is the final fix for `passThrough<int32, char>(input)`: `input` remains `Result<int32, char>`. |
| `src/analysis/expression_analyzer.ts:267-403` | Renamed object-literal validation to analysis, inferred/validated generic field types, and recorded concrete struct types on the declaration. | Provides the resolved literal type and tells code generation which `Box<T>` specializations to emit. |
| `src/analysis/expression_analyzer.ts:658-828` | Added generic call inference, explicit argument validation, custom-parameter and return-type specialization, and concrete-function registration. | Emits/checks separate specializations such as `identity__int32` and `identity__char`. |
| `src/codegen/emitter.ts:295-356`, `613-689`, `703-708` | Added concrete struct emission and changed function emission to emit each recorded generic specialization. | Generates C declarations/definitions only for concrete instantiations and does not use AST walking to discover them. |

## Tests added or extended

`test-source/tests/generics/tests.json` and tests `27` through `36` add
generic-union coverage: declaration syntax, variant payloads, generic function
parameters and returns, multiple instantiations, nesting, arity errors, payload
mismatches, and function argument mismatches. The existing tests `01` through
`26` exercise generic functions and structs, inference, nested calls, arrays,
and invalid declarations.

## Verification

Ran `npm run build` and `node dist/run-tests.js generics`.

Result: **36 passed, 0 failed**.
