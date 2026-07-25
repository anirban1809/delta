# Proposal: Root `std` I/O Library

Status: draft

## Decision

Delta exposes its first I/O API from one public module, `std`. There are no
public `std/io`, `std/fs`, or platform-specific I/O modules. A program imports
the root module as a namespace:

```delta
import std from "std";
```

All types exported by this API use lowercase names. In particular, the public
resource types are `std.stdin`, `std.stdout`, `std.stderr`, and `std.file`.
This follows the existing lowercase convention for built-in atom types such as
`string`, `cstringview`, and `int32`; it also keeps a resource's spelling the
same at the type and call sites.

`std` is the **only public import path**. The implementation may be split into
embedded Delta or C files, but those files are private implementation details
and cannot be imported by user code. A later source-layout split must continue
to re-export exactly this surface from `std`.

## Naming and qualification

The namespace-import work must permit a qualified name in both value and type
positions. Type and value names are resolved in their respective namespaces,
so the standard streams may have a lowercase type and a same-named accessor:

```delta
import std from "std";

function emit(out: edit &std.stdout): void | std.io_error {
    out.write_string("ready\\n") as result;
    forward result;
    return;
}

function main(): uint8 {
    let out: std.stdout = std.stdout();
    emit(out) as result;
    check result { return 1; }
    return 0;
}
```

`std.stdout()` / `std.stderr()` / `std.stdin()` return handles to the process's
standard streams. They are intentionally functions rather than writable global
variables: they cannot be reassigned, moved out of `std`, or initialized in a
surprising order. Each returned handle is a copyable, non-owning capability;
calling an accessor again returns another handle to the same OS stream.

The same spelling in type and value positions is deliberate. It is familiar
from type-directed constructors and avoids `stdout_handle`, `file_handle`, or
PascalCase escape hatches. If Delta keeps a single shared namespace rather than
separate type/value namespaces, use `std.get_stdin()`, `std.get_stdout()`, and
`std.get_stderr()` instead; the type names remain `std.stdin`, `std.stdout`,
and `std.stderr`.

## Public surface (v1)

The v1 surface is byte-oriented. Text helpers accept valid UTF-8 `stringview`,
but no I/O operation performs implicit encoding, decoding, buffering, or
formatting.

```delta
// Error returned by every fallible I/O operation.
export type io_error = {
    code: stringview;
    message: stringview;
    operation: stringview;
    os_code: int32;
};

// Capability interfaces. These are structural and use lower-case names like
// every other exported type in this module.
export interface reader {
    function (source: edit &reader) read(into: edit &Slice<uint8>): uintsize | io_error;
}

export interface writer {
    function (destination: edit &writer) write(from: &Slice<uint8>): uintsize | io_error;
    function (destination: edit &writer) flush(): void | io_error;
}

export interface seeker {
    function (stream: edit &seeker) seek(offset: int64, origin: seek_origin): uint64 | io_error;
}

export enum seek_origin { start; current; end; }

// Process standard-stream handle types.
export type stdin;
export type stdout;
export type stderr;

// Owning OS file handle. This is a compiler-known unique resource.
export type file;

// Standard-stream accessors.
export function stdin(): stdin;
export function stdout(): stdout;
export function stderr(): stderr;

// Opening a file.
export function open_read(path: stringview): file | io_error;
export function create(path: stringview): file | io_error;
export function open_append(path: stringview): file | io_error;

// `file` implements reader, writer, and seeker.
export function (f: edit &file) read(into: edit &Slice<uint8>): uintsize | io_error;
export function (f: edit &file) write(from: &Slice<uint8>): uintsize | io_error;
export function (f: edit &file) flush(): void | io_error;
export function (f: edit &file) sync(): void | io_error;
export function (f: edit &file) seek(offset: int64, origin: seek_origin): uint64 | io_error;
export function (f: edit &file) close(): void | io_error;

// `stdin` implements reader only.
export function (input: edit &stdin) read(into: edit &Slice<uint8>): uintsize | io_error;

// `stdout` and `stderr` implement writer only.
export function (output: edit &stdout) write(from: &Slice<uint8>): uintsize | io_error;
export function (output: edit &stdout) write_string(text: stringview): uintsize | io_error;
export function (output: edit &stdout) flush(): void | io_error;

export function (output: edit &stderr) write(from: &Slice<uint8>): uintsize | io_error;
export function (output: edit &stderr) write_string(text: stringview): uintsize | io_error;
export function (output: edit &stderr) flush(): void | io_error;

// Completion helpers. They loop until every byte is transferred or an error is
// reported; use them when a partial result would be a bug.
export function read_exact(source: edit &reader, into: edit &Slice<uint8>): void | io_error;
export function write_all(destination: edit &writer, from: &Slice<uint8>): void | io_error;
export function write_string(destination: edit &writer, text: stringview): void | io_error;
```

