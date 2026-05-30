package ast

import (
	"delta/internal/diagnostics"
	"delta/internal/token"
)

type Parser struct {
	Tokens   []token.Token
	Position int
	ErrorBag *diagnostics.ErrorBag
}

func (p *Parser) Current() token.Token {
	return p.Tokens[p.Position]
}

func (p *Parser) Previous() token.Token {
	return p.Tokens[p.Position-1]
}

func (p *Parser) Peek() token.Token {
	next := p.Position + 1
	if next >= len(p.Tokens) {
		return p.Tokens[len(p.Tokens)-1]
	}

	return p.Tokens[next]
}

func (p *Parser) Advance() token.Token {
	current := p.Tokens[p.Position]
	p.Position++
	return current
}

func (p *Parser) Check(kind token.Kind) bool {
	return p.Current().Kind == kind
}

func (p *Parser) Expect(kind token.Kind, message string) (token.Token, bool) {
	if p.Current().Kind == kind {
		return p.Advance(), true
	}

	//special handling for semicolon
	if kind == token.Symbol_Semicolon {
		line := p.Current().Line
		column := p.Current().Column
		if p.Position > 0 {
			previous := p.Previous()
			line = previous.Line
			column = previous.Column + len([]rune(previous.Lexeme))
		}
		p.addError(line, column, message)
		return token.Token{}, false
	}

	current := p.Current()
	p.addError(current.Line, current.Column, message)
	return token.Token{}, false
}

func (p *Parser) HasErrors() bool {
	return p.ErrorBag != nil && len(p.ErrorBag.Errors) > 0
}

func (p *Parser) addError(line int, column int, message string) {
	if p.ErrorBag == nil {
		return
	}

	p.ErrorBag.AddError(diagnostics.SourceError{
		Stage:    diagnostics.Parser,
		Severity: diagnostics.Error,
		Line:     line,
		Column:   column,
		Message:  message,
	})
}

func (p *Parser) ParsePrimaryExpression() (Expression, bool) {

	if p.Current().Kind == token.Kind_StringLiteral {
		return StringLiteral{
			Value: p.Advance().Lexeme,
		}, true
	}

	if p.Current().Kind == token.Kind_CharacterLiteral {
		return CharacterLiteral{
			Value: p.Advance().Lexeme,
		}, true
	}

	if p.Current().Kind == token.Kind_IntegerLiteral {
		return IntegerLiteral{
			Value: p.Advance().Lexeme,
		}, true
	}

	if p.Current().Kind == token.Kind_BooleanLiteral {
		return BooleanLiteral{
			Value: p.Advance().Lexeme,
		}, true
	}

	if p.Current().Kind == token.Kind_Identifier {
		return Identifier{
			Name: p.Advance().Lexeme,
		}, true
	}

	if p.Current().Kind == token.Symbol_LeftParen {
		p.Advance() //consume left paren
		inner, ok := p.ParseExpression()
		if !ok {
			return nil, false
		}
		if _, ok := p.Expect(token.Symbol_RightParen, ") symbol expected"); !ok {
			return nil, false
		}

		return inner, true
	}

	current := p.Current()
	p.addError(current.Line, current.Column, "invalid expression")
	return nil, false
}

func (p *Parser) ParseUnaryExpression() (Expression, bool) {
	symbol := p.Current()

	var expr Expression

	if symbol.Kind == token.Symbol_Not || symbol.Kind == token.Symbol_Minus {
		p.Advance()
		expr, ok := p.ParseUnaryExpression()
		if !ok {
			return nil, false
		}

		return UnaryExpression{
			expression: expr,
			operator:   symbol.Lexeme,
		}, true

	}

	expr, ok := p.ParseFunctionCallExpression()
	if !ok {
		return nil, false
	}

	return expr, true
}

func (p *Parser) ParseMultiplicativeExpression() (Expression, bool) {
	left, ok := p.ParseUnaryExpression()
	if !ok {
		return nil, false
	}

	for p.Current().Kind == token.Symbol_Asterisk ||
		p.Current().Kind == token.Symbol_FSlash {
		operator := p.Advance()
		right, ok := p.ParseUnaryExpression()
		if !ok {
			return nil, false
		}

		left = BinaryExpression{
			left:     left,
			operator: operator.Lexeme,
			right:    right,
		}
	}

	return left, true
}

