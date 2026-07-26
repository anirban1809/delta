import { string, TokenKind } from "../ast/tokens.js";
import { decodeStringLiteral } from "../ast/string_literals.js";
import {
    CreateType,
    TypeDeclKind,
    TypeValue,
    type ArrayLiteralExpression,
    type BinaryExpression,
    type Expression,
    type FieldInit,
    type FunctionCallExpression,
    type FunctionDeclaration,
    type Identifier,
    type IndexExpression,
    type MemberAccessExpression,
    type ObjectLiteralExpression,
    type Position,
    type StructDecl,
    type Type,
    type U,
    type UnaryExpression,
} from "../ast/types.js";
import { Error, type Diagnostics } from "../diagnostics/diagnostics.js";
import { SymbolKind, type FunctionSignature } from "./analyzer.js";
import type { Scope } from "./scope.js";
import { TypeAnalyzer } from "./type_analyzer.js";

/** Validates expressions and derives their resulting Delta types for all analyzers. */
export class ExpressionAnalyzer {
    typeAnalyzer: TypeAnalyzer;

    constructor(public diagnostics: Diagnostics) {
        this.typeAnalyzer = new TypeAnalyzer(diagnostics);
    }

    /** Returns whether an expression has the requested AST kind. */
    isKind(e: Expression, kind: string): boolean {
        return e.kind == kind;
    }

    /** Infers an expression type and records diagnostics for invalid expressions. */
    analyze(e: Expression, scope: Scope, expectedType?: Type): Type {
        if (!e) {
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        let expressionType = this.inferType(e, scope, expectedType);
        expressionType = this.coerceToExpectedSlice(e, expressionType, expectedType, scope);
        e.expressionType = expressionType;
        return expressionType;
    }

    /**
     * Treats an owned expression as its pointee when the surrounding syntax
     * consumes a value rather than the owning handle. Codegen uses the marker
     * to insert the corresponding pointer reads.
     */
    dereferenceOwnedValue(e: Expression, type: Type): Type {
        let valueType = type;
        let depth = 0;
        while (valueType.value == TypeValue.Type_Owned && valueType.typeParameters?.[0]) {
            valueType = valueType.typeParameters[0]!;
            depth++;
        }
        if (depth > 0) e.implicitDereference = depth;
        return valueType;
    }

    /** Infers the type returned by {@link analyze} before it is stored on the expression. */
    private inferType(e: Expression, scope: Scope, expectedType?: Type): Type {
        switch (e.kind) {
            case "identifier":
                const s = scope.getSymbol(e.name);
                if (!s) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            e.position,
                            "unknown identifier: use of undeclared name `" + e.name + "`",
                        ),
                    );
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }

