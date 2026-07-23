import { string, TokenKind } from "../ast/tokens.js";
import {
    TypeDeclKind,
    TypeValue,
    type ArrayLiteralExpression,
    type AssignmentStatement,
    type AsResultBinding,
    type BinaryExpression,
    type BlockStatement,
    type CheckBlockStatement,
    type Declaration,
    type EnumDecl,
    type Expression,
    type FieldInit,
    type ForStatement,
    type ForwardStatement,
    type FunctionCallExpression,
    type FunctionDeclaration,
    type FunctionParameter,
    type IfStatement,
    type IndexExpression,
    type MemberAccessExpression,
    type Module,
    type ObjectLiteralExpression,
    type ReturnErrorStatement,
    type ReturnStatement,
    type Statement,
    type StringLiteral,
    type StructDecl,
    type SwitchCase,
    type SwitchStatement,
    type Type,
    type TypeAlias,
    type TypeDeclaration,
    type U,
    type UnaryExpression,
    type UnionDecl,
    type VariableDeclarationStatement,
    type WhileStatement,
    type NewExpression,
} from "../ast/types.js";
import type { ImportedSymbolReference } from "../compiler/module_bindings.js";

/** Module-specific information used when emitting a project translation unit. */
export type ModuleEmitOptions = {
    moduleName: string;
    /** Module identity baked into symbols, which may differ for a prebuilt interface. */
    abiModuleName?: string;
    importedSymbols?: Map<string, ImportedSymbolReference>;
    importedHeaders?: string[];
    entry?: boolean;
    exportAll?: boolean;
};

//tracks and frees allocations in a block
export class AllocationTracker {
    addAllocation(_symbolName: string) {}

    deallocate(): string[] {
        return [];
    }
}

type OwnedBinding = {
    sourceName: string;
    emittedName: string;
    type: Type;
    liveFlag: string;
};

/**
 * Lowers a parsed {@link Module} to C source text.
 *
 * The emitter walks the AST and produces a single C translation unit: standard
 * headers, forward declarations for every function (so call order within the
 * module is irrelevant), the function definitions themselves, and a C `main`
 * shim that calls into the program's Delta `main`. `final` accumulates the
 * output and `indent` tracks the current nesting depth for pretty-printing.
 */
export class Emitter {
    final: string;
    indent: number;
    /**
     * The generic bindings for the function body currently being emitted.
     * Keeping this as emitter state lets existing body emitters resolve a
     * `T` used by a local declaration, not just a `T` in the C signature.
     */
    private activeConcreteTypes?: Map<string, Type>;
    guards: {
        conversions: { fromType: string; toType: string }[];
        divisions: { type: string }[];
        shifts: { type: string }[];
        overflows: { type: string }[];
        underflows: { type: string }[];
    };
    guardNames: Map<string, string>;
    private moduleOptions?: ModuleEmitOptions;
    private symbolModules = new Map<string, string>();
    private symbolSourceNames = new Map<string, string>();
    private externalLinkNames = new Map<string, string>();
    private localScopes: Set<string>[] = [];
    private activeFunction?: FunctionDeclaration;
    private resultCounter = 0;
    private ownershipCounter = 0;
    private replacementCounter = 0;
    private newTypes = new Map<string, Type>();
    private cloneTypes = new Map<string, Type>();
    private ownershipScopes: OwnedBinding[][] = [];
    private controlFlowBoundaries: number[] = [];
    private pendingOwnedParameters: FunctionParameter[] = [];
    private pendingResults = new Map<
        string,
        { temp: string; resultType: string; commit: string; binding: AsResultBinding }
    >();
    private errorTags = new Map<string, number>();
    private stringLiteralNames = new Map<StringLiteral, { name: string; length: number }>();
    private stringLiteralBlocks: { name: string; bytes: number[] }[] = [];
    private sliceTypes = new Map<string, Type>();

    constructor(
        public ast: Module,
        moduleOptions?: ModuleEmitOptions,
    ) {
        this.moduleOptions = moduleOptions;
        if (moduleOptions) {
            moduleOptions.importedSymbols?.forEach((reference, name) => {
                this.symbolModules.set(name, reference.moduleName);
                this.symbolSourceNames.set(name, reference.sourceName);
                if (reference.linkName) this.externalLinkNames.set(name, reference.linkName);
            });
            ast.declarations.forEach((declaration) => {
                if (declaration.kind != "import_declaration") {
                    const externalModule =
                        declaration.kind == "function_declaration" &&
                        declaration.external?.abi == "delta"
                            ? declaration.external.moduleName
                            : (declaration.kind == "variable_declaration_statement" ||
                                  declaration.kind == "type_declaration") &&
                                declaration.external?.abi == "delta"
                              ? declaration.external.moduleName
                              : undefined;
                    this.symbolModules.set(
                        declaration.name.name,
                        externalModule ??
                            moduleOptions.abiModuleName ??
                            moduleOptions.moduleName,
                    );
                }
            });
        }
        this.guardNames = new Map();
        this.guards = {
            overflows: [],
            underflows: [],
            conversions: [],
            divisions: [],
            shifts: [],
        };
        this.final = "";
        this.indent = 0;
    }

    /**
     * Maps a Delta {@link Type} to its C spelling. Primitive widths lower to the
     * `<stdint.h>` fixed-width types, `intsize`/`uintsize` to the pointer-width
     * `intptr_t`/`uintptr_t`, and user-defined types to a `delta__`-prefixed
     * struct name. An unresolved type lowers to `void`.
     */
    cType(t: Type): string {
        if (!t) {
            return "void";
        }
        // Preserve ABI spellings instead of lowering C types through Delta's
        // fixed-width primitive representation.
        switch (t.name.name) {
            case "c.int":
                return "int";
            case "c.size_t":
                return "size_t";
            case "c.ssize_t":
                return "ssize_t";
            case "c.void":
                return "void";
            case "c.const":
                return `const ${this.cType(t.typeParameters![0]!)}`;
            case "c.ptr":
                return `${this.cType(t.typeParameters![0]!)}*`;
        }
        if (t.reference) {
            const referent = { ...t, reference: false, edit: false };
            return `${t.edit ? "" : "const "}${this.cType(referent)}*`;
        }
        if (t.slice) {
            const elementType = this.sliceElementType(t);
            const name = this.sliceTypeName(elementType);
            this.sliceTypes.set(name, elementType);
            return name;
        }
        switch (t.value) {
            case TypeValue.Type_Int8:
                return "int8_t";
            case TypeValue.Type_Int16:
                return "int16_t";
            case TypeValue.Type_Int32:
                return "int32_t";
            case TypeValue.Type_Int64:
                return "int64_t";
            case TypeValue.Type_UInt8:
                return "uint8_t";
            case TypeValue.Type_UInt16:
                return "uint16_t";
            case TypeValue.Type_UInt32:
                return "uint32_t";
            case TypeValue.Type_UInt64:
                return "uint64_t";
            case TypeValue.Type_IntSize:
                return "intptr_t";
            case TypeValue.Type_UIntSize:
                return "uintptr_t";
            case TypeValue.Type_Char:
                return "char";
            case TypeValue.Type_Float32:
                return "float";
            case TypeValue.Type_Float64:
                return "double";
            case TypeValue.Type_Bool:
                return "bool";
            case TypeValue.Type_String:
                return "delta_string";
            case TypeValue.TypeCustom:
                return this.customTypeName(t);
            case TypeValue.TypeGeneric:
                return this.cType(this.activeConcreteTypes?.get(t.name.name)!);
            case TypeValue.TypeInvalid:
                return "void";
            case TypeValue.Type_Owned:
                return this.cType(t.typeParameters![0]!) + "*";
            default:
                return "void";
        }
    }

    /** Returns the C spelling for an immutable Delta binding. */
    private cConstBindingType(t: Type): string {
        return `const ${this.cType(t)}`;
    }

    private sliceElementType(t: Type): Type {
        const elementType: Type = {
            ...structuredClone(t),
            slice: false,
            arrayLengths: undefined,
            reference: false,
            edit: false,
        };
        if (elementType.value == TypeValue.TypeGeneric) {
            return structuredClone(
                this.activeConcreteTypes?.get(elementType.name.name) ?? elementType,
            );
        }
        return elementType;
    }

    private sliceTypeName(elementType: Type): string {
        return `delta_slice_${this.typeMangle(elementType)}`;
    }

    private emitSliceTypeDefinitions(): string {
        return [...this.sliceTypes.entries()]
            .map(
                ([name, elementType]) => `#ifndef ${name.toUpperCase()}_DEFINED
#define ${name.toUpperCase()}_DEFINED
typedef struct ${name} {
    ${this.cType(elementType)}* data;
    uintptr_t size;
} ${name};
#endif`,
            )
            .join("\n");
    }

    private emitSliceElementForwardDeclarations(): string {
        const declarations = new Set<string>();
        for (const elementType of this.sliceTypes.values()) {
            if (elementType.value != TypeValue.TypeCustom) continue;
            const declaration = this.ast.declarations.find(
                (candidate) =>
                    candidate.kind == "type_declaration" &&
                    candidate.name.name == elementType.name.name,
            ) as TypeDeclaration | undefined;
            if (
                declaration &&
                [TypeDeclKind.Struct, TypeDeclKind.Union].includes(declaration.declKind)
            ) {
                const name = this.customTypeName(elementType);
                declarations.add(`typedef struct ${name} ${name};`);
            }
        }
        return [...declarations].join("\n");
    }

    /** Lowers a custom type, appending concrete generic arguments when present. */
    private customTypeName(t: Type): string {
        const name = this.resolveTargetIfAlias(t);
        const baseName = this.moduleOptions ? this.moduleSymbol(name) : `delta__${name}`;
        const concreteTypes = this.concreteTypeArguments(t.typeParameters);
        if (!concreteTypes) {
            return baseName;
        }
        return `${baseName}__${concreteTypes.map((type) => this.typeMangle(type)).join("_")}`;
    }

    /** Resolves active generic bindings and rejects arguments that remain abstract. */
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

    /** Returns a project-wide C name without affecting runtime helper symbols. */
    private moduleSymbol(name: string): string {
        const moduleName =
            this.symbolModules.get(name) ??
            this.moduleOptions?.abiModuleName ??
            this.moduleOptions?.moduleName;
        const sourceName = this.symbolSourceNames.get(name) ?? name;
        return moduleName ? `delta__${moduleName}__${sourceName}` : sourceName;
    }

    private isExported(declaration: { exported?: boolean }): boolean {
        return !!declaration.exported || !!this.moduleOptions?.exportAll;
    }

    /** Resolves an identifier as a local binding or a module-level symbol. */
    private emitIdentifier(name: string): string {
        if (!this.isLocal(name) && this.externalLinkNames.has(name)) {
            return this.externalLinkNames.get(name)!;
        }
        if (!this.moduleOptions || this.isLocal(name) || !this.symbolModules.has(name)) {
            return name;
        }
        return this.moduleSymbol(name);
    }

    private isLocal(name: string): boolean {
        return this.localScopes.some((scope) => scope.has(name));
    }

