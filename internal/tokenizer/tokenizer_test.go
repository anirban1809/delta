package tokenizer

import (
	"testing"

	"delta/internal/diagnostics"
	"delta/internal/token"
)

func TestTokenizeEmitsLineComments(t *testing.T) {
	source := "let value = 1 // ignore + tokens\n+ 2"
	tokens, errorBag := tokenizeForTest(source)

	assertNoErrors(t, errorBag)
	assertKinds(t, tokens,
		token.Keyword_Let,
		token.Kind_Identifier,
		token.Symbol_Equals,
		token.Kind_IntegerLiteral,
		token.Kind_LineComment,
		token.Symbol_Plus,
		token.Kind_IntegerLiteral,
		token.Kind_EOF,
	)

	if tokens[4].Lexeme != "// ignore + tokens" {
		t.Fatalf("expected line comment lexeme, got %q", tokens[4].Lexeme)
	}
	assertTokenPosition(t, tokens[5], 2, 1)
}

func TestTokenizeEmitsBlockComments(t *testing.T) {
	source := "let/* gap\n still */value"
	tokens, errorBag := tokenizeForTest(source)

	assertNoErrors(t, errorBag)
	assertKinds(t, tokens,
		token.Keyword_Let,
		token.Kind_BlockComment,
		token.Kind_Identifier,
		token.Kind_EOF,
	)

	if tokens[1].Lexeme != "/* gap\n still */" {
		t.Fatalf("expected block comment lexeme, got %q", tokens[1].Lexeme)
	}
	assertTokenPosition(t, tokens[2], 2, 10)
}

func TestTokenizeReportsUnterminatedBlockComment(t *testing.T) {
	source := "let /* nope\nstill"
	tokens, errorBag := tokenizeForTest(source)

	assertKinds(t, tokens,
		token.Keyword_Let,
		token.Kind_Illegal,
		token.Kind_EOF,
	)

	if len(errorBag.Errors) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errorBag.Errors))
	}

	err := errorBag.Errors[0]
	if err.Message != "unterminated block comment" {
		t.Fatalf("expected unterminated block comment error, got %q", err.Message)
	}
	if err.Line != 1 || err.Column != 5 {
		t.Fatalf("expected error at 1:5, got %d:%d", err.Line, err.Column)
	}
}

func TestTokenizeRecordTypePunctuation(t *testing.T) {
	tokens, errorBag := tokenizeForTest(
		"type Dog = { ...Animal; goodBoy: bool; }; dog.age",
	)

	assertNoErrors(t, errorBag)
	assertKinds(t, tokens,
		token.Keyword_Type,
		token.Kind_Identifier,
		token.Symbol_Equals,
		token.Symbol_LeftBrace,
		token.Symbol_Ellipsis,
		token.Kind_Identifier,
		token.Symbol_Semicolon,
		token.Kind_Identifier,
		token.Symbol_Colon,
		token.Kind_Identifier,
		token.Symbol_Semicolon,
		token.Symbol_RightBrace,
		token.Symbol_Semicolon,
		token.Kind_Identifier,
		token.Symbol_Dot,
		token.Kind_Identifier,
		token.Kind_EOF,
	)
}

func TestTokenizeDotDoesNotExtendIntegerLiteral(t *testing.T) {
	tokens, errorBag := tokenizeForTest("1.x")

	assertNoErrors(t, errorBag)
	assertKinds(t, tokens,
		token.Kind_IntegerLiteral,
		token.Symbol_Dot,
		token.Kind_Identifier,
		token.Kind_EOF,
	)
}

func TestTokenizeDotsPreferLongestMatch(t *testing.T) {
	tokens, errorBag := tokenizeForTest("... .. .")

	assertNoErrors(t, errorBag)
	assertKinds(t, tokens,
		token.Symbol_Ellipsis,
		token.Symbol_Range,
		token.Symbol_Dot,
		token.Kind_EOF,
	)
}

func tokenizeForTest(source string) ([]token.Token, *diagnostics.ErrorBag) {
	errorBag := &diagnostics.ErrorBag{Source: source}
	tokens, _ := Tokenize(source, errorBag)
	return tokens, errorBag
}

func assertNoErrors(t *testing.T, errorBag *diagnostics.ErrorBag) {
	t.Helper()

	if len(errorBag.Errors) != 0 {
		t.Fatalf("expected no errors, got %d: %#v", len(errorBag.Errors), errorBag.Errors)
	}
}

func assertKinds(t *testing.T, tokens []token.Token, expected ...token.Kind) {
	t.Helper()

	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d: %#v", len(expected), len(tokens), tokens)
	}

	for i, kind := range expected {
		if tokens[i].Kind != kind {
			t.Fatalf("token %d: expected %s, got %s", i, kind, tokens[i].Kind)
		}
	}
}

func assertTokenPosition(t *testing.T, tok token.Token, line int, column int) {
	t.Helper()

	if tok.Line != line || tok.Column != column {
		t.Fatalf("expected token at %d:%d, got %d:%d", line, column, tok.Line, tok.Column)
	}
}
