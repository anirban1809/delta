package semantics

import (
	"testing"

	"delta/internal/ast"
	"delta/internal/diagnostics"
)

func TestConvertCompToRecordFlattensInlineOperands(t *testing.T) {
	position := ast.Position{Line: 1, Column: 1}
	first := ast.RecordRHS{
		Fields: []ast.RecordField{
			recordFieldForTest("x", "int32"),
			recordFieldForTest("y", "int32"),
		},
	}
	second := ast.RecordRHS{
		Fields: []ast.RecordField{
			recordFieldForTest("label", "string"),
		},
	}

	analyzer := &Analyzer{
		ErrorBag:         newTestErrorBag(),
		recordTypes:      map[string]ast.RecordRHS{},
		aliasRecordTypes: map[string]ast.AliasRHS{},
		compRecordTypes:  map[string]ast.CompositionRHS{},
	}
	scope := &Scope{Symbols: map[string]Symbol{}}
	got, ok := analyzer.convertCompToRecord(ast.CompositionRHS{
		Position: position,
		Operands: []ast.CompositionOperand{
			{Inline: &first},
			{Inline: &second},
		},
	}, scope)
	if !ok {
		t.Fatal("convertCompToRecord unexpectedly failed")
	}

	if got.Position != position {
		t.Fatalf("position = %#v, want %#v", got.Position, position)
	}
	if len(got.Fields) != 3 {
		t.Fatalf("field count = %d, want 3", len(got.Fields))
	}

	wantNames := []string{"x", "y", "label"}
	for i, want := range wantNames {
		if got.Fields[i].Name.Name != want {
			t.Fatalf("field %d = %q, want %q", i, got.Fields[i].Name.Name, want)
		}
	}
}

func TestConvertCompToRecordDoesNotAliasOperandFields(t *testing.T) {
	inline := ast.RecordRHS{
		Fields: []ast.RecordField{
			recordFieldForTest("x", "int32"),
		},
	}
	analyzer := &Analyzer{
		ErrorBag:         newTestErrorBag(),
		recordTypes:      map[string]ast.RecordRHS{},
		aliasRecordTypes: map[string]ast.AliasRHS{},
		compRecordTypes:  map[string]ast.CompositionRHS{},
	}
	got, ok := analyzer.convertCompToRecord(ast.CompositionRHS{
		Operands: []ast.CompositionOperand{{Inline: &inline}},
	}, &Scope{Symbols: map[string]Symbol{}})
	if !ok {
		t.Fatal("convertCompToRecord unexpectedly failed")
	}

	got.Fields[0].Name.Name = "changed"
	if inline.Fields[0].Name.Name != "x" {
		t.Fatal("converted record aliases the inline operand's field slice")
	}
}

func TestDetectTypeCyclesFindsMutualRecordFieldCycle(t *testing.T) {
	analyzer := &Analyzer{
		ErrorBag: &diagnostics.ErrorBag{},
		recordTypes: map[string]ast.RecordRHS{
			"A": {
				Fields: []ast.RecordField{
					recordFieldForTest("b", "B"),
				},
			},
			"B": {
				Fields: []ast.RecordField{
					recordFieldForTest("a", "A"),
				},
			},
		},
		aliasRecordTypes: map[string]ast.AliasRHS{},
		compRecordTypes:  map[string]ast.CompositionRHS{},
	}

	analyzer.detectTypeCycles()

	if len(analyzer.ErrorBag.Errors) != 1 {
		t.Fatalf("error count = %d, want 1", len(analyzer.ErrorBag.Errors))
	}
	if !strings.Contains(analyzer.ErrorBag.Errors[0].Message, "cycle") {
		t.Fatalf("error = %q, want cycle diagnostic",
			analyzer.ErrorBag.Errors[0].Message,
		)
	}
}

func TestDetectTypeCyclesAcceptsAcyclicRecordFields(t *testing.T) {
	analyzer := &Analyzer{
		ErrorBag: &diagnostics.ErrorBag{},
		recordTypes: map[string]ast.RecordRHS{
			"Inner": {
				Fields: []ast.RecordField{
					recordFieldForTest("value", "int32"),
				},
			},
			"Outer": {
				Fields: []ast.RecordField{
					recordFieldForTest("inner", "Inner"),
				},
			},
		},
		aliasRecordTypes: map[string]ast.AliasRHS{},
		compRecordTypes:  map[string]ast.CompositionRHS{},
	}

	analyzer.detectTypeCycles()

	if len(analyzer.ErrorBag.Errors) != 0 {
		t.Fatalf("unexpected errors: %v", analyzer.ErrorBag.Errors)
	}
}

func newTestErrorBag() *diagnostics.ErrorBag {
	return &diagnostics.ErrorBag{}
}

func recordFieldForTest(name, typeName string) ast.RecordField {
	return ast.RecordField{
		Name: ast.Identifier{Name: name},
		Type: ast.TypeReference{
			Name: ast.Identifier{Name: typeName},
		},
	}
}