    private declareLocal(name: string): void {
        this.localScopes.at(-1)?.add(name);
    }

    private typeDeclaration(type: Type): TypeDeclaration | undefined {
        return this.ast.declarations.find(
            (declaration): declaration is TypeDeclaration =>
                declaration.kind == "type_declaration" && declaration.name.name == type.name.name,
        );
    }

    private resolvedOwnershipType(type: Type, seen = new Set<string>()): Type {
        if (type.value != TypeValue.TypeCustom || seen.has(type.name.name)) return type;
        seen.add(type.name.name);
        const declaration = this.typeDeclaration(type);
        if (declaration?.declKind != TypeDeclKind.Alias) return type;
        return this.resolvedOwnershipType((declaration.declaration as TypeAlias).target, seen);
    }

    private structFields(type: Type): { name: { name: string }; type: Type }[] {
        if (type.fields?.length) return type.fields;
        const declaration = this.typeDeclaration(type);
        return declaration?.declKind == TypeDeclKind.Struct
            ? (declaration.declaration as StructDecl).fields
            : [];
    }

    private isExplicitUnique(type: Type): boolean {
        return this.typeDeclaration(type)?.unique === true;
    }

    private hasDispose(type: Type): boolean {
        return this.ast.declarations.some(
            (declaration) =>
                declaration.kind == "function_declaration" &&
                declaration.name.name == "dispose" &&
                declaration.receiver?.type.name.name == type.name.name,
        );
    }

    private needsDrop(type: Type, seen = new Set<string>()): boolean {
        if (type.reference) return false;
        type = this.resolvedOwnershipType(type);
        if (type.value == TypeValue.Type_Owned) return true;
        if (type.value != TypeValue.TypeCustom || seen.has(type.name.name)) return false;
        seen.add(type.name.name);
        if (this.hasDispose(type)) return true;
        return this.structFields(type).some((field) => this.needsDrop(field.type, new Set(seen)));
    }

    private dropHelperName(type: Type): string {
        return `${this.customTypeName(type)}_drop`;
    }

    private cloneHelperName(type: Type): string {
        return `${this.customTypeName(type)}_clone`;
    }

    private tryCloneHelperName(type: Type): string {
        return `${this.customTypeName(type)}_try_clone`;
    }

    private findOwnedBinding(name: string): OwnedBinding | undefined {
        for (let index = this.ownershipScopes.length - 1; index >= 0; index--) {
            const binding = this.ownershipScopes[index]!.find(
                (candidate) => candidate.sourceName == name,
            );
            if (binding) return binding;
        }
        return;
    }

    private registerOwnedBinding(
        sourceName: string,
        emittedName: string,
        type: Type,
        initiallyLive = true,
    ): string {
        if (!this.needsDrop(type)) return "";
        const liveFlag = `__delta_live_${this.ownershipCounter++}`;
        this.ownershipScopes.at(-1)?.push({ sourceName, emittedName, type, liveFlag });
        return `\nbool ${liveFlag} = ${initiallyLive ? "true" : "false"};`;
    }

    private emitDropValue(type: Type, place: string, indent = this.emitIndent()): string {
        type = this.resolvedOwnershipType(type);
        if (type.value == TypeValue.Type_Owned) {
            const inner = type.typeParameters![0]!;
            const nested = this.emitDropPointee(inner, place, indent + "    ");
            return `if (${place} != NULL) {\n${nested}${indent}    free(${place});\n${indent}    ${place} = NULL;\n${indent}}`;
        }
        if (type.value == TypeValue.TypeCustom && this.needsDrop(type)) {
            return `${this.dropHelperName(type)}(&${place});`;
        }
        return "";
    }

    private emitDropPointee(type: Type, pointer: string, indent: string): string {
        type = this.resolvedOwnershipType(type);
        if (type.value == TypeValue.TypeCustom && this.needsDrop(type)) {
            return `${indent}${this.dropHelperName(type)}(${pointer});\n`;
        }
        if (type.value == TypeValue.Type_Owned) {
            const inner = type.typeParameters![0]!;
            const nested = this.emitDropPointee(inner, `*${pointer}`, indent + "    ");
            return `${indent}if (*${pointer} != NULL) {\n${nested}${indent}    free(*${pointer});\n${indent}    *${pointer} = NULL;\n${indent}}\n`;
        }
        return "";
    }

    private emitOwnedCleanup(scopes: OwnedBinding[][] = this.ownershipScopes): string[] {
        return [...scopes]
            .reverse()
            .flatMap((scope) => [...scope].reverse())
            .map((binding) => {
                const drop = this.emitDropValue(binding.type, binding.emittedName);
                return `if (${binding.liveFlag}) { ${drop} }`;
            });
    }

    resolveTargetIfAlias(t: Type) {
        let name = t.name.name;
        const seen = new Set<string>();
        while (!seen.has(name)) {
            seen.add(name);
            const declaration = this.ast.declarations.find(
                (candidate): candidate is TypeDeclaration =>
                    candidate.kind == "type_declaration" &&
                    candidate.declKind == TypeDeclKind.Alias &&
                    candidate.name.name == name,
            );
            if (!declaration) break;
            name = (declaration.declaration as TypeAlias).target.name.name;
        }
        return name;
    }

    /** Emits the standard C headers every generated unit depends on. */
    emitHeaders() {
        if (this.moduleOptions) {
            return `#define ${this.implementationMacro()}\n#include "delta_${this.moduleOptions.moduleName}.h"\n#include<stdio.h>\n#include<stdint.h>\n#include<stdbool.h>\n#include <stdlib.h>\n#include <math.h>\n\n`;
        }
        return `#include<stdio.h>
#include<stdint.h>
#include<stdbool.h>
#include <stdlib.h>
#include <math.h>

${this.emitStringTypeDefinition()}
`;
    }

    /** Enables declarations needed only while compiling this module's C file. */
    private implementationMacro(): string {
        return `DELTA_${this.moduleOptions!.moduleName.toUpperCase()}_IMPLEMENTATION`;
    }

    /** Returns the indentation whitespace for the current nesting depth. */
    emitIndent(): string {
        return "    ".repeat(this.indent);
    }

    convertDeltaToCType(name: string): U<string> {
        switch (name) {
            case "int8":
                return "int8_t";
            case "int16":
                return "int16_t";
            case "int32":
                return "int32_t";
            case "int64":
                return "int64_t";
            case "uint8":
                return "uint8_t";
            case "uint16":
                return "uint16_t";
            case "uint32":
                return "uint32_t";
            case "uint64":
                return "uint64_t";
            case "intsize":
                return "intptr_t";
            case "uintsize":
                return "uintptr_t";
            case "char":
                return "char";
            case "float32":
                return "float";
            case "float64":
                return "double";
            case "bool":
                return "bool";
            case "string":
                return "delta_string";
        }
    }

    /** Emits a call expression as C: `callee(arg, …)`. */
    emitFunctionCallExpression(e: FunctionCallExpression): string {
        const method = e.callee.kind == "member_access_expression" ? e.callee : undefined;
        const callee = method
            ? this.moduleOptions
                ? `${this.moduleSymbol(e.resolvedReceiverType!)}_${method.member.name}`
                : `delta__${e.resolvedReceiverType}_${method.member.name}`
            : e.callee.kind == "identifier"
              ? (e.resolvedExternalLinkName ?? this.emitIdentifier(e.callee.name))
              : "";

        if (e.conversion) {
            const deltaFromType = e.conversion.fromType;
            const deltaToType = e.conversion.toType;

            const converterName = "delta_rt__convert_" + `${deltaFromType}_to_${deltaToType}`;
            if (!this.guardNames.has(converterName)) {
                this.guards.conversions.push({
                    fromType: e.conversion.fromType,
                    toType: e.conversion.toType,
                });
                this.guardNames.set(converterName, "");
            }

            const args = e.arguments.map((x) => this.emitExpression(x)).join(",");
            return `${converterName}(${args}, "${this.ast.fileName}:${e.position.line}")`;
        }

        const arguments_ = e.arguments.map((argument, index) =>
            this.emitCallArgument(argument, e.resolvedParameterTypes?.[index]),
        );
        if (method) {
            arguments_.unshift(this.emitCallArgument(method.receiver, e.resolvedReceiverParameter));
        }
        const args = arguments_.join(",");
        const specialization = e.genericTypes?.map((type) => this.typeMangle(type)).join("_");
        return `${specialization ? `${callee}__${specialization}` : callee}(${args})`;
    }

    private emitCallArgument(expression: Expression, parameter?: Type): string {
        const value = this.emitExpression(expression);
        if (
            this.isCConstVoidPointer(parameter) &&
            expression.expressionType?.value == TypeValue.Type_String
        ) {
            return `(const void *)(${value}).data`;
        }
        if (parameter?.arrayLengths?.length == 1 && expression.kind == "array_literal_expression") {
            const elementType: Type = {
                ...structuredClone(expression.expressionType ?? parameter),
                arrayLengths: undefined,
            };
            return `(${this.cType(elementType)}[${parameter.arrayLengths[0]}])${value}`;
        }
        if (
            expression.expressionType?.value == TypeValue.Type_Owned &&
            parameter?.value != TypeValue.Type_Owned &&
            !parameter?.reference
        ) {
            return `*${value}`;
        }
        if (!parameter?.reference || expression.expressionType?.reference) return value;
        if (expression.expressionType?.value == TypeValue.Type_Owned) return value;
        return `&${value}`;
    }

    private isCConstVoidPointer(type: Type | undefined): boolean {
        const pointee = type?.name.name == "c.ptr" ? type.typeParameters?.[0] : undefined;
        const inner = pointee?.name.name == "c.const" ? pointee.typeParameters?.[0] : undefined;
        return inner?.name.name == "c.void";
    }

    /** Emits a binary expression as C: `left <op> right`. */
    emitBinaryExpression(e: BinaryExpression): string {
        let left = this.emitExpression(e.left);
        let right = this.emitExpression(e.right);

        if (e.left.kind == "binary_expression") {
            left = "(" + left + ")";
        }

        if (e.right.kind == "binary_expression") {
            right = "(" + right + ")";
        }

        if (
            [string(TokenKind.Symbol_FSlash), string(TokenKind.Symbol_Percent)].includes(
                e.operator,
            ) &&
            !this.isFloatType(e.types?.rightT ?? "")
        ) {
            const converterName = `delta_rt__check_divisor_${e.types?.rightT}`;
            right = `${converterName}(${right}, "${this.ast.fileName}:${e.right.position.line}")`;
            if (!this.guardNames.has(converterName)) {
                this.guardNames.set(converterName, "");
                this.guards.divisions.push({
                    type: e.types?.rightT!,
                });
            }
        }

        if (
            [string(TokenKind.Symbol_ShiftLeft), string(TokenKind.Symbol_ShiftRight)].includes(
                e.operator,
            )
        ) {
            const converterName = `delta_rt__check_shift_${e.types?.rightT}`;
            right = `${converterName}(${right}, "${this.ast.fileName}:${e.right.position.line}")`;
            if (!this.guardNames.has(converterName)) {
                this.guardNames.set(converterName, "");
                this.guards.shifts.push({
                    type: e.types?.rightT!,
                });
            }
        }

        return `${left} ${e.operator} ${right}`;
    }

