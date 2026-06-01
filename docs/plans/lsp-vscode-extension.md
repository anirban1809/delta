# Plan: Delta VS Code Extension (v0)

Date drafted: 2026-06-01
Status: planning, not started.
Depends on: [lsp-v0.md](./lsp-v0.md) — the `delta lsp` server must exist
before there's anything to connect to.

## Goal

Open a `.delta` file in VS Code, see red squiggles under the same errors
`make test` flags. That's the whole bar for v0.

Two side benefits of getting this together:

- A real editor session is the fastest way to find LSP protocol bugs the
  shell smoke test won't catch (race conditions, message ordering,
  capability advertisement mistakes).
- Even before the server is reliable, the bundled TextMate grammar gives
  syntax highlighting — already a noticeable quality-of-life jump over
  reading `.delta` as plain text.

## Decisions

- **Repo location**: `editors/vscode/` in this monorepo. Matches the
  layout used by rust-analyzer, gleam, zls. Keeps the extension under
  version control alongside the server it depends on, so a breaking
  protocol change can be fixed in one PR.
- **Server discovery**: look for `delta` on `PATH`. If not found, fall
  back to a configurable `delta.server.path` setting. **Do not bundle
  the binary in v0.** Bundling means multi-arch builds and a release
  pipeline that doesn't exist yet.
- **Language ID**: `delta`. **File extension**: `.delta`.
- **Sync mode**: full text sync, matching what the server advertises.
- **Activation event**: `onLanguage:delta`. The extension stays dormant
  until the user opens a `.delta` file.
- **Client library**: `vscode-languageclient` (the standard MS-maintained
  LSP client for VS Code).
- **Highlighting**: ship a basic TextMate grammar in v0. Keywords,
  literals, comments, identifiers — covers ~90% of the visual win for
  ~50 lines of JSON regexes.
- **Marketplace publication**: NOT in v0. Local install only.

## File layout

```
editors/vscode/
  package.json                 — manifest: contributes, activation, deps
  tsconfig.json                — TypeScript build config
  language-configuration.json  — comments, brackets, autoclose pairs
  syntaxes/delta.tmLanguage.json  — TextMate grammar (basic set)
  src/
    extension.ts               — activate() / deactivate(): spawn server
  .vscodeignore                — what to exclude when packaging .vsix
  README.md                    — install + dev instructions
```

No tests, no CI, no esbuild bundling in v0. Plain `tsc` produces
`out/extension.js`; package.json points `main` at it.

## package.json key fields

```jsonc
{
  "name": "delta-language",
  "displayName": "Delta Language",
  "description": "Language support for Delta",
  "version": "0.0.1",
  "publisher": "delta-lang",          // anything; not published yet
  "engines": { "vscode": "^1.80.0" },
  "categories": ["Programming Languages"],
  "activationEvents": ["onLanguage:delta"],
  "main": "./out/extension.js",
  "contributes": {
    "languages": [{
      "id": "delta",
      "aliases": ["Delta"],
      "extensions": [".delta"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "delta",
      "scopeName": "source.delta",
      "path": "./syntaxes/delta.tmLanguage.json"
    }],
    "configuration": {
      "title": "Delta",
      "properties": {
        "delta.server.path": {
          "type": "string",
          "default": "",
          "description": "Absolute path to the delta binary. Empty = find 'delta' on PATH."
        },
        "delta.trace.server": {
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off",
          "description": "Trace LSP traffic between client and server."
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package"
  },
  "dependencies": {
    "vscode-languageclient": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.80.0",
    "typescript": "^5.3.0",
    "@vscode/vsce": "^2.22.0"
  }
}
```

## extension.ts skeleton

```ts
import { workspace, ExtensionContext, window } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  const config = workspace.getConfiguration('delta');
  const serverPath = (config.get<string>('server.path') ?? '').trim() || 'delta';

  const serverOptions: ServerOptions = {
    command: serverPath,
    args: ['lsp'],
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'delta' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.delta'),
    },
    outputChannel: window.createOutputChannel('Delta Language Server'),
  };

  client = new LanguageClient(
    'delta',
    'Delta Language Server',
    serverOptions,
    clientOptions,
  );

  try {
    await client.start();
  } catch (err) {
    window.showErrorMessage(
      `Failed to start delta lsp (${serverPath} lsp): ${err}. ` +
      `Set "delta.server.path" in settings to the full path of the delta binary.`,
    );
  }
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
```

