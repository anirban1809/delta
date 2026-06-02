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
	for next < len(p.Tokens) && isCommentKind(p.Tokens[next].Kind) {
		next++
	}

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
	p.skipComments()

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

// posOf is a tiny shorthand for "the Position of this token".
func posOf(t token.Token) Position {
	return Position{Line: t.Line, Column: t.Column}
}

func isCommentKind(kind token.Kind) bool {
	return kind == token.Kind_LineComment || kind == token.Kind_BlockComment
}

func (p *Parser) skipComments() {
	for isCommentKind(p.Current().Kind) {
		p.Advance()
	}
}

func (p *Parser) ParseComment() Comment {
	comment := p.Advance()
	return Comment{
		Position:  posOf(comment),
		Text:      comment.Lexeme,
		Multiline: comment.Kind == token.Kind_BlockComment,
	}
}

func (p *Parser) ParsePrimaryExpression() (Expression, bool) {
	p.skipComments()

	if p.Current().Kind == token.Kind_StringLiteral {
		tok := p.Advance()
		return StringLiteral{Position: posOf(tok), Value: tok.Lexeme}, true
	}

	if p.Current().Kind == token.Kind_CharacterLiteral {
		tok := p.Advance()
		return CharacterLiteral{Position: posOf(tok), Value: tok.Lexeme}, true
	}

	if p.Current().Kind == token.Kind_IntegerLiteral {
		tok := p.Advance()
		return IntegerLiteral{Position: posOf(tok), Value: tok.Lexeme}, true
	}

	if p.Current().Kind == token.Kind_BooleanLiteral {
		tok := p.Advance()
		return BooleanLiteral{Position: posOf(tok), Value: tok.Lexeme}, true
	}

	if p.Current().Kind == token.Kind_Identifier {
		tok := p.Advance()
		return Identifier{Position: posOf(tok), Name: tok.Lexeme}, true
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
			Position:   posOf(symbol),
			Expression: expr,
			Operator:   symbol.Lexeme,
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

	p.skipComments()
	for p.Current().Kind == token.Symbol_Asterisk ||
		p.Current().Kind == token.Symbol_FSlash {
		operator := p.Advance()
		right, ok := p.ParseUnaryExpression()
		if !ok {
			return nil, false
		}

		left = BinaryExpression{
			Position: left.Pos(),
			Left:     left,
			Operator: operator.Lexeme,
			Right:    right,
		}
		p.skipComments()
	}

	return left, true
}

func (p *Parser) ParseAdditiveExpression() (Expression, bool) {
	left, ok := p.ParseMultiplicativeExpression()
	if !ok {
		return nil, false
	}

	p.skipComments()
	for p.Current().Kind == token.Symbol_Plus ||
		p.Current().Kind == token.Symbol_Minus {
		operator := p.Advance()
		right, ok := p.ParseMultiplicativeExpression()
		if !ok {
			return nil, false
		}

		left = BinaryExpression{
			Position: left.Pos(),
			Left:     left,
			Operator: operator.Lexeme,
			Right:    right,
		}
		p.skipComments()
	}

	return left, true
}

func (p *Parser) ParseComparisionExpression() (Expression, bool) {
	left, ok := p.ParseAdditiveExpression()
	if !ok {
		return nil, false
	}

	p.skipComments()
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
			Position: left.Pos(),
			Left:     left,
			Operator: operator.Lexeme,
			Right:    right,
		}
		p.skipComments()
	}

	return left, true

}

func (p *Parser) ParseLogicalAndExpression() (Expression, bool) {
	left, ok := p.ParseComparisionExpression()
	if !ok {
		return nil, false
	}

	p.skipComments()
	for p.Current().Kind == token.Symbol_LogicalAnd {
		operator := p.Advance()
		right, ok := p.ParseComparisionExpression()
		if !ok {
			return nil, false
		}

		left = BinaryExpression{
			Position: left.Pos(),
			Left:     left,
			Operator: operator.Lexeme,
			Right:    right,
		}
		p.skipComments()
	}

	return left, true
}

