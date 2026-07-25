# Delta — Semantic Diagnostics Catalog

The messages the semantic analyzer emits, grouped by feature (same order as
`examples/`). These render through `Diagnostics.format` as:

```
semantic error: <message>
at file.delta:LINE:COL
```

## Style rules
- **Lowercase**, no trailing period. One line. Lead with the problem, not the rule.
- **Backtick every identifier, type, field, and operator**: `` `x` ``, `` `int32` ``, `` `+` ``.
- **Name the thing**: prefer `` cannot assign to `const` binding `step` `` over
  "cannot assign to constant".
- Add a second `hint:` line **only** when the fix isn't obvious from the message
  (ownership, lifetimes, conversions). Don't restate the error as a hint.
- Stable codes (`E0101`…) are for tests, docs, and `--explain`; they never change
  meaning once shipped.

---

## E01xx — Names, scopes, declarations
| Code | Message |
|------|---------|
| E0101 | use of undeclared name `` `x` `` |
| E0102 | duplicate declaration of `` `x` `` in this scope |
| E0103 | `` `x` `` shadows a binding from an enclosing scope |
| E0104 | cannot infer the type of `` `x` `` without an initializer or annotation |
| E0105 | `let` is not allowed at file scope; use `const` |
| E0106 | top-level executable statements are not allowed |
| E0107 | `main` must be declared at top level as `function main(): uint8` |
| E0108 | `` `f` `` is declared more than once (no overloading by name alone) |

## E02xx — Types, operators, conversions
| Code | Message |
|------|---------|
| E0201 | type mismatch: expected `` `T` ``, found `` `U` `` |
| E0202 | no implicit conversion from `` `int32` `` to `` `int64` `` — write `` `int64(x)` `` |
| E0203 | no implicit sign change from `` `int32` `` to `` `uint32` `` — write `` `uint32(x)` `` |
| E0204 | no implicit conversion between `` `int32` `` and `` `float64` `` — write `` `float64(x)` `` |
| E0205 | operator `` `+` `` expects matching numeric operands, found `` `int32` `` and `` `int64` `` |
| E0206 | operator `` `&&` `` expects `bool` operands, found `` `int32` `` |
| E0207 | unary `` `-` `` expects a numeric operand, found `` `bool` `` |
| E0208 | unary `` `!` `` expects a `bool` operand, found `` `int32` `` |
| E0209 | condition must be `bool`, found `` `int32` `` |
| E0210 | integer literal `99999999999` does not fit in `` `int32` `` |
| E0211 | `` `T(x)` `` is not a valid conversion: `` `T` `` is not a numeric type |
| E0212 | call expects `N` arguments, found `M` |
| E0213 | argument `N` has type `` `U` ``, expected `` `T` `` |
| E0214 | `` `x` `` is not callable |
| E0215 | `` `return` `` here yields `N` values, but `` `f` `` declares `M` |

## E03xx — Mutability & assignment
| Code | Message |
|------|---------|
| E0301 | cannot assign to `` `const` `` binding `` `x` `` |
| E0302 | cannot mutate `` `const` `` binding `` `x` `` |
| E0303 | cannot assign field of `` `const` `` binding `` `x` `` |
| E0304 | `` `const` `` declaration requires an initializer |
| E0305 | `` `++` `` requires a mutable integer binding |
| E0306 | multiple bindings per statement are not allowed |

## E04xx — Control flow, definite assignment, returns
| Code | Message |
|------|---------|
| E0401 | `` `x` `` may be read before it is assigned |
| E0402 | partial initialization is not allowed — assign the whole value of `` `x` `` first |
| E0403 | missing return: `` `f` `` must return `` `T` `` on every path |
| E0404 | unreachable code after `return` |
| E0405 | `break` outside of a loop |
| E0406 | `continue` outside of a loop |
| E0407 | control-flow body requires braces |
| E0408 | `switch` requires a `default` case |
| E0409 | duplicate case label `5` |
| E0410 | case label must be a constant `` `int` ``/`` `char` `` matching the scrutinee type |
| E0411 | `switch` scrutinee must be an integer or `char`, found `` `T` `` |

## E05xx — Record types
| Code | Message |
|------|---------|
| E0501 | `` `T` `` has no field `` `f` `` |
| E0502 | missing field(s) `` `y` ``, `` `z` `` in `` `T` `` literal |
| E0503 | unknown field `` `w` `` in `` `T` `` literal |
| E0504 | field `` `x` `` expects `` `T` ``, found `` `U` `` |
| E0505 | cannot infer the type of this object literal |
|       | hint: annotate the binding or use it in a typed position |
| E0506 | duplicate field `` `x` `` in record `` `T` `` |
| E0507 | recursive record `` `T` `` requires indirection |
|       | hint: wrap the field in `` `owned<T>` `` to break the cycle |

