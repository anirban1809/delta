# Phase F Codegen — Ownership lowering reference (Delta → C)

What each ownership construct compiles to. Companion to
[phase-f-ownership-and-move.md](./phase-f-ownership-and-move.md). Test names refer to
`test-source/tests/ownership/`; executable codegen fixtures live in
`test-source/tests/ownership-codegen/` (each `.delta` has a golden `.expected.c`).

Mangling (matches the current emitter): **types** `delta__<Type>`, **methods**
`delta__<Type>_<method>`, **main** `delta_main`. **Free functions keep their bare Delta name**
(`inspect`, not `delta__inspect`). Generated helpers: `delta__<Type>_clone` / `_dispose` /
`_drop`.

---

### Plain copy — Copyable record  (`plain_copy_ok`, `copyable_clone_ok`)
```delta
const b = a;            // Point is Copyable
```
```c
const delta__Point b = a;   // plain C assignment, no drop, no helper
```

### By-value owned param  (`owner_move_by_value_ok`)
Callee owns the parameter and drops it at its own scope exit; the C ABI copy is the transfer.
```delta
function consume(file: File) { }
```
```c
void consume(delta__File file) { /* ...; delta__File_drop(&file); */ }
```

---

### `&T` parameter → `const T*`, field access → `->`  (`auto_read_const_ok`, `auto_borrow_field_ok`)
```delta
function inspect(counter: &Counter): int32 { return counter.value; }
```
```c
int32_t inspect(const delta__Counter* counter) { return counter->value; }
```

### `edit &T` parameter → `T*`  (`auto_edit_let_ok`)
```delta
function increment(counter: edit &Counter) { counter.value = counter.value + 1; }
```
```c
void increment(delta__Counter* counter) { counter->value = (counter->value + 1); }
```

### Auto-borrow at a call → address-of  (`auto_borrow_owned_ok`, `auto_two_reads_ok`)
```delta
inspect(counter);        // &T param
increment(counter);      // edit &T param
add(counter, counter);   // two &T params, same root: fine
```
```c
inspect(&counter);
increment(&counter);
add(&counter, &counter);
```

### Borrow re-passed to a nested call → pointer forwarded unchanged  (`edit_to_read_reborrow_ok`)
Inside a function whose param is already a pointer, no new `&`.
```delta
function relay(counter: edit &Counter): int32 { return inspect(counter); }
```
```c
int32_t relay(delta__Counter* counter) { return inspect(counter); }
```

### Receiver dispatch through a borrow  (`unique_dispose_ok` body style)
```delta
document.inspect();      // &Self receiver
document.revise();       // edit &Self receiver
```
```c
delta__Document_inspect(&document);   // receiver: const delta__Document*
delta__Document_revise(&document);    // receiver: delta__Document*
```

---

### `move` → no runtime op; source not dropped  (`unique_move_ok`)
```delta
consume(move file);
return 0;
```
```c
consume(file);
return 0;               // no delta__File_drop(&file): analyzer marked it Moved
```

### Implicit return transfer  (`implicit_return_move_ok`)
```delta
return document;        // non-Copyable
```
```c
delta__Document __delta_return_0 = document;
/* drop OTHER live locals here, reverse order; do NOT drop document */
return __delta_return_0;
```

---

### `clone x` (bare, aborts on OOM)  (`owner_clone_ok`, `clone_field_ok`)
```delta
const copy = clone original;
```
```c
delta_result_delta__Document __delta_result_0 = delta__Document_clone(&original);
if (__delta_result_0.tag != 0) { delta_abort("allocation failed in clone"); }
const delta__Document copy = __delta_result_0.value;
```

### `clone x as result` (routes AllocError through `check`)
```delta
const copy = clone original as result;
check result { return 1; }
```
```c
delta_result_delta__Document __delta_result_0 = delta__Document_clone(&original);
if (__delta_result_0.tag != 0) {
    /* drop live locals on this edge */            return 1;
}
const delta__Document copy = __delta_result_0.value;
```

### Synthesized clone helper (non-Copyable Cloneable record) — transactional
```c
static delta_result_delta__Document delta__Document_clone(const delta__Document* src) {
    delta__Document dst;
    delta_result_string title = delta_string_clone(&src->title);
    if (title.tag != 0) return (delta_result_delta__Document){ .tag = title.tag };
    dst.title = title.value;
    delta_result_Array_u8 bytes = delta_Array_u8_clone(&src->bytes);
    if (bytes.tag != 0) { delta_string_drop(&dst.title); /* reverse-order undo */
        return (delta_result_delta__Document){ .tag = bytes.tag }; }
    dst.bytes = bytes.value;
    dst.revision = src->revision;                       // Copyable field: direct
    return (delta_result_delta__Document){ .tag = 0, .value = dst };
}
```
Copyable records get **no** helper — `clone` of a Copyable lowers to a plain copy.

