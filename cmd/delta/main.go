package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"delta/internal/analyzer"
	"delta/internal/ast"
	"delta/internal/codegen"
	"delta/internal/diagnostics"
	"delta/internal/lsp"
	"delta/internal/pipeline"
	"delta/internal/token"
	"delta/internal/tokenizer"
	"delta/internal/toolchain"
)

const testsRoot = "test-source/tests"

// trapRunTimeout caps how long a compiled trap-test binary may run before the
// harness kills it and records a failure. A program that neither traps nor
// exits cleanly (e.g. an infinite loop) would otherwise hang the whole suite.
const trapRunTimeout = 10 * time.Second

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: delta <command>")
		os.Exit(2)
	}

	switch os.Args[1] {
	case "build":
		runBuild(os.Args[2:])
	case "dump-ast":
		runDumpAST(os.Args[2:])
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
	File       ast.File
	ErrorBag   *diagnostics.ErrorBag
	SourcePath string
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

	validator := analyzer.Validator{
		Errors: errorBag,
	}
	validator.Check(file)

	return &compileResult{
		File:       file,
		ErrorBag:   errorBag,
		SourcePath: sourcePath,
	}, nil
}

// runDumpAST preserves the old `delta build` behavior: run the pipeline and
// print the formatted AST on success, or print diagnostics on failure.
func runDumpAST(args []string) {
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

// runBuild compiles a .delta file end-to-end:
//  1. front-end (lex / parse / semantics) via pipeline.Compile
//  2. C codegen via codegen.Emit
//  3. write build/c/<basename>.c
//  4. invoke clang to produce build/<basename>
//
// Flags short-circuit the pipeline at an earlier stage and print that stage's
// output instead of building a binary:
//
//	--tokens  stop after tokenization and print the token stream
//	--ast     stop after parsing and print the formatted AST
//	--sema    stop after semantic analysis and print the formatted AST
//
// When more than one is given, the earliest stage wins. With no flag, the
// full build (codegen + clang) runs.
func runBuild(args []string) {
	var onlyTokens, onlyAST, onlySema bool
	sourcePath := ""
	for _, arg := range args {
		switch arg {
		case "--tokens":
			onlyTokens = true
		case "--ast":
			onlyAST = true
		case "--sema":
			onlySema = true
		default:
			if strings.HasPrefix(arg, "-") {
				fmt.Fprintf(os.Stderr, "unknown flag: %s\n", arg)
				os.Exit(2)
			}
			if sourcePath != "" {
				fmt.Fprintf(
					os.Stderr,
					"multiple file paths given: %s and %s\n",
					sourcePath,
					arg,
				)
				os.Exit(2)
			}
			sourcePath = arg
		}
	}

	if sourcePath == "" {
		fmt.Fprintln(os.Stderr, "missing file path")
		os.Exit(2)
	}
	if filepath.Ext(sourcePath) != ".delta" {
		fmt.Fprintln(os.Stderr, "invalid extension: must be .delta")
		os.Exit(2)
	}

	contents, err := os.ReadFile(sourcePath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}

	// --tokens: stop after tokenization and print the token stream.
	if onlyTokens {
		bag := &diagnostics.ErrorBag{File: sourcePath, Source: string(contents)}
		tokens, _ := tokenizer.Tokenize(string(contents), bag)
		if len(bag.Errors) > 0 {
			printErrorBag(bag)
			os.Exit(1)
		}
		printTokens(tokens)
		return
	}

	// --ast: stop after parsing and print the formatted AST.
	if onlyAST {
		bag := &diagnostics.ErrorBag{File: sourcePath, Source: string(contents)}
		tokens, _ := tokenizer.Tokenize(string(contents), bag)
		if len(bag.Errors) > 0 {
			printErrorBag(bag)
			os.Exit(1)
		}
		parser := ast.Parser{Tokens: tokens, ErrorBag: bag}
		file := parser.Parse()
		if len(bag.Errors) > 0 {
			printErrorBag(bag)
			os.Exit(1)
		}
		fmt.Println(ast.FormatAST(file))
		return
	}

	// --sema: run the full front-end (lex + parse + semantics) and stop,
	// printing diagnostics on failure or the formatted AST on success.
	if onlySema {
		result := pipeline.Compile(sourcePath, contents)
		if len(result.ErrorBag.Errors) > 0 {
			printErrorBag(result.ErrorBag)
			os.Exit(1)
		}
		fmt.Println(ast.FormatAST(result.File))
		return
	}

	// 1. Front-end.
	result := pipeline.Validate(sourcePath, contents)
	if len(result.ErrorBag.Errors) > 0 {
		for _, e := range result.ErrorBag.Errors {
			fmt.Println(e.GetFormattedMessage())
		}
		os.Exit(1)
	}

	// 2. Codegen.
	emitter := codegen.Emitter{
		File:       result.File,
		ErrorBag:   result.ErrorBag,
		SourcePath: sourcePath,
	}

	cBytes := emitter.Emit()
	if emitter.ErrorBag != nil && len(emitter.ErrorBag.Errors) > 0 {
		for _, e := range emitter.ErrorBag.Errors {
			fmt.Println(e.GetFormattedMessage())
		}
		os.Exit(1)
	}

	// 3. Write generated C to <projectRoot>/build/c/<basename>.c.
	projectRoot := filepath.Dir(sourcePath)
	basename := strings.TrimSuffix(filepath.Base(sourcePath), ".delta")
	buildDir := filepath.Join(projectRoot, "build")
	cDir := filepath.Join(buildDir, "c")
	if err := os.MkdirAll(cDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "failed to create %s: %v\n", cDir, err)
		os.Exit(1)
	}
	cFile := filepath.Join(cDir, basename+".c")
	if err := os.WriteFile(cFile, cBytes, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "failed to write %s: %v\n", cFile, err)
		os.Exit(1)
	}

	// 4. Locate clang.
	clangPath, clangErr := toolchain.FindClang()
	if clangErr != nil {
		fmt.Fprintln(os.Stderr, "clang not found on PATH:", clangErr.Message)
		os.Exit(1)
	}

	// 5. Invoke clang. Treat non-zero exit on valid-Delta input as an ICE:
	// the generated .c is preserved under build/c/ for inspection.
	binaryPath := filepath.Join(buildDir, basename)
	cmd := exec.Command(
		clangPath,
		"-std=c11",
		"-Wall",
		"-Werror=implicit-function-declaration",
		"-fwrapv",
		"-o", binaryPath,
		cFile,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintln(
			os.Stderr,
			"internal compiler error: clang failed on generated C",
		)
		fmt.Fprintln(os.Stderr, "  generated source preserved at:", cFile)
		fmt.Fprintln(os.Stderr, "  this is a codegen bug, please report")
		fmt.Fprintln(os.Stderr, "  clang error:", err)
		os.Exit(1)
	}
}