func (p *Parser) ParseAdditiveExpression() (Expression, bool) {
	left, ok := p.ParseMultiplicativeExpression()
	if !ok {
		return nil, false
	}

	for p.Current().Kind == token.Symbol_Plus ||
		p.Current().Kind == token.Symbol_Minus {
		operator := p.Advance()
		right, ok := p.ParseMultiplicativeExpression()
		if !ok {
			return nil, false
		}

		left = BinaryExpression{
			left:     left,
			operator: operator.Lexeme,
			right:    right,
		}
	}

	return left, true
}

func (p *Parser) ParseComparisionExpression() (Expression, bool) {
	left, ok := p.ParseAdditiveExpression()
	if !ok {
		return nil, false
	}

	for p.Current().Kind == token.Symbol_Less ||
		p.Current().Kind == token.Symbol_LessEq ||
		p.Current().Kind == token.Symbol_Greater ||
		p.Current().Kind == token.Symbol_GreaterEq ||
		p.Current().Kind == token.Symbol_Equality ||
		p.Current().Kind == token.Symbol_NotEquals {
		operator := p.Advance()
		right, ok := p.ParseAdditiveExpression()
		if !ok {
			return nil, false
		}

		left = BinaryExpression{
			left:     left,
			operator: operator.Lexeme,
			right:    right,
		}
	}

	return left, true

}

func (p *Parser) ParseLogicalAndExpression() (Expression, bool) {
	left, ok := p.ParseComparisionExpression()
	if !ok {
		return nil, false
	}

	for p.Current().Kind == token.Symbol_LogicalAnd {
		operator := p.Advance()
		right, ok := p.ParseComparisionExpression()
		if !ok {
			return nil, false
		}

		left = BinaryExpression{
			left:     left,
			operator: operator.Lexeme,
			right:    right,
		}
	}

	return left, true
}

func (p *Parser) ParseLogicalOrExpression() (Expression, bool) {
	left, ok := p.ParseLogicalAndExpression()
	if !ok {
		return nil, false
	}

	for p.Current().Kind == token.Symbol_LogicalOr {
		operator := p.Advance()
		right, ok := p.ParseLogicalAndExpression()
		if !ok {
			return nil, false
		}

		left = BinaryExpression{
			left:     left,
			operator: operator.Lexeme,
			right:    right,
		}
	}

	return left, true
}

func (p *Parser) ParseLogicalExpression() (Expression, bool) {
	return p.ParseLogicalOrExpression()
}

func (p *Parser) ParseFunctionCallExpression() (Expression, bool) {
	callee, ok := p.ParsePrimaryExpression()
	if !ok {
		return nil, false
	}

	for p.Current().Kind == token.Symbol_LeftParen {
		var arguments []Expression
		p.Advance() //consume left paren
		if p.Current().Kind == token.Symbol_RightParen {
			arguments = []Expression{}
		} else {
			expr, ok := p.ParseExpression()
			if !ok {
				return nil, false
			}
			arguments = append(arguments, expr)
			for p.Current().Kind == token.Symbol_Comma {
				p.Advance() //consume comma
				expr, ok := p.ParseExpression()
				if !ok {
					return nil, false
				}
				arguments = append(arguments, expr)
			}
		}
		if _, ok := p.Expect(token.Symbol_RightParen, "expected ) symbol"); !ok {
			return nil, false
		}
		callee = FunctionCallExpression{
			Callee:    callee,
			Arguments: arguments,
		}
	}

	return callee, true
}

// order of parsing
// AssignmentExpo
// MemberExpr
// FunctionCall
// LogicalExpr
// ComparisonExpr
// AdditiveExpr
// MultiplicitaveExpr
// UnaryExpr
// PrimaryExpr
func (p *Parser) ParseExpression() (Expression, bool) {
	return p.ParseLogicalExpression()
}

func (p *Parser) ParseReturnStatement() (ReturnStatement, bool) {
	values := []Expression{}
	p.Advance()
	expr, ok := p.ParseExpression()
	if !ok {
		return ReturnStatement{}, false
	}
	values = append(values, expr)

	for p.Current().Kind == token.Symbol_Comma {
		p.Advance() //consume comma
		expr, ok := p.ParseExpression()
		if !ok {
			return ReturnStatement{}, false
		}
		values = append(values, expr)
	}

	if _, ok := p.Expect(token.Symbol_Semicolon, "; expected"); !ok {
		return ReturnStatement{}, false
	}
	return ReturnStatement{Values: values}, true
}

