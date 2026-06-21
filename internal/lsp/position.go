package lsp

import "delta/internal/ast"

// identAt returns the identifier whose source range covers pos, or nil
// when the cursor lies outside every identifier on the document.
//
// LSP positions are 0-based; the AST is 1-based, so we shift before
// comparing. The hit window is inclusive on both ends so a cursor
// parked just after the last character still resolves — most editors
// invoke hover/definition with the cursor on the trailing edge.
func identAt(file ast.File, pos Position) *ast.Identifier {
	line, col := pos.Line+1, pos.Character+1
	var found ast.Identifier
	hit := false
	walkIdentifiers(file, func(id ast.Identifier) bool {
		if id.Line != line || id.Name == "" {
			return true
		}
		if col >= id.Column && col <= id.Column+len(id.Name) {
			found = id
			hit = true
			return false
		}
		return true
	})
	if !hit {
		return nil
	}
	return &found
}

// identRange returns the LSP-format range covering id. Identifiers
// don't span lines in this grammar.
func identRange(id ast.Identifier) Range {
	start := Position{Line: id.Line - 1, Character: id.Column - 1}
	end := Position{Line: id.Line - 1, Character: id.Column - 1 + len(id.Name)}
	return Range{Start: start, End: end}
}

// astPositionToLSP converts a 1-based ast.Position into a 0-based LSP
// Position. Used to render symbol definition ranges from DefPos.
func astPositionToLSP(p ast.Position) Position {
	return Position{Line: max(p.Line-1, 0), Character: max(p.Column-1, 0)}
}

// definitionRange returns the LSP range for a declaration site of length
// len(name) starting at defPos. The range is point-only (zero-width) when
// defPos doesn't actually point at the name token — e.g. the function
// declaration's Position is the `function` keyword, not the name.
func definitionRange(defPos ast.Position, name string) Range {
	start := astPositionToLSP(defPos)
	end := Position{Line: start.Line, Character: start.Character + len(name)}
	return Range{Start: start, End: end}
}

// walkIdentifiers calls visit on every identifier that appears anywhere
// in the file — use sites, declaration sites, type references, parameter
// names, assignment targets. visit returns false to stop the walk early.
//
// Hand-written rather than reflection-based: the AST is small and the
// walker stays trivially correct as long as every node type is covered.
// When adding a new AST node, extend the matching case here.
func walkIdentifiers(file ast.File, visit func(ast.Identifier) bool) {
	for _, d := range file.Declarations {
		if !walkDeclaration(d, visit) {
			return
		}
	}
}

func walkDeclaration(d ast.Declaration, visit func(ast.Identifier) bool) bool {
	switch decl := d.(type) {
	case ast.FunctionDeclaration:
		if !visit(ast.Identifier{
			Position: ast.Position{
				Line:   decl.Position.Line,
				Column: decl.Position.Column + len("function "),
			},
			Name: decl.Name,
		}) {
			return false
		}
		for _, p := range decl.Parameters {
			if !visit(p.Name) {
				return false
			}
			if !visit(p.Type.Name) {
				return false
			}
		}
		for _, r := range decl.ReturnTypes {
			if !visit(r.Name) {
				return false
			}
		}
		for _, e := range decl.ErrorTypes {
			if !visit(e.Name) {
				return false
			}
		}
		if decl.Body != nil {
			if !walkBlock(*decl.Body, visit) {
				return false
			}
		}
	case ast.ConstDeclaration:
		if !visit(decl.Name) {
			return false
		}
		if !visit(decl.Type.Name) {
			return false
		}
		return walkExpression(decl.Value, visit)
	case ast.TypeDeclaration:
		if !visit(decl.Name) {
			return false
		}
		return walkTypeRHS(decl.RHS, visit)
	}
	return true
}

// walkTypeRHS visits the type-reference identifiers inside a `type`
// declaration body so hover and go-to-definition resolve type names used
// in record fields, aliases, and spread/intersection composition (Phase K).
func walkTypeRHS(rhs ast.TypeRHS, visit func(ast.Identifier) bool) bool {
	switch r := rhs.(type) {
	case ast.RecordRHS:
		for _, f := range r.Fields {
			if !visit(f.Name) {
				return false
			}
			if !visit(f.Type.Name) {
				return false
			}
		}
	case ast.AliasRHS:
		return visit(r.Target.Name)
	case ast.CompositionRHS:
		for _, op := range r.Operands {
			if op.Named != nil {
				if !visit(op.Named.Name) {
					return false
				}
			}
			if op.Inline != nil {
				if !walkTypeRHS(*op.Inline, visit) {
					return false
				}
			}
		}
	}
	return true
}

