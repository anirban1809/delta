# Change Log

## Unreleased

- Diagnose runtime string concatenation while accepting compile-time
  concatenation of literals and transitive `const` values.
- Resolve `delta.json` import dependencies in diagnostics, navigation, completion, and auto-import edits.
- Watch `delta.json` for dependency configuration changes.
- Reserve `@std` for standard-library imports.
- Resolve `@std` imports from the directory configured by `DELTA_STD_LIB`.
- Offer standard-library modules and exported symbols as `@std/...` auto-import
  completions.
- Add `delta.standardLibrary.path` so GUI-launched VS Code instances can pass
  the standard-library location directly to the language server.
- Suppress a library's generated `.ffi.delta` auto imports while editing that
  library's own implementation project.

## 0.3.0

- Add syntax highlighting for `export module` declarations and module namespace imports.
- Add completion, hover, and go-to-definition support for module bindings and qualified members.
- Support both aliased and unaliased module imports, including nested re-exported namespaces.
- Bundle the updated Delta language server.