    /**
     * Emits a unary expression as C. `++`/`--` on an integer-typed identifier
     * gets routed through the overflow guard (`delta_rt__overflow_*`) instead
     * of a bare `<op>operand` — this applies wherever a unary expression is
     * emitted (a for-statement's modifier, a standalone `i++;` statement,
     * anywhere else `emitExpression` is reached), not just inside a for-loop's
     * step position.
     */
    emitUnaryExpression(e: UnaryExpression): string {
        const isIncr = e.operator == string(TokenKind.Symbol_Increment);
        const isDecr = e.operator == string(TokenKind.Symbol_Decrement);

        if (
            (isIncr || isDecr) &&
            e.operand.kind == "identifier" &&
            (this.isSignedIntType(e.type!) || this.isUnsignedIntType(e.type!))
        ) {
            const guardname = isIncr
                ? `delta_rt__overflow_${e.type!}`
                : `delta_rt__underflow_${e.type!}`;
            if (!this.guardNames.has(guardname)) {
                this.guardNames.set(guardname, "");
                if (isIncr) {
                    this.guards.overflows.push({ type: e.type! });
                } else {
                    this.guards.underflows.push({ type: e.type! });
                }
            }
            return `${guardname}(&${e.operand.name}, "${this.ast.fileName}:${e.operand.position.line}")`;
        }

        return `${e.operator}${this.emitExpression(e.operand)}`;
    }

    emitObjectLiteralExpression(
        e: ObjectLiteralExpression,
        allocationTracker?: AllocationTracker,
    ): string {
        const structName = this.concreteStructSignature(e) ?? this.cType(e.type);
        const members = e.elements
            .flatMap((x) => {
                if (x.kind == "spread_element") {
                    const source = this.emitExpression(x.source);
                    const fields = x.source.expressionType?.fields ?? [];
                    return fields.map(
                        (field) => `.${field.name.name} = ${source}.${field.name.name}`,
                    );
                }
                const f = x as FieldInit;

                if (f.field.value.kind == "new_expression") {
                    const f = x as FieldInit;
                    return [
                        `.${f.field.name.name} = ${this.emitNewExpression(f.field.value, f.field.name.name, allocationTracker!)}`,
                    ];
                }

                const fieldType = e.type.fields?.find(
                    (field) => field.name.name == f.field.name.name,
                )?.type;
                if (
                    fieldType?.arrayLengths?.length == 1 &&
                    f.field.value.kind != "array_literal_expression"
                ) {
                    const source = this.emitExpression(f.field.value);
                    const elements = Array.from(
                        { length: fieldType.arrayLengths[0]! },
                        (_, index) => `${source}[${index}]`,
                    );
                    return [`.${f.field.name.name} = {${elements.join(", ")}}`];
                }

                return [`.${f.field.name.name} = ${this.emitExpression(f.field.value)}`];
            })
            .join(", ");
        return `(${structName}){${members}}`;
    }

    /** Emits every concrete specialization recorded for a generic struct. */
    emitConcreteStructDeclaration(s: StructDecl): string {
        return this.structSpecializations(s)
            .map((concreteTypes) => this.emitConcreteStructDefinition(s, concreteTypes))
            .join("\n");
    }

    /** Emits one C typedef for a single set of generic struct bindings. */
    private emitConcreteStructDefinition(s: StructDecl, concreteTypes: Map<string, Type>): string {
        const sig = this.concreteStructSignatureFor(s.name.name, s.typeParameters, concreteTypes);
        if (!sig) {
            return "";
        }

        const resolvedFields = s.fields.map((field) => ({
            name: field.name.name,
            type: this.substituteConcreteType(field.type, concreteTypes),
        }));
        if (resolvedFields.some((field) => !field.type)) {
            return "";
        }

        this.indent++;
        const members = resolvedFields
            .map((field) => {
                const fieldType = field.type!;
                const dimensions =
                    fieldType.arrayLengths?.map((length) => `[${length}]`).join("") ?? "";
                return this.emitIndent() + `${this.cType(fieldType)} ${field.name}${dimensions};`;
            })
            .join("\n");
        this.indent--;

        return `typedef struct ${sig}{\n${members}\n} ${sig};`;
    }

    private substituteConcreteType(type: Type, bindings: Map<string, Type>): Type | undefined {
        if (type.value == TypeValue.TypeGeneric) {
            const binding = bindings.get(type.name.name);
            if (!binding) return;
            const resolved = structuredClone(binding);
            if (type.arrayLengths?.length) {
                resolved.arrayLengths = [...type.arrayLengths, ...(resolved.arrayLengths ?? [])];
            }
            if (type.slice) resolved.slice = true;
            resolved.reference = type.reference || resolved.reference;
            resolved.edit = type.edit || resolved.edit;
            return resolved;
        }
        const resolved = structuredClone(type);
        resolved.typeParameters = type.typeParameters?.map(
            (parameter) => this.substituteConcreteType(parameter, bindings) ?? parameter,
        );
        return resolved;
    }

    /** Returns all concrete type combinations recorded for a generic struct. */
    private structSpecializations(s: StructDecl): Map<string, Type>[] {
        const typeParameters = s.typeParameters ?? [];
        if (!typeParameters.length) {
            return [];
        }

        let combinations: Map<string, Type>[] = [new Map()];
        for (const typeParameter of typeParameters) {
            const concreteTypes = s.concreteTypesMap?.get(typeParameter.name.name) ?? [];
            if (!concreteTypes.length) {
                return [];
            }

            combinations = combinations.flatMap((bindings) =>
                concreteTypes.map((concreteType) => {
                    const next = new Map(bindings);
                    next.set(typeParameter.name.name, concreteType);
                    return next;
                }),
            );
        }
        return combinations;
    }

    /** Returns the concrete C symbol for a generic object-literal struct. */
    private concreteStructSignature(e: ObjectLiteralExpression): U<string> {
        if (!this.concreteTypeArguments(e.type.typeParameters)) {
            return;
        }
        return this.customTypeName(e.type);
    }

    /** Builds a specialization name using declaration-order type parameters. */
    private concreteStructSignatureFor(
        structName: string,
        typeParameters: Type[] | undefined,
        concreteTypes: Map<string, Type>,
    ): U<string> {
        const orderedTypes = typeParameters?.length
            ? typeParameters.map((typeParameter) => concreteTypes.get(typeParameter.name.name))
            : [...concreteTypes.values()];
        if (orderedTypes.some((type) => !type)) {
            return;
        }

        const baseName = this.moduleOptions
            ? this.moduleSymbol(structName)
            : `delta__${structName}`;
        return `${baseName}__${orderedTypes.map((type) => this.typeMangle(type!)).join("_")}`;
    }

    emitMemberAccessExpression(e: MemberAccessExpression): string {
        if (e.namespaceReference) {
            return this.emitIdentifier(e.namespaceReference);
        }
        if (e.enumMember) {
            const receiver = this.emitExpression(e.receiver as Expression);
            const member = e.member.name;
            return this.moduleOptions ? `${receiver}_${member}` : `delta__${receiver}_${member}`;
        }
        if (e.receiverType.arrayLengths?.length && e.member.name == "length") {
            return `${e.receiverType.arrayLengths[0]}`;
        }
        const receiver = this.emitExpression(e.receiver as Expression);
        const member =
            e.receiverType.slice && e.member.name == "length"
                ? "size"
                : this.emitExpression(e.member as Expression);
        const accessOperator =
            e.receiverType.value == TypeValue.Type_Owned || e.receiverType.reference ? "->" : ".";
        return `${receiver}${accessOperator}${member}`;
    }

    emitArrayLiteralExpression(e: ArrayLiteralExpression): string {
        return `{${e.elements.map((x) => this.emitExpression(x)).join(", ")}}`;
    }

    emitIndexExpression(e: IndexExpression): string {
        if (e.receiver.expressionType?.slice) {
            const receiver = this.emitExpression(e.receiver);
            const index = this.emitExpression(e.index);
            const access = e.receiver.expressionType.reference ? "->" : ".";
            const checked = `delta_rt__check_slice_index(${receiver}${access}size, ${index}, "${this.ast.fileName}:${(e as Expression).position.line}")`;
            return `${receiver}${access}data[${checked}]`;
        }
        return `${this.emitExpression(e.receiver)}[${this.emitExpression(e.index)}]`;
    }

    emitNewExpression(
        e: Expression,
        fieldName: string,
        allocationTracker?: AllocationTracker,
    ): string {
        if (fieldName) allocationTracker?.addAllocation(fieldName);
        const newExpr = e as NewExpression;
        const pointee = e.expressionType?.typeParameters?.[0] ?? newExpr.expression.expressionType!;
        this.newTypes.set(this.typeMangle(pointee), pointee);
        return `${this.newHelperName(pointee)}(${this.emitExpression(newExpr.expression, allocationTracker)}, "${this.ast.fileName}:${e.position.line}")`;
    }

    private newHelperName(type: Type): string {
        return `delta_rt__new_${this.typeMangle(type)}`;
    }

    private emitNewHelpers(): string {
        return [...this.newTypes.values()]
            .map((type) => {
                const cType = this.cType(type);
                return `static ${cType}* ${this.newHelperName(type)}(${cType} value, const char *loc) {
    ${cType}* allocation = (${cType}*)malloc(sizeof(${cType}));
    if (!allocation) delta_panic("allocation failed", loc);
    *allocation = value;
    return allocation;
}`;
            })
            .join("\n\n");
    }

    private emitCloneValue(
        type: Type,
        source: string,
        loc: string,
        sourceIsPointer = false,
    ): string {
        type = this.resolvedOwnershipType(type);
        if (type.value == TypeValue.Type_Owned) {
            const inner = type.typeParameters![0]!;
            this.newTypes.set(this.typeMangle(inner), inner);
            return `${this.newHelperName(inner)}(${this.emitCloneValue(inner, `*(${source})`, loc)}, ${loc})`;
        }
        if (type.value == TypeValue.TypeCustom && this.needsDrop(type)) {
            this.cloneTypes.set(this.typeMangle(type), type);
            return `${this.cloneHelperName(type)}(${sourceIsPointer ? source : `&(${source})`}, ${loc})`;
        }
        return source;
    }

    private emitCloneExpression(
        expression: Extract<Expression, { kind: "clone_expression" }>,
        allocationTracker?: AllocationTracker,
    ): string {
        const sourceType = expression.source.expressionType ?? expression.expressionType!;
        const source = this.emitExpression(expression.source, allocationTracker);
        return this.emitCloneValue(
            { ...sourceType, reference: false, edit: false },
            source,
            `"${this.ast.fileName}:${expression.position.line}"`,
            !!sourceType.reference,
        );
    }

