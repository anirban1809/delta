import { TokenKind, getTokenKind, type Token } from "./tokens.js";

const NUL = "\0";

/**
 * Tokenizer turns Delta source text into a flat list of {@link Token}s.
 *
 * It is a single-pass, lookahead scanner: `tokenize()` walks the source from
 * start to finish and always terminates the stream with a `Kind_EOF` token.
 * Unrecognized characters become `Kind_Illegal` tokens rather than throwing,
 * so callers can collect and report several lexical errors at once.
 */
export class Tokenizer {
    private readonly source: string;
    private pos = 0;
    private line = 1;
    private column = 1;

    constructor(source: string) {
        this.source = source;
    }

    tokenize(): Token[] {
        const tokens: Token[] = [];

        while (!this.isAtEnd()) {
            const token = this.scanToken();
            if (token !== null) {
                tokens.push(token);
            }
        }

        tokens.push(this.makeEofToken());
        return tokens;
    }

    log(tokens: Token[]) {
        console.log(
            tokens.map((x) => ({
                kind: x.kind,
                value: x.value,
                start: x.start,
                end: x.end,
            })),
        );
    }

    /** Scans a single token, or returns null when only whitespace was consumed. */
    private scanToken(): Token | null {
        this.skipWhitespace();
        if (this.isAtEnd()) {
            return null;
        }

        const startPos = this.pos;
        const startLine = this.line;
        const startColumn = this.column;

        const c = this.advance();

        // Identifiers and keywords.
        if (this.isAlpha(c)) {
            while (this.isAlphaNumeric(this.peek())) {
                this.advance();
            }
            const lexeme = this.source.slice(startPos, this.pos);
            return this.finish(getTokenKind(lexeme), startPos, startLine, startColumn);
        }

        // Numeric literals.
        if (this.isDigit(c)) {
            return this.scanNumber(startPos, startLine, startColumn);
        }

        switch (c) {
            case '"':
                return this.scanString(startPos, startLine, startColumn);
            case "'":
                return this.scanChar(startPos, startLine, startColumn);

            case "(":
                return this.finish(TokenKind.Symbol_LeftParen, startPos, startLine, startColumn);
            case ")":
                return this.finish(TokenKind.Symbol_RightParen, startPos, startLine, startColumn);
            case "{":
                return this.finish(TokenKind.Symbol_LeftBrace, startPos, startLine, startColumn);
            case "}":
                return this.finish(TokenKind.Symbol_RightBrace, startPos, startLine, startColumn);
            case ":":
                return this.finish(TokenKind.Symbol_Colon, startPos, startLine, startColumn);
            case ";":
                return this.finish(TokenKind.Symbol_Semicolon, startPos, startLine, startColumn);
            case ",":
                return this.finish(TokenKind.Symbol_Comma, startPos, startLine, startColumn);
            case "%":
                return this.finish(TokenKind.Symbol_Percent, startPos, startLine, startColumn);
            case "^":
                return this.finish(TokenKind.Symbol_Caret, startPos, startLine, startColumn);
            case "~":
                return this.finish(TokenKind.Symbol_Tilde, startPos, startLine, startColumn);

            case "+":
                if (this.match("+"))
                    return this.finish(
                        TokenKind.Symbol_Increment,
                        startPos,
                        startLine,
                        startColumn,
                    );
                if (this.match("="))
                    return this.finish(
                        TokenKind.Symbol_PlusEquals,
                        startPos,
                        startLine,
                        startColumn,
                    );
                return this.finish(TokenKind.Symbol_Plus, startPos, startLine, startColumn);

            case "-":
                if (this.match("-"))
                    return this.finish(
                        TokenKind.Symbol_Decrement,
                        startPos,
                        startLine,
                        startColumn,
                    );
                if (this.match("="))
                    return this.finish(
                        TokenKind.Symbol_MinusEquals,
                        startPos,
                        startLine,
                        startColumn,
                    );
                return this.finish(TokenKind.Symbol_Minus, startPos, startLine, startColumn);

            case "*":
                if (this.match("="))
                    return this.finish(
                        TokenKind.Symbol_AsteriskEquals,
                        startPos,
                        startLine,
                        startColumn,
                    );
                return this.finish(TokenKind.Symbol_Asterisk, startPos, startLine, startColumn);

            case "/":
                if (this.peek() === "/")
                    return this.scanLineComment(startPos, startLine, startColumn);
                if (this.peek() === "*")
                    return this.scanBlockComment(startPos, startLine, startColumn);
                return this.finish(TokenKind.Symbol_FSlash, startPos, startLine, startColumn);

            case "<":
                if (this.match("<"))
                    return this.finish(
                        TokenKind.Symbol_ShiftLeft,
                        startPos,
                        startLine,
                        startColumn,
                    );
                if (this.match("="))
                    return this.finish(TokenKind.Symbol_LessEq, startPos, startLine, startColumn);
                return this.finish(TokenKind.Symbol_Less, startPos, startLine, startColumn);

            case ">":
                if (this.match(">"))
                    return this.finish(
                        TokenKind.Symbol_ShiftRight,
                        startPos,
                        startLine,
                        startColumn,
                    );
                if (this.match("="))
                    return this.finish(
                        TokenKind.Symbol_GreaterEq,
                        startPos,
                        startLine,
                        startColumn,
                    );
                return this.finish(TokenKind.Symbol_Greater, startPos, startLine, startColumn);

            case "=":
                if (this.match("="))
                    return this.finish(TokenKind.Symbol_Equality, startPos, startLine, startColumn);
                return this.finish(TokenKind.Symbol_Equals, startPos, startLine, startColumn);

            case "!":
                if (this.match("="))
                    return this.finish(
                        TokenKind.Symbol_NotEquals,
                        startPos,
                        startLine,
                        startColumn,
                    );
                return this.finish(TokenKind.Symbol_Not, startPos, startLine, startColumn);

            case "&":
                if (this.match("&"))
                    return this.finish(
                        TokenKind.Symbol_LogicalAnd,
                        startPos,
                        startLine,
                        startColumn,
                    );
                return this.finish(TokenKind.Symbol_Ampersand, startPos, startLine, startColumn);

            case "|":
                if (this.match("|"))
                    return this.finish(
                        TokenKind.Symbol_LogicalOr,
                        startPos,
                        startLine,
                        startColumn,
                    );
                return this.finish(TokenKind.Symbol_Pipe, startPos, startLine, startColumn);

            case ".":
                if (this.peek() === "." && this.peek(1) === ".") {
                    this.advance();
                    this.advance();
                    return this.finish(TokenKind.Symbol_Ellipsis, startPos, startLine, startColumn);
                }
                if (this.match("."))
                    return this.finish(TokenKind.Symbol_Range, startPos, startLine, startColumn);
                return this.finish(TokenKind.Symbol_Dot, startPos, startLine, startColumn);

            default:
                return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
        }
    }

