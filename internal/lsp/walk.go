package lsp

import "delta/internal/ast"

func walkMemberExpressions(file ast.File, visit func(ast.MemberAccessExpression)) {
	walkFileExpressions(file, func(expr ast.Expression) {
		if member, ok := expr.(ast.MemberAccessExpression); ok {
			visit(member)
		}
	})
}

func walkVariableDeclarations(file ast.File, visit func(ast.VariableDeclarationStatement)) {
	for _, declaration := range file.Declarations {
		switch decl := declaration.(type) {
		case ast.FunctionDeclaration:
			if decl.Body != nil {
				walkBlockStatements(*decl.Body, func(stmt ast.Statement) {
					if variable, ok := stmt.(ast.VariableDeclarationStatement); ok {
						visit(variable)
					}
				})
			}
		}
	}
}

func walkBlocks(file ast.File, visit func(ast.BlockStatement)) {
	for _, declaration := range file.Declarations {
		if function, ok := declaration.(ast.FunctionDeclaration); ok && function.Body != nil {
			walkNestedBlock(*function.Body, visit)
		}
	}
}

func walkNestedBlock(block ast.BlockStatement, visit func(ast.BlockStatement)) {
	visit(block)
	for _, statement := range block.Statements {
		switch stmt := statement.(type) {
		case ast.IfStatement:
			walkNestedBlock(stmt.ThenBlock, visit)
			walkNestedBlock(stmt.ElseBlock, visit)
		case ast.WhileStatement:
			walkNestedBlock(stmt.Body, visit)
		case ast.ForStatement:
			if stmt.Body != nil {
				walkNestedBlock(*stmt.Body, visit)
			}
		case ast.SwitchStatement:
			for _, current := range stmt.Cases {
				if current != nil && current.Body != nil {
					walkNestedBlock(*current.Body, visit)
				}
			}
			if stmt.Default != nil && stmt.Default.Body != nil {
				walkNestedBlock(*stmt.Default.Body, visit)
			}
		case ast.CheckStatement:
			if stmt.Body != nil {
				walkNestedBlock(*stmt.Body, visit)
			}
		case ast.FallibleStatement:
			walkStatementBlocks(stmt.Inner, visit)
		}
	}
}

func walkStatementBlocks(statement ast.Statement, visit func(ast.BlockStatement)) {
	switch stmt := statement.(type) {
	case ast.IfStatement:
		walkNestedBlock(stmt.ThenBlock, visit)
		walkNestedBlock(stmt.ElseBlock, visit)
	case ast.WhileStatement:
		walkNestedBlock(stmt.Body, visit)
	case ast.ForStatement:
		if stmt.Body != nil {
			walkNestedBlock(*stmt.Body, visit)
		}
	case ast.CheckStatement:
		if stmt.Body != nil {
			walkNestedBlock(*stmt.Body, visit)
		}
	}
}

func walkBlockStatements(block ast.BlockStatement, visit func(ast.Statement)) {
	for _, statement := range block.Statements {
		visit(statement)
		switch stmt := statement.(type) {
		case ast.IfStatement:
			walkBlockStatements(stmt.ThenBlock, visit)
			walkBlockStatements(stmt.ElseBlock, visit)
		case ast.WhileStatement:
			walkBlockStatements(stmt.Body, visit)
		case ast.ForStatement:
			if stmt.Init != nil {
				visit(stmt.Init)
			}
			if stmt.Body != nil {
				walkBlockStatements(*stmt.Body, visit)
			}
		case ast.SwitchStatement:
			for _, current := range stmt.Cases {
				if current != nil && current.Body != nil {
					walkBlockStatements(*current.Body, visit)
				}
			}
			if stmt.Default != nil && stmt.Default.Body != nil {
				walkBlockStatements(*stmt.Default.Body, visit)
			}
		case ast.CheckStatement:
			if stmt.Body != nil {
				walkBlockStatements(*stmt.Body, visit)
			}
		case ast.FallibleStatement:
			visit(stmt.Inner)
		}
	}
}

func walkFileExpressions(file ast.File, visit func(ast.Expression)) {
	for _, declaration := range file.Declarations {
		switch decl := declaration.(type) {
		case ast.FunctionDeclaration:
			if decl.Body != nil {
				walkBlockExpressions(*decl.Body, visit)
			}
		case ast.ConstDeclaration:
			walkAnyExpression(decl.Value, visit)
		}
	}
}

func walkBlockExpressions(block ast.BlockStatement, visit func(ast.Expression)) {
	for _, statement := range block.Statements {
		walkStatementExpressions(statement, visit)
	}
}

func walkStatementExpressions(statement ast.Statement, visit func(ast.Expression)) {
	switch stmt := statement.(type) {
	case ast.VariableDeclarationStatement:
		walkAnyExpression(stmt.Value, visit)
	case ast.AssignmentStatement:
		walkAnyExpression(stmt.TargetExpression, visit)
		walkAnyExpression(stmt.Value, visit)
	case ast.ExpressionStatement:
		walkAnyExpression(stmt.Value, visit)
	case ast.ReturnStatement:
		for _, value := range stmt.Values {
			walkAnyExpression(value, visit)
		}
	case ast.IfStatement:
		walkAnyExpression(stmt.Condition, visit)
		walkBlockExpressions(stmt.ThenBlock, visit)
		walkBlockExpressions(stmt.ElseBlock, visit)
	case ast.WhileStatement:
		walkAnyExpression(stmt.Condition, visit)
		walkBlockExpressions(stmt.Body, visit)
	case ast.ForStatement:
		if stmt.Init != nil {
			walkStatementExpressions(stmt.Init, visit)
		}
		walkAnyExpression(stmt.Cond, visit)
		walkAnyExpression(stmt.Step, visit)
		if stmt.Body != nil {
			walkBlockExpressions(*stmt.Body, visit)
		}
	case ast.SwitchStatement:
		walkAnyExpression(stmt.Scrutinee, visit)
		for _, current := range stmt.Cases {
			if current == nil {
				continue
			}
			for _, label := range current.Labels {
				walkAnyExpression(label, visit)
			}
			if current.Body != nil {
				walkBlockExpressions(*current.Body, visit)
			}
		}
		if stmt.Default != nil && stmt.Default.Body != nil {
			walkBlockExpressions(*stmt.Default.Body, visit)
		}
	case ast.FallibleStatement:
		walkStatementExpressions(stmt.Inner, visit)
	case ast.CheckStatement:
		if stmt.Body != nil {
			walkBlockExpressions(*stmt.Body, visit)
		}
	}
}

func walkAnyExpression(expression ast.Expression, visit func(ast.Expression)) {
	if expression == nil {
		return
	}
	visit(expression)
	switch expr := expression.(type) {
	case ast.UnaryExpression:
		walkAnyExpression(expr.Expression, visit)
	case ast.BinaryExpression:
		walkAnyExpression(expr.Left, visit)
		walkAnyExpression(expr.Right, visit)
	case ast.FunctionCallExpression:
		walkAnyExpression(expr.Callee, visit)
		for _, argument := range expr.Arguments {
			walkAnyExpression(argument, visit)
		}
	case ast.MemberAccessExpression:
		walkAnyExpression(expr.Receiver, visit)
	case ast.PostfixUnaryExpression:
		walkAnyExpression(expr.Operand, visit)
	case ast.ObjectLiteralExpression:
		for _, element := range expr.Elements {
			switch current := element.(type) {
			case ast.FieldInit:
				walkAnyExpression(current.Value, visit)
			case ast.SpreadElement:
				walkAnyExpression(current.Source, visit)
			}
		}
	}
}
