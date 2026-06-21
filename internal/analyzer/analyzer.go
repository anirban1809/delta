package analyzer

import (
	"fmt"

	"delta/internal/ast"
)

func (v *Validator) CheckBlock(
	body ast.BlockStatement,
	scope *Scope,
	ctx CheckContext,
) Flow {
	result := FlowContinues
	terminated := false

	for _, stmt := range body.Statements {
		if terminated {
			v.AddError(stmt.Pos(), "unreachable code")
			break
		}

		flow := v.CheckStmt(stmt, scope, ctx)
		if flow != FlowContinues {
			result = flow
			terminated = true
		}
	}

	for _, r := range scope.Symbols {
		if r.Kind == SymbolResult && !r.Checked {
			v.AddError(r.Position, fmt.Sprintf("%s was never checked", r.Name))
		}
	}

	return result
}

func (v *Validator) CheckStmt(
	stmt ast.Statement,
	scope *Scope,
	ctx CheckContext,
) Flow {
	switch s := stmt.(type) {
	case ast.Comment:
		return FlowContinues

	case ast.VariableDeclarationStatement:
		return v.CheckVarDecl(s, scope, ctx)

	case ast.IfStatement:
		return v.CheckIfStmt(s, scope, ctx)

	case ast.AssignmentStatement:
		return v.CheckAssignment(s, scope, ctx)

	case ast.ReturnStatement:
		return v.CheckReturn(s, scope, ctx)

	case ast.SwitchStatement:
		return v.CheckSwitch(s, scope, ctx)

	case ast.ForStatement:
		return v.CheckFor(s, scope, ctx)

	case ast.WhileStatement:
		return v.CheckWhile(s, scope, ctx)

	case ast.FallibleStatement:
		return v.CheckFallible(s, scope, ctx)

	case ast.CheckStatement:
		return v.CheckCheckStmt(s, scope, ctx)

	case ast.ExpressionStatement:
		return v.CheckExprStmt(s, scope, ctx)

	case ast.BreakStatement:
		return FlowBreaks

	}

	return FlowContinues
}

func (v *Validator) CheckExprStmt(s ast.ExpressionStatement, scope *Scope, ctx CheckContext) Flow {
	switch e := s.Value.(type) {
	case ast.FunctionCallExpression, ast.PostfixUnaryExpression:
		v.CheckExpr(e, nil, scope)
	}

	return FlowContinues
}

func (v *Validator) CheckCheckStmt(s ast.CheckStatement, scope *Scope, ctx CheckContext) Flow {
	// validate result symbol
	resultName := s.Result.Name
	sym, ok := scope.Lookup(resultName)
	if !ok {
		v.AddError(s.Position, "unknown identifier: "+resultName)
		return FlowContinues
	}

	if sym.Kind != SymbolResult {
		v.AddError(
			s.Result.Position,
			fmt.Sprintf("%s is not a result that can be checked", resultName),
		)
		return FlowContinues
	}

	if sym.Checked {
		v.AddError(
			s.Result.Position,
			fmt.Sprintf("%s has already been checked", resultName),
		)
		return FlowContinues
	}

	checkScope := scope.NewScope(scope)
	flow := v.CheckBlock(*s.Body, &checkScope, ctx)

	if flow == FlowContinues {
		v.AddError(
			s.Position, "check block does not have an exit path",
		)
		return FlowContinues
	}

	// mark the checked property to be true
	sym.Checked = true

	fstmt, ok := scope.Lookup(sym.FallibleSymbol)
	if ok {
		// mark the status of the associated symbol to Active, the symbol is now usable
		fstmt.Status = Active
	}

	return FlowContinues
}

func (v *Validator) isExpressionFallible(e ast.Expression, scope *Scope) bool {
	switch e := e.(type) {
	case ast.FunctionCallExpression:
		name := e.Callee.(ast.Identifier).Name
		s, _ := scope.Lookup(name)

		if len(s.Signature.ErrorTypes) > 0 {
			return true
		}

	case ast.IntegerLiteral, ast.FloatLiteral,
		ast.BooleanLiteral, ast.CharacterLiteral, ast.StringLiteral:
		return false

	case ast.UnaryExpression:
		return v.isExpressionFallible(e.Expression, scope)

	case ast.BinaryExpression:
		return v.isExpressionFallible(e.Left, scope) &&
			v.isExpressionFallible(e.Right, scope)

	}

	return true
}

func (v *Validator) CheckFallible(s ast.FallibleStatement, scope *Scope, ctx CheckContext) Flow {
	pendingSymbol := ""
	// 1. Type-check the wrapped statement using the logic that already
	//    exists for var-decls / expression statements. This resolves the
	//    RHS expression, defines any binding (x), and reports type errors.
	switch inner := s.Inner.(type) {
	case ast.VariableDeclarationStatement:
		v.CheckVarDecl(inner, scope, ctx)
		s, _ := scope.Lookup(inner.Name)
		s.Status = Pending
		pendingSymbol = inner.Name

	case ast.AssignmentStatement:
		v.CheckAssignment(inner, scope, ctx)
		s, _ := scope.Lookup(inner.Target.Name)
		s.Status = Pending
		pendingSymbol = inner.Target.Name

	case ast.ExpressionStatement:
		switch e := inner.Value.(type) {
		case ast.FunctionCallExpression:
			for _, arg := range e.Arguments {
				if i, ok := arg.(ast.Identifier); ok {
					s, _ := scope.Lookup(i.Name)
					if s.Status == Pending {
						v.AddError(
							e.Pos(),
							fmt.Sprintf(
								"value of %s is pending, corresponding error must be handled",
								i.Name,
							),
						)
					}
				}

				if v.isExpressionFallible(arg, scope) {
					v.AddError(
						e.Pos(),
						"function argument evaluates to a fallible expression and must be handled",
					)
				}
			}

			if !v.isExpressionFallible(e, scope) {
				v.AddError(
					e.Pos(),
					"this function returns does not return an error, hence is not fallible",
				)
			}

		case ast.UnaryExpression, ast.BinaryExpression:
			if !v.isExpressionFallible(e, scope) {
				v.AddError(
					e.Pos(),
					"this expression evaluates to a constant, and hence not fallible",
				)
				return FlowContinues
			}
		}

	default:
		v.AddError(s.Pos(), "invalid fallible binding")
		return FlowContinues
	}

	// add result symbol to scope
	scope.Define(s.Result.Name, Symbol{
		Name:           s.Result.Name,
		Kind:           SymbolResult,
		Position:       s.Position,
		Checked:        false,
		FallibleSymbol: pendingSymbol,
	})

	return FlowContinues
}

func (v *Validator) CheckWhile(s ast.WhileStatement, scope *Scope, ctx CheckContext) Flow {
	loopScope := scope.NewScope(scope)

	// validate condition
	cond := v.CheckExpr(s.Condition, nil, &loopScope)
	if cond.Kind != TypeInvalid && cond.Kind != TypeBool {
		v.AddError(
			s.Condition.Pos(),
			fmt.Sprintf(
				"condition inside while statement must be bool, got %s",
				cond.Name,
			),
		)
	}

	// validate body
	loopCtx := ctx
	ctx.LoopDepth++
	return v.CheckBlock(s.Body, &loopScope, loopCtx)
}

