package semantics

import (
	"fmt"
	"slices"
	"strings"

	"delta/internal/ast"
	"delta/internal/diagnostics"
)

type SymbolKind int

const (
	SymbolFunction SymbolKind = iota
	SymbolFileConst
	SymbolParameter
	SymbolReturn
	SymbolError
	SymbolLocalConst
	SymbolLocalLet
	SymbolTypeDecl
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
	results     map[string]*pendingResult
	pending     map[string]*pendingResult
}

type pendingResult struct {
	Name     string
	Position ast.Position
	Bindings []string
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

	// Records maps each user-defined record type name to its fully
	// resolved field list — alias targets followed, spread/intersection
	// composition flattened. Populated at the end of Analyze() and consumed
	// by LSP field completion ("show me the fields of this record-typed
	// value"). Unlike the maps below, it holds resolved fields, not raw AST.
	Records map[string][]ResolvedRecordField

	// contains all the custom record type declarations
	recordTypes map[string]ast.RecordRHS

	// contains all the custom record alias declarations
	aliasRecordTypes map[string]ast.AliasRHS

	// contains all the custom record composition declarations
	compRecordTypes map[string]ast.CompositionRHS

	// to keep track of what type declarations have been initialized.
	typeInits map[string]ast.ObjectLiteralExpression

	// tracks the symbols of fallible functions for validation metadata
	fallibleFunctions map[string]Symbol

	// allowFallibleExpr is set while analyzing the inner statement of an
	// `as result` form. A fallible call anywhere else is rejected.
	allowFallibleExpr bool
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

func (a *Analyzer) isFunctionFallible(sym Symbol) bool {
	return sym.Kind == SymbolFunction &&
		sym.Signature != nil &&
		len(sym.Signature.ErrorTypes) > 0
}

func (a *Analyzer) pendingBinding(
	scope *Scope,
	name string,
) (*pendingResult, bool) {
	for current := scope; current != nil; current = current.Parent {
		if result, ok := current.pending[name]; ok {
			return result, true
		}
	}
	return nil, false
}

func (a *Analyzer) pendingResult(
	scope *Scope,
	name string,
) (*Scope, *pendingResult, bool) {
	for current := scope; current != nil; current = current.Parent {
		if result, ok := current.results[name]; ok {
			return current, result, true
		}
	}
	return nil, nil, false
}

func (a *Analyzer) expressionCanFail(
	expr ast.Expression,
	scope *Scope,
) bool {
	switch expr := expr.(type) {
	case ast.FunctionCallExpression:
		if ident, ok := expr.Callee.(ast.Identifier); ok {
			if target, isType := ResolveTypeName(ident.Name); isType &&
				(target.IsInteger() || target.Kind == TypeChar) {
				if len(expr.Arguments) != 1 {
					return false
				}
				from := a.TypeOf(expr.Arguments[0], scope)
				return ClassifyConversion(from, target) == ConvTrap
			}
			return a.isFunctionFallible(a.GetSym(scope, ident.Name))
		}
	case ast.BinaryExpression:
		left := a.TypeOf(expr.Left, scope)
		switch expr.Operator {
		case "+", "-", "*":
			return left.IsInteger()
		case "/", "%", "<<", ">>":
			return left.IsInteger()
		}
	case ast.PostfixUnaryExpression:
		return a.TypeOf(expr.Operand, scope).IsInteger()
	}
	return false
}

func fallibleInnerExpression(stmt ast.Statement) ast.Expression {
	switch stmt := stmt.(type) {
	case ast.VariableDeclarationStatement:
		return stmt.Value
	case ast.AssignmentStatement:
		return stmt.Value
	case ast.ExpressionStatement:
		return stmt.Value
	}
	return nil
}

func fallibleBindings(stmt ast.Statement) []string {
	switch stmt := stmt.(type) {
	case ast.VariableDeclarationStatement:
		return []string{stmt.Name}
	case ast.AssignmentStatement:
		return []string{stmt.Target.Name}
	}
	return nil
}

func blockDiverges(block ast.BlockStatement) bool {
	for _, stmt := range block.Statements {
		if statementDiverges(stmt) {
			return true
		}
	}
	return false
}

func statementDiverges(stmt ast.Statement) bool {
	switch stmt := stmt.(type) {
	case ast.ReturnStatement, ast.BreakStatement, ast.ContinueStatement:
		return true
	case ast.IfStatement:
		return blockDiverges(stmt.ThenBlock) &&
			blockDiverges(stmt.ElseBlock)
	case ast.SwitchStatement:
		if stmt.Default == nil || !blockDiverges(*stmt.Default.Body) {
			return false
		}
		for _, c := range stmt.Cases {
			if !blockDiverges(*c.Body) {
				return false
			}
		}
		return true
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

	case ast.MemberAccessExpression:
		receiver := expression.Receiver
		a.AnalyzeExpr(receiver, scope)
		member := expression.Member
		recvT := a.TypeOf(receiver, scope)

		if recvT.Kind != TypeCustom {
			a.errorAt(receiver.Pos(), fmt.Sprintf("field %s does not exist on type %s", member, recvT.String()))
		}

	case ast.ObjectLiteralExpression:
		elements := expression.Elements
		for _, element := range elements {
			switch e := element.(type) {
			case ast.FieldInit:
				if ok := a.AnalyzeExpr(e.Value, scope); !ok {
					continue
				}
			}
		}

	case ast.Identifier:
		if !a.FindSymbol(scope, expression.Name) {
			a.errorAt(
				expression.Position,
				fmt.Sprintf("unknown identifier: %s", expression.Name),
			)
			return false
		}

		if result, ok := a.pendingBinding(scope, expression.Name); ok {
			a.errorAt(
				expression.Position,
				fmt.Sprintf(
					"%s is pending from `as %s`; check %s before reading it",
					expression.Name,
					result.Name,
					result.Name,
				),
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
							{Name: "int32", Kind: TypeInt32}, // this type is just a placeholder
						},
						ReturnTypes: []Type{
							{Name: "int32", Kind: TypeInt32}, // this type is just a placeholder
						},
					},
					DefPos:  callee.Position,
					Display: callee.Name,
				})
			}

			calleeSymbol := a.GetSym(scope, callee.Name)

			ok := true
			if calleeSymbol.Kind != SymbolFunction && !calleeSymbol.Type.IsInteger() {
				a.errorAt(
					callee.Position,
					fmt.Sprintf("cannot invoke %s, not a callable function.", calleeSymbol.Name),
				)
				ok = false
			}
			if a.isFunctionFallible(calleeSymbol) &&
				!a.allowFallibleExpr {
				a.errorAt(
					expression.Position,
					fmt.Sprintf(
						"fallible call to %s must be followed by `as result`",
						callee.Name,
					),
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
		return Type{Name: "<invalid>", Kind: TypeInvalid}
	}

	switch e.Operator {
	case "!":
		if operandT.Kind != TypeBool {
			a.errorAt(e.Position, fmt.Sprintf(
				"unary `!` requires bool operand, got %s", operandT,
			))
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}
		return Type{Name: "bool", Kind: TypeBool}

	case "-":
		if !operandT.IsInteger() && !operandT.IsFloat() {
			a.errorAt(e.Position, fmt.Sprintf(
				"unary `-` requires numeric operand, got %s", operandT,
			))
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}
		return operandT

	case "~":
		if !operandT.IsInteger() {
			a.errorAt(e.Position, fmt.Sprintf(
				"unary `~` requires integer operand, got %s", operandT,
			))
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}
		return operandT
	}

	a.errorAt(e.Position, fmt.Sprintf("unknown unary operator %q", e.Operator))
	return Type{Name: "<invalid>", Kind: TypeInvalid}
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

	if leftT.Kind == TypeInvalid || rightT.Kind == TypeInvalid {
		return Type{Name: "<invalid>", Kind: TypeInvalid}
	}

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
		return Type{Name: "<invalid>", Kind: TypeInvalid}
	}

	if leftT.Kind == TypeInvalid || rightT.Kind == TypeInvalid {
		return Type{Name: "<invalid>", Kind: TypeInvalid}
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

			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}

		if e.Operator == "/" && leftT.IsInteger() {
			a.recordDivision(e.Position, leftT)
		}

		return leftT

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
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}

		a.recordDivision(e.Position, leftT)
		return leftT

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
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}
		return leftT

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
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}
		a.recordShift(e.Position, leftT)
		return leftT

	case "<", "<=", ">", ">=":
		if leftT.Kind == TypeCustom || rightT.Kind == TypeCustom {
			a.errorAt(e.Position, fmt.Sprintf(
				"types %s and %s are non-comparable",
				leftT,
				rightT,
			))
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}

		if !isComparable(leftT) || !isComparable(rightT) ||
			leftT.Kind != rightT.Kind {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires matching numeric or char operands, got %s and %s",
				e.Operator,
				leftT,
				rightT,
			))
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}
		return Type{Name: "bool", Kind: TypeBool}

	case "==", "!=":

		if leftT.Kind == TypeCustom || rightT.Kind == TypeCustom {
			return Type{Name: "bool", Kind: TypeBool}
		}

		if leftT.Kind != rightT.Kind {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires operands of the same type, got %s and %s",
				e.Operator,
				leftT,
				rightT,
			))
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}
		if !isNumeric(leftT) && leftT.Kind != TypeBool &&
			leftT.Kind != TypeChar {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` is not defined for type %s", e.Operator, leftT,
			))
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}
		return Type{Name: "bool", Kind: TypeBool}

	case "&&", "||":
		if leftT.Kind != TypeBool || rightT.Kind != TypeBool {
			a.errorAt(e.Position, fmt.Sprintf(
				"operator `%s` requires bool operands, got %s and %s",
				e.Operator, leftT, rightT,
			))
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}
		return Type{Name: "bool", Kind: TypeBool}
	}

	a.errorAt(e.Position, fmt.Sprintf("unknown binary operator %q", e.Operator))
	return Type{Name: "<invalid>", Kind: TypeInvalid}
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
		return Type{Name: "<invalid>", Kind: TypeInvalid}
	}

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

	if !a.FindSymbol(scope, ident.Name) {
		a.errorAt(ident.Position,
			fmt.Sprintf("unknown identifier: %s", ident.Name))
		return Type{Name: "<invalid>", Kind: TypeInvalid}
	}

	sym := a.GetSym(scope, ident.Name)
	a.recordRef(ident.Position, sym)
	if sym.Kind != SymbolFunction || sym.Signature == nil {
		a.errorAt(ident.Position, fmt.Sprintf(
			"cannot invoke %s, not a callable function", ident.Name,
		))
		for _, arg := range e.Arguments {
			a.TypeOf(arg, scope)
		}
		return Type{Name: "<invalid>", Kind: TypeInvalid}
	}

	sig := sym.Signature

	// Arity: report once, but still type-check overlapping positions so
	// arg-type errors don't get hidden behind the arity error.
	if len(e.Arguments) != len(sig.Parameters) {
		a.errorAt(e.Position, fmt.Sprintf(
			"function %s expects %d argument(s), got %d",
			ident.Name, len(sig.Parameters), len(e.Arguments),
		))
	}

	for i, arg := range e.Arguments {
		argT := a.TypeOf(arg, scope)
		if i >= len(sig.Parameters) {
			continue
		}
		want := sig.Parameters[i]

		switch t := arg.(type) {
		case ast.ObjectLiteralExpression:
			if !a.verifyObjectType(want, t, scope) {
				continue
			}
		}

		if want.Kind == TypeInvalid || argT.Kind == TypeInvalid {
			continue
		}

		if want.Kind != argT.Kind {
			validIntConv := want.IsInteger() && argT.IsInteger() &&
				want.BitWidth() > argT.BitWidth()
			if validIntConv {
				continue
			}

			a.errorAt(e.Position, fmt.Sprintf(
				"argument %d of %s: expected %s, got %s",
				i+1, ident.Name, want, argT,
			))
		}
	}

	// Return type in expression position:
	//   0 declared returns       → void
	//   1 declared return        → that type (with declared `void` collapsing to void)
	//   2+ declared returns      → reject in expression position
	switch len(sig.ReturnTypes) {
	case 0:
		return Type{Name: "void", Kind: TypeVoid}
	case 1:
		if sig.ReturnTypes[0].Kind == TypeVoid {
			return Type{Name: "void", Kind: TypeVoid}
		}
		return sig.ReturnTypes[0]
	default:
		a.errorAt(e.Position,
			"multi-return call cannot be used in expression position")
		return Type{Name: "<invalid>", Kind: TypeInvalid}
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
			ident.Name, len(e.Arguments),
		))
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
			"conversion from %s to %s is not allowed", argT, target,
		))
	default:
		a.recordConversion(e.Position, ConversionInfo{
			From: argT,
			To:   target,
			Kind: kind,
		})
	}

	return target
}

// TODO : refactor the complexity
func (a *Analyzer) convertCompToRecord(
	c ast.CompositionRHS,
	scope *Scope,
) (ast.RecordRHS, bool) {
	fields := make([]ast.RecordField, 0)
	for _, operand := range c.Operands {
		if operand.Named != nil {
			ident := operand.Named.Name.Name
			s := a.GetSym(scope, ident)
			if s.Kind == SymbolTypeDecl {
				r, ok := a.recordTypes[s.Name]
				if !ok {
					aT, ok := a.aliasRecordTypes[s.Name]
					if !ok {
						cT, ok := a.compRecordTypes[s.Name]
						if !ok {
							a.errorAt(
								operand.Named.Name.Position,
								fmt.Sprintf("invalid type %s", ident),
							)
							return ast.RecordRHS{}, false
						}
						return a.convertCompToRecord(cT, scope)
					}
					r = a.recordTypes[aT.Target.Name.Name]
					fields = append(fields, r.Fields...)
					continue
				}
				fields = append(fields, r.Fields...)
				continue
			}
		}

		if operand.Inline == nil {
			continue
		}
		fields = append(fields, operand.Inline.Fields...)
	}
	return ast.RecordRHS{
		Position: c.Position,
		Fields:   fields,
	}, true
}

func (a *Analyzer) typeOfMemberAccessExpr(
	e ast.MemberAccessExpression,
	scope *Scope,
) Type {
	recv := e.Receiver
	member := e.Member

	switch recv := recv.(type) {
	case ast.Identifier:
		s := a.GetSym(scope, recv.Name)
		sT, ok := a.recordTypes[s.Type.Name]

		if !ok {
			if aT, ok := a.aliasRecordTypes[s.Type.Name]; ok {
				sT = a.recordTypes[aT.Target.Name.Name]
			} else {
				if cT, ok := a.compRecordTypes[s.Type.Name]; !ok {
					a.errorAt(recv.Position, "invalid type")
					return Type{Name: "invalid", Kind: TypeInvalid}
				} else {
					if sT, ok = a.convertCompToRecord(cT, scope); !ok {
						return Type{Name: "invalid", Kind: TypeInvalid}
					}
				}
			}
		}

		validMember := false
		for _, m := range sT.Fields {
			if member == m.Name.Name {
				kind, _ := ResolveTypeName(m.Type.Name.Name)
				validMember = true
				return Type{Name: m.Type.Name.Name, Kind: kind.Kind}
			}
		}

		if !validMember {
			a.errorAt(e.Position, fmt.Sprintf("member %s is not available on type %s", member, s.Type.Name))
		}

	case ast.MemberAccessExpression:
		return a.typeOfMemberAccessExpr(recv, scope)
	}

	return Type{Name: "invalid", Kind: TypeInvalid}
}

func (a *Analyzer) TypeOf(expr ast.Expression, scope *Scope) Type {
	switch e := expr.(type) {
	case ast.IntegerLiteral:
		return Type{Name: "int32", Kind: TypeInt32}
	case ast.FloatLiteral:
		return Type{Name: "float64", Kind: TypeFloat64}
	case ast.BooleanLiteral:
		return Type{Name: "bool", Kind: TypeBool}
	case ast.StringLiteral:
		return Type{Name: "string", Kind: TypeString}
	case ast.CharacterLiteral:
		return Type{Name: "char", Kind: TypeChar}
	case ast.Identifier:
		// existing unknown-id check already emits a diagnostic in AnalyzeExpression;
		// here just look up and return the type or Invalid.
		if !a.FindSymbol(scope, e.Name) {
			return Type{Name: "<invalid>", Kind: TypeInvalid}
		}
		sym := a.GetSym(scope, e.Name)
		a.recordRef(e.Position, sym)
		if sym.Kind == SymbolFunction {
			// bare function identifier as a value — not supported yet.
			a.errorAt(e.Position, "function-typed values are not yet supported")
			return Type{Name: "<invalid>", Kind: TypeInvalid}
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
	case ast.MemberAccessExpression:
		return a.typeOfMemberAccessExpr(e, scope)
	}
	return Type{Name: "<invalid>", Kind: TypeInvalid}
}

func (a *Analyzer) AnalyzeVarDecl(
	decl ast.VariableDeclarationStatement,
	scope *Scope,
) bool {
	a.AnalyzeExpr(decl.Value, scope)

	// set kind
	kind := SymbolLocalConst
	if decl.Mutable {
		kind = SymbolLocalLet
	}

	// check if the symbol is valid
	if a.FindSymbol(scope, decl.Name) {
		a.errorAt(
			decl.Position,
			fmt.Sprintf("use of duplicate identifier: %s", decl.Name),
		)
		return false
	}

	// resolve type names for symbol
	varType, _ := ResolveTypeName(decl.Type.Name.Name)

	objValue, ok := decl.Value.(ast.ObjectLiteralExpression)
	objectValueToVerify := objValue

	if (varType.Kind == TypeEmpty) && ok {
		a.errorAt(
			decl.Position,
			"no typed context available for object literal",
		)
		return false
	}

	// verify type if expr is an ObjectLiteralExpression
	if ok && a.verifyObjectType(varType, objectValueToVerify, scope) {
		// keep track of all record type initializations
		a.typeInits[decl.Name] = objValue
	}

	// verify all the fields of the record type
	for _, e := range objValue.Elements {
		switch e := e.(type) {
		case ast.SpreadElement:
			src := e.Source.(ast.Identifier)
			elemT := a.TypeOf(e.Source, scope)

			if elemT.String() != decl.Type.Name.Name {
				a.errorAt(e.Source.Pos(), fmt.Sprintf("type mismatch for spread operation, want %s, got %s", elemT.String(), decl.Type.Name.Name))
				return false
			}

			// not sure what this does, verify if this is needed
			obj := a.typeInits[src.Name]
			objValue.Elements = append(objValue.Elements, obj.Elements...)
		}
	}

	// validating if the decl type is a valid record type
	if varType.Kind == TypeInvalid {
		sym := a.GetSym(scope, decl.Type.Name.Name)
		if sym.Kind == SymbolTypeDecl {
			varType = Type{Kind: TypeCustom, Name: decl.Type.Name.Name}
		} else {
			a.errorAt(
				decl.Type.Name.Position,
				fmt.Sprintf("unknown type: %s", decl.Type.Name.Name),
			)
		}
	}

	// for inferring the types if not annotated
	if varType.Kind == TypeEmpty {
		varType = a.TypeOf(decl.Value, scope)
	}

	// create and add the symbol to the registry
	symbol := Symbol{
		Name: decl.Name,
		Kind: kind,
		Type: varType,
		DefPos: ast.Position{
			Line: decl.Position.Line,
			Column: decl.Position.Column + func() int {
				if decl.Mutable {
					return len("let ")
				}
				return len("const ")
			}(),
		},
		Display: renderBindingDisplay(kind, decl.Name, varType),
	}
	scope.AddSymbol(symbol)

	// no need to add to assignments if the value is not initialized yet
	if decl.Value == nil {
		return true
	}

	// recording the assignment of the symbol, to check later if they already have been assigned.
	scope.assignments = append(scope.assignments, symbol)
	return true
}

// helper for the verifyObjectType function
func fieldExistsInRecord(
	field string,
	record ast.ObjectLiteralExpression,
) bool {
	exists := false
	for _, e := range record.Elements {
		switch e := e.(type) {
		case ast.FieldInit:
			if e.Name == field && !exists {
				exists = true
			}
		}
	}

	return exists
}

// helper for the verifyObjectType function
func isValidField(field string, v ast.RecordRHS) bool {
	valid := false

	for _, f := range v.Fields {
		if f.Name.Name == field {
			valid = true
			break
		}
	}

	return valid
}

func (a *Analyzer) verifyObjectType(
	t Type,
	expr ast.ObjectLiteralExpression,
	scope *Scope,
) bool {
	// Step 1: Collapse aliases to the original record name. Record aliases
	// represent the same nominal type, so they are compatible with each other.
	canonicalRecordName := func(name string) string {
		seen := make(map[string]struct{})
		for {
			// Type cycles are diagnosed separately. This guard prevents an
			// invalid alias cycle from making object validation loop forever.
			if _, ok := seen[name]; ok {
				return name
			}
			seen[name] = struct{}{}

			alias, ok := a.aliasRecordTypes[name]
			if !ok {
				return name
			}
			name = alias.Target.Name.Name
		}
	}

	// Step 2: Resolve the target type to the complete record shape against
	// which the object literal will be checked. Compositions are flattened so
	// their inherited and inline fields are validated like ordinary fields.
	v, ok := a.recordTypes[t.Name]
	if !ok {
		aT, ok := a.aliasRecordTypes[t.Name]
		if ok {
			v = a.recordTypes[canonicalRecordName(aT.Target.Name.Name)]
		} else {
			cT, ok := a.compRecordTypes[t.Name]
			if ok {
				v, _ = a.convertCompToRecord(cT, scope)
			} else {
				a.errorAt(expr.Pos(), fmt.Sprintf("unknown type %s", t.Name))
				return false
			}
		}
	}

	// Step 3: Track every field supplied by an explicit initializer or spread.
	// This supports duplicate detection now and missing-field detection later.
	visited := make(map[string]struct{})

	for _, e := range expr.Elements {
		switch e := e.(type) {
		case ast.FieldInit:
			// An object literal may provide each target field exactly once.
			if _, ok := visited[e.Name]; ok {
				a.errorAt(e.Position, fmt.Sprintf("duplicate field %s", e.Name))
				return false
			}
			visited[e.Name] = struct{}{}
			if !isValidField(e.Name, v) {
				a.errorAt(e.Position, fmt.Sprintf("unknown field %s", e.Name))
				return false
			}

			// Resolve the declared type of this field from the target record.
			var fieldType Type
			for _, field := range v.Fields {
				if field.Name.Name == e.Name {
					fieldType = a.resolveField(field).Type
					break
				}
			}

			// A nested object literal has no standalone type. Its expected type
			// comes from the enclosing record field, so validate it recursively.
			if objectValue, ok := e.Value.(ast.ObjectLiteralExpression); ok {
				if fieldType.Kind != TypeCustom {
					a.errorAt(
						e.Value.Pos(),
						fmt.Sprintf(
							"field %s expects %s, got object literal",
							e.Name,
							fieldType.String(),
						),
					)
					return false
				}
				if !a.verifyObjectType(fieldType, objectValue, scope) {
					return false
				}
				continue
			}

			// Ordinary field values are typed bottom-up and compared with the
			// field declaration. Invalid types already have their own diagnostic.
			valueType := a.TypeOf(e.Value, scope)
			if valueType.Kind == TypeInvalid {
				return false
			}

			// Primitive types match by kind. Record types additionally collapse
			// aliases so an alias and its target remain interchangeable.
			typesMatch := fieldType.Kind == valueType.Kind
			if fieldType.Kind == TypeCustom && valueType.Kind == TypeCustom {
				typesMatch = canonicalRecordName(fieldType.Name) ==
					canonicalRecordName(valueType.Name)
			}
			if !typesMatch {
				a.errorAt(
					e.Value.Pos(),
					fmt.Sprintf(
						"field %s expects type %s, got %s",
						e.Name,
						fieldType.String(),
						valueType.String(),
					),
				)
				return false
			}
		case ast.SpreadElement:
			// A spread contributes every field from its source value. The source
			// must be the same nominal record type as the literal's target.
			sourceType := a.TypeOf(e.Source, scope)
			if sourceType.Kind == TypeInvalid {
				return false
			}

			targetName := canonicalRecordName(t.Name)
			sourceName := canonicalRecordName(sourceType.Name)
			if sourceType.Kind != TypeCustom || sourceName != targetName {
				a.errorAt(
					e.Position,
					fmt.Sprintf(
						"type mismatch for spread operation, want %s, got %s",
						t.Name,
						sourceType.String(),
					),
				)
				return false
			}

			// Mark every field supplied by the spread. A previously supplied
			// field means two elements provide the same slot, which is illegal.
			for _, field := range v.Fields {
				name := field.Name.Name
				if _, ok := visited[name]; ok {
					a.errorAt(e.Position, fmt.Sprintf("duplicate field %s", name))
					return false
				}
				visited[name] = struct{}{}
			}
		}
	}

	// Step 4: Exact coverage is required. After all explicit fields and spreads
	// have been processed, every field declared by the target must be present.
	for _, field := range v.Fields {
		if _, ok := visited[field.Name.Name]; !ok {
			a.errorAt(
				expr.Position,
				fmt.Sprintf("missing field %s", field.Name.Name),
			)
			return false
		}
	}
	return true
}

func (a *Analyzer) AnalyzeObjectLiteralExpr(
	expr ast.ObjectLiteralExpression,
	scope *Scope,
) {
	for _, element := range expr.Elements {
		e := element.(ast.FieldInit)
		a.AnalyzeExpr(e.Value, scope)
	}
}

func (a *Analyzer) errorLiteralType(
	expr ast.ObjectLiteralExpression,
	errorTypes []Type,
	scope *Scope,
) (Type, bool) {
	provided := map[string]struct{}{}
	for _, element := range expr.Elements {
		field, ok := element.(ast.FieldInit)
		if !ok {
			return Type{}, false
		}
		provided[field.Name] = struct{}{}
	}

	for _, errorType := range errorTypes {
		record, ok := a.recordTypes[errorType.Name]
		if !ok {
			if alias, aliasOK := a.aliasRecordTypes[errorType.Name]; aliasOK {
				record, ok = a.recordTypes[alias.Target.Name.Name]
			} else if composition, compositionOK := a.compRecordTypes[errorType.Name]; compositionOK {
				record, ok = a.convertCompToRecord(composition, scope)
			}
		}
		if !ok || len(record.Fields) != len(provided) {
			continue
		}

		matches := true
		for _, field := range record.Fields {
			if _, exists := provided[field.Name.Name]; !exists {
				matches = false
				break
			}
		}
		if matches {
			return Type{Name: errorType.Name, Kind: TypeCustom}, true
		}
	}

	return Type{}, false
}

func (a *Analyzer) AnalyzeStatement(stmt ast.Statement, scope *Scope) {
	switch stmt := stmt.(type) {
	case ast.Comment:
		return

	case ast.VariableDeclarationStatement:
		if ok := a.AnalyzeVarDecl(stmt, scope); !ok {
			return
		}

	case ast.IfStatement:
		exprType := a.TypeOf(stmt.Condition, scope)

		if exprType.Kind == TypeInvalid {
			return
		}

		if exprType.Kind != TypeBool {
			a.errorAt(stmt.Condition.Pos(), fmt.Sprintf("condition inside if statement must be boolean, found %s", exprType.String()))
			return
		}

		a.AnalyzeExpr(stmt.Condition, scope)
		thenAssigned := a.AnalyzeScope(stmt.ThenBlock, scope)
		elseAssigned := a.AnalyzeScope(stmt.ElseBlock, scope)

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
		a.AnalyzeExpr(expr, scope)
		if !a.FindSymbol(scope, stmt.Target.Name) {
			a.errorAt(
				stmt.Target.Position,
				fmt.Sprintf("unknown identifier: %s", stmt.Target.Name),
			)
			break
		}

		symbol := a.GetSym(scope, stmt.Target.Name)
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
				stmt.Operator, symbol.Type,
			))
		}

		switch e := stmt.TargetExpression.(type) {
		case ast.ObjectLiteralExpression:
			a.AnalyzeObjectLiteralExpr(expr.(ast.ObjectLiteralExpression), scope)
			a.verifyObjectType(symbol.Type, e, scope)
			return

		case ast.MemberAccessExpression:
			recvT := a.TypeOf(e.Receiver, scope)
			if ident, ok := e.Receiver.(ast.Identifier); ok {
				_, initOk := a.typeInits[ident.Name]
				if !initOk {
					a.errorAt(stmt.Position, fmt.Sprintf("partial initialization of %s is not allowed, %s is uninitialized", recvT.Name, recvT.Name))
					return
				}
			}

			memberT := a.TypeOf(e, scope)
			valT := a.TypeOf(stmt.Value, scope)

			v, ok := stmt.Value.(ast.ObjectLiteralExpression)
			if ok {
				a.typeInits[recvT.Name] = v
				return
			}

			if memberT != valT {
				a.errorAt(stmt.Target.Position, fmt.Sprintf("assignment value type must match the binding type, want %s, received %s", memberT.String(), valT.String()))
			}

			return
		}

		if symbol.Type != a.TypeOf(expr, scope) && (symbol.Type.Kind != TypeCustom) {
			a.errorAt(stmt.Target.Position, fmt.Sprintf("assignment value type must match the binding type, want %s, received %s", symbol.Type.String(), a.TypeOf(expr, scope).String()))
		}

	case ast.FallibleStatement:
		expr := fallibleInnerExpression(stmt.Inner)
		if expr == nil || !a.expressionCanFail(expr, scope) {
			a.errorAt(
				stmt.Position,
				"this expression cannot fail; remove `as result`",
			)
		}

		previous := a.allowFallibleExpr
		a.allowFallibleExpr = true
		a.AnalyzeStatement(stmt.Inner, scope)
		a.allowFallibleExpr = previous

		if scope.results == nil {
			scope.results = map[string]*pendingResult{}
		}
		if scope.pending == nil {
			scope.pending = map[string]*pendingResult{}
		}

		result := &pendingResult{
			Name:     stmt.Result.Name,
			Position: stmt.Position,
			Bindings: fallibleBindings(stmt.Inner),
		}
		scope.results[result.Name] = result
		for _, binding := range result.Bindings {
			scope.pending[binding] = result
		}

	case ast.CheckStatement:
		resultScope, result, ok := a.pendingResult(scope, stmt.Result.Name)
		if !ok {
			a.errorAt(
				stmt.Position,
				fmt.Sprintf(
					"check %s has no matching preceding `as result`",
					stmt.Result.Name,
				),
			)
			a.AnalyzeScope(*stmt.Body, scope)
			return
		}

		a.AnalyzeScope(*stmt.Body, scope)
		if !blockDiverges(*stmt.Body) {
			a.errorAt(
				stmt.Position,
				fmt.Sprintf(
					"check %s must diverge on every path",
					stmt.Result.Name,
				),
			)
			return
		}

		delete(resultScope.results, result.Name)
		for _, binding := range result.Bindings {
			delete(resultScope.pending, binding)
		}

	case ast.ReturnStatement:
		// A return outside any function (shouldn't happen at the AST level,
		// but guard anyway) — emit and skip.
		if a.currentFunctionSig == nil {
			a.errorAt(stmt.Position, "return outside of function body")
			return
		}
		if stmt.Error {
			errorTypes := a.currentFunctionSig.ErrorTypes
			if len(errorTypes) == 0 {
				a.errorAt(
					stmt.Position,
					"return error is not allowed: function has no error set",
				)
				return
			}
			if len(stmt.Values) != 1 {
				a.errorAt(
					stmt.Position,
					"return error requires exactly one object literal",
				)
				return
			}
			object, ok := stmt.Values[0].(ast.ObjectLiteralExpression)
			if !ok {
				a.errorAt(
					stmt.Position,
					"return error requires an object literal",
				)
				return
			}

			errorType, ok := a.errorLiteralType(object, errorTypes, scope)
			if !ok {
				a.errorAt(
					stmt.Position,
					"returned error literal does not match the function error set",
				)
				return
			}
			a.verifyObjectType(errorType, object, scope)
			return
		}
		if !stmt.Error {
			returnTypes := a.currentFunctionSig.ReturnTypes
			checkReturnType := false
			for _, returnType := range returnTypes {
				if returnType.Kind == TypeVoid && len(returnTypes) > 1 {
					checkReturnType = true
					a.errorAt(stmt.Position, "multiple return values cannot be combined with void")
				}
			}
			if checkReturnType {
				return
			}

			if len(returnTypes) == 1 && returnTypes[0].Kind == TypeVoid {
				returnTypes = returnTypes[:len(returnTypes)-1]
			}

			if len(stmt.Values) != len(returnTypes) {
				a.errorAt(stmt.Position, fmt.Sprintf("return arity mismatch: expected %d, got %d", len(returnTypes), len(stmt.Values)))
				return
			}

			for i, expr := range stmt.Values {
				a.AnalyzeExpr(expr, scope)
				exprType := a.TypeOf(expr, scope)

				switch expr.(type) {
				case ast.IntegerLiteral:
					if exprType.Kind == TypeEmpty {
						exprType = Type{Name: "int32", Kind: TypeInt32}
					}
				}

				if exprType.Kind == TypeInvalid {
					if objectLiteralExpr, ok := expr.(ast.ObjectLiteralExpression); ok {
						retT := returnTypes[i]
						if !a.verifyObjectType(retT, objectLiteralExpr, scope) {
							return
						}
						exprType = retT
					}
				}

				if exprType.Name != returnTypes[i].Name {
					a.errorAt(stmt.Position, fmt.Sprintf("mismatched return type for expression, received %s, want %s", exprType.String(), returnTypes[i].Name))
				}

			}

		}

	case ast.ExpressionStatement:
		a.AnalyzeExpr(stmt.Value, scope)

	case ast.SwitchStatement:
		scrutinee := stmt.Scrutinee

		if ok := a.AnalyzeExpr(scrutinee, scope); !ok {
			return
		}

		scrutineeType := a.TypeOf(scrutinee, scope)
		scrutineeT := scrutineeType.String()
		if !strings.Contains(scrutineeT, "int") && !(scrutineeT == "char") {
			a.errorAt(scrutinee.Pos(), fmt.Sprintf("type of scrutinee must be int or char, received %s", scrutineeT))
			return
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

			lT := a.TypeOf(l, scope)
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
				return
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
			return
		}

	case ast.ForStatement:
		decl := stmt.Init.(ast.VariableDeclarationStatement)
		if ok := a.AnalyzeVarDecl(decl, scope); !ok {
			return
		}

		if !decl.Mutable && decl.Name != "" {
			a.errorAt(stmt.Init.Pos(), "const is not allowed in the for loop initializer, use let instead")
			return
		}

		if stmt.Cond != nil {
			condType := a.TypeOf(stmt.Cond, scope)
			if condType.Kind != TypeBool {
				a.errorAt(stmt.Cond.Pos(), fmt.Sprintf("condition inside if statement must be boolean, found %s", condType.String()))
				return
			}
		}

		// The step runs once per iteration; analyze it so `i++` is
		// validated and recorded for overflow-trapping codegen.
		if stmt.Step != nil {
			a.AnalyzeExpr(stmt.Step, scope)
		}

		a.AnalyzeScope(*stmt.Body, scope)

	case ast.WhileStatement:
		exprType := a.TypeOf(stmt.Condition, scope)

		if exprType.Kind != TypeBool {
			a.errorAt(stmt.Condition.Pos(), fmt.Sprintf("condition inside if statement must be boolean, found %s", exprType.String()))
			return
		}

		a.AnalyzeExpr(stmt.Condition, scope)
		a.AnalyzeScope(stmt.Body, scope)
	}
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
		a.AnalyzeStatement(stmt, &scope)
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

		if paramType.Kind == TypeInvalid {
			sym := a.GetSym(&functionScope, parameter.Type.Name.Name)
			if sym.Kind == SymbolTypeDecl {
				paramType = Type{
					Kind: TypeCustom,
					Name: parameter.Type.Name.Name,
				}
			} else {
				a.errorAt(
					parameter.Type.Name.Position,
					fmt.Sprintf("unknown type: %s", parameter.Type.Name.Name),
				)
			}
		}

		symbol := Symbol{
			Name:    name,
			Kind:    SymbolParameter,
			Type:    paramType,
			DefPos:  parameter.Name.Position,
			Display: renderBindingDisplay(SymbolParameter, name, paramType),
		}
		functionScope.AddSymbol(symbol)
	}

	for _, retT := range decl.ReturnTypes {
		name := retT.Name.Name
		returnType, _ := ResolveTypeName(name)

		if returnType.Kind == TypeInvalid {
			sym := a.GetSym(&functionScope, name)
			if sym.Kind == SymbolTypeDecl || sym.Kind == SymbolReturn {
				returnType = Type{Kind: TypeCustom, Name: name}
			} else {
				a.errorAt(
					retT.Name.Position,
					fmt.Sprintf("unknown type: %s", name),
				)
			}
		}

		symbol := Symbol{
			Name:    name,
			Kind:    SymbolReturn,
			Type:    returnType,
			DefPos:  retT.Name.Position,
			Display: renderBindingDisplay(SymbolParameter, name, returnType),
		}
		functionScope.AddSymbol(symbol)
	}

	for _, errT := range decl.ErrorTypes {
		name := errT.Name.Name
		returnType, _ := ResolveTypeName(name)

		if returnType.IsInteger() || returnType.IsFloat() {
			a.errorAt(
				errT.Name.Position,
				"primitives as error types are not allowed, must be a record type",
			)
			continue
		}

		if returnType.Kind == TypeInvalid {
			sym := a.GetSym(&functionScope, name)
			if sym.Kind == SymbolTypeDecl || sym.Kind == SymbolError {
				returnType = Type{Kind: TypeCustom, Name: name}
			} else {
				a.errorAt(
					errT.Name.Position,
					fmt.Sprintf("unknown type: %s", name),
				)
				continue
			}
		}

		symbol := Symbol{
			Name:    name,
			Kind:    SymbolError,
			Type:    returnType,
			DefPos:  errT.Name.Position,
			Display: renderBindingDisplay(SymbolParameter, name, returnType),
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
		ParameterNames: make([]string, 0, len(decl.Parameters)),
		Parameters:     make([]Type, 0, len(decl.Parameters)),
		ReturnTypes:    make([]Type, 0, len(decl.ReturnTypes)),
		ErrorTypes:     make([]Type, 0, len(decl.ErrorTypes)),
	}
	for _, p := range decl.Parameters {
		paramType, _ := ResolveTypeName(p.Type.Name.Name)
		sig.ParameterNames = append(sig.ParameterNames, p.Name.Name)
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

type visitState uint8

const (
	unvisited visitState = iota
	visiting
	visited
)

func (a *Analyzer) detectTypeCycles() {
	states := make(map[string]visitState)
	path := make([]string, 0)

	var visit func(string)
	visit = func(name string) {
		switch states[name] {
		case visiting:
			a.reportTypeCycle(path, name)
			return
		case visited:
			return
		}

		states[name] = visiting
		path = append(path, name)

		for _, dependency := range a.typeDependencies(name) {
			visit(dependency)
		}

		path = path[:len(path)-1]
		states[name] = visited
	}

	typeNames := make(map[string]struct{})
	for name := range a.recordTypes {
		typeNames[name] = struct{}{}
	}
	for name := range a.aliasRecordTypes {
		typeNames[name] = struct{}{}
	}
	for name := range a.compRecordTypes {
		typeNames[name] = struct{}{}
	}

	for name := range typeNames {
		if states[name] == unvisited {
			visit(name)
		}
	}
}

func (a *Analyzer) typeDependencies(name string) []string {
	var dependencies []string

	if record, ok := a.recordTypes[name]; ok {
		for _, field := range record.Fields {
			typeName := field.Type.Name.Name
			if a.isUserDefinedType(typeName) {
				dependencies = append(dependencies, typeName)
			}
		}
	}

	if alias, ok := a.aliasRecordTypes[name]; ok {
		target := alias.Target.Name.Name
		if a.isUserDefinedType(target) {
			dependencies = append(dependencies, target)
		}
	}

	if composition, ok := a.compRecordTypes[name]; ok {
		for _, operand := range composition.Operands {
			if operand.Named == nil {
				continue
			}
			target := operand.Named.Name.Name
			if a.isUserDefinedType(target) {
				dependencies = append(dependencies, target)
			}
		}
	}

	return dependencies
}

func (a *Analyzer) isUserDefinedType(name string) bool {
	if _, ok := a.recordTypes[name]; ok {
		return true
	}
	if _, ok := a.aliasRecordTypes[name]; ok {
		return true
	}
	_, ok := a.compRecordTypes[name]
	return ok
}

func (a *Analyzer) reportTypeCycle(
	path []string,
	repeated string,
) {
	start := 0
	for i, name := range path {
		if name == repeated {
			start = i
			break
		}
	}

	cycle := append([]string{}, path[start:]...)
	cycle = append(cycle, repeated)

	position := ast.Position{}
	if record, ok := a.recordTypes[repeated]; ok {
		position = record.Position
	} else if alias, ok := a.aliasRecordTypes[repeated]; ok {
		position = alias.Position
	} else if composition, ok := a.compRecordTypes[repeated]; ok {
		position = composition.Position
	}

	a.errorAt(
		position,
		fmt.Sprintf(
			"type cycle: %s; use `heap<T>` to break this cycle",
			strings.Join(cycle, " -> "),
		),
	)
}

func (a *Analyzer) ValidateCompositionRHS(
	d ast.CompositionRHS,
	name string,
) bool {
	recordFields := []ast.RecordField{}
	for _, operand := range d.Operands {
		if operand.Named != nil {
			typeName := operand.Named.Name.Name
			record, ok := a.recordTypes[typeName]
			if !ok {
				alias, ok := a.aliasRecordTypes[typeName]
				if !ok {
					if t, _ := ResolveTypeName(typeName); !ok {
						a.errorAt(
							d.Position,
							fmt.Sprintf(
								"%s is not a valid record type",
								t.String(),
							),
						)
						return false
					} else {
						a.errorAt(d.Position, fmt.Sprintf("unknown type %s", typeName))
						return false
					}
				}
				record := a.recordTypes[alias.Target.Name.Name]
				recordFields = append(recordFields, record.Fields...)
				continue
			}
			recordFields = append(recordFields, record.Fields...)
		} else {
			recordFields = append(recordFields, operand.Inline.Fields...)
		}
	}

	seen := make(map[string]struct{})

	for _, field := range recordFields {
		if _, ok := seen[field.Name.Name]; !ok {
			seen[field.Name.Name] = struct{}{}
			continue
		}
		a.errorAt(
			field.Position,
			fmt.Sprintf(
				"collision detected: duplicate field %s",
				field.Name.Name,
			),
		)
		return false
	}

	return true
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
	a.recordTypes = map[string]ast.RecordRHS{}
	a.aliasRecordTypes = map[string]ast.AliasRHS{}
	a.compRecordTypes = map[string]ast.CompositionRHS{}
	a.typeInits = map[string]ast.ObjectLiteralExpression{}

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
				DefPos: ast.Position{
					Line:   declaration.Position.Line,
					Column: declaration.Position.Column + len("function "),
				},
				Display: funcDisp,
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

		case ast.TypeDeclaration:
			switch d := decl.RHS.(type) {
			case ast.RecordRHS:
				a.recordTypes[decl.Name.Name] = ast.RecordRHS{
					Position: decl.Position,
					Fields:   d.Fields,
				}

			case ast.AliasRHS:
				targetT := d.Target.Name.Name
				if _, ok := a.recordTypes[targetT]; !ok {
					a.errorAt(d.Position, fmt.Sprintf("unknown type %s", targetT))
					continue
				}
				a.aliasRecordTypes[decl.Name.Name] = ast.AliasRHS{
					Position: decl.Position,
					Target:   d.Target,
				}

			case ast.CompositionRHS:
				a.ValidateCompositionRHS(d, decl.Name.Name)
				a.compRecordTypes[decl.Name.Name] = d
			}

			a.GlobalScope.AddSymbol(Symbol{
				Name:    decl.Name.Name,
				Kind:    SymbolTypeDecl,
				DefPos:  decl.Name.Position,
				Display: "type " + decl.Name.Name,
			})

		case ast.FunctionDeclaration:
			typeCheckFailed := false
			for _, returnType := range decl.ReturnTypes {
				returnT, _ := ResolveTypeName(returnType.Name.Name)
				if returnT.Kind == TypeInvalid {
					sym := a.GetSym(a.GlobalScope, returnType.Name.Name)
					if sym.Kind == SymbolTypeDecl {
						returnT = Type{Kind: TypeCustom, Name: returnType.Name.Name}
					} else {
						a.errorAt(returnType.Name.Position, fmt.Sprintf("unknown identifier %s", returnType.Name.Name))
						typeCheckFailed = true
						continue

					}
				}
			}

			for _, param := range decl.Parameters {
				if t, ok := ResolveTypeName(param.Type.Name.Name); !ok {
					if t.Kind == TypeInvalid {
						s := a.GetSym(a.GlobalScope, param.Type.Name.Name)
						if s.Kind != SymbolTypeDecl {
							a.errorAt(
								param.Type.Name.Position,
								fmt.Sprintf("unknown type: %s", param.Type.Name.Name),
							)
							continue
						}

					} else {
						a.errorAt(param.Name.Position, fmt.Sprintf("unknown identifier %s", param.Type.Name.Name))
						typeCheckFailed = true
						continue
					}
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

	a.detectTypeCycles()
	a.buildRecordRegistry()
}

// buildRecordRegistry resolves every user-defined record type to its flat
// field list and stores it in a.Records for LSP field completion. It runs
// after the type-declaration maps are fully populated and emits no
// diagnostics (any malformed type was already reported during analysis).
func (a *Analyzer) buildRecordRegistry() {
	a.Records = map[string][]ResolvedRecordField{}
	add := func(name string) {
		if _, done := a.Records[name]; done {
			return
		}
		if fields, ok := a.resolveRecordFields(name, map[string]bool{}); ok {
			a.Records[name] = fields
		}
	}
	for name := range a.recordTypes {
		add(name)
	}
	for name := range a.aliasRecordTypes {
		add(name)
	}
	for name := range a.compRecordTypes {
		add(name)
	}
}

// resolveRecordFields returns the resolved field list for a record type
// name, following alias chains and flattening spread/intersection
// composition. seen guards against cycles (already diagnosed by
// detectTypeCycles). It does not emit diagnostics.
func (a *Analyzer) resolveRecordFields(
	name string,
	seen map[string]bool,
) ([]ResolvedRecordField, bool) {
	if seen[name] {
		return nil, false
	}
	seen[name] = true

	if rhs, ok := a.recordTypes[name]; ok {
		out := make([]ResolvedRecordField, 0, len(rhs.Fields))
		for _, f := range rhs.Fields {
			out = append(out, a.resolveField(f))
		}
		return out, true
	}
	if alias, ok := a.aliasRecordTypes[name]; ok {
		return a.resolveRecordFields(alias.Target.Name.Name, seen)
	}
	if comp, ok := a.compRecordTypes[name]; ok {
		var out []ResolvedRecordField
		for _, op := range comp.Operands {
			if op.Named != nil {
				sub, ok := a.resolveRecordFields(
					op.Named.Name.Name,
					copySeen(seen),
				)
				if ok {
					out = append(out, sub...)
				}
			} else if op.Inline != nil {
				for _, f := range op.Inline.Fields {
					out = append(out, a.resolveField(f))
				}
			}
		}
		return out, true
	}
	return nil, false
}

// resolveField resolves a single record field's declared type. Primitive
// type names resolve through ResolveTypeName; anything else is treated as a
// (record) custom type carried by name.
func (a *Analyzer) resolveField(f ast.RecordField) ResolvedRecordField {
	ft, ok := ResolveTypeName(f.Type.Name.Name)
	if !ok {
		ft = Type{Kind: TypeCustom, Name: f.Type.Name.Name}
	}
	return ResolvedRecordField{
		Name:     f.Name.Name,
		Type:     ft,
		Position: f.Name.Position,
	}
}

func copySeen(seen map[string]bool) map[string]bool {
	out := make(map[string]bool, len(seen))
	for k, v := range seen {
		out[k] = v
	}
	return out
}
