// Package pipeline
package pipeline

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"delta/internal/analyzer"
	"delta/internal/ast"
	"delta/internal/codegen"
	"delta/internal/diagnostics"
	"delta/internal/project"
	"delta/internal/stdlib"
	"delta/internal/tokenizer"
	"delta/internal/toolchain"
)

type BuildResult struct {
	Project    *project.Project
	Graph      *ModuleGraph
	BinaryPath string
	CFiles     []string
}

type ModuleGraph struct {
	Project *project.Project
	Modules []*Module
	ByPath  map[string]*Module
}

type Module struct {
	ID        string
	Path      string
	Source    string
	File      ast.File
	ErrorBag  *diagnostics.ErrorBag
	Validator *analyzer.Validator
	Imports   []ResolvedImport
}

type ResolvedImport struct {
	Name   string
	Module *Module
	Symbol analyzer.Symbol
}

type AnalyzeOptions struct {
	Overlays map[string][]byte
}

func AnalyzeProject(
	arg string,
	opts AnalyzeOptions,
) (*ModuleGraph, *diagnostics.ErrorBag) {
	proj, err := project.Resolve(arg, "debug")
	bag := &diagnostics.ErrorBag{}
	if err != nil {
		bag.AddError(diagnostics.SourceError{
			Stage:    diagnostics.Semantic,
			Severity: diagnostics.Error,
			Message:  err.Error(),
		})
		return nil, bag
	}
	bag.File = proj.Entry
	graph, ok := buildModuleGraph(proj, bag, opts)
	if !ok {
		return nil, bag
	}
	return graph, bag
}

func ResultForModule(mod *Module) *Result {
	if mod == nil {
		return nil
	}
	result := &Result{
		File:     mod.File,
		ErrorBag: mod.ErrorBag,
	}
	if mod.Validator != nil {
		result.Refs = mod.Validator.Refs
		result.RootScope = mod.Validator.RootScope
		result.Records = mod.Validator.Records
		result.Methods = mod.Validator.Methods
		result.Divisions = mod.Validator.Divisions
		result.Shifts = mod.Validator.Shifts
		result.IncDecs = mod.Validator.IncDecs
	}
	return result
}

func BuildProject(arg, mode string) (*BuildResult, *diagnostics.ErrorBag) {
	proj, err := project.Resolve(arg, mode)
	bag := &diagnostics.ErrorBag{}
	if err != nil {
		bag.AddError(diagnostics.SourceError{
			Stage:    diagnostics.Semantic,
			Severity: diagnostics.Error,
			Message:  err.Error(),
		})
		return nil, bag
	}
	bag.File = proj.Entry

	graph, ok := buildModuleGraph(proj, bag, AnalyzeOptions{})
	if !ok {
		return nil, bag
	}
	if err := checkOneMain(graph, bag); err != nil {
		addBuildError(bag, err.Error())
		return nil, bag
	}

	if err := os.MkdirAll(proj.CDir(), 0o755); err != nil {
		addBuildError(bag, err.Error())
		return nil, bag
	}
	if err := os.MkdirAll(proj.BinDir(), 0o755); err != nil {
		addBuildError(bag, err.Error())
		return nil, bag
	}

	var cFiles []string
	for _, mod := range graph.Modules {
		emitter := codegen.Emitter{
			File:       mod.File,
			ErrorBag:   mod.ErrorBag,
			SourcePath: mod.Path,
			ModuleID:   mod.ID,
			EmitMain:   definesMain(mod.File),
		}
		emitter.ConfigureModule(projectCodegenInfo(mod))
		cBytes := emitter.Emit()
		if emitter.ErrorBag != nil && len(emitter.ErrorBag.Errors) > 0 {
			appendErrors(bag, emitter.ErrorBag.Errors)
			return nil, bag
		}
		cFile := filepath.Join(proj.CDir(), mod.ID+".c")
		if err := os.WriteFile(cFile, cBytes, 0o644); err != nil {
			addBuildError(bag, err.Error())
			return nil, bag
		}
		cFiles = append(cFiles, cFile)
	}

	clangPath, clangErr := toolchain.FindClang()
	if clangErr != nil {
		addBuildError(bag, "clang not found on PATH: "+clangErr.Message)
		return nil, bag
	}
	args := []string{
		"-std=c11",
		"-Wall",
		"-Werror=implicit-function-declaration",
		"-fwrapv",
		"-o", proj.BinaryPath(),
	}
	args = append(args, cFiles...)
	cmd := exec.Command(clangPath, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		addBuildError(
			bag,
			fmt.Sprintf("internal compiler error: clang failed on generated C: %v", err),
		)
		return nil, bag
	}

	return &BuildResult{
		Project:    proj,
		Graph:      graph,
		BinaryPath: proj.BinaryPath(),
		CFiles:     cFiles,
	}, bag
}

