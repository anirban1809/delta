package diagnostics

import (
	"fmt"
	"strings"
)

type Stage string

const (
	Tokenizer Stage = "tokenizer"
	Parser    Stage = "parser"
	Semantic  Stage = "semantic"
	Codegen   Stage = "codegen"
)

type Severity int

const (
	Error Severity = iota
	Warning
)

type SourceError struct {
	Stage    Stage
	Severity Severity
	File     string
	Line     int
	Column   int
	Source   string
	Message  string
	Expected string
	Help     string
}

func (s *SourceError) GetFormmatedMessage() string {
	return s.GetFormattedMessage()
}

func (s *SourceError) GetFormattedMessage() string {
	file := s.File
	if file == "" {
		file = "<source>"
	}

	stage := string(s.Stage)
	if stage == "" {
		stage = "compiler"
	}

	var out strings.Builder
	fmt.Fprintf(&out, "%s:%d:%d: %s %s: %s",
		file,
		s.Line,
		s.Column,
		stage,
		s.Severity.String(),
		s.Message)

	if s.Source != "" {
		lineNumber := fmt.Sprintf("%d", s.Line)
		out.WriteString("\n  |")
		out.WriteString(fmt.Sprintf("\n%s | %s", lineNumber, s.Source))
		out.WriteString(fmt.Sprintf(
			"\n%s | %s^",
			strings.Repeat(" ", len(lineNumber)),
			strings.Repeat(" ", max(s.Column-1, 0)),
		))
	}

	if s.Expected != "" {
		out.WriteString("\nexpected: ")
		out.WriteString(s.Expected)
	}

	if s.Help != "" {
		out.WriteString("\nhelp: ")
		out.WriteString(s.Help)
	}

	return out.String()
}

func (s Severity) String() string {
	switch s {
	case Warning:
		return "warning"
	case Error:
		return "error"
	default:
		return "error"
	}
}

func (s *SourceError) GetMessage() string {
	return s.Message
}

type ErrorBag struct {
	File   string
	Source string
	Errors []SourceError
}

func (e *ErrorBag) AddError(sourceError SourceError) {
	if sourceError.File == "" {
		sourceError.File = e.File
	}

	if sourceError.Source == "" {
		sourceError.Source = sourceLine(e.Source, sourceError.Line)
	}

	e.Errors = append(e.Errors, sourceError)
}

func (e *ErrorBag) UpdateLastError(sourceError SourceError) {
	lastIdx := 0
	if len(e.Errors) > 0 {
		lastIdx = len(e.Errors) - 1
	}

	if sourceError.File == "" {
		sourceError.File = e.File
	}

	if sourceError.Source == "" {
		sourceError.Source = sourceLine(e.Source, sourceError.Line)
	}

	e.Errors[lastIdx] = sourceError
}

func (e *ErrorBag) RemoveLastError() {
	lastIdx := 0
	if len(e.Errors) > 0 {
		lastIdx = len(e.Errors) - 1
	}

	e.Errors = e.Errors[:lastIdx]
}

func sourceLine(source string, line int) string {
	if source == "" || line <= 0 {
		return ""
	}

	lines := strings.Split(source, "\n")
	if line > len(lines) {
		return ""
	}

	return strings.TrimSuffix(lines[line-1], "\r")
}