func walkBlock(b ast.BlockStatement, visit func(ast.Identifier) bool) bool {
	for _, s := range b.Statements {
		if !walkStatement(s, visit) {
			return false
		}
	}
	return true
}

func walkStatement(s ast.Statement, visit func(ast.Identifier) bool) bool {
	switch stmt := s.(type) {
	case ast.VariableDeclarationStatement:
		nameColumn := stmt.Column + len("const ")
		if stmt.Mutable {
			nameColumn = stmt.Column + len("let ")
		}
		if !visit(ast.Identifier{
			Position: ast.Position{Line: stmt.Line, Column: nameColumn},
			Name:     stmt.Name,
		}) {
			return false
		}
		if !visit(stmt.Type.Name) {
			return false
		}
		return walkExpression(stmt.Value, visit)
	case ast.AssignmentStatement:
		// A member-access target (`v.f = e`, Phase K) is carried by
		// TargetExpression; a plain identifier target by Target.
		if stmt.TargetExpression != nil {
			if !walkExpression(stmt.TargetExpression, visit) {
				return false
			}
		} else if !visit(stmt.Target) {
			return false
		}
		return walkExpression(stmt.Value, visit)
	case ast.ExpressionStatement:
		return walkExpression(stmt.Value, visit)
	case ast.IfStatement:
		if !walkExpression(stmt.Condition, visit) {
			return false
		}
		if !walkBlock(stmt.ThenBlock, visit) {
			return false
		}
		return walkBlock(stmt.ElseBlock, visit)
	case ast.WhileStatement:
		if !walkExpression(stmt.Condition, visit) {
			return false
		}
		return walkBlock(stmt.Body, visit)
	case ast.ForStatement:
		if stmt.Init != nil {
			if !walkStatement(stmt.Init, visit) {
				return false
			}
		}
		if !walkExpression(stmt.Cond, visit) {
			return false
		}
		if !walkExpression(stmt.Step, visit) {
			return false
		}
		if stmt.Body != nil {
			return walkBlock(*stmt.Body, visit)
		}
	case ast.SwitchStatement:
		if !walkExpression(stmt.Scrutinee, visit) {
			return false
		}
		for _, c := range stmt.Cases {
			if !walkSwitchCase(c, visit) {
				return false
			}
		}
		return walkSwitchCase(stmt.Default, visit)
	case ast.ReturnStatement:
		for _, v := range stmt.Values {
			if !walkExpression(v, visit) {
				return false
			}
		}
	case ast.FallibleStatement:
		if !walkStatement(stmt.Inner, visit) {
			return false
		}
		return visit(stmt.Result)
	case ast.CheckStatement:
		if !visit(stmt.Result) {
			return false
		}
		if stmt.Body != nil {
			return walkBlock(*stmt.Body, visit)
		}
	}
	return true
}

func walkSwitchCase(c *ast.SwitchCase, visit func(ast.Identifier) bool) bool {
	if c == nil {
		return true
	}
	for _, label := range c.Labels {
		if !walkExpression(label, visit) {
			return false
		}
	}
	if c.Body != nil {
		return walkBlock(*c.Body, visit)
	}
	return true
}

func walkExpression(e ast.Expression, visit func(ast.Identifier) bool) bool {
	switch expr := e.(type) {
	case ast.Identifier:
		return visit(expr)
	case ast.UnaryExpression:
		return walkExpression(expr.Expression, visit)
	case ast.BinaryExpression:
		if !walkExpression(expr.Left, visit) {
			return false
		}
		return walkExpression(expr.Right, visit)
	case ast.FunctionCallExpression:
		if !walkExpression(expr.Callee, visit) {
			return false
		}
		for _, a := range expr.Arguments {
			if !walkExpression(a, visit) {
				return false
			}
		}
	case ast.MemberAccessExpression:
		// Member is a bare field name, not a resolvable identifier; only
		// the receiver carries a symbol to hover/jump to (Phase K).
		return walkExpression(expr.Receiver, visit)
	case ast.PostfixUnaryExpression:
		return walkExpression(expr.Operand, visit)
	case ast.ObjectLiteralExpression:
		for _, el := range expr.Elements {
			switch e := el.(type) {
			case ast.FieldInit:
				if !walkExpression(e.Value, visit) {
					return false
				}
			case ast.SpreadElement:
				if !walkExpression(e.Source, visit) {
					return false
				}
			}
		}
	}
	return true
}