func buildModuleGraph(
	proj *project.Project,
	bag *diagnostics.ErrorBag,
	opts AnalyzeOptions,
) (*ModuleGraph, bool) {
	g := &ModuleGraph{
		Project: proj,
		ByPath:  map[string]*Module{},
	}
	color := map[string]int{}
	stack := []*Module{}

	var visit func(path string) (*Module, bool)
	visit = func(path string) (*Module, bool) {
		abs, _ := filepath.Abs(path)
		if color[abs] == 1 {
			addCycleError(bag, stack, abs)
			return nil, false
		}
		if color[abs] == 2 {
			return g.ByPath[abs], true
		}

		mod, ok := parseModule(proj, abs, bag, opts)
		if !ok {
			return nil, false
		}
		g.ByPath[abs] = mod
		color[abs] = 1
		stack = append(stack, mod)

		imported := map[string]analyzer.Symbol{}
		importHadError := false
		for _, decl := range mod.File.Declarations {
			imp, ok := decl.(ast.ImportDeclaration)
			if !ok {
				continue
			}
			depPath, depMod, resolved := resolveImportModule(proj, mod, imp, visit, bag)
			if !resolved {
				color[abs] = 2
				stack = stack[:len(stack)-1]
				return nil, false
			}
			_ = depPath
			for _, spec := range imp.Specifiers {
				sym, ok := depMod.Validator.GlobalScope.Lookup(spec.Name)
				if !ok || sym.Kind == analyzer.SymbolResult {
					addModuleError(
						bag, mod, spec.Position,
						fmt.Sprintf("%s is not exported by %s", spec.Name, imp.Path),
					)
					importHadError = true
					continue
				}
				if !sym.Exported {
					addModuleError(
						bag, mod, spec.Position,
						fmt.Sprintf("%s is not exported by %s", spec.Name, imp.Path),
					)
					importHadError = true
					continue
				}
				importedSym := *sym
				importedSym.Imported = true
				importedSym.Exported = false
				importedSym.ModuleID = depMod.ID
				importedSym.CName = exportedCName(depMod.ID, importedSym.Name)
				importedSym.SourcePath = depMod.Path
				imported[spec.Name] = importedSym
				mod.Imports = append(mod.Imports, ResolvedImport{
					Name:   spec.Name,
					Module: depMod,
					Symbol: importedSym,
				})
			}
		}
		if importHadError {
			color[abs] = 2
			stack = stack[:len(stack)-1]
			return nil, false
		}

		mod.Validator = &analyzer.Validator{
			Errors:          mod.ErrorBag,
			ImportedSymbols: imported,
		}
		mod.Validator.Check(mod.File)
		if len(mod.ErrorBag.Errors) > 0 {
			appendErrors(bag, mod.ErrorBag.Errors)
			color[abs] = 2
			stack = stack[:len(stack)-1]
			return nil, false
		}

		color[abs] = 2
		stack = stack[:len(stack)-1]
		g.Modules = append(g.Modules, mod)
		return mod, true
	}

	if _, ok := visit(proj.Entry); !ok {
		return nil, false
	}
	return g, true
}

func parseModule(
	proj *project.Project,
	path string,
	bag *diagnostics.ErrorBag,
	opts AnalyzeOptions,
) (*Module, bool) {
	contents, ok := overlayFor(opts.Overlays, path)
	if !ok {
		var err error
		contents, err = os.ReadFile(path)
		if err != nil {
			addBuildError(bag, fmt.Sprintf("failed to read %s: %v", path, err))
			return nil, false
		}
	}
	fileBag := &diagnostics.ErrorBag{File: path, Source: string(contents)}
	tokens, _ := tokenizer.Tokenize(string(contents), fileBag)
	if len(fileBag.Errors) == 0 {
		parser := ast.Parser{Tokens: tokens, ErrorBag: fileBag}
		file := parser.Parse()
		if len(fileBag.Errors) > 0 {
			appendErrors(bag, fileBag.Errors)
			return nil, false
		}
		return &Module{
			ID:       project.ModuleID(proj.Root, path),
			Path:     path,
			Source:   string(contents),
			File:     file,
			ErrorBag: fileBag,
		}, true
	}
	appendErrors(bag, fileBag.Errors)
	return nil, false
}