func (p *Parser) ParseVarDeclStatement() (VariableDeclarationStatement, bool) {
	modifier := p.Advance() //consume const/let  keyword

	ident, ok := p.Expect(token.Kind_Identifier, "identifier expected")
	if !ok {
		return VariableDeclarationStatement{}, false
	}

	typeReference := TypeReference{Name: Identifier{}}
	if p.Current().Kind == token.Symbol_Colon {
		p.Advance() // consume colon
		typeIdentifier, ok := p.Expect(
			token.Kind_Identifier,
			"type identifier expected",
		)
		if !ok {
			return VariableDeclarationStatement{}, false
		}
		typeReference = TypeReference{
			Name: Identifier{Name: typeIdentifier.Lexeme},
		}
	}

	if _, ok := p.Expect(token.Symbol_Equals, "symbol = expected"); !ok {
		return VariableDeclarationStatement{}, false
	}

	value, ok := p.ParseExpression()
	if !ok {
		return VariableDeclarationStatement{}, false
	}

	if _, ok := p.Expect(token.Symbol_Semicolon, "; expected"); !ok {
		return VariableDeclarationStatement{}, false
	}

	return VariableDeclarationStatement{
		Mutable: modifier.Kind == token.Keyword_Let,
		Name:    ident.Lexeme,
		Type:    typeReference,
		Value:   value,
	}, true

}

func (p *Parser) ParseExpressionStatement() (ExpressionStatement, bool) {
	expr, ok := p.ParseExpression()
	if !ok {
		return ExpressionStatement{}, false
	}

	if _, ok := p.Expect(token.Symbol_Semicolon, "; expected"); !ok {
		return ExpressionStatement{}, false
	}

	return ExpressionStatement{
		Value: expr,
	}, true
}

func (p *Parser) ParseAssignmentStatement() (AssignmentStatement, bool) {
	target := p.Advance() // consume identifier

	if _, ok := p.Expect(token.Symbol_Equals, "symbol '=' expected"); !ok {
		return AssignmentStatement{}, false
	}

	value, ok := p.ParseExpression()
	if !ok {
		return AssignmentStatement{}, false
	}

	if _, ok := p.Expect(token.Symbol_Semicolon, "symbol ';' expected"); !ok {
		return AssignmentStatement{}, false
	}

	return AssignmentStatement{
		Target: Identifier{Name: target.Lexeme},
		Value:  value,
	}, true
}

func (p *Parser) ParseIfElseBlock() (Statement, bool) {
	p.Advance() //consume if
	if _, ok := p.Expect(token.Symbol_LeftParen, "symbol ( expected"); !ok {
		return nil, false
	}

	condition, ok := p.ParseExpression()
	if !ok {
		return nil, false
	}
	if _, ok := p.Expect(token.Symbol_RightParen, "symbol ) expected"); !ok {
		return nil, false
	}

	if _, ok := p.Expect(token.Symbol_LeftBrace, "symbol { expected"); !ok {
		return nil, false
	}

	thenBlock, ok := p.ParseBlockStatement()
	if !ok {
		return nil, false
	}

	var elseBlock BlockStatement

	if p.Current().Kind == token.Keyword_Else {
		p.Advance() //consume else
		if _, ok := p.Expect(token.Symbol_LeftBrace, "symbol { expected"); !ok {
			return nil, false
		}
		elseBlock, ok = p.ParseBlockStatement()
		if !ok {
			return nil, false
		}
	}

	return IfStatement{
		ThenBlock: thenBlock,
		ElseBlock: elseBlock,
		Condition: condition,
	}, true

}

func (p *Parser) ParseWhileBlock() (WhileStatement, bool) {
	p.Advance() //consume while
	if _, ok := p.Expect(token.Symbol_LeftParen, "symbol ( expected"); !ok {
		return WhileStatement{}, false
	}

	condition, ok := p.ParseExpression()
	if !ok {
		return WhileStatement{}, false
	}
	if _, ok := p.Expect(token.Symbol_RightParen, "symbol ) expected"); !ok {
		return WhileStatement{}, false
	}

	if _, ok := p.Expect(token.Symbol_LeftBrace, "symbol { expected"); !ok {
		return WhileStatement{}, false
	}

	block, ok := p.ParseBlockStatement()
	if !ok {
		return WhileStatement{}, false
	}
	return WhileStatement{
		Condition: condition,
		Body:      block,
	}, true

}

