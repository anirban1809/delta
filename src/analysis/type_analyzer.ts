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
        ].includes(this.resolveTypeValue(t));
    }

    /**
     * Tests declaration compatibility before conversion rules are considered.
     * `float32` intentionally accepts both float types; custom types compare
     * by name, while resolved primitive types compare by their type value.
     */
    typesMatch(t1: Type, t2: Type) {
        if (t1.name.name == "float32") {
            return ["float32", "float64"].includes(t2.name.name);
        }

        return [t1.value, t2.value].includes(TypeValue.TypeCustom)
            ? t1.name.name == t2.name.name
            : t1.value == t2.value;
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
        if (
            (t1.kind == "enum" && t2.value == TypeValue.Type_Int32) ||
            (t2.kind == "enum" && t1.value == TypeValue.Type_Int32)
        ) {
            return true;
        }

        const t1sym = scope.getSymbol(t1.name.name);
        const t2sym = scope.getSymbol(t2.name.name);
        return (
            !!t1sym &&
            !!t2sym &&
            t1sym.kind == SymbolKind.SymbolTypsAliasDecl &&
            t1sym.type?.name.name == t2.name.name
        );
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
