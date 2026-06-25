package pipeline

import (
	"delta/internal/analyzer"
	"delta/internal/ast"
	"delta/internal/diagnostics"
	"delta/internal/tokenizer"
)

// Result is the output of a single Compile call. Refs and RootScope are
// non-nil only when semantic analysis ran (i.e. parsing succeeded). LSP
// handlers should check before dereferencing.
type Result struct {
	File      ast.File
	ErrorBag  *diagnostics.ErrorBag
	Refs      map[ast.Position]analyzer.Symbol
	RootScope *analyzer.ScopeNode
	Records   map[string][]analyzer.ResolvedRecordField
	Methods   map[string]map[string]*analyzer.FunctionSignature
	Divisions map[ast.Position]analyzer.Type
	Shifts    map[ast.Position]analyzer.Type
	IncDecs   map[ast.Position]analyzer.Type
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
	validator := analyzer.Validator{Errors: bag}
	validator.Check(file)
	return &Result{
		File:      file,
		ErrorBag:  bag,
		Refs:      validator.Refs,
		RootScope: validator.RootScope,
		Records:   validator.Records,
		Methods:   validator.Methods,
		Divisions: validator.Divisions,
		Shifts:    validator.Shifts,
		IncDecs:   validator.IncDecs,
	}
}

func Validate(name string, contents []byte) *Result {
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
	validator := analyzer.Validator{Errors: bag}
	validator.Check(file)
	return &Result{
		File:     file,
		ErrorBag: bag,
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