---

### Custom `dispose` → `_dispose` + compiler `_drop`  (`unique_dispose_ok`)
```delta
function (file: edit &TempFile) dispose() { os.close(file.fd); }
```
```c
static void delta__TempFile_dispose(delta__TempFile* file) { delta_os_close(file->fd); }

static void delta__TempFile_drop(delta__TempFile* value) {
    delta__TempFile_dispose(value);       // custom hook FIRST
    delta_string_drop(&value->path);      // then owned fields, REVERSE order
    /* fd is Copyable: nothing */
}
```
Unique-without-dispose (`unique_no_dispose_ok`): no `_dispose`; `_drop` only if it owns
droppable fields. A primitive-only unique token gets no helper at all.

### Scope-exit cleanup → reverse-order `_drop`
```delta
let a = makeDocument() as result; check result { return 1; }
let b = clone a as result;        check result { return 2; }
return 0;
```
```c
/* a, b constructed above */
delta__Document_drop(&b);          // reverse declaration order
delta__Document_drop(&a);
return 0;
```
Each early-exit edge drops only what is live *there*. Moved bindings are omitted statically.

---

### Owned replacement assignment → materialize, drop old, store  (`owned_replacement_move_ok`)
```delta
current = move next;
```
```c
delta__Document __delta_replacement_0 = next;
delta__Document_drop(&current);
current = __delta_replacement_0;   // next is Moved, not dropped
```
With `current = clone source as result`, the clone result is checked **before** `current` is
dropped, so a failed allocation leaves `current` intact.

---

### `new x` / `heap<T>`  → not lowered in Phase F
Parses only; typing, auto-deref, and lowering are **Phase H**.

---

Cross-cutting invariants the C must satisfy:
- Auto-borrow and explicit `&x`/`edit &x` emit **identical** C.
- No ownership path uses runtime flags, pointer-nulling, zeroing, refcounts, or hidden allocation.
- Every live owner is dropped **exactly once**; moved/returned sources are skipped.
- `restrict` is **not** emitted on `edit &` params in this phase.

---

## Codegen conventions pinned by the golden fixtures

The `ownership-codegen` goldens fix these layout decisions; the emitter must reproduce them
byte-for-byte (modulo the harness's whitespace/`#line` normalization):

- **`_drop` helper.** Non-`static`, forward-declared. A type's `_drop` forward-declaration and
  definition are emitted immediately after that type's user method decls/defs. Param is named
  `value`: `void delta__<T>_drop(delta__<T>* value)`. Body calls `delta__<T>_dispose(value);`
  first (only if a dispose hook exists), then drops owned fields in reverse declaration order.
  A unique type with only Copyable fields and no dispose gets **no** `_drop` at all.
- **`move x`** lowers to the bare operand `x`; the moved-from binding is omitted from every
  cleanup edge.
- **Scope-exit cleanup.** Before a terminator, emit `delta__<T>_drop(&b);` for each live owned
  binding `b`, in reverse declaration order. Owned by-value parameters are dropped the same way
  unless moved onward or returned.
- **Return materialization.** If a value-return expression *reads a binding that is about to be
  dropped on that edge*, materialize it first: `<retType> __delta_return_N = <expr>;`, then the
  `_drop` calls, then `return __delta_return_N;`. A return whose expression is independent of the
  dropped set (e.g. `return 0;`) just emits the drops then `return 0;`.
- **Implicit transfer return** (`return b;`, `b` non-Copyable): `b` is excluded from the drop set
  and not dropped. With no other owners to drop, it lowers to a plain `return b;`.
- **Owned replacement** (`current = <rhs>;`, owned destination): `<T> __delta_replacement_N =
  <rhs>; delta__<T>_drop(&current); current = __delta_replacement_N;`. `move next` as the RHS
  lowers to bare `next` (not dropped). For `clone … as result`, the result is checked before the
  old value is dropped.
- **Temp counters** `__delta_return_N` / `__delta_replacement_N` / `__delta_result_N` start at 0
  per function.
- **Owned `const` locals + drop.** Dropping needs a non-`const` `&`, which collides with a C
  `const` local; until the parent doc's open "return an owned `const` local" question is settled,
  owned locals that get dropped are written with `let` in fixtures.

### Fixture status (`test-source/tests/ownership-codegen/`)

- **Verified now** (emitter already correct): `01_plain_copy`, `07_receiver_dispatch`.
- **Red until Phase F lowering lands** (goldens are the target): `02`–`06`, `08`–`11`.
- **Phase H** (`heap<T>`/`new`, clone of owned records): not in this suite — re-add as
  `codegen_match` once Phase H defines `heap<T>` lowering.
