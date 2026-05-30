package tokenizer

import (
	"testing"

	"delta/internal/token"
)

func TestTokenizeLogicalOperators(t *testing.T) {
	tokens, err := Tokenize("true && !false || true")
	if err != nil {
		t.Fatal(err)
	}

	kinds := []token.Kind{
		token.Kind_BooleanLiteral,
		token.Symbol_LogicalAnd,
		token.Symbol_Not,
		token.Kind_BooleanLiteral,
		token.Symbol_LogicalOr,
		token.Kind_BooleanLiteral,
		token.Kind_EOF,
	}

	if len(tokens) != len(kinds) {
		t.Fatalf("expected %d tokens, got %d", len(kinds), len(tokens))
	}

	for i, kind := range kinds {
		if tokens[i].Kind != kind {
			t.Fatalf("token %d: expected %s, got %s", i, kind, tokens[i].Kind)
		}
	}
}

func TestTokenizeConstAndLetKeywords(t *testing.T) {
	tokens, err := Tokenize("const x = 1; let y = 2;")
	if err != nil {
		t.Fatal(err)
	}

	kinds := []token.Kind{
		token.Keyword_Const,
		token.Kind_Identifier,
		token.Symbol_Equals,
		token.Kind_IntegerLiteral,
		token.Symbol_Semicolon,
		token.Keyword_Let,
		token.Kind_Identifier,
		token.Symbol_Equals,
		token.Kind_IntegerLiteral,
		token.Symbol_Semicolon,
		token.Kind_EOF,
	}

	if len(tokens) != len(kinds) {
		t.Fatalf("expected %d tokens, got %d", len(kinds), len(tokens))
	}

	for i, kind := range kinds {
		if tokens[i].Kind != kind {
			t.Fatalf("token %d: expected %s, got %s", i, kind, tokens[i].Kind)
		}
	}
}

func TestTokenizeIfAndElseKeywords(t *testing.T) {
	tokens, err := Tokenize("if true { } else { }")
	if err != nil {
		t.Fatal(err)
	}

	kinds := []token.Kind{
		token.Keyword_If,
		token.Kind_BooleanLiteral,
		token.Symbol_LeftBrace,
		token.Symbol_RightBrace,
		token.Keyword_Else,
		token.Symbol_LeftBrace,
		token.Symbol_RightBrace,
		token.Kind_EOF,
	}

	if len(tokens) != len(kinds) {
		t.Fatalf("expected %d tokens, got %d", len(kinds), len(tokens))
	}

	for i, kind := range kinds {
		if tokens[i].Kind != kind {
			t.Fatalf("token %d: expected %s, got %s", i, kind, tokens[i].Kind)
		}
	}
}

func TestTokenizeWhileKeyword(t *testing.T) {
	tokens, err := Tokenize("while true { }")
	if err != nil {
		t.Fatal(err)
	}

	kinds := []token.Kind{
		token.Keyword_While,
		token.Kind_BooleanLiteral,
		token.Symbol_LeftBrace,
		token.Symbol_RightBrace,
		token.Kind_EOF,
	}

	if len(tokens) != len(kinds) {
		t.Fatalf("expected %d tokens, got %d", len(kinds), len(tokens))
	}

	for i, kind := range kinds {
		if tokens[i].Kind != kind {
			t.Fatalf("token %d: expected %s, got %s", i, kind, tokens[i].Kind)
		}
	}
}

func TestTokenizeStringAndCharacterLiterals(t *testing.T) {
	tokens, err := Tokenize(
		`const s = "hello\nworld"; const c = 'δ'; const q = '\''; const u = '\u{1F600}';`,
	)
	if err != nil {
		t.Fatal(err)
	}

	kinds := []token.Kind{
		token.Keyword_Const,
		token.Kind_Identifier,
		token.Symbol_Equals,
		token.Kind_StringLiteral,
		token.Symbol_Semicolon,
		token.Keyword_Const,
		token.Kind_Identifier,
		token.Symbol_Equals,
		token.Kind_CharacterLiteral,
		token.Symbol_Semicolon,
		token.Keyword_Const,
		token.Kind_Identifier,
		token.Symbol_Equals,
		token.Kind_CharacterLiteral,
		token.Symbol_Semicolon,
		token.Keyword_Const,
		token.Kind_Identifier,
		token.Symbol_Equals,
		token.Kind_CharacterLiteral,
		token.Symbol_Semicolon,
		token.Kind_EOF,
	}

	if len(tokens) != len(kinds) {
		t.Fatalf("expected %d tokens, got %d", len(kinds), len(tokens))
	}

	for i, kind := range kinds {
		if tokens[i].Kind != kind {
			t.Fatalf("token %d: expected %s, got %s", i, kind, tokens[i].Kind)
		}
	}

	expectedLexemes := map[int]string{
		3:  `hello\nworld`,
		8:  `δ`,
		13: `\'`,
		18: `\u{1F600}`,
	}
	for index, lexeme := range expectedLexemes {
		if tokens[index].Lexeme != lexeme {
			t.Fatalf(
				"token %d: expected lexeme %q, got %q",
				index,
				lexeme,
				tokens[index].Lexeme,
			)
		}
	}
}

func TestTokenizeRejectsInvalidCharacterLiterals(t *testing.T) {
	tests := []string{
		`''`,
		`'ab'`,
		`'\u{}'`,
		`'\u{D800}'`,
		`'\u{110000}'`,
		`'\q'`,
	}

	for _, source := range tests {
		t.Run(source, func(t *testing.T) {
			if _, err := Tokenize(source); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}
