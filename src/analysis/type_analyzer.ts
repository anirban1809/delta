import { TypeValue, type Expression, type IntegerLiteral, type Type } from "../ast/types.js";
import type { Diagnostics } from "../diagnostics/diagnostics.js";
import { SymbolKind } from "./analyzer.js";
import type { Scope } from "./scope.js";

/**
 * Shared type predicates and compatibility checks used throughout
 * statements. Resolution of source-level type names is performed by callers.
 */
export class TypeAnalyzer {
    constructor(public diagnostics: Diagnostics) {}

    /** Whether a type is the parser's placeholder for an omitted annotation. */
    isInvalidType(t: Type): boolean {
        return t.value == TypeValue.TypeInvalid;
    }

    /** Whether a type still needs symbol-table resolution. */
    isCustomType(t: Type): boolean {
        return t.value == TypeValue.TypeCustom;
    }

    /** Replaces generic placeholders in a type, including its fields and nested arguments. */
    substituteType(type: Type, bindings: Map<string, Type>): Type {
        if (type.value == TypeValue.TypeGeneric) {
            const binding = bindings.get(type.name.name);
            if (!binding) return structuredClone(type);
            const resolved = structuredClone(binding);
            if (type.arrayLengths?.length) {
                resolved.arrayLengths = [
                    ...type.arrayLengths,
                    ...(resolved.arrayLengths ?? []),
                ];
            }
            if (type.slice) resolved.slice = true;
            resolved.reference = type.reference || resolved.reference;
            resolved.edit = type.edit || resolved.edit;
            return resolved;
        }

        const resolved = structuredClone(type);
        resolved.typeParameters = type.typeParameters?.map((parameter) =>
            this.substituteType(parameter, bindings),
        );
        resolved.fields = type.fields?.map((field) => ({
            name: field.name,
            type: this.substituteType(field.type, bindings),
        }));
        resolved.unionVariants = type.unionVariants?.map((variant) =>
            this.substituteType(variant, bindings),
        );
        return resolved;
    }

    /** Resolves a primitive type name; unrecognized names remain custom types. */
    resolveTypeValue(t: Type): TypeValue {
        switch (t.name.name) {
            case "int8":
                return TypeValue.Type_Int8;
            case "int16":
                return TypeValue.Type_Int16;
            case "int32":
                return TypeValue.Type_Int32;
            case "int64":
                return TypeValue.Type_Int64;
            case "uint8":
                return TypeValue.Type_UInt8;
            case "uint16":
                return TypeValue.Type_UInt16;
            case "uint32":
                return TypeValue.Type_UInt32;
            case "uint64":
                return TypeValue.Type_UInt64;
            case "intsize":
                return TypeValue.Type_IntSize;
            case "uintsize":
                return TypeValue.Type_UIntSize;
            case "char":
                return TypeValue.Type_Char;
            case "float32":
                return TypeValue.Type_Float32;
            case "float64":
                return TypeValue.Type_Float64;
            case "bool":
                return TypeValue.Type_Bool;
            case "string":
            case "stringview":
                return TypeValue.Type_String;
            case "owned":
                return TypeValue.Type_Owned;
        }

        return TypeValue.TypeCustom;
    }

    /** Returns whether a type resolves to one of Delta's built-in primitives. */
    isValidPrimitiveType(t: Type): boolean {
        return [
            TypeValue.Type_Int32,
            TypeValue.Type_Int64,
            TypeValue.Type_Int16,
            TypeValue.Type_Int8,
            TypeValue.Type_UInt32,
            TypeValue.Type_UInt64,
            TypeValue.Type_UInt16,
            TypeValue.Type_UInt8,
            TypeValue.Type_IntSize,
            TypeValue.Type_UIntSize,
            TypeValue.Type_Char,
            TypeValue.Type_Float32,
            TypeValue.Type_Float64,
            TypeValue.Type_Bool,
            TypeValue.Type_String,
        ].includes(this.resolveTypeValue(t));
    }

    /** Checks both the element type and every static-array dimension. */
    arrayTypesMatch(t1: Type, t2: Type): boolean {
        return this.typesMatch(t1, t2) && this.arrayDimensionsMatch(t1, t2);
    }

    /** Checks only the ordered static-array extents. */
    arrayDimensionsMatch(t1: Type, t2: Type): boolean {
        if (!!t1.slice != !!t2.slice) return false;
        const dimensions1 = t1.arrayLengths ?? [];
        const dimensions2 = t2.arrayLengths ?? [];
        return (
            dimensions1.length == dimensions2.length &&
            dimensions1.every((length, index) => length == dimensions2[index])
        );
    }

    /*
     * Check if t2 ownes a value of type t1
     * e.g. t1 is payload and t2 is owned<payload>
     * */
    isOwnedType(t1: Type, t2: Type): boolean {
        if (t2.value != TypeValue.Type_Owned) {
            return false;
        }

        if (t1.name.name != t2.typeParameters![0]?.name.name) {
            return false;
        }
        return true;
    }