func (p *Parser) ParseBlockStatement() (BlockStatement, bool) {
	statements := []Statement{}

	for p.Current().Kind != token.Symbol_RightBrace {
		if p.Current().Kind == token.Kind_EOF {
			current := p.Current()
			p.addError(
				current.Line,
				current.Column,
				"reached the end of file while parsing",
			)
			return BlockStatement{}, false
		}

		start := p.Position
		if p.Current().Kind == token.Keyword_Return {
			returnStatement, ok := p.ParseReturnStatement()
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, returnStatement)
			continue
		}

		if p.Current().Kind == token.Keyword_Const ||
			p.Current().Kind == token.Keyword_Let {
			constStatement, ok := p.ParseVarDeclStatement()
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, constStatement)
			continue
		}

		if p.Current().Kind == token.Kind_Identifier &&
			p.Peek().Kind == token.Symbol_Equals {
			constStatement, ok := p.ParseAssignmentStatement()
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, constStatement)
			continue
		}

		if p.Current().Kind == token.Keyword_If {
			constStatement, ok := p.ParseIfElseBlock()
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, constStatement)
			continue
		}

		if p.Current().Kind == token.Keyword_While {
			constStatement, ok := p.ParseWhileBlock()
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, constStatement)
			continue
		}

		expr, ok := p.ParseExpressionStatement()
		if !ok {
			p.synchronizeStatement(start)
			continue
		}

		statements = append(statements, expr)

	}
	p.Advance() //consume right brace
	return BlockStatement{Statements: statements}, true
}

func (p *Parser) ParseFunctionParameter() (FunctionParameter, bool) {
	paramName, ok := p.Expect(token.Kind_Identifier, "identifier expected")
	if !ok {
		return FunctionParameter{}, false
	}
	if _, ok := p.Expect(token.Symbol_Colon, "Symbol : expected"); !ok {
		return FunctionParameter{}, false
	}
	paramType, ok := p.Expect(token.Kind_Identifier, "identifier expected")
	if !ok {
		return FunctionParameter{}, false
	}

	return FunctionParameter{
		Name: Identifier{Name: paramName.Lexeme},
		Type: TypeReference{Name: Identifier{Name: paramType.Lexeme}},
	}, true
}

func (p *Parser) ParseFunctionParameters() ([]FunctionParameter, bool) {
	var parameters = []FunctionParameter{}

	if p.Current().Kind == token.Symbol_RightParen {
		p.Advance() //consume right paren
		return parameters, true
	}

	first, ok := p.ParseFunctionParameter()
	if !ok {
		return nil, false
	}
	parameters = append(parameters, first)

	for p.Current().Kind != token.Symbol_RightParen {
		if _, ok := p.Expect(token.Symbol_Comma, "symbol , expected"); !ok {
			return nil, false
		}
		param, ok := p.ParseFunctionParameter()
		if !ok {
			return nil, false
		}
		parameters = append(parameters, param)
	}
	if _, ok := p.Expect(token.Symbol_RightParen, "symbol ) expected"); !ok {
		return nil, false
	}

	return parameters, true
}