type testCase struct {
	File        string `json:"file"`
	Expect      string `json:"expect"`
	Contains    string `json:"contains,omitempty"`
	NotContains string `json:"not_contains,omitempty"`
	ErrorCount  int    `json:"error_count,omitempty"`
	// PanicContains / PanicAt apply to `expect: "trap"`: the substring the
	// panic message must contain, and the "file.delta:line" location it must
	// reference. See docs/plans/goal-v0.5/phase-a-primitive-types.md.
	PanicContains string `json:"panic_contains,omitempty"`
	PanicAt       string `json:"panic_at,omitempty"`
	Note          string `json:"note,omitempty"`
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
		fmt.Println(
			"\nusage: delta test <suite> | all | <path-to-manifest.json>",
		)
		return
	}

	arg := args[0]

	// 1. Back-compat: explicit manifest path
	if strings.HasSuffix(arg, ".json") ||
		strings.ContainsRune(arg, os.PathSeparator) {
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
		fmt.Printf(
			"\n== overall: %d passed, %d failed ==\n",
			totalPass,
			totalFail,
		)
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
		return res, fmt.Errorf(
			"failed to read manifest %s: %w",
			manifestPath,
			err,
		)
	}

	var cases []testCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		return res, fmt.Errorf(
			"failed to parse manifest %s: %w",
			manifestPath,
			err,
		)
	}

	manifestDir := filepath.Dir(manifestPath)
	resultsDir := filepath.Join(manifestDir, "test-results")
	if err := os.MkdirAll(resultsDir, 0o755); err != nil {
		return res, fmt.Errorf("failed to create %s: %w", resultsDir, err)
	}

	fmt.Printf(
		"== suite %s: running %d tests from %s ==\n",
		suiteName,
		len(cases),
		manifestPath,
	)
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
			err = os.WriteFile(dest, fmt.Appendf(nil, "PANIC: %v\n", r), 0o644)
		}
	}()

	result, cerr := compile(sourcePath)
	if cerr != nil {
		return os.WriteFile(dest, []byte(cerr.Error()+"\n"), 0o644)
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
	return os.WriteFile(dest, []byte(out.String()), 0o644)
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

	case "codegen_match":
		if len(msgs) != 0 {
			return false, "front-end errors before codegen: " + strings.Join(
				msgs,
				"; ",
			)
		}
		return runCodegenMatch(sourcePath, result)

	case "trap":
		if len(msgs) != 0 {
			return false, "front-end errors before trap run: " + strings.Join(
				msgs,
				"; ",
			)
		}
		return runTrapTest(sourcePath, result, tc)

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

// runCodegenMatch is the golden-file codegen test:
//
//  1. Read the reference C from <sourcePath without .delta>.expected.c.
//  2. Sanity-check that the reference compiles with clang. A reference that
//     doesn't compile is a bug in the test, not in the codegen, so we surface
//     it distinctly.
//  3. Run codegen.Emit on the analyzed file.
//  4. Normalize both sides (line endings, trailing whitespace, blank-line
//     runs, `#line` directives) and byte-compare.
//
// The test passes iff the normalized generated C equals the normalized
// reference C. On mismatch we write the raw generated bytes to a sidecar
// .actual.c and surface the first differing line in the failure reason.
func runCodegenMatch(
	sourcePath string,
	result *compileResult,
) (ok bool, reason string) {
	refPath := strings.TrimSuffix(sourcePath, ".delta") + ".expected.c"
	refBytes, err := os.ReadFile(refPath)
	if err != nil {
		return false, "reference C missing: " + refPath
	}

	if ok, why := clangSyntaxCheck(refPath); !ok {
		return false, "reference C does not compile (fix the test, not the codegen):\n" + why
	}

	emitter := codegen.Emitter{
		File:       result.File,
		ErrorBag:   result.ErrorBag,
		SourcePath: sourcePath,
	}

	cBytes := emitter.Emit()
	if emitter.ErrorBag != nil && len(emitter.ErrorBag.Errors) > 0 {
		msgs := make([]string, 0, len(emitter.ErrorBag.Errors))
		for _, e := range emitter.ErrorBag.Errors {
			msgs = append(msgs, e.Message)
		}
		return false, "codegen errors: " + strings.Join(msgs, "; ")
	}

	// Persist the raw generated output for inspection on mismatch.
	outDir := filepath.Join(filepath.Dir(sourcePath), ".codegen-out")
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return false, "failed to create " + outDir + ": " + err.Error()
	}
	base := strings.TrimSuffix(filepath.Base(sourcePath), ".delta")
	actualPath := filepath.Join(outDir, base+".actual.c")
	_ = os.WriteFile(actualPath, cBytes, 0o644)

	expected := normalizeC(refBytes)
	actual := normalizeC(cBytes)
	if expected == actual {
		return true, ""
	}
	return false, fmt.Sprintf(
		"codegen output does not match reference\n  reference: %s\n  generated: %s\n  %s",
		refPath,
		actualPath,
		firstLineDiff(expected, actual),
	)
}

