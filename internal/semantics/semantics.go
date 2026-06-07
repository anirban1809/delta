package semantics

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
	"fmt"
	"slices"
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
	Parent      *Scope
	Symbols     map[string]Symbol
	assignments []Symbol
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

	// Conversions records every numeric `T(x)` conversion the analyzer
	// resolved (ConvFree or ConvTrap), keyed by the call expression's
	// position, so codegen knows whether to emit a plain cast or a trapping
	// range-check helper.
	Conversions map[ast.Position]ConversionInfo

	// Divisions records every integer `/` and `%` operation, keyed by the
	// binary expression's position, with its operand type. Codegen lowers
	// these to a divisor-checked helper that traps on division/modulo by
	// zero. Float division is not recorded (IEEE defines x/0.0).
	Divisions map[ast.Position]Type

	// Shifts records every `<<` / `>>` operation, keyed by the binary
	// expression's position, with the left-operand type. Codegen lowers
	// these to a helper that traps when the shift count is >= the type's
	// bit width.
	Shifts map[ast.Position]Type

	// IncDecs records every postfix `++` / `--`, keyed by the postfix
	// expression's position, with the operand's integer type. Codegen lowers
	// these to an overflow-checked helper, the same way compound assignment
	// traps on `+=` / `-=`.
	IncDecs map[ast.Position]Type

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
func (a *Analyzer) recordConversion(pos ast.Position, info ConversionInfo) {
	if a.Conversions == nil {
		a.Conversions = map[ast.Position]ConversionInfo{}
	}
	a.Conversions[pos] = info
}

func (a *Analyzer) recordDivision(pos ast.Position, operandType Type) {
	if a.Divisions == nil {
		a.Divisions = map[ast.Position]Type{}
	}
	a.Divisions[pos] = operandType
}

func (a *Analyzer) recordShift(pos ast.Position, leftType Type) {
	if a.Shifts == nil {
		a.Shifts = map[ast.Position]Type{}
	}
	a.Shifts[pos] = leftType
}

func (a *Analyzer) recordIncDec(pos ast.Position, operandType Type) {
	if a.IncDecs == nil {
		a.IncDecs = map[ast.Position]Type{}
	}
	a.IncDecs[pos] = operandType
}

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

