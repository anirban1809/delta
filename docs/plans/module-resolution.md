# Module Declaration and Resolution

Status: **Implemented for relative Delta modules.** Root standard-library and
third-party package resolution remain separate resolver work.

## Decision

Delta supports two complementary ways to publish and import declarations:

1. **Selective exports and imports** retain the existing syntax. They are the
   preferred form when a consumer wants an explicit, tree-shakable dependency
   on a small set of declarations.
2. **Module declarations and namespace imports** provide a regular module
   interface. A file may publish its complete top-level scope as one named
   namespace. A consumer may use the declared module name as its local binding
   or provide an explicit local alias.

The two forms are interoperable. A selectively imported name may come from a
file that uses either individual `export` modifiers or `export module`. A file
that declares `export module` also re-exports every binding it imports.

## Core syntax

### Exporting declarations individually

The current selective syntax remains unchanged:

```delta
// math.delta
export function add(a: int32, b: int32): int32 {
    return a + b;
}

function implementation_detail(): int32 {
    return 0;
}
```

```delta
import { add } from "./math";
```

Only declarations marked `export` belong to the file's public surface.

### Exporting a complete module

`export module` publishes every top-level binding in the file as a single
module namespace:

```delta
// arithmetic.delta
function add(a: int32, b: int32): int32 {
    return a + b;
}

function subtract(a: int32, b: int32): int32 {
    return a - b;
}

export module math;
```

The declared module name does not have to match the file name. In this example,
the file is `arithmetic.delta` and the declared module is `math`.

A consumer may import the declared module under a local alias:

```delta
import math as numbers from "./arithmetic";

function main(): int8 {
    const sum: int32 = numbers.add(20, 22);
    const difference: int32 = numbers.subtract(50, 8);
    return int8(sum - difference);
}
```

When no alias is needed, the shorter form binds the declared module name
directly:

```delta
import math from "./arithmetic";

const sum: int32 = math.add(20, 22);
```

In both forms, the first identifier, `math`, must match the target file's
declared module name. When `as` is present, the following identifier is the
local binding. Otherwise, the declared module name is also the local binding.

## Grammar

The relevant grammar becomes:

```ebnf
source_file          ::= import_declaration* top_level_declaration* module_export?

import_declaration   ::= named_import | module_import

named_import         ::= "import" "{" import_specifier
                         ("," import_specifier)* "}" "from"
                         string_literal ";"

module_import        ::= "import" identifier ("as" identifier)? "from"
                         string_literal ";"

module_export        ::= "export" "module" identifier ";"
```

`module` becomes a reserved keyword. `export module` is a file declaration,
not a block and not a runtime value declaration.

The following structural rules apply:

- A file may contain at most one `export module` declaration.
- `export module` must be the final non-comment declaration in the file.
- Imports must continue to precede all non-import declarations.
- A file without `export module` continues to use individual `export`
  modifiers exactly as it does today.
- Individual `export` modifiers are legal in a file that also has
  `export module`, but they are redundant because the module declaration
  publishes the complete top-level scope. This permits incremental migration
  without changing meaning.

## Export-surface rules

### Local declarations

When a file contains `export module name;`, every eligible top-level
declaration is public through that module:

- functions;
- file-scope constants;
- structs, enums, unions, aliases, interfaces, and other type declarations;
- receiver functions; and
- future top-level declaration forms unless their specification explicitly
  excludes module export.

There is no private top-level declaration in an `export module` file. Code that
requires a private implementation surface should remain in an explicitly
exported file or be moved behind a separate module boundary.

Receiver functions retain their existing rule: they travel with their receiver
type. Importing or selecting the type makes its exported receiver functions
available through normal method lookup.

### Imported bindings are re-exported

`export module` publishes the complete file-level scope, including imported
bindings. This is intentional and makes module files usable as aggregation or
barrel modules.

A named import is re-exported under its local name:

```delta
// toolkit.delta
import { clamp } from "./numeric";

function twice(value: int32): int32 {
    return value * 2;
}

export module toolkit;
```

```delta
import toolkit as tools from "./toolkit";

const a: int32 = tools.clamp(12, 0, 10);
const b: int32 = tools.twice(21);
```

A module import is re-exported under its local binding as a nested namespace.
The local binding is the explicit alias when `as` is present and the declared
module name otherwise:

```delta
// geometry.delta
function area(width: float64, height: float64): float64 {
    return width * height;
}

export module geometry;
```

```delta
// toolkit.delta
import geometry as shapes from "./geometry";

function version(): int32 {
    return 1;
}

export module toolkit;
```

```delta
import toolkit as tools from "./toolkit";

const value: float64 = tools.shapes.area(4.0, 5.0);
```

The unaliased equivalent would re-export the nested namespace as `geometry`:

```delta
import geometry from "./geometry";

export module toolkit;
```

A consumer of this form uses `tools.geometry.area(...)`.

The nested rule avoids silently flattening two complete namespaces into one.
Consumers that want a flat re-export use named imports in the aggregation file.

