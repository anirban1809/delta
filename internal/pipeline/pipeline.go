package pipeline

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
	"delta/internal/semantics"
	"delta/internal/tokenizer"
)

type Result struct {
	File     ast.File
	ErrorBag *diagnostics.ErrorBag
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
	return &Result{File: file, ErrorBag: bag}
}
