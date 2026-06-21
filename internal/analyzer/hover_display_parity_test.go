//go:build parity

// Parity target for task 19: every defined symbol must carry a hover Display
// string (currently commented out / left empty in analyzer.go). Compiles today
// but fails until Display is populated (run: go test -tags parity).
package analyzer

import "testing"

func TestSymbolDisplayPopulated(t *testing.T) {
	const src = `function add(a: int32, b: int32): int32 {
    const total: int32 = a + b;
    return total;
}

function main(): int32 {
    return add(1, 2);
}`
	v := validateForParity(t, src)

	fn, ok := v.GlobalScope.Lookup("add")
	if !ok {
		t.Fatalf("function symbol add not found")
	}
	if fn.Display == "" {
		t.Errorf("expected non-empty hover Display for function add")
	}
}
