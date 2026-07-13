import { string, TokenKind } from "../ast/tokens.js";
import {
    CreateType,
    TypeValue,
    type BinaryExpression,
    type Expression,
    type FieldInit,
    type FunctionCallExpression,
    type Identifier,
    type MemberAccessExpression,
    type ObjectLiteralExpression,
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
    analyze(e: Expression, scope: Scope): Type {
        if (!e) {
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        switch (e.kind) {
            case "identifier":
                const s = scope.getSymbol(e.name);
                if (!s) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            e.position,
                            "use of undeclared name `" + e.name + "`",
                        ),
                    );
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }

                if (s.kind == SymbolKind.SymbolTypeEnumDecl) {
                    return s.type!;
                }

                if (!s.assigned && s.kind != SymbolKind.SymbolParameter) {
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

                if (s.type?.value == TypeValue.TypeCustom) {
                    const typeSym = scope.getSymbol(s.type.name.name);
                    if (!typeSym) {
                        return CreateType("invalid", TypeValue.TypeInvalid);
                    }
                    return typeSym.type!;
                }
                return s.type!;

            case "integer_literal":
                return CreateType("int32", TypeValue.Type_Int32);

            case "float_literal":
                return CreateType("float32", TypeValue.Type_Float32);

            case "boolean_literal":
                return CreateType("bool", TypeValue.Type_Bool);

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
                return this.validateObjectLiteral(e, scope)
                    ? e.type
                    : CreateType("invalid", TypeValue.TypeInvalid);

            case "member_access_expression":
                return (
                    this.analyzeMemberAccessExpression(e, scope) ??
                    CreateType("invalid", TypeValue.TypeInvalid)
                );
        }
    }

    /**
     * Validates an object literal against its declared struct: every required
     * field must appear once, no unknown fields are allowed, and each value
     * must match the corresponding field type.
     */
    validateObjectLiteral(e: ObjectLiteralExpression, scope: Scope): boolean {
        const typeSym = scope.getSymbol(e.type.name.name);
        if (!typeSym) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    (e as Expression).position,
                    "unknown type identifier: " + e.type.name.name,
                ),
            );
            return false;
        }

        e.type = typeSym.type!;

        const fieldsInValue = e.elements.map((x) => (x as FieldInit).field.name.name);
        const fieldsInType = typeSym.type?.fields?.map((x) => x.name.name);
        const missing = fieldsInType?.filter((x) => !fieldsInValue.includes(x))!;
        const excess = fieldsInValue.filter((x) => !fieldsInType?.includes(x))!;

        if (missing.length > 0) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    (e as Expression).position,
                    "missing field(s) in object literal: " + missing.join(", "),
                ),
            );
            return false;
        }

        if (excess.length > 0) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    (e as Expression).position,
                    "unknown fields in object literal: " + excess.join(", "),
                ),
            );
            return false;
        }

        const seen = new Set();
        const duplicates = Array.from(
            new Set(
                fieldsInValue.filter((item) => {
                    if (seen.has(item)) return true;
                    seen.add(item);
                    return false;
                }),
            ),
        );

        if (duplicates.length > 0) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    (e as Expression).position,
                    "duplicate field(s) in object literal: " + duplicates.join(", "),
                ),
            );
            return false;
        }

        for (const element of e.elements) {
            const haveT = this.analyze((element as FieldInit).field.value, scope);
            const field = typeSym.type?.fields?.find(
                (x) => x.name.name == (element as FieldInit).field.name.name,
            );
            const wantT = field?.type!;

            if (haveT.value == TypeValue.TypeCustom) {
                this.validateObjectLiteral(
                    (element as FieldInit).field.value as ObjectLiteralExpression,
                    scope,
                );
            }

            if (!this.typeAnalyzer.typesMatch(haveT, wantT)) {
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        (e as Expression).position,
                        "value of member " +
                            (element as FieldInit).field.name.name +
                            " does not match the required type, want " +
                            wantT.name.name +
                            ", got " +
                            haveT.name.name,
                    ),
                );
                return false;
            }
        }

        return true;
    }

    /**
     * Resolves a member access on a struct or enum. Union members cannot be
     * accessed directly; enum members evaluate to `int32`.
     */
    analyzeMemberAccessExpression(e: MemberAccessExpression, scope: Scope): U<Type> {
        const receiverT = this.analyze(e.receiver as Expression, scope);

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
                return;
            }
            e.enumMember = true;
            return CreateType("int32", TypeValue.Type_Int32);
        }

        const memberT = receiverT.fields?.find((x) => x.name.name == (e.member as Identifier).name);
        if (!memberT) {
            return;
        }
        return CreateType(memberT.type.name.name, memberT.type.value);
    }

    /**
     * Infers a unary expression's operand type and validates its operator.
     * `!` needs `bool`; `-` and `~` reject `bool`; `++` and `--` require a
     * mutable integer binding.
     */
    analyzeUnaryExpression(scope: Scope, e: Expression): U<Type> {
        const unaryExpr = e as UnaryExpression;
        const operandT = this.analyze(unaryExpr.operand, scope);
        unaryExpr.type = operandT.name.name;

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
                    `unary operation \`${unaryExpr.operator}\` expects a numeric operand, found bool`,
                ),
            );
            return;
        }

        if (
            [string(TokenKind.Symbol_Increment), string(TokenKind.Symbol_Decrement)].includes(
                unaryExpr.operator,
            )
        ) {
            const operandTValue = this.analyze(unaryExpr.operand, scope).value;
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

    /**
     * Validates a binary expression. Comparisons produce `bool`; other
     * operators produce the shared operand type when their operands match.
     */
    analyzeBinaryExpression(scope: Scope, e: Expression): U<Type> {
        const binaryExpr = e as BinaryExpression;
        const leftT = this.analyze(binaryExpr.left, scope);
        const rightT = this.analyze(binaryExpr.right, scope);

        binaryExpr.types = {
            leftT: leftT.name.name,
            rightT: rightT.name.name,
        };

        if ([leftT.value, rightT.value].includes(TypeValue.TypeCustom) && leftT.kind != "enum") {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    "custom types cannot be compared",
                ),
            );
        }

        const matches = this.typeAnalyzer.typesMatch(leftT, rightT);
        if (
            [
                string(TokenKind.Symbol_Equality),
                string(TokenKind.Symbol_NotEquals),
                string(TokenKind.Symbol_Less),
                string(TokenKind.Symbol_LessEq),
                string(TokenKind.Symbol_Greater),
                string(TokenKind.Symbol_GreaterEq),
            ].includes(binaryExpr.operator)
        ) {
            return CreateType("bool", TypeValue.Type_Bool);
        }

        if (!matches) {
            if (this.isIntegerLiteral(binaryExpr.left) || this.isIntegerLiteral(binaryExpr.right)) {
                return;
            }

            if (this.isFloatLiteral(binaryExpr.left) || this.isFloatLiteral(binaryExpr.right)) {
                return;
            }

            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    `binary operation \`${binaryExpr.operator}\` expects matching operands` +
                        `, found \`${leftT.name.name}\`, and \`${rightT.name.name}\``,
                ),
            );
        }

        if (
            [string(TokenKind.Symbol_LogicalAnd), string(TokenKind.Symbol_LogicalOr)].includes(
                binaryExpr.operator,
            ) &&
            (leftT.value != TypeValue.Type_Bool || rightT.value != TypeValue.Type_Bool)
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    `binary operation \`${binaryExpr.operator}\` expects bool operands` +
                        `, found \`${leftT.name.name}\`, and \`${rightT.name.name}\``,
                ),
            );
            return;
        }

        if (!matches) {
            return;
        }

        return leftT;
    }

    /**
     * Resolves a function call and checks its argument count and types. When
     * no function symbol exists, a primitive-named callee is treated as a
     * conversion and returns the converted type.
     */
    analyzeFunctionCallExpression(scope: Scope, e: FunctionCallExpression): U<Type> {
        const sym = scope.getSymbol(e.callee.name);

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

            e.arguments.forEach((x, i) => {
                const argT = this.analyze(x, scope);
                let wantT = sym.signature?.parameters[i]?.type;

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
                    wantT = typeSymbol.type;
                }

                if (this.typeAnalyzer.typesMatch(wantT!, argT)) {
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
                        `argument ${i + 1} of function ${e.callee.name} has type \`${argT.name.name}\`, want \`${wantT!.name.name}\``,
                    ),
                );
            });

            return sym.signature.returnTypes[0];
        }

        const convSig = this.getConverterFunction(e.callee.name);
        if (!convSig) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    "function does not exist: " + e.callee.name,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        e.arguments.forEach((x, i) => {
            const argT = this.analyze(x, scope);
            const wantT = convSig.parameters[i]?.type;

            e.conversion = {
                fromType: argT.name.name,
                toType: e.callee.name,
            };

            if (this.typeAnalyzer.isInteger(argT) && this.typeAnalyzer.isInteger(wantT!)) {
                return;
            }

            if (this.typeAnalyzer.isFloat(argT) && this.typeAnalyzer.isInteger(wantT!)) {
                return;
            }

            if (this.typeAnalyzer.isInteger(argT) && this.typeAnalyzer.isFloat(wantT!)) {
                return;
            }

            if (this.typeAnalyzer.typesMatch(wantT!, argT)) {
                return;
            }

            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    e.position,
                    "invalid conversion from " + argT.name.name + " to " + wantT?.name.name,
                ),
            );
        });

        return convSig.returnTypes[0]!;
    }

    /**
     * Synthesizes the single-argument signature used for primitive conversion
     * calls, such as `int32(value)`.
     */
    getConverterFunction(name: string): U<FunctionSignature> {
        const value = this.typeAnalyzer.resolveTypeValue(CreateType(name, TypeValue.TypeInvalid));
        if (value == TypeValue.TypeInvalid) {
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
