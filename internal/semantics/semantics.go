package semantics

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
	"fmt"
)

type SymbolKind int

const (
	SymbolFunction SymbolKind = iota
	SymbolFileConst
	SymbolParameter
	SymbolLocalConst
	SymbolLocalLet
)

type Symbol struct {
	Name string
	Kind SymbolKind
}

type Scope struct {
	Parent  *Scope
	Symbols map[string]Symbol
}

func (s *Scope) AddSymbol(name string, kind SymbolKind) {
	s.Symbols[name] = Symbol{
		Name: name,
		Kind: kind,
	}
}

type Analyzer struct {
	AST         ast.File
	ErrorBag    *diagnostics.ErrorBag
	GlobalScope *Scope
}

func (a *Analyzer) FindSymbol(scope *Scope, name string) bool {
	if _, ok := scope.Symbols[name]; ok {
		return true
	}

	if scope.Parent != nil {
		return a.FindSymbol(scope.Parent, name)
	}
	return false
}

func (a *Analyzer) GetSymbol(scope *Scope, name string) Symbol {
	if _, ok := scope.Symbols[name]; ok {
		return scope.Symbols[name]
	}

	if scope.Parent != nil {
		return a.GetSymbol(scope.Parent, name)
	}
	return Symbol{}
}

// errorAt records a semantic diagnostic at the given AST position.
func (a *Analyzer) errorAt(pos ast.Position, message string) {
	a.ErrorBag.AddError(diagnostics.SourceError{
		Stage:   diagnostics.Semantic,
		Line:    pos.Line,
		Column:  pos.Column,
		Message: message,
	})
}

func (a *Analyzer) AnalyzeExpression(expr ast.Expression, scope *Scope) {
	expression := expr
	switch expression := expression.(type) {
	case ast.Identifier:
		if !a.FindSymbol(scope, expression.Name) {
			a.errorAt(
				expression.Position,
				fmt.Sprintf("unknown identifier: %s", expression.Name),
			)
		}
	case ast.BinaryExpression:
		a.AnalyzeExpression(expression.Left, scope)
		a.AnalyzeExpression(expression.Right, scope)
	case ast.UnaryExpression:
		a.AnalyzeExpression(expression.Expression, scope)

	case ast.FunctionCallExpression:

		switch callee := expression.Callee.(type) {
		case ast.Identifier:
			calleeSymbol := a.GetSymbol(scope, callee.Name)

			if calleeSymbol.Kind != SymbolFunction {
				a.errorAt(
					callee.Position,
					fmt.Sprintf("cannot invoke %s, not a callable function.", calleeSymbol.Name),
				)
			}

			a.AnalyzeExpression(expression.Callee, scope)
			for _, argument := range expression.Arguments {
				a.AnalyzeExpression(argument, scope)
			}
		default:
			a.errorAt(
				expression.Position,
				"cannot call non-identifier expression: function-typed values are not yet supported",
			)
		}

	case ast.IntegerLiteral,
		ast.BooleanLiteral,
		ast.StringLiteral,
		ast.CharacterLiteral:
	}
}

func (a *Analyzer) AnalyzeScope(block ast.BlockStatement, parent *Scope) {
	statements := block.Statements
	scope := Scope{
		Parent:  parent,
		Symbols: map[string]Symbol{},
	}
	for _, statement := range statements {
		switch statement := statement.(type) {
		case ast.Comment:
			continue

		case ast.VariableDeclarationStatement:
			a.AnalyzeExpression(statement.Value, &scope)
			kind := SymbolLocalConst
			if statement.Mutable {
				kind = SymbolLocalLet
			}
			if a.FindSymbol(&scope, statement.Name) {
				a.errorAt(
					statement.Position,
					fmt.Sprintf("use of duplicate identifier: %s", statement.Name),
				)
				continue
			}
			scope.AddSymbol(statement.Name, kind)

		case ast.IfStatement:
			a.AnalyzeExpression(statement.Condition, &scope)
			a.AnalyzeScope(statement.ThenBlock, &scope)
			a.AnalyzeScope(statement.ElseBlock, &scope)

		case ast.AssignmentStatement:
			expr := statement.Value
			a.AnalyzeExpression(expr, &scope)
			if !a.FindSymbol(&scope, statement.Target.Name) {
				a.errorAt(
					statement.Target.Position,
					fmt.Sprintf("unknown identifier: %s", statement.Target.Name),
				)

				break
			}

			symbol := a.GetSymbol(&scope, statement.Target.Name)

			if symbol.Kind != SymbolLocalLet {

				message := fmt.Sprintf("cannot assign to const: %s", statement.Target.Name)

				switch symbol.Kind {
				case SymbolFunction:
					message = fmt.Sprintf("cannot assign to function: %s", statement.Target.Name)

				case SymbolParameter:
					message = fmt.Sprintf("cannot assign to const parameter: %s", statement.Target.Name)
				}

				a.errorAt(statement.Target.Position, message)
			}

		case ast.ReturnStatement:
			for _, expr := range statement.Values {
				a.AnalyzeExpression(expr, &scope)
			}

		case ast.ExpressionStatement:
			a.AnalyzeExpression(statement.Value, &scope)

		case ast.WhileStatement:
			a.AnalyzeExpression(statement.Condition, &scope)
			a.AnalyzeScope(statement.Body, &scope)
		}
	}
}

func (a *Analyzer) AnalyzeFunctionDeclaration(
	declaration ast.FunctionDeclaration,
) {
	functionScope := Scope{
		Parent:  a.GlobalScope,
		Symbols: map[string]Symbol{},
	}

	for _, parameter := range declaration.Parameters {
		name := parameter.Name.Name
		if _, ok := functionScope.Symbols[name]; ok {
			a.errorAt(
				parameter.Position,
				fmt.Sprintf("use of duplicate identifier: %s", name),
			)
			continue
		}

		functionScope.AddSymbol(name, SymbolParameter)
	}

	if declaration.Body != nil {
		a.AnalyzeScope(*declaration.Body, &functionScope)
	}
}

func (a *Analyzer) Analyze() {
	declarations := a.AST.Declarations
	for _, declaration := range declarations {
		switch declaration := declaration.(type) {
		case ast.Comment:
			continue

		case ast.FunctionDeclaration:
			if a.FindSymbol(a.GlobalScope, declaration.Name) {
				a.errorAt(
					declaration.Position,
					fmt.Sprintf("use of duplicate identifier: %s", declaration.Name),
				)
				continue
			}
			a.GlobalScope.AddSymbol(declaration.Name, SymbolFunction)
		case ast.ConstDeclaration:
			if _, ok := a.GlobalScope.Symbols[declaration.Name.Name]; ok {
				a.errorAt(
					declaration.Position,
					fmt.Sprintf("use of duplicate identifier: %s", declaration.Name.Name),
				)
				continue
			}
			a.GlobalScope.AddSymbol(declaration.Name.Name, SymbolFileConst)
		}
	}

	for _, declaration := range declarations {
		switch declaration := declaration.(type) {
		case ast.Comment:
			continue

		case ast.FunctionDeclaration:
			a.AnalyzeFunctionDeclaration(declaration)
		case ast.ConstDeclaration:
			a.AnalyzeExpression(declaration.Value, a.GlobalScope)

		}
	}
}