// isAssigned reports whether sym has been assigned in this scope or any
// enclosing scope. Assignment lists are filled as the analyzer walks
// statements top-to-bottom, so a binding assigned in an outer block is
// visible to reads in nested blocks (e.g. `x = 5;` in a function body,
// then `return x;` inside an `if`).
func (a *Analyzer) isAssigned(scope *Scope, sym Symbol) bool {
	if slices.Contains(scope.assignments, sym) {
		return true
	}
	if scope.Parent != nil {
		return a.isAssigned(scope.Parent, sym)
	}
	return false
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

func (a *Analyzer) AnalyzeExpr(expr ast.Expression, scope *Scope) bool {
	expression := expr
	switch expression := expression.(type) {
	case ast.Identifier:
		if !a.FindSymbol(scope, expression.Name) {
			a.errorAt(
				expression.Position,
				fmt.Sprintf("unknown identifier: %s", expression.Name),
			)
			return false
		}

		symbol := a.GetSym(scope, expression.Name)
		if symbol.Kind == SymbolLocalLet && !a.isAssigned(scope, symbol) {
			a.errorAt(
				expression.Position,
				fmt.Sprintf("%s is uninitialized", symbol.Name),
			)
			return false
		}

		a.recordRef(expression.Position, a.GetSym(scope, expression.Name))
		return true
	case ast.BinaryExpression:
		leftOK := a.AnalyzeExpr(expression.Left, scope)
		rightOK := a.AnalyzeExpr(expression.Right, scope)
		return leftOK && rightOK
	case ast.UnaryExpression:
		return a.AnalyzeExpr(expression.Expression, scope)

	case ast.PostfixUnaryExpression:
		expr := expression.Operand
		switch i := expr.(type) {
		case ast.Identifier:
			if ok := a.FindSymbol(scope, i.Name); !ok {
				a.errorAt(
					expression.Position,
					fmt.Sprintf("unknown identifier: %s", i.Name),
				)
				return false
			}

			sym := a.GetSym(scope, i.Name)

			if sym.Kind == SymbolLocalConst {
				a.errorAt(
					expression.Position,
					fmt.Sprintf("cannot apply %s operator on const %s", expression.Operator, i.Name),
				)
				return false
			}

			if !sym.Type.IsInteger() {
				a.errorAt(
					expression.Position,
					fmt.Sprintf("operand of %s must be an integer binding, got %s", expression.Operator, sym.Type),
				)
				return false
			}

			a.recordRef(i.Position, sym)
			a.recordIncDec(expression.Position, sym.Type)
		}

	case ast.FunctionCallExpression:

		switch callee := expression.Callee.(type) {
		case ast.Identifier:
			intTypes := []string{"int8", "int16", "int32", "int64"}
			uintTypes := []string{"uint8", "uint16", "uint32", "uint64"}

			if slices.Contains(intTypes, callee.Name) ||
				slices.Contains(uintTypes, callee.Name) ||
				callee.Name == "char" {
				a.GlobalScope.AddSymbol(Symbol{
					Name: callee.Name,
					Kind: SymbolFunction,
					Signature: &FunctionSignature{
						Parameters: []Type{
							{TypeInt32}, //this type is just a placeholder
						},
						ReturnTypes: []Type{
							{TypeInt32}, //this type is just a placeholder
						},
					},
					DefPos:  callee.Position,
					Display: callee.Name,
				})
			}

			calleeSymbol := a.GetSym(scope, callee.Name)

			ok := true
			if calleeSymbol.Kind != SymbolFunction {
				a.errorAt(
					callee.Position,
					fmt.Sprintf("cannot invoke %s, not a callable function.", calleeSymbol.Name),
				)
				ok = false
			}

			if !a.AnalyzeExpr(expression.Callee, scope) {
				ok = false
			}
			for _, argument := range expression.Arguments {
				if !a.AnalyzeExpr(argument, scope) {
					ok = false
				}
			}
			return ok
		default:
			a.errorAt(
				expression.Position,
				"cannot call non-identifier expression: function-typed values are not yet supported",
			)
			return false
		}

	case ast.IntegerLiteral,
		ast.FloatLiteral,
		ast.BooleanLiteral,
		ast.StringLiteral,
		ast.CharacterLiteral:
		return true
	}
	return true
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
		if !operandT.IsInteger() && !operandT.IsFloat() {
			a.errorAt(e.Position, fmt.Sprintf(
				"unary `-` requires numeric operand, got %s", operandT))
			return Type{Kind: TypeInvalid}
		}
		return Type{operandT.Kind}

	case "~":
		if !operandT.IsInteger() {
			a.errorAt(e.Position, fmt.Sprintf(
				"unary `~` requires integer operand, got %s", operandT))
			return Type{Kind: TypeInvalid}
		}
		return Type{operandT.Kind}
	}

	a.errorAt(e.Position, fmt.Sprintf("unknown unary operator %q", e.Operator))
	return Type{Kind: TypeInvalid}
}

func isIntegerLiteral(expr ast.Expression) bool {
	switch expr.(type) {
	case ast.IntegerLiteral:
		return true
	}

	return false
}

func isFloatLiteral(expr ast.Expression) bool {
	switch expr.(type) {
	case ast.FloatLiteral:
		return true
	}

	return false
}

// isNumeric reports whether a type participates in arithmetic and ordered
// comparisons — any integer or floating-point type.
func isNumeric(t Type) bool {
	return t.IsInteger() || t.IsFloat()
}

// isComparable reports whether a type supports ordered comparison
// (`< <= > >=`): any numeric type or char (compared by code point).
func isComparable(t Type) bool {
	return isNumeric(t) || t.Kind == TypeChar
}

