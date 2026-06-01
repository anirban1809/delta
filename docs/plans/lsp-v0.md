# Plan: Delta LSP v0 (Diagnostics Only)

Date drafted: 2026-06-01
Status: planning, not started.

## Goal

Expose what the compiler already does — tokenize, parse, semantic-analyze a
single Delta file — through a Language Server Protocol server so editors can
show red squiggles while the user types.

This is **diagnostics only**. No hover, no go-to-definition, no completion.
Those depend on AST↔source position queries and a richer symbol table that the
analyzer doesn't yet expose; build them in follow-up plans once the
type-checker lands.

Spec §2.13 calls LSP "post-MVP" but also commits the internals to be
library-shaped from day one. The compiler is already there (no global state,
structured diagnostics, pure `compile()` helper) — this plan turns that
discipline into a working server without touching the analyzer itself.

## Decisions already made

- **Binary**: `delta lsp` subcommand, not a separate `cmd/delta-lsp/` binary.
  One build target, same `main.go`. Split later if the LSP grows
  dependencies the CLI shouldn't drag in.
- **Scope**: diagnostics only. No empty hover/document-symbol stubs.
- **Transport**: JSON-RPC over stdio, hand-rolled framing (no external dep).
- **Sync mode**: full document sync (resend whole text on every keystroke).
  Incremental sync is a perf optimization, not a correctness need.
- **Concurrency**: single-threaded message loop. One request at a time.
  Editors send one didChange per keystroke; that's plenty fast for now.

## File layout

```
internal/pipeline/
  pipeline.go        — Compile(name, []byte) *Result. Tokenize → parse →
                       analyze, returns the file + error bag. No I/O.

internal/lsp/
  protocol.go        — Minimal LSP type definitions (the subset we use).
  diagnostics.go     — SourceError → LSP Diagnostic adapter.
  server.go          — JSON-RPC framing, message loop, per-method dispatch.

cmd/delta/main.go    — Add `lsp` subcommand; delegate compile() to pipeline.
```

The current `compile()` helper inside `cmd/delta/main.go` becomes a thin
wrapper around `pipeline.Compile` that reads the file from disk. The test
runner and build subcommand keep working without changes to their callers.

## Pipeline extraction

Current shape (in `cmd/delta/main.go`):

```go
func compile(sourcePath string) (*compileResult, error) {
    // os.ReadFile → tokenize → parse → analyze
}
```

New split:

```go
// internal/pipeline/pipeline.go
package pipeline

type Result struct {
    File     ast.File
    ErrorBag *diagnostics.ErrorBag
}

func Compile(name string, contents []byte) *Result {
    bag := &diagnostics.ErrorBag{File: name, Source: string(contents)}
    tokens, _ := tokenizer.Tokenize(string(contents), bag)
    if len(bag.Errors) > 0 {
        return &Result{ErrorBag: bag}
    }
    parser := ast.Parser{Tokens: tokens, ErrorBag: bag}
    file := parser.Parse()
    if len(bag.Errors) > 0 {
        return &Result{File: file, ErrorBag: bag}
    }
    analyzer := semantics.Analyzer{
        AST:         file,
        ErrorBag:    bag,
        GlobalScope: &semantics.Scope{Symbols: map[string]semantics.Symbol{}},
    }
    analyzer.Analyze()
    return &Result{File: file, ErrorBag: bag}
}
```

Reason: the LSP path has the source text in memory (sent by the editor over
the wire), it doesn't need or want to round-trip through the filesystem.
Moving the in-memory variant into a package that both `main.go` and
`internal/lsp` can import keeps a single source of truth for "what does
delta build do."

## Protocol subset

| Method                           | Direction  | Required for v0 |
| -------------------------------- | ---------- | --------------- |
| `initialize`                     | C → S req  | Yes — capabilities handshake |
| `initialized`                    | C → S note | Yes — no-op |
| `shutdown`                       | C → S req  | Yes — respond null |
| `exit`                           | C → S note | Yes — process exit(0) |
| `textDocument/didOpen`           | C → S note | Yes — store + analyze + publish |
| `textDocument/didChange`         | C → S note | Yes — full-sync replace + republish |
| `textDocument/didClose`          | C → S note | Yes — drop document + clear diagnostics |
| `textDocument/publishDiagnostics`| S → C note | Yes — only message the server sends |

Anything else: respond `MethodNotFound` (-32601) if it's a request, ignore
if it's a notification. Don't crash.

### Capabilities response

