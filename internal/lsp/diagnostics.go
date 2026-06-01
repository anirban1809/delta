package lsp

import (
	"strings"

	"delta/internal/diagnostics"
)

// ToDiagnostics converts the compiler's SourceError list into the LSP shape.
// File is dropped — publishDiagnostics names the document by URI in the
// envelope, not in the per-diagnostic message.
func ToDiagnostics(errors []diagnostics.SourceError) []Diagnostic {
	out := make([]Diagnostic, 0, len(errors))
	for _, e := range errors {
		out = append(out, toDiagnostic(e))
	}
	return out
}

func toDiagnostic(e diagnostics.SourceError) Diagnostic {
	// Compiler positions are 1-based; LSP is 0-based. Clamp at zero so a
	// stray Line/Column of 0 doesn't render at a negative offset.
	pos := Position{
		Line:      max(e.Line-1, 0),
		Character: max(e.Column-1, 0),
	}

	var msg strings.Builder
	msg.WriteString(e.Message)
	if e.Expected != "" {
		msg.WriteString("\n\nexpected: ")
		msg.WriteString(e.Expected)
	}
	if e.Help != "" {
		msg.WriteString("\n\nhelp: ")
		msg.WriteString(e.Help)
	}

	return Diagnostic{
		Range:    Range{Start: pos, End: pos},
		Severity: severityFromCompiler(e.Severity),
		Source:   "delta",
		Message:  msg.String(),
	}
}

func severityFromCompiler(s diagnostics.Severity) DiagnosticSeverity {
	switch s {
	case diagnostics.Warning:
		return DiagnosticSeverityWarning
	default:
		return DiagnosticSeverityError
	}
}
