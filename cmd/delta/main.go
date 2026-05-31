package main

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
	"delta/internal/semantics"
	"delta/internal/token"
	"delta/internal/tokenizer"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: delta <command>")
		os.Exit(2)
	}

	switch os.Args[1] {
	case "build":
		runBuild(os.Args[2:])
	case "test":
		runTest(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		os.Exit(2)
	}
}

type compileResult struct {
	File     ast.File
	ErrorBag *diagnostics.ErrorBag
}

func compile(sourcePath string) (*compileResult, error) {
	errorBag := &diagnostics.ErrorBag{File: sourcePath}

	contents, err := os.ReadFile(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read %s: %w", sourcePath, err)
	}
	errorBag.Source = string(contents)

	tokens, _ := tokenizer.Tokenize(string(contents), errorBag)
	if len(errorBag.Errors) > 0 {
		return &compileResult{ErrorBag: errorBag}, nil
	}

	parser := ast.Parser{Tokens: tokens, Position: 0, ErrorBag: errorBag}
	file := parser.Parse()
	if len(errorBag.Errors) > 0 {
		return &compileResult{File: file, ErrorBag: errorBag}, nil
	}

	analyzer := semantics.Analyzer{
		AST:      file,
		ErrorBag: errorBag,
		GlobalScope: &semantics.Scope{
			Parent:  nil,
			Symbols: map[string]semantics.Symbol{},
		},
	}
	analyzer.Analyze()

	return &compileResult{File: file, ErrorBag: errorBag}, nil
}

func runBuild(args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "missing file path")
		os.Exit(2)
	}

	sourcePath := args[0]
	if filepath.Ext(sourcePath) != ".delta" {
		fmt.Fprintln(os.Stderr, "invalid extension: must be .delta")
		os.Exit(2)
	}

	result, err := compile(sourcePath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}

	if len(result.ErrorBag.Errors) > 0 {
		for _, e := range result.ErrorBag.Errors {
			fmt.Println(e.GetFormattedMessage())
		}
		os.Exit(1)
	}

	fmt.Println(ast.FormatAST(result.File))
}

type testCase struct {
	File        string `json:"file"`
	Expect      string `json:"expect"`
	Contains    string `json:"contains,omitempty"`
	NotContains string `json:"not_contains,omitempty"`
	ErrorCount  int    `json:"error_count,omitempty"`
	Note        string `json:"note,omitempty"`
}

func runTest(args []string) {
	manifestPath := "test-source/tests/tests.json"
	if len(args) >= 1 {
		manifestPath = args[0]
	}

	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read manifest %s: %v\n", manifestPath, err)
		os.Exit(2)
	}

	var cases []testCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		fmt.Fprintf(os.Stderr, "failed to parse manifest %s: %v\n", manifestPath, err)
		os.Exit(2)
	}

	manifestDir := filepath.Dir(manifestPath)
	resultsDir := filepath.Join(manifestDir, "test-results")
	if err := os.MkdirAll(resultsDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "failed to create %s: %v\n", resultsDir, err)
		os.Exit(2)
	}

	pass, fail := 0, 0
	var failures []string

	fmt.Printf("running %d tests from %s\n", len(cases), manifestPath)
	fmt.Printf("writing per-file output to %s\n\n", resultsDir)

	for _, tc := range cases {
		sourcePath := filepath.Join(manifestDir, tc.File)
		resultPath := filepath.Join(resultsDir, tc.File+".out")
		if err := writeCompileOutput(sourcePath, resultPath); err != nil {
			fmt.Fprintf(os.Stderr, "warn: writing %s: %v\n", resultPath, err)
		}
		ok, reason := runOneTest(sourcePath, tc)
		if ok {
			fmt.Printf("  PASS  %s\n", tc.File)
			pass++
		} else {
			fmt.Printf("  FAIL  %s — %s\n", tc.File, reason)
			if tc.Note != "" {
				fmt.Printf("          note: %s\n", tc.Note)
			}
			failures = append(failures, tc.File)
			fail++
		}
	}

	fmt.Printf("\n%d passed, %d failed (of %d)\n", pass, fail, len(cases))
	if fail > 0 {
		fmt.Println("\nfailed tests:")
		for _, f := range failures {
			fmt.Printf("  - %s\n", f)
		}
		os.Exit(1)
	}
}

// writeCompileOutput runs the pipeline and writes what `delta build` would
// print — either the formatted diagnostics or the formatted AST — to dest.
// Panics inside the pipeline are caught and written as the file content so
// the .out file still records what happened.
func writeCompileOutput(sourcePath, dest string) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = os.WriteFile(dest, fmt.Appendf(nil, "PANIC: %v\n", r), 0644)
		}
	}()

	result, cerr := compile(sourcePath)
	if cerr != nil {
		return os.WriteFile(dest, []byte(cerr.Error()+"\n"), 0644)
	}

	var out strings.Builder
	if len(result.ErrorBag.Errors) > 0 {
		for _, e := range result.ErrorBag.Errors {
			out.WriteString(e.GetFormattedMessage())
			out.WriteString("\n")
		}
	} else {
		out.WriteString(ast.FormatAST(result.File))
		if !strings.HasSuffix(out.String(), "\n") {
			out.WriteString("\n")
		}
	}
	return os.WriteFile(dest, []byte(out.String()), 0644)
}

func runOneTest(sourcePath string, tc testCase) (ok bool, reason string) {
	defer func() {
		if r := recover(); r != nil {
			ok = false
			reason = fmt.Sprintf("compiler panic: %v", r)
		}
	}()

	result, err := compile(sourcePath)
	if err != nil {
		return false, err.Error()
	}

	msgs := make([]string, 0, len(result.ErrorBag.Errors))
	for _, e := range result.ErrorBag.Errors {
		msgs = append(msgs, e.Message)
	}

	switch tc.Expect {
	case "pass":
		if len(msgs) != 0 {
			return false, "expected no errors, got: " + strings.Join(msgs, "; ")
		}

	case "fail":
		if len(msgs) == 0 {
			return false, "expected errors, got none"
		}
		if tc.Contains != "" {
			needle := strings.ToLower(tc.Contains)
			matched := false
			for _, m := range msgs {
				if strings.Contains(strings.ToLower(m), needle) {
					matched = true
					break
				}
			}
			if !matched {
				return false, fmt.Sprintf("no error mentions %q; got: %s", tc.Contains, strings.Join(msgs, "; "))
			}
		}

	default:
		return false, "unknown expect value: " + tc.Expect
	}

	if tc.ErrorCount > 0 && len(msgs) != tc.ErrorCount {
		return false, fmt.Sprintf("expected %d error(s), got %d: %s", tc.ErrorCount, len(msgs), strings.Join(msgs, "; "))
	}

	if tc.NotContains != "" {
		needle := strings.ToLower(tc.NotContains)
		for _, m := range msgs {
			if strings.Contains(strings.ToLower(m), needle) {
				return false, fmt.Sprintf("error unexpectedly mentions %q: %s", tc.NotContains, m)
			}
		}
	}

	return true, ""
}

func printTokens(tokens []token.Token) {
	for _, tok := range tokens {
		fmt.Printf(
			"%d:%d\t%s\t%q\n",
			tok.Line,
			tok.Column,
			tok.Kind,
			tok.Lexeme,
		)
	}
}