    private emitCloneHelpers(): string {
        const emitted = new Set<string>();
        const chunks: string[] = [];
        while (true) {
            const pending = [...this.cloneTypes.values()].filter(
                (type) => !emitted.has(this.typeMangle(type)),
            );
            if (!pending.length) break;
            for (const type of pending) {
                emitted.add(this.typeMangle(type));
                const cType = this.cType(type);
                const fields = this.structFields(type)
                    .map((field) =>
                        this.emitTryCloneField(
                            field.type,
                            `source->${field.name.name}`,
                            `out->${field.name.name}`,
                        ),
                    )
                    .filter(Boolean)
                    .join("\n    ");
                chunks.push(`static bool ${this.tryCloneHelperName(type)}(const ${cType}* source, ${cType}* out) {
    *out = (${cType}){0};
    ${fields}
    return true;
fail:
    ${this.dropHelperName(type)}(out);
    return false;
}

static ${cType} ${this.cloneHelperName(type)}(const ${cType}* source, const char *loc) {
    ${cType} out;
    if (!${this.tryCloneHelperName(type)}(source, &out)) delta_panic("allocation failed", loc);
    return out;
}`);
            }
        }
        return chunks.join("\n\n");
    }

    private emitTryCloneField(type: Type, source: string, target: string): string {
        type = this.resolvedOwnershipType(type);
        if (type.value == TypeValue.Type_Owned) {
            const inner = this.resolvedOwnershipType(type.typeParameters![0]!);
            const cInner = this.cType(inner);
            return `${target} = (${cInner}*)malloc(sizeof(${cInner}));
    if (!${target}) goto fail;
    *${target} = (${cInner}){0};
    ${this.emitTryCloneInto(inner, `*(${source})`, `*${target}`)}`;
        }
        return this.emitTryCloneInto(type, source, target);
    }

    private emitTryCloneInto(type: Type, source: string, target: string): string {
        type = this.resolvedOwnershipType(type);
        if (type.value == TypeValue.Type_Owned) {
            const inner = this.resolvedOwnershipType(type.typeParameters![0]!);
            const cInner = this.cType(inner);
            return `${target} = (${cInner}*)malloc(sizeof(${cInner}));
    if (!${target}) goto fail;
    *${target} = (${cInner}){0};
    ${this.emitTryCloneInto(inner, `*(${source})`, `*${target}`)}`;
        }
        if (type.value == TypeValue.TypeCustom && this.needsDrop(type)) {
            this.cloneTypes.set(this.typeMangle(type), type);
            return `if (!${this.tryCloneHelperName(type)}(&${source}, &${target})) goto fail;`;
        }
        return `${target} = ${source};`;
    }

    private emitCloneHelperPrototypes(): string {
        return [...this.cloneTypes.values()]
            .map((type) => {
                const cType = this.cType(type);
                return `static bool ${this.tryCloneHelperName(type)}(const ${cType}* source, ${cType}* out);\nstatic ${cType} ${this.cloneHelperName(type)}(const ${cType}* source, const char *loc);`;
            })
            .join("\n");
    }

    private droppableRecordTypes(): Type[] {
        return this.ast.declarations
            .filter(
                (declaration): declaration is TypeDeclaration =>
                    declaration.kind == "type_declaration" &&
                    declaration.declKind == TypeDeclKind.Struct &&
                    !(declaration.declaration as StructDecl).typeParameters?.length,
            )
            .map((declaration) => ({
                kind: "type" as const,
                name: declaration.name,
                value: TypeValue.TypeCustom,
                fields: (declaration.declaration as StructDecl).fields,
            }))
            .filter((type) => this.needsDrop(type));
    }

    private emitDropHelperPrototypes(): string {
        return this.droppableRecordTypes()
            .map((type) => `static void ${this.dropHelperName(type)}(${this.cType(type)}* value);`)
            .join("\n");
    }

    private emitDropHelpers(): string {
        return this.droppableRecordTypes()
            .map((type) => {
                const lines: string[] = [];
                if (this.hasDispose(type)) {
                    const disposeName = this.moduleOptions
                        ? `${this.moduleSymbol(type.name.name)}_dispose`
                        : `delta__${type.name.name}_dispose`;
                    lines.push(`${disposeName}(value);`);
                }
                for (const field of [...this.structFields(type)].reverse()) {
                    if (!this.needsDrop(field.type)) continue;
                    lines.push(this.emitDropValue(field.type, `value->${field.name.name}`, "    "));
                }
                return `static void ${this.dropHelperName(type)}(${this.cType(type)}* value) {
${lines.map((line) => `    ${line}`).join("\n")}
}`;
            })
            .join("\n\n");
    }

    /** Emits a single expression as its C text. */
    emitExpression(e?: Expression, allocationTracker?: AllocationTracker): string {
        if (!e) {
            return "";
        }
        if (e.implicitDereference) {
            const depth = e.implicitDereference;
            e.implicitDereference = undefined;
            const value = this.emitExpression(e, allocationTracker);
            e.implicitDereference = depth;
            return `(${"*".repeat(depth)}(${value}))`;
        }
        if (e.sliceConversion) {
            const conversion = e.sliceConversion;
            e.sliceConversion = undefined;
            const value = this.emitExpression(e, allocationTracker);
            e.sliceConversion = conversion;
            const sliceType = this.cType(conversion.targetType);
            const elementType = this.sliceElementType(conversion.targetType);
            const elementCType = this.cType(elementType);
            const size = conversion.sourceType.arrayLengths?.[0] ?? 0;
            const data =
                e.kind == "array_literal_expression"
                    ? e.elements.length
                        ? `(${elementCType}[]){${e.elements.map((element) => this.emitExpression(element, allocationTracker)).join(", ")}}`
                        : `(${elementCType}*)0`
                    : `(${elementCType}*)(${value})`;
            return `(${sliceType}){ .data = ${data}, .size = ${size} }`;
        }
        switch (e.kind) {
            case "integer_literal":
                if (e.value.includes("_")) {
                    e.value = e.value.replaceAll("_", "");
                }
                return e.value;
            case "float_literal":
                return e.value;
            case "char_literal":
                return e.value;
            case "boolean_literal":
                return e.value;
            case "identifier":
                if (e.ownershipTransfer) {
                    const binding = this.findOwnedBinding(e.name);
                    const source = this.emitIdentifier(e.name);
                    return binding ? `(${binding.liveFlag} = false, ${source})` : source;
                }
                return this.emitIdentifier(e.name);
            case "function_call_expression":
                return this.emitFunctionCallExpression(e as FunctionCallExpression);
            case "binary_expression":
                return this.emitBinaryExpression(e as BinaryExpression);
            case "unary_expression":
                return this.emitUnaryExpression(e as UnaryExpression);
            case "object_literal":
                return this.emitObjectLiteralExpression(
                    e as ObjectLiteralExpression,
                    allocationTracker!,
                );
            case "member_access_expression":
                return this.emitMemberAccessExpression(e as MemberAccessExpression);
            case "array_literal_expression":
                return this.emitArrayLiteralExpression(e as ArrayLiteralExpression);
            case "index_expression":
                return this.emitIndexExpression(e as IndexExpression);
            case "new_expression":
                return this.emitNewExpression(e, "", allocationTracker);
            case "move_expression":
                if (e.source.kind == "identifier") {
                    const binding = this.findOwnedBinding(e.source.name);
                    const source = this.emitExpression(e.source, allocationTracker);
                    return binding ? `(${binding.liveFlag} = false, ${source})` : source;
                }
                return this.emitExpression(e.source, allocationTracker);
            case "clone_expression":
                return this.emitCloneExpression(e, allocationTracker);
            case "string_literal":
                return this.emitStringLiteral(e);
            default:
                return "";
        }
    }

    /** Registers one mutable, fixed-size static UTF-8 block per literal occurrence. */
    private emitStringLiteral(literal: StringLiteral): string {
        const existing = this.stringLiteralNames.get(literal);
        if (existing) {
            return `(delta_string){ .data = ${existing.name}, .length = ${existing.length} }`;
        }

        const name = `__delta_string_${this.stringLiteralBlocks.length}`;
        const bytes = [...new TextEncoder().encode(this.decodeStringLiteral(literal.value))];
        this.stringLiteralNames.set(literal, { name, length: bytes.length });
        this.stringLiteralBlocks.push({ name, bytes });
        return `(delta_string){ .data = ${name}, .length = ${bytes.length} }`;
    }

