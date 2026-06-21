package ast

import (
	"delta/internal/diagnostics"
	"delta/internal/tokenizer"
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
		"ReturnStatement error=false",
		"Value 0\n          IntegerLiteral value=\"1\"",
		"Value 1\n          Identifier name=\"result\"",
	}

	for _, item := range expected {
		if !strings.Contains(formatted, item) {
			t.Fatalf("expected formatted AST to contain %q:\n%s", item, formatted)
		}
	}
}

func TestFormatErrorReturnStatement(t *testing.T) {
	file := File{
		Declarations: []Declaration{
			FunctionDeclaration{
				Name: "parse",
				Body: &BlockStatement{
					Statements: []Statement{
						ReturnStatement{
							Error: true,
							Values: []Expression{
								ObjectLiteralExpression{},
							},
						},
					},
				},
			},
		},
	}

	formatted := FormatAST(file)
	if !strings.Contains(formatted, "ReturnStatement error=true") {
		t.Fatalf("expected formatted error return to show its flag:\n%s", formatted)
	}
}

func TestParserFallibleExpressionStatement(t *testing.T) {
	file, errorBag := parseForTest(`
function ensure(x: int32): void {
    return;
}

function main(): int32 {
    ensure(5) as result;
    return 0;
}
`)
	if len(errorBag.Errors) != 0 {
		t.Fatalf("expected no parser errors, got %#v", errorBag.Errors)
	}

	mainDecl, ok := file.Declarations[1].(FunctionDeclaration)
	if !ok {
		t.Fatalf("expected main function, got %T", file.Declarations[1])
	}
	if len(mainDecl.Body.Statements) != 2 {
		t.Fatalf("statement count = %d, want 2", len(mainDecl.Body.Statements))
	}

	fallible, ok := mainDecl.Body.Statements[0].(FallibleStatement)
	if !ok {
		t.Fatalf(
			"expected FallibleStatement, got %T",
			mainDecl.Body.Statements[0],
		)
	}
	if fallible.Result.Name != "result" {
		t.Fatalf("result name = %q, want result", fallible.Result.Name)
	}

	inner, ok := fallible.Inner.(ExpressionStatement)
	if !ok {
		t.Fatalf("expected inner ExpressionStatement, got %T", fallible.Inner)
	}
	if _, ok := inner.Value.(FunctionCallExpression); !ok {
		t.Fatalf("expected function call, got %T", inner.Value)
	}
}

func TestParserEmitsCommentsInAST(t *testing.T) {
	source := `// file comment
const answer: int32 = 42;

function main(): int32 {
    /* block
       comment */
    return answer;
}
`
	errorBag := &diagnostics.ErrorBag{Source: source}
	tokens, _ := tokenizer.Tokenize(source, errorBag)
	if len(errorBag.Errors) != 0 {
		t.Fatalf("expected no tokenizer errors, got %#v", errorBag.Errors)
	}

	parser := Parser{Tokens: tokens, ErrorBag: errorBag}
	file := parser.Parse()
	if len(errorBag.Errors) != 0 {
		t.Fatalf("expected no parser errors, got %#v", errorBag.Errors)
	}

	formatted := FormatAST(file)
	expected := []string{
		`LineComment text="// file comment"`,
		`BlockComment text="/* block\n       comment */"`,
		"ReturnStatement",
	}

	for _, item := range expected {
		if !strings.Contains(formatted, item) {
			t.Fatalf("expected formatted AST to contain %q:\n%s", item, formatted)
		}
	}
}

func TestParserRecordDeclarationsAndFormatter(t *testing.T) {
	source := `
type Animal = { species: int32; age: int32; };
type Alias = Animal;
type Dog = { ...Animal; goodBoy: bool; };
type Cat = Animal & { color: int32; };
`
	file, errorBag := parseForTest(source)
	if len(errorBag.Errors) != 0 {
		t.Fatalf("expected no parser errors, got %#v", errorBag.Errors)
	}
	if len(file.Declarations) != 4 {
		t.Fatalf("expected 4 declarations, got %d", len(file.Declarations))
	}

	record := file.Declarations[0].(TypeDeclaration).RHS.(RecordRHS)
	if record.Type.Name.Name != "Animal" {
		t.Fatalf("record type = %q, want Animal", record.Type.Name.Name)
	}
	assertTypeReferenceFields(t, record.Type, "int32", "int32")
	alias := file.Declarations[1].(TypeDeclaration).RHS.(AliasRHS)
	if alias.Type.Name.Name != "Alias" {
		t.Fatalf("alias type = %q, want Alias", alias.Type.Name.Name)
	}
	assertTypeReferenceFields(t, alias.Type, "Animal")
	spread := file.Declarations[2].(TypeDeclaration).RHS.(CompositionRHS)
	if spread.Type.Name.Name != "Dog" {
		t.Fatalf("spread type = %q, want Dog", spread.Type.Name.Name)
	}
	assertTypeReferenceFields(t, spread.Type, "Animal", "bool")
	if spread.Operands[1].Inline.Type.Name.Name != "Dog" {
		t.Fatalf(
			"spread inline type = %q, want Dog",
			spread.Operands[1].Inline.Type.Name.Name,
		)
	}
	assertTypeReferenceFields(t, spread.Operands[1].Inline.Type, "bool")
	intersection := file.Declarations[3].(TypeDeclaration).RHS.(CompositionRHS)
	if intersection.Type.Name.Name != "Cat" {
		t.Fatalf(
			"intersection type = %q, want Cat",
			intersection.Type.Name.Name,
		)
	}
	assertTypeReferenceFields(t, intersection.Type, "Animal", "int32")
	if intersection.Operands[1].Inline.Type.Name.Name != "Cat" {
		t.Fatalf(
			"intersection inline type = %q, want Cat",
			intersection.Operands[1].Inline.Type.Name.Name,
		)
	}
	assertTypeReferenceFields(
		t,
		intersection.Operands[1].Inline.Type,
		"int32",
	)

	formatted := FormatAST(file)
	expected := []string{
		`TypeDeclaration name="Animal"`,
		`RecordRHS type="Animal"`,
		`Field 0 name="species"`,
		`TypeDeclaration name="Alias"`,
		`AliasRHS type="Alias"`,
		`CompositionRHS style="spread" type="Dog"`,
		`CompositionRHS style="intersection" type="Cat"`,
		`Inline type="Dog"`,
		`Inline type="Cat"`,
		`TypeField 0 type="Animal"`,
		`TypeField 1 type="bool"`,
		`Field 0 name="color"`,
	}
	for _, item := range expected {
		if !strings.Contains(formatted, item) {
			t.Fatalf("expected formatted AST to contain %q:\n%s", item, formatted)
		}
	}
}

