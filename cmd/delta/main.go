package main

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
	"delta/internal/lsp"
	"delta/internal/pipeline"
	"delta/internal/semantics"
	"delta/internal/token"
	"delta/internal/tokenizer"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const testsRoot = "test-source/tests"

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
	case "lsp":
		if err := lsp.Run(os.Stdin, os.Stdout, os.Stderr); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
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

	contents, err := os.ReadFile(sourcePath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}

	result := pipeline.Compile(sourcePath, contents)

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

type suiteResult struct {
	Name     string
	Pass     int
	Fail     int
	Failures []string // formatted as "<suite>/<file>"
}

// runTest dispatches `delta test` subcommands:
//
//	delta test                          — list discovered suites
//	delta test <suite>                  — run one suite by name
//	delta test all                      — run every discovered suite
//	delta test <path-to-manifest.json>  — run an explicit manifest (back-compat)
func runTest(args []string) {
	if len(args) == 0 {
		suites, err := discoverSuites()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		if len(suites) == 0 {
			fmt.Printf("no suites found under %s\n", testsRoot)
			return
		}
		fmt.Println("available test suites:")
		for _, s := range suites {
			fmt.Printf("  %s\n", s)
		}
		fmt.Println("\nusage: delta test <suite> | all | <path-to-manifest.json>")
		return
	}

	arg := args[0]

	// 1. Back-compat: explicit manifest path
	if strings.HasSuffix(arg, ".json") || strings.ContainsRune(arg, os.PathSeparator) {
		res, err := runSuite(arg)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		if res.Fail > 0 {
			os.Exit(1)
		}
		return
	}

	// 2. Run every suite
	if arg == "all" {
		suites, err := discoverSuites()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		totalPass, totalFail := 0, 0
		var allFailures []string
		for _, s := range suites {
			res, err := runSuite(filepath.Join(testsRoot, s, "tests.json"))
			if err != nil {
				fmt.Fprintf(os.Stderr, "suite %s: %v\n", s, err)
				totalFail++
				continue
			}
			totalPass += res.Pass
			totalFail += res.Fail
			allFailures = append(allFailures, res.Failures...)
		}
		fmt.Printf("\n== overall: %d passed, %d failed ==\n", totalPass, totalFail)
		if totalFail > 0 {
			fmt.Println("\nfailed tests:")
			for _, f := range allFailures {
				fmt.Printf("  - %s\n", f)
			}
			os.Exit(1)
		}
		return
	}

	// 3. Named suite
	manifest := filepath.Join(testsRoot, arg, "tests.json")
	if _, err := os.Stat(manifest); err != nil {
		fmt.Fprintf(os.Stderr, "unknown suite %q (no %s)\n", arg, manifest)
		os.Exit(2)
	}
	res, err := runSuite(manifest)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if res.Fail > 0 {
		os.Exit(1)
	}
}

// discoverSuites returns the names of every directory under testsRoot that
// contains a tests.json file, sorted alphabetically.
func discoverSuites() ([]string, error) {
	entries, err := os.ReadDir(testsRoot)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", testsRoot, err)
	}
	var suites []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		manifest := filepath.Join(testsRoot, e.Name(), "tests.json")
		if _, err := os.Stat(manifest); err == nil {
			suites = append(suites, e.Name())
		}
	}
	sort.Strings(suites)
	return suites, nil
}

// runSuite reads a manifest, executes every case, writes per-file .out files,
// and prints a summary. Returns aggregated counts; does not call os.Exit.
func runSuite(manifestPath string) (suiteResult, error) {
	suiteName := filepath.Base(filepath.Dir(manifestPath))
	res := suiteResult{Name: suiteName}

	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		return res, fmt.Errorf("failed to read manifest %s: %w", manifestPath, err)
	}

	var cases []testCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		return res, fmt.Errorf("failed to parse manifest %s: %w", manifestPath, err)
	}

	manifestDir := filepath.Dir(manifestPath)
	resultsDir := filepath.Join(manifestDir, "test-results")
	if err := os.MkdirAll(resultsDir, 0755); err != nil {
		return res, fmt.Errorf("failed to create %s: %w", resultsDir, err)
	}

	fmt.Printf("== suite %s: running %d tests from %s ==\n", suiteName, len(cases), manifestPath)
	fmt.Printf("writing per-file output to %s\n\n", resultsDir)

	for _, tc := range cases {
		sourcePath := filepath.Join(manifestDir, tc.File)
		resultPath := filepath.Join(resultsDir, tc.File+".out")
		if err := writeCompileOutput(sourcePath, resultPath); err != nil {
			fmt.Fprintf(os.Stderr, "warn: writing %s: %v\n", resultPath, err)
		}
		label := fmt.Sprintf("%s/%s", suiteName, tc.File)
		ok, reason := runOneTest(sourcePath, tc)
		if ok {
			fmt.Printf("  PASS  %s\n", label)
			res.Pass++
		} else {
			fmt.Printf("  FAIL  %s — %s\n", label, reason)
			if tc.Note != "" {
				fmt.Printf("          note: %s\n", tc.Note)
			}
			res.Failures = append(res.Failures, label)
			res.Fail++
		}
	}

	fmt.Printf("\n%s: %d passed, %d failed (of %d)\n\n",
		suiteName, res.Pass, res.Fail, len(cases))
	return res, nil
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
				return false, fmt.Sprintf(
					"no error mentions %q; got: %s",
					tc.Contains,
					strings.Join(msgs, "; "),
				)
			}
		}

	default:
		return false, "unknown expect value: " + tc.Expect
	}

	if tc.ErrorCount > 0 && len(msgs) != tc.ErrorCount {
		return false, fmt.Sprintf(
			"expected %d error(s), got %d: %s",
			tc.ErrorCount,
			len(msgs),
			strings.Join(msgs, "; "),
		)
	}

	if tc.NotContains != "" {
		needle := strings.ToLower(tc.NotContains)
		for _, m := range msgs {
			if strings.Contains(strings.ToLower(m), needle) {
				return false, fmt.Sprintf(
					"error unexpectedly mentions %q: %s",
					tc.NotContains,
					m,
				)
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
