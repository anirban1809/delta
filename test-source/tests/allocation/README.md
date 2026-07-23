# Allocation test suite

This suite is the Phase H contract for heap allocation and indirection. It is
intentionally usable before Phase F references and ownership are implemented.

Covered here:

- `owned<T>` field/parameter syntax;
- bare and recoverable `new` for primitive, record, existing-value, and generic payloads;
- `new` as the complete initializer of an owned staging local;
- one-time transfer from a staging local into a matching indirection field;
- rejection of `new` nested directly inside record construction;
- contextual allocation typing and mismatches;
- ordinary (non-reference) auto-deref reads and writes;
- recursive-layout cycles broken by indirection;
- placement and malformed-type rejections;
- allocation-oriented lowering for owned pointers.

Allocation-facing expressions are deliberately statement-oriented. A program
must allocate and, when requested, check the result before constructing the
record that will own the handle:

```delta
const payload = new Payload { count: 7 } as result;
check result { return 1; }
const holder: Holder = Holder { payload: payload };
```

The staging binding is consumed exactly once by indirection-field
initialization and cannot be reused. General-purpose or uninitialized
General-purpose `owned<T>` locals remain outside this Phase H slice. Copyable
values read through indirections are snapshotted into locals before return.

Atomic sharing, locks, and synchronization sugar are deferred until Delta's
threading support is implemented, so this suite does not mention or exercise
those forms.

Deliberately excluded because they depend on Phase F:

- `&T` / `edit &T` and receiver calls through references;
- copying/retaining, moving, cloning, use-after-move, and replacement;
- scope-exit disposal, drop cascades, transactional clone cleanup, and release
  suppression after moves;

Those cases belong in the ownership/reference suites once Phase F lands.