// runTrapTest is the runtime-trap test (`expect: "trap"`):
//
//  1. Emit C for the (already front-end-clean) program.
//  2. Compile it to a native binary with clang.
//  3. Run the binary; it must exit non-zero (Delta panics call abort()).
//  4. The panic line on stderr must contain panic_contains and panic_at.
//
// A build failure or a clean (exit-0) run is a test failure: the contract is
// build-succeeds-then-traps. See docs/plans/goal-v0.5/phase-a-primitive-types.md.
func runTrapTest(
	sourcePath string,
	result *compileResult,
	tc testCase,
) (ok bool, reason string) {
	emitter := codegen.Emitter{
		File:       result.File,
		ErrorBag:   result.ErrorBag,
		SourcePath: sourcePath,
	}

	cBytes := emitter.Emit()
	if emitter.ErrorBag != nil && len(emitter.ErrorBag.Errors) > 0 {
		msgs := make([]string, 0, len(emitter.ErrorBag.Errors))
		for _, e := range emitter.ErrorBag.Errors {
			msgs = append(msgs, e.Message)
		}
		return false, "codegen errors: " + strings.Join(msgs, "; ")
	}

	clangPath, clangErr := toolchain.FindClang()
	if clangErr != nil {
		return false, "clang not found on PATH: " + clangErr.Message
	}

	tmpDir, err := os.MkdirTemp("", "delta-trap-")
	if err != nil {
		return false, "failed to create temp dir: " + err.Error()
	}
	defer os.RemoveAll(tmpDir)

	base := strings.TrimSuffix(filepath.Base(sourcePath), ".delta")
	cFile := filepath.Join(tmpDir, base+".c")
	if err := os.WriteFile(cFile, cBytes, 0o644); err != nil {
		return false, "failed to write generated C: " + err.Error()
	}

	binaryPath := filepath.Join(tmpDir, base)
	build := exec.Command(
		clangPath,
		"-std=c11",
		"-Wall",
		"-Werror=implicit-function-declaration",
		"-fwrapv",
		"-o", binaryPath,
		cFile,
	)
	var buildErr strings.Builder
	build.Stderr = &buildErr
	if err := build.Run(); err != nil {
		return false, "trap test must build, but clang failed: " + strings.TrimSpace(
			buildErr.String(),
		)
	}

	ctx, cancel := context.WithTimeout(context.Background(), trapRunTimeout)
	defer cancel()

	run := exec.CommandContext(ctx, binaryPath)
	var stderr strings.Builder
	run.Stderr = &stderr
	runErr := run.Run()
	panicMsg := strings.TrimSpace(stderr.String())

	// A timeout means the program neither trapped nor exited on its own. The
	// killed process surfaces as an *exec.ExitError, so this check must come
	// before the exit-error branch below — otherwise a hang masquerades as a
	// successful trap.
	if ctx.Err() == context.DeadlineExceeded {
		return false, fmt.Sprintf(
			"trap binary timed out after %s (neither trapped nor exited)\n  stderr: %s",
			trapRunTimeout,
			panicMsg,
		)
	}

	if runErr == nil {
		return false, "expected a runtime trap (non-zero exit), but the program exited 0\n  stderr: " + panicMsg
	}
	// A non-zero exit (abort()) surfaces as *exec.ExitError — that is the
	// expected path. Anything else (binary missing, etc.) is a harness fault.
	if _, isExit := runErr.(*exec.ExitError); !isExit {
		return false, "failed to run trap binary: " + runErr.Error()
	}

	if tc.PanicContains != "" && !strings.Contains(panicMsg, tc.PanicContains) {
		return false, fmt.Sprintf(
			"panic message does not contain %q\n  stderr: %s",
			tc.PanicContains,
			panicMsg,
		)
	}
	if tc.PanicAt != "" && !strings.Contains(panicMsg, tc.PanicAt) {
		return false, fmt.Sprintf(
			"panic location does not contain %q\n  stderr: %s",
			tc.PanicAt,
			panicMsg,
		)
	}

	return true, ""
}