    private scanNumber(startPos: number, startLine: number, startColumn: number): Token {
        if (this.source[startPos] === "0") {
            const prefix = this.peek();

            if (prefix === "b" || prefix === "B") {
                this.advance();
                if (!this.scanDigitsWithSeparators((c) => this.isBinaryDigit(c))) {
                    return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
                }
                return this.finish(TokenKind.Kind_IntegerLiteral, startPos, startLine, startColumn);
            }

            if (prefix === "o" || prefix === "O") {
                this.advance();
                if (!this.scanDigitsWithSeparators((c) => this.isOctalDigit(c))) {
                    return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
                }
                return this.finish(TokenKind.Kind_IntegerLiteral, startPos, startLine, startColumn);
            }

            if (prefix === "x" || prefix === "X") {
                this.advance();
                if (!this.scanDigitsWithSeparators((c) => this.isHexDigit(c))) {
                    return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
                }
                return this.finish(TokenKind.Kind_IntegerLiteral, startPos, startLine, startColumn);
            }
        }

        if (!this.scanRemainingDigitsWithSeparators((c) => this.isDigit(c))) {
            return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
        }

        let isFloat = false;

        // A fractional part requires a digit after the dot so that ranges like
        // `1..5` keep the `..` as a single Range token rather than a float.
        if (this.peek() === "." && this.isDigit(this.peek(1))) {
            isFloat = true;
            this.advance(); // consume '.'
            if (!this.scanDigitsWithSeparators((c) => this.isDigit(c))) {
                return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
            }
        }

        // Optional exponent: e / E, an optional sign, then one or more digits.
        if (this.peek() === "e" || this.peek() === "E") {
            const signOffset = this.peek(1) === "+" || this.peek(1) === "-" ? 2 : 1;
            if (this.isDigit(this.peek(signOffset))) {
                isFloat = true;
                this.advance(); // consume 'e'/'E'
                if (this.peek() === "+" || this.peek() === "-") {
                    this.advance();
                }
                if (!this.scanDigitsWithSeparators((c) => this.isDigit(c))) {
                    return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
                }
            }
        }

        const kind = isFloat ? TokenKind.Kind_FloatLiteral : TokenKind.Kind_IntegerLiteral;
        return this.finish(kind, startPos, startLine, startColumn);
    }

