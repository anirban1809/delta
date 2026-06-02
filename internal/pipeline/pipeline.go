package pipeline

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
	"delta/internal/semantics"
	"delta/internal/tokenizer"
)

// Result is the output of a single Compile call. Refs and RootScope are
// non-nil only when semantic analysis ran (i.e. parsing succeeded). LSP
// handlers should check before dereferencing.
type Result struct {
	File      ast.File
	ErrorBag  *diagnostics.ErrorBag
	Refs      map[ast.Position]semantics.Symbol
	RootScope *semantics.ScopeNode
}

func Compile(name string, contents []byte) *Result {
	bag := &diagnostics.ErrorBag{File: name, Source: string(contents)}
	tokens, _ := tokenizer.Tokenize(string(contents), bag)
	if len(bag.Errors) > 0 {
		return &Result{ErrorBag: bag}
	}
	parser := ast.Parser{Tokens: tokens, ErrorBag: bag}
	file := parser.Parse()
	if len(bag.Errors) > 0 {
		return &Result{File: file, ErrorBag: bag}
	}
	analyzer := semantics.Analyzer{
		AST:         file,
		ErrorBag:    bag,
		GlobalScope: &semantics.Scope{Symbols: map[string]semantics.Symbol{}},
	}
	analyzer.Analyze()
	return &Result{
		File:      file,
		ErrorBag:  bag,
		Refs:      analyzer.Refs,
		RootScope: analyzer.RootScope,
	}
}

// HasParseErrors reports whether r contains any tokenizer or parser
// diagnostic. Used by LSP completion to decide whether r is "good
// enough" for scope-aware completion or the fallback to lastGood should
// kick in.
func HasParseErrors(r *Result) bool {
	if r == nil || r.ErrorBag == nil {
		return false
	}
	for _, e := range r.ErrorBag.Errors {
		if e.Stage == diagnostics.Tokenizer || e.Stage == diagnostics.Parser {
			return true
		}
	}
	return false
}