    /** Derives the operational ownership tier transitively through aliases and fields. */
    ownershipTier(t: Type, scope: Scope, seen = new Set<string>()): "copyable" | "cloneable" | "unique" {
        if (t.reference) return "copyable";
        if (t.value == TypeValue.Type_Owned) {
            const inner = t.typeParameters?.[0];
            return inner && this.ownershipTier(inner, scope, seen) == "unique" ? "unique" : "cloneable";
        }
        if (t.value != TypeValue.TypeCustom) return "copyable";
        if (seen.has(t.name.name)) return "copyable";
        seen.add(t.name.name);
        const symbol = scope.getSymbol(t.name.name);
        if (!symbol) return "copyable";
        if (symbol.kind == SymbolKind.SymbolTypsAliasDecl && symbol.type) {
            return this.ownershipTier(symbol.type, scope, seen);
        }
        if (symbol.declaration?.kind == "type_declaration" && symbol.declaration.unique) return "unique";
        let tier: "copyable" | "cloneable" | "unique" = "copyable";
        for (const field of symbol.type?.fields ?? t.fields ?? []) {
            const fieldTier = this.ownershipTier(field.type, scope, new Set(seen));
            if (fieldTier == "unique") return "unique";
            if (fieldTier == "cloneable") tier = "cloneable";
        }
        return tier;
    }

    /**
     * Tests declaration compatibility before conversion rules are considered.
     * `float32` intentionally accepts both float types; custom types compare
     * by name, while resolved primitive types compare by their type value.
     */
    typesMatch(t1: Type, t2: Type): boolean {
        if (!!t1.reference != !!t2.reference || !!t1.edit != !!t2.edit) return false;
        if (!!t1.slice != !!t2.slice) return false;
        if (this.isOwnedType(t1, t2)) {
            return true;
        }

        if (
            t1.value == TypeValue.Type_Owned ||
            t2.value == TypeValue.Type_Owned
        ) {
            return (
                t1.value == t2.value &&
                (t1.typeParameters?.length ?? 0) == 1 &&
                (t2.typeParameters?.length ?? 0) == 1 &&
                this.typesMatch(t1.typeParameters![0]!, t2.typeParameters![0]!)
            );
        }

        if (t1.name.name == "float32") {
            return ["float32", "float64"].includes(t2.name.name);
        }

        if (t1.value == TypeValue.TypeGeneric || t2.value == TypeValue.TypeGeneric) {
            return t1.name.name == t2.name.name;
        }

        if ([t1.value, t2.value].includes(TypeValue.TypeCustom)) {
            const typeParameters1 = t1.typeParameters ?? [];
            const typeParameters2 = t2.typeParameters ?? [];
            return (
                t1.name.name == t2.name.name &&
                typeParameters1.length == typeParameters2.length &&
                typeParameters1.every((type, index) =>
                    this.typesMatch(type, typeParameters2[index]!),
                )
            );
        }

        return t1.value == t2.value;
    }

    isIndirection(t: Type): boolean {
        return t.value == TypeValue.Type_Owned;
    }

    displayName(t: Type): string {
        const suffix = t.slice
            ? "[]"
            : (t.arrayLengths ?? []).map((length) => `[${length}]`).join("");
        if (this.isIndirection(t)) {
            const arguments_ = t.typeParameters ?? [];
            return `${t.name.name}<${arguments_.map((argument) => this.displayName(argument)).join(", ")}>${suffix}`;
        }
        if (t.typeParameters?.length) {
            return `${t.name.name}<${t.typeParameters.map((argument) => this.displayName(argument)).join(", ")}>${suffix}`;
        }
        return `${t.name.name}${suffix}`;
    }

    /** Whether `t2` is declared as one of union type `t1`'s variants. */
    isUnionVariant(t1: Type, t2: Type): boolean {
        return t1.unionVariants?.map((x) => x.name.name).includes(t2.name.name)!;
    }

    /**
     * Determines alias compatibility using the scope's type symbols. Enums
     * intentionally behave as aliases of `int32` for declaration checking.
     */
    isAliasOf(t1: Type, t2: Type, scope: Scope): boolean {
        if (this.isIndirection(t1) || this.isIndirection(t2)) {
            return this.typesMatch(t1, t2);
        }
        if (!!t1.slice != !!t2.slice) return false;
        if (
            (t1.arrayLengths?.length || t2.arrayLengths?.length) &&
            !this.arrayDimensionsMatch(t1, t2)
        ) {
            return false;
        }
        if (
            (t1.kind == "enum" && t2.value == TypeValue.Type_Int32) ||
            (t2.kind == "enum" && t1.value == TypeValue.Type_Int32)
        ) {
            return true;
        }

        const canonical = (type: Type): string => {
            let name = type.name.name;
            const seen = new Set<string>();
            while (!seen.has(name)) {
                seen.add(name);
                const symbol = scope.getSymbol(name);
                if (symbol?.kind != SymbolKind.SymbolTypsAliasDecl || !symbol.type) break;
                name = symbol.type.name.name;
            }
            return name;
        };
        if (canonical(t1) != canonical(t2)) return false;
        const arguments1 = t1.typeParameters ?? [];
        const arguments2 = t2.typeParameters ?? [];
        if (arguments1.length || arguments2.length) {
            return (
                arguments1.length == arguments2.length &&
                arguments1.every((argument, index) =>
                    this.typesMatch(argument, arguments2[index]!),
                )
            );
        }
        return true;
    }

