# Multi-module project support

This document records the implementation of Delta modules, project scaffolding, per-module C/header generation, and the Clang object/link build. The code excerpts are the changed code itself rather than line-number references.

## Module syntax and AST

### What changed

`src/ast/types.ts` now represents imports directly and records whether a top-level function, constant, or type is exported.

### Why

The compiler needs import path/specifier data to construct the module graph. Export visibility must remain attached to the source declaration so both semantic analysis and header generation can use the same fact.

```ts
export type Declaration =
    | ImportDeclaration
    | FunctionDeclaration
    | VariableDeclarationStatement
    | TypeDeclaration;

export type ImportSpecifier = {
    name: Identifier;
    position: Position;
};

export type ImportDeclaration = {
    kind: "import_declaration";
    position: Position;
    specifiers: ImportSpecifier[];
    path: string;
    resolvedPath?: string;
    moduleName?: string;
};

export type TypeDeclaration = {
    position: Position;
    kind: "type_declaration";
    name: Identifier;
    declKind: TypeDeclKind;
    declaration: StructDecl | EnumDecl | UnionDecl | TypeAlias;
    exported?: boolean;
};

export type FunctionDeclaration = {
    position: Position;
    kind: "function_declaration";
    name: Identifier;
    typeParameters?: Type[];
    returnTypes: Type[];
    errorTypes: Type[];
    parameters: FunctionParameter[];
    body: BlockStatement;
    concreteTypesMap?: Map<string, Type[]>;
    exported?: boolean;
};

export type VariableDeclarationStatement = {
    kind: "variable_declaration_statement";
    file: boolean;
    position: Position;
    mutable: boolean;
    type: Type;
    name: Identifier;
    value?: Expression;
    exported?: boolean;
};
```

`src/ast/parser.ts` parses named imports, strips the quotes from their paths, enforces that imports come first, and applies `export` to the following declaration.

```ts
parseImportDeclaration(): U<ImportDeclaration> {
    const keyword = this.advance();
    if (!this.expect(TokenKind.Symbol_LeftBrace, "{ symbol expected after import")) {
        return;
    }

    const specifiers: ImportDeclaration["specifiers"] = [];
    while (this.current().kind != TokenKind.Symbol_RightBrace) {
        const name = this.expect(TokenKind.Kind_Identifier, "imported identifier expected");
        if (!name) {
            return;
        }
        specifiers.push({
            name: CreateIdentifier(name.value),
            position: getTokenPosition(name),
        });

        if (this.current().kind == TokenKind.Symbol_Comma) {
            this.advance();
            continue;
        }
        if (this.current().kind != TokenKind.Symbol_RightBrace) {
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    this.getCurrentPosition(),
                    "comma or } expected in import list",
                ),
            );
            return;
        }
    }
    this.advance();

    if (!this.expect(TokenKind.Keyword_From, "from expected after import list")) {
        return;
    }
    const modulePath = this.expect(TokenKind.Kind_StringLiteral, "module path string expected");
    if (!modulePath) {
        return;
    }
    if (!this.expect(TokenKind.Symbol_Semicolon, "; expected after import")) {
        return;
    }

    return {
        kind: "import_declaration",
        position: getTokenPosition(keyword),
        specifiers,
        path: modulePath.value.slice(1, -1),
    };
}
```

The top-level declaration loop contains the following module-specific branches:

```ts
let sawNonImportDeclaration = false;

if (this.current().kind == TokenKind.Keyword_Import) {
    if (sawNonImportDeclaration) {
        this.diagnostics.addError(
            Error(
                this.filepath,
                "parser",
                this.getCurrentPosition(),
                "imports must precede other declarations",
            ),
        );
    }
    const declaration = this.parseImportDeclaration();
    if (declaration) {
        decls.push(declaration);
    }
    continue;
}

let exported = false;
if (this.current().kind == TokenKind.Keyword_Export) {
    exported = true;
    this.advance();
    this.skipComments();
}
sawNonImportDeclaration = true;
```

After parsing a function, constant, or type, its flag is set with the following code:

