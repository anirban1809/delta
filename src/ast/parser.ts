import { resolve } from "dns";
import type { Diagnostics } from "../diagnostics/diagnostics.js";
import { Error } from "../diagnostics/diagnostics.js";
import type { Tokenizer } from "./tokenizer.js";
import { getTokenPosition, string, TokenKind, type Token } from "./tokens.js";
import {
    Position,
    type Project,
    type Module,
    type Declaration,
    type FunctionDeclaration,
    type FunctionParameter,
    TypeValue,
    type Type,
    type BlockStatement,
    type Statement,
    type ReturnStatement,
    type VariableDeclarationStatement,
    type Expression,
    type FunctionCallExpression,
    type U,
    CreateType,
    type SwitchCase,
    type CaseBlockStatement,
    type IntegerLiteral,
    type CharacterLiteral,
    type StructDecl,
    type Identifier,
    TypeDeclKind,
    CreateIdentifier,
    type TypeAlias,
    type TypeDeclaration,
    type ObjectLiteralExpression,
    type ObjectLiteralElement,
    type FieldInit,
    type EnumDecl,
    type MemberAccessExpression,
    type UnionDecl,
} from "./types.js";

/**
 * Recursive-descent parser that turns a token stream into an AST {@link Module}.
 *
 * The parser is fail-soft: when a production hits an unexpected token it
 * records an {@link Error} on {@link Diagnostics} and returns `undefined`,
 * which callers propagate up the call chain (hence the {@link U} return types).
 * `pos` indexes into `tokens`; the helper methods (`advance`, `expect`,
 * `current`, `peek`) are the only places that move or inspect the cursor.
 */
export class Parser {
    pos = 0;
    tokens: Token[];
    diagnostics: Diagnostics;
    filepath: string;
    typeDecls: Map<string, TypeDeclaration>;
    objectValueDecls: Map<string, ObjectLiteralExpression>;
    objectNonValueDecls: Map<string, string>;

    constructor(filepath: string, d: Diagnostics) {
        this.diagnostics = d;
        this.tokens = [];
        this.filepath = filepath;
        this.typeDecls = new Map();
        this.objectValueDecls = new Map();
        this.objectNonValueDecls = new Map();
    }

    /** Advances the cursor by one and returns the now-current token. */
    advance(): Token {
        const currentToken = this.tokens[this.pos];
        this.pos++;
        return currentToken!;
    }

    /**
     * Asserts the current token is of `kind`. On match, consumes it and returns
     * it; otherwise records `message` as an error at the previous token's
     * position and returns `undefined` without advancing.
     */
    expect(kind: TokenKind, message: string): U<Token> {
        const currentToken = this.tokens[this.pos];
        if (currentToken?.kind != kind) {
            const { line, column, start, end } = this.tokens[this.pos - 1]!;
            this.diagnostics.addError(
                Error(this.filepath, "parser", Position(line, column, start, end), message),
            );
            return;
        } else {
            this.pos++;
        }

        return currentToken;
    }

    /** Returns the token at the cursor without consuming it. */
    current(): Token {
        return this.tokens[this.pos]!;
    }

    /** Peeks at the next token and returns it without advancing the cursor. */
    peek(): Token {
        if (this.current().kind != TokenKind.Kind_EOF) {
            return this.tokens[this.pos + 1]!;
        }
        return this.current();
    }

    /** Snapshots the current token's source span as a {@link Position}. */
    getCurrentPosition(): Position {
        return {
            start: this.current().start,
            end: this.current().end,
            line: this.current().line,
            column: this.current().column,
        };
    }

    /** Consumes any run of line or block comment tokens at the cursor. */
    skipComments() {
        while (
            this.current().kind == TokenKind.Kind_LineComment ||
            this.current().kind == TokenKind.Kind_BlockComment
        ) {
            this.advance();
        }
    }

    /**
     * Parses a parenthesized, comma-separated parameter list of the form
     * `(name: Type, …)`. Returns an empty list for `()`, or `undefined` if any
     * expected token is missing. Leaves the cursor just past the closing `)`.
     */
    parseFuncParams(): U<FunctionParameter[]> {
        let params: FunctionParameter[] = [];

        if (!this.expect(TokenKind.Symbol_LeftParen, "( symbol expected")) {
            return;
        }

        if (this.current().kind == TokenKind.Symbol_RightParen) {
            this.advance(); // consume right paren
            return params;
        }

        const p1 = this.expect(TokenKind.Kind_Identifier, "identifier expected");
        if (!p1) {
            return;
        }

        if (!this.expect(TokenKind.Symbol_Colon, ": symbol expected")) {
            return;
        }

        const t1 = this.expect(TokenKind.Kind_Identifier, "identifier expected");
        if (!t1) {
            return;
        }

        this.objectNonValueDecls.set(p1.value, t1.value);

        params.push({
            position: this.getCurrentPosition(),
            name: { kind: "identifier", name: p1.value },
            type: {
                position: getTokenPosition(t1),
                kind: "type",
                name: { kind: "identifier", name: t1.value },
                value: this.resolveTypeValue(t1.value),
            },
        });

        while (this.current().kind != TokenKind.Symbol_RightParen) {
            if (!this.expect(TokenKind.Symbol_Comma, ", symbol expected")) {
                return;
            }

            const p = this.expect(TokenKind.Kind_Identifier, "identifier expected");
            if (!p) {
                return;
            }

            if (!this.expect(TokenKind.Symbol_Colon, ": symbol expected")) {
                return;
            }

            const t = this.expect(TokenKind.Kind_Identifier, "identifier expected");
            if (!t) {
                return;
            }

            this.objectNonValueDecls.set(p.value, t.value);

            params.push({
                position: this.getCurrentPosition(),
                name: { kind: "identifier", name: p.value },
                type: {
                    position: getTokenPosition(t),
                    kind: "type",
                    name: { kind: "identifier", name: t.value },
                    value: this.resolveTypeValue(t.value),
                },
            });
        }

        this.advance(); //consume right paren symbol
        return params;
    }

