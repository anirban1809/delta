import { string, TokenKind } from "../ast/tokens.js";
import {
    CreateType,
    TypeDeclKind,
    TypeValue,
    type AssignmentStatement,
    type BinaryExpression,
    type BlockStatement,
    type Declaration,
    type EnumDecl,
    type Expression,
    type ExpressionStatement,
    type FieldInit,
    type ForStatement,
    type FunctionCallExpression,
    type FunctionDeclaration,
    type FunctionParameter,
    type Identifier,
    type IfStatement,
    type IntegerLiteral,
    type MemberAccessExpression,
    type Module,
    type ObjectLiteralExpression,
    type Position,
    type ReturnStatement,
    type Statement,
    type StructDecl,
    type SwitchStatement,
    type Type,
    type TypeAlias,
    type TypeDeclaration,
    type U,
    type UnaryExpression,
    type UnionDecl,
    type VariableDeclarationStatement,
    type WhileStatement,
} from "../ast/types.js";
import type { Diagnostics } from "../diagnostics/diagnostics.js";
import { Error } from "../diagnostics/diagnostics.js";
import { Scope } from "./scope.js";

/** What a {@link Symbol} declares — used to distinguish entries in a {@link Scope}. */
export enum SymbolKind {
    SymbolInterfaceDecl,
    SymbolTypeStructDecl,
    SymbolTypeEnumDecl,
    SymbolTypeUnionDecl,
    SymbolTypsAliasDecl,
    SymbolFuncDecl,
    SymbolFileConst,
    SymbolLocalConst,
    SymbolLocalLet,
    SymbolParameter,
    SymbolModule,
}

export enum Flow {
    FlowReturns,
    FlowBreaks,
    FlowContinues,
    FlowErrored,
}

/**
 * The resolved signature of a function symbol.
 *
 * `returnTypes` and `errorTypes` are lists to accommodate Delta's channel-style
 * error model, where a function can yield several results alongside an error.
 */
export type FunctionSignature = {
    name: string;
    returnTypes: Type[];
    errorTypes: Type[];
    parameters: FunctionParameter[];
    declaration?: FunctionDeclaration;
    typeParameters?: Type[];
    receiverType?: Type;
    receiverName?: string;
    receiverEdit?: boolean;
    /** Synthetic signature selected from a generic parameter's interface bound. */
    interfaceName?: string;
    external?: { abi: "c"; linkName: string } | { abi: "delta"; moduleName?: string };
};

/**
 * A named entry in a {@link Scope}.
 *
 * `type` is populated for value bindings (consts/lets), while `signature` is
 * populated for function declarations; which one is set follows from `kind`.
 */
export type Symbol = {
    name: string;
    kind: SymbolKind;
    type?: Type;
    signature?: FunctionSignature;
    assigned?: boolean;
    value?: Expression;
    declaration?: Declaration;
    /** Name of the live result guarding this binding, if its success value is pending. */
    pendingResult?: string;
    moved?: "active" | "moved" | "maybe";
    movePosition?: Position;
};

export type PendingResult = {
    name: string;
    position: Position;
    bindings: string[];
    successType?: Type;
    errorTypes: Type[];
    handledErrorTypes: Set<string>;
};

/** The kind of block being analyzed, which controls statement-level rules. */
export enum BlockKind {
    FunctionBlock,
    IfBlock,
    ForBlock,
    WhileBlock,
    CaseBlock,
    SwitchBlock,
}

/**
 * Ambient information threaded through block analysis: what kind of block it is
 * and the function symbol it belongs to (e.g. so `return` can be checked
 * against the enclosing function's return type).
 */
export type BlockContext = {
    kind: BlockKind;
    function: Symbol;
    returns: boolean;
    loopDepth: number;
    switch: boolean;
    scopedAssignments: string[];
    pendingResults: Map<string, PendingResult>;
};

/**
 * Semantic analyzer: validates a parsed {@link Module} and builds its symbol
 * table.
 *
 * Analysis runs in two passes (see {@link analyze}): first every top-level
 * function is registered in the global scope so functions can reference one
 * another regardless of order (e.g. mutual recursion), then each function body
 * is checked. Problems are reported on {@link Diagnostics} rather than thrown.
 */
export class Analyzer {
    ast: Module;
    globalScope: Scope;
    diagnostics: Diagnostics;
    suppressed: boolean;

    constructor(module: Module, diagnostics: Diagnostics) {
        this.ast = module;
        this.globalScope = new Scope();
        this.diagnostics = diagnostics;
        this.suppressed = false;
    }

    /**
     * Analyzes a function declaration: validates that its parameter, return,
     * and error types are all legal, then analyzes the function body within a
     * {@link BlockKind.FunctionBlock} context.
     */
    analyzeFunctionDecl(decl: FunctionDeclaration) {
        const functionScope = new Scope(this.globalScope);
        //check param types
        decl.parameters.forEach((x) => {
            const s = functionScope.getSymbol(x.name.name);

            if (s) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        x.position,
                        "redeclared parameter " + x.name.name,
                    ),
                );
                return;
            }

