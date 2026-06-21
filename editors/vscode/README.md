# Delta Language — VS Code Extension

Modern editor support for `.delta` files, backed by the `delta lsp` language
server.

Implemented features include:

- Live diagnostics and quick fixes for fallible-result binding mistakes.
- Hover, go-to-definition, find references, and single-file rename.
- Scope-aware, type-aware, record-field, object-literal, and snippet completion.
- Function signature help.
- Document outline, semantic highlighting, inferred-type inlay hints, folding,
  and smart selection ranges.

## Requirements

- A built `delta` binary (`make build` at the repo root).
- The binary must be on `PATH`, **or** the absolute path supplied via the
  `delta.server.path` setting.

## Install (local `.vsix`)

```bash
cd editors/vscode
npm install
npm run compile
npm run package          # produces delta-language-0.0.1.vsix
code --install-extension delta-language-0.0.1.vsix
```

## Develop

```bash
cd editors/vscode
npm install
npm run compile          # or: npm run watch
code .                   # then press F5 to launch the Extension Host
```

In the Extension Host window, open any file in `test-source/tests/`. Errors
from the compiler appear as red squiggles.

Server stderr is piped to the **Delta Language Server** output channel.

## Settings

| Key                   | Default | Notes |
| --------------------- | ------- | ----- |
| `delta.server.path`   | `""`    | Empty means "use `delta` from PATH". Set to absolute path otherwise. |
| `delta.trace.server`  | `"off"` | `"messages"` / `"verbose"` to log LSP traffic in the output channel. |

Relative values for `delta.server.path` are resolved from the first workspace
folder.

## Commands

- **Delta: Restart Language Server**
- **Delta: Show Language Server Output**