Because imports are re-exported automatically, an `export module` file cannot
have an import that is private to that file. This is part of the feature's
export-everything contract, not an implementation accident.

### Selective imports from a declared module

The existing named-import form may select any member of a declared module:

```delta
import { add } from "./arithmetic";

const result: int32 = add(20, 22);
```

This keeps the existing tree-shakable syntax useful even when the producer uses
`export module` rather than individual `export` modifiers.

The public-name lookup for a named import is therefore:

- the individually exported declarations when the target has no
  `export module`; or
- the complete module export surface, including re-exported import bindings,
  when the target has `export module`.

## Namespace semantics

A module binding is a compile-time namespace, not a runtime object. It may use
the declared module name directly or an explicit alias.

Consequently, a module binding:

- may qualify names in value and type positions;
- may contain a nested imported module namespace;
- cannot be assigned, passed as an argument, returned, stored in a record,
  compared, indexed, enumerated, or inspected through reflection; and
- emits no namespace object or initialization code.

Examples:

```delta
import geometry as shapes from "./geometry";

function example(point: shapes.Point): float64 { // OK: type position
    const value: float64 = shapes.area(4.0, 5.0); // OK: value position

    consume(shapes);                            // ERROR: module is not a value
    const member = shapes["area"];              // ERROR: computed access is invalid
    return value;
}
```

Member access is resolved statically. `shapes.area(...)` lowers directly to the
resolved function symbol; it is not a property lookup at runtime.

## Path and module-name resolution

The module declaration does not replace path-based source resolution. The
compiler continues to resolve the string after `from` first.

### Relative source paths

- `./x` and `../x` resolve relative to the importing file.
- If no extension is present, `.delta` is appended.
- An explicit `.delta` extension is accepted but not preferred.
- Resolution is exact and case-sensitive, even on a case-insensitive host
  filesystem.
- Directory-index probing and extension search are not performed.

For example:

```delta
import math as numbers from "../shared/arithmetic";
```

resolves `../shared/arithmetic.delta`, then verifies that the target contains:

```delta
export module math;
```

### Standard-library and package paths

The same namespace-import syntax applies to compiler-provided standard-library
modules:

```delta
import std from "std";
```

or, when a local alias is useful:

```delta
import std as stdlib from "std";
```

The root resolver determines the physical standard-library source or embedded
module, then verifies its declared name. Existing `std/...` paths retain their
current resolver behavior. Third-party bare package roots remain a separate
package-resolution feature.

### Physical identity and declared name

The canonical resolved source path remains the module's physical identity for:

- import-cycle detection;
- incremental build keys;
- generated C symbol mangling;
- duplicate-file detection; and
- diagnostic locations.

The identifier in `export module name;` is the module's public namespace label
and the default local binding for an unaliased module import. It is
intentionally independent of the filename and physical identity.

Two different files may declare the same public module name because their paths
still disambiguate them. A consumer must name the expected declaration and may
give each import a distinct local alias:

```delta
import math as integer_math from "./integer/arithmetic";
import math as decimal_math from "./decimal/arithmetic";
```

## Resolution algorithm

For each import, the compiler performs these steps:

1. Classify the import as a named import or module namespace import.
2. Resolve and canonicalize the source path according to its import root.
3. Load and parse the target file once per canonical path.
4. Add the canonical path edge to the import graph and reject cycles using the
   existing DAG rule.
5. Build the target file's public export table:
    - collect individually exported declarations when there is no module
      declaration; or
    - collect all local top-level declarations and all imported bindings when
      `export module` is present.
6. For a module namespace import, verify that the target declares a module and
   that its case-sensitive name matches the first identifier in the import.
7. Bind the explicit alias when `as` is present; otherwise bind the declared
   module name. Bind named imports as before. Reject duplicate or shadowing
   bindings under the existing scope rules.
8. Resolve qualified member references against the target's export table.
9. Record the concrete declaration behind each member for analysis, code
   generation, editor navigation, and incremental dependency tracking.

The export-table construction step follows re-exports transitively, but the
underlying import graph must remain acyclic. An export entry retains the
canonical source declaration it ultimately refers to; re-exporting does not
create a second function, type, or constant.

## Name collisions

Local declarations and imported bindings continue to share the appropriate
file-level namespaces. A file cannot publish an ambiguous member.

```delta
import { parse } from "./json";

function parse(text: stringview): Value { // ERROR: duplicate file-level name
    // ...
}

export module data;
```

If Delta maintains separate type and value namespaces, the export table retains
that separation. A qualified name is resolved in the namespace required by its
syntactic position. If the language instead adopts one shared namespace, the
existing duplicate-name rule applies unchanged.

## Tree shaking and code generation

Named imports retain their existing selective dependency behavior. Importing
`{ add }` does not make unrelated members part of the consumer's explicit
dependency set, even when the producer uses `export module`.

A module namespace import makes the complete namespace available to the
consumer and therefore does not promise per-member tree shaking as a language
guarantee. The compiler and linker may still remove members that are proven
unreachable, because qualified member access is statically resolved and Delta
has no top-level execution or reflective namespace lookup.