Notes:

- `LanguageClient` automatically pipes server stderr into the output
  channel. Any `s.log.Printf` calls in the server show up there.
- `transport: TransportKind.stdio` is the default; spelling it out makes
  the contract obvious.
- The activation error message names the setting key. Users will land on
  it the first time they install the extension without `delta` on PATH.

## language-configuration.json

```json
{
  "comments": {
    "lineComment": "//",
    "blockComment": ["/*", "*/"]
  },
  "brackets": [["{", "}"], ["[", "]"], ["(", ")"]],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "(", "close": ")" },
    { "open": "\"", "close": "\"" },
    { "open": "'", "close": "'" },
    { "open": "`", "close": "`" }
  ],
  "surroundingPairs": [
    ["{", "}"], ["[", "]"], ["(", ")"],
    ["\"", "\""], ["'", "'"], ["`", "`"]
  ]
}
```

Comments aren't implemented in the tokenizer yet, but VS Code's
`Ctrl+/` shortcut respects this file regardless. Pre-wiring `//` and
`/* */` now means the shortcut works the day the tokenizer learns them.

## TextMate grammar (v0 scope)

`syntaxes/delta.tmLanguage.json` — patterns to highlight:

| Pattern              | Scope                         | Example       |
| -------------------- | ----------------------------- | ------------- |
| `function`, `return`, `const`, `let`, `if`, `else`, `while` | `keyword.control.delta` | `function foo` |
| `true`, `false`      | `constant.language.boolean.delta` | `const x = true` |
| Integer literals     | `constant.numeric.delta`      | `42`, `0xFF`  |
| String `"..."`       | `string.quoted.double.delta`  | `"hello"`     |
| Char `'x'`           | `string.quoted.single.delta`  | `'δ'`         |
| Line comments        | `comment.line.double-slash.delta` | `// note` |
| Block comments       | `comment.block.delta`         | `/* note */`  |
| Type names after `:` | `entity.name.type.delta`      | `: int32`     |
| Function names       | `entity.name.function.delta`  | `function foo(...)` |

Skip anything the tokenizer doesn't accept yet (template strings, raw
strings, decorators, etc.). The grammar can extend as the language
surface grows.

