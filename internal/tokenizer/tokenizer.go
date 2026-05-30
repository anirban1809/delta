package tokenizer

import (
	"unicode"

	"delta/internal/diagnostics"
	"delta/internal/token"
)

type Tokenizer struct {
	source   []rune
	index    int
	line     int
	column   int
	errorBag *diagnostics.ErrorBag
}

func Tokenize(
	source string,
	errorBag *diagnostics.ErrorBag,
) ([]token.Token, error) {
	t := &Tokenizer{
		source:   []rune(source),
		line:     1,
		column:   1,
		errorBag: errorBag,
	}

	var tokens []token.Token
	for {
		next := t.nextToken()
		tokens = append(tokens, next)
		if next.Kind == token.Kind_EOF {
			return tokens, nil
		}
	}
}

func (t *Tokenizer) nextToken() token.Token {
	t.skipWhitespace()

	line := t.line
	column := t.column

	if t.isAtEnd() {
		return token.Token{
			Kind:   token.Kind_EOF,
			Line:   line,
			Column: column,
		}
	}

	current := t.peek()

	if isIdentifierStart(current) {
		return t.identifier()
	}

	if unicode.IsDigit(current) {
		return t.integerLiteral()
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
		}
	case ')':
		return token.Token{
			Kind:   token.Symbol_RightParen,
			Lexeme: ")",
			Line:   line,
			Column: column,
		}
	case '{':
		return token.Token{
			Kind:   token.Symbol_LeftBrace,
			Lexeme: "{",
			Line:   line,
			Column: column,
		}
	case '}':
		return token.Token{
			Kind:   token.Symbol_RightBrace,
			Lexeme: "}",
			Line:   line,
			Column: column,
		}
	case ':':
		return token.Token{
			Kind:   token.Symbol_Colon,
			Lexeme: ":",
			Line:   line,
			Column: column,
		}
	case ';':
		return token.Token{
			Kind:   token.Symbol_Semicolon,
			Lexeme: ";",
			Line:   line,
			Column: column,
		}
	case ',':
		return token.Token{
			Kind:   token.Symbol_Comma,
			Lexeme: ",",
			Line:   line,
			Column: column,
		}
	case '+':
		return token.Token{
			Kind:   token.Symbol_Plus,
			Lexeme: "+",
			Line:   line,
			Column: column,
		}
	case '-':
		return token.Token{
			Kind:   token.Symbol_Minus,
			Lexeme: "-",
			Line:   line,
			Column: column,
		}
	case '*':
		return token.Token{
			Kind:   token.Symbol_Asterisk,
			Lexeme: "*",
			Line:   line,
			Column: column,
		}
	case '/':
		return token.Token{
			Kind:   token.Symbol_FSlash,
			Lexeme: "/",
			Line:   line,
			Column: column,
		}

	case '>':
		if t.peek() == '=' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_GreaterEq,
				Lexeme: ">=",
				Line:   line,
				Column: column,
			}
		}

		return token.Token{
			Kind:   token.Symbol_Greater,
			Lexeme: ">",
			Line:   line,
			Column: column,
		}
	case '<':
		if t.peek() == '=' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_LessEq,
				Lexeme: "<=",
				Line:   line,
				Column: column,
			}
		}

		return token.Token{
			Kind:   token.Symbol_Less,
			Lexeme: "<",
			Line:   line,
			Column: column,
		}

	case '!':
		if t.peek() == '=' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_NotEquals,
				Lexeme: "!=",
				Line:   line,
				Column: column,
			}
		}

		return token.Token{
			Kind:   token.Symbol_Not,
			Lexeme: "!",
			Line:   line,
			Column: column,
		}
	case '=':
		if t.peek() == '=' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_Equality,
				Lexeme: "==",
				Line:   line,
				Column: column,
			}
		}

		return token.Token{
			Kind:   token.Symbol_Equals,
			Lexeme: "=",
			Line:   line,
			Column: column,
		}
	case '&':
		if t.peek() == '&' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_LogicalAnd,
				Lexeme: "&&",
				Line:   line,
				Column: column,
			}
		}

		t.addError(
			line,
			column,
			"unexpected character '&'; did you mean '&&'?",
		)
		return illegalToken("&", line, column)
	case '|':
		if t.peek() == '|' {
			t.advance()
			return token.Token{
				Kind:   token.Symbol_LogicalOr,
				Lexeme: "||",
				Line:   line,
				Column: column,
			}
		}

		return token.Token{
			Kind:   token.Symbol_Pipe,
			Lexeme: "|",
			Line:   line,
			Column: column,
		}

	default:
		t.addError(
			line,
			column,
			"unexpected character '"+string(current)+"'",
		)
		return illegalToken(string(current), line, column)
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