// typeOfBinary returns the type of a binary expression. Operand types are
// computed first; if either is TypeInvalid, propagate it silently.
func (a *Analyzer) typeOfBinary(e ast.BinaryExpression, scope *Scope) Type {
	leftT := a.TypeOf(e.Left, scope)
	rightT := a.TypeOf(e.Right, scope)

	if (leftT.IsInteger() && rightT.IsInteger()) && isIntegerLiteral(e.Left) &&
		!isIntegerLiteral(e.Right) {
		leftT = rightT
	}

	if (leftT.IsInteger() && rightT.IsInteger()) && !isIntegerLiteral(e.Left) &&
		isIntegerLiteral(e.Right) {
		rightT = leftT
	}

	if (leftT.IsFloat() && rightT.IsFloat()) && isFloatLiteral(e.Left) &&
		!isFloatLiteral(e.Right) {
		leftT = rightT
	}

	if (leftT.IsFloat() && rightT.IsFloat()) && !isFloatLiteral(e.Left) &&
		isFloatLiteral(e.Right) {
		rightT = leftT
	}

	if leftT != rightT {
		a.errorAt(
			e.Position,
			fmt.Sprintf(
				"incompatibe types in expression: %s and %s",
				leftT.String(),
				rightT.String(),
			),
		)
		return Type{TypeInvalid}
	}

	if leftT.Kind == TypeInvalid || rightT.Kind == TypeInvalid {
		return Type{Kind: TypeInvalid}
	}

	switch e.Operator {
	case "+", "-", "*", "/":
		if !isNumeric(leftT) || !isNumeric(rightT) ||
			leftT.Kind != rightT.Kind {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires matching numeric operands, got %s and %s",
				e.Operator,
				leftT,
				rightT,
			))

			return Type{Kind: TypeInvalid}
		}

		if e.Operator == "/" && leftT.IsInteger() {
			a.recordDivision(e.Position, leftT)
		}

		return Type{leftT.Kind}

	case "%":
		// Unlike the other arithmetic operators, `%` is integer-only: C's `%`
		// is not defined for floating-point operands (that would need fmod).
		if !leftT.IsInteger() || !rightT.IsInteger() ||
			leftT.Kind != rightT.Kind {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires matching integer operands, got %s and %s",
				e.Operator,
				leftT,
				rightT,
			))
			return Type{Kind: TypeInvalid}
		}

		a.recordDivision(e.Position, leftT)
		return Type{leftT.Kind}

	case "&", "|", "^":
		// Bitwise operators are integer-only (no float, no bool) and yield
		// the shared operand type.
		if !leftT.IsInteger() || !rightT.IsInteger() ||
			leftT.Kind != rightT.Kind {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires matching integer operands, got %s and %s",
				e.Operator,
				leftT,
				rightT,
			))
			return Type{Kind: TypeInvalid}
		}
		return Type{leftT.Kind}

	case "<<", ">>":
		// Shifts are integer-only. The result takes the left operand's type;
		// the count need not share that type. Recorded so codegen can emit a
		// helper that traps when the count is out of range.
		if !leftT.IsInteger() || !rightT.IsInteger() {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires integer operands, got %s and %s",
				e.Operator,
				leftT,
				rightT,
			))
			return Type{Kind: TypeInvalid}
		}
		a.recordShift(e.Position, leftT)
		return Type{leftT.Kind}

	case "<", "<=", ">", ">=":
		if !isComparable(leftT) || !isComparable(rightT) ||
			leftT.Kind != rightT.Kind {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires matching numeric or char operands, got %s and %s",
				e.Operator,
				leftT,
				rightT,
			))
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
		if !isNumeric(leftT) && leftT.Kind != TypeBool &&
			leftT.Kind != TypeChar {
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

	// `T(x)` numeric conversions are parsed as calls but are not real
	// functions — the callee is a type name registered with a placeholder
	// signature. Recognize and lower them here instead of running the
	// parameter-matching path: the argument type is *meant* to differ from
	// the target, and narrowing / sign-flipping forms are accepted and
	// range-checked at runtime rather than rejected.
	if target, isType := ResolveTypeName(ident.Name); isType &&
		(target.IsInteger() || target.Kind == TypeChar) {
		return a.typeOfConversion(e, target, scope)
	}

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

// typeOfConversion type-checks and records a numeric `T(x)` conversion. Any
// numeric argument is accepted: narrowing and sign-flipping forms are not
// errors — they are recorded as ConvTrap so codegen emits a runtime range
// check (per spec §5, explicit casts trap on out-of-range, they don't fail to
// compile). Only a non-numeric argument or wrong arity is a compile error.
// In expression position a conversion has the target type.
func (a *Analyzer) typeOfConversion(
	e ast.FunctionCallExpression,
	target Type,
	scope *Scope,
) Type {
	// typeOfCall has already established the callee is an identifier.
	ident := e.Callee.(ast.Identifier)

	if len(e.Arguments) != 1 {
		a.errorAt(e.Position, fmt.Sprintf(
			"conversion %s expects 1 argument, got %d",
			ident.Name, len(e.Arguments)))
		for _, arg := range e.Arguments {
			a.TypeOf(arg, scope)
		}
		return target
	}

	argT := a.TypeOf(e.Arguments[0], scope)
	if argT.Kind == TypeInvalid {
		return target
	}

	switch kind := ClassifyConversion(argT, target); kind {
	case ConvForbidden:
		a.errorAt(e.Position, fmt.Sprintf(
			"conversion from %s to %s is not allowed", argT, target))
	default:
		a.recordConversion(e.Position, ConversionInfo{
			From: argT,
			To:   target,
			Kind: kind,
		})
	}

	return target
}

func (a *Analyzer) TypeOf(expr ast.Expression, scope *Scope) Type {
	switch e := expr.(type) {
	case ast.IntegerLiteral:
		return Type{TypeInt32}
	case ast.FloatLiteral:
		return Type{TypeFloat64}
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
	case ast.PostfixUnaryExpression:
		return a.TypeOf(e.Operand, scope)
	case ast.FunctionCallExpression:
		return a.typeOfCall(e, scope)
	}
	return Type{Kind: TypeInvalid}
}

func (a *Analyzer) AnalyzeVarDecl(
	decl ast.VariableDeclarationStatement,
	scope *Scope,
) bool {
	a.AnalyzeExpr(decl.Value, scope)
	kind := SymbolLocalConst
	if decl.Mutable {
		kind = SymbolLocalLet
	}
	if a.FindSymbol(scope, decl.Name) {
		a.errorAt(
			decl.Position,
			fmt.Sprintf("use of duplicate identifier: %s", decl.Name),
		)
		return false
	}

	varType, _ := ResolveTypeName(decl.Type.Name.Name)

	if varType.Kind == TypeInvalid {
		a.errorAt(
			decl.Position,
			fmt.Sprintf("unknown type: %s", decl.Type.Name.Name),
		)
	}

	if varType.Kind == TypeEmpty {
		varType = a.TypeOf(decl.Value, scope)
	}

	if decl.Value == nil {
		scope.AddSymbol(Symbol{
			Name:    decl.Name,
			Kind:    kind,
			Type:    varType,
			DefPos:  decl.Position,
			Display: renderBindingDisplay(kind, decl.Name, varType),
		})

		return true
	}

	if !isIntegerLiteral(decl.Value) && !isFloatLiteral(decl.Value) {
		typeLeft := varType
		typeRight := a.TypeOf(decl.Value, scope)

		if typeLeft != typeRight {
			return false
		}
	}

	symbol := Symbol{
		Name:    decl.Name,
		Kind:    kind,
		Type:    varType,
		DefPos:  decl.Position,
		Display: renderBindingDisplay(kind, decl.Name, varType),
	}

	scope.assignments = append(scope.assignments, symbol)
	scope.AddSymbol(symbol)

	return true
}

func (a *Analyzer) AnalyzeScope(
	block ast.BlockStatement,
	parent *Scope,
) []Symbol {
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
			if ok := a.AnalyzeVarDecl(stmt, &scope); !ok {
				continue
			}

		case ast.IfStatement:
			exprType := a.TypeOf(stmt.Condition, &scope)

			if exprType.Kind != TypeBool {
				a.errorAt(stmt.Condition.Pos(), fmt.Sprintf("condition inside if statement must be boolean, found %s", exprType.String()))
				continue
			}

			a.AnalyzeExpr(stmt.Condition, &scope)
			thenAssigned := a.AnalyzeScope(stmt.ThenBlock, &scope)
			elseAssigned := a.AnalyzeScope(stmt.ElseBlock, &scope)

			// Definite-assignment join: a binding is assigned after the
			// `if` only if every path that flows past it assigned it. A
			// branch that always returns never reaches the code following
			// the `if`, so it doesn't constrain the join (contributes ⊤).
			switch {
			case blockReturns(stmt.ThenBlock) && blockReturns(stmt.ElseBlock):
				// No path flows past the if; nothing to propagate.
			case blockReturns(stmt.ThenBlock):
				scope.assignments = append(scope.assignments, elseAssigned...)
			case blockReturns(stmt.ElseBlock):
				scope.assignments = append(scope.assignments, thenAssigned...)
			default:
				scope.assignments = append(scope.assignments,
					intersectAssignments(thenAssigned, elseAssigned)...)
			}

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
			scope.assignments = append(scope.assignments, symbol)

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

			if stmt.Operator != "" && !symbol.Type.IsInteger() {
				a.errorAt(stmt.Target.Position, fmt.Sprintf(
					"compound assignment `%s=` requires an integer binding, got %s",
					stmt.Operator, symbol.Type))
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

				switch expr.(type) {
				case ast.IntegerLiteral:
					if exprType.Kind == TypeEmpty {
						exprType = Type{TypeInt32}
					}
				}

				if exprType.Kind == TypeInvalid {
					continue
				}

				if exprType != returnTypes[i] {
					a.errorAt(stmt.Position, fmt.Sprintf("mismatched return type for expression, received %s, want %s", exprType.String(), returnTypes[i].String()))
				}
			}

		case ast.ExpressionStatement:
			a.AnalyzeExpr(stmt.Value, &scope)

		case ast.SwitchStatement:
			scrutinee := stmt.Scrutinee

			if ok := a.AnalyzeExpr(scrutinee, &scope); !ok {
				continue
			}

			scrutineeType := a.TypeOf(scrutinee, &scope)
			scrutineeT := scrutineeType.String()
			if !strings.Contains(scrutineeT, "int") && !(scrutineeT == "char") {
				a.errorAt(scrutinee.Pos(), fmt.Sprintf("type of scrutinee must be int or char, received %s", scrutineeT))
				continue
			}

			caseLabels := []ast.Expression{}

			for _, c := range stmt.Cases {
				for _, l := range c.Labels {
					caseLabels = append(caseLabels, l)
				}
			}

			seen := make(map[string]struct{})
			dup := false

			var dupPos ast.Position
			for _, l := range caseLabels {

				lT := a.TypeOf(l, &scope)
				// A bare integer-literal label adopts the scrutinee's integer
				// type, mirroring integer-literal coercion in binary
				// expressions. Negative labels (UnaryExpression) and char
				// labels are not coerced.
				if isIntegerLiteral(l) && scrutineeType.IsInteger() {
					lT = scrutineeType
				}
				if scrutineeT != lT.String() {
					a.errorAt(l.Pos(), fmt.Sprintf("incompatible type in case, want %s, got %s", scrutineeT, lT.String()))
					break
				}

				var key string
				switch lit := l.(type) {
				case ast.IntegerLiteral:
					if !strings.Contains(scrutineeT, "int") {
						break
					}

					key = "int:" + lit.Value
				case ast.CharacterLiteral:
					if !strings.Contains(scrutineeT, "char") {
						break
					}

					key = "char:" + lit.Value
				default:
					continue
				}
				if _, exists := seen[key]; exists {
					dupPos = l.Pos()
					dup = true
					break
				}
				seen[key] = struct{}{}
			}

			if dup {
				a.errorAt(dupPos, "duplicate case label detected")
				continue
			}

		case ast.ForStatement:
			decl := stmt.Init.(ast.VariableDeclarationStatement)
			if ok := a.AnalyzeVarDecl(decl, &scope); !ok {
				continue
			}

			if !decl.Mutable && decl.Name != "" {
				a.errorAt(stmt.Init.Pos(), "const is not allowed in the for loop initializer, use let instead")
				continue
			}

			if stmt.Cond != nil {
				condType := a.TypeOf(stmt.Cond, &scope)
				if condType.Kind != TypeBool {
					a.errorAt(stmt.Cond.Pos(), fmt.Sprintf("condition inside if statement must be boolean, found %s", condType.String()))
					continue
				}
			}

			// The step runs once per iteration; analyze it so `i++` is
			// validated and recorded for overflow-trapping codegen.
			if stmt.Step != nil {
				a.AnalyzeExpr(stmt.Step, &scope)
			}

			a.AnalyzeScope(*stmt.Body, &scope)

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

	return scope.assignments
}

// intersectAssignments returns the bindings assigned in both branch lists.
// At an if/else join a binding is definitely assigned afterward only if
// every branch assigned it, so the surviving set is the intersection.
func intersectAssignments(then, els []Symbol) []Symbol {
	var out []Symbol
	for _, s := range then {
		if slices.Contains(els, s) {
			out = append(out, s)
		}
	}
	return out
}

// blockReturns: is this block guaranteed to hit a `return`?
func blockReturns(block ast.BlockStatement) bool {
	return slices.ContainsFunc(block.Statements, statementReturns)
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

	case ast.ForStatement:
		return blockReturns(*s.Body)

	case ast.SwitchStatement:
		returns := true
		for _, c := range s.Cases {
			if !blockReturns(*c.Body) {
				returns = false
				break
			}
		}

		if !returns {
			return false
		} else {
			return blockReturns(*s.Default.Body)
		}
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

	if len(decl.ReturnTypes) > 0 && decl.ReturnTypes[0].Name.Name != "void" &&
		!blockReturns(*block) {
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

		paramType, _ := ResolveTypeName(parameter.Type.Name.Name)
		symbol := Symbol{
			Name:    name,
			Kind:    SymbolParameter,
			Type:    paramType,
			DefPos:  parameter.Name.Position,
			Display: renderBindingDisplay(SymbolParameter, name, paramType),
		}
		functionScope.AddSymbol(symbol)
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
		paramType, _ := ResolveTypeName(p.Type.Name.Name)
		sig.Parameters = append(
			sig.Parameters,
			paramType,
		)
	}

	for _, r := range decl.ReturnTypes {
		returnType, _ := ResolveTypeName(r.Name.Name)
		sig.ReturnTypes = append(sig.ReturnTypes, returnType)
	}
	for _, e := range decl.ErrorTypes {
		errorType, _ := ResolveTypeName(e.Name.Name)
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
	a.Conversions = map[ast.Position]ConversionInfo{}
	a.Divisions = map[ast.Position]Type{}
	a.Shifts = map[ast.Position]Type{}
	a.IncDecs = map[ast.Position]Type{}
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
			varType, _ := ResolveTypeName(declaration.Type.Name.Name)
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
				if _, ok := ResolveTypeName(returnType.Name.Name); !ok {
					a.errorAt(returnType.Name.Position, fmt.Sprintf("unknown identifier %s", returnType.Name.Name))
					typeCheckFailed = true
					continue
				}
			}

			for _, param := range decl.Parameters {
				if _, ok := ResolveTypeName(param.Type.Name.Name); !ok {
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

			if _, ok := ResolveTypeName(decl.Type.Name.Name); !ok {
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