```json
{
  "capabilities": {
    "textDocumentSync": { "openClose": true, "change": 1 }
  },
  "serverInfo": { "name": "delta-lsp", "version": "0.0.1" }
}
```

`change: 1` means full sync. Nothing else advertised.

## SourceError → Diagnostic mapping

Our diagnostics:

```go
type SourceError struct {
    Stage    Stage    // tokenizer | parser | semantic
    Severity Severity // Error | Warning
    File     string
    Line     int      // 1-based
    Column   int      // 1-based
    Source   string   // the source line, for caret rendering (unused by LSP)
    Message  string
    Expected string   // optional
    Help     string   // optional
}
```

LSP wants:

```go
type Diagnostic struct {
    Range    Range  // 0-based start + end
    Severity int    // 1=Error, 2=Warning, 3=Info, 4=Hint
    Source   string
    Message  string
}
```

Conversion rules:

- `Range.Start = Range.End = Position{Line: Line-1, Character: Column-1}`.
  Our errors are point-locations today; end == start renders as a 1-char
  squiggle, which most editors widen to the token under the cursor. Good
  enough for v0. When the analyzer learns to produce spans, just widen the
  end position then.
- `Severity`: map `Error` → 1, `Warning` → 2.
- `Source`: always `"delta"`. Lets the editor group diagnostics by source.
- `Message`: pass `e.Message` through. If `e.Help` is non-empty, append as
  `"\n\nhelp: " + e.Help`. `Expected` similarly if present.

`File` is dropped — the `publishDiagnostics` notification already names the
document by URI, and the LSP client doesn't need (or want) our file path in
the message body.

### Position encoding caveat

LSP defaults to **UTF-16 character offsets** for `Position.character`.
The tokenizer currently produces **column counts** which are
fine for ASCII but ambiguous for multi-byte characters. Delta source is
ASCII-only in MVP per the implemented surface, so this is invisible today.
Once non-ASCII identifiers or string literals land, the column scheme needs
a separate audit. Note it; don't fix it now.

## Server skeleton

```go
package lsp

type Server struct {
    in        *bufio.Reader
    out       io.Writer
    log       *log.Logger      // stderr; never stdout
    documents map[string][]byte // URI → current full text
    shutdown  bool
}

func Run(in io.Reader, out io.Writer, errLog io.Writer) error {
    s := newServer(in, out, errLog)
    for {
        msg, err := readMessage(s.in)
        if errors.Is(err, io.EOF) {
            return nil
        }
        if err != nil {
            s.log.Printf("read: %v", err)
            continue
        }
        if err := s.handle(msg); err != nil {
            s.log.Printf("handle %s: %v", msg.Method, err)
        }
        if s.shutdown && msg.Method == "exit" {
            return nil
        }
    }
}
```

Dispatch is a flat switch on `msg.Method`. Each handler is a small method on
`*Server`. Request handlers return a `(result, error)`; notification handlers
just return `error`. The loop turns `error` into a JSON-RPC error response if
the incoming message has an ID, otherwise logs and moves on.

## didOpen / didChange flow

Both end in the same place:

1. Update `documents[uri] = contents` (full sync, so just replace).
2. Call `pipeline.Compile(uri, contents)`.
3. Convert `result.ErrorBag.Errors` → `[]Diagnostic`.
4. Send `textDocument/publishDiagnostics`.

didClose flow:

1. `delete(documents, uri)`.
2. Send `publishDiagnostics` with empty `diagnostics: []` so the editor
   clears its squiggles.

No debouncing in v0. If perf becomes a problem, debounce at the editor side
or add it here later.

## CLI wiring

```go
case "lsp":
    if err := lsp.Run(os.Stdin, os.Stdout, os.Stderr); err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(1)
    }
```

Two things to be careful about:

- **stdout is sacred**. Only LSP frames go there. Any debug `fmt.Println`
  during development must use `os.Stderr` or it will corrupt the channel
  and the client will hang.
- **No reading of os.Args after subcommand dispatch**. The LSP server reads
  config from `initialize.params.initializationOptions` if anything; CLI
  flags don't apply here.

## Smoke test

Run this from the shell:

```bash
# script: smoke.sh
delta lsp <<'EOF'
Content-Length: 56\r\n\r\n{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}Content-Length: 51\r\n\r\n{"jsonrpc":"2.0","method":"initialized","params":{}}Content-Length: 220\r\n\r\n{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///tmp/x.delta","languageId":"delta","version":1,"text":"function f(): int32 {\n    const x: int32 = 1;\n    x = 2;\n    return x;\n}\n"}}}
EOF
```

Expected output (formatted for readability):