    /** Whether an expression has the syntactic shape of a negative integer literal. */
    isNegativeInteger(e: Expression): boolean {
        return e.kind == "unary_expression" && e.operand.kind == "integer_literal";
    }

    /**
     * Checks an integer literal against the inclusive bounds of `t`. Values
     * are parsed as `bigint` so the 64-bit limits are represented exactly.
     */
    checkIntegerRange(t: Type, literal: IntegerLiteral): boolean {
        const value = BigInt(parseInt(literal.value));
        return (
            this.isInteger(t) &&
            value >= this.getMinIntegerValue(t) &&
            value <= this.getMaxIntegerValue(t)
        );
    }

    /** Returns whether a type is any signed or unsigned integer type. */
    isInteger(t: Type): boolean {
        return (
            t.value.startsWith("Type_Int") || t.value.startsWith("Type_UInt") || t.kind == "enum"
        );
    }

    /** Returns whether a type is of a signed integer . */
    isSignedInteger(t: Type): boolean {
        return t.value.startsWith("Type_Int");
    }

    /** Returns whether a type is a floating-point type (`float32`/`float64`). */
    isFloat(t: Type): boolean {
        return t.value.startsWith("Type_Float");
    }
    /**
     * Returns the bit width of an integer type, for both signed and unsigned
     * variants. `IntSize`/`UIntSize` are pointer-width and reported as 64 to
     * match the 64-bit lowering target. Returns 0 for non-integer types.
     */
    sizeOf(t: Type): number {
        if (t.kind == "enum") {
            return 32;
        }

        switch (t.value) {
            case TypeValue.Type_Int8:
            case TypeValue.Type_UInt8:
                return 8;
            case TypeValue.Type_Int16:
            case TypeValue.Type_UInt16:
                return 16;
            case TypeValue.Type_Int32:
            case TypeValue.Type_UInt32:
                return 32;
            case TypeValue.Type_Int64:
            case TypeValue.Type_UInt64:
            case TypeValue.Type_IntSize:
            case TypeValue.Type_UIntSize:
                return 64;
            default:
                return 0;
        }
    }

    /**
     * Returns the maximum representable value for an integer type `t` as a
     * `bigint`, so the 64-bit bounds are exact.
     *
     * `IntSize`/`UIntSize` are treated as 64-bit (the MVP target per §5.14).
     * Returns `0n` for non-integer types.
     */
    getMaxIntegerValue(t: Type): bigint {
        switch (t.value) {
            case TypeValue.Type_Int8:
                return 2n ** 7n - 1n; // 127
            case TypeValue.Type_Int16:
                return 2n ** 15n - 1n; // 32_767
            case TypeValue.Type_Int32:
                return 2n ** 31n - 1n; // 2_147_483_647
            case TypeValue.Type_Int64:
            case TypeValue.Type_IntSize:
                return 2n ** 63n - 1n; // 9_223_372_036_854_775_807
            case TypeValue.Type_UInt8:
                return 2n ** 8n - 1n; // 255
            case TypeValue.Type_UInt16:
                return 2n ** 16n - 1n; // 65_535
            case TypeValue.Type_UInt32:
                return 2n ** 32n - 1n; // 4_294_967_295
            case TypeValue.Type_UInt64:
            case TypeValue.Type_UIntSize:
                return 2n ** 64n - 1n; // 18_446_744_073_709_551_615
            default:
                return 0n;
        }
    }

    /**
     * Returns the minimum representable value for an integer type `t` as a
     * `bigint`. Unsigned types have a minimum of `0n`; signed types have
     * `-2^(bits-1)`.
     *
     * `IntSize`/`UIntSize` are treated as 64-bit (the MVP target per §5.14).
     * Returns `0n` for non-integer types.
     */
    getMinIntegerValue(t: Type): bigint {
        switch (t.value) {
            case TypeValue.Type_Int8:
                return -(2n ** 7n); // -128
            case TypeValue.Type_Int16:
                return -(2n ** 15n); // -32_768
            case TypeValue.Type_Int32:
                return -(2n ** 31n); // -2_147_483_648
            case TypeValue.Type_Int64:
            case TypeValue.Type_IntSize:
                return -(2n ** 63n); // -9_223_372_036_854_775_808
            case TypeValue.Type_UInt8:
            case TypeValue.Type_UInt16:
            case TypeValue.Type_UInt32:
            case TypeValue.Type_UInt64:
            case TypeValue.Type_UIntSize:
                return 0n; // unsigned types start at 0
            default:
                return 0n;
        }
    }
}