    /** Decodes the escape subset accepted by ordinary Delta string literals. */
    private decodeStringLiteral(value: string): string {
        const body = value.slice(1, -1);
        let decoded = "";
        for (let i = 0; i < body.length; i++) {
            const current = body[i]!;
            if (current != "\\") {
                const codePoint = body.codePointAt(i)!;
                decoded += String.fromCodePoint(codePoint);
                if (codePoint > 0xffff) i++;
                continue;
            }

            const escaped = body[++i];
            switch (escaped) {
                case "n":
                    decoded += "\n";
                    break;
                case "r":
                    decoded += "\r";
                    break;
                case "t":
                    decoded += "\t";
                    break;
                case "0":
                    decoded += "\0";
                    break;
                case "\\":
                    decoded += "\\";
                    break;
                case '"':
                    decoded += '"';
                    break;
                case "'":
                    decoded += "'";
                    break;
                case "\n":
                    break;
                case "u": {
                    if (body[i + 1] != "{") {
                        decoded += "u";
                        break;
                    }
                    const close = body.indexOf("}", i + 2);
                    if (close < 0) {
                        decoded += "u";
                        break;
                    }
                    const codePoint = Number.parseInt(body.slice(i + 2, close), 16);
                    const validScalar =
                        Number.isInteger(codePoint) &&
                        codePoint <= 0x10ffff &&
                        !(codePoint >= 0xd800 && codePoint <= 0xdfff);
                    decoded += validScalar ? String.fromCodePoint(codePoint) : "\ufffd";
                    i = close;
                    break;
                }
                case "x": {
                    const hex = body.slice(i + 1, i + 3);
                    if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                        decoded += String.fromCharCode(Number.parseInt(hex, 16));
                        i += 2;
                    } else {
                        decoded += "x";
                    }
                    break;
                }
                default:
                    decoded += escaped ?? "\\";
            }
        }
        return decoded;
    }

    private emitStringLiteralBlocks(): string {
        return this.stringLiteralBlocks
            .map(({ name, bytes }) => {
                const contents = [...bytes, 0].join(", ");
                return `static char ${name}[${bytes.length + 1}] = { ${contents} };`;
            })
            .join("\n");
    }

    private emitStringTypeDefinition(): string {
        return `#ifndef DELTA_STRING_DEFINED
#define DELTA_STRING_DEFINED
typedef struct {
    char* data;
    uintptr_t length;
} delta_string;
#endif
`;
    }

    private resultStructName(successType?: Type): string {
        return `delta_result_${successType && successType.value != TypeValue.TypeInvalid ? this.typeMangle(successType) : "void"}`;
    }

    private initializeErrorTags(): void {
        this.errorTags.clear();
        const names: string[] = [];
        for (const declaration of this.ast.declarations) {
            if (declaration.kind != "function_declaration") continue;
            for (const errorType of declaration.errorTypes) {
                if (!names.includes(errorType.name.name)) names.push(errorType.name.name);
            }
        }
        names.forEach((name, index) => this.errorTags.set(name, index + 1));
    }

    private errorTag(name?: string): number {
        if (!name) return 1;
        if (!this.errorTags.has(name)) this.errorTags.set(name, this.errorTags.size + 1);
        return this.errorTags.get(name)!;
    }

    private collectResultTypes(): (Type | undefined)[] {
        const found = new Map<string, Type | undefined>();
        const containsGeneric = (type?: Type): boolean =>
            !!type &&
            (type.value == TypeValue.TypeGeneric || !!type.typeParameters?.some(containsGeneric));
        const resolve = (type: Type | undefined, bindings: Map<string, Type>) =>
            type ? (this.substituteConcreteType(type, bindings) ?? type) : undefined;
        const add = (type?: Type) => {
            if (containsGeneric(type)) return;
            found.set(this.resultStructName(type), type);
        };
        const walkBlock = (block: BlockStatement, bindings: Map<string, Type>) =>
            block.statements.forEach((statement) => walkStatement(statement, bindings));
        const walkStatement = (statement: Statement, bindings: Map<string, Type>): void => {
            if (
                statement.kind == "variable_declaration_statement" ||
                statement.kind == "assignment_statement" ||
                statement.kind == "expression_statement"
            ) {
                if (statement.asResult) add(resolve(statement.asResult.successType, bindings));
            }
            if (statement.kind == "check_block_statement") walkBlock(statement.body, bindings);
            if (statement.kind == "if_statement") {
                walkBlock(statement.thenBlock, bindings);
                if (statement.elseBlock) walkBlock(statement.elseBlock, bindings);
            }
            if (statement.kind == "for_statement" || statement.kind == "while_statement") {
                walkBlock(statement.body, bindings);
            }
        };
        for (const declaration of this.ast.declarations) {
            if (declaration.kind != "function_declaration") continue;
            const specializations = declaration.typeParameters?.length
                ? this.functionSpecializations(declaration)
                : [new Map<string, Type>()];
            for (const bindings of specializations) {
                if (declaration.errorTypes.length) {
                    add(resolve(declaration.returnTypes[0], bindings));
                }
                walkBlock(declaration.body, bindings);
            }
        }
        return [...found.values()];
    }

    private emitResultStructs(): string {
        return this.collectResultTypes()
            .map((successType) => {
                const name = this.resultStructName(successType);
                const value =
                    successType && successType.value != TypeValue.TypeInvalid
                        ? `\n    ${this.cType(successType)} value;`
                        : "";
                const guard = `${name.toUpperCase()}_DEFINED`;
                return `#ifndef ${guard}\n#define ${guard}\ntypedef struct ${name} {\n    uint8_t tag;${value}\n} ${name};\n#endif`;
            })
            .join("\n");
    }

    private emitAsResult(binding: AsResultBinding, expression: Expression, commit: string): string {
        const temp = `__delta_result_${this.resultCounter++}`;
        const resultType = this.resultStructName(binding.successType);
        const setup = this.emitFallibleSetup(temp, resultType, binding, expression);
        this.pendingResults.set(binding.resultName.name, {
            temp,
            resultType,
            commit,
            binding,
        });
        return setup;
    }

    private emitFallibleSetup(
        temp: string,
        resultType: string,
        binding: AsResultBinding,
        expression: Expression,
    ): string {
        if (expression.kind == "function_call_expression" && !expression.conversion) {
            return `${resultType} ${temp} = ${this.emitExpression(expression)};`;
        }

        const successType = binding.successType;
        const cType = successType ? this.cType(successType) : "int32_t";
        const tag = this.errorTag(binding.errorTypes?.[0]?.name.name);
        const indent = this.emitIndent();
        const fail = `${temp} = (${resultType}){ .tag = ${tag} };`;

        if (expression.kind == "new_expression") {
            const pointee = expression.expression.expressionType!;
            const cPointee = this.cType(pointee);
            const staging = `__delta_staging_${this.resultCounter++}`;
            const value = `__delta_value_${this.resultCounter++}`;
            const disposeStaging = this.needsDrop(pointee)
                ? ` { ${this.emitDropValue(pointee, staging, "")} ${fail} }`
                : ` ${fail}`;
            return `${resultType} ${temp};\n${indent}${cPointee} ${staging} = ${this.emitExpression(expression.expression)};\n${indent}${cPointee}* ${value} = (${cPointee}*)malloc(sizeof(${cPointee}));\n${indent}if (!${value})${disposeStaging}\n${indent}else { *${value} = ${staging}; ${temp} = (${resultType}){ .tag = 0, .value = ${value} }; }`;
        }

        if (expression.kind == "clone_expression") {
            const originalType = expression.source.expressionType ?? expression.expressionType!;
            const sourceType = { ...originalType, reference: false, edit: false };
            if (sourceType.value == TypeValue.TypeCustom && this.needsDrop(sourceType)) {
                this.cloneTypes.set(this.typeMangle(sourceType), sourceType);
                const source = this.emitExpression(expression.source);
                const sourcePointer = originalType.reference ? source : `&(${source})`;
                const value = `__delta_value_${this.resultCounter++}`;
                return `${resultType} ${temp};\n${indent}${cType} ${value};\n${indent}if (!${this.tryCloneHelperName(sourceType)}(${sourcePointer}, &${value})) ${fail}\n${indent}else ${temp} = (${resultType}){ .tag = 0, .value = ${value} };`;
            }
        }

        if (expression.kind == "binary_expression") {
            const left = this.emitExpression(expression.left);
            const right = this.emitExpression(expression.right);
            const value = `__delta_value_${this.resultCounter++}`;
            const op = expression.operator;
            if (["+", "-", "*"].includes(op)) {
                const builtin = op == "+" ? "add" : op == "-" ? "sub" : "mul";
                return `${resultType} ${temp};\n${indent}${cType} ${value};\n${indent}if (__builtin_${builtin}_overflow(${left}, ${right}, &${value})) ${fail}\n${indent}else ${temp} = (${resultType}){ .tag = 0, .value = ${value} };`;
            }
            if (["/", "%"].includes(op)) {
                return `${resultType} ${temp};\n${indent}if ((${right}) == 0) ${fail}\n${indent}else ${temp} = (${resultType}){ .tag = 0, .value = (${left}) ${op} (${right}) };`;
            }
            if (["<<", ">>"].includes(op)) {
                const bits = this.integerBits(successType?.name.name ?? "int32");
                return `${resultType} ${temp};\n${indent}if ((${right}) < 0 || (${right}) >= ${bits}) ${fail}\n${indent}else ${temp} = (${resultType}){ .tag = 0, .value = (${left}) ${op} (${right}) };`;
            }
        }

        if (expression.kind == "function_call_expression" && expression.conversion) {
            const source = this.emitExpression(expression.arguments[0]);
            const check = this.converterRangeCheck(
                expression.conversion.fromType,
                expression.conversion.toType,
            ).replaceAll(/\bvalue\b/g, `(${source})`);
            return `${resultType} ${temp};\n${indent}if (${check}) ${fail}\n${indent}else ${temp} = (${resultType}){ .tag = 0, .value = (${cType})(${source}) };`;
        }

        const emitted = this.emitExpression(expression);
        return `${resultType} ${temp} = (${resultType}){ .tag = 0${binding.successType?.value != TypeValue.TypeInvalid ? `, .value = ${emitted}` : ""} };`;
    }

    private integerBits(name: string): number {
        const match = name.match(/(8|16|32|64)$/);
        return match ? Number(match[1]) : 32;
    }

    private emitCheckStatement(statement: CheckBlockStatement): string {
        const pending = this.pendingResults.get(statement.resultName.name);
        if (!pending) return "";
        const body = this.emitBlockStatement(statement.body);
        const condition = statement.errorType
            ? `${pending.temp}.tag == ${this.errorTag(statement.errorType.name.name)}`
            : `${pending.temp}.tag != 0`;
        if (!statement.dischargesResult) return `if (${condition}) ${body}`;
        this.pendingResults.delete(statement.resultName.name);
        return `if (${condition}) ${body}${pending.commit}`;
    }

    private emitForwardStatement(statement: ForwardStatement): string {
        const pending = this.pendingResults.get(statement.resultName.name);
        if (!pending) return "";
        const callerResult = this.resultStructName(this.activeFunction?.returnTypes[0]);
        this.pendingResults.delete(statement.resultName.name);
        const cleanup = this.emitOwnedCleanup();
        const onError = [
            ...cleanup,
            `return (${callerResult}){ .tag = ${pending.temp}.tag };`,
        ].join(`\n${this.emitIndent()}    `);
        return `if (${pending.temp}.tag != 0) {\n${this.emitIndent()}    ${onError}\n${this.emitIndent()}}\n${this.emitIndent()}${pending.commit}`;
    }

    private emitReturnStatement(statement: ReturnStatement): string {
        const expression = this.emitExpression(statement.expression);
        const cleanup = this.emitOwnedCleanup();
        if (!this.activeFunction?.errorTypes.length) {
            if (!statement.expression) {
                return cleanup.length
                    ? `${cleanup.join(`\n${this.emitIndent()}`)}\n${this.emitIndent()}return;`
                    : "return;";
            }
            if (!cleanup.length) return `return ${expression};`;

            const returnType = statement.expression.implicitDereference
                ? (this.activeFunction?.returnTypes[0] ?? statement.expression.expressionType)
                : (statement.expression.expressionType ?? this.activeFunction?.returnTypes[0]);
            const temporary = `__delta_return_${this.resultCounter++}`;
            const transfer =
                statement.expression.kind == "identifier" &&
                !statement.expression.implicitDereference
                    ? this.findOwnedBinding(statement.expression.name)
                    : undefined;
            const deactivate = transfer
                ? `\n${this.emitIndent()}${transfer.liveFlag} = false;`
                : "";
            return `${this.cType(returnType!)} ${temporary} = ${expression};${deactivate}\n${this.emitIndent()}${cleanup.join(`\n${this.emitIndent()}`)}\n${this.emitIndent()}return ${temporary};`;
        }
        const resultType = this.resultStructName(this.activeFunction.returnTypes[0]);
        const result = statement.expression
            ? `(${resultType}){ .tag = 0, .value = ${expression} }`
            : `(${resultType}){ .tag = 0 }`;
        if (!cleanup.length) return `return ${result};`;
        const temporary = `__delta_return_${this.resultCounter++}`;
        return `${resultType} ${temporary} = ${result};\n${this.emitIndent()}${cleanup.join(`\n${this.emitIndent()}`)}\n${this.emitIndent()}return ${temporary};`;
    }

    private emitReturnErrorStatement(statement: ReturnErrorStatement): string {
        const resultType = this.resultStructName(this.activeFunction?.returnTypes[0]);
        const tag = this.errorTag(statement.resolvedErrorType?.name.name);
        const cleanup = this.emitOwnedCleanup();
        return `${cleanup.length ? `${cleanup.join(`\n${this.emitIndent()}`)}\n${this.emitIndent()}` : ""}return (${resultType}){ .tag = ${tag} };`;
    }

    /**
     * Emits a variable declaration as C. An initializer-less declaration emits
     * just `type name;`; a file-scope declaration is qualified `static const`.
     */
    emitVariableDeclarationStatement(
        e: VariableDeclarationStatement,
        allocationTracker?: AllocationTracker,
    ): string {
        let name = e.file && this.moduleOptions ? this.moduleSymbol(e.name.name) : e.name.name;
        let type = this.cType(e.type);
        let value = this.emitExpression(e.value, allocationTracker);

        if (e.asResult && e.value) {
            if (!e.file) this.declareLocal(e.name.name);
            const live = !e.file ? this.registerOwnedBinding(e.name.name, name, e.type, false) : "";
            const binding = this.findOwnedBinding(e.name.name);
            const commit = `${name} = __RESULT__.value;${binding ? `\n${this.emitIndent()}${binding.liveFlag} = true;` : ""}`;
            return `${type} ${name};${live}\n${this.emitIndent()}${this.emitAsResult(e.asResult, e.value, commit)}`;
        }

        if (e.value?.kind == "object_literal") {
            type = this.concreteStructSignature(e.value) ?? type;
        }

        if (e.value?.kind == "new_expression") allocationTracker?.addAllocation(name);

        if (e.value?.kind == "object_literal" && e.type.kind == "union") {
            const valueType = e.value.type.name.name;
            const unionType = this.cType(e.type);
            value = `${unionType} ${name} = (${unionType}){
        .tag = ${unionType}_Tag_${valueType},
        .payload = {.${valueType} = ${value}}
    };
    (void)${name};`;
            return value;
        }
        //add the array specifier in the declaration
        if (e.type.arrayLengths?.length) {
            name += e.type.arrayLengths.map((length) => `[${length}]`).join("");
        }

        if (!value) {
            return type + " " + name + ";";
        }

        if (e.file) {
            type = `${this.moduleOptions && this.isExported(e) ? "" : "static "}${this.cConstBindingType(e.type)}`;
        } else {
            this.declareLocal(e.name.name);
        }

        const live = !e.file ? this.registerOwnedBinding(e.name.name, name, e.type) : "";
        return type + " " + name + " = " + value + ";" + live;
    }

    /** Emits an assignment statement as C: `root = target;`. */
    emitAssignmentStatement(e: AssignmentStatement) {
        const root = this.emitExpression(e.root);
        const target = this.emitExpression(e.target);
        if (e.operator) return `${root} ${e.operator} ${target};`;

        if (e.asResult) {
            if (e.root.kind == "identifier" && !e.root.implicitDereference) {
                const binding = this.findOwnedBinding(e.root.name);
                if (binding) {
                    const drop = this.emitDropValue(binding.type, root);
                    const commit = `if (${binding.liveFlag}) { ${drop} }\n${this.emitIndent()}${root} = __RESULT__.value;\n${this.emitIndent()}${binding.liveFlag} = true;`;
                    return this.emitAsResult(e.asResult, e.target, commit);
                }
            }
            const rootType = e.root.expressionType;
            if (rootType && !e.root.implicitDereference && this.needsDrop(rootType)) {
                const drop = this.emitDropValue(rootType, root);
                return this.emitAsResult(
                    e.asResult,
                    e.target,
                    `${drop}\n${this.emitIndent()}${root} = __RESULT__.value;`,
                );
            }
            return this.emitAsResult(e.asResult, e.target, `${root} = __RESULT__.value;`);
        }

        if (e.root.kind == "identifier" && !e.root.implicitDereference) {
            const binding = this.findOwnedBinding(e.root.name);
            if (binding) {
                const temporary = `__delta_replacement_${this.replacementCounter++}`;
                const drop = this.emitDropValue(binding.type, root);
                return `${this.cType(binding.type)} ${temporary} = ${target};\n${this.emitIndent()}if (${binding.liveFlag}) { ${drop} }\n${this.emitIndent()}${root} = ${temporary};\n${this.emitIndent()}${binding.liveFlag} = true;`;
            }
        }

        const rootType = e.root.expressionType;
        if (rootType && !e.root.implicitDereference && this.needsDrop(rootType)) {
            const temporary = `__delta_replacement_${this.replacementCounter++}`;
            const drop = this.emitDropValue(rootType, root);
            return `${this.cType(rootType)} ${temporary} = ${target};\n${this.emitIndent()}${drop}\n${this.emitIndent()}${root} = ${temporary};`;
        }

        return `${root} = ${target};`;
    }

    emitForStatement(e: ForStatement, allocationTracker: AllocationTracker): string {
        const decl = e.declaration ? this.emitStatement(e.declaration, allocationTracker) : "; ";
        const condition = e.condition ? this.emitExpression(e.condition) : "";
        const modifier = e.modifier ? this.emitExpression(e.modifier) : "";
        this.controlFlowBoundaries.push(this.ownershipScopes.length);
        const body = this.emitBlockStatement(e.body);
        this.controlFlowBoundaries.pop();

        return `for(${decl} ${condition}; ${modifier})${body}\n`;
    }

    emitCaseBlock(s: SwitchCase, defaultCase: boolean): string {
        if (s.body.statements.length == 0) {
            return "";
        }

        //if defaultCase is true:
        //emit the default keyword
        //do not emit the labels
        //
        //If there are more than one labels
        //separate them using a comma,
        //else just emit the single label value
        const decl =
            this.emitIndent() +
            (defaultCase ? "default" : "case ") +
            (!defaultCase
                ? (s.labels.length > 1
                      ? s.labels.map((x) => x.value).join(",")
                      : s.labels[0]?.value) + ":"
                : ":");
        const body = this.emitBlockStatement(s.body as unknown as BlockStatement, true);
        return `${decl}\n${body}`;
    }

    emitSwitchStatement(s: SwitchStatement): string {
        const decl = `switch(${this.emitExpression(s.scrutinee)})`;
        this.indent++;
        const cases = `${s.cases.map((x) => this.emitCaseBlock(x, false)).join("\n")}`;
        const defaultCase = this.emitCaseBlock(s.default!, true);
        this.indent--;
        const final = `${decl}{\n${cases}${defaultCase}${this.emitIndent()}}`;
        return final;
    }

    /** Emits a single statement as a line of C, dispatching on its `kind`. */
    emitStatement(s: Statement, allocationTracker: AllocationTracker): string {
        switch (s.kind) {
            case "assignment_statement":
                return this.emitAssignmentStatement(s);
            case "variable_declaration_statement":
                return this.emitVariableDeclarationStatement(s, allocationTracker);
            case "return_statement":
                return this.emitReturnStatement(s);
            case "return_error_statement":
                return this.emitReturnErrorStatement(s);
            case "check_block_statement": {
                const pending = this.pendingResults.get(s.resultName.name);
                if (pending) pending.commit = pending.commit.replaceAll("__RESULT__", pending.temp);
                return this.emitCheckStatement(s);
            }
            case "forward_statement": {
                const pending = this.pendingResults.get(s.resultName.name);
                if (pending) pending.commit = pending.commit.replaceAll("__RESULT__", pending.temp);
                return this.emitForwardStatement(s);
            }
            case "switch_statement":
                return this.emitSwitchStatement(s as SwitchStatement);
            case "if_statement":
                return this.emitIfStatement(s as IfStatement);
            case "while_statement":
                return this.emitWhileStatement(s as WhileStatement);
            case "for_statement":
                return this.emitForStatement(s as ForStatement, allocationTracker);
            case "expression_statement":
                return s.asResult
                    ? this.emitAsResult(s.asResult, s.expression, "")
                    : this.emitExpression(s.expression) + ";";
            case "break_statement":
                return this.emitLoopExit("break");
            case "continue_statement":
                return this.emitLoopExit("continue");
        }

        return "";
    }

    emitWhileStatement(s: WhileStatement): string {
        const condition = this.emitExpression(s.condition);
        this.controlFlowBoundaries.push(this.ownershipScopes.length);
        const statement = `while (${condition}) ${this.emitBlockStatement(s.body)}`;
        this.controlFlowBoundaries.pop();
        return statement;
    }

    private emitLoopExit(keyword: "break" | "continue"): string {
        const boundary = this.controlFlowBoundaries.at(-1);
        const cleanup =
            boundary === undefined
                ? []
                : this.emitOwnedCleanup(this.ownershipScopes.slice(boundary));
        return `${cleanup.length ? `${cleanup.join(`\n${this.emitIndent()}`)}\n${this.emitIndent()}` : ""}${keyword};`;
    }

    emitIfStatement(s: IfStatement): string {
        const condition = this.emitExpression(s.condition);
        const thenBlock = this.emitBlockStatement(s.thenBlock);

        let statement = `if (${condition}) ${thenBlock}`;
        if (s.elseBlock) {
            statement += `else${this.emitBlockStatement(s.elseBlock)}`;
        }

        return statement;
    }

    /** Emits a brace-delimited block of statements. */
    emitBlockStatement(b: BlockStatement, caseBlock: boolean = false): string {
        const allocationTracker = new AllocationTracker();
        this.ownershipScopes.push([]);
        const ownedParameters = this.pendingOwnedParameters;
        this.pendingOwnedParameters = [];
        const parameterFlags = ownedParameters
            .map((parameter) =>
                this.registerOwnedBinding(parameter.name.name, parameter.name.name, parameter.type),
            )
            .filter(Boolean);
        if (this.moduleOptions) {
            this.localScopes.push(new Set());
        }
        this.indent++;

        let statements = [
            ...parameterFlags.map((flag) => this.emitIndent() + flag.trimStart()),
            ...b.statements.map((x) => {
                const emitted = this.emitStatement(x, allocationTracker);
                return this.emitIndent() + emitted;
            }),
        ];

        const currentOwnershipScope = this.ownershipScopes.at(-1)!;
        const lastSourceStatement = b.statements.at(-1);

        if (!this.statementDefinitelyDiverges(lastSourceStatement)) {
            statements.push(
                ...allocationTracker.deallocate().map((x) => `\n${this.emitIndent()}${x}`),
            );
            statements.push(
                ...this.emitOwnedCleanup([currentOwnershipScope]).map(
                    (line) => `\n${this.emitIndent()}${line}`,
                ),
            );
        }
        let block = caseBlock ? statements.join("\n") : "{\n" + statements.join("\n");

        this.indent--;
        block += "\n" + this.emitIndent() + (caseBlock ? "\n" : "}\n");
        if (this.moduleOptions) {
            this.localScopes.pop();
        }
        this.ownershipScopes.pop();
        return block;
    }

    private statementDefinitelyDiverges(statement?: Statement): boolean {
        if (!statement) return false;
        if (
            statement.kind == "return_statement" ||
            statement.kind == "return_error_statement" ||
            statement.kind == "forward_statement" ||
            statement.kind == "break_statement" ||
            statement.kind == "continue_statement"
        ) {
            return true;
        }
        if (statement.kind == "if_statement") {
            return (
                !!statement.elseBlock &&
                this.statementDefinitelyDiverges(statement.thenBlock.statements.at(-1)) &&
                this.statementDefinitelyDiverges(statement.elseBlock.statements.at(-1))
            );
        }
        return false;
    }

    /**
     * Emits a function's C signature, and its body unless `forwardDecl` is set
     * (in which case it emits just the prototype terminated by `;`). The Delta
     * `main` function is renamed to `delta_main` so the generated C `main` shim
     * can wrap it.
     */
    emitFunctionDeclaration(f: FunctionDeclaration, forwardDecl: boolean): string {
        const specializations = this.functionSpecializations(f);

        // An unused generic function has no concrete C representation.
        if (f.typeParameters?.length && specializations.length == 0) {
            return "";
        }

        return (specializations.length ? specializations : [new Map<string, Type>()])
            .map((concreteTypes) =>
                this.emitConcreteFunctionDeclaration(f, concreteTypes, forwardDecl),
            )
            .join("\n");
    }

    /** Emits one monomorphized C function for a single generic binding set. */
    private emitConcreteFunctionDeclaration(
        f: FunctionDeclaration,
        concreteTypes: Map<string, Type>,
        forwardDecl: boolean,
    ): string {
        const previousConcreteTypes = this.activeConcreteTypes;
        this.activeConcreteTypes = concreteTypes;

        let fnName = f.receiver
            ? this.moduleOptions
                ? `${this.moduleSymbol(f.receiver.type.name.name)}_${f.name.name}`
                : `delta__${f.receiver.type.name.name}_${f.name.name}`
            : this.moduleOptions
              ? this.moduleSymbol(f.name.name)
              : f.name.name;
        if (!f.receiver && !this.moduleOptions && fnName == "main") {
            fnName = "delta_main";
        } else if (concreteTypes.size) {
            const typeArguments = (f.typeParameters ?? []).map((typeParameter) =>
                this.typeMangle(concreteTypes.get(typeParameter.name.name)!),
            );
            fnName += "__" + typeArguments.join("_");
        }

        const rT = f.errorTypes.length
            ? this.resultStructName(f.returnTypes[0])
            : this.cType(f.returnTypes[0]!);
        const sourceParameters = f.receiver ? [f.receiver, ...f.parameters] : f.parameters;
        const params = sourceParameters
            .map((parameter) => this.emitFunctionParameter(parameter, concreteTypes))
            .join(",");
        const cParams = this.moduleOptions && params.length == 0 ? "void" : params;
        const linkage = this.moduleOptions && !this.isExported(f) ? "static " : "";
        const signature = `${linkage}${rT} ${fnName}(${cParams})`;

        if (forwardDecl) {
            this.activeConcreteTypes = previousConcreteTypes;
            return `${signature};`;
        }

        if (this.moduleOptions) {
            this.localScopes.push(
                new Set(sourceParameters.map((parameter) => parameter.name.name)),
            );
        }
        const previousFunction = this.activeFunction;
        const previousPending = this.pendingResults;
        this.activeFunction = f;
        this.pendingResults = new Map();
        this.pendingOwnedParameters = sourceParameters.filter(
            (parameter) => !parameter.type.reference && this.needsDrop(parameter.type),
        );
        const body = this.emitBlockStatement(f.body);
        this.activeFunction = previousFunction;
        this.pendingResults = previousPending;
        if (this.moduleOptions) {
            this.localScopes.pop();
        }
        this.activeConcreteTypes = previousConcreteTypes;
        return signature + body;
    }

    private emitFunctionParameter(
        parameter: FunctionParameter,
        concreteTypes: Map<string, Type>,
    ): string {
        const resolvedType =
            this.substituteConcreteType(parameter.type, concreteTypes) ?? parameter.type;
        if (resolvedType.arrayLengths?.length) {
            const elementType = { ...resolvedType, arrayLengths: undefined };
            const dimensions = resolvedType.arrayLengths.map((length) => `[${length}]`).join("");
            return `const ${this.cType(elementType)} ${parameter.name.name}${dimensions}`;
        }
        return `${this.cType(resolvedType)} ${parameter.name.name}`;
    }

    /**
     * Returns every concrete binding combination requested for a generic
     * function. `Map<T, [int32, bool]>` becomes two definitions; multiple
     * generic parameters produce their Cartesian product.
     */
    private functionSpecializations(f: FunctionDeclaration): Map<string, Type>[] {
        const typeParameters = f.typeParameters ?? [];
        if (!typeParameters.length) {
            return [];
        }

        let combinations: Map<string, Type>[] = [new Map()];
        for (const typeParameter of typeParameters) {
            const concreteTypes = f.concreteTypesMap?.get(typeParameter.name.name) ?? [];
            if (!concreteTypes.length) {
                return [];
            }

            combinations = combinations.flatMap((bindings) =>
                concreteTypes.map((concreteType) => {
                    const next = new Map(bindings);
                    next.set(typeParameter.name.name, concreteType);
                    return next;
                }),
            );
        }
        return combinations;
    }

    /** Creates a stable, valid-enough suffix for a monomorphized C symbol. */
    private typeMangle(t: Type): string {
        const concreteType =
            t.value == TypeValue.TypeGeneric
                ? (this.activeConcreteTypes?.get(t.name.name) ?? t)
                : t;
        const typeArguments = concreteType.typeParameters?.length
            ? `__${concreteType.typeParameters.map((type) => this.typeMangle(type)).join("_")}`
            : "";
        const dimensions = concreteType.arrayLengths?.map((length) => `_${length}`).join("") ?? "";
        const slice = concreteType.slice ? "_slice" : "";
        return `${concreteType.name.name}${typeArguments}${dimensions}${slice}`.replaceAll(
            /[^A-Za-z0-9_]/g,
            "_",
        );
    }

    /** Emits just the prototype for a function, for the forward-declaration block. */
    emitForwardDeclaration(f: FunctionDeclaration) {
        return this.emitFunctionDeclaration(f, true);
    }

    emitTypeDeclaration(d: TypeDeclaration): string {
        if (d.declKind == TypeDeclKind.Struct) {
            let allocators = "";
            let deallocators = "";
            const struct = d.declaration as StructDecl;
            if (struct.typeParameters?.length) {
                return this.emitConcreteStructDeclaration(struct);
            }
            const sig = this.moduleOptions
                ? this.moduleSymbol(d.name.name)
                : `delta__${d.name.name}`;
            this.indent++;
            const members = struct.fields
                .map((x) => {
                    const dimensions = x.type.arrayLengths?.map((length) => `[${length}]`).join("");
                    return (
                        this.emitIndent() +
                        `${this.cType(x.type)} ${x.name.name}${dimensions ?? ""};`
                    );
                })
                .join("\n");
            this.indent--;

            return `typedef struct ${sig}{\n${members}\n} ${sig}; \n ${allocators} \n ${deallocators}`;
        }

        if (d.declKind == TypeDeclKind.Enum) {
            const sig = this.moduleOptions
                ? this.moduleSymbol(d.name.name)
                : `delta__${d.name.name}`;
            this.indent++;
            const members = (d.declaration as EnumDecl).variants
                .map((x) => {
                    return this.emitIndent() + `${sig}_${x.name.name} = ${x.value.value},`;
                })
                .join("\n");
            this.indent--;

            return `typedef enum ${sig}{\n${members}\n} ${sig};`;
        }

        if (d.declKind == TypeDeclKind.Union) {
            this.indent++;
            const memberNames = (d.declaration as UnionDecl).variants.map((x) => x.name.name);

            const unionSig = this.moduleOptions
                ? this.moduleSymbol(d.name.name)
                : `delta__${d.name.name}`;
            const tagSig = `${unionSig}_Tag`;
            const tagMembers = memberNames
                .map((x) => {
                    return this.emitIndent() + `${tagSig}_${x}`;
                })
                .join(",\n");

            const unionMembers = memberNames
                .map((x) => {
                    return (
                        this.emitIndent() +
                        this.emitIndent() +
                        this.emitIndent() +
                        `${this.cType({ kind: "type", name: { kind: "identifier", name: x }, value: TypeValue.TypeCustom })} ${x}`
                    );
                })
                .join(";\n");

            this.indent--;
            const tagEnum = `typedef enum ${tagSig}{\n${tagMembers}\n} ${tagSig};`;
            const taggedUnion = `typedef struct ${unionSig} {\n\t${tagSig} tag;\n\tunion {\n${unionMembers}\n\t} payload;\n} ${unionSig};`;

            return `${tagEnum}\n${taggedUnion}`;
        }

        return "";
    }

    /** Emits a top-level declaration, dispatching on its `kind`. */
    emitDeclaration(d: Declaration): string {
        switch (d.kind) {
            case "import_declaration":
                return "";
            case "variable_declaration_statement":
                return this.emitVariableDeclarationStatement(d as VariableDeclarationStatement);
            case "function_declaration":
                return this.emitFunctionDeclaration(d as FunctionDeclaration, false);
            case "type_declaration":
                return this.emitTypeDeclaration(d as TypeDeclaration);
        }
    }

    /**
     * Emits the C `main` entry point: a thin shim that invokes the program's
     * `delta_main` and returns its result as the process exit code.
     */
    emitMain(): string {
        const entryFunction = this.moduleOptions ? this.moduleSymbol("main") : "delta_main";
        return `int main(){
    return (int)${entryFunction}();
}
`;
    }

    getTypeMinValue(t: string): string {
        switch (t) {
            case "int8":
                return "INT8_MIN";
            case "int16":
                return "INT16_MIN";
            case "int32":
                return "INT32_MIN";
            case "int64":
                return "INT64_MIN";
            case "intsize":
                return "INTPTR_MIN";
            case "uint8":
            case "uint16":
            case "uint32":
            case "uint64":
            case "uintsize":
                return "0";
        }
        return "";
    }

    getTypeMaxValue(t: string): string {
        switch (t) {
            case "int8":
                return "INT8_MAX";
            case "int16":
                return "INT16_MAX";
            case "int32":
                return "INT32_MAX";
            case "int64":
                return "INT64_MAX";
            case "intsize":
                return "INTPTR_MAX";
            case "uint8":
                return "UINT8_MAX";
            case "uint16":
                return "UINT16_MAX";
            case "uint32":
                return "UINT32_MAX";
            case "uint64":
                return "UINT64_MAX";
            case "uintsize":
                return "UINTPTR_MAX";
        }
        return "";
    }

    /**
     * Returns the storage size, in bytes, of a primitive Delta type — the same
     * value its lowered C type would report from `sizeof`. `intsize`/`uintsize`
     * assume a 64-bit target, matching their `intptr_t`/`uintptr_t` lowering.
     * Returns `0` for anything that isn't a recognized primitive.
     */
    sizeOfDeltaType(t: string): number {
        switch (t) {
            case "int8":
            case "uint8":
            case "bool":
            case "char":
                return 1;
            case "int16":
            case "uint16":
                return 2;
            case "int32":
            case "uint32":
            case "float32":
                return 4;
            case "int64":
            case "uint64":
            case "float64":
            case "intsize":
            case "uintsize":
                return 8;
        }
        return 0;
    }

    isSignedIntType(t: string): boolean {
        return ["int8", "int16", "int32", "int64", "intsize"].includes(t);
    }

    isUnsignedIntType(t: string): boolean {
        return ["uint8", "uint16", "uint32", "uint64", "uintsize"].includes(t);
    }

    isFloatType(t: string): boolean {
        return t == "float32" || t == "float64";
    }

    /**
     * Builds the out-of-range condition for a `fromT -> toT` conversion. The
     * shape of the check depends on the conversion's category — a plain
     * min/max bound isn't correct (or isn't even expressible) for all of them:
     *
     * - `char` targets are a Unicode scalar-value validity check (the
     *   surrogate range is excluded), not a min/max bound.
     * - float sources must also reject NaN: `NaN < x` and `NaN > x` are both
     *   false in IEEE-754, so an ordered range check alone silently lets NaN
     *   through.
     * - signed -> unsigned only needs a sign check: any negative signed value
     *   is invalid, and the unsigned target's positive range always dwarfs
     *   what a same-or-narrower signed source can hold, so a max-side check
     *   never actually fires.
     * - everything else (same-signedness narrowing) is a plain inclusive
     *   range check against the target's bounds.
     */
    converterRangeCheck(fromT: string, toT: string): string {
        if (toT == "char") {
            return "value > 0x10FFFF || (value >= 0xD800 && value <= 0xDFFF)";
        }

        const minValue = this.getTypeMinValue(toT);
        const maxValue = this.getTypeMaxValue(toT);

        if (this.isFloatType(fromT) && !this.isFloatType(toT)) {
            return `isnan(value) || value < ${minValue} || value > ${maxValue}`;
        }

        if (this.isSignedIntType(fromT) && this.isUnsignedIntType(toT)) {
            return "value < 0";
        }

        return `value < ${minValue} || value > ${maxValue}`;
    }

    conversionGuardTemplate(fromT: string, toT: string): string {
        const cFromType = this.convertDeltaToCType(fromT);
        const cToType = this.convertDeltaToCType(toT);
        const converterName = `delta_rt__convert_${fromT}_to_${toT}`;
        const check = this.converterRangeCheck(fromT, toT);

        return `static ${cToType} ${converterName}(${cFromType} value, const char *loc) {
    if (${check}) {
        delta_panic("conversion failed: out of range", loc);
    }
    return (${cToType})value;
}\n\n`;
    }

    divisionGuardTemplate(t: string): string {
        const cType = this.convertDeltaToCType(t);
        return `static int32_t delta_rt__check_divisor_${t}(${cType} b, const char *loc) {
    if (b == 0) {
        delta_panic("division by zero", loc);
    }
    return b;
}\n\n`;
    }

    shiftGuardTemplate(t: string): string {
        const cType = this.convertDeltaToCType(t);
        return `static int32_t delta_rt__check_shift_${t}(${cType} amount, const char *loc) {
    if (amount >= ${this.sizeOfDeltaType(t) * 8}) {
        delta_panic("shift count out of range", loc);
    }
    return amount;
}\n\n`;
    }

    overflowGuardTemplate(t: string): string {
        const cType = this.convertDeltaToCType(t);
        return `static void delta_rt__overflow_${t}(${cType} *v, const char *loc) {
    if (*v == ${this.getTypeMaxValue(t)}) {
        delta_panic("arithmetic overflow", loc);
    }
    (*v)++;
}\n\n`;
    }

    underflowGuardTemplate(t: string): string {
        const cType = this.convertDeltaToCType(t);
        return `static void delta_rt__underflow_${t}(${cType} *v, const char *loc) {
    if (*v == ${this.getTypeMinValue(t)}) {
        delta_panic("arithmetic overflow", loc);
    }
    (*v)--;
}\n\n`;
    }

    emitPanicFunction(): string {
        return `static void delta_panic(const char *msg, const char *loc) {
    fprintf(stderr, "panic: %s\\n  at %s\\n", msg, loc);
    exit(1);
}\n\n`;
    }

    emitSliceBoundsFunction(): string {
        return `static uintptr_t delta_rt__check_slice_index(uintptr_t size, uintptr_t index, const char *loc) {
    if (index >= size) delta_panic("slice index out of bounds", loc);
    return index;
}\n\n`;
    }

    /** Emits every module type and function declaration in one dependency-safe header. */
    emitHeader(): string {
        if (!this.moduleOptions) {
            return "";
        }

        const guard = `DELTA_${this.moduleOptions.moduleName.toUpperCase()}_H`;
        const dependencyIncludes = [...new Set(this.moduleOptions.importedHeaders ?? [])]
            .filter((name) => name != this.moduleOptions!.moduleName)
            .map((name) => `#include "delta_${name}.h"`)
            .join("\n");
        const ffiIncludes = [...new Set(this.ast.ffiHeaders ?? [])]
            .map((header) => `#include ${header}`)
            .join("\n");

        const typeDeclarations = this.ast.declarations
            .filter(
                (declaration): declaration is TypeDeclaration =>
                    declaration.kind == "type_declaration",
            )
            .map((declaration) => this.emitTypeDeclaration(declaration))
            .join("\n\n");
        const resultStructs = this.emitResultStructs();

        const exportedValues = this.ast.declarations
            .map((declaration) => {
                if (
                    declaration.kind == "function_declaration" &&
                    this.isExported(declaration) &&
                    declaration.external?.abi != "c"
                ) {
                    return this.emitForwardDeclaration(declaration);
                }
                if (
                    declaration.kind == "variable_declaration_statement" &&
                    this.isExported(declaration)
                ) {
                    const dimensions =
                        declaration.type.arrayLengths?.map((length) => `[${length}]`).join("") ??
                        "";
                    return `extern ${this.cConstBindingType(declaration.type)} ${this.moduleSymbol(declaration.name.name)}${dimensions};`;
                }
                return "";
            })
            .filter(Boolean)
            .join("\n");

        const privateFunctionDeclarations = this.ast.declarations
            .filter(
                (declaration): declaration is FunctionDeclaration =>
                    declaration.kind == "function_declaration" &&
                    !this.isExported(declaration) &&
                    !declaration.external,
            )
            .map((declaration) => this.emitForwardDeclaration(declaration))
            .join("\n");

        const implementationDeclarations = privateFunctionDeclarations
            ? `#ifdef ${this.implementationMacro()}\n${privateFunctionDeclarations}\n#endif`
            : "";

        const declarations = [
            typeDeclarations,
            resultStructs,
            exportedValues,
            implementationDeclarations,
        ]
            .filter(Boolean)
            .join("\n\n");
        const sliceTypeDefinitions = this.emitSliceTypeDefinitions();
        const sliceElementForwardDeclarations = this.emitSliceElementForwardDeclarations();

        return `#ifndef ${guard}
#define ${guard}

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
${dependencyIncludes ? `${dependencyIncludes}\n` : ""}
${ffiIncludes ? `${ffiIncludes}\n` : ""}
${this.emitStringTypeDefinition()}
${sliceElementForwardDeclarations}
${sliceTypeDefinitions}
${declarations}

#endif
`;
    }

    /**
     * Emits the complete C translation unit: headers, all forward declarations,
     * the function definitions, and the `main` shim, joined in dependency-safe
     * order. Returns the assembled source.
     */
    emit(): string {
        this.initializeErrorTags();
        this.final += this.emitHeaders();
        const resultStructs = this.emitResultStructs();
        this.final += this.emitPanicFunction();
        this.final += this.emitSliceBoundsFunction();
        this.final += "<conversion-guards>";
        this.final += "<division-guards>";
        this.final += "<shift-guards>";
        this.final += "<overflow-guards>";
        this.final += "<underflow-guards>";

        const typeDeclarations = this.moduleOptions
            ? []
            : this.ast.declarations
                  .filter((declaration) => declaration.kind == "type_declaration")
                  .map((declaration) => this.emitTypeDeclaration(declaration as TypeDeclaration));
        const fwdDecls = this.moduleOptions
            ? []
            : this.ast.declarations
                  .filter(
                      (declaration) =>
                          declaration.kind == "function_declaration" && !declaration.external,
                  )
                  .map((declaration) =>
                      this.emitForwardDeclaration(declaration as FunctionDeclaration),
                  );
        const valueAndFunctionDeclarations = this.ast.declarations
            .filter(
                (declaration) =>
                    declaration.kind != "type_declaration" &&
                    declaration.kind != "import_declaration" &&
                    !(
                        (declaration.kind == "function_declaration" ||
                            declaration.kind == "variable_declaration_statement") &&
                        declaration.external
                    ),
            )
            .map((declaration) => this.emitDeclaration(declaration));
        const cloneHelpers = this.emitCloneHelpers();
        const cloneHelperPrototypes = this.emitCloneHelperPrototypes();
        const allocationHelpers = this.emitNewHelpers();
        const dropHelperPrototypes = this.emitDropHelperPrototypes();
        const dropHelpers = this.emitDropHelpers();
        const stringLiteralBlocks = this.emitStringLiteralBlocks();
        const sliceTypeDefinitions = this.emitSliceTypeDefinitions();
        const sliceElementForwardDeclarations = this.emitSliceElementForwardDeclarations();

        const conversionGuards = this.guards.conversions.map((x) =>
            this.conversionGuardTemplate(x.fromType, x.toType),
        );

        const divisionGuards = this.guards.divisions.map((x) => this.divisionGuardTemplate(x.type));
        const shiftGuards = this.guards.shifts.map((x) => this.shiftGuardTemplate(x.type));
        const overflowGuards = this.guards.overflows.map((x) => this.overflowGuardTemplate(x.type));
        const underflowGuards = this.guards.underflows.map((x) =>
            this.underflowGuardTemplate(x.type),
        );

        this.final = this.final.replace("<conversion-guards>", conversionGuards.join("\n"));
        this.final = this.final.replace("<division-guards>", divisionGuards.join("\n"));
        this.final = this.final.replace("<shift-guards>", shiftGuards.join("\n"));
        this.final = this.final.replace("<overflow-guards>", overflowGuards.join("\n"));
        this.final = this.final.replace("<underflow-guards>", underflowGuards.join("\n"));

        const entryShim = !this.moduleOptions || this.moduleOptions.entry ? this.emitMain() : "";
        this.final =
            this.final +
            (stringLiteralBlocks ? stringLiteralBlocks + "\n\n" : "") +
            (sliceElementForwardDeclarations ? sliceElementForwardDeclarations + "\n\n" : "") +
            (sliceTypeDefinitions ? sliceTypeDefinitions + "\n\n" : "") +
            typeDeclarations.join("\n") +
            "\n" +
            (resultStructs ? resultStructs + "\n" : "") +
            fwdDecls.join("\n") +
            "\n" +
            [dropHelperPrototypes, cloneHelperPrototypes].filter(Boolean).join("\n") +
            "\n\n" +
            [allocationHelpers, cloneHelpers, dropHelpers].filter(Boolean).join("\n\n") +
            "\n\n" +
            valueAndFunctionDeclarations.join("\n") +
            "\n\n" +
            entryShim;

        return this.final.replace(/^\s*[\r\n]/gm, "").replace(/\}\r?\n/g, "}\n\n");
    }
}