```
Content-Length: N
{"jsonrpc":"2.0","id":1,"result":{"capabilities":{"textDocumentSync":{...}},"serverInfo":{...}}}
Content-Length: M
{"jsonrpc":"2.0","method":"textDocument/publishDiagnostics","params":{"uri":"file:///tmp/x.delta","diagnostics":[{"range":{"start":{"line":2,"character":4},"end":{"line":2,"character":4}},"severity":1,"source":"delta","message":"cannot assign to const: x"}]}}
```

Notes:

- The `\r\n` byte sequences must be literal CRLFs, not escape sequences, in
  the shell heredoc. Use `printf` or a real test harness if heredoc escaping
  gets in the way.
- The smoke test doesn't need to be checked in. It's a "did I break framing
  again" tool, not a regression test. A proper test harness would unmarshal
  the responses and assert on structured fields; that can come later.

## Editor integration

Not part of this plan. A minimal VS Code extension is roughly:

1. `package.json` declaring a language contribution for `.delta` and an
   activation event.
2. `extension.ts` that spawns `delta lsp` via `vscode-languageclient`'s
   stdio transport.
3. A TextMate grammar (optional, only for syntax highlighting independent
   of the server).

Track that as `docs/plans/lsp-vscode-extension.md` when ready. Until then,
the server is testable via any LSP client (`emacs-lsp`, `neovim/nvim-lspconfig`,
the `lsp-inspector` tooling) without any editor-specific glue.

## What this unblocks

- Live diagnostics while editing — the single most useful editor integration
  for a language at this stage.
- A place to hang future features (hover, go-to-definition, completion) once
  the analyzer exposes symbol tables and a type-annotated AST. None of those
  need a different architecture; they're new methods on `*Server` and new
  pipeline outputs.

## What this explicitly does NOT do

- Hover, go-to-definition, completion, signature help, code actions,
  document symbols, workspace symbols, formatting, rename — all deferred.
- Incremental document sync — full sync is correct and simple.
- Multi-file analysis — one document per URI; no project graph yet.
- Persistent caching, cancellation tokens, progress reporting — also
  deferred. The cancellation hook mentioned in spec §2.13 lands when the
  type-checker becomes slow enough that interrupting it matters.
- A VS Code extension — separate plan.
- `delta-lsp` as a separate binary — keep as subcommand until the LSP code
  base justifies its own `main`.

## Tasks (in execution order)

1. Create `internal/pipeline/pipeline.go` with `Compile(name, []byte)
   *Result`. Update `cmd/delta/main.go` to call it from the existing
   `compile()` wrapper. Run `make test` — should still be 16/16.
2. Create `internal/lsp/protocol.go` with the LSP type subset above.
3. Create `internal/lsp/diagnostics.go` with the SourceError → Diagnostic
   adapter.
4. Create `internal/lsp/server.go` with framing, message loop, and handlers.
5. Add `lsp` subcommand in `cmd/delta/main.go`.
6. `make build`. Run the smoke test from the shell. Verify a
   `publishDiagnostics` frame comes back with the expected line/column for
   a known-bad `.delta` file.
7. Add `cmd/delta-lsp` and a `make lsp` shortcut if the smoke test rendered
   the workflow awkward; otherwise skip.

## Risks and footguns

- **Stdout pollution**: any stray `fmt.Print` in the LSP code path silently
  corrupts the protocol. Use `s.log.Printf` (stderr) for all debugging.
  Consider a lint or a wrapper writer that flags writes to `os.Stdout`
  outside the framing layer.
- **CRLF in framing**: LSP requires literal `\r\n`, not just `\n`. Both
  the read side (parsing `Content-Length:` headers) and the write side
  (emitting the header) must use CRLF. Tests should byte-compare.
- **Missing `Content-Length` on send**: every outgoing frame needs a header
  with the exact byte count of the JSON body. Marshal first, measure, then
  write. Don't compute length from `len(string)` if the body contains
  multi-byte runes — `len(body []byte)` is correct.
- **Notifications must not get responses**: requests have an `id`,
  notifications don't. Sending a response to a notification confuses clients.
  The dispatcher must split on `msg.ID != nil`.
- **Server-initiated requests are not in v0**: we only send notifications
  (`publishDiagnostics`). No need for response-correlation tables, no need
  for outgoing IDs.
- **URI normalization**: clients may send `file:///foo` or
  `file:///C:/foo` (Windows). Treat URIs as opaque strings — don't decode
  to filesystem paths. The analyzer doesn't need the path; it just needs
  the document text.