func (v *Validator) CheckFor(s ast.ForStatement, scope *Scope, ctx CheckContext) Flow {
	loopScope := scope.NewScope(scope)

	// validate init statement. initializer belongs to the loop scope
	if s.Init != nil {
		v.CheckStmt(s.Init, &loopScope, ctx)
	}

	// validate loop condition
	cond := v.CheckExpr(s.Cond, nil, &loopScope)
	if cond.Kind != TypeBool {
		v.AddError(
			s.Cond.Pos(),
			fmt.Sprintf(
				"condition inside for statement must be bool, got %s",
				cond.Name,
			),
		)
	}

	// check and validate step expression if present
	if s.Step != nil {
		v.CheckExpr(s.Step, nil, &loopScope)
	}

	// validate loop body

	loopCtx := ctx
	loopCtx.LoopDepth++
	return v.CheckBlock(*s.Body, &loopScope, loopCtx)
}

func (v *Validator) CheckSwitch(s ast.SwitchStatement, scope *Scope, ctx CheckContext) Flow {
	scrutineeT := v.CheckExpr(s.Scrutinee, nil, scope)

	if scrutineeT.Kind != TypeInvalid && !isSwitchable(scrutineeT) {
		v.AddError(s.Scrutinee.Pos(), fmt.Sprintf(
			"cannot switch on type %s, must be int or char", scrutineeT.Name,
		))

		return FlowContinues
	}

	if s.Default == nil {
		v.AddError(s.Pos(), "switch must have a default case")
		return FlowContinues
	}

	seenLabels := map[string]bool{}

	for _, c := range s.Cases {
		for _, l := range c.Labels {
			lT := v.CheckExpr(l, nil, scope)
			if !typesMatch(scrutineeT, lT) {
				v.AddError(
					l.Pos(),
					fmt.Sprintf(
						"case label type %s does not match the switch type %s",
						lT.Name,
						scrutineeT.Name,
					),
				)
				return FlowContinues
			}

			var key string
			switch l := l.(type) {
			case ast.IntegerLiteral:
				key = "int:" + l.Value

			case ast.CharacterLiteral:
				key = "char:" + l.Value

			case ast.BooleanLiteral:
				key = "bool:" + l.Value
			}

			if _, ok := seenLabels[key]; !ok {
				seenLabels[key] = true
			} else {
				v.AddError(
					l.Pos(),
					"duplicate label detected",
				)
			}
		}
	}

	caseFlows := []Flow{}
	for _, c := range s.Cases {
		caseCtx := ctx
		caseCtx.SwitchDepth++
		caseScope := scope.NewScope(scope)
		caseFlows = append(caseFlows, v.CheckBlock(*c.Body, &caseScope, caseCtx))
	}

	allReturn := true
	for _, flow := range caseFlows {
		if flow != FlowReturns {
			allReturn = false
			break
		}
	}

	// if all paths of cases return then the switch returns, no return statement needed further
	if allReturn {
		return FlowReturns
	}

	return FlowContinues
}

func (v *Validator) CheckReturn(s ast.ReturnStatement, scope *Scope, ctx CheckContext) Flow {
	if ctx.FnSig == nil {
		return FlowReturns // not inside a function body
	}

	if len(ctx.FnSig.ReturnTypes) == 0 {
		v.AddError(
			s.Pos(),
			"return statement is not allowed in a void function",
		)
		return FlowReturns
	}

	expectedTypes := ctx.FnSig.ReturnTypes
	if s.Error {
		if ctx.FnSig.Name == "main" {
			v.AddError(
				s.Pos(),
				"main function cannot return an error, please add escape using panic() or exit(), or return a proper value",
			)
		}
		expectedTypes = ctx.FnSig.ErrorTypes
	}

	// check if errors are returned
	if s.Error && len(ctx.FnSig.ErrorTypes) == 0 {
		v.AddError(s.Pos(), "function does not declare any error returns")
		return FlowReturns
	}

	// arity check
	if len(s.Values) != len(expectedTypes) {
		v.AddError(s.Pos(), fmt.Sprintf(
			"return expects %d value(s), got %d", len(expectedTypes), len(s.Values),
		))
		// still check the values you do have, for better diagnostics
	}

	// match each value with corresponding type
	for i, valueExpr := range s.Values {
		var want *Type
		if i < len(expectedTypes) {
			want = &expectedTypes[i]
		}
		got := v.CheckExpr(valueExpr, want, scope)

		if want == nil || got.Kind == TypeInvalid {
			continue // ignore surplus values, already checked during arity
		}

		if !typesMatch(got, *want) {
			// if got.Kind == TypeCustom && want.Kind == TypeCustom &&
			// 	want.Alias == got.Name {
			// 	return FlowReturns
			// }

			v.AddError(valueExpr.Pos(), fmt.Sprintf(
				"return type mismatch, want %s, got %s", want.Name, got.Name,
			))
		}
	}

	return FlowReturns
}

// ResolveAssignmentTarget to check if an assignment target is mutable or not and what is its type
func (v *Validator) ResolveAssignmentTarget(e ast.Expression, scope *Scope) (Type, bool) {
	switch e := e.(type) {
	case ast.Identifier:
		s, ok := scope.Lookup(e.Name)

		// set the target initialization status to true
		s.Initialized = true

		exprT := v.CheckExpr(e, nil, scope)

		if !ok {
			v.AddError(e.Pos(), fmt.Sprintf("unknown identifier %s", e.Name))
		}

		if s.Kind == SymbolFileConst || s.Kind == SymbolLocalConst {
			v.AddError(e.Pos(), fmt.Sprintf("cannot assign to const value %s", e.Name))
		}

		if s.Kind == SymbolParameter {
			// error for now, TODO: modify this when adding support for mutable references
			v.AddError(e.Pos(), fmt.Sprintf("cannot assign to parameter %s", e.Name))
		}

		if s.Kind == SymbolTypeDecl || s.Kind == SymbolFunction {
			v.AddError(e.Pos(), fmt.Sprintf("%s not a valid assignment target", e.Name))
		}

		return exprT, true

	case ast.MemberAccessExpression:
		return v.ResolveAssignmentTarget(e.Receiver, scope)
	}

	return Type{}, false
}

func (v *Validator) CheckAssignment(
	stmt ast.AssignmentStatement,
	scope *Scope,
	ctx CheckContext,
) Flow {
	targetT, mutable := v.ResolveAssignmentTarget(stmt.TargetExpression, scope)

	if !mutable {
		v.AddError(stmt.TargetExpression.Pos(), "assignment expression is not mutable")
	}

	// in case of member-access expressions, set the type of the target to the type of the member.
	// for example in case of v.a = 34, we need the type of a, not v
	if s, ok := stmt.TargetExpression.(ast.MemberAccessExpression); ok {
		for _, f := range targetT.Fields {
			if f.Name == s.Member {
				targetT = f.Type
			}
		}
	}

	valueT := v.CheckExpr(stmt.Value, &targetT, scope)

	if !typesMatch(targetT, valueT) {
		v.AddError(
			stmt.Value.Pos(),
			fmt.Sprintf(
				"type mismatch for target, want %s, got %s",
				targetT.Name,
				valueT.Name,
			),
		)
	}

	switch stmt.Operator {
	case "+=", "-=", "*=":
		if !isNumeric(targetT) || !isNumeric(valueT) {
			v.AddError(
				stmt.Position,
				"cannot apply "+stmt.Operator+" operator on non numeric values",
			)
		}
	}

	return FlowContinues
}

