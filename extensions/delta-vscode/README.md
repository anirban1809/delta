# Delta for VS Code

This extension adds `.delta` file recognition and connects VS Code to the
Delta language server. It provides module-aware compiler diagnostics, generic
and fallible signature hovers, cross-module go-to-definition, and completion
for visible symbols, struct fields, and receiver functions. Member navigation
also follows `owned<T>` auto-dereference rules.

String literals use either double quotes or multi-character/empty single
quotes. Hover inference reports these values as `string`; one-scalar
single-quoted literals remain `char`. The bundled grammar highlights both
forms accordingly. String slices expose their UTF-8 byte length through the
`uintsize` property `.length`.

Completion also offers exported functions, types, and constants from other
workspace modules. Selecting one automatically adds or updates the appropriate
named import. Set `delta.autoImports.enabled` to `false` to disable this.

Delta module namespaces are supported by the bundled language server and
syntax grammar. Given a file that ends with `export module math;`, both
`import math from "./arithmetic";` and
`import math as numbers from "./arithmetic";` provide member completion,
hover information, diagnostics, and go-to-definition for qualified members.

When a project defines import dependencies in `delta.json`, the language server uses
them for diagnostics, navigation, and auto-import edits. The `@std` alias is
reserved for Delta's standard library and cannot be overridden by a project.

## Build the bundled extension server

From the repository root:

```sh
npm install
npm run build:vscode
cd extensions/delta-vscode
npm install
```

Then install the `extensions/delta-vscode` folder with your preferred VS Code
extension packaging workflow. The generated `server/server.js` is included in
the extension directory.

For development against a different server build, set
`delta.languageServer.path` to that JavaScript entry point.

## Build, package, and install a new version

From the repository root, run:

```sh
npm run release:vscode
```

This defaults to a patch bump. Pass `minor`, `major`, or an explicit semantic
version when needed:

```sh
npm run release:vscode -- minor
npm run release:vscode -- 0.4.0
```

The command keeps the extension and language-server versions synchronized,
builds the bundled server, creates a versioned VSIX, installs it with the VS
Code command-line tool, and verifies the installed extension version.