```ts
decl.exported = exported;
```

`src/ast/formatter.ts` also preserves imports in AST dumps:

```ts
case "import_declaration": {
    const declaration = d as ImportDeclaration;
    return {
        kind: declaration.kind,
        specifiers: declaration.specifiers.map((x) => x.name.name),
        path: declaration.path,
    };
}
```

## Module graph and visibility

### What changed

`src/compiler/project.ts` is the new project build pipeline. It computes stable module names from source paths, follows relative imports, detects cycles, analyzes dependencies before their consumers, checks export visibility, and places imported symbols into the consumer's top-level scope.

### Why

Parsing each file independently is insufficient: an imported function needs its source signature, an imported type needs its source layout, and cycles must be rejected before code generation.

Module identity is path-based and safe to use in C identifiers:

```ts
export function moduleName(projectRoot: string, filePath: string): string {
    const relative = path.relative(projectRoot, filePath).replace(/\.delta$/i, "");
    return relative
        .split(path.sep)
        .map((part) => part.replace(/[^A-Za-z0-9_]/g, "_"))
        .join("__");
}
```

Relative imports resolve beside the importing file. Bare roots and unavailable standard-library modules produce diagnostics.

```ts
function resolveImportPath(
    importer: ModuleNode,
    declaration: ImportDeclaration,
): string | undefined {
    if (declaration.path.startsWith("std/")) {
        importer.diagnostics.addError(
            CompilerDiagnostic(
                importer.filePath,
                "semantic",
                declaration.position,
                `unknown standard library module \`${declaration.path}\``,
            ),
        );
        return;
    }
    if (!declaration.path.startsWith("./") && !declaration.path.startsWith("../")) {
        importer.diagnostics.addError(
            CompilerDiagnostic(
                importer.filePath,
                "semantic",
                declaration.position,
                `unknown import root \`${declaration.path}\``,
            ),
        );
        return;
    }

    const withExtension = declaration.path.endsWith(".delta")
        ? declaration.path
        : `${declaration.path}.delta`;
    const resolved = path.resolve(path.dirname(importer.filePath), withExtension);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        importer.diagnostics.addError(
            CompilerDiagnostic(
                importer.filePath,
                "semantic",
                declaration.position,
                `cannot find module \`${declaration.path}\` (${resolved} does not exist)`,
            ),
        );
        return;
    }
    return resolved;
}
```

The graph walk uses visiting/visited states. A back edge records the complete source-file cycle.

```ts
if (states.get(dependencyPath) == "visiting") {
    const cycleStart = stack.indexOf(dependencyPath);
    const cycle = [...stack.slice(cycleStart), dependencyPath]
        .map((item) => path.basename(item))
        .join(" → ");
    diagnostics.addError(
        CompilerDiagnostic(
            filePath,
            "semantic",
            declaration.position,
            `import cycle detected: ${cycle}`,
        ),
    );
    continue;
}
visit(dependencyPath, [...stack, dependencyPath]);
```

Only declarations marked `export` are placed in another module's scope:

```ts
const sourceDeclaration = topLevelDeclaration(dependency.ast, specifier.name.name);
if (!sourceDeclaration || sourceDeclaration.kind == "import_declaration") {
    node.diagnostics.addError(
        CompilerDiagnostic(
            node.filePath,
            "semantic",
            specifier.position,
            `\`${specifier.name.name}\` is not declared by \`${declaration.path}\``,
        ),
    );
    continue;
}
if (!sourceDeclaration.exported) {
    node.diagnostics.addError(
        CompilerDiagnostic(
            node.filePath,
            "semantic",
            specifier.position,
            `\`${specifier.name.name}\` is not exported by \`${declaration.path}\``,
        ),
    );
    continue;
}