                if (s.pendingResult) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            e.position,
                            `binding \`${s.name}\` is pending from \`as ${s.pendingResult}\`; check or forward the result before reading it`,
                        ),
                    );
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }

                if (s.moved == "moved" || s.moved == "maybe") {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            e.position,
                            s.moved == "maybe"
                                ? `\`${s.name}\` may have been moved on some paths and cannot be used here`
                                : `\`${s.name}\` has been moved and cannot be used`,
                        ),
                    );
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }

                if (s.kind == SymbolKind.SymbolTypeEnumDecl) {
                    return s.type!;
                }

                if (
                    !s.assigned &&
                    s.kind != SymbolKind.SymbolParameter &&
                    !s.type?.arrayLengths?.length
                ) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            e.position,
                            "binding " + s.name + " is uninitialized and hence cannot be used here",
                        ),
                    );
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }

                if (
                    s.type?.value == TypeValue.TypeCustom &&
                    !s.type.fields &&
                    !s.type.typeParameters?.length
                ) {
                    const typeSym = scope.getSymbol(s.type.name.name);
                    if (!typeSym) {
                        return CreateType("invalid", TypeValue.TypeInvalid);
                    }
                    const resolved = structuredClone(typeSym.type!);
                    resolved.reference = s.type.reference;
                    resolved.edit = s.type.edit;
                    return resolved;
                }
                return s.type!;

            case "integer_literal":
                return CreateType("int32", TypeValue.Type_Int32);

            case "float_literal":
                return CreateType("float64", TypeValue.Type_Float64);

            case "boolean_literal":
                return CreateType("bool", TypeValue.Type_Bool);

            case "string_literal":
                return CreateType("string", TypeValue.Type_String);

            case "move_expression":
                return this.analyzeMoveExpression(e, scope);
            case "clone_expression":
                return this.analyzeCloneExpression(e, scope);

            case "new_expression":
                const innerType = this.analyze(e.expression, scope);
                let ownedType = CreateType("owned", TypeValue.Type_Owned);
                ownedType.typeParameters = [innerType];
                return ownedType;

            case "function_call_expression":
                return (
                    this.analyzeFunctionCallExpression(scope, e) ??
                    CreateType("invalid", TypeValue.TypeInvalid)
                );

            case "binary_expression":
                return (
                    this.analyzeBinaryExpression(scope, e) ??
                    CreateType("invalid", TypeValue.TypeInvalid)
                );

            case "unary_expression":
                return (
                    this.analyzeUnaryExpression(scope, e) ??
                    CreateType("invalid", TypeValue.TypeInvalid)
                );

            case "char_literal":
                return CreateType("char", TypeValue.Type_Char);

            case "object_literal":
                return this.analyzeObjectLiteral(e, scope);

            case "member_access_expression":
                e.receiverType = this.analyze(e.receiver, scope);
                return (
                    this.analyzeMemberAccessExpression(e, scope) ??
                    CreateType("invalid", TypeValue.TypeInvalid)
                );
            case "array_literal_expression":
                return this.analyzeArrayLiteralExpression(e, scope, expectedType);
            case "index_expression":
                return this.analyzeIndexExpression(e, scope);

            default:
                return CreateType("invalid", TypeValue.TypeInvalid);
        }
    }

    private analyzeMoveExpression(
        e: Extract<Expression, { kind: "move_expression" }>,
        scope: Scope,
    ): Type {
        if (e.source.kind != "identifier") {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    "move requires a whole mutable binding, not a field, borrow, or temporary",
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        const symbol = scope.getSymbol(e.source.name);
        if (!symbol) return this.analyze(e.source, scope);
        if (!symbol.assigned) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    `binding ${symbol.name} is uninitialized and cannot be moved`,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        if (symbol.moved == "moved" || symbol.moved == "maybe")
            return this.analyze(e.source, scope);
        if ([SymbolKind.SymbolLocalConst, SymbolKind.SymbolFileConst].includes(symbol.kind)) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    `const symbol ${symbol.name} cannot be moved`,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        if (symbol.type?.reference) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    `${symbol.name} is a borrowed reference and cannot be moved`,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        symbol.moved = "moved";
        symbol.movePosition = e.position;
        return symbol.type ?? CreateType("invalid", TypeValue.TypeInvalid);
    }

    private analyzeCloneExpression(
        e: Extract<Expression, { kind: "clone_expression" }>,
        scope: Scope,
    ): Type {
        const sourceType = this.analyze(e.source, scope);
        if (sourceType.value == TypeValue.TypeInvalid) return sourceType;
        const valueType = { ...sourceType, reference: false, edit: false };
        if (this.typeAnalyzer.ownershipTier(valueType, scope) == "unique") {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    `expression of type ${valueType.name.name} is unique and cannot be cloned`,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        return valueType;
    }

    analyzeIndexExpression(e: Expression, scope: Scope): Type {
        const expr = e as IndexExpression;
        const receiverType = structuredClone(
            this.dereferenceOwnedValue(expr.receiver, this.analyze(expr.receiver, scope)),
        );
        if (receiverType.value == TypeValue.TypeInvalid) return receiverType;

        const arrayLength = receiverType.arrayLengths?.[0];
        if (arrayLength === undefined && !receiverType.slice) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    "cannot access index, receiver expression resolves to a non-array binding",
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        const indexType = this.analyze(expr.index, scope);
        if (indexType.value == TypeValue.TypeInvalid) return indexType;
        const idxTypeValue = indexType.value;

        const contextualIntegerLiteral = expr.index.kind == "integer_literal";
        if (idxTypeValue != TypeValue.Type_UIntSize && !contextualIntegerLiteral) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    expr.index.position,
                    "array index must have type uintsize",
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        if (
            arrayLength !== undefined &&
            expr.index.kind == "integer_literal" &&
            parseInt(expr.index.value) >= arrayLength
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    expr.index.position,
                    "cannot access index out of array bounds",
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        if (expr.index.kind == "identifier") {
            const symbol = scope.getSymbol(expr.index.name);
            if (!symbol) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        expr.index.position,
                        "unknown identifier: " + expr.index.name,
                    ),
                );
                return CreateType("invalid", TypeValue.TypeInvalid);
            }

            if (!!symbol.value && symbol.value.kind == "integer_literal") {
                const indexValue = parseInt(symbol.value.value);
                if (arrayLength !== undefined && indexValue >= arrayLength) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            expr.index.position,
                            "cannot access index out of array bounds",
                        ),
                    );
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }
            }
        }

        if (receiverType.slice) {
            receiverType.slice = false;
            receiverType.reference = false;
            receiverType.edit = false;
        } else {
            receiverType.arrayLengths = receiverType.arrayLengths?.slice(1);
            if (receiverType.arrayLengths?.length == 0) {
                delete receiverType.arrayLengths;
            }
        }
        return receiverType;
    }

    analyzeArrayLiteralExpression(e: Expression, scope: Scope, expectedType?: Type): Type {
        const expr = e as ArrayLiteralExpression;
        const expectedSlice =
            expectedType?.slice && !expectedType.reference
                ? { ...structuredClone(expectedType), reference: false, edit: false }
                : undefined;
        if (expectedSlice) {
            const elementType = {
                ...structuredClone(expectedSlice),
                slice: false,
                arrayLengths: undefined,
                reference: false,
                edit: false,
            };
            for (const element of expr.elements) {
                let actualType = this.analyze(element, scope, elementType);
                if (
                    element.kind == "integer_literal" &&
                    this.typeAnalyzer.isInteger(elementType) &&
                    this.typeAnalyzer.isInteger(actualType) &&
                    this.typeAnalyzer.checkIntegerRange(elementType, element)
                ) {
                    actualType = structuredClone(elementType);
                    element.expressionType = actualType;
                }
                if (
                    !this.typeAnalyzer.typesMatch(elementType, actualType) &&
                    !this.typeAnalyzer.isAliasOf(elementType, actualType, scope)
                ) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            element.position,
                            `invalid type for slice element, want ${this.typeAnalyzer.displayName(elementType)}, got ${this.typeAnalyzer.displayName(actualType)}`,
                        ),
                    );
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }
            }
            const sourceType: Type = structuredClone(elementType);
            sourceType.arrayLengths = [expr.elements.length];
            e.sliceConversion = {
                sourceType,
                targetType: structuredClone(expectedSlice),
            };
            return expectedSlice;
        }
        if (expr.elements.length == 0) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    "cannot infer the element type of an empty array literal; add a slice annotation such as `T[]`",
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        const firstElement = expr.elements[0];
        if (!firstElement) {
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        let firstElementType = structuredClone(this.analyze(firstElement, scope));
        if (firstElementType.value == TypeValue.TypeInvalid) return firstElementType;
        for (const element of expr.elements.slice(1)) {
            const elementT = this.analyze(element, scope);
            if (elementT.value == TypeValue.TypeInvalid) return elementT;
            if (!this.typeAnalyzer.arrayTypesMatch(elementT, firstElementType)) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        element.position,
                        `invalid type for array element, want ${firstElementType.name.name}, got ${elementT.name.name}`,
                    ),
                );
                return CreateType("invalid", TypeValue.TypeInvalid);
            }
        }
        // The outer literal adds one dimension before any dimensions already
        // carried by its elements, e.g. `[[1, 2], [3, 4]]` becomes `[2, 2]`.
        firstElementType.arrayLengths = [
            expr.elements.length,
            ...(firstElementType.arrayLengths ?? []),
        ];
        return firstElementType;
    }

    /** Applies the implicit fixed-array-to-slice view conversion in a typed value context. */
    private coerceToExpectedSlice(
        expression: Expression,
        actualType: Type,
        expectedType: Type | undefined,
        scope: Scope,
    ): Type {
        if (
            !expectedType?.slice ||
            expectedType.reference ||
            actualType.value == TypeValue.TypeInvalid ||
            actualType.slice
        ) {
            return actualType;
        }
        if (actualType.arrayLengths?.length != 1) return actualType;

        const expectedElement = {
            ...structuredClone(expectedType),
            slice: false,
            arrayLengths: undefined,
            reference: false,
            edit: false,
        };
        const actualElement = {
            ...structuredClone(actualType),
            slice: false,
            arrayLengths: undefined,
            reference: false,
            edit: false,
        };
        if (
            !this.typeAnalyzer.typesMatch(expectedElement, actualElement) &&
            !this.typeAnalyzer.isAliasOf(expectedElement, actualElement, scope)
        ) {
            return actualType;
        }

        const targetType = {
            ...structuredClone(expectedType),
            reference: false,
            edit: false,
        };
        expression.sliceConversion = {
            sourceType: structuredClone(actualType),
            targetType: structuredClone(targetType),
        };
        return targetType;
    }

    /** Infers the concrete element type represented by a wrapped generic such as `T[]`. */
    private inferGenericArgument(template: Type, valueType: Type): Type | undefined {
        const inferred = structuredClone(valueType);
        if (template.slice) {
            if (!valueType.slice) return;
            inferred.slice = false;
        }

        const templateDimensions = template.arrayLengths ?? [];
        const valueDimensions = valueType.arrayLengths ?? [];
        if (
            templateDimensions.length &&
            !templateDimensions.every((length, dimension) => valueDimensions[dimension] == length)
        ) {
            return;
        }
        if (templateDimensions.length) {
            const remainingDimensions = valueDimensions.slice(templateDimensions.length);
            inferred.arrayLengths = remainingDimensions.length ? remainingDimensions : undefined;
        }

        inferred.reference = false;
        inferred.edit = false;
        return inferred;
    }

    /**
     * Analyzes an object literal against its declared struct and returns its
     * resolved type. Every required field must appear once, no unknown fields
     * are allowed, and each value must match the corresponding field type.
     */
    analyzeObjectLiteral(e: ObjectLiteralExpression, scope: Scope): Type {
        const typeSym = scope.getSymbol(e.type.name.name);
        if (!typeSym) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.type.name.position ?? e.type.position ?? (e as Expression).position,
                    "unknown type identifier: " + e.type.name.name,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        // Alias symbols retain the source-level target name so compatibility
        // checks can distinguish and canonicalize aliases. Object literals,
        // however, need the concrete record shape. Follow the complete alias
        // chain before validating fields while preserving the name used at
        // the construction site on the resulting expression type.
        let targetSym = typeSym;
        const seenAliases = new Set<string>();
        while (
            targetSym.kind == SymbolKind.SymbolTypsAliasDecl &&
            targetSym.type &&
            !seenAliases.has(targetSym.name)
        ) {
            seenAliases.add(targetSym.name);
            const next = scope.getSymbol(targetSym.type.name.name);
            if (!next) break;
            targetSym = next;
        }

        const target = structuredClone(targetSym.type!);
        target.name = structuredClone(e.type.name);
        e.type = target;
        const supplied = new Set<string>();
        const concreteTypesMap = new Map<string, Type[]>();

        const inferGenericFieldArgument = (template: Type, valueType: Type): Type | undefined => {
            const inferred = structuredClone(valueType);
            if (template.slice) {
                if (!valueType.slice) return;
                inferred.slice = false;
            }
            const templateDimensions = template.arrayLengths ?? [];
            const valueDimensions = valueType.arrayLengths ?? [];
            if (
                templateDimensions.length &&
                !templateDimensions.every(
                    (length, dimension) => valueDimensions[dimension] == length,
                )
            ) {
                return;
            }
            if (templateDimensions.length) {
                const remainingDimensions = valueDimensions.slice(templateDimensions.length);
                inferred.arrayLengths = remainingDimensions.length
                    ? remainingDimensions
                    : undefined;
            }
            inferred.reference = false;
            inferred.edit = false;
            return inferred;
        };

        const provide = (
            name: string,
            haveT: Type,
            namePosition: Expression["position"],
            valuePosition = namePosition,
        ): boolean => {
            if (supplied.has(name)) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        namePosition,
                        "duplicate field(s) in object literal: " + name,
                    ),
                );
                return false;
            }
            const field = target.fields?.find((candidate) => candidate.name.name == name);
            if (!field) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        namePosition,
                        "unknown fields in object literal: " + name,
                    ),
                );
                return false;
            }
            let wantT = field.type;
            if (wantT.value == TypeValue.TypeGeneric) {
                const index =
                    target.typeParameters?.findIndex(
                        (parameter) => parameter.name.name == wantT.name.name,
                    ) ?? -1;
                const inferredArgument = inferGenericFieldArgument(field.type, haveT);
                let genericArgument = e.genericTypes?.[index] ?? inferredArgument;
                if (
                    genericArgument?.value == TypeValue.TypeCustom &&
                    inferredArgument?.value == TypeValue.TypeGeneric &&
                    genericArgument.name.name == inferredArgument.name.name
                ) {
                    genericArgument = inferredArgument;
                }
                if (genericArgument) {
                    wantT = this.typeAnalyzer.substituteType(
                        field.type,
                        new Map([[field.type.name.name, genericArgument]]),
                    );
                }
                e.genericTypes ??= [];
                if (index >= 0 && genericArgument) e.genericTypes[index] = genericArgument;
                if (genericArgument && genericArgument.value != TypeValue.TypeGeneric) {
                    concreteTypesMap.set(field.type.name.name, [genericArgument]);
                }
            }
            if (
                !this.typeAnalyzer.arrayTypesMatch(haveT, wantT) &&
                !this.typeAnalyzer.isAliasOf(wantT, haveT, scope)
            ) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        valuePosition,
                        `value of member ${name} does not match the required type, want ${this.typeAnalyzer.displayName(wantT)}, got ${this.typeAnalyzer.displayName(haveT)}`,
                    ),
                );
                return false;
            }
            supplied.add(name);
            return true;
        };

        for (const element of e.elements) {
            if (element.kind == "spread_element") {
                const spreadT = this.analyze(element.source, scope);
                if (spreadT.value == TypeValue.TypeInvalid) return spreadT;
                const resolvedSpread = spreadT.fields
                    ? spreadT
                    : scope.getSymbol(spreadT.name.name)?.type;
                if (!resolvedSpread?.fields) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            element.position,
                            `cannot spread non-record type ${spreadT.name.name}`,
                        ),
                    );
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }
                for (const field of resolvedSpread.fields) {
                    if (!provide(field.name.name, field.type, element.position))
                        return CreateType("invalid", TypeValue.TypeInvalid);
                }
                continue;
            }
            const field = target.fields?.find(
                (candidate) => candidate.name.name == element.field.name.name,
            );
            if (
                element.field.value.kind == "object_literal" &&
                field &&
                !element.field.value.type.name.name
            ) {
                element.field.value.type = structuredClone(field.type);
            }
            let haveT = this.analyze(element.field.value, scope, field?.type);
            if (haveT.value == TypeValue.TypeInvalid) return haveT;
            if (
                field &&
                this.typeAnalyzer.isIndirection(field.type) &&
                element.field.value.kind == "identifier" &&
                this.typeAnalyzer.isIndirection(haveT)
            ) {
                const source = scope.getSymbol(element.field.value.name);
                const directAllocation =
                    source?.declaration?.kind == "variable_declaration_statement" &&
                    source.declaration.value?.kind == "new_expression";
                if (!directAllocation) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            element.field.value.position,
                            `owned field ${element.field.name.name} requires move or a direct-new staging owner`,
                        ),
                    );
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }
                element.field.value.ownershipTransfer = true;
                source.moved = "moved";
                source.movePosition = element.field.value.position;
            }
            if (
                element.field.value.kind == "new_expression" &&
                field &&
                this.typeAnalyzer.isIndirection(field.type)
            ) {
                const expectedInner = field.type.typeParameters?.[0];
                const actualInner = haveT.typeParameters?.[0];
                if (
                    expectedInner &&
                    actualInner &&
                    (this.typeAnalyzer.typesMatch(expectedInner, actualInner) ||
                        this.typeAnalyzer.isAliasOf(expectedInner, actualInner, scope))
                ) {
                    haveT = structuredClone(field.type);
                    element.field.value.expressionType = haveT;
                }
            }
            if (
                !provide(
                    element.field.name.name,
                    haveT,
                    element.position,
                    element.field.value.position,
                )
            )
                return CreateType("invalid", TypeValue.TypeInvalid);
        }
        const missing = (target.fields ?? [])
            .map((field) => field.name.name)
            .filter((name) => !supplied.has(name));
        if (missing.length) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    (e as Expression).position,
                    "missing field(s) in object literal: " + missing.join(", "),
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        e.concreteTypeMap = concreteTypesMap;
        const genericBindings = new Map<string, Type>();
        (target.typeParameters ?? []).forEach((parameter, index) => {
            const argument = e.genericTypes?.[index];
            if (argument) genericBindings.set(parameter.name.name, argument);
        });
        e.type = this.typeAnalyzer.substituteType(target, genericBindings);
        e.type.name = structuredClone(target.name);
        e.type.typeParameters = e.genericTypes;

        const structDeclaration = targetSym.declaration;
        if (
            structDeclaration?.kind == "type_declaration" &&
            structDeclaration.declKind == TypeDeclKind.Struct
        ) {
            const struct = structDeclaration.declaration as StructDecl;
            struct.concreteTypesMap ??= new Map<string, Type[]>();
            for (const [genericName, concreteTypes] of concreteTypesMap) {
                const recordedTypes = struct.concreteTypesMap.get(genericName) ?? [];
                for (const concreteType of concreteTypes) {
                    if (concreteType.value == TypeValue.TypeGeneric) continue;
                    if (
                        !recordedTypes.some((recordedType) =>
                            this.typeAnalyzer.typesMatch(recordedType, concreteType),
                        )
                    ) {
                        recordedTypes.push(concreteType);
                    }
                }
                struct.concreteTypesMap.set(genericName, recordedTypes);
            }
        }
        return e.type;
    }

    /**
     * Resolves a member access on a struct or enum. Union members cannot be
     * accessed directly; enum members evaluate to `int32`.
     */
    analyzeMemberAccessExpression(e: MemberAccessExpression, scope: Scope): U<Type> {
        let receiverT = e.receiverType;
        if (receiverT.value == TypeValue.TypeInvalid) return receiverT;

        if (receiverT.value == TypeValue.Type_Owned) {
            receiverT = receiverT.typeParameters![0]!;
        }

        // A field can itself be a struct. Resolve that named type before
        // looking for its fields, while preserving any array dimensions.
        if (receiverT.value == TypeValue.TypeCustom && !receiverT.fields) {
            const typeSymbol = scope.getSymbol(receiverT.name.name);
            if (typeSymbol?.type) {
                const arrayLengths = receiverT.arrayLengths;
                const slice = receiverT.slice;
                const declaredTypeParameters = typeSymbol.type.typeParameters ?? [];
                const bindings = new Map<string, Type>();
                declaredTypeParameters.forEach((parameter, index) => {
                    const typeArgument = receiverT.typeParameters?.[index];
                    if (typeArgument) {
                        bindings.set(parameter.name.name, typeArgument);
                    }
                });
                receiverT = this.typeAnalyzer.substituteType(typeSymbol.type, bindings);
                receiverT.arrayLengths = arrayLengths ?? receiverT.arrayLengths;
                receiverT.slice = slice ?? receiverT.slice;
            }
        }

        if (receiverT.kind == "union") {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.receiver.position,
                    "cannot access member of union " + receiverT.name.name,
                ),
            );
            return;
        }

        if (receiverT.kind == "enum") {
            const memberT = receiverT.variants?.find(
                (x) => x.name.name == (e.member as Identifier).name,
            );
            if (!memberT) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        e.member.position ?? (e as Expression).position,
                        `enum ${receiverT.name.name} has no variant \`${e.member.name}\``,
                    ),
                );
                return;
            }
            e.enumMember = true;
            return CreateType("int32", TypeValue.Type_Int32);
        }

        if (receiverT.arrayLengths?.length && (e.member as Identifier).name == "length") {
            return CreateType("uintsize", TypeValue.Type_UIntSize);
        }

        if (receiverT.slice && ["length", "size"].includes((e.member as Identifier).name)) {
            return CreateType("uintsize", TypeValue.Type_UIntSize);
        }

        if (receiverT.value == TypeValue.Type_String && e.member.name == "length") {
            return CreateType("uintsize", TypeValue.Type_UIntSize);
        }

        const memberT = receiverT.fields?.find((x) => x.name.name == (e.member as Identifier).name);
        if (!memberT) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.member.position ?? (e as Expression).position,
                    `type ${receiverT.name.name} has no member \`${e.member.name}\``,
                ),
            );
            return;
        }
        return structuredClone(memberT.type);
    }

    /**
     * Infers a unary expression's operand type and validates its operator.
     * `!` needs `bool`; `-` and `~` reject `bool`; `++` and `--` require a
     * mutable integer binding.
     */
    analyzeUnaryExpression(scope: Scope, e: Expression): U<Type> {
        const unaryExpr = e as UnaryExpression;
        const operandT = this.dereferenceOwnedValue(
            unaryExpr.operand,
            this.analyze(unaryExpr.operand, scope),
        );
        unaryExpr.type = operandT.name.name;
        if (operandT.value == TypeValue.TypeInvalid) return operandT;

        if (unaryExpr.operator == string(TokenKind.Symbol_Not)) {
            if (operandT.value != TypeValue.Type_Bool) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        e.position,
                        `unary operation '!' expects a bool operand, found \`${operandT.name.name}\``,
                    ),
                );
                return;
            }
        }

        if (
            [string(TokenKind.Symbol_Minus), string(TokenKind.Symbol_Tilde)].includes(
                unaryExpr.operator,
            ) &&
            operandT.value == TypeValue.Type_Bool
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    `unary operation \`${unaryExpr.operator}\` expects a numeric operand such as int32, found bool`,
                ),
            );
            return;
        }

        if (
            [string(TokenKind.Symbol_Increment), string(TokenKind.Symbol_Decrement)].includes(
                unaryExpr.operator,
            )
        ) {
            const operandTValue = operandT.value;
            if (!operandTValue.startsWith("Type_Int") && !operandTValue.startsWith("Type_UInt")) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        e.position,
                        "operand must be an integer binding",
                    ),
                );
                return;
            }

            if (unaryExpr.operand.kind == "identifier") {
                const symbol = scope.getSymbol(unaryExpr.operand.name);
                if (!symbol) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            e.position,
                            "unknown symbol: " + unaryExpr.operand.name,
                        ),
                    );
                    return;
                }

                if (
                    symbol.kind == SymbolKind.SymbolLocalConst ||
                    symbol.kind == SymbolKind.SymbolFileConst
                ) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            e.position,
                            "cannot modify const binding " + unaryExpr.operand.name,
                        ),
                    );
                    return;
                }
            }
        }

        return operandT;
    }

    /** Returns whether an expression is an integer literal. */
    isIntegerLiteral(x: Expression) {
        return x.kind == "integer_literal";
    }

    /** Returns whether an expression is a floating-point literal. */
    isFloatLiteral(x: Expression) {
        return x.kind == "float_literal";
    }

    /** Resolves a string expression whose complete value is known during analysis. */
    private constantStringValue(
        expression: Expression,
        scope: Scope,
        seen = new Set<string>(),
    ): string | undefined {
        if (expression.kind == "string_literal") {
            return decodeStringLiteral(expression.value);
        }
        if (expression.kind == "binary_expression" && expression.operator == "+") {
            if (expression.constantStringValue !== undefined) {
                return expression.constantStringValue;
            }
            const left = this.constantStringValue(expression.left, scope, new Set(seen));
            const right = this.constantStringValue(expression.right, scope, new Set(seen));
            return left !== undefined && right !== undefined ? left + right : undefined;
        }
        if (expression.kind != "identifier" || seen.has(expression.name)) {
            return;
        }
        const symbol = scope.getSymbol(expression.name);
        if (
            !symbol?.value ||
            ![SymbolKind.SymbolLocalConst, SymbolKind.SymbolFileConst].includes(symbol.kind)
        ) {
            return;
        }
        seen.add(expression.name);
        return this.constantStringValue(symbol.value, scope, seen);
    }

    /**
     * Validates a binary expression. Comparisons produce `bool`; other
     * operators produce the shared operand type when their operands match.
     */
    analyzeBinaryExpression(scope: Scope, e: Expression): U<Type> {
        const binaryExpr = e as BinaryExpression;
        const leftT = this.dereferenceOwnedValue(
            binaryExpr.left,
            this.analyze(binaryExpr.left, scope),
        );
        const rightT = this.dereferenceOwnedValue(
            binaryExpr.right,
            this.analyze(binaryExpr.right, scope),
        );

        binaryExpr.types = {
            leftT: leftT.name.name,
            rightT: rightT.name.name,
        };

        if ([leftT.value, rightT.value].includes(TypeValue.TypeInvalid))
            return CreateType("invalid", TypeValue.TypeInvalid);
        const operator = binaryExpr.operator;
        const logical = ["&&", "||"].includes(operator);
        const equality = ["==", "!="].includes(operator);
        const ordered = ["<", "<=", ">", ">="].includes(operator);
        const arithmetic = ["+", "-", "*", "/", "%"].includes(operator);
        const bitwise = ["&", "|", "^", "<<", ">>"].includes(operator);
        const literalCompatible =
            ((this.isIntegerLiteral(binaryExpr.left) || this.isIntegerLiteral(binaryExpr.right)) &&
                this.typeAnalyzer.isInteger(leftT) &&
                this.typeAnalyzer.isInteger(rightT)) ||
            ((this.isFloatLiteral(binaryExpr.left) || this.isFloatLiteral(binaryExpr.right)) &&
                this.typeAnalyzer.isFloat(leftT) &&
                this.typeAnalyzer.isFloat(rightT));
        const matches =
            this.typeAnalyzer.typesMatch(leftT, rightT) ||
            literalCompatible ||
            this.typeAnalyzer.isAliasOf(leftT, rightT, scope) ||
            this.typeAnalyzer.isAliasOf(rightT, leftT, scope);
        const fail = (message: string): U<Type> => {
            this.diagnostics.addError(
                Error(this.diagnostics.fileName, "semantic", e.position, message),
            );
            return;
        };

        if (
            operator == "+" &&
            leftT.value == TypeValue.Type_String &&
            rightT.value == TypeValue.Type_String
        ) {
            const left = this.constantStringValue(binaryExpr.left, scope);
            const right = this.constantStringValue(binaryExpr.right, scope);
            if (left === undefined || right === undefined) {
                return fail(
                    "runtime string concatenation requires owned storage; use dynamicstring.concat(...) instead",
                );
            }
            binaryExpr.constantStringValue = left + right;
            return CreateType("string", TypeValue.Type_String);
        }

        if (logical) {
            if (leftT.value != TypeValue.Type_Bool || rightT.value != TypeValue.Type_Bool) {
                return fail(
                    `binary operation \`${operator}\` expects bool operands, found \`${leftT.name.name}\`, and \`${rightT.name.name}\``,
                );
            }
            return CreateType("bool", TypeValue.Type_Bool);
        }
        if (equality) {
            if (
                !matches ||
                leftT.value == TypeValue.Type_String ||
                (leftT.value == TypeValue.TypeCustom && leftT.kind != "enum")
            ) {
                return fail(
                    `binary operation \`${operator}\` cannot be compared with mismatched operand types \`${leftT.name.name}\` and \`${rightT.name.name}\``,
                );
            }
            return CreateType("bool", TypeValue.Type_Bool);
        }
        if (ordered) {
            const orderable =
                this.typeAnalyzer.isInteger(leftT) ||
                this.typeAnalyzer.isFloat(leftT) ||
                leftT.value == TypeValue.Type_Char ||
                leftT.kind == "enum";
            if (!matches || !orderable)
                return fail(
                    `operand types \`${leftT.name.name}\` and \`${rightT.name.name}\` cannot be compared with \`${operator}\``,
                );
            return CreateType("bool", TypeValue.Type_Bool);
        }
        if (arithmetic) {
            const numeric =
                (this.typeAnalyzer.isInteger(leftT) && this.typeAnalyzer.isInteger(rightT)) ||
                (this.typeAnalyzer.isFloat(leftT) && this.typeAnalyzer.isFloat(rightT));
            if (!matches || !numeric)
                return fail(
                    `binary operation \`${operator}\` expects matching numeric operands, found \`${leftT.name.name}\`, and \`${rightT.name.name}\``,
                );
            return leftT;
        }
        if (bitwise) {
            if (
                !matches ||
                !this.typeAnalyzer.isInteger(leftT) ||
                !this.typeAnalyzer.isInteger(rightT)
            ) {
                return fail(
                    `binary operation \`${operator}\` expects matching integer operands, found \`${leftT.name.name}\`, and \`${rightT.name.name}\``,
                );
            }
            return leftT;
        }
        return fail(`unknown binary operator \`${operator}\``);
    }

    /**
     * Resolves a function call and checks its argument count and types. When
     * no function symbol exists, a primitive-named callee is treated as a
     * conversion and returns the converted type.
     */
    analyzeFunctionCallExpression(scope: Scope, e: FunctionCallExpression): U<Type> {
        if (e.callee.kind == "member_access_expression") {
            return this.analyzeMethodCall(scope, e, e.callee);
        }
        const calleeName = e.callee.kind == "identifier" ? e.callee.name : "";
        const sym = calleeName ? scope.getSymbol(calleeName) : undefined;

        if (sym) {
            if (!sym.signature) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        e.position,
                        sym.name + " is not callable",
                    ),
                );
                return CreateType("invalid", TypeValue.TypeInvalid);
            }

            const paramCount = sym.signature.parameters.length;
            const argCount = e.arguments.length;
            e.resolvedParameterTypes = sym.signature.parameters.map((parameter) => parameter.type);
            let concreteTypesMap = new Map<string, Type[]>();
            const typeParameters = sym.signature.typeParameters ?? [];
            const genericTypes = (e.genericTypes ??= []);

            if (paramCount != argCount) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        e.position,
                        `function ${sym.name} expects ${paramCount} arguments, found ${argCount}`,
                    ),
                );
                return CreateType("invalid", TypeValue.TypeInvalid);
            }

            const borrowUses = new Map<string, { count: number; edit: boolean }>();
            e.arguments.forEach((argument, index) => {
                const parameter = sym.signature?.parameters[index]?.type;
                if (!parameter?.reference) return;
                const root = this.rootIdentifier(argument);
                if (!root) return;
                const use = borrowUses.get(root) ?? { count: 0, edit: false };
                use.count++;
                use.edit ||= !!parameter.edit;
                borrowUses.set(root, use);
            });
            for (const [root, use] of borrowUses) {
                if (use.edit && use.count > 1) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            e.position,
                            `cannot borrow ${root} as edit & while it is also borrowed elsewhere in the same call; a mutable borrow must be exclusive`,
                        ),
                    );
                }
            }

            e.arguments.forEach((x, i) => {
                const parameterTemplate = sym.signature?.parameters[i]?.type;
                let wantT = parameterTemplate;
                if (parameterTemplate?.value == TypeValue.TypeGeneric) {
                    const typeIndex = typeParameters.findIndex(
                        (typeParameter) => typeParameter.name.name == parameterTemplate.name.name,
                    );
                    const explicitType = genericTypes[typeIndex];
                    if (explicitType) {
                        wantT = this.typeAnalyzer.substituteType(
                            parameterTemplate,
                            new Map([[parameterTemplate.name.name, explicitType]]),
                        );
                    }
                }
                if (x.kind == "object_literal" && wantT && !x.type.name.name)
                    x.type = structuredClone(wantT);
                let argT = this.analyze(x, scope, wantT);
                if (argT.value == TypeValue.TypeInvalid) return;

                if (wantT?.value == TypeValue.TypeCustom && wantT.typeParameters?.length) {
                    wantT.typeParameters.forEach((typeArgument, argumentIndex) => {
                        if (typeArgument.value != TypeValue.TypeGeneric) {
                            return;
                        }

                        const inferredType = argT.typeParameters?.[argumentIndex];
                        if (!inferredType) {
                            return;
                        }

                        const typeIndex = typeParameters.findIndex(
                            (typeParameter) => typeParameter.name.name == typeArgument.name.name,
                        );
                        genericTypes[typeIndex] ??= inferredType;
                        concreteTypesMap.set(typeArgument.name.name, [genericTypes[typeIndex]!]);
                    });
                }

                if (parameterTemplate?.value == TypeValue.TypeGeneric) {
                    const typeIndex = typeParameters.findIndex(
                        (typeParameter) => typeParameter.name.name == parameterTemplate.name.name,
                    );

                    let concreteType = genericTypes[typeIndex];
                    if (!concreteType) {
                        concreteType = this.inferGenericArgument(parameterTemplate, argT);
                        if (concreteType) genericTypes[typeIndex] = concreteType;
                    }
                    if (concreteType) {
                        wantT = this.typeAnalyzer.substituteType(
                            parameterTemplate,
                            new Map([[parameterTemplate.name.name, concreteType]]),
                        );
                    }

                    if (concreteType) {
                        if (concreteTypesMap.has(parameterTemplate.name.name)) {
                            concreteTypesMap.get(parameterTemplate.name.name)?.push(concreteType);
                        } else {
                            concreteTypesMap.set(parameterTemplate.name.name, [concreteType]);
                        }
                    }
                }

                if (wantT?.value == TypeValue.TypeCustom) {
                    const typeSymbol = scope.getSymbol(wantT.name.name);
                    if (!typeSymbol) {
                        this.diagnostics.addError(
                            Error(
                                this.diagnostics.fileName,
                                "semantic",
                                x.position,
                                "unknown type identifier: " + wantT.name.name,
                            ),
                        );
                        return;
                    }
                    if (!typeSymbol.type) {
                        // The name resolves to a symbol that carries no value
                        // type. Declaring the parameter that way was already
                        // reported against the callee, so this argument is left
                        // alone rather than matched against a type that does
                        // not exist.
                        return;
                    }
                    const bindings = new Map<string, Type>();
                    typeSymbol.type.typeParameters?.forEach((typeParameter, index) => {
                        let typeArgument = wantT?.typeParameters?.[index];
                        if (typeArgument?.value == TypeValue.TypeGeneric) {
                            const genericIndex = typeParameters.findIndex(
                                (parameter) => parameter.name.name == typeArgument?.name.name,
                            );
                            typeArgument = genericTypes[genericIndex];
                        }
                        if (typeArgument) {
                            bindings.set(typeParameter.name.name, typeArgument);
                        }
                    });
                    wantT = this.typeAnalyzer.substituteType(typeSymbol.type, bindings);
                }

                // Indirection is transparent when a call requests a copyable
                // pointee value. The handle itself is neither copied nor moved.
                if (this.typeAnalyzer.isIndirection(argT)) {
                    const pointee = argT.typeParameters?.[0];
                    if (
                        pointee &&
                        wantT &&
                        (this.typeAnalyzer.typesMatch(wantT, pointee) ||
                            this.typeAnalyzer.isAliasOf(wantT, pointee, scope))
                    ) {
                        argT = pointee;
                    }
                }

                if (sym.signature?.parameters[i]?.type.reference) {
                    const referenceTemplate = sym.signature.parameters[i]!.type;
                    const declaredReference = {
                        ...(wantT ?? referenceTemplate),
                        reference: referenceTemplate.reference,
                        edit: referenceTemplate.edit,
                    };
                    const root = this.rootIdentifier(x);
                    if (!root) {
                        this.diagnostics.addError(
                            Error(
                                this.diagnostics.fileName,
                                "semantic",
                                x.position,
                                "cannot pass a function call or temporary as a borrowed reference",
                            ),
                        );
                        return;
                    }
                    const rootSymbol = scope.getSymbol(root);
                    if (
                        declaredReference.edit &&
                        (rootSymbol?.kind == SymbolKind.SymbolLocalConst ||
                            rootSymbol?.kind == SymbolKind.SymbolFileConst ||
                            (rootSymbol?.kind == SymbolKind.SymbolParameter &&
                                !rootSymbol.type?.edit) ||
                            (argT.reference && !argT.edit))
                    ) {
                        this.diagnostics.addError(
                            Error(
                                this.diagnostics.fileName,
                                "semantic",
                                x.position,
                                `cannot upgrade read-only or const borrow ${root} to edit capability`,
                            ),
                        );
                        return;
                    }
                    if (!this.referenceCompatible(declaredReference, argT, scope)) {
                        this.diagnostics.addError(
                            Error(
                                this.diagnostics.fileName,
                                "semantic",
                                x.position,
                                `argument ${i + 1} of function ${calleeName} has type \`${argT.name.name}\`, want \`${declaredReference.name.name}\``,
                            ),
                        );
                    }
                    return;
                }

                if (
                    x.kind != "move_expression" &&
                    this.typeAnalyzer.ownershipTier(argT, scope) != "copyable"
                ) {
                    const tier = this.typeAnalyzer.ownershipTier(argT, scope);
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            x.position,
                            tier == "unique"
                                ? `cannot pass ${argT.name.name} as value because it is unique; use move`
                                : `cannot pass ${argT.name.name} as value because it is non-copyable; use move`,
                        ),
                    );
                    return;
                }

                if (this.typeAnalyzer.arrayTypesMatch(wantT!, argT)) {
                    return;
                }

                if (
                    x.kind == "integer_literal" &&
                    this.typeAnalyzer.isInteger(wantT!) &&
                    this.typeAnalyzer.isInteger(argT) &&
                    this.typeAnalyzer.checkIntegerRange(wantT!, x)
                ) {
                    return;
                }

                if (this.typeAnalyzer.isAliasOf(wantT!, argT, scope)) {
                    return;
                }

                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        x.position,
                        `argument ${i + 1} of function ${calleeName} has type \`${this.typeAnalyzer.displayName(argT)}\`, want \`${this.typeAnalyzer.displayName(wantT!)}\``,
                    ),
                );
            });

            // A void success channel still needs its type arguments validated
            // and its specialization recorded; only the produced type differs,
            // so the void case must not short-circuit the checks below.
            let returnType = sym.signature.returnTypes[0];
            if (returnType?.value == TypeValue.TypeGeneric) {
                const typeIndex = typeParameters.findIndex(
                    (x) => x.name.name == returnType?.name.name,
                );

                returnType = genericTypes[typeIndex]!;
            }

            const missingTypeArgument = typeParameters.some((_, index) => !genericTypes[index]);
            if (genericTypes.length != typeParameters.length || missingTypeArgument) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        e.position,
                        `mismatched type parameter count, want ${typeParameters.length}, got ${genericTypes.length}`,
                    ),
                );
                return CreateType("invalid", TypeValue.TypeInvalid);
            }

            const returnTypeBindings = new Map<string, Type>();
            typeParameters.forEach((typeParameter, index) => {
                returnTypeBindings.set(typeParameter.name.name, genericTypes[index]!);
            });
            if (returnType) {
                returnType = this.typeAnalyzer.substituteType(returnType, returnTypeBindings);
                this.recordConcreteStructInstantiation(returnType, scope);
            }

            const declaration = sym.signature.declaration!;
            declaration.concreteTypesMap ??= new Map<string, Type[]>();
            for (const [genericName, concreteTypes] of concreteTypesMap) {
                const recordedTypes = declaration.concreteTypesMap.get(genericName) ?? [];
                for (const concreteType of concreteTypes) {
                    if (
                        !recordedTypes.some((recordedType) =>
                            this.typeAnalyzer.typesMatch(recordedType, concreteType),
                        )
                    ) {
                        recordedTypes.push(concreteType);
                    }
                }
                declaration.concreteTypesMap.set(genericName, recordedTypes);
            }
            return returnType ?? CreateType("void", TypeValue.TypeInvalid, e.position);
        }

        const convSig = this.getConverterFunction(calleeName);
        if (!convSig) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    "unknown function: " + calleeName,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        if (e.arguments.length != 1) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    `conversion ${calleeName} expects 1 argument, found ${e.arguments.length}`,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        const argument = e.arguments[0]!;
        const argT = this.dereferenceOwnedValue(argument, this.analyze(argument, scope));
        if (argT.value == TypeValue.TypeInvalid) return argT;
        const wantT = convSig.parameters[0]!.type;

        e.conversion = { fromType: argT.name.name, toType: calleeName };

        const valid =
            (this.typeAnalyzer.isInteger(argT) && this.typeAnalyzer.isInteger(wantT)) ||
            (this.typeAnalyzer.isFloat(argT) && this.typeAnalyzer.isInteger(wantT)) ||
            (this.typeAnalyzer.isInteger(argT) && this.typeAnalyzer.isFloat(wantT)) ||
            (this.typeAnalyzer.isFloat(argT) && this.typeAnalyzer.isFloat(wantT)) ||
            (this.typeAnalyzer.isInteger(argT) && wantT.value == TypeValue.Type_Char);
        if (!valid) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    "conversion from " +
                        argT.name.name +
                        " to " +
                        wantT.name.name +
                        " is not allowed",
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        return convSig.returnTypes[0]!;
    }

    private analyzeMethodCall(
        scope: Scope,
        call: FunctionCallExpression,
        member: MemberAccessExpression,
    ): Type {
        const receiverType = this.analyze(member.receiver, scope);
        if (receiverType.value == TypeValue.TypeInvalid) return receiverType;
        let recordType = receiverType;
        if (recordType.value == TypeValue.Type_Owned)
            recordType = recordType.typeParameters?.[0] ?? recordType;
        const typeSymbol = scope.getSymbol(recordType.name.name);
        if (typeSymbol?.kind == SymbolKind.SymbolTypsAliasDecl && typeSymbol.type)
            recordType = typeSymbol.type;
        const signature = scope.getMethod(recordType.name.name, member.member.name);
        if (!signature) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    (member as Expression).position,
                    recordType.value == TypeValue.TypeGeneric
                        ? `type parameter ${recordType.name.name} has no known method \`${member.member.name}\``
                        : `type ${recordType.name.name} has no method \`${member.member.name}\``,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        this.recordConcreteStructInstantiation(recordType, scope);
        if (member.member.name == "dispose") {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    (member as Expression).position,
                    `dispose method on ${recordType.name.name} cannot be called manually`,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        if (signature.receiverEdit) {
            const root = this.rootIdentifier(member.receiver);
            const symbol = root ? scope.getSymbol(root) : undefined;
            if (receiverType.reference && !receiverType.edit) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        (member as Expression).position,
                        `read-only receiver lacks edit capability for method ${member.member.name}`,
                    ),
                );
            } else if (
                symbol &&
                [
                    SymbolKind.SymbolLocalConst,
                    SymbolKind.SymbolFileConst,
                    SymbolKind.SymbolParameter,
                ].includes(symbol.kind)
            ) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        (member as Expression).position,
                        `cannot call edit method ${member.member.name} on const receiver ${root}`,
                    ),
                );
            }
        }
        if (call.arguments.length != signature.parameters.length) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    call.position,
                    `argument count mismatch for method ${member.member.name}, need ${signature.parameters.length}, got ${call.arguments.length}`,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        const methodTypeParameters = signature.typeParameters ?? [];
        const bindings = new Map<string, Type>();
        const receiverTypeParameters = typeSymbol?.type?.typeParameters ?? [];
        receiverTypeParameters.forEach((parameter, index) => {
            const concreteType = recordType.typeParameters?.[index];
            if (
                concreteType &&
                methodTypeParameters.some(
                    (methodParameter) => methodParameter.name.name == parameter.name.name,
                )
            ) {
                bindings.set(parameter.name.name, concreteType);
            }
        });

        const explicitTypeArguments = call.genericTypes ?? [];
        if (
            explicitTypeArguments.length &&
            explicitTypeArguments.length != methodTypeParameters.length
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    call.position,
                    `method ${member.member.name} expects ${methodTypeParameters.length} type argument(s), found ${explicitTypeArguments.length}`,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }
        let invalidTypeArgument = false;
        explicitTypeArguments.forEach((typeArgument, index) => {
            const parameter = methodTypeParameters[index];
            if (!parameter) return;
            const receiverBinding = bindings.get(parameter.name.name);
            if (receiverBinding && !this.typeAnalyzer.typesMatch(receiverBinding, typeArgument)) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        call.position,
                        `type argument ${this.typeAnalyzer.displayName(typeArgument)} conflicts with receiver type ${this.typeAnalyzer.displayName(receiverBinding)} for ${parameter.name.name}`,
                    ),
                );
                invalidTypeArgument = true;
                return;
            }
            bindings.set(parameter.name.name, typeArgument);
        });
        if (invalidTypeArgument) return CreateType("invalid", TypeValue.TypeInvalid);

        let invalidArgument = false;
        const resolvedParameters = signature.parameters.map((parameter) => ({
            ...parameter,
            type: this.typeAnalyzer.substituteType(parameter.type, bindings),
        }));
        call.arguments.forEach((argument, index) => {
            const expected = resolvedParameters[index]!.type;
            if (argument.kind == "object_literal" && !argument.type.name.name)
                argument.type = structuredClone(expected);
            const actual = this.analyze(argument, scope, expected);
            if (actual.value == TypeValue.TypeInvalid) {
                invalidArgument = true;
                return;
            }
            if (!this.referenceCompatible(expected, actual, scope)) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        argument.position,
                        `argument ${index + 1} of method ${member.member.name} requires type ${expected.name.name}, got ${actual.name.name}`,
                    ),
                );
                invalidArgument = true;
            }
        });
        if (invalidArgument) return CreateType("invalid", TypeValue.TypeInvalid);

        const missingTypeParameter = methodTypeParameters.find(
            (parameter) => !bindings.has(parameter.name.name),
        );
        if (missingTypeParameter) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    call.position,
                    `cannot infer type argument ${missingTypeParameter.name.name} for method ${member.member.name}`,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        const concreteTypes = methodTypeParameters.map(
            (parameter) => bindings.get(parameter.name.name)!,
        );
        if (methodTypeParameters.length) call.genericTypes = concreteTypes;
        const declaration = signature.declaration;
        if (declaration && methodTypeParameters.length) {
            declaration.concreteTypesMap ??= new Map<string, Type[]>();
            methodTypeParameters.forEach((parameter, index) => {
                const concreteType = concreteTypes[index]!;
                const recorded = declaration.concreteTypesMap!.get(parameter.name.name) ?? [];
                if (
                    concreteType.value != TypeValue.TypeGeneric &&
                    !recorded.some((type) => this.typeAnalyzer.typesMatch(type, concreteType))
                ) {
                    recorded.push(concreteType);
                }
                declaration.concreteTypesMap!.set(parameter.name.name, recorded);
            });
        }

        call.resolvedErrorTypes = signature.errorTypes.map((type) =>
            this.typeAnalyzer.substituteType(type, bindings),
        );
        call.resolvedParameterTypes = resolvedParameters.map((parameter) => parameter.type);
        call.resolvedReceiverType = recordType.name.name;
        call.resolvedReceiverParameter = signature.receiverType
            ? this.typeAnalyzer.substituteType(signature.receiverType, bindings)
            : undefined;
        member.receiverType = receiverType;
        const returnType = signature.returnTypes[0]
            ? this.typeAnalyzer.substituteType(signature.returnTypes[0], bindings)
            : CreateType("void", TypeValue.TypeInvalid, call.position);
        this.recordConcreteStructInstantiation(returnType, scope);
        return returnType;
    }

    private recordConcreteStructInstantiation(type: Type, scope: Scope): void {
        if (type.value != TypeValue.TypeCustom || !type.typeParameters?.length) return;
        const symbol = scope.getSymbol(type.name.name);
        const declaration =
            symbol?.declaration?.kind == "type_declaration" &&
            symbol.declaration.declKind == TypeDeclKind.Struct
                ? (symbol.declaration.declaration as StructDecl)
                : undefined;
        if (!declaration?.typeParameters?.length) return;
        declaration.concreteTypesMap ??= new Map<string, Type[]>();
        declaration.typeParameters.forEach((parameter, index) => {
            const concreteType = type.typeParameters?.[index];
            if (!concreteType || concreteType.value == TypeValue.TypeGeneric) return;
            const recorded = declaration.concreteTypesMap!.get(parameter.name.name) ?? [];
            if (
                !recorded.some((candidate) => this.typeAnalyzer.typesMatch(candidate, concreteType))
            ) {
                recorded.push(concreteType);
            }
            declaration.concreteTypesMap!.set(parameter.name.name, recorded);
        });
    }

    private rootIdentifier(expression: Expression): string | undefined {
        if (expression.kind == "identifier") return expression.name;
        if (expression.kind == "member_access_expression" || expression.kind == "index_expression")
            return this.rootIdentifier(expression.receiver);
        return undefined;
    }

    private referenceCompatible(expected: Type, actual: Type, scope: Scope): boolean {
        const expectedBase = { ...expected, reference: false, edit: false };
        const actualBase = { ...actual, reference: false, edit: false };
        return (
            this.typeAnalyzer.arrayTypesMatch(expectedBase, actualBase) ||
            this.typeAnalyzer.isAliasOf(expectedBase, actualBase, scope) ||
            this.typeAnalyzer.isAliasOf(actualBase, expectedBase, scope)
        );
    }

    /**
     * Synthesizes the single-argument signature used for primitive conversion
     * calls, such as `int32(value)`.
     */
    getConverterFunction(name: string): U<FunctionSignature> {
        const value = this.typeAnalyzer.resolveTypeValue(CreateType(name, TypeValue.TypeInvalid));
        if (
            value == TypeValue.TypeCustom ||
            value == TypeValue.TypeInvalid ||
            [TypeValue.Type_Bool, TypeValue.Type_String, TypeValue.Type_Owned].includes(value)
        ) {
            return;
        }
        const converted = CreateType(name, value);
        return {
            name,
            returnTypes: [converted],
            errorTypes: [],
            parameters: [
                {
                    position: { line: 0, column: 0, start: 0, end: 0 },
                    name: { kind: "identifier", name: "value" },
                    type: converted,
                },
            ],
        };
    }
}