func (v *Validator) CheckIfStmt(stmt ast.IfStatement, scope *Scope, ctx CheckContext) Flow {
	exprT := v.CheckExpr(stmt.Condition, nil, scope)

	if exprT.Kind == TypeInvalid && exprT.Kind != TypeBool {
		v.AddError(
			stmt.Condition.Pos(),
			fmt.Sprintf("if condition must be a bool, got %s", exprT.Name),
		)
	}

	thenScope := scope.NewScope(scope)
	thenFlow := v.CheckBlock(stmt.ThenBlock, &thenScope, ctx)

	elseScope := scope.NewScope(scope)
	elseFlow := v.CheckBlock(stmt.ElseBlock, &elseScope, ctx)

	if len(stmt.ElseBlock.Statements) == 0 {
		return FlowContinues
	}

	if thenFlow != FlowContinues && elseFlow != FlowContinues {
		if thenFlow == elseFlow {
			return thenFlow // both return / both break / both continue-loop
		}
		// Both divert but differently (e.g. then returns, else breaks):
		// control still can't fall through, but there's no uniform guarantee.
		return FlowBreaks
	}

	return FlowContinues
}

func (v *Validator) CheckVarDecl(
	stmt ast.VariableDeclarationStatement,
	scope *Scope,
	ctx CheckContext,
) Flow {
	// set symbol kind
	kind := SymbolLocalConst
	if stmt.Mutable {
		kind = SymbolLocalLet
	}

	name := stmt.Name
	// check if symbol already exists in the current scope or parent scopes
	// return early with error if exists

	_, ok := scope.Lookup(name)
	if ok {
		v.AddError(
			stmt.Position,
			fmt.Sprintf("duplicate symbol %s", name),
		)
		return FlowContinues
	}

	if stmt.Value == nil && kind == SymbolLocalLet {
		lhsT := v.ResolveType(stmt.Type)

		if lhsT.Kind == TypeInvalid {
			v.AddError(stmt.Position, "uninitialized values must have a valid type")
			return FlowContinues
		}

		scope.Define(name, Symbol{
			Name:     name,
			Kind:     kind,
			Type:     lhsT,
			Position: stmt.Position,
		})

		return FlowContinues
	}

	if stmt.Value == nil && kind == SymbolLocalConst {
		v.AddError(stmt.Position, "const values must be initialized")
		return FlowContinues
	}

	var lhsT Type
	// declaration is missing type identifier, to be inferred from the value
	if getTypeRefName(stmt.Type) == "" {
		rhsT := v.CheckExpr(stmt.Value, nil, scope)
		lhsT = rhsT
	} else {
		lhsT = v.ResolveType(stmt.Type)
		rhsT := v.CheckExpr(stmt.Value, &lhsT, scope)
		if !typesMatch(lhsT, rhsT) {
			if isInteger(lhsT) && isInteger(rhsT) {
				if bitWidth(lhsT) > bitWidth(rhsT) {
					return FlowContinues
				} else {
					v.AddError(
						stmt.Position,
						fmt.Sprintf(
							"cannot assign %s to a container of type %s, integer size mismatch",
							lhsT.Name,
							rhsT.Name,
						),
					)
					return FlowContinues
				}
			}
			v.AddError(
				stmt.Position,
				fmt.Sprintf(
					"assignment type mismatch, want %s, got %s",
					lhsT.Name,
					rhsT.Name,
				),
			)

			return FlowContinues
		}
	}
	scope.Define(name, Symbol{
		Name:        name,
		Kind:        kind,
		Type:        lhsT,
		Initialized: true,
		Position:    stmt.Position,
	})

	return FlowContinues
}

// typesMatch reports whether a value of type a satisfies type b. Primitives
// match on kind; custom record types must additionally share a name.
func typesMatch(a, b Type) bool {
	if a.Kind != b.Kind {
		return false
	}
	if a.Kind == TypeCustom {
		if a.Name == b.Name {
			return true
		}

		// in case of alias types, name of a should match with alias of b
		if a.Name == b.Alias {
			return true
		}

		return false
	}
	return true
}

// isConvOp reports whether name denotes a built-in scalar conversion operator
// (int32(x), char(y), float64(z), ...) and, if so, returns a synthetic
// signature describing it: a single value parameter producing the target type.
// The parameter type is the target type itself; the actual source-type rule
// (any numeric or char value) is enforced by the caller via isConvertible,
// since a conversion legitimately accepts a different type than it returns.
func isConvOp(name string) (bool, FunctionSignature) {
	target, ok := convOpType(name)
	if !ok {
		return false, FunctionSignature{}
	}

	return true, FunctionSignature{
		Name:           name,
		ParameterNames: []string{"value"},
		Parameters:     []Type{target},
		ReturnTypes:    []Type{target},
	}
}