const symbol = dependency.scope.getSymbol(specifier.name.name);
if (symbol) {
    scope.addSymbol(symbol);
    node.importedSymbols.set(specifier.name.name, dependency.moduleName);
}
```

`src/analysis/core.ts` now accepts that pre-populated scope. `src/analysis/declarations.ts` ignores import nodes because graph construction has already resolved them.

```ts
constructor(
    public ast: Module,
    public diagnostics: Diagnostics,
    globalScope: Scope = new Scope(),
) {
    this.globalScope = globalScope;
    this.declarationAnalyzer = new DeclarationAnalyzer(ast, diagnostics, this.globalScope);
}
```

```ts
case "import_declaration":
    return;
```

## Module-aware C and header generation

### What changed

`src/codegen/emitter.ts` accepts module metadata, maps local and imported top-level declarations to their owning modules, emits a header containing every type declaration and function prototype, and emits one C translation unit containing their definitions.

### Why

The C linker needs globally unique names, while translation units need type layouts and function prototypes before their definitions are compiled. Keeping these declarations in the header gives each module one declaration surface. Local variables keep their original names, and runtime helpers keep their existing ABI.

```ts
export type ModuleEmitOptions = {
    moduleName: string;
    importedSymbols?: Map<string, string>;
    importedHeaders?: string[];
    entry?: boolean;
};
```

The mangling code produces `delta__{moduleName}__{declaration}` and is used only for module declarations. `delta_panic` and every `delta_rt__...` helper remain unchanged.

```ts
private moduleSymbol(name: string): string {
    const moduleName = this.symbolModules.get(name) ?? this.moduleOptions?.moduleName;
    return moduleName ? `delta__${moduleName}__${name}` : name;
}

private emitIdentifier(name: string): string {
    if (!this.moduleOptions || this.isLocal(name) || !this.symbolModules.has(name)) {
        return name;
    }
    return this.moduleSymbol(name);
}
```

Custom types use the same module-aware mapping:

```ts
case TypeValue.TypeCustom:
    return this.customTypeName(t);
```

### Generic struct specializations

Concrete generic arguments are now part of every custom C type spelling, not only the emitted typedef. Previously an `owned<int32>` typedef was emitted as `delta__main__owned__int32`, while local declarations and compound literals incorrectly used the unspecialized `delta__main__owned` name.

```ts
private customTypeName(t: Type): string {
    const name = this.resolveTargetIfAlias(t);
    const baseName = this.moduleOptions ? this.moduleSymbol(name) : `delta__${name}`;
    const concreteTypes = this.concreteTypeArguments(t.typeParameters);
    if (!concreteTypes) {
        return baseName;
    }
    return `${baseName}__${concreteTypes.map((type) => this.typeMangle(type)).join("_")}`;
}