func (t *Tokenizer) stringLiteral() token.Token {
	return t.quotedLiteral(token.Kind_StringLiteral, '"', "string")
}

func (t *Tokenizer) characterLiteral() token.Token {
	tok := t.quotedLiteral(token.Kind_CharacterLiteral, '\'', "character")
	if tok.Kind == token.Kind_Illegal {
		return tok
	}

	if literalValueCount(tok.Lexeme) != 1 {
		t.addError(
			tok.Line,
			tok.Column,
			"character literal must contain exactly one character",
		)
		return illegalToken(tok.Lexeme, tok.Line, tok.Column)
	}

	return tok
}

func (t *Tokenizer) quotedLiteral(
	kind token.Kind,
	delimiter rune,
	name string,
) token.Token {
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
			}
		}

		if current == '\n' || current == '\r' {
			t.addError(
				line,
				column,
				"unterminated "+name+" literal",
			)
			return illegalToken(string(t.source[start:t.index]), line, column)
		}

		if current == '\\' {
			t.consumeEscape(name)
			continue
		}

		t.advance()
	}

	t.addError(
		line,
		column,
		"unterminated "+name+" literal",
	)
	return illegalToken(string(t.source[start:t.index]), line, column)
}

func (t *Tokenizer) consumeEscape(name string) {
	line := t.line
	column := t.column

	t.advance() // consume backslash
	if t.isAtEnd() {
		t.addError(line, column, "unterminated escape sequence")
		return
	}

	escaped := t.advance()
	switch escaped {
	case 'n', 't', 'r', '\\', '\'', '"', '0':
		return
	case 'x':
		for i := 0; i < 2; i++ {
			if t.isAtEnd() || !isHexDigit(t.peek()) {
				t.addError(
					line,
					column,
					"expected two hexadecimal digits in "+name+" literal escape",
				)
				return
			}
			t.advance()
		}
		return
	case 'u':
		if t.isAtEnd() || t.peek() != '{' {
			t.addError(
				line,
				column,
				"expected '{' after unicode escape in "+name+" literal",
			)
			return
		}
		t.advance() // consume {

		digits := 0
		value := 0
		for !t.isAtEnd() && t.peek() != '}' {
			if !isHexDigit(t.peek()) {
				t.addError(
					line,
					column,
					"invalid unicode escape in "+name+" literal",
				)
				return
			}
			value = value*16 + hexValue(t.peek())
			digits++
			if digits > 6 {
				t.addError(
					line,
					column,
					"unicode escape in "+name+" literal must be at most 6 digits",
				)
				return
			}
			t.advance()
		}

		if digits == 0 {
			t.addError(
				line,
				column,
				"unicode escape in "+name+" literal requires at least one digit",
			)
			return
		}

		if !isUnicodeScalarValue(value) {
			t.addError(
				line,
				column,
				"unicode escape in "+name+" literal is not a valid scalar value",
			)
			return
		}

		if t.isAtEnd() {
			t.addError(
				line,
				column,
				"unterminated unicode escape in "+name+" literal",
			)
			return
		}

		t.advance() // consume }
		return
	default:
		t.addError(
			line,
			column,
			"unknown escape sequence \\"+string(escaped)+" in "+name+" literal",
		)
		return
	}
}

func (t *Tokenizer) addError(line int, column int, message string) {
	t.errorBag.AddError(diagnostics.SourceError{
		Stage:    diagnostics.Tokenizer,
		Severity: diagnostics.Error,
		Line:     line,
		Column:   column,
		Message:  message,
	})
}

func illegalToken(lexeme string, line int, column int) token.Token {
	return token.Token{
		Kind:   token.Kind_Illegal,
		Lexeme: lexeme,
		Line:   line,
		Column: column,
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