func (v *Validator) CheckExpr(
	expr ast.Expression,
	expected *Type,
	scope *Scope,
) Type {
	switch e := expr.(type) {

	case ast.MemberAccessExpression:
		// recursively check the receiver since it is also an expression. (receiver in this case means v in v.x)
		recv := v.CheckExpr(e.Receiver, nil, scope)
		if recv.Kind == TypeInvalid {
			return Type{Kind: TypeInvalid, Name: "invalid"} // cascade suppression
		}

		// receiver must be of type TypeCustom Kind (not a primitive)
		if recv.Kind != TypeCustom {
			v.AddError(e.Pos(), fmt.Sprintf(
				"type %s has no fields; cannot access %q", recv.Name, e.Member,
			))
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

		// field must exist on the field's type
		for _, f := range recv.Fields {
			if f.Name == e.Member {
				return f.Type // result type = the field's type
			}
		}
		v.AddError(e.Pos(), fmt.Sprintf(
			"unknown field %q on type %s", e.Member, recv.Name,
		))
		return Type{Kind: TypeInvalid, Name: "invalid"}

	case ast.FunctionCallExpression:
		// === Phase L (receiver methods) BEGIN ===
		// A `recv.method(args)` call: the callee is a member access. There are
		// no function-typed fields, so a called member access is always a
		// method call.
		if member, ok := e.Callee.(ast.MemberAccessExpression); ok {
			return v.checkMethodCall(e, member, scope)
		}
		// === Phase L (receiver methods) END ===
		callee, ok := e.Callee.(ast.Identifier)
		if !ok {
			v.AddError(
				expr.Pos(),
				"cannot call a non-identifier expression",
			)
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

		s, exists := scope.Lookup(callee.Name)

		var sig *FunctionSignature
		isConv := false

		if exists {
			if s.Signature != nil && len(s.Signature.ErrorTypes) > 0 && !e.Caught {
				v.AddError(
					expr.Pos(),
					fmt.Sprintf(
						"%s returns errors and therefore must be handled",
						callee.Name,
					),
				)
				return Type{Kind: TypeInvalid, Name: "invalid"}
			}
			sig = s.Signature
		}

		// Conversion operators (int32(x), char(y), ...) are built-ins, not
		// scope symbols. If the callee has no signature — whether it is unknown
		// or simply not a function — try to resolve it as a conversion operator.
		if sig == nil {
			if valid, convSig := isConvOp(callee.Name); valid {
				sig = &convSig
				isConv = true
			} else if !exists {
				v.AddError(
					expr.Pos(),
					fmt.Sprintf("unknown identifier %s", callee.Name),
				)
				return Type{Kind: TypeInvalid, Name: "invalid"}
			} else {
				v.AddError(
					callee.Position,
					"invalid function or conversion operator: "+callee.Name,
				)
				return Type{Kind: TypeInvalid, Name: "invalid"}
			}
		}

		// validate the arity for function arguments
		paramCount := len(sig.Parameters)
		argCount := len(e.Arguments)

		if argCount != paramCount {
			v.AddError(
				expr.Pos(),
				fmt.Sprintf(
					"argument count mismatch for function %s, need %d, got %d",
					callee.Name,
					paramCount, argCount,
				),
			)
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

		// validate argument types of function call expression
		for i, arg := range e.Arguments {
			// For a conversion operator the source may legitimately differ
			// from the target type, so we don't pin an expected type; the
			// convertibility rule is checked explicitly below.
			var want *Type
			if !isConv {
				want = &sig.Parameters[i]
			}
			argT := v.CheckExpr(arg, want, scope)

			if argT.Kind == TypeInvalid {
				return Type{
					Kind: TypeInvalid,
					Name: "invalid",
				} // cascade suppression
			}

			if isConv {
				if !isConvertible(argT, sig.ReturnTypes[i]) {
					v.AddError(
						arg.Pos(),
						fmt.Sprintf(
							"conversion from %s to %s is not allowed: %s only accepts numeric or char values",
							argT.Name,
							sig.ReturnTypes[i].Name,
							callee.Name,
						),
					)
					return Type{Kind: TypeInvalid, Name: "invalid"}
				}

				v.Conversions = append(v.Conversions, Conversion{
					from:  argT.Name,
					to:    sig.ReturnTypes[i].Name,
					value: exprText(arg),
				})
				continue
			}

			if !typesMatch(
				sig.Parameters[i],
				argT,
			) {
				v.AddError(
					expr.Pos(),
					fmt.Sprintf(
						"argument %d of function %s requires type %s, got %s",
						i,
						callee.Name,
						sig.Parameters[i].Name,
						argT.Name,
					),
				)
				return Type{Kind: TypeInvalid, Name: "invalid"}
			}
		}

		// a conversion operator yields its target type
		if isConv {
			return sig.ReturnTypes[0]
		}

		return s.Type

	case ast.PostfixUnaryExpression:

		// operation must be done on an identifier
		ident, ok := e.Operand.(ast.Identifier)
		if !ok {
			v.AddError(
				e.Pos(),
				fmt.Sprintf(
					"operator %s requires an assignable operand",
					e.Operator,
				),
			)
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

		// operation must be done on a mutable symbol
		sym, ok := scope.Lookup(ident.Name)
		if !ok {
			v.AddError(
				e.Pos(),
				fmt.Sprintf(
					"unknown identifier %s",
					ident.Name,
				),
			)
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}
		if sym.Kind != SymbolLocalLet {
			v.AddError(
				e.Pos(),
				fmt.Sprintf(
					"cannot mutate %s: %s is not mutable",
					e.Operator,
					ident.Name,
				),
			)
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

		// operation must be done on numeric symbols

		t := sym.Type
		if t.Kind == TypeInvalid {
			return Type{
				Kind: TypeInvalid,
				Name: "invalid",
			} // cascade suppression
		}
		if !isInteger(t) { // the int*/uint*/float* kinds
			v.AddError(
				e.Pos(),
				fmt.Sprintf("%s must be an integer", t.Name),
			)
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

	case ast.UnaryExpression:
		exprT := v.CheckExpr(e.Expression, nil, scope)

		switch e.Operator {
		case "!":
			if exprT.Kind != TypeBool {
				v.AddError(e.Position, fmt.Sprintf(
					"unary `!` requires bool operand, got %s", exprT.Name,
				))
				return Type{Name: "<invalid>", Kind: TypeInvalid}
			}
			return Type{Name: "bool", Kind: TypeBool}

		case "-":
			if !isNumeric(exprT) {
				v.AddError(e.Position, fmt.Sprintf(
					"unary `-` requires numeric operand, got %s", exprT.Name,
				))
				return Type{Name: "<invalid>", Kind: TypeInvalid}
			}
			return exprT

		case "~":
			if !isInteger(exprT) {
				v.AddError(e.Position, fmt.Sprintf(
					"unary `~` requires integer operand, got %s", exprT.Name,
				))
				return Type{Name: "<invalid>", Kind: TypeInvalid}
			}
			return exprT
		}

		v.AddError(e.Position, fmt.Sprintf("unknown unary operator %q", e.Operator))
		return Type{Name: "<invalid>", Kind: TypeInvalid}

	case ast.BinaryExpression:
		leftT := v.CheckExpr(e.Left, nil, scope)
		rightT := v.CheckExpr(e.Right, nil, scope)

		// if any of the types are invalid
		if leftT.Kind == TypeInvalid || rightT.Kind == TypeInvalid {
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

		// common error for mismatched operands
		mismatched := func() Type {
			v.AddError(e.Pos(), fmt.Sprintf(
				"operator %s: mismatched operand types %s and %s",
				e.Operator, leftT.Name, rightT.Name,
			))
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

		// match both sides of an operator
		switch e.Operator {
		case "+", "-", "*", "/", "%":
			if !isNumeric(leftT) || !isNumeric(rightT) {
				v.AddError(e.Pos(), fmt.Sprintf(
					"operator %s not defined for %s", e.Operator, leftT.Name,
				))
				return Type{Kind: TypeInvalid, Name: "invalid"}
			}
			if !typesMatch(leftT, rightT) {
				if isInteger(leftT) && isInteger(rightT) {
					if bitWidth(leftT) > bitWidth(rightT) {
						return leftT
					}

					if bitWidth(leftT) < bitWidth(rightT) {
						return rightT
					}

				}

				return mismatched()
			}
			return leftT

		case "&", "|", "^", "<<", ">>":
			if !isInteger(leftT) || !isInteger(rightT) {
				v.AddError(e.Pos(), fmt.Sprintf(
					"operator %s requires integer operands", e.Operator,
				))
				return Type{Kind: TypeInvalid, Name: "invalid"}
			}
			if !typesMatch(leftT, rightT) {
				return mismatched()
			}
			return leftT
		case "==", "!=":
			if !isEquable(leftT) || !isEquable(rightT) {
				v.AddError(e.Pos(), fmt.Sprintf(
					"operator %s : type %s is not comparable with %s",
					e.Operator,
					leftT.Name,
					rightT.Name,
				))
				return Type{Kind: TypeInvalid, Name: "invalid"}
			}
			if !typesMatch(leftT, rightT) {
				return mismatched()
			}
			return Type{Kind: TypeBool, Name: "bool"}

		case "&&", "||":
			if leftT.Kind != TypeBool && rightT.Kind != TypeBool {
				v.AddError(e.Pos(), fmt.Sprintf(
					"operator %s : type %s is not comparable with %s",
					e.Operator,
					leftT.Name,
					rightT.Name,
				))
				return Type{Kind: TypeInvalid, Name: "invalid"}
			}
			if !typesMatch(leftT, rightT) {
				return mismatched()
			}
			return Type{Kind: TypeBool, Name: "bool"}

		case "<", "<=", ">", ">=":
			if !isComparable(leftT) || !isComparable(rightT) {
				v.AddError(e.Pos(), fmt.Sprintf(
					"operator %s : type %s is not comparable with %s",
					e.Operator,
					leftT.Name,
					rightT.Name,
				))
				return Type{Kind: TypeInvalid, Name: "invalid"}
			}
			if !typesMatch(leftT, rightT) {
				return mismatched()
			}
			return Type{Kind: TypeBool, Name: "bool"}
		}

		v.AddError(e.Pos(), fmt.Sprintf("unknown binary operator %s", e.Operator))
		return Type{Kind: TypeInvalid, Name: "invalid"}

	case ast.Identifier:
		// check if the symbol exists in the current scope (or parent scope)
		sym, ok := scope.Lookup(e.Name)
		if !ok {
			v.AddError(
				e.Pos(),
				fmt.Sprintf("unknown identifier %s", e.Name),
			)
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

		// check if the identifier can be used as a value (type decls and function decls are not allowed)
		switch sym.Kind {
		case SymbolTypeDecl:
			v.AddError(
				e.Pos(),
				fmt.Sprintf(
					"%s is a type, not a value",
					e.Name,
				),
			)
			return Type{Kind: TypeInvalid, Name: "invalid"}
		case SymbolFunction:
			v.AddError(
				e.Pos(),
				fmt.Sprintf(
					"%s is a function and cannot be used as a value",
					e.Name,
				),
			)
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

		// check if identifier is initialized before use
		if !sym.Initialized && sym.Kind != SymbolParameter {
			v.AddError(
				e.Pos(),
				fmt.Sprintf(
					"%s is uninitialized",
					e.Name,
				),
			)
			return sym.Type
		}

		// check if the identifier is a usable value (not a pending value from error handling)
		if sym.Status == Pending &&
			(sym.Kind == SymbolLocalLet || sym.Kind == SymbolLocalConst) {
			v.AddError(
				e.Pos(),
				fmt.Sprintf(
					"the value of %s is still pending, please handle the associated result before accessing",
					e.Name,
				),
			)
		}

		// if there is an expected type provided
		if expected != nil && !typesMatch(sym.Type, *expected) {
			v.AddError(e.Pos(), fmt.Sprintf(
				"type mismatch, want %s, got %s",
				expected.Name,
				sym.Type.Name,
			))
			return *expected // adopt expected → suppresses downstream cascades
		}
		return sym.Type

	case ast.ObjectLiteralExpression:
		if expected == nil {
			v.AddError(
				e.Position,
				"cannot infer type from literal, please add additional annotation",
			)
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}

		// Index the expected fields by name so literal fields can be
		// matched regardless of source order.
		expectedByName := map[string]Type{}
		for _, f := range expected.Fields {
			expectedByName[f.Name] = f.Type
		}

		// seen tracks which expected fields have been supplied, whether by
		// an explicit FieldInit or by a spread. markField reports a
		// collision (duplicate) and returns whether the field was newly set.
		seen := map[string]bool{}
		markField := func(name string, pos ast.Position) bool {
			if seen[name] {
				v.AddError(pos, fmt.Sprintf(
					"duplicate field %s in %s literal",
					name,
					expected.Name,
				))
				return false
			}
			seen[name] = true
			return true
		}

		// Validate every element in source order: explicit fields and
		// spreads share the same seen-set, so a spread field that collides
		// with an explicit field (or vice versa) is reported as a duplicate.
		for _, element := range e.Elements {
			switch element := element.(type) {
			case ast.FieldInit:
				expectedType, ok := expectedByName[element.Name]
				if !ok {
					v.AddError(element.Pos(), fmt.Sprintf(
						"unknown field %s in %s literal",
						element.Name,
						expected.Name,
					))
					continue
				}
				if !markField(element.Name, element.Pos()) {
					continue
				}
				// Push the expected field type down so nested object
				// literals and integer literals pin/infer correctly.
				got := v.CheckExpr(element.Value, &expectedType, scope)
				if got.Kind == TypeInvalid {
					continue // cascade suppression: error already reported
				}
				if !typesMatch(got, expectedType) {
					v.AddError(element.Pos(), fmt.Sprintf(
						"field %s expects %s, got %s",
						element.Name, expectedType.Name, got.Name,
					))
				}

			case ast.SpreadElement:
				srcT := v.CheckExpr(element.Source, nil, scope)
				if srcT.Kind == TypeInvalid {
					continue // cascade suppression
				}
				if srcT.Kind != TypeCustom {
					v.AddError(element.Pos(), fmt.Sprintf(
						"cannot spread non-record type %s into %s literal",
						srcT.Name,
						expected.Name,
					))
					continue
				}
				// Delta is strictly nominal: a spread is only valid when the
				// source is the same type as the literal's expected type.
				if srcT.Name != expected.Name {
					v.AddError(element.Pos(), fmt.Sprintf(
						"cannot spread %s into %s literal: types differ",
						srcT.Name,
						expected.Name,
					))
					continue
				}
				// Contribute every field of the spread source.
				for _, f := range srcT.Fields {
					markField(f.Name, element.Pos())
				}
			}
		}

		// Every field required by the expected type must be initialized.
		for _, f := range expected.Fields {
			if !seen[f.Name] {
				v.AddError(e.Position, fmt.Sprintf(
					"missing field %s in %s literal",
					f.Name,
					expected.Name,
				))
			}
		}

		return *expected

	case ast.IntegerLiteral:
		return Type{Name: "int32", Kind: TypeInt32}
	case ast.FloatLiteral:
		// An untyped float literal adopts the expected float type when the
		// context provides one (e.g. `const x: float32 = 2.5`); otherwise it
		// defaults to float64.
		if expected != nil && isFloat(*expected) {
			return *expected
		}
		return Type{Name: "float64", Kind: TypeFloat64}
	case ast.BooleanLiteral:
		return Type{Name: "bool", Kind: TypeBool}
	case ast.StringLiteral:
		return Type{Name: "string", Kind: TypeString}
	case ast.CharacterLiteral:
		return Type{Name: "char", Kind: TypeChar}
	}

	return Type{Kind: TypeInvalid, Name: "invalid"}
}

func (v *Validator) Check(program ast.File) Result {
	v.GlobalScope = v.GlobalScope.NewScope(nil)
	// === Phase L (receiver methods) BEGIN ===
	v.Methods = map[string]map[string]*FunctionSignature{}
	// === Phase L (receiver methods) END ===
	decls := program.Declarations

	// pass 0, for predeclaring type decl symbols
	for _, decl := range decls {
		switch decl := decl.(type) {
		case ast.TypeDeclaration:
			v.GlobalScope.Define(decl.Name.Name, Symbol{
				Name:     decl.Name.Name,
				Kind:     SymbolTypeDecl,
				Position: decl.Position,
				// Display: funcDisp,
			})
		}
	}

	// pass 1, for pre-declaring function and defining typedecl symbols,
	for _, decl := range decls {
		switch decl := decl.(type) {
		case ast.Comment:
			continue

		case ast.TypeDeclaration:
			name := getIdentName(decl.Name)
			var t Type

			switch d := decl.RHS.(type) {
			case ast.RecordRHS:
				t = Type{
					Name:   name,
					Kind:   TypeCustom,
					Fields: v.ResolveFields(d.Fields),
				}

			case ast.AliasRHS:
				t = v.ResolveType(d.Target)
				t.Name = name
				if name == d.Target.Name.Name {
					v.AddError(d.Position, "cannot use a type as its own alias")
					continue
				}
				t.Alias = d.Target.Name.Name

			case ast.CompositionRHS:
				fields := []Field{}
				seen := map[string]struct{}{} // to track duplicate fields

				for _, op := range d.Operands {
					if op.Named != nil {
						s, ok := v.GlobalScope.Lookup(
							op.Named.Name.Name,
						)

						if !ok {
							v.AddError(
								d.Position,
								"unknown identifier: "+op.Named.Name.Name,
							)
							continue
						}

						for _, f := range s.Type.Fields {
							if _, ok := seen[f.Name]; !ok {
								seen[f.Name] = struct{}{}
								fields = append(fields, f)
								continue
							}
							v.AddError(
								op.Position,
								fmt.Sprintf(
									"duplicate field %s in type %s",
									f.Name,
									op.Named.Name.Name,
								),
							)

						}
					}

					if op.Inline != nil {
						for _, f := range op.Inline.Fields {
							fT := v.ResolveType(
								f.Type,
							)
							fN := f.Name.Name
							fields = append(
								fields,
								Field{
									Name: fN,
									Type: fT,
								},
							)
						}
					}
				}

				t.Name = name
				t.Fields = fields
				t.Kind = TypeCustom

			}
			v.GlobalScope.Define(name, Symbol{
				Name:     name,
				Kind:     SymbolTypeDecl,
				Type:     t,
				Position: decl.Name.Position,
				// Display:  "type " + decl.Name.Name,
			})

		case ast.FunctionDeclaration:
			// === Phase L (receiver methods) BEGIN ===
			// Receiver methods are not free-function symbols. They are
			// registered into v.Methods in the dedicated pass below (after all
			// record types are fully defined).
			if decl.Receiver != nil {
				continue
			}
			// === Phase L (receiver methods) END ===
			fnName := decl.Name
			position := decl.Position
			if _, ok := v.GlobalScope.Lookup(fnName); ok {
				v.AddError(
					decl.Position,
					"duplicate function declaration: "+fnName,
				)
				continue
			}

			params := []string{}
			paramTypes := []Type{}
			errorTypes := []Type{}
			returnTypes := []Type{}

			// resolve parameter types
			for _, param := range decl.Parameters {
				params = append(params, param.Name.Name)
				paramTypes = append(
					paramTypes,
					v.ResolveType(param.Type),
				)
			}

			// prevent errors on the main function.
			if len(decl.ErrorTypes) > 0 && fnName == "main" {
				v.AddError(
					decl.ErrorTypes[0].Name.Position,
					"main function cannot return errors",
				)
			}

			// resolve error types
			for _, errorType := range decl.ErrorTypes {
				errorTypes = append(
					errorTypes,
					v.ResolveType(errorType),
				)
			}

			// resolve return types
			for _, returnType := range decl.ReturnTypes {
				returnTypes = append(
					returnTypes,
					v.ResolveType(returnType),
				)
			}

			sig := FunctionSignature{
				Name:           fnName,
				ParameterNames: params,
				Parameters:     paramTypes,
				ErrorTypes:     errorTypes,
				ReturnTypes:    returnTypes,
			}

			// TODO: function display string here
			v.GlobalScope.Define(fnName, Symbol{
				Name:      fnName,
				Kind:      SymbolFunction,
				Signature: &sig,
				Position: ast.Position{
					Line: position.Line,
					Column: position.Column + len(
						"function ",
					),
				},
				// Display: funcDisp,
			})

		case ast.ConstDeclaration:
			name := decl.Name.Name
			position := decl.Position
			if _, ok := v.GlobalScope.Lookup(name); ok {
				v.AddError(
					position,
					fmt.Sprintf(
						"use of duplicate identifier: %s",
						name,
					),
				)
				continue
			}

			declT := v.ResolveType(decl.Type)

			// TODO: Implement the binding display string (later, not required at this moment)
			v.GlobalScope.Define(name, Symbol{
				Name:        name,
				Kind:        SymbolFileConst,
				Type:        declT,
				Position:    position,
				Initialized: true,
				// Display: renderBindingDisplay(SymbolFileConst, declaration.Name.Name, varType),
			})

		}
	}

	// === Phase L (receiver methods) BEGIN ===
	// pass 1.5: register receiver methods. Runs after pass 1 so every record
	// type is fully defined when we look up the receiver type and check for
	// method/field name collisions.
	for _, decl := range decls {
		if fn, ok := decl.(ast.FunctionDeclaration); ok && fn.Receiver != nil {
			v.registerMethod(fn)
		}
	}
	// === Phase L (receiver methods) END ===

	// pass 2: for validating function declarations and checking type cycles
	for _, decl := range decls {
		switch decl := decl.(type) {

		case ast.Comment:
			continue

		case ast.ConstDeclaration:
			valueT := v.CheckExpr(decl.Value, nil, &v.GlobalScope)
			declT := v.ResolveType(decl.Type)

			if !typesMatch(valueT, declT) {
				v.AddError(
					decl.Value.Pos(),
					fmt.Sprintf(
						"mismatched types in declaration, want %s, got %s",
						declT.Name,
						valueT.Name,
					),
				)
			}

		case ast.TypeDeclaration:
			sym, _ := v.GlobalScope.Lookup(decl.Name.Name)
			if v.checkTypeCycle(sym.Type, nil) {
				v.AddError(decl.Position, "type cycle detected")
			}

		case ast.FunctionDeclaration:
			// === Phase L (receiver methods) BEGIN ===
			if decl.Receiver != nil {
				v.checkMethodBody(decl)
				continue
			}
			// === Phase L (receiver methods) END ===
			fnName := decl.Name
			// validation criteria:

			symbol, _ := v.GlobalScope.Lookup(fnName)
			sig := symbol.Signature

			fnScope := v.GlobalScope.NewScope(
				&v.GlobalScope,
			)

			// 1. Duplicate parameter names are rejected.
			params := map[string]struct{}{}

			for i, param := range decl.Parameters {
				name := param.Name.Name
				if _, ok := params[name]; ok {
					v.AddError(
						decl.Position,
						fmt.Sprintf(
							"duplicate function parameter: %s",
							param,
						),
					)
					continue
				}
				params[name] = struct{}{}
				paramType := sig.Parameters[i]

				if paramType.Kind == TypeInvalid {
					v.AddError(
						param.Position,
						fmt.Sprintf(
							"unknown type: %s",
							paramType.Name,
						),
					)
					continue
				}

				fnScope.Define(name, Symbol{
					Name:     name,
					Kind:     SymbolParameter,
					Type:     sig.Parameters[i],
					Position: param.Position,
					// Display: renderBindingDisplay(SymbolParameter, name, paramType),
				})
			}

			// 2. Return types are validated
			for i, returnType := range sig.ReturnTypes {
				n := getTypeRefName(decl.ReturnTypes[i])
				p := getTypeRefPos(decl.ReturnTypes[i])

				if returnType.Kind == TypeInvalid {
					v.AddError(
						p,
						fmt.Sprintf(
							"unknown type: %s",
							n,
						),
					)
					continue
				}

				fnScope.Define(n, Symbol{
					Name:     n,
					Kind:     SymbolReturn,
					Type:     sig.ReturnTypes[i],
					Position: p,
					// Display: renderBindingDisplay(SymbolParameter, name, paramType),
				})

			}

			// 3. Error types are validated
			for i, errorType := range sig.ErrorTypes {
				n := getTypeRefName(decl.ErrorTypes[i])
				p := getTypeRefPos(decl.ErrorTypes[i])

				if errorType.Kind == TypeInvalid {
					v.AddError(
						p,
						fmt.Sprintf(
							"unknown type: %s",
							n,
						),
					)
					continue
				}

				fnScope.Define(n, Symbol{
					Name:     n,
					Kind:     SymbolError,
					Type:     sig.ErrorTypes[i],
					Position: p,
					// Display: renderBindingDisplay(SymbolParameter, name, paramType),
				})
			}

			// 2. body is analyzed.
			if v.CheckBlock(
				*decl.Body,
				&fnScope,
				CheckContext{FnSig: sig},
			) != FlowReturns && len(sig.ReturnTypes) > 0 {
				v.AddError(
					decl.Position,
					fmt.Sprintf(
						"missing return statement in all branches of function %s",
						fnName,
					),
				)
				continue
			}
		}
	}

	return Result{
		Errors:      v.Errors,
		Conversions: v.Conversions,
	}
}

func (v *Validator) checkTypeCycle(t Type, s *map[string]struct{}) bool {
	cycle := false
	var seen map[string]struct{}
	if s == nil {
		seen = map[string]struct{}{}
	} else {
		seen = *s
	}

	for _, f := range t.Fields {
		if _, ok := seen[f.Type.Name]; ok {
			cycle = true
			continue
		}

		seen[f.Type.Name] = struct{}{}
		typeSym, ok := v.GlobalScope.Lookup(f.Type.Name)
		if ok {
			cycle = v.checkTypeCycle(typeSym.Type, &seen)
		}

		delete(
			seen,
			f.Type.Name,
		) // deleting in case the same type is present in a different member, which will get flagged as duplicate
	}

	if t.Alias != "" {
		if _, ok := seen[t.Alias]; ok {
			return true
		}
		seen[t.Alias] = struct{}{}
		typeSym, _ := v.GlobalScope.Lookup(t.Alias)

		cycle = v.checkTypeCycle(typeSym.Type, &seen)
		delete(
			seen,
			t.Alias,
		) // deleting in case the same type is present in a different member, which will get flagged as duplicate
	}

	return cycle
}

func (v *Validator) ResolveFields(fields []ast.RecordField) []Field {
	out := []Field{}
	for _, f := range fields {
		if _, ok := v.GlobalScope.Lookup(
			getTypeRefName(f.Type),
		); !ok &&
			!isPrimitiveType(f.Type) { // case excluded for primitive types
			v.AddError(
				f.Type.Name.Position,
				fmt.Sprintf("unknown identifier %s", f.Type.Name.Name),
			)
			return out
		}

		t := v.ResolveType(f.Type)
		if !isPrimitiveType(f.Type) {
			t.Name = f.Type.Name.Name
			t.Kind = TypeCustom
		}

		out = append(out, Field{
			Name: f.Name.Name,
			Type: t,
		})
	}
	return out
}

func (v *Validator) ResolveType(ref ast.TypeReference) Type {
	typeName := ref.Name.Name
	switch ref.Kind {
	case ast.Primitive:
		switch typeName {
		case "bool":
			return Type{Kind: TypeBool, Name: "bool"}
		case "char":
			return Type{Kind: TypeChar, Name: "char"}
		case "int8":
			return Type{Kind: TypeInt8, Name: "int8"}
		case "int16":
			return Type{Kind: TypeInt16, Name: "int16"}
		case "int32":
			return Type{Kind: TypeInt32, Name: "int32"}
		case "int64":
			return Type{Kind: TypeInt64, Name: "int64"}
		case "intsize":
			return Type{Kind: TypeIntSize, Name: "intsize"}
		case "uint8":
			return Type{Kind: TypeUInt8, Name: "uint8"}
		case "uint16":
			return Type{Kind: TypeUInt16, Name: "uint16"}
		case "uint32":
			return Type{Kind: TypeUInt32, Name: "uint32"}
		case "uint64":
			return Type{Kind: TypeUInt64, Name: "uint64"}
		case "uintsize":
			return Type{Kind: TypeUIntSize, Name: "uintsize"}
		case "float32":
			return Type{Kind: TypeFloat32, Name: "float32"}
		case "float64":
			return Type{Kind: TypeFloat64, Name: "float64"}
		case "string":
			return Type{Kind: TypeString, Name: "string"}
		}

	case ast.Custom:
		if s, ok := v.GlobalScope.Lookup(getTypeRefName(ref)); ok {
			if s.Kind == SymbolTypeDecl {
				return s.Type
			}
		}
	}

	return Type{Kind: TypeInvalid, Name: "invalid"}
}

// === Phase L (receiver methods) BEGIN ===

// lookupMethod returns the signature of method `name` on record type
// `recvType`, if one is registered.
func (v *Validator) lookupMethod(recvType, name string) (*FunctionSignature, bool) {
	if methods, ok := v.Methods[recvType]; ok {
		if sig, ok := methods[name]; ok {
			return sig, true
		}
	}
	return nil, false
}

// registerMethod validates a receiver method declaration and records its
// signature in v.Methods. Runs in pass 1.5, after every record type is defined.
func (v *Validator) registerMethod(decl ast.FunctionDeclaration) {
	recvRef := decl.Receiver.Type

	// 1. The receiver must be a reference (`&T` or `edit &T`); a by-value
	//    receiver would silently consume the value on an ordinary call.
	if !recvRef.Reference {
		v.AddError(
			decl.Receiver.Position,
			"method receiver must be a reference (`&T` or `edit &T`)",
		)
		return
	}

	// 2. The referent must be a declared record type.
	recvSym, ok := v.GlobalScope.Lookup(recvRef.Name.Name)
	if !ok || recvSym.Kind != SymbolTypeDecl || recvSym.Type.Kind != TypeCustom {
		v.AddError(recvRef.Name.Position, fmt.Sprintf(
			"method receiver must be a record type, got %s", recvRef.Name.Name,
		))
		return
	}
	recvType := recvSym.Type

	// 3. The method name must not collide with a field of the record.
	for _, f := range recvType.Fields {
		if f.Name == decl.Name {
			v.AddError(decl.Position, fmt.Sprintf(
				"method %s collides with field %s on type %s",
				decl.Name, f.Name, recvType.Name,
			))
			return
		}
	}

	// 4. No duplicate method of the same name (overloading is not yet supported).
	if _, exists := v.lookupMethod(recvType.Name, decl.Name); exists {
		v.AddError(decl.Position, fmt.Sprintf(
			"duplicate method %s on type %s", decl.Name, recvType.Name,
		))
		return
	}

	// Resolve parameter / return / error types, as for a free function.
	params := []string{}
	paramTypes := []Type{}
	for _, p := range decl.Parameters {
		params = append(params, p.Name.Name)
		paramTypes = append(paramTypes, v.ResolveType(p.Type))
	}
	returnTypes := []Type{}
	for _, r := range decl.ReturnTypes {
		returnTypes = append(returnTypes, v.ResolveType(r))
	}
	errorTypes := []Type{}
	for _, er := range decl.ErrorTypes {
		errorTypes = append(errorTypes, v.ResolveType(er))
	}

	recvCopy := recvType
	sig := &FunctionSignature{
		Name:           decl.Name,
		ParameterNames: params,
		Parameters:     paramTypes,
		ReturnTypes:    returnTypes,
		ErrorTypes:     errorTypes,
		ReceiverType:   &recvCopy,
		ReceiverName:   decl.Receiver.Name.Name,
		ReceiverEdit:   recvRef.Edit,
	}

	if v.Methods[recvType.Name] == nil {
		v.Methods[recvType.Name] = map[string]*FunctionSignature{}
	}
	v.Methods[recvType.Name][decl.Name] = sig
}

// checkMethodBody analyzes the body of a receiver method: it binds the receiver
// (read-only for `&T`, mutable for `edit &T`) and the parameters, then walks
// the body with the usual flow/return checks.
func (v *Validator) checkMethodBody(decl ast.FunctionDeclaration) {
	sig, ok := v.lookupMethod(decl.Receiver.Type.Name.Name, decl.Name)
	if !ok {
		return // registration failed; the error was already reported
	}

	fnScope := v.GlobalScope.NewScope(&v.GlobalScope)

	// The receiver replaces `this`. An `edit &T` receiver is mutable (modeled
	// as a let); a `&T` receiver is read-only (modeled as a const), so that
	// `recv.field = ...` reuses the existing "cannot assign to const" check.
	recvKind := SymbolLocalConst
	if sig.ReceiverEdit {
		recvKind = SymbolLocalLet
	}
	fnScope.Define(sig.ReceiverName, Symbol{
		Name:        sig.ReceiverName,
		Kind:        recvKind,
		Type:        *sig.ReceiverType,
		Initialized: true,
		Position:    decl.Receiver.Position,
	})

	// Bind parameters.
	seen := map[string]struct{}{}
	for i, p := range decl.Parameters {
		name := p.Name.Name
		if _, dup := seen[name]; dup {
			v.AddError(p.Position, "duplicate function parameter: "+name)
			continue
		}
		seen[name] = struct{}{}
		fnScope.Define(name, Symbol{
			Name:     name,
			Kind:     SymbolParameter,
			Type:     sig.Parameters[i],
			Position: p.Position,
		})
	}

	// Bind return / error type names (mirrors the free-function path).
	for i, rt := range sig.ReturnTypes {
		n := getTypeRefName(decl.ReturnTypes[i])
		fnScope.Define(n, Symbol{
			Name: n, Kind: SymbolReturn, Type: rt,
			Position: getTypeRefPos(decl.ReturnTypes[i]),
		})
	}
	for i, et := range sig.ErrorTypes {
		n := getTypeRefName(decl.ErrorTypes[i])
		fnScope.Define(n, Symbol{
			Name: n, Kind: SymbolError, Type: et,
			Position: getTypeRefPos(decl.ErrorTypes[i]),
		})
	}

	if v.CheckBlock(*decl.Body, &fnScope, CheckContext{FnSig: sig}) != FlowReturns &&
		len(sig.ReturnTypes) > 0 {
		v.AddError(decl.Position, fmt.Sprintf(
			"missing return statement in all branches of method %s", decl.Name,
		))
	}
}

// checkMethodCall type-checks a `recv.method(args)` call and returns its result
// type. The receiver reference is formed implicitly; capability/exclusivity
// enforcement on the auto-formed reference is deferred to the reference phase.
func (v *Validator) checkMethodCall(
	call ast.FunctionCallExpression,
	member ast.MemberAccessExpression,
	scope *Scope,
) Type {
	recv := v.CheckExpr(member.Receiver, nil, scope)
	if recv.Kind == TypeInvalid {
		return Type{Kind: TypeInvalid, Name: "invalid"} // cascade suppression
	}
	if recv.Kind != TypeCustom {
		v.AddError(member.Pos(), fmt.Sprintf(
			"type %s has no methods; cannot call %q", recv.Name, member.Member,
		))
		return Type{Kind: TypeInvalid, Name: "invalid"}
	}

	sig, ok := v.lookupMethod(recv.Name, member.Member)
	if !ok {
		v.AddError(member.Pos(), fmt.Sprintf(
			"type %s has no method %q", recv.Name, member.Member,
		))
		return Type{Kind: TypeInvalid, Name: "invalid"}
	}

	// A fallible method must be handled with `as result`.
	if len(sig.ErrorTypes) > 0 && !call.Caught {
		v.AddError(call.Pos(), fmt.Sprintf(
			"%s returns errors and therefore must be handled", member.Member,
		))
		return Type{Kind: TypeInvalid, Name: "invalid"}
	}

	// Arity.
	if len(call.Arguments) != len(sig.Parameters) {
		v.AddError(call.Pos(), fmt.Sprintf(
			"argument count mismatch for method %s, need %d, got %d",
			member.Member, len(sig.Parameters), len(call.Arguments),
		))
		return Type{Kind: TypeInvalid, Name: "invalid"}
	}

	// Argument types.
	for i, arg := range call.Arguments {
		want := sig.Parameters[i]
		argT := v.CheckExpr(arg, &want, scope)
		if argT.Kind == TypeInvalid {
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}
		if !typesMatch(want, argT) {
			v.AddError(call.Pos(), fmt.Sprintf(
				"argument %d of method %s requires type %s, got %s",
				i, member.Member, want.Name, argT.Name,
			))
			return Type{Kind: TypeInvalid, Name: "invalid"}
		}
	}

	if len(sig.ReturnTypes) > 0 {
		return sig.ReturnTypes[0]
	}
	return Type{Kind: TypeVoid, Name: "void"}
}

// === Phase L (receiver methods) END ===
