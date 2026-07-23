# Change Log

## Unreleased

- Resolve `delta.json` import dependencies in diagnostics, navigation, completion, and auto-import edits.
- Watch `delta.json` for dependency configuration changes.
- Reserve `@std` for standard-library imports.

## 0.3.0

- Add syntax highlighting for `export module` declarations and module namespace imports.
- Add completion, hover, and go-to-definition support for module bindings and qualified members.
- Support both aliased and unaliased module imports, including nested re-exported namespaces.
- Bundle the updated Delta language server.
