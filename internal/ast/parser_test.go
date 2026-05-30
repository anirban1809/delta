package ast

import (
	"strings"
	"testing"

	"delta/internal/tokenizer"
)

func parseSource(t *testing.T, source string) File {
	t.Helper()

	tokens, err := tokenizer.Tokenize(source)
	if err != nil {
		t.Fatal(err)
	}

	parser := Parser{Tokens: tokens}
	file, err := parser.Parse()
	if err != nil {
		t.Fatal(err)
	}

	return file
}

func parseExpression(t *testing.T, source string) Expression {
	t.Helper()

	tokens, err := tokenizer.Tokenize(source)
	if err != nil {
		t.Fatal(err)
	}

	parser := Parser{Tokens: tokens}
	expr, err := parser.ParseExpression()
	if err != nil {
		t.Fatal(err)
	}

	return expr
}

func TestParseFunctionWithEmptyParameterList(t *testing.T) {
	file := parseSource(t, `
function main(): int32 {
	return 0;
}
`)

	if len(file.Declarations) != 1 {
		t.Fatalf("expected 1 declaration, got %d", len(file.Declarations))
	}

	fn, ok := file.Declarations[0].(FunctionDeclaration)
	if !ok {
		t.Fatalf("expected FunctionDeclaration, got %T", file.Declarations[0])
	}

	if len(fn.Parameters) != 0 {
		t.Fatalf("expected no parameters, got %d", len(fn.Parameters))
	}
}

func TestParseIdentifierStartedExpressionAndAssignmentStatements(t *testing.T) {
	file := parseSource(t, `
function main(): int32 {
	go(3, 4);
	x = 5;
	return 0;
}
`)

	fn := file.Declarations[0].(FunctionDeclaration)
	if len(fn.Body.Statements) != 3 {
		t.Fatalf("expected 3 statements, got %d", len(fn.Body.Statements))
	}

	if _, ok := fn.Body.Statements[0].(ExpressionStatement); !ok {
		t.Fatalf("expected first statement to be ExpressionStatement, got %T", fn.Body.Statements[0])
	}

	if _, ok := fn.Body.Statements[1].(AssignmentStatement); !ok {
		t.Fatalf("expected second statement to be AssignmentStatement, got %T", fn.Body.Statements[1])
	}
}

func TestParseBinaryExpressionsLeftAssociative(t *testing.T) {
	expr := parseExpression(t, "1 - 2 - 3")

	root, ok := expr.(BinaryExpression)
	if !ok {
		t.Fatalf("expected BinaryExpression, got %T", expr)
	}
	if root.operator != "-" {
		t.Fatalf("expected root operator '-', got %q", root.operator)
	}

	left, ok := root.left.(BinaryExpression)
	if !ok {
		t.Fatalf("expected left side to be BinaryExpression, got %T", root.left)
	}
	if left.operator != "-" {
		t.Fatalf("expected left operator '-', got %q", left.operator)
	}

	right, ok := root.right.(IntegerLiteral)
	if !ok {
		t.Fatalf("expected right side to be IntegerLiteral, got %T", root.right)
	}
	if right.Value != "3" {
		t.Fatalf("expected right value 3, got %q", right.Value)
	}
}

func TestParseLogicalAndPrecedenceHigherThanOr(t *testing.T) {
	expr := parseExpression(t, "a || b && c")

	root, ok := expr.(BinaryExpression)
	if !ok {
		t.Fatalf("expected BinaryExpression, got %T", expr)
	}
	if root.operator != "||" {
		t.Fatalf("expected root operator '||', got %q", root.operator)
	}

	right, ok := root.right.(BinaryExpression)
	if !ok {
		t.Fatalf("expected right side to be BinaryExpression, got %T", root.right)
	}
	if right.operator != "&&" {
		t.Fatalf("expected right operator '&&', got %q", right.operator)
	}
}

func TestParseChainedFunctionCalls(t *testing.T) {
	expr := parseExpression(t, "makeAdder()(3)")

	root, ok := expr.(FunctionCallExpression)
	if !ok {
		t.Fatalf("expected FunctionCallExpression, got %T", expr)
	}

	if len(root.Arguments) != 1 {
		t.Fatalf("expected 1 argument, got %d", len(root.Arguments))
	}

	if _, ok := root.Callee.(FunctionCallExpression); !ok {
		t.Fatalf("expected callee to be FunctionCallExpression, got %T", root.Callee)
	}
}

func TestFormatStringAndCharacterLiterals(t *testing.T) {
	file := parseSource(t, `
function main(): int32 {
	"hello";
	'δ';
	return 0;
}
`)

	formatted := FormatAST(file)
	expected := []string{
		`StringLiteral value="hello"`,
		`CharacterLiteral value="δ"`,
	}

	for _, item := range expected {
		if !strings.Contains(formatted, item) {
			t.Fatalf("expected formatted AST to contain %q:\n%s", item, formatted)
		}
	}
}