func overlayFor(overlays map[string][]byte, path string) ([]byte, bool) {
	if len(overlays) == 0 {
		return nil, false
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	if content, ok := overlays[abs]; ok {
		return content, true
	}
	clean := filepath.Clean(abs)
	content, ok := overlays[clean]
	return content, ok
}

func resolveImportModule(
	proj *project.Project,
	mod *Module,
	imp ast.ImportDeclaration,
	visit func(string) (*Module, bool),
	bag *diagnostics.ErrorBag,
) (string, *Module, bool) {
	if strings.HasPrefix(imp.Path, "std/") {
		if _, ok := stdlib.Resolve(imp.Path); !ok {
			addModuleError(
				bag, mod, imp.Position,
				"unknown stdlib module: "+imp.Path,
			)
			return "", nil, false
		}
		addModuleError(
			bag, mod, imp.Position,
			"stdlib module resolution is not populated yet: "+imp.Path,
		)
		return "", nil, false
	}
	if !strings.HasPrefix(imp.Path, "./") && !strings.HasPrefix(imp.Path, "../") {
		addModuleError(bag, mod, imp.Position, "unknown import root: "+imp.Path)
		return "", nil, false
	}
	target := filepath.Clean(filepath.Join(filepath.Dir(mod.Path), filepath.FromSlash(imp.Path)))
	if filepath.Ext(target) == "" {
		target += ".delta"
	}
	dep, ok := visit(target)
	return target, dep, ok
}

func projectCodegenInfo(mod *Module) codegen.ModuleInfo {
	info := codegen.ModuleInfo{
		Imports: map[string]codegen.ImportedSymbol{},
		Types:   map[string]codegen.ImportedType{},
	}
	for _, imp := range mod.Imports {
		cName := exportedCName(imp.Module.ID, imp.Name)
		if imp.Symbol.Kind == analyzer.SymbolTypeDecl {
			info.Types[imp.Name] = codegen.ImportedType{
				CName:  cName,
				Fields: importedFields(imp.Symbol.Type),
			}
			continue
		}
		info.Imports[imp.Name] = codegen.ImportedSymbol{
			CName:       cName,
			IsFunction:  imp.Symbol.Kind == analyzer.SymbolFunction,
			ParamTypes:  signatureParamTypes(imp.Symbol.Signature),
			ParamBorrow: signatureParamBorrows(imp.Symbol.Signature),
			ReturnType:  signatureReturnType(imp.Symbol.Signature),
			Fallible:    signatureFallible(imp.Symbol.Signature),
			ConstType:   imp.Symbol.Type.Name,
		}
	}
	return info
}

func signatureParamTypes(sig *analyzer.FunctionSignature) []string {
	if sig == nil {
		return nil
	}
	out := make([]string, 0, len(sig.Parameters))
	for _, t := range sig.Parameters {
		out = append(out, t.Name)
	}
	return out
}

func signatureParamBorrows(sig *analyzer.FunctionSignature) []bool {
	if sig == nil {
		return nil
	}
	out := make([]bool, 0, len(sig.Parameters))
	for _, t := range sig.Parameters {
		out = append(out, t.Reference)
	}
	return out
}

func signatureReturnType(sig *analyzer.FunctionSignature) string {
	if sig == nil || len(sig.ReturnTypes) == 0 {
		return ""
	}
	return sig.ReturnTypes[0].Name
}

func signatureFallible(sig *analyzer.FunctionSignature) bool {
	return sig != nil && len(sig.ErrorTypes) > 0
}

func importedFields(t analyzer.Type) []codegen.ImportedField {
	fields := make([]codegen.ImportedField, 0, len(t.Fields))
	for _, f := range t.Fields {
		fields = append(fields, codegen.ImportedField{
			Name:      f.Name,
			DeltaType: f.Type.Name,
		})
	}
	return fields
}

func exportedCName(moduleID, name string) string {
	return "delta__" + moduleID + "__" + name
}

func definesMain(file ast.File) bool {
	for _, decl := range file.Declarations {
		fn, ok := decl.(ast.FunctionDeclaration)
		if ok && fn.Receiver == nil && fn.Name == "main" {
			return true
		}
	}
	return false
}

func checkOneMain(g *ModuleGraph, bag *diagnostics.ErrorBag) error {
	var mains []string
	for _, mod := range g.Modules {
		if definesMain(mod.File) {
			mains = append(mains, mod.Path)
		}
	}
	sort.Strings(mains)
	if len(mains) == 0 {
		return fmt.Errorf("no main function found")
	}
	if len(mains) > 1 {
		return fmt.Errorf("multiple main functions found: %s", strings.Join(mains, ", "))
	}
	return nil
}

func addCycleError(bag *diagnostics.ErrorBag, stack []*Module, repeated string) {
	start := 0
	for i, mod := range stack {
		if mod.Path == repeated {
			start = i
			break
		}
	}
	parts := []string{}
	for _, mod := range stack[start:] {
		parts = append(parts, filepath.Base(mod.Path))
	}
	parts = append(parts, filepath.Base(repeated))
	addBuildError(bag, "import cycle: "+strings.Join(parts, " -> "))
}

func addModuleError(
	bag *diagnostics.ErrorBag,
	mod *Module,
	pos ast.Position,
	message string,
) {
	bag.AddError(diagnostics.SourceError{
		Stage:    diagnostics.Semantic,
		Severity: diagnostics.Error,
		File:     mod.Path,
		Line:     pos.Line,
		Column:   pos.Column,
		Source:   sourceLine(mod.Source, pos.Line),
		Message:  message,
	})
}

func addBuildError(bag *diagnostics.ErrorBag, message string) {
	bag.AddError(diagnostics.SourceError{
		Stage:    diagnostics.Semantic,
		Severity: diagnostics.Error,
		Message:  message,
	})
}

func appendErrors(bag *diagnostics.ErrorBag, errors []diagnostics.SourceError) {
	bag.Errors = append(bag.Errors, errors...)
}

func sourceLine(source string, line int) string {
	if line <= 0 {
		return ""
	}
	lines := strings.Split(source, "\n")
	if line > len(lines) {
		return ""
	}
	return strings.TrimSuffix(lines[line-1], "\r")
}
