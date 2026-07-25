# Interface test suite

This suite is the executable acceptance contract for
[`docs/plans/interfaces.md`](../../../docs/plans/interfaces.md).

Interface declarations never contain a receiver:

```delta
interface Writer {
    function write(value: string): void | ioerror;
}
```

The concrete receiver belongs to the implementation:

```delta
type struct stdout_writer = {
    marker: uint8
} implements Writer;

function (writer: edit &stdout_writer) write(
    value: string
): void | ioerror {
}
```

The fixtures cover:

- interface parsing and declaration-only requirements;
- read-only and editable concrete implementations;
- conformance diagnostics;
- generic bounds and per-specialization receiver-capability checking;
- generic interface methods;
- multiple interfaces and multiple bounds;
- direct C dispatch without vtables;
- named imports, namespace imports, group exports, and generated package
  interfaces.

Run only this suite after building the compiler:

```sh
npm run build
node dist/run-tests.js interfaces
```

The suite is expected to fail until interface support is implemented.