private concreteTypeArguments(typeParameters?: Type[]): U<Type[]> {
    if (!typeParameters?.length) {
        return;
    }
    const concreteTypes = typeParameters.map((type) =>
        type.value == TypeValue.TypeGeneric
            ? this.activeConcreteTypes?.get(type.name.name)
            : type,
    );
    if (concreteTypes.some((type) => !type || type.value == TypeValue.TypeGeneric)) {
        return;
    }
    return concreteTypes as Type[];
}
```

Object literals now derive their signature directly from their concrete type arguments. This avoids looking up `int32` as though it were the declaration parameter name `T`.

```ts
private concreteStructSignature(e: ObjectLiteralExpression): U<string> {
    if (!this.concreteTypeArguments(e.type.typeParameters)) {
        return;
    }
    return this.customTypeName(e.type);
}
```

Nested concrete type arguments also participate in mangling so different nested instantiations remain distinct:

```ts
private typeMangle(t: Type): string {
    const concreteType =
        t.value == TypeValue.TypeGeneric
            ? (this.activeConcreteTypes?.get(t.name.name) ?? t)
            : t;
    const typeArguments = concreteType.typeParameters?.length
        ? `__${concreteType.typeParameters.map((type) => this.typeMangle(type)).join("_")}`
        : "";
    const dimensions = concreteType.arrayLengths?.map((length) => `_${length}`).join("") ?? "";
    return `${concreteType.name.name}${typeArguments}${dimensions}`.replaceAll(
        /[^A-Za-z0-9_]/g,
        "_",
    );
}
```

Generated headers are prefixed with `delta_` to avoid collisions with system headers such as `<math.h>`. They contain every struct/type declaration and every function prototype. Exported constant declarations remain in the header as well. Private function prototypes are protected by a module implementation macro so importing modules do not receive internal-linkage declarations that they cannot define.

```ts
emitHeader(): string {
    if (!this.moduleOptions) {
        return "";
    }

    const guard = `DELTA_${this.moduleOptions.moduleName.toUpperCase()}_H`;
    const dependencyIncludes = [...new Set(this.moduleOptions.importedHeaders ?? [])]
        .filter((name) => name != this.moduleOptions!.moduleName)
        .map((name) => `#include "delta_${name}.h"`)
        .join("\n");

    const typeDeclarations = this.ast.declarations
        .filter(
            (declaration): declaration is TypeDeclaration =>
                declaration.kind == "type_declaration",
        )
        .map((declaration) => this.emitTypeDeclaration(declaration))
        .join("\n\n");

    const exportedValues = this.ast.declarations
        .map((declaration) => {
            if (declaration.kind == "function_declaration" && declaration.exported) {
                return this.emitForwardDeclaration(declaration);
            }
            if (declaration.kind == "variable_declaration_statement" && declaration.exported) {
                const dimensions =
                    declaration.type.arrayLengths?.map((length) => `[${length}]`).join("") ?? "";
                return `extern const ${this.cType(declaration.type)} ${this.moduleSymbol(declaration.name.name)}${dimensions};`;
            }
            return "";
        })
        .filter(Boolean)
        .join("\n");

    const privateFunctionDeclarations = this.ast.declarations
        .filter(
            (declaration): declaration is FunctionDeclaration =>
                declaration.kind == "function_declaration" && !declaration.exported,
        )
        .map((declaration) => this.emitForwardDeclaration(declaration))
        .join("\n");

    const implementationDeclarations = privateFunctionDeclarations
        ? `#ifdef ${this.implementationMacro()}\n${privateFunctionDeclarations}\n#endif`
        : "";

    const declarations = [typeDeclarations, exportedValues, implementationDeclarations]
        .filter(Boolean)
        .join("\n\n");

    return `#ifndef ${guard}
#define ${guard}

#include <stdbool.h>
#include <stdint.h>
${dependencyIncludes ? `${dependencyIncludes}\n` : ""}
${declarations}

#endif
`;
}
```

Each implementation defines its implementation macro and includes its generated header. The macro exposes that module's private function prototypes only to its own C translation unit.

```ts
return `#define ${this.implementationMacro()}\n#include "delta_${this.moduleOptions.moduleName}.h"\n#include<stdio.h>\n#include<stdint.h>\n#include<stdbool.h>\n#include <stdlib.h>\n#include <math.h>\n\n`;
```

```ts
const decls = this.ast.declarations.map((x) => {
    if (this.moduleOptions && x.kind == "type_declaration") {
        return "";
    }
    return this.emitDeclaration(x);
});
```

The source translation unit no longer emits a separate forward-declaration block in module mode:

```ts
const fwdDecls = this.moduleOptions
    ? []
    : this.ast.declarations.map((x) => {
          if (x.kind == "function_declaration") {
              return this.emitForwardDeclaration(x as FunctionDeclaration);
          }
          return "";
      });
```

Only the selected entry module emits the C `main` shim:

```ts
const entryShim = !this.moduleOptions || this.moduleOptions.entry ? this.emitMain() : "";
```

## Build artifacts and Clang

### What changed

The build writes module artifacts under `build/codegen`, objects under `build/obj`, and the executable under `build`. Clang compiles every generated C file separately before linking the object files.

### Why

Separate compilation gives each Delta module its own translation unit and makes headers the explicit cross-module interface, as requested.

```ts
const buildDir = path.join(project.root, "build");
const codegenDir = path.join(buildDir, "codegen");
const objectDir = path.join(buildDir, "obj");
fs.mkdirSync(codegenDir, { recursive: true });
fs.mkdirSync(objectDir, { recursive: true });

