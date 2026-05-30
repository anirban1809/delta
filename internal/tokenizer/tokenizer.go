package tokenizer

import (
	"fmt"
	"unicode"

	"delta/internal/token"
)

type Tokenizer struct {
	source []rune
	index  int
	line   int
	column int
}

func Tokenize(source string) ([]token.Token, error) {
	t := &Tokenizer{
		source: []rune(source),
		line:   1,
		column: 1,
	}

	var tokens []token.Token
	for {
		next, err := t.nextToken()
		if err != nil {
			return nil, err
		}

		tokens = append(tokens, next)
		if next.Kind == token.Kind_EOF {
			return tokens, nil
		}
	}
}

func (t *Tokenizer) nextToken() (token.Token, error) {
	t.skipWhitespace()

	line := t.line
	column := t.column

	if t.isAtEnd() {
		return token.Token{
			Kind:   token.Kind_EOF,
			Line:   line,
			Column: column,
		}, nil
	}

	current := t.peek()

	if isIdentifierStart(current) {
		return t.identifier(), nil
	}

	if unicode.IsDigit(current) {
		return t.integerLiteral(), nil
	}

	if current == '"' {
		return t.stringLiteral()
	}

	if current == '\'' {
		return t.characterLiteral()
	}

	t.advance()
	switch current {
	case '(':
		return token.Token{
			Kind:   token.Symbol_LeftParen,
			Lexeme: "(",
			Line:   line,
			Column: column,
		}, nil
	case ')':
		return token.Token{
			Kind:   token.Symbol_RightParen,
			Lexeme: ")",
			Line:   line,
			Column: column,
		}, nil
	case '{':
		return token.Token{
			Kind:   token.Symbol_LeftBrace,
			Lexeme: "{",
			Line:   line,
			Column: column,
		}, nil
	case '}':
		return token.Token{
			Kind:   token.Symbol_RightBrace,
			Lexeme: "}",
			Line:   line,
			Column: column,
		}, nil
	case ':':
		return token.Token{
			Kind:   token.Symbol_Colon,
			Lexeme: ":",
			Line:   line,
			Column: column,
		}, nil
	case ';':
		return token.Token{
			Kind:   token.Symbol_Semicolon,
			Lexeme: ";",
			Line:   line,
			Column: column,
		}, nil
	case ',':
		return token.Token{
			Kind:   token.Symbol_Comma,
			Lexeme: ",",
			Line:   line,
			Column: column,
		}, nil
	case '+':
		return token.Token{
			Kind:   token.Symbol_Plus,
			Lexeme: "+",
			Line:   line,
			Column: column,
		}, nil
	case '-':
		return token.Token{
			Kind:   token.Symbol_Minus,
			Lexeme: "-",
			Line:   line,
			Column: column,
		}, nil
	case '*':
		return token.Token{
			Kind:   token.Symbol_Asterisk,
			Lexeme: "*",
			Line:   line,
			Column: column,
		}, nil
	case '/':
		return token.Token{
			Kind:   token.Symbol_FSlash,
			Lexeme: "/",
			Line:   line,
			Column: column,
		}, nil

	case '>':
		if t.peek() == '=' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_GreaterEq,
				Lexeme: ">=",
				Line:   line,
				Column: column,
			}, nil
		}

		return token.Token{
			Kind:   token.Symbol_Greater,
			Lexeme: ">",
			Line:   line,
			Column: column,
		}, nil
	case '<':
		if t.peek() == '=' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_LessEq,
				Lexeme: "<=",
				Line:   line,
				Column: column,
			}, nil
		}

		return token.Token{
			Kind:   token.Symbol_Less,
			Lexeme: "<",
			Line:   line,
			Column: column,
		}, nil

	case '!':
		if t.peek() == '=' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_NotEquals,
				Lexeme: "!=",
				Line:   line,
				Column: column,
			}, nil
		}

		return token.Token{
			Kind:   token.Symbol_Not,
			Lexeme: "!",
			Line:   line,
			Column: column,
		}, nil
	case '=':
		if t.peek() == '=' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_Equality,
				Lexeme: "==",
				Line:   line,
				Column: column,
			}, nil
		}

		return token.Token{
			Kind:   token.Symbol_Equals,
			Lexeme: "=",
			Line:   line,
			Column: column,
		}, nil
	case '&':
		if t.peek() == '&' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_LogicalAnd,
				Lexeme: "&&",
				Line:   line,
				Column: column,
			}, nil
		}

		return token.Token{}, fmt.Errorf(
			"%d:%d: unexpected character '&'; did you mean '&&'?",
			line,
			column,
		)
	case '|':
		if t.peek() == '|' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_LogicalOr,
				Lexeme: "||",
				Line:   line,
				Column: column,
			}, nil
		}

		return token.Token{}, fmt.Errorf(
			"%d:%d: unexpected character '|'; did you mean '||'?",
			line,
			column,
		)

	default:
		return token.Token{}, fmt.Errorf(
			"%d:%d: unexpected character %q",
			line,
			column,
			current,
		)
	}
}