func assertTypeReferenceFields(
	t *testing.T,
	typ TypeReference,
	expected ...string,
) {
	t.Helper()
	actual := make([]string, 0, len(expected))
	for field := typ.Fields; field != nil; field = field.Fields {
		actual = append(actual, field.Name.Name)
	}
	if len(actual) != len(expected) {
		t.Fatalf(
			"type %q fields = %v, want %v",
			typ.Name.Name,
			actual,
			expected,
		)
	}
	for index := range expected {
		if actual[index] != expected[index] {
			t.Fatalf(
				"type %q fields = %v, want %v",
				typ.Name.Name,
				actual,
				expected,
			)
		}
	}
}

func TestParserObjectLiteralMemberAccessAndAssignment(t *testing.T) {
	source := `
type Vec3 = { x: float64; y: float64; z: float64; };
function use(v: Vec3): float64 {
    let copy: Vec3 = { ...v, x: 4.0, y: v.y, z: v.z, };
    copy.x = Type.from(copy.y);
    return copy.x;
}
`
	file, errorBag := parseForTest(source)
	if len(errorBag.Errors) != 0 {
		t.Fatalf("expected no parser errors, got %#v", errorBag.Errors)
	}

	formatted := FormatAST(file)
	expected := []string{
		"ObjectLiteralExpression",
		"SpreadElement 0",
		`FieldInit 1 name="x"`,
		`MemberAccessExpression member="x"`,
		`MemberAccessExpression member="from"`,
		"FunctionCallExpression",
	}
	for _, item := range expected {
		if !strings.Contains(formatted, item) {
			t.Fatalf("expected formatted AST to contain %q:\n%s", item, formatted)
		}
	}

	fn := file.Declarations[1].(FunctionDeclaration)
	assignment := fn.Body.Statements[1].(AssignmentStatement)
	if _, ok := assignment.TargetExpression.(MemberAccessExpression); !ok {
		t.Fatalf("expected member assignment target, got %T", assignment.TargetExpression)
	}
}

func TestParserRejectsOutOfScopeRecordSyntax(t *testing.T) {
	tests := []struct {
		name     string
		source   string
		contains string
	}{
		{
			name:     "field default",
			source:   `type Config = { port: int32 = 8080; };`,
			contains: "field defaults",
		},
		{
			name:     "method",
			source:   `type Counter = { value: int32; get(): int32 { return value; } };`,
			contains: "methods",
		},
		{
			name:     "visibility",
			source:   `type User = { private password: int32; };`,
			contains: "visibility",
		},
		{
			name:     "anonymous binding type",
			source:   `function main(): void { let v: { x: int32 }; }`,
			contains: "anonymous object types",
		},
		{
			name:     "parenthesized rhs",
			source:   `type Pair = (A & B);`,
			contains: "parentheses in type RHS",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, errorBag := parseForTest(tc.source)
			for _, err := range errorBag.Errors {
				if strings.Contains(err.Message, tc.contains) {
					return
				}
			}
			t.Fatalf(
				"expected an error containing %q, got %#v",
				tc.contains,
				errorBag.Errors,
			)
		})
	}
}

func parseForTest(source string) (File, *diagnostics.ErrorBag) {
	errorBag := &diagnostics.ErrorBag{Source: source}
	tokens, _ := tokenizer.Tokenize(source, errorBag)
	if len(errorBag.Errors) != 0 {
		return File{}, errorBag
	}
	parser := Parser{Tokens: tokens, ErrorBag: errorBag}
	return parser.Parse(), errorBag
}
