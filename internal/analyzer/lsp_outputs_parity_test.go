//go:build parity

// Parity target for task 18: the rewrite must expose the LSP-facing outputs
// semantics.go does — Refs (use-site → symbol), RootScope (scope tree), and
// Records (resolved flat field lists). Does not compile until those fields
// exist (run: go test -tags parity ./internal/analyzer/).
package analyzer

import "testing"

func TestLSPOutputsPopulated(t *testing.T) {
	const src = `type Vec = { x: int32; y: int32; };

function add(a: int32, b: int32): int32 {
    return a + b;
}

function main(): int32 {
    const v: Vec = { x: 1, y: 2 };
    return add(v.x, v.y);
}`
	v := validateForParity(t, src)

	if len(v.Refs) == 0 {
		t.Errorf("expected identifier references to be recorded in Refs")
	}
	if v.RootScope == nil {
		t.Errorf("expected RootScope scope tree to be built")
	}
	if _, ok := v.Records["Vec"]; !ok {
		t.Errorf("expected resolved fields for record type Vec in Records")
	}
}