func (t *Tokenizer) identifier() token.Token {
	start := t.index
	line := t.line
	column := t.column

	for !t.isAtEnd() && isIdentifierPart(t.peek()) {
		t.advance()
	}

	lexeme := string(t.source[start:t.index])
	return token.Token{
		Kind:   token.LookupIdent(lexeme),
		Lexeme: lexeme,
		Line:   line,
		Column: column,
	}
}

func (t *Tokenizer) integerLiteral() token.Token {
	start := t.index
	line := t.line
	column := t.column

	for !t.isAtEnd() && unicode.IsDigit(t.peek()) {
		t.advance()
	}

	return token.Token{
		Kind:   token.Kind_IntegerLiteral,
		Lexeme: string(t.source[start:t.index]),
		Line:   line,
		Column: column,
	}
}

func (t *Tokenizer) stringLiteral() (token.Token, error) {
	return t.quotedLiteral(token.Kind_StringLiteral, '"', "string")
}

func (t *Tokenizer) characterLiteral() (token.Token, error) {
	tok, err := t.quotedLiteral(token.Kind_CharacterLiteral, '\'', "character")
	if err != nil {
		return token.Token{}, err
	}

	if literalValueCount(tok.Lexeme) != 1 {
		return token.Token{}, fmt.Errorf(
			"%d:%d: character literal must contain exactly one character",
			tok.Line,
			tok.Column,
		)
	}

	return tok, nil
}

func (t *Tokenizer) quotedLiteral(
	kind token.Kind,
	delimiter rune,
	name string,
) (token.Token, error) {
	line := t.line
	column := t.column

	t.advance() // consume opening delimiter
	start := t.index

	for !t.isAtEnd() {
		current := t.peek()
		if current == delimiter {
			lexeme := string(t.source[start:t.index])
			t.advance() // consume closing delimiter
			return token.Token{
				Kind:   kind,
				Lexeme: lexeme,
				Line:   line,
				Column: column,
			}, nil
		}

		if current == '\n' || current == '\r' {
			return token.Token{}, fmt.Errorf(
				"%d:%d: unterminated %s literal",
				line,
				column,
				name,
			)
		}

		if current == '\\' {
			if err := t.consumeEscape(name); err != nil {
				return token.Token{}, err
			}
			continue
		}

		t.advance()
	}

	return token.Token{}, fmt.Errorf(
		"%d:%d: unterminated %s literal",
		line,
		column,
		name,
	)
}