A starting grammar is short enough that hand-writing it makes more sense
than generating it. Reference: VS Code's own [TypeScript grammar
](https://github.com/microsoft/vscode/blob/main/extensions/typescript-basics/syntaxes/TypeScript.tmLanguage.json)
for the shape — copy the structure, replace the patterns.

## Server discovery and launch

The decision order in `activate()`:

1. `delta.server.path` setting if set → use it.
2. Otherwise spawn `delta` (relies on PATH).

That's it. No bundled binary, no download-on-first-run, no version
matching. If the user has a stale or missing binary, they see the
activation error toast with the setting name.

Future hooks the plan deliberately omits:

- Embedded binary per-arch (post-MVP packaging concern).
- Version compatibility check (`delta --version` vs. extension version).
- Auto-download from a release URL.

## Settings exposed

| Key                   | Type   | Default | Notes |
| --------------------- | ------ | ------- | ----- |
| `delta.server.path`   | string | `""`    | Empty means "use `delta` from PATH". |
| `delta.trace.server`  | enum   | `"off"` | Standard LSP trace setting. Picked up automatically by `vscode-languageclient`. |

Two settings. No more in v0.

## Dev workflow

```bash
cd editors/vscode
npm install
npm run compile
code .                # open the extension folder in VS Code
# Press F5 — opens an Extension Development Host window with the
# extension loaded. Open a .delta file there.
```

Iteration loop:

- Edit `src/extension.ts`.
- `Ctrl+Shift+P` → "Developer: Reload Window" in the Host window.
- Or run `npm run watch` and just reload.

For server changes: rebuild `make build` in the repo root, then reload
the Host window — the extension respawns `delta lsp` from PATH each
activation.

## Packaging

For a colleague to install without VS Code dev tools:

```bash
cd editors/vscode
npm install
npm run compile
npm run package        # produces delta-language-0.0.1.vsix
# they run:
code --install-extension delta-language-0.0.1.vsix
```

Marketplace publication is a separate step (`vsce publish`) that needs a
publisher account and a stable name. Not in v0.

## Smoke test

End-to-end checklist after first build:

1. `make build` in repo root. `delta` is on PATH (symlink the `bin/`
   binary if needed: `ln -s "$PWD/bin/delta" ~/.local/bin/delta`).
2. `cd editors/vscode && npm install && npm run compile`.
3. Open `editors/vscode/` in VS Code, press `F5`.
4. In the Host window, open
   `test-source/tests/assign_local_const_err.delta`.
5. Expected: red squiggle under `x` on line 3. Hover shows
   `cannot assign to const: x`. The Delta Language Server output
   channel shows the server's stderr log lines.
6. Edit the file in the Host window (e.g. change `const` to `let`).
   Squiggle disappears on the next keystroke.
7. Close the file. Squiggle is cleared.

If steps 5–7 all work, v0 is done.

## Non-goals (deferred)

- Hover, go-to-definition, completion, signature help — the server
  doesn't expose them yet.
- Embedded server binary per-arch — needs a release pipeline.
- Marketplace publication — needs a stable publisher name and version
  cadence.
- Code snippets — minor polish, separate concern.
- Debugger adapter — much later.
- Webview-based AST viewer — interesting future idea, not for v0.
- esbuild/webpack bundling — `tsc` to `out/` is fine for the size of
  the extension code.
- Tests on the TypeScript side — the surface is too small to bother;
  the F5 smoke test catches what matters.

## Tasks (in execution order)

These can land in two visible milestones:

### Milestone A — syntax highlighting only (no server dependency)

1. Scaffold `editors/vscode/` with `package.json`, `tsconfig.json`,
   `language-configuration.json`, empty `src/extension.ts` (activate/
   deactivate no-ops), `.vscodeignore`, `README.md`.
2. Author `syntaxes/delta.tmLanguage.json` with the v0 scope above.
3. F5 test: open a `.delta` file in the Host window, see keywords and
   literals colorized. `extension.ts` doesn't do anything yet.

At this point the extension is independently useful and can be merged
even if the LSP work slips.

### Milestone B — LSP client

4. Add `vscode-languageclient` dependency. Implement `activate()` and
   `deactivate()` per the skeleton above.
5. Add the two `delta.*` settings to `contributes.configuration`.
6. F5 test: run through the smoke test checklist above. Verify red
   squiggles, hover messages, edit/close behaviors.
7. Write `README.md` install instructions (PATH expectations,
   `delta.server.path` override, install from `.vsix`).

## Risks and footguns

- **Server not on PATH after install**: most likely first-run failure.
  Activation error toast already names the setting; README should
  reinforce.
- **vscode-languageclient version drift**: pin to the major version
  in `package.json`. Newer LSP features may not yet be supported by
  our server; the client will silently advertise capabilities the
  server didn't ask for. Harmless as long as both sides ignore
  unknown methods.
- **Stale extension instance after server rebuild**: VS Code caches
  the LSP client until reload. After `make build`, reload the Host
  window or the extension will keep talking to the old server until
  the next file open.
- **Output channel noise**: server `log.Printf` lines land in the
  Delta output channel. Fine in dev, will look messy if a user
  installs the extension and sees verbose lifecycle logs. Default
  the server's log level to a quiet mode before marketplace release.
- **Workspace trust**: VS Code 1.80+ blocks extensions in untrusted
  workspaces by default. The extension spawns a binary from PATH,
  which is exactly what the trust system gates. Test the extension
  in both trusted and untrusted workspaces and decide whether to
  declare `capabilities.untrustedWorkspaces.supported: false` (the
  safer default).
- **TextMate grammar conflicts with semantic highlighting**: when
  the server later sends semantic tokens, they take precedence over
  the grammar. Until then, the grammar is the only colorization
  source; don't over-engineer it.
- **`F5` without a built `out/`**: first-time contributors forget
  `npm run compile`. Add a `vscode:prepublish` script that compiles,
  and a `preLaunchTask` in `.vscode/launch.json` if it's worth the
  scaffolding.

## Fastest path to "it works"

If the goal is purely "open a .delta file, see squiggles" before the
server polish lands:

1. Stub the LSP server enough to respond to `initialize` and publish
   one hard-coded diagnostic on `didOpen` (literal "test diagnostic"
   at line 1, column 1).
2. Build the VS Code extension Milestone B at the same time.
3. F5 → confirm the protocol round-trips and the diagnostic shows.
4. Then replace the stub with the real `pipeline.Compile` integration
   from [lsp-v0.md](./lsp-v0.md).

That order de-risks the protocol plumbing — the highest-uncertainty
part — before the compiler integration adds variables.