`export module` does not emit a runtime namespace structure. Generated symbols
continue to use the canonical path-derived mangling identity, preventing two
files with the same declared module name from colliding. A re-export points to
the original generated symbol.

## Diagnostics

The feature requires clear diagnostics for at least these cases:

- a namespace import targets a file with no `export module` declaration;
- the imported module name does not match the target's declared name;
- a file contains more than one `export module` declaration;
- `export module` is not the final non-comment declaration;
- a requested named import is absent from the target export surface;
- a qualified member does not exist in the imported module;
- a module binding is used as a runtime value;
- a local declaration or import collides with another exported binding;
- an import path cannot be resolved or has a case mismatch; and
- an import or re-export introduces a cycle.

Example messages:

```text
error: module namespace import requires `export module math;` in ./arithmetic.delta

error: imported module name `math` does not match declared module `arithmetic`
  import math as numbers from "./arithmetic";

error: module `math` has no exported member `multiply`
  numbers.multiply(6, 7)
```

Diagnostic numbers should be assigned with the existing E12xx module family
when implementation begins.

## Compiler and tooling work

### Front end

- Add the `module` keyword token.
- Parse the module namespace import and terminal module declaration forms.
- Add explicit AST nodes for module declarations and module import bindings,
  with an optional alias on module imports.
- Update formatting and syntax highlighting for both forms.

### Semantic analysis

- Build a public export table for every parsed file.
- Represent imported module bindings as a distinct namespace symbol kind.
- Resolve qualified value and type names through namespace symbols.
- Include imported bindings in the export table of an `export module` file.
- Preserve original-declaration identity through re-export chains.
- Validate declaration order, duplicate names, name matching, and namespace
  misuse.

### Project graph and code generation

- Keep canonical paths as graph node and mangling identities.
- Include module declarations and re-export tables in public-interface hashes.
- Track selective named dependencies separately from namespace dependencies.
- Emit direct references to original symbols; do not emit runtime namespace
  objects or duplicate definitions for re-exports.

### Language server

- Complete members after a module binding in both type and value positions.
- Support go-to-definition, references, hover, and rename through re-exports.
- Offer both selective-import and namespace-import completion actions.
- Update auto-import insertion so it can preserve the import style already used
  by the file.

## Conformance tests

Implementation is complete when tests cover:

### Successful cases

- a module name that matches its filename;
- a module name that differs from its filename;
- an unaliased namespace import using the declared module name locally;
- a namespace import with a different local alias;
- functions, constants, types, and receiver functions accessed through both a
  direct module-name binding and an alias;
- a named import selected from an `export module` file;
- a named import re-exported flat by an aggregation module;
- a module import re-exported as a nested namespace;
- two files with the same declared module name imported from different paths;
- a multi-hop re-export retaining original symbol identity; and
- existing individually exported, tree-shakable imports with no behavior
  change.

### Failure cases

- namespace import from a file without `export module`;
- imported module-name mismatch, including case-only mismatch;
- duplicate module declarations;
- a module declaration before another top-level declaration;
- unknown namespace member in value position;
- unknown namespace member in type position;
- use of a module binding as a runtime value;
- duplicate local module binding, with and without an explicit alias;
- collision between a local declaration and a re-exported imported binding;
- unresolved or incorrectly cased path; and
- direct or transitive import cycle involving re-exporting modules.

## Compatibility and migration

This feature is additive. Existing source files do not need to change.

A file can migrate from individual exports to a grouped module in two stages:

1. Add `export module name;`. Existing individual `export` modifiers remain
   legal and existing named-import consumers continue to compile.
2. Remove redundant individual `export` modifiers and optionally migrate
   consumers to namespace imports.

The migration may deliberately enlarge the public API: every local top-level
declaration and every imported binding becomes public. Tooling should show the
resulting export surface before or during this conversion so accidental API
growth is visible.

## Final examples

### Grouped module with both import styles

```delta
// calculations.delta
function add(a: int32, b: int32): int32 {
    return a + b;
}

function multiply(a: int32, b: int32): int32 {
    return a * b;
}

export module math;
```

```delta
// namespace consumer
import math as numbers from "./calculations";

const answer: int32 = numbers.add(20, 22);
```

```delta
// namespace consumer without an alias
import math from "./calculations";

const answer: int32 = math.add(20, 22);
```

```delta
// selective consumer
import { multiply } from "./calculations";

const answer: int32 = multiply(6, 7);
```

### Aggregation module

```delta
// data.delta
import { parse } from "./parser";
import validation as rules from "./validation";

function version(): int32 {
    return 1;
}

export module data;
```

```delta
import data as api from "./data";

const value = api.parse("42");
const valid: bool = api.rules.is_valid(value);
const version: int32 = api.version();
```

Here `parse` is re-exported as a flat member, `rules` is re-exported as a
nested namespace, and `version` is exported as a local declaration.