func (t *Tokenizer) consumeEscape(name string) error {
	line := t.line
	column := t.column

	t.advance() // consume backslash
	if t.isAtEnd() {
		return fmt.Errorf("%d:%d: unterminated escape sequence", line, column)
	}

	escaped := t.advance()
	switch escaped {
	case 'n', 't', 'r', '\\', '\'', '"', '0':
		return nil
	case 'x':
		for i := 0; i < 2; i++ {
			if t.isAtEnd() || !isHexDigit(t.peek()) {
				return fmt.Errorf(
					"%d:%d: expected two hexadecimal digits in %s literal escape",
					line,
					column,
					name,
				)
			}
			t.advance()
		}
		return nil
	case 'u':
		if t.isAtEnd() || t.peek() != '{' {
			return fmt.Errorf(
				"%d:%d: expected '{' after unicode escape in %s literal",
				line,
				column,
				name,
			)
		}
		t.advance() // consume {

		digits := 0
		value := 0
		for !t.isAtEnd() && t.peek() != '}' {
			if !isHexDigit(t.peek()) {
				return fmt.Errorf(
					"%d:%d: invalid unicode escape in %s literal",
					line,
					column,
					name,
				)
			}
			value = value*16 + hexValue(t.peek())
			digits++
			if digits > 6 {
				return fmt.Errorf(
					"%d:%d: unicode escape in %s literal must be at most 6 digits",
					line,
					column,
					name,
				)
			}
			t.advance()
		}

		if digits == 0 {
			return fmt.Errorf(
				"%d:%d: unicode escape in %s literal requires at least one digit",
				line,
				column,
				name,
			)
		}

		if !isUnicodeScalarValue(value) {
			return fmt.Errorf(
				"%d:%d: unicode escape in %s literal is not a valid scalar value",
				line,
				column,
				name,
			)
		}

		if t.isAtEnd() {
			return fmt.Errorf(
				"%d:%d: unterminated unicode escape in %s literal",
				line,
				column,
				name,
			)
		}

		t.advance() // consume }
		return nil
	default:
		return fmt.Errorf(
			"%d:%d: unknown escape sequence \\%c in %s literal",
			line,
			column,
			escaped,
			name,
		)
	}
}

func literalValueCount(lexeme string) int {
	runes := []rune(lexeme)
	count := 0

	for i := 0; i < len(runes); i++ {
		if runes[i] != '\\' {
			count++
			continue
		}

		count++
		if i+1 >= len(runes) {
			break
		}

		i++
		switch runes[i] {
		case 'x':
			i += 2
		case 'u':
			if i+1 < len(runes) && runes[i+1] == '{' {
				i += 2
				for i < len(runes) && runes[i] != '}' {
					i++
				}
			}
		}
	}

	return count
}

func (t *Tokenizer) skipWhitespace() {
	for !t.isAtEnd() {
		switch t.peek() {
		case ' ', '\t', '\r', '\n':
			t.advance()
		default:
			return
		}
	}
}

func (t *Tokenizer) isAtEnd() bool {
	return t.index >= len(t.source)
}

func (t *Tokenizer) peek() rune {
	if t.isAtEnd() {
		return 0
	}

	return t.source[t.index]
}

func (t *Tokenizer) peekNext() rune {
	if t.isAtEnd() {
		return 0
	}

	nextRune := t.source[t.index+1]

	for nextRune == ' ' ||
		nextRune == '\t' ||
		nextRune == '\n' ||
		nextRune == '\r' {
		t.index++
		nextRune = t.source[t.index+1]
	}

	return nextRune
}

func (t *Tokenizer) advance() rune {
	current := t.source[t.index]
	t.index++

	if current == '\n' {
		t.line++
		t.column = 1
	} else {
		t.column++
	}

	return current
}

func isIdentifierStart(r rune) bool {
	return r == '_' || unicode.IsLetter(r)
}

func isIdentifierPart(r rune) bool {
	return isIdentifierStart(r) || unicode.IsDigit(r)
}

func isHexDigit(r rune) bool {
	return ('0' <= r && r <= '9') ||
		('a' <= r && r <= 'f') ||
		('A' <= r && r <= 'F')
}

func hexValue(r rune) int {
	switch {
	case '0' <= r && r <= '9':
		return int(r - '0')
	case 'a' <= r && r <= 'f':
		return int(r-'a') + 10
	case 'A' <= r && r <= 'F':
		return int(r-'A') + 10
	default:
		return 0
	}
}

func isUnicodeScalarValue(value int) bool {
	return value <= 0x10FFFF && (value < 0xD800 || value > 0xDFFF)
}