    /**
     * Parses a function's return type. `void` yields an empty list, signalling
     * no return value. Currently only a single type is supported.
     */
    parseFuncReturnTypes(): U<Type[]> {
        const returns: Type[] = [];
        const tName = this.expect(TokenKind.Kind_Identifier, "identifier expected");
        if (!tName) {
            return;
        }
        if (tName.value == "void") {
            return [];
        }

        const returnType = this.resolveTypeValue(tName.value);

        returns.push({
            position: getTokenPosition(tName),
            kind: "type",
            name: { kind: "identifier", name: tName.value },
            value: returnType,
        });
        return returns;
    }

    /**
     * Parses a function's error type for the channel-style error model. `void`
     * yields an empty list, signalling the function cannot fail. Currently only
     * a single type is supported.
     */
    // TODO: Add support for multiple errors
    parseFuncErrorTypes(): U<Type[]> {
        const errors: Type[] = [];
        const tName = this.expect(TokenKind.Kind_Identifier, "identifier expected");
        if (!tName) {
            return;
        }
        if (tName.value == "void") {
            return [];
        }
        errors.push({
            position: getTokenPosition(tName),
            kind: "type",
            name: { kind: "identifier", name: tName.value },
            value: TypeValue.Type_Int32,
        });
    }

    /**
     * Parses a full function declaration: the `function` keyword, name,
     * parameter list, an optional `:` return type, and the body block. Assumes
     * the cursor is on the `function` keyword.
     */
    parseFuncDecl(): U<FunctionDeclaration> {
        const fnPos: Position = this.getCurrentPosition();

        this.advance(); // consume function keyword
        const fnName = this.expect(TokenKind.Kind_Identifier, "identifier expected");

        if (!fnName) {
            return;
        }

        const params = this.parseFuncParams();
        if (!params) {
            return;
        }

        let returnTypes: Type[] = [];
        let errorTypes: Type[] = [];

        if (this.current().kind == TokenKind.Symbol_Colon) {
            this.advance(); //consume colon symbol
            let rt = this.parseFuncReturnTypes();
            if (!rt) {
                return;
            }
            returnTypes = rt;
        } else if (this.current().kind == TokenKind.Kind_Identifier) {
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    this.getCurrentPosition(),
                    `invalid symbol ${this.current().value}, symbol : expected`,
                ),
            );
            return;
        }

        const block = this.parseBlockStmt();
        if (!block) {
            return;
        }

        return {
            position: fnPos,
            kind: "function_declaration",
            name: { kind: "identifier", name: fnName.value },
            parameters: params,
            returnTypes: returnTypes,
            errorTypes: errorTypes,
            body: block,
        };
    }

    /**
     * Parses a `return <expr>;` statement. The expression is currently a
     * placeholder integer literal until expression parsing is implemented.
     */
    parseReturnStmt(): U<ReturnStatement> {
        const keyword = this.advance(); // consume return keyword
        const expr = this.parseExpression(); //parsing the expr

        if (!expr) {
            return;
        }

        if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
            return;
        }

        return {
            kind: "return_statement",
            position: Position(keyword.line, keyword.column, keyword.start, keyword.end),
            expression: expr,
        };
    }

    resolveSpreadLiteralFields(): U<{ name: Identifier; value: Expression }[]> {
        const name = this.expect(TokenKind.Kind_Identifier, "identifier expected");
        if (!name) {
            return;
        }

        const objectLiteralValue = this.objectValueDecls.get(name.value);
        if (!objectLiteralValue) {
            const nonValue = this.objectNonValueDecls.get(name.value);
            if (!nonValue) {
                return;
            }

            const typeDecl = this.typeDecls.get(nonValue);
            if (!typeDecl) {
                return;
            }

            return (typeDecl.declaration as StructDecl).fields.map((x) => {
                return {
                    name: x.name,
                    value: {
                        position: getTokenPosition(name),
                        kind: "member_access_expression",
                        receiver: {
                            position: getTokenPosition(name),
                            kind: "identifier",
                            name: name.value,
                        },
                        member: x.name,
                    } as unknown as Expression,
                };
            });
        }

        return objectLiteralValue.elements.map((x) => {
            const fieldInit = x as FieldInit;
            return {
                name: fieldInit.field.name,
                value: fieldInit.field.value,
            };
        });
    }

    parseObjectLiteralExpression(expr: Identifier): U<Expression> {
        const objectType: Type = {
            name: expr,
            kind: "type",
            value: TypeValue.TypeCustom,
        };
        let fields: { name: Identifier; value: Expression }[] = [];
        this.advance(); //consume left brace
        while (this.current().kind != TokenKind.Symbol_RightBrace) {
            //parse spread literal if any

            if (this.current().kind == TokenKind.Symbol_Ellipsis) {
                this.advance(); //consume ellipsis symbol
                const spreadLiteralFields = this.resolveSpreadLiteralFields();
                if (!spreadLiteralFields) {
                    return;
                }

                fields.push(...spreadLiteralFields);

                if (this.current().kind == TokenKind.Symbol_RightBrace) {
                    break;
                }

                if (this.current().kind == TokenKind.Symbol_Comma) {
                    this.advance();
                }
            }

            const field1 = this.expect(TokenKind.Kind_Identifier, "identifier expected");
            if (!field1) {
                return;
            }
            if (!this.expect(TokenKind.Symbol_Colon, ": expected")) {
                return;
            }
            const value1 = this.parseExpression();
            if (!value1) {
                return;
            }

            fields.push({ name: CreateIdentifier(field1.value), value: value1 });

            if (this.current().kind == TokenKind.Symbol_RightBrace) {
                break;
            }

            if (!this.expect(TokenKind.Symbol_Comma, ", expected")) {
                return;
            }

            while (this.current().kind != TokenKind.Symbol_Comma) {
                //parse spread literal if any

                if (this.current().kind == TokenKind.Symbol_Ellipsis) {
                    this.advance(); //consume ellipsis symbol
                    const spreadLiteralFields = this.resolveSpreadLiteralFields();
                    if (!spreadLiteralFields) {
                        return;
                    }

                    fields.push(...spreadLiteralFields);

                    if (this.current().kind == TokenKind.Symbol_RightBrace) {
                        break;
                    }

                    if (this.current().kind == TokenKind.Symbol_Comma) {
                        this.advance();
                    }
                }

                const field = this.expect(TokenKind.Kind_Identifier, "identifier expected");
                if (!field) {
                    return;
                }
                if (!this.expect(TokenKind.Symbol_Colon, ": expected")) {
                    return;
                }
                const value = this.parseExpression();
                if (!value) {
                    return;
                }

                fields.push({ name: CreateIdentifier(field.value), value: value });
                if (this.current().kind == TokenKind.Symbol_RightBrace) {
                    break;
                }

                if (!this.expect(TokenKind.Symbol_Comma, ", symbol expected")) {
                    return;
                }
            }
        }
        this.advance(); //parse ending right brace symbol
        return {
            type: objectType,
            position: this.getCurrentPosition(),
            kind: "object_literal",
            elements: fields.map((x) => ({
                position: x.value.position,
                kind: "field_init",
                field: x,
            })),
        };
    }

    /**
     * Parses a primary (atomic) expression: an identifier, an integer/float/
     * boolean literal, or — as a fallback — a nested expression. This is the
     * lowest rung of the expression grammar.
     */
    parsePrimaryExpression(): U<Expression> {
        const token = this.advance();
        switch (token.kind) {
            case TokenKind.Symbol_LeftParen:
                const expr = this.parseExpression();
                if (!expr) {
                    return;
                }
                if (!this.expect(TokenKind.Symbol_RightParen, ") symbol expected")) {
                    return;
                }

                return expr;

            case TokenKind.Kind_Identifier:
                if (this.current().kind == TokenKind.Symbol_LeftBrace) {
                    return this.parseObjectLiteralExpression({
                        position: this.getCurrentPosition(),
                        kind: "identifier",
                        name: token.value,
                    } as Identifier);
                }

                return {
                    position: this.getCurrentPosition(),
                    kind: "identifier",
                    name: token.value,
                };

            case TokenKind.Kind_IntegerLiteral:
                return {
                    position: this.getCurrentPosition(),
                    kind: "integer_literal",
                    value: token.value,
                };

            case TokenKind.Kind_FloatLiteral:
                return {
                    position: this.getCurrentPosition(),
                    kind: "float_literal",
                    value: token.value,
                };

            case TokenKind.Kind_BooleanLiteral:
                return {
                    position: this.getCurrentPosition(),
                    kind: "boolean_literal",
                    value: token.value,
                };

            case TokenKind.Kind_CharacterLiteral:
                return {
                    position: this.getCurrentPosition(),
                    kind: "char_literal",
                    value: token.value,
                };

            default:
                return this.parseExpression();
        }
    }

    /**
     * Parses a call's argument list `(...)` given the already-parsed `callee`,
     * and wraps them into a {@link FunctionCallExpression}. Assumes the cursor
     * is on the opening `(`.
     */
    parseFunctionCallExpression(callee: Expression): U<Expression> {
        if (!this.expect(TokenKind.Symbol_LeftParen, "( symbol expected")) {
            return;
        }
        const args: Expression[] = [];
        if (this.current().kind != TokenKind.Symbol_RightParen) {
            const p1 = this.parseExpression();
            if (!p1) {
                return;
            }
            args.push(p1);
            while (this.current().kind == TokenKind.Symbol_Comma) {
                this.advance(); //consume comma
                const p = this.parseExpression();
                if (!p) {
                    return;
                }
                args.push(p);
                this.skipComments();
            }
        }
        if (!this.expect(TokenKind.Symbol_RightParen, ") symbol expected")) {
            return;
        }
        callee = {
            kind: "function_call_expression",
            position: callee.position,
            callee,
            arguments: args,
        } as FunctionCallExpression;

        this.skipComments();
        return callee;
    }

    parseMemberAccessExpression(expr: Expression): U<Expression> {
        this.advance(); //consume dot symbol
        const member = this.expect(TokenKind.Kind_Identifier, "identifier expected");

        if (!member) {
            return;
        }

        return {
            position: getTokenPosition(member),
            kind: "member_access_expression",
            receiver: expr,
            member: CreateIdentifier(member.value),
        };
    }

    /**
     * Parses a postfix expression: a primary expression optionally followed by
     * a call `(...)`. Currently the call suffix applies only to identifiers.
     */
    parsePostfixExpression(): U<Expression> {
        const expr = this.parsePrimaryExpression();
        if (!expr) {
            return;
        }

        let final = expr;

        while (this.current().kind == TokenKind.Symbol_Dot) {
            const member = this.parseMemberAccessExpression(final);
            if (!member) {
                return;
            }

            final = member;
        }

        while (expr.kind == "identifier" && this.current().kind == TokenKind.Symbol_LeftParen) {
            const func = this.parseFunctionCallExpression(final);
            if (!func) {
                return;
            }

            final = func;
        }

        if (
            this.current().kind == TokenKind.Symbol_Increment ||
            this.current().kind == TokenKind.Symbol_Decrement
        ) {
            return {
                kind: "unary_expression",
                position: expr.position,
                operator: this.advance().value,
                operand: expr,
            };
        }

        return final;
    }

    /**
     * Parses a unary expression: a prefix operator (`!`, `-`, `~`) applied to a
     * postfix expression, or just a postfix expression when no operator leads.
     */
    parseUnaryExpression(): U<Expression> {
        if (
            [TokenKind.Symbol_Not, TokenKind.Symbol_Minus, TokenKind.Symbol_Tilde].includes(
                this.current().kind,
            )
        ) {
            const operator = this.advance();
            const operand = this.parsePostfixExpression();
            if (!operand) {
                return;
            }

            return {
                position: operand.position,
                kind: "unary_expression",
                operator: operator.value,
                operand,
            };
        }

        const expr = this.parsePostfixExpression();
        if (!expr) {
            return;
        }

        return expr;
    }

    /**
     * Parses an additive expression: a unary expression optionally followed by
     * a `+`/`-` operator and a right-hand unary expression.
     */
    parseAdditiveExpression(): U<Expression> {
        let left = this.parseMultiplicativeExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while ([TokenKind.Symbol_Plus, TokenKind.Symbol_Minus].includes(this.current().kind)) {
            const operator = this.advance();
            const right = this.parseMultiplicativeExpression();
            if (!right) {
                return;
            }

            left = {
                position: left.position,
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
            this.skipComments();
        }

        return left;
    }

    parseMultiplicativeExpression(): U<Expression> {
        let left = this.parseUnaryExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while (
            [TokenKind.Symbol_Asterisk, TokenKind.Symbol_FSlash, TokenKind.Symbol_Percent].includes(
                this.current().kind,
            )
        ) {
            const operator = this.advance();
            const right = this.parseUnaryExpression();
            if (!right) {
                return;
            }

            left = {
                position: left.position,
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
            this.skipComments();
        }

        return left;
    }

    /**
     * Parses a logical expression: an additive expression optionally followed
     * by a `&&`/`||` operator and a right-hand additive expression.
     */
    parseLogicalExpression(): U<Expression> {
        const left = this.parseAdditiveExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while (
            [TokenKind.Symbol_LogicalAnd, TokenKind.Symbol_LogicalOr].includes(this.current().kind)
        ) {
            const operator = this.advance();
            const right = this.parseAdditiveExpression();
            if (!right) {
                return;
            }

            return {
                position: left.position,
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
        }

        return left;
    }

    parseBitwiseXorExpression(): U<Expression> {
        let left = this.parseBitwiseOrExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while ([TokenKind.Symbol_Caret].includes(this.current().kind)) {
            const operator = this.advance();
            const right = this.parseBitwiseOrExpression();
            if (!right) {
                return;
            }

            left = {
                position: left.position,
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
            this.skipComments();
        }

        return left;
    }

    parseBitwiseOrExpression(): U<Expression> {
        let left = this.parseBitwiseAndExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while ([TokenKind.Symbol_Pipe].includes(this.current().kind)) {
            const operator = this.advance();
            const right = this.parseBitwiseAndExpression();
            if (!right) {
                return;
            }

            left = {
                position: left.position,
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
            this.skipComments();
        }

        return left;
    }

    parseBitwiseAndExpression(): U<Expression> {
        let left = this.parseComparisionExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while ([TokenKind.Symbol_Ampersand].includes(this.current().kind)) {
            const operator = this.advance();
            const right = this.parseComparisionExpression();
            if (!right) {
                return;
            }

            left = {
                position: left.position,
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
            this.skipComments();
        }

        return left;
    }

    parseShiftExpression(): U<Expression> {
        const left = this.parseLogicalExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        if (
            [TokenKind.Symbol_ShiftLeft, TokenKind.Symbol_ShiftRight].includes(this.current().kind)
        ) {
            const operator = this.advance();
            const right = this.parseLogicalExpression();
            if (!right) {
                return;
            }

            return {
                position: left.position,
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
        }

        return left;
    }

    /**
     * Parses a comparison expression: a logical expression optionally followed
     * by a relational/equality operator (`<`, `<=`, `>`, `>=`, `==`, `!=`) and
     * a right-hand logical expression. This is the top of the expression
     * precedence chain entered through {@link parseExpression}.
     */
    parseComparisionExpression(): U<Expression> {
        const left = this.parseShiftExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        if (
            [
                TokenKind.Symbol_Less,
                TokenKind.Symbol_LessEq,
                TokenKind.Symbol_Greater,
                TokenKind.Symbol_GreaterEq,
                TokenKind.Symbol_Equality,
                TokenKind.Symbol_NotEquals,
            ].includes(this.current().kind)
        ) {
            const operator = this.advance();
            const right = this.parseShiftExpression();
            if (!right) {
                return;
            }

            return {
                position: left.position,
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
        }

        return left;
    }

    /**
     * Entry point for expression parsing. Delegates to the lowest-precedence
     * rung ({@link parseComparisionExpression}), which recurses down through the
     * precedence chain.
     */
    // IN_PROGRESS: add expression parsing
    parseExpression(): U<Expression> {
        return this.parseBitwiseXorExpression();
    }

    /**
     * Maps a type's source name (`int32`, `float64`, `bool`, …) to its
     * {@link TypeValue}. Unknown names resolve to {@link TypeValue.TypeInvalid}.
     */
    resolveTypeValue(name: string): TypeValue {
        switch (name) {
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

    /**
     * Parses a `let`/`const` variable declaration: `<modifier> name: Type` with
     * an optional `= <expr>` initializer, terminated by `;`. A `const` requires
     * an initializer; a `let` may omit it. `file` marks whether the declaration
     * is at file (module) scope rather than inside a function body.
     */
    parseVariableDeclarationStmt(file: boolean): U<VariableDeclarationStatement> {
        const modifier = this.advance(); // consume let or const

        if (this.current().kind != TokenKind.Kind_Identifier) {
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    this.getCurrentPosition(),
                    "identifier expected here",
                ),
            );
            return;
        }

        const varNameIdent = this.advance(); //consume variable name

        //if there is no type defined in the declaration
        if (this.current().kind == TokenKind.Symbol_Equals) {
            this.advance(); //consume the equals symbol

            const value = this.parseExpression();
            if (!value) {
                return;
            }

            if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
                return;
            }

            if (value.kind == "object_literal") {
                this.objectValueDecls.set(varNameIdent.value, value);
            }

            return {
                file,
                kind: "variable_declaration_statement",
                mutable: modifier.kind == TokenKind.Keyword_Let,
                type: CreateType("invalid", TypeValue.TypeInvalid, this.getCurrentPosition()),
                name: { name: varNameIdent.value, kind: "identifier" },
                position: getTokenPosition(varNameIdent),
                value,
            };
        }

        if (!this.expect(TokenKind.Symbol_Colon, ": expected")) {
            return;
        }

        if (this.current().kind != TokenKind.Kind_Identifier) {
            this.diagnostics.addError(
                Error(this.filepath, "parser", this.getCurrentPosition(), "identifier expected"),
            );
            return;
        }

        const varType = this.advance(); //consume variable type

        if (this.current().kind == TokenKind.Symbol_Semicolon && modifier.value != "let") {
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    getTokenPosition(this.current()),
                    "const declaration requires an initializer",
                ),
            );
            return;
        }

        if (this.current().kind == TokenKind.Symbol_Semicolon && modifier.value == "let") {
            this.advance(); //consume semi-colon symbol
            return {
                file,
                kind: "variable_declaration_statement",
                mutable: true,
                name: { name: varNameIdent.value, kind: "identifier" },
                type: {
                    position: getTokenPosition(varType),
                    kind: "type",
                    name: { name: varType.value, kind: "identifier" },
                    value: this.resolveTypeValue(varType.value),
                },
                position: getTokenPosition(varNameIdent),
            };
        }

        if (!this.expect(TokenKind.Symbol_Equals, "= expected")) {
            return;
        }

        const value = this.parseExpression();
        if (!value) {
            return;
        }

        if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
            return;
        }

        if (value.kind == "object_literal") {
            this.objectValueDecls.set(varNameIdent.value, value);
        }

        return {
            file,
            kind: "variable_declaration_statement",
            mutable: modifier.kind == TokenKind.Keyword_Let,
            name: { name: varNameIdent.value, kind: "identifier" },
            type: {
                position: getTokenPosition(varType),
                kind: "type",
                name: { name: varType.value, kind: "identifier" },
                value: this.resolveTypeValue(varType.value),
            },
            position: getTokenPosition(varNameIdent),
            value,
        };
    }

    parseIfStatement(): U<Statement> {
        const keyword = this.advance(); //consume if keyword
        if (!this.expect(TokenKind.Symbol_LeftParen, "( expected")) {
            return;
        }

        const condition = this.parseExpression();
        if (!condition) {
            return;
        }

        if (!this.expect(TokenKind.Symbol_RightParen, ") expected")) {
            return;
        }

        const thenBlock = this.parseBlockStmt();
        if (!thenBlock) {
            return;
        }

        let elseBlock;

        if (this.current().kind == TokenKind.Keyword_Else) {
            this.advance();
            elseBlock = this.parseBlockStmt();
        }

        return {
            kind: "if_statement",
            position: getTokenPosition(keyword),
            condition,
            thenBlock,
            elseBlock,
        };
    }

    parseWhileStatement(): U<Statement> {
        const keyword = this.advance(); //consume while keyword
        if (!this.expect(TokenKind.Symbol_LeftParen, "( expected")) {
            return;
        }

        const condition = this.parseExpression();
        if (!condition) {
            return;
        }

        if (!this.expect(TokenKind.Symbol_RightParen, ") expected")) {
            return;
        }

        const body = this.parseBlockStmt();
        if (!body) {
            return;
        }

        return {
            kind: "while_statement",
            position: getTokenPosition(keyword),
            condition,
            body,
        };
    }

    parseForStatement(): U<Statement> {
        const keyword = this.advance(); //consume while keyword
        if (!this.expect(TokenKind.Symbol_LeftParen, "( expected")) {
            return;
        }

        let decl;
        if (this.current().kind == TokenKind.Symbol_Semicolon) {
            this.advance(); // consume ; symbol
        } else {
            decl = this.parseVariableDeclarationStmt(false);
        }

        let condition: Expression;
        if (this.current().kind == TokenKind.Symbol_Semicolon) {
            this.advance(); // consume ; symbol
            condition = {
                position: getTokenPosition(keyword),
                kind: "boolean_literal",
                value: "true",
            };
        } else {
            condition = this.parseExpression()!;
            if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
                return;
            }
        }

        let modifier;
        if (this.current().kind == TokenKind.Symbol_RightParen) {
            this.advance(); //consume ) symbol
        } else {
            modifier = this.parseExpression()!;
            if (!this.expect(TokenKind.Symbol_RightParen, ") expected")) {
                return;
            }
        }

        const body = this.parseBlockStmt();
        if (!body) {
            return;
        }

        return {
            position: getTokenPosition(keyword),
            kind: "for_statement",
            declaration: decl,
            condition: condition,
            modifier,
            body,
        };
    }

    parseSwitchStatement(): U<Statement> {
        const keyword = this.advance(); // consume switch keyword
        if (!this.expect(TokenKind.Symbol_LeftParen, "symbol ( expected")) {
            return;
        }

        let cases: SwitchCase[] = [];
        let defaultCaseValue: SwitchCase = {
            position: this.getCurrentPosition(),
            labels: [],
            body: {
                kind: "case_block_statement",
                statements: [],
                position: this.getCurrentPosition(),
            },
        };

        this.skipComments();
        const scrutinee = this.parseExpression();
        if (!scrutinee) {
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    this.getCurrentPosition(),
                    "failed to parse switch expression",
                ),
            );
            return;
        }
        this.skipComments();
        if (!this.expect(TokenKind.Symbol_RightParen, "symbol ) expected")) {
            return;
        }
        this.skipComments();
        if (!this.expect(TokenKind.Symbol_LeftBrace, "symbol { expected")) {
            return;
        }

        while (this.current().kind != TokenKind.Symbol_RightBrace) {
            this.skipComments();
            if (
                this.current().kind != TokenKind.Keyword_Case &&
                this.current().kind != TokenKind.Keyword_Default
            ) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "keyword `case` or `default` expected",
                    ),
                );
                return;
            }

            if (this.current().kind == TokenKind.Keyword_Default) {
                //exit the loop for default case parsing
                break;
            }
            this.advance(); //consume case keyword

            let caseValue: SwitchCase = {
                position: this.getCurrentPosition(),
                labels: [],
                body: {
                    kind: "case_block_statement",
                    statements: [],
                    position: this.getCurrentPosition(),
                },
            };

            let label = this.parseExpression();
            if (!label) {
                return;
            }

            switch (label.kind) {
                case "unary_expression":
                    if (
                        label.operator == string(TokenKind.Symbol_Minus) &&
                        label.operand.kind == "integer_literal"
                    ) {
                        caseValue.labels.push({
                            position: this.getCurrentPosition(),
                            kind: "integer_literal",
                            value: "-" + label.operand.value,
                        } as IntegerLiteral);
                    } else {
                        this.diagnostics.addError(
                            Error(
                                this.filepath,
                                "parser",
                                this.getCurrentPosition(),
                                "case labels must be integer or char literals",
                            ),
                        );
                        return;
                    }
                    break;
                case "integer_literal":
                    caseValue.labels.push(label as IntegerLiteral);
                    break;
                case "char_literal":
                    caseValue.labels.push(label as CharacterLiteral);
                    break;
                case "member_access_expression":
                    if (label.receiver.kind == "identifier") {
                        const decl = this.typeDecls.get(label.receiver.name);
                        if (!decl) {
                            break;
                        }

                        if (decl.declKind != TypeDeclKind.Enum) {
                            break;
                        }

                        const labelValue = (decl.declaration as EnumDecl).variants.find(
                            (x) => x.name.name == (label as MemberAccessExpression).member.name,
                        )?.value!;

                        caseValue.labels.push(labelValue);
                        break;
                    }
                default:
                    this.diagnostics.addError(
                        Error(
                            this.filepath,
                            "parser",
                            this.getCurrentPosition(),
                            "case labels must be integer or char literals",
                        ),
                    );
                    return;
            }

            if (this.current().kind == TokenKind.Symbol_Comma) {
                while (this.current().kind != TokenKind.Symbol_Colon) {
                    this.advance();
                    label = this.parseExpression();
                    if (!label) {
                        return;
                    }

                    switch (label.kind) {
                        case "unary_expression":
                            if (
                                label.operator == string(TokenKind.Symbol_Minus) &&
                                label.operand.kind == "integer_literal"
                            ) {
                                caseValue.labels.push({
                                    kind: "integer_literal",
                                    value: "-" + label.operand.value,
                                } as IntegerLiteral);
                            } else {
                                this.diagnostics.addError(
                                    Error(
                                        this.filepath,
                                        "parser",
                                        this.getCurrentPosition(),
                                        "case labels must be integer or char literals",
                                    ),
                                );
                                return;
                            }
                            break;
                        case "integer_literal":
                            caseValue.labels.push(label as IntegerLiteral);
                            break;
                        case "char_literal":
                            caseValue.labels.push(label as CharacterLiteral);
                            break;
                        case "member_access_expression":
                            if (label.receiver.kind == "identifier") {
                                const decl = this.typeDecls.get(label.receiver.name);
                                if (!decl) {
                                    break;
                                }

                                if (decl.declKind != TypeDeclKind.Enum) {
                                    break;
                                }

                                const labelValue = (decl.declaration as EnumDecl).variants.find(
                                    (x) =>
                                        x.name.name ==
                                        (label as MemberAccessExpression).member.name,
                                )?.value!;

                                caseValue.labels.push(labelValue);
                                break;
                            }

                        default:
                            this.diagnostics.addError(
                                Error(
                                    this.filepath,
                                    "parser",
                                    this.getCurrentPosition(),
                                    "case labels must be integer or char literals",
                                ),
                            );
                            return;
                    }
                }
            }

            if (!this.expect(TokenKind.Symbol_Colon, ": expected")) {
                return;
            }

            const caseBlock = this.parseCaseBlockStatement();
            if (!caseBlock) {
                return;
            }
            caseValue.body = caseBlock as CaseBlockStatement;
            cases.push(caseValue);

            if (this.current().kind == TokenKind.Keyword_Case) {
                continue;
            }
        }

        if (this.current().kind == TokenKind.Keyword_Default) {
            this.advance(); //consume default keyword

            if (!this.expect(TokenKind.Symbol_Colon, ": expected")) {
                return;
            }

            const defaultBlock = this.parseCaseBlockStatement();
            if (!defaultBlock) {
                return;
            }
            defaultCaseValue.body = defaultBlock as CaseBlockStatement;
        }

        this.advance(); //consume ending switch statement brace

        return {
            kind: "switch_statement",
            position: getTokenPosition(keyword),
            cases: cases,
            scrutinee: scrutinee,
            default: defaultCaseValue,
        };
    }

    parseCaseBlockStatement(): U<Statement> {
        const statements: Statement[] = [];
        while (
            this.current().kind != TokenKind.Keyword_Case &&
            this.current().kind != TokenKind.Keyword_Default &&
            this.current().kind != TokenKind.Symbol_RightBrace
        ) {
            if (this.current().kind == TokenKind.Kind_EOF) {
                // TODO: Add eof error message to diagnostics
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "reached the end of file while parsing",
                    ),
                );
                return;
            }

            this.skipComments();
            const stmt = this.parseStmt();
            if (!stmt) {
                return;
            }

            statements.push(stmt);
        }

        return {
            kind: "case_block_statement",
            statements,
            position: this.getCurrentPosition(),
        };
    }

    /** Dispatches on the current token to parse a single statement. */
    parseStmt(): U<Statement> {
        let statement;
        this.skipComments();

        if (this.current().kind == TokenKind.Keyword_Break) {
            const keyword = this.advance(); //consume break keyword
            if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
                return;
            }

            this.skipComments();
            return {
                kind: "break_statement",
                position: getTokenPosition(keyword),
            };
        }

        if (this.current().kind == TokenKind.Keyword_Continue) {
            const keyword = this.advance(); //consume continue keyword
            if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
                return;
            }

            this.skipComments();
            return {
                kind: "continue_statement",
                position: getTokenPosition(keyword),
            };
        }

        if (
            this.current().kind == TokenKind.Keyword_Const ||
            this.current().kind == TokenKind.Keyword_Let
        ) {
            statement = this.parseVariableDeclarationStmt(false);
            if (statement == undefined) {
                return;
            }
            return statement;
        }

        if (this.current().kind == TokenKind.Keyword_Return) {
            statement = this.parseReturnStmt();
            this.skipComments();
            if (!statement) {
                return;
            }
            return statement;
        }

        if (this.current().kind == TokenKind.Keyword_If) {
            statement = this.parseIfStatement();
            this.skipComments();
            if (!statement) {
                return;
            }
            return statement;
        }

        if (this.current().kind == TokenKind.Keyword_While) {
            statement = this.parseWhileStatement();
            this.skipComments();
            if (!statement) {
                return;
            }
            return statement;
        }

        if (this.current().kind == TokenKind.Keyword_Switch) {
            statement = this.parseSwitchStatement();
            this.skipComments();
            if (!statement) {
                return;
            }
            return statement;
        }

        if (this.current().kind == TokenKind.Keyword_For) {
            statement = this.parseForStatement();
            this.skipComments();
            if (!statement) {
                return;
            }
            return statement;
        }

        const expr = this.parseExpression();
        if (!expr) {
            return;
        }

        if (this.current().kind == TokenKind.Symbol_Equals) {
            this.advance(); //consume = operator
            const rhs = this.parseExpression();
            if (!rhs) {
                return;
            }
            if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
                return;
            }

            return {
                position: expr.position,
                kind: "assignment_statement",
                root: expr,
                target: rhs,
            };
        }

        if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
            return;
        }

        return {
            kind: "expression_statement",
            expression: expr,
            position: expr.position,
        };
    }

    /**
     * Parses a `{ … }` block: statements until the closing brace. Reports an
     * error and bails if end-of-file is reached before the block is closed.
     */
    parseBlockStmt(): U<BlockStatement> {
        const statements: Statement[] = [];

        if (!this.expect(TokenKind.Symbol_LeftBrace, "{ symbol expected")) {
            return;
        }

        while (this.current().kind != TokenKind.Symbol_RightBrace) {
            if (this.current().kind == TokenKind.Kind_EOF) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "reached the end of file while parsing",
                    ),
                );
                return;
            }

            this.skipComments();
            const stmt = this.parseStmt();
            if (!stmt) {
                return;
            }

            statements.push(stmt);
        }
        this.advance(); //consume } symbol

        return {
            kind: "block_statement",
            statements,
            position: this.getCurrentPosition(),
        };
    }

    resolveTypeDeclName(name: string): U<TypeDeclaration> {
        return this.typeDecls.get(name);
    }

    resolveSpreadFields(): U<{ name: Identifier; type: Type }[]> {
        this.advance(); //consume ellipsis symbol
        const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
        if (!name) {
            return;
        }
        const typedecl = this.resolveTypeDeclName(name.value);
        if (!typedecl) {
            return;
        }

        if (this.current().kind == TokenKind.Symbol_Comma) {
            this.advance();
        }
        return (typedecl.declaration as StructDecl).fields;
    }

    resolveIntersectionFields(): U<{ name: Identifier; type: Type }[]> {
        const name = this.advance(); //consume ellipsis symbol
        if (!name) {
            return;
        }
        let typedecl = this.resolveTypeDeclName(name.value);
        if (!typedecl) {
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    this.getCurrentPosition(),
                    "non struct type " + name.value + " cannot be used here",
                ),
            );
            this.advance();
            return;
        }

        return (typedecl.declaration as StructDecl).fields;
    }

    parseStructDeclaration(): U<StructDecl> {
        let declaration: StructDecl = {
            name: { kind: "identifier", name: "" },
            fields: [],
        };

        const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
        if (!name) {
            return;
        }

        declaration.name.name = name.value;

        if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
            return;
        }

        if (this.current().kind == TokenKind.Kind_Identifier) {
            const intersectionFields = this.resolveIntersectionFields();
            if (!intersectionFields) {
                return;
            }
            declaration.fields.push(...intersectionFields);
            if (!this.expect(TokenKind.Symbol_Ampersand, "& symbol expected")) {
                return;
            }
        }

        if (!this.expect(TokenKind.Symbol_LeftBrace, "{ symbol expected")) {
            return;
        }

        if (this.current().kind == TokenKind.Symbol_Ellipsis) {
            const spreadFields = this.resolveSpreadFields();
            if (!spreadFields) {
                return;
            }
            declaration.fields.push(...spreadFields);
        }

        while (this.current().kind != TokenKind.Symbol_RightBrace) {
            let fieldName1: Identifier = { name: "", kind: "identifier" };
            let fieldType1: Type = CreateType("", TypeValue.TypeInvalid, this.getCurrentPosition());

            const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
            if (!name) {
                return;
            }

            fieldName1.name = name.value;

            if (!this.expect(TokenKind.Symbol_Colon, ": symbol expected")) {
                return;
            }

            const typename = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
            if (!typename) {
                return;
            }

            fieldType1.name = { name: typename.value, kind: "identifier" };
            fieldType1.value = this.resolveTypeValue(fieldType1.name.name);
            declaration.fields.push({ name: fieldName1, type: fieldType1 });
            if (this.current().kind == TokenKind.Symbol_RightBrace) {
                break;
            }

            if (this.current().kind == TokenKind.Symbol_Comma) {
                this.advance(); //consume comma and proceed
            }

            while (this.current().kind != TokenKind.Symbol_Comma) {
                let fieldName: Identifier = { name: "", kind: "identifier" }; //consume struct name
                let fieldType: Type = CreateType(
                    "",
                    TypeValue.TypeInvalid,
                    this.getCurrentPosition(),
                );

                const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
                if (!name) {
                    return;
                }

                fieldName.name = name.value;

                if (!this.expect(TokenKind.Symbol_Colon, ": symbol expected")) {
                    return;
                }

                const typename = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
                if (!typename) {
                    return;
                }

                fieldType.name = { name: typename.value, kind: "identifier" };
                fieldType.value = this.resolveTypeValue(fieldType.name.name);

                declaration.fields.push({ name: fieldName, type: fieldType });

                if (this.current().kind == TokenKind.Symbol_RightBrace) {
                    break;
                }

                if (!this.expect(TokenKind.Symbol_Comma, ", symbol expected")) {
                    return;
                }
            }
        }
        this.advance(); //consume ending brace
        if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
            return;
        }

        return declaration;
    }

    parseEnumDeclaration(): U<TypeDeclaration> {
        let declaration: EnumDecl = {
            name: { name: "", kind: "identifier" },
            variants: [],
        };

        const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
        if (!name) {
            return;
        }

        declaration.name.name = name.value;

        if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
            return;
        }

        if (!this.expect(TokenKind.Symbol_LeftBrace, "{ symbol expected")) {
            return;
        }

        let valueRequired = false;
        let currentValue = 0;

        while (this.current().kind != TokenKind.Symbol_RightBrace) {
            const n = this.expect(TokenKind.Kind_Identifier, "identifier expected");
            if (!n) {
                return;
            }

            if (this.current().kind == TokenKind.Symbol_Colon && !valueRequired) {
                valueRequired = true;
            }

            if (valueRequired == true) {
                if (
                    !this.expect(
                        TokenKind.Symbol_Colon,
                        "cannot have implicit value for enum variant here",
                    )
                ) {
                    return;
                }

                const v = this.expect(TokenKind.Kind_IntegerLiteral, "integer literal expected");
                if (!v) {
                    return;
                }
                declaration.variants.push({
                    name: CreateIdentifier(n.value),
                    value: {
                        position: getTokenPosition(v),
                        kind: "integer_literal",
                        value: v.value,
                    },
                });
            } else {
                declaration.variants.push({
                    name: CreateIdentifier(n.value),
                    value: {
                        position: getTokenPosition(n),
                        kind: "integer_literal",
                        value: currentValue.toString(),
                    },
                });
            }

            if (this.current().kind == TokenKind.Symbol_RightBrace) {
                break;
            }
            if (this.current().kind == TokenKind.Symbol_Comma) {
                this.advance(); //consume comma
                currentValue++;
                continue;
            }
        }

        this.advance(); //consume ending brace

        if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
            return;
        }

        return {
            name: declaration.name,
            position: this.getCurrentPosition(),
            kind: "type_declaration",
            declaration,
            declKind: TypeDeclKind.Enum,
        };
    }

    parseUnionDeclaration(): U<TypeDeclaration> {
        let declaration: UnionDecl = {
            name: { name: "", kind: "identifier" },
            variants: [],
        };

        const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
        if (!name) {
            return;
        }

        declaration.name.name = name.value;

        if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
            return;
        }

        const v1 = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
        if (!v1) {
            return;
        }

        const v1Type = this.typeDecls.get(v1.value);
        if (!v1Type) {
            return;
        }

        declaration.variants.push(CreateType(v1.value, this.resolveTypeValue(v1.value)));
        while (this.current().kind == TokenKind.Symbol_Pipe) {
            this.advance(); //consume pipe symbol
            const v = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
            if (!v) {
                return;
            }

            const vType = this.typeDecls.get(v1.value);
            if (!vType) {
                return;
            }
            declaration.variants.push(CreateType(v.value, this.resolveTypeValue(v.value)));
        }
        if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
            return;
        }

        return {
            kind: "type_declaration",
            declKind: TypeDeclKind.Union,
            position: this.getCurrentPosition(),
            name: declaration.name,
            declaration,
        };
    }

    parseTypeDeclaration(): U<Declaration> {
        this.advance(); // consume type keyword
        const declKind = this.advance(); //consume type kind specifier: struct, union or enum

        if (declKind.kind == TokenKind.Kind_Identifier) {
            //produce a type alias here
            if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
                return;
            }

            const target = this.expect(TokenKind.Kind_Identifier, "identifier expected");
            if (!target) {
                return;
            }

            if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
                return;
            }

            if (!this.typeDecls.has(target.value)) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "invalid target for alias " + declKind.value,
                    ),
                );
                return;
            }

            const targetDecl = this.typeDecls.get(target.value)!;
            this.typeDecls.set(declKind.value, targetDecl);

            return {
                position: getTokenPosition(declKind),
                kind: "type_declaration",
                name: CreateIdentifier(declKind.value),
                declKind: TypeDeclKind.Alias,
                declaration: {
                    target: targetDecl.declaration,
                } as TypeAlias,
            };
        }

        if (declKind.kind == TokenKind.Keyword_Struct) {
            const decl = this.parseStructDeclaration();
            if (!decl) {
                return;
            }
            const typeDecl: TypeDeclaration = {
                position: getTokenPosition(declKind),
                kind: "type_declaration",
                name: decl.name,
                declKind: TypeDeclKind.Struct,
                declaration: decl,
            };

            this.typeDecls.set(decl.name.name, typeDecl);
            return typeDecl;
        }

        if (declKind.kind == TokenKind.Keyword_Enum) {
            const decl = this.parseEnumDeclaration();
            if (!decl) {
                return;
            }

            this.typeDecls.set(decl.name.name, decl);
            return decl;
        }

        if (declKind.kind == TokenKind.Keyword_Union) {
            const decl = this.parseUnionDeclaration();
            if (!decl) {
                return;
            }

            this.typeDecls.set(decl.name.name, decl);
            return decl;
        }

        this.diagnostics.addError(
            Error(
                this.filepath,
                "parser",
                this.getCurrentPosition(),
                "invalid type kind specifier: " + declKind.value,
            ),
        );
        return;
    }

    /**
     * Parses every top-level declaration until end-of-file. Only `function`
     * declarations are recognized today; any other leading token is an error.
     */
    parseDecls(): U<Declaration[]> {
        const decls: Declaration[] = [];
        while (this.current().kind != TokenKind.Kind_EOF) {
            this.skipComments();

            if (this.current().kind == TokenKind.Keyword_Type) {
                const decl = this.parseTypeDeclaration();
                if (!decl) {
                    continue;
                }
                decls.push(decl);
                continue;
            }

            if (this.current().kind == TokenKind.Keyword_Let) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "`let` is not allowed at file scope; use `const`",
                    ),
                );
                continue;
            }

            if (this.current().kind == TokenKind.Keyword_Const) {
                const decl = this.parseVariableDeclarationStmt(true);
                if (!decl) {
                    continue;
                }
                decls.push(decl);
                continue;
            }

            if (this.current().kind == TokenKind.Keyword_Function) {
                const decl = this.parseFuncDecl();
                if (!decl) {
                    continue;
                }
                decls.push(decl);
                continue;
            } else {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "keyword function, type or const expected",
                    ),
                );
                this.skipLine();
            }
        }

        return decls;
    }

    /**
     * Error-recovery helper: advances the cursor past the rest of the current
     * source line so parsing can resume at the next line after a failure.
     */
    skipLine(): void {
        const line = this.current().line;
        while (this.current().kind != TokenKind.Kind_EOF && this.current().line == line) {
            this.advance();
        }
    }

    /**
     * Entry point: parses one file's token stream into a {@link Module}.
     * Returns `undefined` if parsing failed (errors are on {@link Diagnostics}).
     */
    public parse(tokens: Token[]): U<Module> {
        this.tokens = tokens;
        const decls = this.parseDecls();
        if (!decls) {
            return;
        }
        return {
            fileName: this.filepath,
            declarations: decls,
        };
    }

    /**
     * Discovers and parses every Delta file under a project root, producing one
     * {@link Module} per file. (Not yet implemented — returns an empty project.)
     */
    public parseProject(root: string, tokenizer: Tokenizer): Project {
        return {
            modules: [],
        };
    }
}