// clangSyntaxCheck runs `clang -fsyntax-only` on the given .c file. Returns
// (true, "") on success. On failure, returns the first few lines of stderr so
// the test runner can surface them.
func clangSyntaxCheck(cFile string) (bool, string) {
	clangPath, clangErr := toolchain.FindClang()
	if clangErr != nil {
		return false, "clang not found on PATH: " + clangErr.Message
	}
	cmd := exec.Command(
		clangPath,
		"-std=c11",
		"-Wall",
		"-Werror=implicit-function-declaration",
		"-fwrapv",
		"-fsyntax-only",
		cFile,
	)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		raw := strings.TrimSpace(stderr.String())
		if lines := strings.SplitN(raw, "\n", 6); len(lines) > 5 {
			return false, strings.Join(lines[:5], "\n") + "\n..."
		}
		return false, raw
	}
	return true, ""
}

// normalizeC reduces a C source to a token-stream canonical form so the
// golden comparison is robust to formatting drift. Indentation and newline
// placement are explicitly ignored — the emitter is free to format however
// it likes; only the C tokens and their order matter.
//
// Concretely:
//   - `#line ...` directives are dropped entirely (plan stage 7, orthogonal)
//   - every run of ASCII whitespace (space, tab, CR, LF) collapses to a
//     single space — so indentation, newline placement, and blank lines all
//     stop mattering
//   - the result is trimmed of leading and trailing whitespace
//
// Two consequences worth knowing:
//   - `int main()` matches `int  main ( )` (intra-line whitespace also
//     collapses)
//   - `intmain` does NOT match `int main` — word boundaries are preserved
//     because we collapse to a single space rather than nothing
func normalizeC(b []byte) string {
	s := strings.ReplaceAll(string(b), "\r\n", "\n")
	// Strip `#line` directive lines (the directive is line-oriented).
	lines := strings.Split(s, "\n")
	kept := make([]string, 0, len(lines))
	for _, ln := range lines {
		if strings.HasPrefix(strings.TrimLeft(ln, " \t"), "#line ") {
			continue
		}
		kept = append(kept, ln)
	}
	joined := strings.Join(kept, "\n")

	// Collapse every run of whitespace (space, tab, newline) to one space.
	var out strings.Builder
	out.Grow(len(joined))
	inWS := false
	for i := 0; i < len(joined); i++ {
		c := joined[i]
		if c == ' ' || c == '\t' || c == '\n' || c == '\r' {
			if !inWS {
				out.WriteByte(' ')
				inWS = true
			}
			continue
		}
		out.WriteByte(c)
		inWS = false
	}
	return strings.TrimSpace(out.String())
}

