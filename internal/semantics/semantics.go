package semantics

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
	"fmt"
	"strings"
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
	Name      string
	Kind      SymbolKind
	Type      Type
	DefPos    ast.Position
	Display   string
	Signature *FunctionSignature
}

type Scope struct {
	Parent  *Scope
	Symbols map[string]Symbol
}

// AddSymbol stores sym under its Name. Callers are responsible for
// populating Kind, Type/Signature, DefPos, and Display before calling.
func (s *Scope) AddSymbol(sym Symbol) {
	s.Symbols[sym.Name] = sym
}

// renderBindingDisplay formats a non-function symbol for hover.
// Examples: "const counter: int32", "let x: bool", "param a: int32".
func renderBindingDisplay(kind SymbolKind, name string, t Type) string {
	keyword := "var"
	switch kind {
	case SymbolFileConst, SymbolLocalConst:
		keyword = "const"
	case SymbolLocalLet:
		keyword = "let"
	case SymbolParameter:
		keyword = "param"
	}
	return fmt.Sprintf("%s %s: %s", keyword, name, t.String())
}

type Analyzer struct {
	AST         ast.File
	ErrorBag    *diagnostics.ErrorBag
	GlobalScope *Scope

	// LSP-facing outputs, populated by Analyze().
	//
	// Refs maps every identifier *use-site position* to the symbol it
	// resolved to. Two identifiers cannot share (line, column) in well-
	// formed source, so position is a safe key.
	Refs map[ast.Position]Symbol

	// RootScope is the file-level ScopeNode. Each block and function body
	// is a child node carrying a source range. Used for completion's
	// scope-at-position lookup and may be used by future LSP features.
	RootScope *ScopeNode

	// currentNode tracks the ScopeNode being built. Push/pop'd by
	// AnalyzeScope and AnalyzeFunctionDeclaration via deferred restores.
	currentNode *ScopeNode

	// currentFunctionSig is the signature of the function whose body is
	// currently being analyzed. ReturnStatement validation reads it. Set
	// in AnalyzeFunctionDeclaration; nil at file scope.
	currentFunctionSig *FunctionSignature
}

// pushScopeNode wires a freshly-constructed Scope into the analyzer's
// scope tree. Returns a restore function the caller should defer to pop.
func (a *Analyzer) pushScopeNode(scope *Scope, start, end ast.Position) func() {
	node := &ScopeNode{
		Start:  start,
		End:    end,
		Scope:  scope,
		Parent: a.currentNode,
	}
	if a.currentNode != nil {
		a.currentNode.Children = append(a.currentNode.Children, node)
	}
	prev := a.currentNode
	a.currentNode = node
	return func() { a.currentNode = prev }
}