`Slice<uint8>` is an existing language/container type, not an exported I/O
type. Its PascalCase spelling does not weaken the all-lowercase rule for
symbols declared by `std`.

The receiver declarations above show the intended API shape, not a requirement
that v1 interface dispatch be dynamic. The compiler may monomorphize generic
helpers or lower a known concrete receiver directly. `reader`, `writer`, and
`seeker` are part of the source-level contract so buffered and network types
can join the API later without changing `file` or the standard streams.

## Semantics that must not be left implicit

### Partial I/O and end of file

`read` and `write` make one OS-level progress attempt. A successful `read`
returns `0` only for end of file (or when the supplied destination slice is
empty). A successful `write` may return fewer bytes than supplied. Neither is
an error: callers that require completion use `read_exact` or `write_all`.

`read_exact` returns `io_error { code: "io.unexpected_eof", ... }` when it
reaches end of file before filling the destination. `write_all` repeatedly
writes until it transfers the entire slice. A zero-byte successful write of a
non-empty slice is reported as `io.write_zero` to avoid an infinite loop.

### Opening modes

`open_read(path)` opens an existing file read-only. `create(path)` opens a file
write-only, creates it if absent, and truncates it if present. `open_append(path)`
opens or creates a file write-only and positions every write at the end.

The intentionally small three-function opening surface prevents invalid flag
combinations. A future `open(path, options: open_options)` can be added only
when an actual use case needs permissions, exclusive creation, or read/write
access; it must not replace these simple operations.

### Closing and ownership

`file` is unique: it cannot be copied or cloned, and moving it transfers the
single close responsibility. The compiler automatically closes a live file on
scope exit, including `return`, `break`, and error paths. Automatic close is
best-effort because an exit path has nowhere to return a close failure.

Programs that need a durable write or need to observe a close error must call
`sync()` and then `close()` explicitly. After a successful `close()`, the file
binding is consumed and may not be used again; the automatic cleanup pass must
not close it a second time. `close()` failure also consumes the handle because
the OS descriptor's usable state is no longer trustworthy.

`stdin`, `stdout`, and `stderr` are borrowed process resources. They cannot be
closed or moved, and their accessors are always available. `stdout` is intended
for normal program output; `stderr` is intended for diagnostics. The library
does not add logging, formatting, or line buffering policy to either stream.

### Error model

Every failure uses the existing Delta error channel and the single `io_error`
shape. Its `code` is stable and machine-oriented, `message` is a static
human-readable explanation, `operation` names the failed API operation, and
`os_code` holds the normalized platform error number (zero when none applies).

After binding a fallible operation with `as result`, a function that declares a
compatible error channel can propagate the original failure with `forward
result;`. `forward` returns the error from the enclosing function unchanged,
discharges the pending result, and always diverges. It is valid only when the
enclosing function's error set contains the received error type; forwarding
from an infallible function or into an incompatible error set is a compile
error. `check result { ... }` remains for recovery, logging, conversion to a
different error type, or returning from a function such as `main` that cannot
propagate an `io_error`.

The error deliberately does **not** retain `path: stringview`: a borrowed path
could outlive its backing value after an error is returned. It also avoids an
allocation merely to construct an error. Callers that want path context should
wrap the error in their own error type while they still own the path.

Initial stable codes are:

| Code | Meaning |
| --- | --- |
| `io.not_found` | The path does not exist. |
| `io.permission_denied` | The OS denied the requested access. |
| `io.already_exists` | Creation required absence but the path exists. |
| `io.not_directory` | A path component expected to be a directory is not one. |
| `io.is_directory` | A file operation was attempted on a directory. |
| `io.invalid_input` | The supplied path, offset, or buffer is invalid. |
| `io.interrupted` | The operation was interrupted before progress; callers may retry. |
| `io.unexpected_eof` | `read_exact` could not fill its buffer. |
| `io.write_zero` | `write_all` could make no progress. |
| `io.other` | An OS error without a more specific portable code. |

The runtime maps platform errors into this list; it does not leak errno names
into the portable `code` field. `os_code` remains available when an application
needs platform-specific handling.

## Example

```delta
import std from "std";

function copy_file(source_path: stringview, destination_path: stringview): void | std.io_error {
    let source = std.open_read(source_path) as source_result;
    forward source_result;

    let destination = std.create(destination_path) as destination_result;
    forward destination_result;

    let bytes: uint8[8192];
    while (true) {
        const count = source.read(bytes) as read_result;
        forward read_result;
        if (count == 0) break;

        destination.write_all(bytes.slice(0, count)) as write_result;
        forward write_result;
    }

    destination.sync() as sync_result;
    forward sync_result;
    destination.close() as close_result;
    forward close_result;
    return;
}
```

`forward` preserves Delta's explicit error flow while avoiding boilerplate when
the callee and caller use the same error type. I/O does not introduce an
exception or `Result` convention.

## Runtime boundary and implementation plan

The public API is Delta-facing and platform-neutral; all descriptor, `FILE *`,
and errno handling stays behind a small C runtime boundary. The runtime exposes
opaque handles only to compiler-generated code. Delta source never receives a
raw pointer, file descriptor, or C `FILE *` disguised as `cstringview`.

Implementation should land in this order:

1. Add the root-module resolver: `import std from "std"` resolves to one
   embedded `stdlib/std.delta` façade. Continue to reject `std/io`, `std/fs`,
   and direct imports of private implementation files.
2. Add qualified value/type lookup for namespace imports, with separate
   type/value namespaces if same-spelled accessors are retained.
3. Add opaque compiler-known resource declarations for `file` and the three
   standard-stream handle types, plus automatic `file` cleanup.
4. Add the C runtime functions for opening, reading, writing, seeking,
   flushing, syncing, closing, and portable error conversion. Start with POSIX
   (macOS and Linux); make the runtime interface portable before adding Windows.
5. Implement `reader`/`writer`/`seeker`, the completion helpers, and tests.

The public root module may use private C symbols such as `delta_rt_file_open`
and private Delta helpers, but none of those names are exported from `std`.

## Compatibility and deliberate exclusions

- The planned `std/log` API is subsumed rather than retained as a public
  `std/log` import. A subsequent logging proposal can expose e.g. `std.log` or
  `std.log_info` from the same root module, implemented by writing to
  `std.stderr()`.
- Directory traversal, metadata, deletion, rename, temporary files, paths,
  sockets, async I/O, buffering, and process execution are not v1 I/O. They
  can be added to `std` later without creating a new public module path.
- `print`, `println`, interpolation, and typed formatting belong to a future
  formatting design. `write_string` is intentionally the only text shortcut.
- No operation silently retries `io.interrupted`; the caller controls retry
  policy. The runtime may retry only when the platform contract guarantees no
  visible semantic difference.

## Acceptance criteria

- `import std from "std"` is the only public standard-library import needed
  for I/O; `import ... from "std/io"` is rejected.
- The exported types `std.stdin`, `std.stdout`, `std.stderr`, `std.file`,
  `std.io_error`, `std.reader`, `std.writer`, `std.seeker`, and
  `std.seek_origin` are all lowercase.
- A program can write bytes and UTF-8 text to standard output and standard
  error, and can read from standard input.
- A program can open, read, write, seek, sync, explicitly close, move, and
  automatically clean up a `std.file` without double-close or use-after-close.
- Tests cover partial write completion, EOF versus an I/O error, opening a
  missing file, permission failure where supported, automatic cleanup on every
  scope exit, and the root-module-only import rule.
- A function declared `| std.io_error` can use `forward result;` after every
  fallible `std` operation and returns the exact received error; forwarding is
  rejected from an infallible function or into a mismatched error set.
