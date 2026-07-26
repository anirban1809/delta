import type { Diagnostics } from "../diagnostics/diagnostics.js";
import { Error } from "../diagnostics/diagnostics.js";
import { getTokenPosition, string, TokenKind, type Token } from "./tokens.js";
import {
    documentationFromComments,
    isDocumentationComment,
    tokenEndLine,
} from "./documentation.js";
import {
    Position,
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
    type FieldInit,
    type EnumDecl,
    type MemberAccessExpression,
    type UnionDecl,
    type AsResultBinding,
    type CheckBlockStatement,
    type ForwardStatement,
    type ReturnErrorStatement,
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
            const token = currentToken ?? this.tokens[this.pos - 1]!;
            const { line, column, start, end } = token;
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
     * Consumes comments at the cursor and returns Markdown from the final
     * contiguous documentation-comment run when it directly precedes the next
     * token. Ordinary comments and blank lines break the association.
     */
    takeDocumentationComments(): string | undefined {
        let comments: Token[] = [];
        while (
            this.current().kind == TokenKind.Kind_LineComment ||
            this.current().kind == TokenKind.Kind_BlockComment
        ) {
            const comment = this.advance();
            if (!isDocumentationComment(comment)) {
                comments = [];
                continue;
            }
            const previous = comments[comments.length - 1];
            if (previous && comment.line - tokenEndLine(previous) > 1) comments = [];
            comments.push(comment);
        }
        const last = comments[comments.length - 1];
        if (!last || this.current().line - tokenEndLine(last) > 1) return undefined;
        return documentationFromComments(comments);
    }

    /** Parses fixed-array extents or the terminal slice suffix following a type name. */
    parseArraySuffixes(): U<{ arrayLengths: number[]; slice: boolean }> {
        const arrayLengths: number[] = [];
        let slice = false;

        while (this.current().kind == TokenKind.Symbol_LeftBracket) {
            this.advance(); // consume left bracket
            if (this.current().kind == TokenKind.Symbol_RightBracket) {
                if (slice || arrayLengths.length) {
                    this.diagnostics.addError(
                        Error(
                            this.filepath,
                            "parser",
                            this.getCurrentPosition(),
                            "a slice type `T[]` cannot be combined with fixed-array extents",
                        ),
                    );
                    return;
                }
                slice = true;
                this.advance();
                continue;
            }
            if (slice) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "a slice type `T[]` cannot be combined with fixed-array extents",
                    ),
                );
                return;
            }
            const length = this.expect(
                TokenKind.Kind_IntegerLiteral,
                "array length expected, must be an integer literal",
            );
            if (!length) {
                return;
            }
            if (!this.expect(TokenKind.Symbol_RightBracket, "] symbol expected")) {
                return;
            }
            arrayLengths.push(parseInt(length.value));
        }

        return { arrayLengths, slice };
    }

    /** Parses a source type, including references, indirection, generics, and arrays. */
    parseTypeReference(typeParameters?: Type[]): U<Type> {
        let edit = false;
        let reference = false;
        if (this.current().kind == TokenKind.Keyword_Edit) {
            edit = true;
            this.advance();
        }
        if (this.current().kind == TokenKind.Symbol_Ampersand) {
            reference = true;
            this.advance();
        }
        if (edit && !reference) {
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    this.getCurrentPosition(),
                    "`edit` may only qualify a reference (`edit &T`)",
                ),
            );
            return;
        }

        const token = this.current();
        if (token.kind != TokenKind.Kind_Identifier && token.kind != TokenKind.Keyword_Heap) {
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    this.getCurrentPosition(),
                    "type identifier expected",
                ),
            );
            return;
        }
        this.advance();

        const nameParts = [token.kind == TokenKind.Keyword_Heap ? "owned" : token.value];
        while (this.current().kind == TokenKind.Symbol_Dot) {
            this.advance();
            const member = this.current();
            if (
                member.kind != TokenKind.Kind_Identifier &&
                member.kind != TokenKind.Keyword_Const
            ) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "type identifier expected after .",
                    ),
                );
                return;
            }
            this.advance();
            nameParts.push(member.value);
        }
        const sourceName = nameParts.join(".");
        let type = CreateType(
            sourceName,
            this.resolveTypeValue(sourceName),
            getTokenPosition(token),
        );
        const parameter = typeParameters?.find((candidate) => candidate.name.name == sourceName);
        if (parameter) type = { ...parameter, position: getTokenPosition(token) };

        if (this.current().kind == TokenKind.Symbol_Less) {
            const arguments_ = this.parseTypeParams(false);
            if (!arguments_) return;
            type.typeParameters = arguments_.map((argument) =>
                this.resolveFunctionTypeParameters(argument, typeParameters),
            );
        } else if (token.kind == TokenKind.Keyword_Heap) {
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    getTokenPosition(token),
                    "owned type requires one type argument",
                ),
            );
            return;
        }

        const arraySuffixes = this.parseArraySuffixes();
        if (!arraySuffixes) return;
        type.arrayLengths = arraySuffixes.arrayLengths.length
            ? arraySuffixes.arrayLengths
            : undefined;
        type.slice = arraySuffixes.slice || undefined;
        type.reference = reference;
        type.edit = edit;
        return type;
    }

    /**
     * Parses a parenthesized, comma-separated parameter list of the form
     * `(name: Type, …)`. Returns an empty list for `()`, or `undefined` if any
     * expected token is missing. Leaves the cursor just past the closing `)`.
     */
    parseFuncParams(typeParams?: Type[]): U<FunctionParameter[]> {
        const params: FunctionParameter[] = [];

        if (!this.expect(TokenKind.Symbol_LeftParen, "( symbol expected")) {
            return;
        }

        if (this.current().kind == TokenKind.Symbol_RightParen) {
            this.advance(); // consume right paren
            return params;
        }

        while (this.current().kind != TokenKind.Symbol_RightParen) {
            if (this.current().kind == TokenKind.Symbol_Ellipsis) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "variadic parameters are not supported; declare a slice parameter such as `items: T[]` instead",
                    ),
                );
                return;
            }
            const p = this.expect(TokenKind.Kind_Identifier, "identifier expected");
            if (!p || !this.expect(TokenKind.Symbol_Colon, ": symbol expected")) return;
            const t = this.parseTypeReference(typeParams);
            if (!t) return;
            this.objectNonValueDecls.set(p.value, t.name.name);

            params.push({
                position: getTokenPosition(p),
                name: CreateIdentifier(p.value, getTokenPosition(p)),
                type: t,
            });
            if (this.current().kind == TokenKind.Symbol_Comma) {
                this.advance();
                continue;
            }
            if (this.current().kind != TokenKind.Symbol_RightParen) {
                this.diagnostics.addError(
                    Error(this.filepath, "parser", this.getCurrentPosition(), ", or ) expected"),
                );
                return;
            }
        }

        this.advance(); //consume right paren symbol
        return params;
    }

    /**
     * Parses a function's return type. `void` yields an empty list, signalling
     * no return value. Currently only a single type is supported.
     */
    parseFuncReturnTypes(typeParams?: Type[]): U<Type[]> {
        const returns: Type[] = [];
        while (true) {
            const returnType = this.parseTypeReference(typeParams);
            if (!returnType) return;
            if (returnType.name.name == "void") {
                if (returns.length) {
                    this.diagnostics.addError(
                        Error(
                            this.filepath,
                            "parser",
                            returnType.position!,
                            "void cannot be combined with another return type",
                        ),
                    );
                    return;
                }
                return [];
            }
            returns.push(returnType);
            if (this.current().kind != TokenKind.Symbol_Comma) break;
            this.advance();
        }
        return returns;
    }

    /**
     * Parses a function's error type for the channel-style error model. `void`
     * yields an empty list, signalling the function cannot fail. Currently only
     * a single type is supported.
     */
    parseFuncErrorTypes(): U<Type[]> {
        const errors: Type[] = [];
        while (true) {
            const errorType = this.parseTypeReference();
            if (!errorType) return;
            errors.push(errorType);
            if (this.current().kind != TokenKind.Symbol_Comma) break;
            this.advance();
        }
        return errors;
    }

    parseTypeParams(decl: boolean): U<Type[]> {
        this.advance(); // consume < symbol
        const types: Type[] = [];

        while (
            this.current().kind != TokenKind.Symbol_Greater &&
            this.current().kind != TokenKind.Symbol_ShiftRight
        ) {
            if (decl && this.current().kind == TokenKind.Symbol_Ellipsis) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "variadic type parameters are not supported",
                    ),
                );
                return;
            }
            const tName = this.expect(TokenKind.Kind_Identifier, "type identifier expected");
            if (!tName) {
                return;
            }

            const nameParts = [tName.value];
            while (this.current().kind == TokenKind.Symbol_Dot) {
                this.advance();
                const member = this.current();
                if (
                    member.kind != TokenKind.Kind_Identifier &&
                    member.kind != TokenKind.Keyword_Const
                ) {
                    this.diagnostics.addError(
                        Error(
                            this.filepath,
                            "parser",
                            this.getCurrentPosition(),
                            "type identifier expected after .",
                        ),
                    );
                    return;
                }
                this.advance();
                nameParts.push(member.value);
            }
            const sourceName = nameParts.join(".");

            const type = CreateType(
                sourceName,
                decl ? TypeValue.TypeGeneric : this.resolveTypeValue(sourceName),
                getTokenPosition(tName),
            );
            if (decl && this.current().kind == TokenKind.Symbol_Colon) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        `type parameter bounds are not supported; declare \`${sourceName}\` without a constraint`,
                    ),
                );
                return;
            }
            if (!decl && this.current().kind == TokenKind.Symbol_Less) {
                type.typeParameters = this.parseTypeParams(false);
                if (!type.typeParameters) {
                    return;
                }
            }
            if (!decl) {
                const arraySuffixes = this.parseArraySuffixes();
                if (!arraySuffixes) {
                    return;
                }
                type.arrayLengths = arraySuffixes.arrayLengths.length
                    ? arraySuffixes.arrayLengths
                    : undefined;
                type.slice = arraySuffixes.slice || undefined;
            }
            types.push(type);

            if (this.current().kind == TokenKind.Symbol_Comma) {
                this.advance(); //consume comma
                continue;
            }
        }

        if (this.current().kind == TokenKind.Symbol_ShiftRight) {
            // `>>` is tokenized as a shift operator. In nested generic type
            // arguments it instead closes two consecutive `<...>` lists.
            const secondClose = { ...this.current(), kind: TokenKind.Symbol_Greater, value: ">" };
            this.current().kind = TokenKind.Symbol_Greater;
            this.current().value = ">";
            this.tokens.splice(this.pos + 1, 0, secondClose);
        }
        this.advance(); //consume > symbol

        if (decl) {
            const seenTypeParameters = new Set<string>();
            const duplicateTypeParameter = types.find((type) => {
                if (seenTypeParameters.has(type.name.name)) {
                    return true;
                }
                seenTypeParameters.add(type.name.name);
                return false;
            });
            if (duplicateTypeParameter) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        duplicateTypeParameter.position!,
                        "duplicate type parameter: " + duplicateTypeParameter.name.name,
                    ),
                );
                return;
            }
        }

        return types;
    }

    /** Reclassifies nested type arguments that refer to a function's `<T>` list. */
    resolveFunctionTypeParameters(type: Type, typeParameters?: Type[]): Type {
        const typeParameter = typeParameters?.find(
            (parameter) => parameter.name.name == type.name.name,
        );
        if (typeParameter) {
            return { ...typeParameter, position: type.position };
        }

        type.typeParameters = type.typeParameters?.map((argument) =>
            this.resolveFunctionTypeParameters(argument, typeParameters),
        );
        return type;
    }

    /**
     * Parses a full function declaration: the `function` keyword, name,
     * parameter list, an optional `:` return type, and the body block. Assumes
     * the cursor is on the `function` keyword.
     */
    parseFuncDecl(): U<FunctionDeclaration> {
        const fnPos: Position = this.getCurrentPosition();

        this.advance(); // consume function keyword
        let receiver: FunctionParameter | undefined;
        if (this.current().kind == TokenKind.Symbol_LeftParen) {
            const parsed = this.parseFuncParams();
            if (!parsed) return;
            if (parsed.length != 1) {
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        fnPos,
                        "a receiver clause must contain exactly one binding",
                    ),
                );
                return;
            }
            receiver = parsed[0];
        }
        const fnName = this.expect(TokenKind.Kind_Identifier, "identifier expected");

        if (!fnName) {
            return;
        }

        let typeparams: U<Type[]> = [];

        if (this.current().kind == TokenKind.Symbol_Less) {
            typeparams = this.parseTypeParams(true);
            if (!typeparams) {
                return;
            }
        }

        // The receiver is parsed before the method's `<T, ...>` declaration.
        // Reclassify matching receiver arguments now that those parameters are known.
        if (receiver) {
            receiver.type = this.resolveFunctionTypeParameters(receiver.type, typeparams);
        }

        const params = this.parseFuncParams(typeparams);
        if (!params) {
            return;
        }

        let returnTypes: Type[] = [];
        let errorTypes: Type[] = [];

        if (this.current().kind == TokenKind.Symbol_Colon) {
            this.advance(); //consume colon symbol
            let rt = this.parseFuncReturnTypes(typeparams);
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

        if (this.current().kind == TokenKind.Symbol_Pipe) {
            this.advance();
            const parsedErrors = this.parseFuncErrorTypes();
            if (!parsedErrors) return;
            errorTypes = parsedErrors;
        }

        if (this.current().kind == TokenKind.Symbol_Semicolon) {
            const semicolon = this.advance();
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    getTokenPosition(semicolon),
                    "a function declaration requires a body",
                ),
            );
            return;
        }

        const blockContext: any = {
            fnContext: {
                typeParams: typeparams,
            },
        };
        const block = this.parseBlockStmt(blockContext);
        if (!block) {
            return;
        }

        return {
            position: fnPos,
            kind: "function_declaration",
            name: CreateIdentifier(fnName.value, getTokenPosition(fnName)),
            parameters: params,
            typeParameters: typeparams,
            returnTypes: returnTypes,
            errorTypes: errorTypes,
            body: block,
            receiver,
        };
    }

    /**
     * Parses a `return <expr>;` statement. The expression is currently a
     * placeholder integer literal until expression parsing is implemented.
     */
    parseReturnStmt(_blockContext?: any): U<ReturnStatement | ReturnErrorStatement> {
        const keyword = this.advance(); // consume return keyword

        if (this.current().kind == TokenKind.Keyword_Error) {
            this.advance();
            if (!this.expect(TokenKind.Keyword_As, "keyword as expected")) return;

            const values: Expression[] = [];
            while (true) {
                let value: U<Expression>;
                if (this.current().kind == TokenKind.Symbol_LeftBrace) {
                    value = this.parseObjectLiteralExpression(CreateIdentifier(""));
                } else {
                    value = this.parseExpression();
                }
                if (!value) return;
                values.push(value);
                if (this.current().kind != TokenKind.Symbol_Comma) break;
                this.advance();
            }
            if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) return;
            return {
                kind: "return_error_statement",
                position: getTokenPosition(keyword),
                value: values[0]!,
                values,
            };
        }

        if (this.current().kind == TokenKind.Symbol_Semicolon) {
            this.advance();
            return {
                kind: "return_statement",
                position: getTokenPosition(keyword),
            };
        }

        const expressions: Expression[] = [];
        while (true) {
            const expr = this.parseExpression();
            if (!expr) return;
            expressions.push(expr);
            if (this.current().kind != TokenKind.Symbol_Comma) break;
            this.advance();
        }

        if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
            return;
        }

        return {
            kind: "return_statement",
            position: Position(keyword.line, keyword.column, keyword.start, keyword.end),
            expression: expressions[0],
            expressions,
        };
    }

    /** Parses the optional `as resultName` suffix shared by fallible statement forms. */
    parseAsResultBinding(): U<AsResultBinding> {
        if (this.current().kind != TokenKind.Keyword_As) return;
        const keyword = this.advance();
        const name = this.expect(TokenKind.Kind_Identifier, "result identifier expected after as");
        if (!name) return;
        return {
            kind: "as_result_binding",
            position: getTokenPosition(keyword),
            resultName: CreateIdentifier(name.value),
        };
    }

    parseCheckBlockStatement(blockContext?: any): U<CheckBlockStatement> {
        const keyword = this.advance();
        const name = this.expect(
            TokenKind.Kind_Identifier,
            "result identifier expected after check",
        );
        if (!name) return;
        let errorType: Type | undefined;
        if (this.current().kind == TokenKind.Keyword_As) {
            this.advance();
            const typeName = this.expect(
                TokenKind.Kind_Identifier,
                "error type identifier expected after as",
            );
            if (!typeName) return;
            errorType = {
                position: getTokenPosition(typeName),
                kind: "type",
                name: CreateIdentifier(typeName.value),
                value: this.resolveTypeValue(typeName.value),
            };
        }
        const body = this.parseBlockStmt(blockContext);
        if (!body) return;
        return {
            kind: "check_block_statement",
            position: getTokenPosition(keyword),
            resultName: CreateIdentifier(name.value),
            errorType,
            body,
        };
    }

    parseForwardStatement(): U<ForwardStatement> {
        const keyword = this.advance();
        const name = this.expect(
            TokenKind.Kind_Identifier,
            "result identifier expected after forward",
        );
        if (!name) return;
        if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) return;
        return {
            kind: "forward_statement",
            position: getTokenPosition(keyword),
            resultName: CreateIdentifier(name.value),
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

    parseObjectLiteralExpression(expr: Identifier, typeArgs?: Type[]): U<Expression> {
        const objectType: Type = {
            name: expr,
            kind: "type",
            value: TypeValue.TypeCustom,
            typeParameters: typeArgs,
        };
        const elements: ObjectLiteralExpression["elements"] = [];
        const leftBrace = this.advance(); //consume left brace
        while (this.current().kind != TokenKind.Symbol_RightBrace) {
            if (this.current().kind == TokenKind.Symbol_Ellipsis) {
                const spread = this.advance();
                const source = this.parseExpression();
                if (!source) return;
                elements.push({
                    position: getTokenPosition(spread),
                    kind: "spread_element",
                    source,
                });
            } else {
                const field =
                    this.current().kind == TokenKind.Keyword_Error
                        ? this.advance()
                        : this.expect(TokenKind.Kind_Identifier, "identifier expected");
                if (!field || !this.expect(TokenKind.Symbol_Colon, ": expected")) return;
                const value = this.parseExpression();
                if (!value) return;
                elements.push({
                    position: getTokenPosition(field),
                    kind: "field_init",
                    field: { name: CreateIdentifier(field.value, getTokenPosition(field)), value },
                });
            }
            if (this.current().kind == TokenKind.Symbol_RightBrace) {
                break;
            }
            if (this.current().kind == TokenKind.Symbol_Comma) {
                this.advance();
                continue;
            }
            this.diagnostics.addError(
                Error(this.filepath, "parser", this.getCurrentPosition(), ", or } expected"),
            );
            return;
        }
        this.advance(); //parse ending right brace symbol
        return {
            type: objectType,
            position: getTokenPosition(leftBrace),
            kind: "object_literal",
            genericTypes: typeArgs,
            concreteTypeMap: new Map<string, Type[]>(),
            elements,
        };
    }

    parseArrayLiteralExpression(position: Position): U<Expression> {
        let elements: Expression[] = [];

        while (this.current().kind != TokenKind.Symbol_RightBracket) {
            const element = this.parseExpression();
            if (!element) {
                return;
            }

            elements.push(element);
            if (this.current().kind == TokenKind.Symbol_Comma) {
                this.advance(); // consume comma
            }
        }

        this.advance(); //consume right bracket
        return {
            position,
            kind: "array_literal_expression",
            elements,
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
            case TokenKind.Keyword_New:
                const inner = this.parseExpression();
                if (!inner) {
                    return;
                }
                return {
                    position: getTokenPosition(token),
                    kind: "new_expression",
                    expression: inner,
                };
            case TokenKind.Symbol_LeftBrace:
                this.pos--;
                return this.parseObjectLiteralExpression(CreateIdentifier(""));

            case TokenKind.Symbol_LeftBracket:
                const arrayLiteral = this.parseArrayLiteralExpression(getTokenPosition(token));
                if (!arrayLiteral) {
                    return;
                }
                return arrayLiteral;

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
                        position: getTokenPosition(token),
                        kind: "identifier",
                        name: token.value,
                    } as Identifier);
                }

                return {
                    position: getTokenPosition(token),
                    kind: "identifier",
                    name: token.value,
                };

            case TokenKind.Kind_IntegerLiteral:
                return {
                    position: getTokenPosition(token),
                    kind: "integer_literal",
                    value: token.value,
                };

            case TokenKind.Kind_FloatLiteral:
                return {
                    position: getTokenPosition(token),
                    kind: "float_literal",
                    value: token.value,
                };

            case TokenKind.Kind_BooleanLiteral:
                return {
                    position: getTokenPosition(token),
                    kind: "boolean_literal",
                    value: token.value,
                };

            case TokenKind.Kind_CharacterLiteral:
                return {
                    position: getTokenPosition(token),
                    kind: "char_literal",
                    value: token.value,
                };

            case TokenKind.Kind_StringLiteral:
                return {
                    position: getTokenPosition(token),
                    kind: "string_literal",
                    value: token.value,
                };

            default:
                return this.parseExpression();
        }
    }

    parseFunctionCallTypeArguments(): U<Type[]> {
        return this.parseTypeParams(false);
    }

    /**
     * Parses a call's argument list `(...)` given the already-parsed `callee`,
     * and wraps them into a {@link FunctionCallExpression}. Assumes the cursor
     * is on the opening `(`.
     */
    parseFunctionCallExpression(callee: Expression, typeArguments?: Type[]): U<Expression> {
        let typeArgs: U<Type[]> = typeArguments;

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
            genericTypes: typeArgs,
            concreteTypeMap: new Map(),
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
            receiverType: CreateType("invalid", TypeValue.TypeInvalid),
            member: CreateIdentifier(member.value),
        };
    }

    /** Returns the dotted spelling of an identifier/member chain. */
    qualifiedExpressionName(expr: Expression): U<string> {
        if (expr.kind == "identifier") return expr.name;
        if (expr.kind != "member_access_expression") return;
        const receiver = this.qualifiedExpressionName(expr.receiver);
        return receiver ? `${receiver}.${expr.member.name}` : undefined;
    }

    /** Distinguishes `f<T>(...)` / `T<U> { ... }` from an ordinary comparison. */
    genericSuffixAhead(): TokenKind | undefined {
        if (this.current().kind != TokenKind.Symbol_Less) return undefined;
        let depth = 0;
        for (let index = this.pos; index < this.tokens.length; index++) {
            const kind = this.tokens[index]!.kind;
            if (kind == TokenKind.Symbol_Less) {
                depth++;
                continue;
            }
            if (kind == TokenKind.Symbol_Greater) {
                depth--;
                if (depth == 0) {
                    const suffix = this.tokens[index + 1]?.kind;
                    return suffix == TokenKind.Symbol_LeftParen ||
                        suffix == TokenKind.Symbol_LeftBrace
                        ? suffix
                        : undefined;
                }
                continue;
            }
            if (kind == TokenKind.Symbol_ShiftRight) {
                depth -= 2;
                if (depth <= 0) {
                    const suffix = this.tokens[index + 1]?.kind;
                    return suffix == TokenKind.Symbol_LeftParen ||
                        suffix == TokenKind.Symbol_LeftBrace
                        ? suffix
                        : undefined;
                }
                continue;
            }
            if (
                kind != TokenKind.Kind_Identifier &&
                kind != TokenKind.Kind_IntegerLiteral &&
                kind != TokenKind.Symbol_Comma &&
                kind != TokenKind.Symbol_LeftBracket &&
                kind != TokenKind.Symbol_RightBracket
            )
                return undefined;
        }
        return undefined;
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

        // Parse every postfix operator in source order so a chain such as
        // `grid[1][0]` keeps the previous access as the next receiver.
        while (true) {
            if (this.current().kind == TokenKind.Symbol_Dot) {
                const member = this.parseMemberAccessExpression(final);
                if (!member) {
                    return;
                }
                final = member;
                continue;
            }

            if (
                final.kind == "member_access_expression" &&
                this.current().kind == TokenKind.Symbol_LeftBrace
            ) {
                const qualifiedName = this.qualifiedExpressionName(final);
                if (!qualifiedName) return;
                const literal = this.parseObjectLiteralExpression(
                    CreateIdentifier(qualifiedName, final.position),
                );
                if (!literal) return;
                final = literal;
                continue;
            }

            const genericSuffix =
                final.kind == "identifier" || final.kind == "member_access_expression"
                    ? this.genericSuffixAhead()
                    : undefined;
            if (
                (final.kind == "identifier" || final.kind == "member_access_expression") &&
                genericSuffix
            ) {
                const typeArguments = this.parseFunctionCallTypeArguments();
                if (!typeArguments) return;
                if (genericSuffix == TokenKind.Symbol_LeftBrace) {
                    const qualifiedName = this.qualifiedExpressionName(final);
                    if (!qualifiedName) return;
                    const literal = this.parseObjectLiteralExpression(
                        CreateIdentifier(qualifiedName, final.position),
                        typeArguments,
                    );
                    if (!literal) return;
                    final = literal;
                } else {
                    const func = this.parseFunctionCallExpression(final, typeArguments);
                    if (!func) return;
                    final = func;
                }
                continue;
            }

            if (
                (final.kind == "identifier" || final.kind == "member_access_expression") &&
                this.current().kind == TokenKind.Symbol_LeftParen
            ) {
                const func = this.parseFunctionCallExpression(
                    final,
                    final.kind == "identifier" ? final.typeArguments : undefined,
                );
                if (!func) {
                    return;
                }
                final = func;
                continue;
            }

            if (this.current().kind != TokenKind.Symbol_LeftBracket) {
                break;
            }

            this.advance(); // consume left bracket
            const index = this.parseExpression();
            if (!index) {
                return;
            }
            if (!this.expect(TokenKind.Symbol_RightBracket, "] symbol expected")) {
                return;
            }

            final = {
                position: final.position,
                kind: "index_expression",
                receiver: final,
                index,
            };
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
            this.current().kind == TokenKind.Keyword_Move ||
            this.current().kind == TokenKind.Keyword_Clone
        ) {
            const operator = this.advance();
            const source = this.parseUnaryExpression();
            if (!source) return;
            return operator.kind == TokenKind.Keyword_Move
                ? { position: getTokenPosition(operator), kind: "move_expression", source }
                : { position: getTokenPosition(operator), kind: "clone_expression", source };
        }
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
                position: getTokenPosition(operator),
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
                position: getTokenPosition(operator),
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
                position: getTokenPosition(operator),
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
        let left = this.parseAdditiveExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while (
            [TokenKind.Symbol_ShiftLeft, TokenKind.Symbol_ShiftRight].includes(this.current().kind)
        ) {
            const operator = this.advance();
            const right = this.parseAdditiveExpression();
            if (!right) {
                return;
            }

            left = {
                position: getTokenPosition(operator),
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
            this.skipComments();
        }

        return left;
    }

    parseRelationalExpression(): U<Expression> {
        let left = this.parseShiftExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while (
            [
                TokenKind.Symbol_Less,
                TokenKind.Symbol_LessEq,
                TokenKind.Symbol_Greater,
                TokenKind.Symbol_GreaterEq,
            ].includes(this.current().kind)
        ) {
            const operator = this.advance();
            const right = this.parseShiftExpression();
            if (!right) {
                return;
            }

            left = {
                position: getTokenPosition(operator),
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
            this.skipComments();
        }

        return left;
    }

    parseEqualityExpression(): U<Expression> {
        let left = this.parseRelationalExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while (
            [TokenKind.Symbol_Equality, TokenKind.Symbol_NotEquals].includes(this.current().kind)
        ) {
            const operator = this.advance();
            const right = this.parseRelationalExpression();
            if (!right) {
                return;
            }

            left = {
                position: getTokenPosition(operator),
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
        let left = this.parseEqualityExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while (this.current().kind == TokenKind.Symbol_Ampersand) {
            const operator = this.advance();
            const right = this.parseEqualityExpression();
            if (!right) {
                return;
            }
            left = {
                position: getTokenPosition(operator),
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
            this.skipComments();
        }
        return left;
    }

    parseBitwiseXorExpression(): U<Expression> {
        let left = this.parseBitwiseAndExpression();
        if (!left) {
            return;
        }
        this.skipComments();
        while (this.current().kind == TokenKind.Symbol_Caret) {
            const operator = this.advance();
            const right = this.parseBitwiseAndExpression();
            if (!right) {
                return;
            }
            left = {
                position: getTokenPosition(operator),
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
        let left = this.parseBitwiseXorExpression();
        if (!left) return;
        this.skipComments();
        while (this.current().kind == TokenKind.Symbol_Pipe) {
            const operator = this.advance();
            const right = this.parseBitwiseXorExpression();
            if (!right) return;
            left = {
                position: getTokenPosition(operator),
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
            this.skipComments();
        }
        return left;
    }

    parseLogicalAndExpression(): U<Expression> {
        let left = this.parseBitwiseOrExpression();
        if (!left) return;
        this.skipComments();
        while (this.current().kind == TokenKind.Symbol_LogicalAnd) {
            const operator = this.advance();
            const right = this.parseBitwiseOrExpression();
            if (!right) return;
            left = {
                position: getTokenPosition(operator),
                kind: "binary_expression",
                left,
                right,
                operator: operator.value,
            };
            this.skipComments();
        }
        return left;
    }

    parseLogicalOrExpression(): U<Expression> {
        let left = this.parseLogicalAndExpression();
        if (!left) return;
        this.skipComments();
        while (this.current().kind == TokenKind.Symbol_LogicalOr) {
            const operator = this.advance();
            const right = this.parseLogicalAndExpression();
            if (!right) return;
            left = {
                position: getTokenPosition(operator),
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
     * Entry point for expression parsing. Delegates to the lowest-precedence
     * rung ({@link parseComparisionExpression}), which recurses down through the
     * precedence chain.
     */
    // IN_PROGRESS: add expression parsing
    parseExpression(): U<Expression> {
        return this.parseLogicalOrExpression();
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
            case "string":
                return TypeValue.Type_String;
            case "owned":
                return TypeValue.Type_Owned;
        }

        return TypeValue.TypeCustom;
    }

    /**
     * Parses a `let`/`const` variable declaration: `<modifier> name: Type` with
     * an optional `= <expr>` initializer, terminated by `;`. A `const` requires
     * an initializer; a `let` may omit it. `file` marks whether the declaration
     * is at file (module) scope rather than inside a function body.
     */
    parseVariableDeclarationStmt(
        file: boolean,
        blockContext?: any,
    ): U<VariableDeclarationStatement> {
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
            if (
                value.kind == "new_expression" &&
                this.current().kind == TokenKind.Kind_Identifier &&
                this.current().value == "in"
            ) {
                const unsupported = this.advance();
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        getTokenPosition(unsupported),
                        "custom allocators are not supported",
                    ),
                );
                if (this.current().kind == TokenKind.Kind_Identifier) this.advance();
            }

            const hasAsResult = this.current().kind == TokenKind.Keyword_As;
            const asResult = this.parseAsResultBinding();
            if (hasAsResult && !asResult) return;

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
                name: CreateIdentifier(varNameIdent.value, getTokenPosition(varNameIdent)),
                position: getTokenPosition(varNameIdent),
                value,
                asResult,
            };
        }

        if (!this.expect(TokenKind.Symbol_Colon, ": expected")) {
            return;
        }

        let typeParams: U<Type[]> = blockContext?.fnContext?.typeParams;
        const varType = this.parseTypeReference(typeParams);
        if (!varType) return;

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
                name: CreateIdentifier(varNameIdent.value, getTokenPosition(varNameIdent)),
                type: varType,
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
        if (
            value.kind == "new_expression" &&
            this.current().kind == TokenKind.Kind_Identifier &&
            this.current().value == "in"
        ) {
            const unsupported = this.advance();
            this.diagnostics.addError(
                Error(
                    this.filepath,
                    "parser",
                    getTokenPosition(unsupported),
                    "custom allocators are not supported",
                ),
            );
            if (this.current().kind == TokenKind.Kind_Identifier) this.advance();
        }

        const hasAsResult = this.current().kind == TokenKind.Keyword_As;
        const asResult = this.parseAsResultBinding();
        if (hasAsResult && !asResult) return;

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
            name: CreateIdentifier(varNameIdent.value, getTokenPosition(varNameIdent)),
            type: varType,
            position: getTokenPosition(varNameIdent),
            value,
            asResult,
        };
    }

    parseIfStatement(blockContext?: any): U<Statement> {
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

        const thenBlock = this.parseBlockStmt(blockContext);
        if (!thenBlock) {
            return;
        }

        let elseBlock;

        if (this.current().kind == TokenKind.Keyword_Else) {
            this.advance();
            elseBlock = this.parseBlockStmt(blockContext);
        }

        return {
            kind: "if_statement",
            position: getTokenPosition(keyword),
            condition,
            thenBlock,
            elseBlock,
        };
    }

    parseWhileStatement(blockContext?: any): U<Statement> {
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

        const body = this.parseBlockStmt(blockContext);
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

    parseForStatement(blockContext?: any): U<Statement> {
        const keyword = this.advance(); //consume while keyword
        if (!this.expect(TokenKind.Symbol_LeftParen, "( expected")) {
            return;
        }

        let decl;
        if (this.current().kind == TokenKind.Symbol_Semicolon) {
            this.advance(); // consume ; symbol
        } else {
            decl = this.parseVariableDeclarationStmt(false, blockContext);
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

        const body = this.parseBlockStmt(blockContext);
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

    parseSwitchStatement(blockContext?: any): U<Statement> {
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
                            position: label.position,
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

            const caseBlock = this.parseCaseBlockStatement(blockContext);
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

            const defaultBlock = this.parseCaseBlockStatement(blockContext);
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

    parseCaseBlockStatement(blockContext?: any): U<Statement> {
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
            const stmt = this.parseStmt(blockContext);
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
    parseStmt(blockContext?: any): U<Statement> {
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

        if (this.current().kind == TokenKind.Keyword_Check) {
            return this.parseCheckBlockStatement(blockContext);
        }

        if (this.current().kind == TokenKind.Keyword_Forward) {
            return this.parseForwardStatement();
        }

        if (
            this.current().kind == TokenKind.Keyword_Const ||
            this.current().kind == TokenKind.Keyword_Let
        ) {
            statement = this.parseVariableDeclarationStmt(false, blockContext);
            if (statement == undefined) {
                return;
            }
            return statement;
        }

        if (this.current().kind == TokenKind.Keyword_Return) {
            statement = this.parseReturnStmt(blockContext);
            this.skipComments();
            if (!statement) {
                return;
            }
            return statement;
        }

        if (this.current().kind == TokenKind.Keyword_If) {
            statement = this.parseIfStatement(blockContext);
            this.skipComments();
            if (!statement) {
                return;
            }
            return statement;
        }

        if (this.current().kind == TokenKind.Keyword_While) {
            statement = this.parseWhileStatement(blockContext);
            this.skipComments();
            if (!statement) {
                return;
            }
            return statement;
        }

        if (this.current().kind == TokenKind.Keyword_Switch) {
            statement = this.parseSwitchStatement(blockContext);
            this.skipComments();
            if (!statement) {
                return;
            }
            return statement;
        }

        if (this.current().kind == TokenKind.Keyword_For) {
            statement = this.parseForStatement(blockContext);
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

        const assignmentOperators = [
            TokenKind.Symbol_Equals,
            TokenKind.Symbol_PlusEquals,
            TokenKind.Symbol_MinusEquals,
            TokenKind.Symbol_AsteriskEquals,
            TokenKind.Symbol_FSlashEquals,
            TokenKind.Symbol_PercentEquals,
            TokenKind.Symbol_AmpersandEquals,
            TokenKind.Symbol_PipeEquals,
            TokenKind.Symbol_CaretEquals,
            TokenKind.Symbol_ShiftLeftEquals,
            TokenKind.Symbol_ShiftRightEquals,
        ];
        if (assignmentOperators.includes(this.current().kind)) {
            const operator = this.advance();
            const rhs = this.parseExpression();
            if (!rhs) {
                return;
            }
            const hasAsResult = this.current().kind == TokenKind.Keyword_As;
            const asResult = this.parseAsResultBinding();
            if (hasAsResult && !asResult) return;
            if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
                return;
            }

            return {
                position: expr.position,
                kind: "assignment_statement",
                root: expr,
                target: rhs,
                operator: operator.value == "=" ? undefined : operator.value,
                operatorPosition: getTokenPosition(operator),
                asResult,
            };
        }

        const hasAsResult = this.current().kind == TokenKind.Keyword_As;
        const asResult = this.parseAsResultBinding();
        if (hasAsResult && !asResult) return;

        if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
            return;
        }

        return {
            kind: "expression_statement",
            expression: expr,
            position: expr.position,
            asResult,
        };
    }

    /**
     * Parses a `{ … }` block: statements until the closing brace. Reports an
     * error and bails if end-of-file is reached before the block is closed.
     */
    parseBlockStmt(blockContext?: any): U<BlockStatement> {
        const statements: Statement[] = [];

        const leftBrace = this.expect(TokenKind.Symbol_LeftBrace, "{ symbol expected");
        if (!leftBrace) {
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
            const stmt = this.parseStmt(blockContext);
            if (!stmt) {
                return;
            }

            statements.push(stmt);
        }
        this.advance(); //consume } symbol

        return {
            kind: "block_statement",
            statements,
            position: getTokenPosition(leftBrace),
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
            compositions: [],
        };

        const name = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
        if (!name) {
            return;
        }

        declaration.name = CreateIdentifier(name.value, getTokenPosition(name));

        let typeParams: U<Type[]>;

        if (this.current().kind == TokenKind.Symbol_Less) {
            typeParams = this.parseTypeParams(true);
            if (!typeParams) {
                return;
            }
        }

        if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
            return;
        }

        if (this.current().kind == TokenKind.Kind_Identifier) {
            const operand = this.advance();
            declaration.compositions!.push(
                CreateType(operand.value, TypeValue.TypeCustom, getTokenPosition(operand)),
            );
            if (!this.expect(TokenKind.Symbol_Ampersand, "& symbol expected")) {
                return;
            }
        }

        if (!this.expect(TokenKind.Symbol_LeftBrace, "{ symbol expected")) {
            return;
        }

        if (this.current().kind == TokenKind.Symbol_Ellipsis) {
            this.advance();
            const spreadName = this.expect(
                TokenKind.Kind_Identifier,
                "record type expected after ...",
            );
            if (!spreadName) return;
            declaration.compositions!.push(
                CreateType(spreadName.value, TypeValue.TypeCustom, getTokenPosition(spreadName)),
            );
            if (
                this.current().kind == TokenKind.Symbol_Comma ||
                this.current().kind == TokenKind.Symbol_Semicolon
            )
                this.advance();
        }

        while (this.current().kind != TokenKind.Symbol_RightBrace) {
            let fieldName: Identifier = { name: "", kind: "identifier" };
            let fieldType: Type = CreateType("", TypeValue.TypeInvalid, this.getCurrentPosition());

            const name =
                this.current().kind == TokenKind.Keyword_Error
                    ? this.advance()
                    : this.expect(TokenKind.Kind_Identifier, "identifier expected here");
            if (!name) {
                return;
            }

            fieldName = CreateIdentifier(name.value, getTokenPosition(name));

            if (!this.expect(TokenKind.Symbol_Colon, ": symbol expected")) {
                return;
            }

            const parsedFieldType = this.parseTypeReference(typeParams);
            if (!parsedFieldType) return;
            fieldType = parsedFieldType;
            declaration.fields.push({ name: fieldName, type: fieldType });
            if (this.current().kind == TokenKind.Symbol_RightBrace) {
                break;
            }

            if (this.current().kind == TokenKind.Symbol_Comma) {
                this.advance(); //consume comma and proceed
                continue;
            }
            if (this.current().kind == TokenKind.Symbol_Semicolon) {
                this.advance();
                continue;
            }
        }
        this.advance(); //consume ending brace
        if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
            return;
        }

        declaration.typeParameters = typeParams;
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

        declaration.name = CreateIdentifier(name.value, getTokenPosition(name));

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
                    name: CreateIdentifier(n.value, getTokenPosition(n)),
                    value: {
                        position: getTokenPosition(v),
                        kind: "integer_literal",
                        value: v.value,
                    },
                });
            } else {
                declaration.variants.push({
                    name: CreateIdentifier(n.value, getTokenPosition(n)),
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
            position: getTokenPosition(name),
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

        declaration.name = CreateIdentifier(name.value, getTokenPosition(name));

        if (this.current().kind == TokenKind.Symbol_Less) {
            declaration.typeParameters = this.parseTypeParams(true);
            if (!declaration.typeParameters) {
                return;
            }
        }

        if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
            return;
        }

        while (true) {
            const variantName = this.expect(TokenKind.Kind_Identifier, "identifier expected here");
            if (!variantName) {
                return;
            }

            const variant = CreateType(
                variantName.value,
                this.resolveTypeValue(variantName.value),
                getTokenPosition(variantName),
            );
            if (this.current().kind == TokenKind.Symbol_Less) {
                variant.typeParameters = this.parseTypeParams(false);
                if (!variant.typeParameters) {
                    return;
                }
            }
            declaration.variants.push(variant);

            if (this.current().kind != TokenKind.Symbol_Pipe) {
                break;
            }
            this.advance(); // consume pipe symbol
        }
        if (!this.expect(TokenKind.Symbol_Semicolon, "; symbol expected")) {
            return;
        }

        return {
            kind: "type_declaration",
            declKind: TypeDeclKind.Union,
            position: getTokenPosition(name),
            name: declaration.name,
            declaration,
        };
    }

    parseTypeDeclaration(unique = false): U<Declaration> {
        this.advance(); // consume type keyword
        const declKind = this.advance(); //consume type kind specifier: struct, union or enum

        if (declKind.kind == TokenKind.Kind_Identifier) {
            if (!this.expect(TokenKind.Symbol_Equals, "= symbol expected")) {
                return;
            }

            // Compatibility form used by `unique type T = { ... }` and older
            // record declarations. The canonical spelling remains `type struct`.
            if (this.current().kind == TokenKind.Symbol_LeftBrace) {
                this.advance();
                const fields: StructDecl["fields"] = [];
                const compositions: Type[] = [];
                while (this.current().kind != TokenKind.Symbol_RightBrace) {
                    if (this.current().kind == TokenKind.Symbol_Ellipsis) {
                        this.advance();
                        const spreadName = this.expect(
                            TokenKind.Kind_Identifier,
                            "record type expected after ...",
                        );
                        if (!spreadName) return;
                        compositions.push(
                            CreateType(
                                spreadName.value,
                                TypeValue.TypeCustom,
                                getTokenPosition(spreadName),
                            ),
                        );
                        if (
                            this.current().kind == TokenKind.Symbol_Semicolon ||
                            this.current().kind == TokenKind.Symbol_Comma
                        )
                            this.advance();
                        continue;
                    }
                    const fieldName = this.expect(
                        TokenKind.Kind_Identifier,
                        "field identifier expected",
                    );
                    if (!fieldName || !this.expect(TokenKind.Symbol_Colon, ": symbol expected"))
                        return;
                    const fieldType = this.parseTypeReference();
                    if (!fieldType) return;
                    fields.push({
                        name: CreateIdentifier(fieldName.value, getTokenPosition(fieldName)),
                        type: fieldType,
                    });
                    if (
                        this.current().kind == TokenKind.Symbol_Comma ||
                        this.current().kind == TokenKind.Symbol_Semicolon
                    )
                        this.advance();
                }
                this.advance();
                if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) return;
                const declaration: TypeDeclaration = {
                    position: getTokenPosition(declKind),
                    kind: "type_declaration",
                    name: CreateIdentifier(declKind.value, getTokenPosition(declKind)),
                    declKind: TypeDeclKind.Struct,
                    declaration: {
                        name: CreateIdentifier(declKind.value, getTokenPosition(declKind)),
                        fields,
                        compositions,
                    },
                    unique,
                };
                this.typeDecls.set(declKind.value, declaration);
                return declaration;
            }

            const target = this.expect(TokenKind.Kind_Identifier, "identifier expected");
            if (!target) {
                return;
            }

            if (this.current().kind == TokenKind.Symbol_Ampersand) {
                const fields: StructDecl["fields"] = [];
                const compositions: Type[] = [
                    CreateType(target.value, TypeValue.TypeCustom, getTokenPosition(target)),
                ];
                while (this.current().kind == TokenKind.Symbol_Ampersand) {
                    this.advance();
                    const operand = this.expect(
                        TokenKind.Kind_Identifier,
                        "record type expected after &",
                    );
                    if (!operand) return;
                    compositions.push(
                        CreateType(operand.value, TypeValue.TypeCustom, getTokenPosition(operand)),
                    );
                }
                if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) return;
                const declaration: TypeDeclaration = {
                    position: getTokenPosition(declKind),
                    kind: "type_declaration",
                    name: CreateIdentifier(declKind.value, getTokenPosition(declKind)),
                    declKind: TypeDeclKind.Struct,
                    declaration: {
                        name: CreateIdentifier(declKind.value, getTokenPosition(declKind)),
                        fields,
                        compositions,
                    },
                    unique,
                };
                this.typeDecls.set(declKind.value, declaration);
                return declaration;
            }

            if (!this.expect(TokenKind.Symbol_Semicolon, "; expected")) {
                return;
            }

            const declaration: TypeDeclaration = {
                position: getTokenPosition(declKind),
                kind: "type_declaration",
                name: CreateIdentifier(declKind.value, getTokenPosition(declKind)),
                declKind: TypeDeclKind.Alias,
                declaration: {
                    target: CreateType(
                        target.value,
                        this.resolveTypeValue(target.value),
                        getTokenPosition(target),
                    ),
                } as TypeAlias,
                unique,
            };
            this.typeDecls.set(declKind.value, declaration);
            return declaration;
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
                unique,
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
            const documentation = this.takeDocumentationComments();

            if (this.current().kind == TokenKind.Kind_EOF) {
                break;
            }

            if (
                this.current().kind == TokenKind.Keyword_Type ||
                this.current().kind == TokenKind.Keyword_Unique
            ) {
                const declarationStart = this.pos;
                const unique = this.current().kind == TokenKind.Keyword_Unique;
                if (unique) {
                    this.advance();
                    if (!this.expect(TokenKind.Keyword_Type, "type expected after unique"))
                        continue;
                    // parseTypeDeclaration consumes the `type` token itself.
                    this.pos--;
                }
                const decl = this.parseTypeDeclaration(unique);
                if (!decl) {
                    this.synchronizeTopLevel(declarationStart);
                    continue;
                }
                decl.documentation = documentation;
                decls.push(decl);
                continue;
            }

            if (this.current().kind == TokenKind.Keyword_Let) {
                const declarationStart = this.pos;
                this.diagnostics.addError(
                    Error(
                        this.filepath,
                        "parser",
                        this.getCurrentPosition(),
                        "`let` is not allowed at file scope; use `const`",
                    ),
                );
                this.synchronizeTopLevel(declarationStart);
                continue;
            }

            if (this.current().kind == TokenKind.Keyword_Const) {
                const declarationStart = this.pos;
                const decl = this.parseVariableDeclarationStmt(true);
                if (!decl) {
                    this.synchronizeTopLevel(declarationStart);
                    continue;
                }
                decl.documentation = documentation;
                decls.push(decl);
                continue;
            }

            if (this.current().kind == TokenKind.Keyword_Function) {
                const declarationStart = this.pos;
                const decl = this.parseFuncDecl();
                if (!decl) {
                    this.synchronizeTopLevel(declarationStart);
                    continue;
                }
                decl.documentation = documentation;
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
     * Resumes after a malformed top-level declaration without interpreting
     * its remaining fields or body statements as new declarations.
     */
    synchronizeTopLevel(declarationStart: number): void {
        let braceDepth = 0;
        let sawBrace = false;
        for (let index = declarationStart; index < this.pos; index++) {
            const kind = this.tokens[index]?.kind;
            if (kind == TokenKind.Symbol_LeftBrace) {
                braceDepth++;
                sawBrace = true;
            } else if (kind == TokenKind.Symbol_RightBrace && braceDepth > 0) {
                braceDepth--;
            }
        }
        const startsDeclaration = (kind: TokenKind) =>
            [
                TokenKind.Keyword_Type,
                TokenKind.Keyword_Unique,
                TokenKind.Keyword_Const,
                TokenKind.Keyword_Function,
            ].includes(kind);

        while (this.current().kind != TokenKind.Kind_EOF) {
            const token = this.current();
            if (braceDepth == 0 && this.pos > declarationStart && startsDeclaration(token.kind)) {
                return;
            }
            if (token.kind == TokenKind.Symbol_LeftBrace) {
                sawBrace = true;
                braceDepth++;
            } else if (token.kind == TokenKind.Symbol_RightBrace) {
                if (braceDepth == 0) {
                    this.advance();
                    if (this.current().kind == TokenKind.Symbol_Semicolon) this.advance();
                    return;
                }
                braceDepth--;
                if (sawBrace && braceDepth == 0) {
                    this.advance();
                    if (this.current().kind == TokenKind.Symbol_Semicolon) this.advance();
                    return;
                }
            } else if (!sawBrace && token.kind == TokenKind.Symbol_Semicolon) {
                this.advance();
                return;
            }
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
}