// firstByteDiff returns a human-readable description of the first byte at
// which expected and actual disagree, with a short window of context.
// (Renamed from line-based since the normalized form is a single line.)
func firstLineDiff(expected, actual string) string {
	n := len(expected)
	if len(actual) < n {
		n = len(actual)
	}
	for i := 0; i < n; i++ {
		if expected[i] != actual[i] {
			start := i - 20
			if start < 0 {
				start = 0
			}
			endE := i + 30
			if endE > len(expected) {
				endE = len(expected)
			}
			endA := i + 30
			if endA > len(actual) {
				endA = len(actual)
			}
			return fmt.Sprintf(
				"first diff at byte %d:\n    expected: ...%q...\n      actual: ...%q...",
				i,
				expected[start:endE],
				actual[start:endA],
			)
		}
	}
	if len(expected) != len(actual) {
		return fmt.Sprintf(
			"length differs: expected %d bytes, actual %d (common prefix of %d bytes matches)",
			len(expected),
			len(actual),
			n,
		)
	}
	return "no byte-level diff (possible normalization bug)"
}

// printErrorBag prints every diagnostic in bag to stdout, one formatted
// message per line — the same rendering `delta build` uses on failure.
func printErrorBag(bag *diagnostics.ErrorBag) {
	for _, e := range bag.Errors {
		fmt.Println(e.GetFormattedMessage())
	}
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