    private scanString(startPos: number, startLine: number, startColumn: number): Token {
        while (!this.isAtEnd()) {
            const c = this.peek();
            if (c === '"') {
                this.advance(); // closing quote
                return this.finish(TokenKind.Kind_StringLiteral, startPos, startLine, startColumn);
            }
            if (c === "\n") {
                break; // unterminated: strings do not span lines
            }
            if (c === "\\") {
                this.advance(); // consume backslash so the next char is escaped
            }
            this.advance();
        }
        // Reached EOF or newline without a closing quote.
        return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
    }

    private scanChar(startPos: number, startLine: number, startColumn: number): Token {
        while (!this.isAtEnd()) {
            const c = this.peek();
            if (c === "'") {
                this.advance(); // closing quote
                return this.finish(
                    TokenKind.Kind_CharacterLiteral,
                    startPos,
                    startLine,
                    startColumn,
                );
            }
            if (c === "\n") {
                break;
            }
            if (c === "\\") {
                this.advance();
            }
            this.advance();
        }
        return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
    }

    private scanLineComment(startPos: number, startLine: number, startColumn: number): Token {
        while (!this.isAtEnd() && this.peek() !== "\n") {
            this.advance();
        }
        return this.finish(TokenKind.Kind_LineComment, startPos, startLine, startColumn);
    }

    private scanBlockComment(startPos: number, startLine: number, startColumn: number): Token {
        this.advance(); // consume the '*' of the opening '/*'
        while (!this.isAtEnd()) {
            if (this.peek() === "*" && this.peek(1) === "/") {
                this.advance(); // '*'
                this.advance(); // '/'
                return this.finish(TokenKind.Kind_BlockComment, startPos, startLine, startColumn);
            }
            this.advance();
        }
        // Unterminated block comment.
        return this.finish(TokenKind.Kind_Illegal, startPos, startLine, startColumn);
    }

    // --- low-level scanning helpers -----------------------------------------

    private finish(
        kind: TokenKind,
        startPos: number,
        startLine: number,
        startColumn: number,
    ): Token {
        const value = this.source.slice(startPos, this.pos);

        return {
            kind,
            value,
            line: startLine,
            column: startColumn,
            start: startPos,
            end: this.pos,
        };
    }

    private makeEofToken(): Token {
        return {
            kind: TokenKind.Kind_EOF,
            value: "",
            line: this.line,
            column: this.column,
            start: this.pos,
            end: this.pos,
        };
    }

    private skipWhitespace(): void {
        while (!this.isAtEnd()) {
            const c = this.peek();
            if (c === " " || c === "\t" || c === "\r" || c === "\n") {
                this.advance();
            } else {
                break;
            }
        }
    }

    private advance(): string {
        const c = this.source[this.pos] ?? NUL;
        this.pos++;
        if (c === "\n") {
            this.line++;
            this.column = 1;
        } else {
            this.column++;
        }
        return c;
    }

    /** Returns true and consumes one char when it equals `expected`. */
    private match(expected: string): boolean {
        if (this.peek() !== expected) {
            return false;
        }
        this.advance();
        return true;
    }

    private peek(offset = 0): string {
        return this.source[this.pos + offset] ?? NUL;
    }

    private isAtEnd(): boolean {
        return this.pos >= this.source.length;
    }

    private scanDigitsWithSeparators(isValidDigit: (c: string) => boolean): boolean {
        if (!isValidDigit(this.peek())) {
            this.consumeNumericTail();
            return false;
        }

        this.advance();
        return this.scanRemainingDigitsWithSeparators(isValidDigit);
    }

    private scanRemainingDigitsWithSeparators(isValidDigit: (c: string) => boolean): boolean {
        while (true) {
            if (isValidDigit(this.peek())) {
                this.advance();
                continue;
            }

            if (this.peek() === "_") {
                this.advance();
                if (!isValidDigit(this.peek())) {
                    this.consumeNumericTail();
                    return false;
                }
                this.advance();
                continue;
            }

            return true;
        }
    }

    private consumeNumericTail(): void {
        while (this.isAlphaNumeric(this.peek())) {
            this.advance();
        }
    }

    private isBinaryDigit(c: string): boolean {
        return c === "0" || c === "1";
    }

    private isOctalDigit(c: string): boolean {
        return c >= "0" && c <= "7";
    }

    private isHexDigit(c: string): boolean {
        return this.isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
    }

    private isDigit(c: string): boolean {
        return c >= "0" && c <= "9";
    }

    private isAlpha(c: string): boolean {
        return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
    }

    private isAlphaNumeric(c: string): boolean {
        return this.isAlpha(c) || this.isDigit(c);
    }
}