            if (x.type.value != TypeValue.TypeCustom && !this.checkValidPrimitiveType(x.type)) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        x.position,
                        "invalid parameter type: " + x.type.name.name,
                    ),
                );
                return;
            }

            functionScope.addSymbol({
                name: x.name.name,
                kind: SymbolKind.SymbolParameter,
                type: x.type,
            });
        });

        decl.returnTypes.forEach((x) => {
            if (this.checkValidPrimitiveType(x)) {
                return;
            }

            if (x.value == TypeValue.TypeCustom) {
                return;
            }

            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    x.position!,
                    "invalid return type: " + x.name.name,
                ),
            );
        });

        decl.errorTypes.forEach((x) => {
            if (!this.checkValidPrimitiveType(x)) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        x.position!,
                        "invalid error type: " + x.name.name,
                    ),
                );
            }
        });

        //check function body
        const s = this.globalScope.getSymbol(decl.name.name);
        if (decl.name.name == "main") {
            const v = this.verifyMainFunctionSignature(s?.signature!);
            if (!v) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        decl.position,
                        "`main` must be declared at top level as `function main(): uint8`",
                    ),
                );
                return;
            }
        }

        const blockContext: BlockContext = {
            kind: BlockKind.FunctionBlock,
            function: s!,
            returns: false,
            loopDepth: 0,
            switch: false,
            scopedAssignments: [],
            pendingResults: new Map(),
        };

        const flow = this.analyzeBlockStmt(decl.body, blockContext, functionScope);
        for (const pending of blockContext.pendingResults.values()) {
            const missing = pending.errorTypes
                .map((type) => type.name.name)
                .filter((name) => !pending.handledErrorTypes.has(name));
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    pending.position,
                    `fallible result \`${pending.name}\` is not fully handled; missing check${missing.length == 1 ? "" : "s"} for ${missing.map((name) => `\`${name}\``).join(", ")}`,
                ),
            );
        }
        if (flow != Flow.FlowReturns && decl.returnTypes.length != 0) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.position,
                    "all paths must return a value",
                ),
            );
            return;
        }
    }

    /**
     * Checks that a function's signature is a valid `main`: no parameters, no
     * error types, and exactly one `uint8` return type. Returns `false` for any
     * deviation so the caller can report the canonical `main` shape.
     */
    verifyMainFunctionSignature(s: FunctionSignature): boolean {
        if (s.parameters.length > 0) {
            return false;
        }

        if (s.errorTypes.length > 0) {
            return false;
        }

        if (s.returnTypes.length != 1 || s.returnTypes[0]?.value != TypeValue.Type_UInt8) {
            return false;
        }

        return true;
    }

    /**
     * Infers the type of an expression.
     *
     * */
    getExpressionType(e: Expression, scope: Scope): Type {
        if (!e) {
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        switch (e.kind) {
            case "identifier":
                const s = scope.getSymbol(e.name);
                if (!s) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
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
                            this.ast.fileName,
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
                    return typeSym?.type!;
                }
                return s.type!;

            case "integer_literal":
                return CreateType("int32", TypeValue.Type_Int32);

            case "float_literal":
                return CreateType("float32", TypeValue.Type_Float32);

            case "boolean_literal":
                return CreateType("bool", TypeValue.Type_Bool);

            case "function_call_expression":
                const funcT = this.analyzeFunctionCallExpression(scope, e);
                if (!funcT) {
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }
                return funcT;
            case "binary_expression":
                const exprT = this.analyzeBinaryExpression(scope, e);
                if (!exprT) {
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }
                return exprT;
            case "unary_expression":
                const unaryExprT = this.analyzeUnaryExpression(scope, e);
                if (!unaryExprT) {
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }
                return unaryExprT;
            case "char_literal":
                return CreateType("char", TypeValue.Type_Char);

            case "object_literal":
                if (this.validateObjectLiteral(e, scope)) {
                    return e.type;
                }
                return CreateType("invalid", TypeValue.TypeInvalid);

            case "member_access_expression":
                const memberT = this.analyzeMemberAccessExpression(e, scope);
                if (!memberT) {
                    return CreateType("invalid", TypeValue.TypeInvalid);
                }
                return memberT;
            default:
                return CreateType("invalid", TypeValue.TypeInvalid);
        }
    }

    validateObjectLiteral(e: ObjectLiteralExpression, scope: Scope): boolean {
        const typeSym = scope.getSymbol(e.type.name.name);
        if (!typeSym) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
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
                    this.ast.fileName,
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
                    this.ast.fileName,
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
                    this.ast.fileName,
                    "semantic",
                    (e as Expression).position,
                    "duplicate field(s) in object literal: " + duplicates.join(", "),
                ),
            );

            return false;
        }

        for (const element of e.elements) {
            const haveT = this.getExpressionType((element as FieldInit).field.value, scope);
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

            if (!this.typesMatch(haveT, wantT)) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
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

    analyzeMemberAccessExpression(e: MemberAccessExpression, scope: Scope): U<Type> {
        const receiverT = this.getExpressionType(e.receiver as Expression, scope);

        if (receiverT.value == TypeValue.Type_String && e.member.name == "length") {
            return CreateType("uintsize", TypeValue.Type_UIntSize);
        }

        if (receiverT.kind == "union") {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
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
     * Infers the type of a unary expression and checks its operand. Numeric
     * operators (`-`, `~`) require a numeric operand; logical not (`!`) requires
     * a `bool`. Returns the operand's type, or `undefined` if a diagnostic was
     * recorded.
     */
    analyzeUnaryExpression(scope: Scope, e: Expression): U<Type> {
        const unaryExpr = e as UnaryExpression;

        const operandT = this.getExpressionType(unaryExpr.operand, scope);
        unaryExpr.type = operandT.name.name;

        if (unaryExpr.operator == string(TokenKind.Symbol_Not)) {
            if (operandT.value != TypeValue.Type_Bool) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
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
            )
        ) {
            if (operandT.value == TypeValue.Type_Bool) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        e.position,
                        `unary operation \`${unaryExpr.operator}\` expects a numeric operand, found bool`,
                    ),
                );

                return;
            }
        }

        if (
            [string(TokenKind.Symbol_Increment), string(TokenKind.Symbol_Decrement)].includes(
                unaryExpr.operator,
            )
        ) {
            // the type of the operand must resolve to an int, for increment and decrement operations
            const operandTValue = this.getExpressionType(unaryExpr.operand, scope).value;
            if (!operandTValue.startsWith("Type_Int") && !operandTValue.startsWith("Type_UInt")) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
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
                            this.ast.fileName,
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
                            this.ast.fileName,
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

    isIntegerLiteral(x: Expression) {
        return x.kind == "integer_literal";
    }

    isFloatLiteral(x: Expression) {
        return x.kind == "float_literal";
    }

    /**
     * Infers the type of a binary expression and checks its operands. Operands
     * must have matching types; logical `&&`/`||` additionally require `bool`
     * operands. Comparison operators yield `bool` regardless of operand type;
     * all other operators yield the (shared) operand type. Returns `undefined`
     * when a diagnostic makes the result type meaningless.
     */
    analyzeBinaryExpression(scope: Scope, e: Expression): U<Type> {
        const leftT = this.getExpressionType((e as BinaryExpression).left, scope);
        const rightT = this.getExpressionType((e as BinaryExpression).right, scope);

        (e as BinaryExpression).types = {
            leftT: leftT.name.name,
            rightT: rightT.name.name,
        };

        if ([leftT.value, rightT.value].includes(TypeValue.TypeCustom) && leftT.kind != "enum") {
            this.diagnostics.addError(
                Error(this.ast.fileName, "semantic", e.position, "custom types cannot be compared"),
            );
        }

        const matches = this.typesMatch(leftT, rightT);
        //return boolean type for comparision expressions
        if (
            [
                string(TokenKind.Symbol_Equality),
                string(TokenKind.Symbol_NotEquals),
                string(TokenKind.Symbol_Less),
                string(TokenKind.Symbol_LessEq),
                string(TokenKind.Symbol_Greater),
                string(TokenKind.Symbol_GreaterEq),
            ].includes((e as BinaryExpression).operator)
        ) {
            return CreateType("bool", TypeValue.Type_Bool);
        }

        if (!matches) {
            if (
                this.isIntegerLiteral((e as BinaryExpression).left) ||
                this.isIntegerLiteral((e as BinaryExpression).right)
            ) {
                return;
            }

            if (
                this.isFloatLiteral((e as BinaryExpression).left) ||
                this.isFloatLiteral((e as BinaryExpression).right)
            ) {
                return;
            }

            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    e.position,
                    `binary operation \`${(e as BinaryExpression).operator}\` expects matching operands` +
                        `, found \`${leftT.name.name}\`, and \`${rightT.name.name}\``,
                ),
            );
        }

        // errors regardless of matching operands
        // 1: non bool operands for logical && and || operations
        if (
            [string(TokenKind.Symbol_LogicalAnd), string(TokenKind.Symbol_LogicalOr)].includes(
                (e as BinaryExpression).operator,
            ) &&
            (leftT.value != TypeValue.Type_Bool || rightT.value != TypeValue.Type_Bool)
        ) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    e.position,
                    `binary operation \`${(e as BinaryExpression).operator}\` expects bool operands` +
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
     * Infers the type of a function-call expression. If the callee names a
     * built-in primitive conversion (e.g. `int32(x)`), the call is type-checked
     * as a conversion — integer-to-integer and float-to-integer casts are
     * permitted, others must match exactly — and yields the converted type.
     * Otherwise the callee is resolved as a declared function. Returns
     * {@link TypeValue.TypeInvalid} for an unknown callee.
     */
    analyzeFunctionCallExpression(scope: Scope, e: FunctionCallExpression): U<Type> {
        const calleeName = e.callee.kind == "identifier" ? e.callee.name : "";
        const sym = calleeName ? scope.getSymbol(calleeName) : undefined;

        if (sym) {
            if (!sym.signature) {
                this.diagnostics.addError(
                    Error(this.ast.fileName, "semantic", e.position, sym.name + " is not callable"),
                );
                return CreateType("invalid", TypeValue.TypeInvalid);
            }

            const paramCount = sym.signature?.parameters.length;
            const argCount = e.arguments.length;

            if (paramCount != argCount) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        e.position,
                        `function ${sym.name} expects ${paramCount} arguments, found ${argCount}`,
                    ),
                );
                return CreateType("invalid", TypeValue.TypeInvalid);
            }

            e.arguments.forEach((x, i) => {
                const argT = this.getExpressionType(x, scope);
                let wantT = sym.signature?.parameters[i]?.type;

                if (wantT?.value == TypeValue.TypeCustom) {
                    const typeSymbol = scope.getSymbol(wantT.name.name);
                    if (!typeSymbol) {
                        this.diagnostics.addError(
                            Error(
                                this.ast.fileName,
                                "semantic",
                                x.position,
                                "unknown type identifier: " + wantT.name.name,
                            ),
                        );
                        return;
                    }

                    wantT = typeSymbol.type;
                }

                if (this.typesMatch(wantT!, argT)) {
                    return;
                }

                if (this.isAliasOf(wantT!, argT, scope)) {
                    return;
                }

                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        x.position,
                        `argument ${i + 1} of function ${calleeName} has type \`${argT.name.name}\`, want \`${wantT!.name.name}\``,
                    ),
                );
            });

            return sym.signature?.returnTypes[0];
        }

        //for conversion functions like int32(x)
        const convSig = this.getConverterFunction(calleeName);
        if (!convSig) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    e.position,
                    "function does not exist: " + calleeName,
                ),
            );
            return CreateType("invalid", TypeValue.TypeInvalid);
        }

        e.arguments.forEach((x, i) => {
            const argT = this.getExpressionType(x, scope);
            const wantT = convSig.parameters[i]?.type;

            e.conversion = {
                fromType: argT.name.name,
                toType: calleeName,
            };

            if (this.isInteger(argT) && this.isInteger(wantT!)) {
                return;
            }

            //allow conversion from float to integers
            if (this.isFloat(argT) && this.isInteger(wantT!)) {
                return;
            }

            //allow conversion from integer to float
            if (this.isInteger(argT) && this.isFloat(wantT!)) {
                return;
            }

            if (this.typesMatch(wantT!, argT)) {
                return;
            }

            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    e.position,
                    "invalid conversion from " + argT.name.name + " to " + wantT?.name.name,
                ),
            );
            return;
        });

        return convSig.returnTypes[0]!;
    }

    /**
     * Resolves a built-in primitive conversion function, e.g. `int32(x)` or
     * `float64(x)`. These are not declared symbols; instead a call whose callee
     * names a primitive type is treated as a conversion that yields that type.
     * Returns the synthesized {@link FunctionSignature} for the conversion, or
     * `undefined` if `name` is not a known primitive.
     */
    getConverterFunction(name: string): U<FunctionSignature> {
        const value = this.resolveTypeValue(CreateType(name, TypeValue.TypeInvalid));
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

    /** Returns whether two types are the same, compared by resolved value. */
    typesMatch(t1: Type, t2: Type) {
        if (t1.name.name == "float32") {
            if (["float32", "float64"].includes(t2.name.name)) {
                return true;
            }
            return false;
        }

        if (![t1.value, t2.value].includes(TypeValue.TypeCustom)) {
            return t1.value == t2.value;
        }

        return t1.name.name == t2.name.name;
    }

    /**
     * Analyzes a variable declaration: rejects a redeclaration in the same
     * scope, binds the symbol, then checks the initializer's type against the
     * declared type. Numeric literals adopt the declared numeric type, but no
     * implicit conversion between two resolved types is allowed — a mismatch is
     * reported with guidance to use an explicit cast.
     */
    analyzeVariableDeclarationStatement(s: VariableDeclarationStatement, scope: Scope): Flow {
        const symbol = scope.getSymbol(s.name.name);
        if (symbol) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.position,
                    "duplicate identifier " + s.name.name + " in this scope",
                ),
            );
            return Flow.FlowContinues;
        }

        let wantT = s.type;
        if (s.type.value == TypeValue.TypeCustom) {
            const typeSymbol = scope.getSymbol(s.type.name.name);
            if (!typeSymbol) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        s.position,
                        "unknown type identifier " + s.type.name.name,
                    ),
                );
                return Flow.FlowContinues;
            }
            wantT = typeSymbol.type!;
            s.type = wantT;
        }

        let haveT = this.getExpressionType(s.value!, scope);

        if (haveT.value == TypeValue.TypeCustom) {
            const typeSymbol = scope.getSymbol(haveT.name.name);
            if (!typeSymbol) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        s.position,
                        "unknown type identifier: " + haveT.name.name,
                    ),
                );
                return Flow.FlowContinues;
            }
        }

        if (haveT?.value == TypeValue.TypeInvalid && s.value) {
            //simply return here, error should already be recorded during expression type analysis
            return Flow.FlowErrored;
        }

        // type of variable is not defined, infer from the expression value
        if (wantT.value == TypeValue.TypeInvalid) {
            wantT = haveT;
            s.type = haveT;
        }

        scope.addSymbol({
            name: s.name.name,
            kind: s.mutable ? SymbolKind.SymbolLocalLet : SymbolKind.SymbolLocalConst,
            type: s.type.value == TypeValue.TypeInvalid ? haveT : wantT,
            assigned: !!s.value,
        });

        if (wantT.kind == "enum" && s.value?.kind == "integer_literal") {
            const variant = wantT.variants?.find(
                (x) => x.value.value == (s.value as IntegerLiteral).value,
            );
            if (!variant) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        s.position,
                        "illegal member variant value " +
                            (s.value as IntegerLiteral).value +
                            " for enum " +
                            wantT.name.name,
                    ),
                );
                return Flow.FlowContinues;
            }
            return Flow.FlowContinues;
        }

        if (wantT.kind == "enum" && s.value?.kind == "identifier") {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.value.position,
                    "cannot determine valid literal member variant for enum " + wantT.name.name,
                ),
            );
            return Flow.FlowContinues;
        }

        //no further chech required if there is no value assigned to a let binding
        if (s.mutable && !s.value) {
            return Flow.FlowContinues;
        }

        if (this.typesMatch(wantT, haveT)) {
            if (!this.isInteger(haveT) || !this.isInteger(wantT)) {
                return Flow.FlowContinues;
            }

            if (
                s.value?.kind == "unary_expression" &&
                s.value.operator == string(TokenKind.Symbol_Minus)
            ) {
                const operandType = this.getExpressionType(s.value.operand, scope);
                if (operandType.value.startsWith("Type_U")) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            s.value?.position!,
                            "unary - is not allowed on unsigned type " + operandType.name.name,
                        ),
                    );
                    return Flow.FlowErrored;
                }
                return Flow.FlowContinues;
            }

            if (
                s.value?.kind == "integer_literal" &&
                !this.checkIntegerRange(wantT, BigInt(parseInt(s.value?.value)))
            ) {
                // if if the value is an integer literal and
                // wantT is int32 which is the default type for any literal, then check if the value lies in the
                // range right here
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        s.type.position!,
                        `integer literal \`${(s.value as IntegerLiteral).value}\` does not fit in \`${wantT.name.name}\``,
                    ),
                );
                return Flow.FlowErrored;
            }

            return Flow.FlowContinues;
        }

        // types don't match after this point
        //
        // if haveT and wantT are two different kinds of integers
        if (this.isInteger(haveT) && this.isInteger(wantT)) {
            if (s.value!.kind != "integer_literal" && s.value!.kind != "unary_expression") {
                return Flow.FlowContinues;
            }

            //if value is negative and out of valid integer range(unary expression with a integer literal operand)
            if (s.value?.kind == "unary_expression" && s.value.operand.kind == "integer_literal") {
                if (!this.checkIntegerRange(wantT, BigInt(-1 * parseInt(s.value.operand.value)))) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            s.value.position!,
                            `integer literal \`${s.value.operand.value}\` does not fit in \`${wantT.name.name}\``,
                        ),
                    );
                    return Flow.FlowErrored;
                }
                return Flow.FlowContinues;
            }

            //if value is positive and out of valid integer range
            if (
                s.value?.kind == "integer_literal" &&
                !this.checkIntegerRange(wantT, BigInt(parseInt(s.value?.value)))
            ) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        s.value?.position!,
                        `integer literal \`${(s.value as IntegerLiteral).value}\` does not fit in \`${wantT.name.name}\``,
                    ),
                );
                return Flow.FlowErrored;
            }

            return Flow.FlowContinues;
        } else if (this.isFloat(haveT) && this.isFloat(wantT)) {
            if (s.value!.kind == "float_literal") {
                return Flow.FlowContinues;
            }
        } else if (
            //either side is an integer and the other side is a float
            (this.isInteger(haveT) && this.isFloat(wantT)) ||
            (this.isFloat(haveT) && this.isInteger(wantT))
        ) {
            return Flow.FlowContinues;
        } else if (this.isAliasOf(wantT, haveT, scope) || this.isAliasOf(haveT, wantT, scope)) {
            return Flow.FlowContinues;
        } else if (wantT.kind == "union" && this.isUnionVariant(wantT, haveT)) {
            return Flow.FlowContinues;
        } else {
            let message =
                `no implicit conversion from \`${haveT.name.name}\` to \`${wantT.name.name}\`; ` +
                `use an explicit cast \`${wantT.name.name}(x)\``;

            if (wantT.value == TypeValue.Type_Bool) {
                message = `no implicit conversion from \`${haveT.name.name}\` to \`${wantT.name.name}\`; `;
            }

            this.diagnostics.addError(
                Error(this.ast.fileName, "semantic", s.type.position!, message),
            );
            return Flow.FlowErrored;
        }

        this.diagnostics.addError(
            Error(
                this.ast.fileName,
                "semantic",
                s.type.position!,
                `type mismatch: expected \`${wantT.name.name}\`, found \`${haveT.name.name}\``,
            ),
        );
        return Flow.FlowErrored;
    }

    isUnionVariant(t1: Type, t2: Type): boolean {
        return t1.unionVariants?.map((x) => x.name.name).includes(t2.name.name)!;
    }

    isAliasOf(t1: Type, t2: Type, scope: Scope): boolean {
        if (
            (t1.kind == "enum" && t2.value == TypeValue.Type_Int32) ||
            (t2.kind == "enum" && t1.value == TypeValue.Type_Int32)
        ) {
            return true;
        }
        const t1sym = scope.getSymbol(t1.name.name);
        if (!t1sym) {
            return false;
        }

        const t2sym = scope.getSymbol(t2.name.name);
        if (!t2sym) {
            return false;
        }

        if (t1sym.kind == SymbolKind.SymbolTypsAliasDecl && t1sym.type?.name.name == t2.name.name) {
            return true;
        }
        return false;
    }

    checkNegativeInteger(e: Expression): boolean {
        return e.kind == "unary_expression" && e.operand.kind == "integer_literal";
    }

    checkIntegerRange(t: Type, v: bigint): boolean {
        if (!this.isInteger(t)) {
            return false;
        }

        const max = this.getMaxIntegerValue(t);
        const min = this.getMinIntegerValue(t);

        if (v >= min && v <= max) {
            return true;
        }

        return false;
    }

    /** Returns whether a type is any signed or unsigned integer type. */
    isInteger(t: Type): boolean {
        return (
            t.value.startsWith("Type_Int") || t.value.startsWith("Type_UInt") || t.kind == "enum"
        );
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

    analyzeAssignmentStatement(s: AssignmentStatement, context: BlockContext, scope: Scope): Flow {
        let rootName: string = "";
        if (s.root.kind == "identifier") {
            rootName = s.root.name;
        }

        if (s.root.kind == "member_access_expression") {
            rootName = (s.root.receiver as Identifier).name;
        }

        const symbol = scope.getSymbol(rootName);
        if (!symbol) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.position,
                    "unknown identifier '" + rootName + "'",
                ),
            );
            return Flow.FlowContinues;
        }

        if (
            symbol.kind == SymbolKind.SymbolLocalConst ||
            symbol.kind == SymbolKind.SymbolFileConst
        ) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.position,
                    "cannot assign to const binding '" + rootName + "'",
                ),
            );
            return Flow.FlowContinues;
        }

        if (symbol.kind == SymbolKind.SymbolParameter) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.position,
                    "cannot assign to const function parameter '" + rootName + "'",
                ),
            );
            return Flow.FlowContinues;
        }

        if (symbol.kind == SymbolKind.SymbolFuncDecl) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.position,
                    "cannot assign to function '" + rootName + "'",
                ),
            );
            return Flow.FlowContinues;
        }

        //assignment inside a loop does not guarantee assignment across the entire function
        //but if loopDepth is zero then we can set this to true.
        if (
            context.loopDepth == 0 &&
            context.kind != BlockKind.IfBlock &&
            s.root.kind != "member_access_expression"
        ) {
            symbol.assigned = true;
        }

        //if the symbol has been assigned in an if scope, but not in an else scope
        //and if we are currently in the else scope, we will set the symbol to be definitely assigned,
        //otherwise we will assume that we are in an if scope and the symbol has not yet been assigned at all
        //and we will push it to the scopedAssignments in the context
        if (
            context.kind == BlockKind.IfBlock &&
            context.scopedAssignments.includes(symbol.name) &&
            !symbol.assigned &&
            s.root.kind != "member_access_expression"
        ) {
            symbol.assigned = true;
        } else {
            context.scopedAssignments.push(symbol.name);
        }

        if (!symbol.assigned && s.root.kind == "member_access_expression") {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.position,
                    "partial initialization of struct is not allowed, " +
                        rootName +
                        " is still uninitialized",
                ),
            );
            return Flow.FlowContinues;
        }

        return Flow.FlowContinues;
    }

    analyzeWhileStatement(statement: WhileStatement, context: BlockContext, scope: Scope): Flow {
        const condition = statement.condition;
        if (this.getExpressionType(condition, scope).value != TypeValue.Type_Bool) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    statement.position,
                    "condition inside while statment must evaluate to a boolean",
                ),
            );
            return Flow.FlowContinues;
        }
        return Flow.FlowContinues;
    }

    analyzeForStatement(s: ForStatement, context: BlockContext, scope: Scope): Flow {
        const loopScope = new Scope(scope);

        if (s.declaration) {
            this.analyzeStatement(s.declaration, context, scope);
        }

        let condition;

        if (s.condition) {
            condition = this.getExpressionType(s.condition, loopScope);
            if (condition.value != TypeValue.Type_Bool) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        s.position,
                        "condition in for loop must evaluate to a bool",
                    ),
                );
            }
        }

        if (s.modifier) {
            this.getExpressionType(s.modifier, scope);
        }

        if (
            s.modifier?.kind == "unary_expression" &&
            [string(TokenKind.Symbol_Increment), string(TokenKind.Symbol_Decrement)].includes(
                s.modifier.operator,
            ) &&
            s.declaration &&
            !s.declaration.mutable
        ) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.declaration?.position!,
                    "loop variable " +
                        s.declaration?.name.name +
                        " is a const and hence not mutable",
                ),
            );
        }

        const loopContext = context;
        loopContext.loopDepth += 1;

        // console.log(loopContext);
        const flow = this.analyzeBlockStmt(s.body, loopContext, scope);
        loopContext.loopDepth -= 1;
        return flow;
    }

    analyzeExpressionStatement(s: ExpressionStatement, scope: Scope): Flow {
        this.getExpressionType(s.expression, scope);
        return Flow.FlowContinues;
    }

    isSwitchable(t: Type) {
        if (t.kind == "enum") {
            return true;
        }
        return this.isInteger(t) || t.value == TypeValue.Type_Char;
    }

    isSigned(t: Type): boolean {
        return this.isInteger(t) && !t.value.startsWith("Type_U");
    }

    analyzeSwitchStatement(s: SwitchStatement, context: BlockContext, scope: Scope): Flow {
        const scrutineeT = this.getExpressionType(s.scrutinee, scope);

        if (scrutineeT.value != TypeValue.TypeInvalid && !this.isSwitchable(scrutineeT)) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.scrutinee.position,
                    `cannot switch on type ${scrutineeT.name.name}, must be an int or char`,
                ),
            );
            return Flow.FlowContinues;
        }

        let seenLabels = new Map<string, boolean>();

        if (
            scrutineeT.kind == "enum" &&
            scrutineeT.variants?.length != s.cases.length &&
            s.default?.body.statements.length == 0
        ) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.position,
                    `all variants of enum \`${scrutineeT.name.name}\` are not being checked, must include default statement`,
                ),
            );
            return Flow.FlowContinues;
        }

        for (const caseObj of s.cases) {
            for (const label of caseObj.labels) {
                const labelT = this.getExpressionType(label, scope);
                if (!this.typesMatch(labelT, scrutineeT)) {
                    if (this.isInteger(labelT) && this.isInteger(scrutineeT)) {
                        if (!this.isSigned(scrutineeT)) {
                            if (label.value.startsWith("-")) {
                                this.diagnostics.addError(
                                    Error(
                                        this.ast.fileName,
                                        "semantic",
                                        label.position,
                                        "incompatible type in case",
                                    ),
                                );
                                return Flow.FlowContinues;
                            }
                        }
                        if (this.sizeOf(scrutineeT) >= this.sizeOf(labelT)) {
                            continue;
                        }
                    }

                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            label.position,
                            `case label does not match scrutinee type; want ${scrutineeT.name.name}, got ${labelT.name.name}`,
                        ),
                    );
                    return Flow.FlowContinues;
                }

                let key = "";
                switch (label.kind) {
                    case "integer_literal":
                        key = "int:" + label.value;
                        break;

                    case "char_literal":
                        key = "char:" + label.value;
                        break;
                }

                if (!seenLabels.has(key)) {
                    seenLabels.set(key, true);
                } else {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            label.position,
                            "duplicate label detected",
                        ),
                    );
                    return Flow.FlowContinues;
                }
            }
        }

        if (scrutineeT.kind != "enum" && s.default?.body.statements.length == 0) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.scrutinee.position,
                    "missing default statement",
                ),
            );
            return Flow.FlowContinues;
        }

        let caseFlows: Flow[] = [];
        for (const caseObj of s.cases) {
            const caseCtx = context;
            caseCtx.switch = true;
            const caseScope = new Scope(scope);
            caseFlows.push(
                this.analyzeBlockStmt(
                    caseObj.body as unknown as BlockStatement, //case body can be safely cast to a BlockStatement
                    caseCtx,
                    caseScope,
                ),
            );
        }

        if (s.default?.body.statements.length! > 0) {
            const defaultCtx = context;
            defaultCtx.switch = true;
            const caseScope = new Scope(scope);
            caseFlows.push(
                this.analyzeBlockStmt(
                    s.default?.body as unknown as BlockStatement, //case body can be safely cast to a BlockStatement
                    defaultCtx,
                    caseScope,
                ),
            );
        }

        let allReturn = true;
        caseFlows.forEach((x) => {
            if (x != Flow.FlowReturns) {
                allReturn = false;
                return;
            }
        });

        if (allReturn) {
            return Flow.FlowReturns;
        }

        return Flow.FlowContinues;
    }

    /**
     * Analyzes a single statement. For `return`, checks the returned
     * expression's type against the enclosing function's declared return type
     * and reports a mismatch.
     */
    analyzeStatement(s: Statement, context: BlockContext, scope: Scope): Flow {
        switch (s.kind) {
            case "variable_declaration_statement":
                return this.analyzeVariableDeclarationStatement(
                    s as VariableDeclarationStatement,
                    scope,
                );
            case "assignment_statement":
                return this.analyzeAssignmentStatement(s as AssignmentStatement, context, scope);
            case "while_statement":
                return this.analyzeWhileStatement(s as WhileStatement, context, scope);
            case "switch_statement":
                return this.analyzeSwitchStatement(s as SwitchStatement, context, scope);
            case "if_statement":
                return this.analyzeIfStatement(s as IfStatement, context, scope);
            case "for_statement":
                return this.analyzeForStatement(s as ForStatement, context, scope);
            case "break_statement":
                if (context.loopDepth != 0) {
                    return Flow.FlowBreaks;
                }

                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        s.position,
                        "break outside a loop statement is not allowed",
                    ),
                );

                return Flow.FlowContinues;

            case "continue_statement":
                if (context.loopDepth == 0) {
                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            s.position,
                            "continue outside a loop is not allowed",
                        ),
                    );
                    return Flow.FlowContinues;
                }
                return Flow.FlowContinues;

            case "return_statement":
                if (!(s as ReturnStatement).expression) {
                    context.returns = true;
                    return Flow.FlowReturns;
                }
                const exprT = this.getExpressionType((s as ReturnStatement).expression!, scope);
                if (exprT.value == TypeValue.TypeInvalid) {
                    return Flow.FlowReturns;
                }

                const retT = context.function.signature?.returnTypes[0];

                if (!this.typesMatch(exprT, retT!)) {
                    if (this.isAliasOf(retT!, exprT, scope)) {
                        context.returns = true;
                        return Flow.FlowReturns;
                    }

                    this.diagnostics.addError(
                        Error(
                            this.ast.fileName,
                            "semantic",
                            s.position!,
                            `mismatched types in return statement, want ${retT?.name.name}, got ${exprT.name.name}`,
                        ),
                    );
                }

                context.returns = true;
                return Flow.FlowReturns;

            case "expression_statement":
                return this.analyzeExpressionStatement(s as ExpressionStatement, scope);
        }
        return Flow.FlowContinues;
    }

    analyzeIfStatement(s: IfStatement, context: BlockContext, scope: Scope): Flow {
        const conditionT = this.getExpressionType(s.condition, scope);
        if (conditionT.value != TypeValue.Type_Bool) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    s.position!,
                    "condition inside if statement must evaluate to a bool",
                ),
            );
            return Flow.FlowContinues;
        }

        const ifScope = new Scope(scope);
        const ifContext = context;
        ifContext.kind = BlockKind.IfBlock;
        let ifFlow = this.analyzeBlockStmt(s.thenBlock, ifContext, ifScope);

        if (s.elseBlock) {
            const elseFlow = this.analyzeBlockStmt(s.elseBlock, ifContext, ifScope);
            if (ifFlow != Flow.FlowContinues && elseFlow != Flow.FlowContinues) {
                if (ifFlow == elseFlow) {
                    return ifFlow;
                }
                return Flow.FlowBreaks;
            }
        }

        return Flow.FlowContinues;
    }

    /** Analyzes every statement in a block under the given context. */
    analyzeBlockStmt(b: BlockStatement, context: BlockContext, scope: Scope): Flow {
        let result = Flow.FlowContinues;
        let terminated = false;
        b.statements.forEach((x) => {
            if (terminated) {
                this.diagnostics.addError(
                    Error(this.ast.fileName, "semantic", b.position!, "unreachable code"),
                );
                return;
            }
            if (this.suppressed) {
                return;
            }
            const flow = this.analyzeStatement(x, context, scope);
            if (flow == Flow.FlowErrored) {
                this.suppressed = true;
                return;
            }
            if (flow != Flow.FlowContinues) {
                result = flow;
                terminated = true;
            }
        });

        return result;
    }

    /**
     * Resolves a type's source name to its {@link TypeValue}, recognizing the
     * built-in primitives. Unknown names resolve to {@link TypeValue.TypeInvalid}.
     */
    resolveTypeValue(t: Type): TypeValue {
        switch (t.name.name) {
            case "int8":
                return TypeValue.Type_Int8;
            case "int16":
                return TypeValue.Type_Int16;
            case "int32":
            case "c.int":
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
            case "c.ssize_t":
                return TypeValue.Type_IntSize;
            case "uintsize":
            case "c.size_t":
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
                return TypeValue.Type_String;
        }

        return TypeValue.TypeCustom;
    }

    /** Returns whether a type resolves to a known primitive type. */
    checkValidPrimitiveType(t: Type): boolean {
        const primitives = [
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
        ];

        return primitives.includes(this.resolveTypeValue(t));
    }

    analyzeTypeDeclaration(decl: TypeDeclaration) {
        const symbol = this.globalScope.getSymbol(decl.name.name);
        if (symbol) {
            this.diagnostics.addError(
                Error(
                    this.ast.fileName,
                    "semantic",
                    decl.position,
                    "duplicate type declaration: " + decl.name.name,
                ),
            );
            return;
        }

        const declKind = decl.declKind;

        if (declKind == TypeDeclKind.Union) {
            const declValue = decl.declaration as UnionDecl;
            const variantNames = declValue.variants.map((x) => x.name.name);
            const duplicates = variantNames.filter(
                (item, index) => variantNames.indexOf(item) !== index,
            );

            if (duplicates.length > 0) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        decl.position,
                        "duplicate variant(s) detected: " + duplicates.join(", "),
                    ),
                );
                return;
            }

            this.globalScope.addSymbol({
                name: decl.name.name,
                kind: SymbolKind.SymbolTypeUnionDecl,
                type: {
                    name: declValue.name,
                    unionVariants: declValue.variants,
                    kind: "union",
                    custom: true,
                    value: TypeValue.TypeCustom,
                },
            });
        }

        if (declKind == TypeDeclKind.Enum) {
            const declValue = decl.declaration as EnumDecl;
            const variantNames = declValue.variants.map((x) => x.name.name);
            const duplicates = variantNames.filter(
                (item, index) => variantNames.indexOf(item) !== index,
            );

            if (duplicates.length > 0) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        decl.position,
                        "duplicate variant(s) detected: " + duplicates.join(", "),
                    ),
                );
                return;
            }

            this.globalScope.addSymbol({
                name: decl.name.name,
                kind: SymbolKind.SymbolTypeEnumDecl,
                type: {
                    name: declValue.name,
                    variants: declValue.variants,
                    kind: "enum",
                    custom: true,
                    value: TypeValue.TypeCustom,
                },
            });
        }

        if (declKind == TypeDeclKind.Struct) {
            const declValue = decl.declaration as StructDecl;
            const fieldNames = declValue.fields.map((x) => x.name.name);
            const duplicates = fieldNames.filter(
                (item, index) => fieldNames.indexOf(item) !== index,
            );

            if (duplicates.length > 0) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        decl.position,
                        "duplicate field(s) detected: " + duplicates.join(", "),
                    ),
                );
                return;
            }

            this.globalScope.addSymbol({
                name: decl.name.name,
                kind: SymbolKind.SymbolTypeStructDecl,
                type: {
                    name: declValue.name,
                    fields: declValue.fields,
                    kind: "struct",
                    custom: true,
                    value: TypeValue.TypeCustom,
                },
            });
        }

        if (declKind == TypeDeclKind.Alias) {
            const declValue = decl.declaration as TypeAlias;
            const sym = this.globalScope.getSymbol(decl.name.name);
            if (sym) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        decl.position,
                        "duplicate identifier: " + decl.name.name,
                    ),
                );
                return;
            }

            const targetSym = this.globalScope.getSymbol(declValue.target.name.name);
            if (!targetSym) {
                this.diagnostics.addError(
                    Error(
                        this.ast.fileName,
                        "semantic",
                        decl.position,
                        "cannot create alias of `" +
                            declValue.target.name.name +
                            "` unknown identifier",
                    ),
                );
                return;
            }
            this.globalScope.addSymbol({
                name: decl.name.name,
                kind: SymbolKind.SymbolTypsAliasDecl,
                type: targetSym.type,
            });
        }
    }

    /** Analyzes a top-level declaration, dispatching on its `kind`. */
    analyzeDecl(decl: Declaration) {
        switch (decl.kind) {
            case "type_declaration":
                this.analyzeTypeDeclaration(decl as TypeDeclaration);
                break;
            case "variable_declaration_statement":
                this.analyzeVariableDeclarationStatement(
                    decl as VariableDeclarationStatement,
                    this.globalScope,
                );
                break;
            case "function_declaration":
                this.analyzeFunctionDecl(decl as FunctionDeclaration);
                break;
        }
    }

    /**
     * Runs semantic analysis over the whole module in two passes: first collect
     * every function symbol into the global scope, then analyze each
     * declaration's body now that all symbols are visible.
     */
    analyze() {
        //pass 1: capture all the function symbols, required for self referencing functions in recursions
        this.ast.declarations.forEach((decl) => {
            switch (decl.kind) {
                case "function_declaration":
                    const s = this.globalScope.getSymbol(decl.name.name);
                    if (s) {
                        this.diagnostics.addError(
                            Error(
                                this.ast.fileName,
                                "semantic",
                                decl.position,
                                "`" + decl.name.name + "` is declared more than once",
                            ),
                        );
                        return;
                    }

                    this.globalScope.addSymbol({
                        name: decl.name.name,
                        kind: SymbolKind.SymbolFuncDecl,
                        signature: {
                            name: decl.name.name,
                            returnTypes: decl.returnTypes,
                            errorTypes: decl.errorTypes,
                            parameters: decl.parameters,
                        },
                    });
            }
        });

        //pass 2: analyze the function body
        this.ast.declarations.forEach((decl) => {
            this.analyzeDecl(decl);
        });
    }
}
