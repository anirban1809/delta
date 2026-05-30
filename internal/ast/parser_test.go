package ast

import (
	"strings"
	"testing"
)

func TestFormatFunctionDeclarationReturnAndErrorTypes(t *testing.T) {
	file := File{
		Declarations: []Declaration{
			FunctionDeclaration{
				Name: "x",
				ReturnTypes: []TypeReference{
					{Name: Identifier{Name: "int32"}},
					{Name: Identifier{Name: "int32"}},
				},
				ErrorTypes: []TypeReference{
					{Name: Identifier{Name: "IOError"}},
					{Name: Identifier{Name: "NetError"}},
				},
				Body: &BlockStatement{},
			},
		},
	}

	formatted := FormatAST(file)
	expected := []string{
		"ReturnTypes",
		"Type 0\n        Identifier name=\"int32\"",
		"Type 1\n        Identifier name=\"int32\"",
		"ErrorTypes",
		"Type 0\n        Identifier name=\"IOError\"",
		"Type 1\n        Identifier name=\"NetError\"",
	}

	for _, item := range expected {
		if !strings.Contains(formatted, item) {
			t.Fatalf("expected formatted AST to contain %q:\n%s", item, formatted)
		}
	}
}

func TestFormatReturnStatementMultipleValues(t *testing.T) {
	file := File{
		Declarations: []Declaration{
			FunctionDeclaration{
				Name: "x",
				Body: &BlockStatement{
					Statements: []Statement{
						ReturnStatement{
							Values: []Expression{
								IntegerLiteral{Value: "1"},
								Identifier{Name: "result"},
							},
						},
					},
				},
			},
		},
	}

	formatted := FormatAST(file)
	expected := []string{
		"ReturnStatement",
		"Value 0\n          IntegerLiteral value=\"1\"",
		"Value 1\n          Identifier name=\"result\"",
	}

	for _, item := range expected {
		if !strings.Contains(formatted, item) {
			t.Fatalf("expected formatted AST to contain %q:\n%s", item, formatted)
		}
	}
}