func (p *Parser) ParseLogicalOrExpression() (Expression, bool) {
	left, ok := p.ParseLogicalAndExpression()
	if !ok {
		return nil, false
	}

	p.skipComments()
	for p.Current().Kind == token.Symbol_LogicalOr {
		operator := p.Advance()
		right, ok := p.ParseLogicalAndExpression()
		if !ok {
			return nil, false
		}

		left = BinaryExpression{
			Position: left.Pos(),
			Left:     left,
			Operator: operator.Lexeme,
			Right:    right,
		}
		p.skipComments()
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

	p.skipComments()
	for p.Current().Kind == token.Symbol_LeftParen {
		var arguments []Expression
		p.Advance() //consume left paren
		p.skipComments()
		if p.Current().Kind == token.Symbol_RightParen {
			arguments = []Expression{}
		} else {
			expr, ok := p.ParseExpression()
			if !ok {
				return nil, false
			}
			arguments = append(arguments, expr)
			p.skipComments()
			for p.Current().Kind == token.Symbol_Comma {
				p.Advance() //consume comma
				expr, ok := p.ParseExpression()
				if !ok {
					return nil, false
				}
				arguments = append(arguments, expr)
				p.skipComments()
			}
		}
		if _, ok := p.Expect(token.Symbol_RightParen, "expected ) symbol"); !ok {
			return nil, false
		}
		callee = FunctionCallExpression{
			Position:  callee.Pos(),
			Callee:    callee,
			Arguments: arguments,
		}
		p.skipComments()
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
	keyword := p.Advance() // consume `return`
	values := []Expression{}
	expr, ok := p.ParseExpression()

	if expr == nil {
		p.ErrorBag.RemoveLastError()
	} else {
		if !ok {
			return ReturnStatement{}, false
		}
		values = append(values, expr)
	}

	p.skipComments()
	for p.Current().Kind == token.Symbol_Comma {
		p.Advance() //consume comma
		expr, ok := p.ParseExpression()
		if !ok {
			return ReturnStatement{}, false
		}
		values = append(values, expr)
		p.skipComments()
	}

	if _, ok := p.Expect(token.Symbol_Semicolon, "; expected"); !ok {
		return ReturnStatement{}, false
	}
	return ReturnStatement{Position: posOf(keyword), Values: values}, true
}

func (p *Parser) ParseVarDeclStatement() (VariableDeclarationStatement, bool) {
	modifier := p.Advance() //consume const/let  keyword

	ident, ok := p.Expect(token.Kind_Identifier, "identifier expected")
	if !ok {
		return VariableDeclarationStatement{}, false
	}

	typeReference := TypeReference{Name: Identifier{}}
	p.skipComments()
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

	p.skipComments()
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
		Position: posOf(modifier),
		Mutable:  modifier.Kind == token.Keyword_Let,
		Name:     ident.Lexeme,
		Type:     typeReference,
		Value:    value,
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
		Position: expr.Pos(),
		Value:    expr,
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
		Position: posOf(target),
		Target:   Identifier{Position: posOf(target), Name: target.Lexeme},
		Value:    value,
	}, true
}

func (p *Parser) ParseIfElseBlock() (Statement, bool) {
	keyword := p.Advance() //consume if
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

	p.skipComments()
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
		Position:  posOf(keyword),
		ThenBlock: thenBlock,
		ElseBlock: elseBlock,
		Condition: condition,
	}, true

}

func (p *Parser) ParseWhileBlock() (WhileStatement, bool) {
	keyword := p.Advance() //consume while
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
		Position:  posOf(keyword),
		Condition: condition,
		Body:      block,
	}, true

}

func (p *Parser) ParseBlockStatement() (BlockStatement, bool) {
	// Position of a block is the `{` that opened it; the caller has already
	// consumed it, so we look back via Previous().
	openBrace := Position{}
	if p.Position > 0 {
		openBrace = posOf(p.Previous())
	}
	statements := []Statement{}

	for p.Current().Kind != token.Symbol_RightBrace {
		if isCommentKind(p.Current().Kind) {
			statements = append(statements, p.ParseComment())
			continue
		}

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
	closeBrace := posOf(p.Current())
	p.Advance() //consume right brace
	return BlockStatement{
		Position:   openBrace,
		End:        closeBrace,
		Statements: statements,
	}, true
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
		Position: posOf(paramName),
		Name: Identifier{
			Position: posOf(paramName),
			Name:     paramName.Lexeme,
		},
		Type: TypeReference{
			Name: Identifier{
				Position: posOf(paramType),
				Name:     paramType.Lexeme,
			},
		},
	}, true
}

func (p *Parser) ParseFunctionParameters() ([]FunctionParameter, bool) {
	var parameters = []FunctionParameter{}

	p.skipComments()
	if p.Current().Kind == token.Symbol_RightParen {
		p.Advance() //consume right paren
		return parameters, true
	}

	first, ok := p.ParseFunctionParameter()
	if !ok {
		return nil, false
	}
	parameters = append(parameters, first)

	p.skipComments()
	for p.Current().Kind != token.Symbol_RightParen {
		if _, ok := p.Expect(token.Symbol_Comma, "symbol , expected"); !ok {
			return nil, false
		}
		param, ok := p.ParseFunctionParameter()
		if !ok {
			return nil, false
		}
		parameters = append(parameters, param)
		p.skipComments()
	}
	if _, ok := p.Expect(token.Symbol_RightParen, "symbol ) expected"); !ok {
		return nil, false
	}

	return parameters, true
}

func (p *Parser) ParseFunctionDeclaration() (FunctionDeclaration, bool) {
	// The `function` keyword has already been consumed by ParseDeclaration;
	// use its position as the declaration's position.
	keywordPos := Position{}
	if p.Position > 0 {
		keywordPos = posOf(p.Previous())
	}
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

	p.skipComments()
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

		p.skipComments()
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
			p.skipComments()
		}

		p.skipComments()
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

			p.skipComments()
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
				p.skipComments()
			}
		}

	}

	p.skipComments()
	if _, ok := p.Expect(token.Symbol_LeftBrace, "expected { symbol"); !ok {
		return FunctionDeclaration{}, false
	}

	body, ok := p.ParseBlockStatement()
	if !ok {
		return FunctionDeclaration{}, false
	}

	return FunctionDeclaration{
		Position:    keywordPos,
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
		Position: decl.Position,
		Name:     Identifier{Position: decl.Position, Name: decl.Name},
		Type:     decl.Type,
		Value:    decl.Value,
	}, true
}

func (p *Parser) ParseDeclaration() (Declaration, bool) {
	if isCommentKind(p.Current().Kind) {
		return p.ParseComment(), true
	}

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
		case token.Keyword_Function,
			token.Keyword_Const,
			token.Kind_LineComment,
			token.Kind_BlockComment:
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
			token.Kind_LineComment,
			token.Kind_BlockComment,
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