// recordRef captures a resolved identifier use-site. Safe to call with
// the zero Symbol — but callers should only invoke this when a real
// resolution succeeded so go-to-definition jumps don't land on garbage.
func (a *Analyzer) recordRef(pos ast.Position, sym Symbol) {
	if a.Refs == nil {
		return
	}
	a.Refs[pos] = sym
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

func (a *Analyzer) GetSym(scope *Scope, name string) Symbol {
	if _, ok := scope.Symbols[name]; ok {
		return scope.Symbols[name]
	}

	if scope.Parent != nil {
		return a.GetSym(scope.Parent, name)
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

func (a *Analyzer) AnalyzeExpr(expr ast.Expression, scope *Scope) {
	expression := expr
	switch expression := expression.(type) {
	case ast.Identifier:
		if !a.FindSymbol(scope, expression.Name) {
			a.errorAt(
				expression.Position,
				fmt.Sprintf("unknown identifier: %s", expression.Name),
			)
		} else {
			a.recordRef(expression.Position, a.GetSym(scope, expression.Name))
		}
	case ast.BinaryExpression:
		a.AnalyzeExpr(expression.Left, scope)
		a.AnalyzeExpr(expression.Right, scope)
	case ast.UnaryExpression:
		a.AnalyzeExpr(expression.Expression, scope)

	case ast.FunctionCallExpression:

		switch callee := expression.Callee.(type) {
		case ast.Identifier:
			calleeSymbol := a.GetSym(scope, callee.Name)

			if calleeSymbol.Kind != SymbolFunction {
				a.errorAt(
					callee.Position,
					fmt.Sprintf("cannot invoke %s, not a callable function.", calleeSymbol.Name),
				)
			}

			a.AnalyzeExpr(expression.Callee, scope)
			for _, argument := range expression.Arguments {
				a.AnalyzeExpr(argument, scope)
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

// typeOfUnary returns the type of a unary expression. If the operand is
// TypeInvalid, propagates it silently (cascade suppression).
func (a *Analyzer) typeOfUnary(e ast.UnaryExpression, scope *Scope) Type {
	operandT := a.TypeOf(e.Expression, scope)
	if operandT.Kind == TypeInvalid {
		return Type{Kind: TypeInvalid}
	}

	switch e.Operator {
	case "!":
		if operandT.Kind != TypeBool {
			a.errorAt(e.Position, fmt.Sprintf(
				"unary `!` requires bool operand, got %s", operandT))
			return Type{Kind: TypeInvalid}
		}
		return Type{TypeBool}

	case "-":
		if operandT.Kind != TypeInt32 {
			a.errorAt(e.Position, fmt.Sprintf(
				"unary `-` requires int32 operand, got %s", operandT))
			return Type{Kind: TypeInvalid}
		}
		return Type{TypeInt32}
	}

	a.errorAt(e.Position, fmt.Sprintf("unknown unary operator %q", e.Operator))
	return Type{Kind: TypeInvalid}
}

// typeOfBinary returns the type of a binary expression. Operand types are
// computed first; if either is TypeInvalid, propagate it silently.
func (a *Analyzer) typeOfBinary(e ast.BinaryExpression, scope *Scope) Type {
	leftT := a.TypeOf(e.Left, scope)
	rightT := a.TypeOf(e.Right, scope)
	if leftT.Kind == TypeInvalid || rightT.Kind == TypeInvalid {
		return Type{Kind: TypeInvalid}
	}

	switch e.Operator {
	case "+", "-", "*", "/":
		if leftT.Kind != TypeInt32 || rightT.Kind != TypeInt32 {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires int32 operands, got %s and %s",
				e.Operator, leftT, rightT))
			return Type{Kind: TypeInvalid}
		}
		return Type{TypeInt32}

	case "<", "<=", ">", ">=":
		if leftT.Kind != TypeInt32 || rightT.Kind != TypeInt32 {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires int32 operands, got %s and %s",
				e.Operator, leftT, rightT))
			return Type{Kind: TypeInvalid}
		}
		return Type{TypeBool}

	case "==", "!=":
		if leftT.Kind != rightT.Kind {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires operands of the same type, got %s and %s",
				e.Operator,
				leftT,
				rightT,
			))
			return Type{Kind: TypeInvalid}
		}
		if leftT.Kind != TypeInt32 && leftT.Kind != TypeBool {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` is not defined for type %s", e.Operator, leftT))
			return Type{Kind: TypeInvalid}
		}
		return Type{TypeBool}

	case "&&", "||":
		if leftT.Kind != TypeBool || rightT.Kind != TypeBool {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires bool operands, got %s and %s",
				e.Operator, leftT, rightT))
			return Type{Kind: TypeInvalid}
		}
		return Type{TypeBool}
	}

	a.errorAt(e.Position, fmt.Sprintf("unknown binary operator %q", e.Operator))
	return Type{Kind: TypeInvalid}
}

// typeOfCall returns the type of a function-call expression. Handles
// non-identifier callees, unknown callees, non-function callees, arity
// mismatches, per-argument type mismatches, and rejects multi-return
// calls in expression position.
func (a *Analyzer) typeOfCall(e ast.FunctionCallExpression, scope *Scope) Type {
	// Only identifier-shaped callees are supported in v0. Still walk the
	// arguments so diagnostics inside them are reported.
	ident, ok := e.Callee.(ast.Identifier)
	if !ok {
		a.errorAt(
			e.Position,
			"cannot call non-identifier expression: function-typed values are not yet supported",
		)
		for _, arg := range e.Arguments {
			a.TypeOf(arg, scope)
		}
		return Type{Kind: TypeInvalid}
	}

	if !a.FindSymbol(scope, ident.Name) {
		a.errorAt(ident.Position,
			fmt.Sprintf("unknown identifier: %s", ident.Name))
		for _, arg := range e.Arguments {
			a.TypeOf(arg, scope)
		}
		return Type{Kind: TypeInvalid}
	}

	sym := a.GetSym(scope, ident.Name)
	a.recordRef(ident.Position, sym)
	if sym.Kind != SymbolFunction || sym.Signature == nil {
		a.errorAt(ident.Position, fmt.Sprintf(
			"cannot invoke %s, not a callable function", ident.Name))
		for _, arg := range e.Arguments {
			a.TypeOf(arg, scope)
		}
		return Type{Kind: TypeInvalid}
	}

	sig := sym.Signature

	// Arity: report once, but still type-check overlapping positions so
	// arg-type errors don't get hidden behind the arity error.
	if len(e.Arguments) != len(sig.Parameters) {
		a.errorAt(e.Position, fmt.Sprintf(
			"function %s expects %d argument(s), got %d",
			ident.Name, len(sig.Parameters), len(e.Arguments)))
	}

	for i, arg := range e.Arguments {
		argT := a.TypeOf(arg, scope)
		if i >= len(sig.Parameters) {
			continue
		}
		want := sig.Parameters[i]
		if want.Kind == TypeInvalid || argT.Kind == TypeInvalid {
			continue
		}
		if want.Kind != argT.Kind {
			a.errorAt(e.Position, fmt.Sprintf(
				"argument %d of %s: expected %s, got %s",
				i+1, ident.Name, want, argT))
		}
	}

	// Return type in expression position:
	//   0 declared returns       → void
	//   1 declared return        → that type (with declared `void` collapsing to void)
	//   2+ declared returns      → reject in expression position
	switch len(sig.ReturnTypes) {
	case 0:
		return Type{TypeVoid}
	case 1:
		if sig.ReturnTypes[0].Kind == TypeVoid {
			return Type{TypeVoid}
		}
		return sig.ReturnTypes[0]
	default:
		a.errorAt(e.Position,
			"multi-return call cannot be used in expression position")
		return Type{Kind: TypeInvalid}
	}
}

func (a *Analyzer) TypeOf(expr ast.Expression, scope *Scope) Type {
	switch e := expr.(type) {
	case ast.IntegerLiteral:
		return Type{TypeInt32}
	case ast.BooleanLiteral:
		return Type{TypeBool}
	case ast.StringLiteral:
		return Type{TypeString}
	case ast.CharacterLiteral:
		return Type{TypeChar}
	case ast.Identifier:
		// existing unknown-id check already emits a diagnostic in AnalyzeExpression;
		// here just look up and return the type or Invalid.
		if !a.FindSymbol(scope, e.Name) {
			return Type{Kind: TypeInvalid}
		}
		sym := a.GetSym(scope, e.Name)
		a.recordRef(e.Position, sym)
		if sym.Kind == SymbolFunction {
			// bare function identifier as a value — not supported yet.
			a.errorAt(e.Position, "function-typed values are not yet supported")
			return Type{Kind: TypeInvalid}
		}
		return sym.Type
	case ast.UnaryExpression:
		return a.typeOfUnary(e, scope)
	case ast.BinaryExpression:
		return a.typeOfBinary(e, scope)
	case ast.FunctionCallExpression:
		return a.typeOfCall(e, scope)
	}
	return Type{Kind: TypeInvalid}
}

func (a *Analyzer) AnalyzeScope(
	block ast.BlockStatement,
	parent *Scope,
) {
	statements := block.Statements
	scope := Scope{
		Parent:  parent,
		Symbols: map[string]Symbol{},
	}

	// Push this block's ScopeNode so nested blocks land underneath it
	// and identifier-resolution sites can be looked up by position.
	pop := a.pushScopeNode(&scope, block.Position, block.End)
	defer pop()

	for _, stmt := range statements {
		switch stmt := stmt.(type) {
		case ast.Comment:
			continue

		case ast.VariableDeclarationStatement:
			a.AnalyzeExpr(stmt.Value, &scope)
			kind := SymbolLocalConst
			if stmt.Mutable {
				kind = SymbolLocalLet
			}
			if a.FindSymbol(&scope, stmt.Name) {
				a.errorAt(
					stmt.Position,
					fmt.Sprintf("use of duplicate identifier: %s", stmt.Name),
				)
				continue
			}

			varType, _ := resolveTypeName(stmt.Type.Name.Name)

			if varType.Kind == TypeInvalid {
				a.errorAt(
					stmt.Position,
					fmt.Sprintf("unknown type: %s", varType.String()),
				)

			} else {
				if stmt.Type.Name.Name != "" {
					varType = a.TypeOf(stmt.Value, &scope)
				}

				if varType.Kind == TypeEmpty {
					varType = a.TypeOf(stmt.Value, &scope)
				}
			}

			scope.AddSymbol(Symbol{
				Name:    stmt.Name,
				Kind:    kind,
				Type:    varType,
				DefPos:  stmt.Position,
				Display: renderBindingDisplay(kind, stmt.Name, varType),
			})

		case ast.IfStatement:
			exprType := a.TypeOf(stmt.Condition, &scope)

			if exprType.Kind != TypeBool {
				a.errorAt(stmt.Condition.Pos(), fmt.Sprintf("condition inside if statement must be boolean, found %s", exprType.String()))
				continue
			}

			a.AnalyzeExpr(stmt.Condition, &scope)
			a.AnalyzeScope(stmt.ThenBlock, &scope)
			a.AnalyzeScope(stmt.ElseBlock, &scope)

		case ast.AssignmentStatement:
			expr := stmt.Value
			a.AnalyzeExpr(expr, &scope)
			if !a.FindSymbol(&scope, stmt.Target.Name) {
				a.errorAt(
					stmt.Target.Position,
					fmt.Sprintf("unknown identifier: %s", stmt.Target.Name),
				)

				break
			}

			symbol := a.GetSym(&scope, stmt.Target.Name)
			a.recordRef(stmt.Target.Position, symbol)

			if symbol.Kind != SymbolLocalLet {
				message := fmt.Sprintf("cannot assign to const: %s", stmt.Target.Name)
				switch symbol.Kind {
				case SymbolFunction:
					message = fmt.Sprintf("cannot assign to function: %s", stmt.Target.Name)
				case SymbolParameter:
					message = fmt.Sprintf("cannot assign to const parameter: %s", stmt.Target.Name)
				}

				a.errorAt(stmt.Target.Position, message)
			}

			if symbol.Type != a.TypeOf(expr, &scope) {
				a.errorAt(stmt.Target.Position, fmt.Sprintf("assignment value type must match the binding type, want %s, received %s", symbol.Type.String(), a.TypeOf(expr, &scope).String()))
			}

		case ast.ReturnStatement:
			// A return outside any function (shouldn't happen at the AST level,
			// but guard anyway) — emit and skip.
			if a.currentFunctionSig == nil {
				a.errorAt(stmt.Position, "return outside of function body")
				continue
			}
			returnTypes := a.currentFunctionSig.ReturnTypes

			checkType := false
			for _, returnType := range returnTypes {
				if returnType.Kind == TypeVoid && len(returnTypes) > 1 {
					checkType = true
					a.errorAt(stmt.Position, "multiple return values cannot be combined with void")
				}
			}

			if checkType {
				continue
			}

			if len(returnTypes) == 1 && returnTypes[0].Kind == TypeVoid {
				returnTypes = returnTypes[:len(returnTypes)-1]
			}

			if len(stmt.Values) != len(returnTypes) {
				a.errorAt(stmt.Position, fmt.Sprintf("return arity mismatch: expected %d, got %d", len(returnTypes), len(stmt.Values)))
				continue
			}

			for i, expr := range stmt.Values {
				a.AnalyzeExpr(expr, &scope)
				exprType := a.TypeOf(expr, &scope)
				if exprType.Kind == TypeInvalid {
					continue
				}

				if exprType != returnTypes[i] {
					a.errorAt(stmt.Position, fmt.Sprintf("mismatched return type for expression, received %s, want %s", exprType.String(), returnTypes[i].String()))
				}
			}

		case ast.ExpressionStatement:
			a.AnalyzeExpr(stmt.Value, &scope)

		case ast.WhileStatement:
			exprType := a.TypeOf(stmt.Condition, &scope)

			if exprType.Kind != TypeBool {
				a.errorAt(stmt.Condition.Pos(), fmt.Sprintf("condition inside if statement must be boolean, found %s", exprType.String()))
				continue
			}

			a.AnalyzeExpr(stmt.Condition, &scope)
			a.AnalyzeScope(stmt.Body, &scope)
		}
	}
}

// blockReturns: is this block guaranteed to hit a `return`?
func blockReturns(block ast.BlockStatement) bool {
	for _, stmt := range block.Statements {
		if statementReturns(stmt) {
			return true
		}
	}
	return false
}

// statementReturns: does control definitely leave the function here?
func statementReturns(stmt ast.Statement) bool {
	switch s := stmt.(type) {
	case ast.ReturnStatement:
		return true
	case ast.IfStatement:
		// Both branches must return. A missing `else` is a BlockStatement
		// with no statements, so blockReturns naturally yields false.
		return blockReturns(s.ThenBlock) && blockReturns(s.ElseBlock)
	case ast.WhileStatement:
		// Conservative: never guarantee. Even `while(true) { return; }`
		// is left out for now — we don't track loop conditions.
		return false
	default:
		return false
	}
}

func (a *Analyzer) AnalyzeFuncDecl(
	decl ast.FunctionDeclaration,
) {
	functionScope := Scope{
		Parent:  a.GlobalScope,
		Symbols: map[string]Symbol{},
	}

	block := decl.Body

	if decl.ReturnTypes[0].Name.Name != "void" && !blockReturns(*block) {
		a.errorAt(block.Position, "all paths must return a value")
	}

	// Function scope's range spans the declaration through the body's
	// closing brace, so the LSP finds parameters when the cursor is
	// anywhere inside the body.
	funcEnd := decl.Position
	if decl.Body != nil {
		funcEnd = decl.Body.End
	}
	pop := a.pushScopeNode(&functionScope, decl.Position, funcEnd)
	defer pop()

	for _, parameter := range decl.Parameters {
		name := parameter.Name.Name
		if _, ok := functionScope.Symbols[name]; ok {
			a.errorAt(
				parameter.Position,
				fmt.Sprintf("use of duplicate identifier: %s", name),
			)
			continue
		}

		paramType, _ := resolveTypeName(parameter.Type.Name.Name)
		functionScope.AddSymbol(Symbol{
			Name:    name,
			Kind:    SymbolParameter,
			Type:    paramType,
			DefPos:  parameter.Name.Position,
			Display: renderBindingDisplay(SymbolParameter, name, paramType),
		})
	}

	if decl.Body != nil {
		// Resolve our own symbol to find the signature recorded in pass 1.
		// Skip body analysis if the name collided with a non-function
		// declaration (e.g. file-scope const with the same name) — pass 1
		// already emitted the duplicate-identifier diagnostic.
		fnSym := a.GetSym(functionScope.Parent, decl.Name)
		if fnSym.Kind != SymbolFunction || fnSym.Signature == nil {
			return
		}
		prev := a.currentFunctionSig
		a.currentFunctionSig = fnSym.Signature
		defer func() { a.currentFunctionSig = prev }()

		a.AnalyzeScope(*decl.Body, &functionScope)
	}
}

func buildSignature(decl ast.FunctionDeclaration) *FunctionSignature {
	sig := &FunctionSignature{
		Parameters:  make([]Type, 0, len(decl.Parameters)),
		ReturnTypes: make([]Type, 0, len(decl.ReturnTypes)),
		ErrorTypes:  make([]Type, 0, len(decl.ErrorTypes)),
	}
	for _, p := range decl.Parameters {
		paramType, _ := resolveTypeName(p.Type.Name.Name)
		sig.Parameters = append(
			sig.Parameters,
			paramType,
		)
	}

	for _, r := range decl.ReturnTypes {
		returnType, _ := resolveTypeName(r.Name.Name)
		sig.ReturnTypes = append(sig.ReturnTypes, returnType)
	}
	for _, e := range decl.ErrorTypes {
		errorType, _ := resolveTypeName(e.Name.Name)
		sig.ErrorTypes = append(sig.ErrorTypes, errorType)
	}

	return sig
}

func renderFunctionDisplay(name string, sig *FunctionSignature) string {
	var b strings.Builder
	b.WriteString("function ")
	b.WriteString(name)
	b.WriteRune('(')
	for i, p := range sig.Parameters {
		if i > 0 {
			b.WriteString(", ")
		}
		b.WriteString(p.String()) // uses Type.String() from phase 5
	}
	b.WriteRune(')')
	if len(sig.ReturnTypes) > 0 {
		b.WriteString(" -> ")
		for i, r := range sig.ReturnTypes {
			if i > 0 {
				b.WriteString(", ")
			}
			b.WriteString(r.String())
		}
	}
	if len(sig.ErrorTypes) > 0 {
		b.WriteString(" | ")
		for i, e := range sig.ErrorTypes {
			if i > 0 {
				b.WriteString(", ")
			}
			b.WriteString(e.String())
		}
	}
	return b.String()
}

func (a *Analyzer) Analyze() {
	// Initialize LSP-facing outputs. RootScope wraps GlobalScope and is the
	// anchor for all child scope nodes created during the walk.
	a.Refs = map[ast.Position]Symbol{}
	a.RootScope = &ScopeNode{Scope: a.GlobalScope}
	a.currentNode = a.RootScope

	decls := a.AST.Declarations
	for _, decl := range decls {
		switch declaration := decl.(type) {
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
			funcSig := buildSignature(declaration)
			funcDisp := renderFunctionDisplay(declaration.Name, funcSig)
			a.GlobalScope.AddSymbol(Symbol{
				Name:      declaration.Name,
				Kind:      SymbolFunction,
				Signature: funcSig,
				DefPos:    declaration.Position,
				Display:   funcDisp,
			})

		case ast.ConstDeclaration:
			if _, ok := a.GlobalScope.Symbols[declaration.Name.Name]; ok {
				a.errorAt(
					declaration.Position,
					fmt.Sprintf("use of duplicate identifier: %s", declaration.Name.Name),
				)
				continue
			}
			varType, _ := resolveTypeName(declaration.Type.Name.Name)
			if declaration.Type.Name.Name == "" {
				varType = a.TypeOf(declaration.Value, a.GlobalScope)
			}
			a.GlobalScope.AddSymbol(Symbol{
				Name:    declaration.Name.Name,
				Kind:    SymbolFileConst,
				Type:    varType,
				DefPos:  declaration.Name.Position,
				Display: renderBindingDisplay(SymbolFileConst, declaration.Name.Name, varType),
			})
		}
	}

	for _, declaration := range decls {
		switch decl := declaration.(type) {
		case ast.Comment:
			continue

		case ast.FunctionDeclaration:
			typeCheckFailed := false
			for _, returnType := range decl.ReturnTypes {
				if _, ok := resolveTypeName(returnType.Name.Name); !ok {
					a.errorAt(returnType.Name.Position, fmt.Sprintf("unknown identifier %s", returnType.Name.Name))
					typeCheckFailed = true
					continue
				}
			}

			for _, param := range decl.Parameters {
				if _, ok := resolveTypeName(param.Type.Name.Name); !ok {
					a.errorAt(param.Name.Position, fmt.Sprintf("unknown identifier %s", param.Type.Name.Name))
					typeCheckFailed = true
					continue
				}
			}

			if typeCheckFailed {
				break
			}

			a.AnalyzeFuncDecl(decl)
		case ast.ConstDeclaration:
			valueType := a.TypeOf(decl.Value, a.GlobalScope)

			if _, ok := resolveTypeName(decl.Type.Name.Name); !ok {
				a.errorAt(decl.Type.Name.Position, fmt.Sprintf("unknown type identifier %s", decl.Type.Name.Name))
				continue
			}

			if decl.Type.Name.Name != valueType.String() {
				a.errorAt(decl.Type.Name.Position, "type mismatch")
				continue
			}

			a.AnalyzeExpr(decl.Value, a.GlobalScope)

		}
	}
}