## E06xx — Recoverable error model
| Code | Message |
|------|---------|
| E0601 | `` `as result` `` requires a fallible expression — this expression cannot fail |
| E0602 | `` `x` `` is pending and cannot be used before its `check` block |
| E0603 | `check` block must diverge on every path (`return`, `return error as`, `break`, or `continue`) |
| E0604 | no matching `` `as result` `` for `` `check result` `` |
| E0605 | `` `return error as` `` is only allowed in a function that declares an error set |
| E0606 | error type `` `E` `` must be a declared record type |
| E0607 | fallible call must be bound with `` `as result` `` |
| E0608 | object literal does not match any error type in the declared set |

## E07xx — Ownership, move, clone
| Code | Message |
|------|---------|
| E0701 | use of moved value `` `x` `` |
|       | hint: `` `x` `` has type `` `T` ``, which is unique — passing it on line `N` transferred it |
| E0702 | cannot move out of `` `const` `` binding `` `x` `` |
| E0703 | cannot move out of a reference `` `x` `` |
| E0704 | cannot partially move out of `` `x` `` — move the whole value |
| E0705 | `` `x` `` may be used after being moved on a previous loop iteration |
| E0706 | *retired* — a bare use of a resource-owning value now clones; see `E0709` for the maybe-moved case |
| E0707 | `clone` requires a cloneable type; `` `T` `` is unique |
| E0708 | `` `<clone T>` `` body must choose `&x`, `move x`, or `clone x` — bare reuse is forbidden |
| E0709 | use of maybe-moved value `` `x` `` |
|       | hint: `` `x` `` is moved on line `N` but not on line `M`; both paths reach here |

`E0701`'s hint names the tier because a transfer no longer requires a keyword — the
user may be looking at a line that reads like an ordinary call. When the transfer
*was* written as `move x`, use the shorter form: `` hint: `x` was moved on line `N` ``.

`E0709` must name both predecessors. A drop flag lets the *cleanup* proceed, so the
only remaining failure is the use, and the user needs to see which branch disagreed.

`move` on a copyable value has **no** diagnostic: it transfers and invalidates the
source like any other `move`, so it is meaningful rather than redundant (§14.11).
Only `clone` on a copyable value warns.

## E08xx — Safe references (`&T` / `edit &T`)
| Code | Message |
|------|---------|
| E0801 | owner call site must take the reference explicitly: `` `&x` `` or `` `edit &x` `` |
| E0802 | `` `const` `` binding `` `x` `` cannot produce an `` `edit &` `` reference |
| E0803 | cannot reference a temporary — the operand must be named storage |
| E0804 | cannot take `` `edit &x` `` while `` `x` `` is already borrowed here |
| E0805 | cannot read `` `x` `` while it is mutably borrowed |
| E0806 | references in fields require lifetime support (not available in v0.5) |

## E09xx — Heap (`owned<T>`, `new`)
| Code | Message |
|------|---------|
| E0901 | `` `owned<T>` `` is move-only; copying the handle would alias the allocation |
| E0902 | `` `new` `` operand has type `` `U` ``, expected `` `T` `` |
| E0903 | `` `owned<T>` `` may only be a field or parameter type in v0.5, not a local binding |
| E0904 | allocation may fail — bind with `` `new ... as result` `` or let it abort |

## E10xx — Lifetimes
| Code | Message |
|------|---------|
| E1001 | returns a reference to local `` `x` ``, which does not live long enough |
| E1002 | `` `@lifetime(...)` `` does not match the body — expected `` `@lifetime(a)` `` |
| E1003 | reference `` `r` `` would outlive its source `` `s` `` |
| E1004 | cannot return a borrow of a temporary |

## E11xx — Receiver methods
| Code | Message |
|------|---------|
| E1101 | receiver must be a reference (`` `&T` `` or `` `edit &T` ``), not a by-value `` `T` `` |
| E1102 | cannot call `` `edit` ``-receiver method `` `m` `` on `` `const` `` binding `` `x` `` |
| E1103 | cannot call `` `edit` ``-receiver method `` `m` `` through a `` `&T` `` reference |
| E1104 | `` `T` `` has no method `` `m` `` |
| E1105 | method `` `m` `` collides with field `` `m` `` of `` `T` `` |
| E1106 | receiver type must be a record type |

## E12xx — Modules (`import` / `export`)
| Code | Message |
|------|---------|
| E1201 | cannot find module `` `./foo` `` (no file `` `./foo.delta` ``) |
| E1202 | `` `x` `` is not exported by `` `./foo` `` |
| E1203 | import cycle detected: `` `a → b → a` `` |
|       | hint: declarations that reference each other must live in the same file |
| E1204 | import path case mismatch: file is `` `./User.delta` `` but the import says `` `./user` `` |
| E1205 | unknown or unconfigured standard library module (`std/foo` or `@std/foo`) |

---

## Notes
- These are **semantic** (stage 3+) diagnostics. Lexer/parser messages
  (`expected ';'`, etc.) live with the front end and are out of scope here.
- The `?error` placeholder rule (§2.10): once a name fails to resolve, suppress
  *cascade* diagnostics that operate on it — emit E0101 once, not on every later use.
- Sort emitted diagnostics by `(file, line, col)` before printing for stable output.