for (const node of ordered) {
    const importedHeaders = node.imports
        .map((declaration) => declaration.moduleName)
        .filter((name): name is string => !!name);
    const emitOptions: ModuleEmitOptions = {
        moduleName: node.moduleName,
        importedSymbols: node.importedSymbols,
        importedHeaders,
        entry: node.filePath == project.entryPath,
    };
    const headerPath = path.join(codegenDir, `delta_${node.moduleName}.h`);
    const cPath = path.join(codegenDir, `${node.moduleName}.c`);
    fs.writeFileSync(headerPath, new Emitter(node.ast, emitOptions).emitHeader());
    fs.writeFileSync(cPath, new Emitter(node.ast, emitOptions).emit());
    result.headerFiles.push(headerPath);
    result.cFiles.push(cPath);
}

for (const cPath of result.cFiles) {
    const objectPath = path.join(objectDir, `${path.basename(cPath, path.extname(cPath))}.o`);
    execFileSync("clang", ["-std=c17", "-I", codegenDir, "-c", cPath, "-o", objectPath]);
    result.objectFiles.push(objectPath);
}

result.binaryPath = path.join(buildDir, project.outputName);
execFileSync("clang", [...result.objectFiles, "-lm", "-o", result.binaryPath]);
```

## Project scaffolding and CLI

### What changed

`delta init <name>` creates a new directory containing `delta.json`, `.gitignore`, and `src/main.delta`. The generated project builds without additional setup. `delta build` accepts a `.delta` entry, a project directory, or no argument when run inside a scaffolded project.

### Why

The manifest gives a scaffolded multi-file project a stable entry module and executable name. Refusing to overwrite an existing path makes initialization safe.

```ts
export function scaffoldProject(name: string, parentDirectory: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
        throw new Error("project name may contain only letters, numbers, underscores, and hyphens");
    }
    const projectRoot = path.join(parentDirectory, name);
    if (fs.existsSync(projectRoot)) {
        throw new Error(`refusing to overwrite existing path: ${projectRoot}`);
    }

    fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    fs.writeFileSync(
        path.join(projectRoot, "delta.json"),
        `${JSON.stringify(
            {
                name,
                version: "0.1.0",
                schemaVersion: 1,
                entry: "src/main.delta",
                target: { backend: "c", standard: "c17", compiler: "clang" },
            },
            null,
            2,
        )}\n`,
    );
    fs.writeFileSync(path.join(projectRoot, ".gitignore"), "/build\n");
    fs.writeFileSync(
        path.join(projectRoot, "src", "main.delta"),
        `function main(): int8 {
    return 0;
}
`,
    );
    return projectRoot;
}
```

The `main.ts` build path no longer prints generated C. It reports diagnostics or the executable path returned by the project pipeline.

```ts
function build(entry?: string): boolean {
    const result = buildProject(entry);
    for (const error of result.diagnostics) {
        console.error(new Diagnostics(error.filepath).format(error));
    }
    if (result.error) {
        console.error(result.error);
    }
    if (!result.binaryPath || result.diagnostics.length > 0 || result.error) {
        return false;
    }

    console.log(`Built ${result.binaryPath}`);
    return true;
}
```

## Verification fixtures and results

The following focused fixtures were added under `test-source/tests/modules`:

- `two-module`: imports an exported constant and function, produces two C files and two object files, links, and exits with `27`.
- `exported-type`: exports a record layout through a generated header, imports it from the entry module, links, and exits with `7`.
- `generic-struct`: emits and uses `owned<int32>` and `owned<bool>` as distinct concrete C types, links, and exits with `5`.
- `generic-struct-import`: exports a generic struct from another module, emits the specialization in the owner module's header, links, and exits with `9`.
- `private-import`: attempts to import a non-exported function and receives a single visibility diagnostic at the import specifier.

The generated scaffold was also built and executed successfully with exit status `0`.

`npm run build` passes. The broad `npm test` run currently reports `260 passed, 225 failed`; those failures span pre-existing unfinished parser/analyzer/codegen areas in the already-modified worktree. The module-focused builds above pass after the implementation.