func (p *Parser) ParseFunctionDeclaration() (FunctionDeclaration, bool) {
	functionName, ok := p.Expect(token.Kind_Identifier, "identifier expected")
	if !ok {
		return FunctionDeclaration{}, false
	}

	if _, ok := p.Expect(token.Symbol_LeftParen, "expected '(' symbol"); !ok {
		return FunctionDeclaration{}, false
	}

	parameters, ok := p.ParseFunctionParameters()
	if !ok {
		return FunctionDeclaration{}, false
	}

	returns := []TypeReference{}
	errors := []TypeReference{}

	if p.Current().Kind == token.Symbol_Colon {
		p.Advance() //consume colon
		returnTypeToken, ok := p.Expect(
			token.Kind_Identifier,
			"identifier expected",
		)
		if !ok {
			return FunctionDeclaration{}, false
		}
		returns = append(
			returns,
			TypeReference{Name: Identifier{Name: returnTypeToken.Lexeme}},
		)

		for p.Current().Kind == token.Symbol_Comma {
			p.Advance() // consume comma
			returnTypeToken, ok := p.Expect(
				token.Kind_Identifier,
				"identifier expected",
			)
			if !ok {
				return FunctionDeclaration{}, false
			}
			returns = append(
				returns,
				TypeReference{Name: Identifier{Name: returnTypeToken.Lexeme}},
			)
		}

		if p.Current().Kind == token.Symbol_Pipe {
			p.Advance() //consume | symbol
			errorType, ok := p.Expect(
				token.Kind_Identifier,
				"identifier expected",
			)
			if !ok {
				return FunctionDeclaration{}, false
			}

			errors = append(
				errors,
				TypeReference{Name: Identifier{Name: errorType.Lexeme}},
			)

			for p.Current().Kind == token.Symbol_Comma {
				p.Advance() // consume comma
				errorType, ok := p.Expect(
					token.Kind_Identifier,
					"identifier expected",
				)
				if !ok {
					return FunctionDeclaration{}, false
				}
				errors = append(
					errors,
					TypeReference{Name: Identifier{Name: errorType.Lexeme}},
				)
			}
		}

	}

	if _, ok := p.Expect(token.Symbol_LeftBrace, "expected { symbol"); !ok {
		return FunctionDeclaration{}, false
	}

	body, ok := p.ParseBlockStatement()
	if !ok {
		return FunctionDeclaration{}, false
	}

	return FunctionDeclaration{
		Name:        functionName.Lexeme,
		Parameters:  parameters,
		ReturnTypes: returns,
		ErrorTypes:  errors,
		Body:        &body,
	}, true
}

func (p *Parser) ParseConstDeclaration() (ConstDeclaration, bool) {
	decl, ok := p.ParseVarDeclStatement()
	if !ok {
		return ConstDeclaration{}, false
	}

	return ConstDeclaration{
		Name:  Identifier{Name: decl.Name},
		Type:  decl.Type,
		Value: decl.Value,
	}, true
}

func (p *Parser) ParseDeclaration() (Declaration, bool) {
	if p.Current().Kind == token.Keyword_Function {
		p.Advance()
		declaration, ok := p.ParseFunctionDeclaration()
		if !ok {
			return nil, false
		}

		return declaration, true
	}

	if p.Current().Kind == token.Keyword_Const ||
		p.Current().Kind == token.Keyword_Let {
		if p.Current().Kind == token.Keyword_Let {
			current := p.Current()
			p.addError(
				current.Line,
				current.Column,
				"let is not allowed at file scope",
			)
			return nil, false
		}

		declaration, ok := p.ParseConstDeclaration()
		if !ok {
			return nil, false
		}

		return declaration, true
	}

	current := p.Current()
	p.addError(current.Line, current.Column, "failed to parse declaration")
	return nil, false
}

func (p *Parser) synchronizeDeclaration(start int) {
	if p.Position == start && p.Current().Kind != token.Kind_EOF {
		p.Advance()
	}

	for p.Current().Kind != token.Kind_EOF {
		switch p.Current().Kind {
		case token.Keyword_Function, token.Keyword_Const:
			return
		default:
			p.Advance()
		}
	}
}

func (p *Parser) synchronizeStatement(start int) {
	if p.Position == start && p.Current().Kind != token.Kind_EOF {
		p.Advance()
	}

	for p.Current().Kind != token.Kind_EOF {
		if p.Position > 0 && p.Previous().Kind == token.Symbol_Semicolon {
			return
		}

		switch p.Current().Kind {
		case token.Keyword_Return,
			token.Keyword_Const,
			token.Keyword_Let,
			token.Keyword_If,
			token.Keyword_While,
			token.Symbol_RightBrace:
			return
		default:
			p.Advance()
		}
	}
}

func (p *Parser) Parse() File {
	file := File{}
	for p.Current().Kind != token.Kind_EOF {
		start := p.Position
		declaration, ok := p.ParseDeclaration()
		if !ok {
			p.synchronizeDeclaration(start)
			continue
		}
		file.Declarations = append(file.Declarations, declaration)
	}
	return file
}
