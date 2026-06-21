//go:build parity

// Parity target for task 17: the rewrite must record the same codegen-facing
// metadata semantics.go does. This test does not compile until Validator
// exposes Conversions / Divisions / Shifts / IncDecs (run: go test -tags parity).
package analyzer

import (
	"testing"

	"delta/internal/ast"
	"delta/internal/diagnostics"
	"delta/internal/tokenizer"
)

func validateForParity(t *testing.T, src string) *Validator {
	t.Helper()
	bag := &diagnostics.ErrorBag{File: "parity.delta", Source: src}
	tokens, _ := tokenizer.Tokenize(src, bag)
	parser := ast.Parser{Tokens: tokens, ErrorBag: bag}
	file := parser.Parse()
	v := &Validator{Errors: bag}
	v.Check(file)
	return v
}

func TestCodegenMetadataRecorded(t *testing.T) {
	const src = `function main(): int32 {
    let a: int32 = 100;
    let b: int32 = a / 2;   // division → trap helper
    let c: int32 = a << 3;  // shift    → trap helper
    a++;                    // inc/dec  → overflow helper
    let d: int64 = int64(a); // conversion → ConvFree/ConvTrap
    return b + c + d;
}`
	v := validateForParity(t, src)

	if len(v.Divisions) == 0 {
		t.Errorf("expected at least one recorded division, got %d", len(v.Divisions))
	}
	if len(v.Shifts) == 0 {
		t.Errorf("expected at least one recorded shift, got %d", len(v.Shifts))
	}
	if len(v.IncDecs) == 0 {
		t.Errorf("expected at least one recorded inc/dec, got %d", len(v.IncDecs))
	}
	if len(v.Conversions) == 0 {
		t.Errorf("expected at least one recorded conversion, got %d", len(v.Conversions))
	}
}
