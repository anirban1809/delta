package ast

import (
	"delta/internal/diagnostics"
	"delta/internal/token"
)

type Parser struct {
	Tokens    []token.Token
	Position  int
	ErrorBag  *diagnostics.ErrorBag
	loopDepth int
	// declaredTypes maps a declared type name to its canonical
	// TypeReference so that later references reuse the existing type
	// instead of allocating a fresh one.
	declaredTypes map[string]*TypeReference
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

	// special handling for semicolon
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

// isAssignmentOperator reports whether kind begins an assignment statement:
// plain `=` or a compound `+=` / `-=` / `*=`.
func isAssignmentOperator(kind token.Kind) bool {
	switch kind {
	case token.Symbol_Equals,
		token.Symbol_PlusEquals,
		token.Symbol_MinusEquals,
		token.Symbol_AsteriskEquals:
		return true
	default:
		return false
	}
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

	if p.Current().Kind == token.Symbol_LeftBrace {
		return p.ParseObjectLiteralExpression()
	}

	if p.Current().Kind == token.Kind_StringLiteral {
		tok := p.Advance()
		return StringLiteral{
			Position: posOf(tok),
			Value:    tok.Lexeme,
		}, true
	}

	if p.Current().Kind == token.Kind_CharacterLiteral {
		tok := p.Advance()
		return CharacterLiteral{
			Position: posOf(tok),
			Value:    tok.Lexeme,
		}, true
	}

	if p.Current().Kind == token.Kind_IntegerLiteral {
		tok := p.Advance()
		return IntegerLiteral{
			Position: posOf(tok),
			Value:    tok.Lexeme,
		}, true
	}

	if p.Current().Kind == token.Kind_FloatLiteral {
		tok := p.Advance()
		return FloatLiteral{
			Position: posOf(tok),
			Value:    tok.Lexeme,
		}, true
	}

	if p.Current().Kind == token.Kind_BooleanLiteral {
		tok := p.Advance()
		return BooleanLiteral{
			Position: posOf(tok),
			Value:    tok.Lexeme,
		}, true
	}

	if p.Current().Kind == token.Kind_Identifier {
		tok := p.Advance()
		return Identifier{Position: posOf(tok), Name: tok.Lexeme}, true
	}

	if p.Current().Kind == token.Symbol_LeftParen {
		p.Advance() // consume left paren
		inner, ok := p.ParseExpression()
		if !ok {
			return nil, false
		}
		if _, ok := p.Expect(
			token.Symbol_RightParen,
			") symbol expected",
		); !ok {
			return nil, false
		}

		return inner, true
	}

	current := p.Current()
	p.addError(current.Line, current.Column, "invalid expression")
	return nil, false
}

func (p *Parser) ParseObjectLiteralExpression() (Expression, bool) {
	open := p.Advance()
	elements := []ObjectLiteralElement{}

	p.skipComments()
	for p.Current().Kind != token.Symbol_RightBrace {
		if p.Current().Kind == token.Kind_EOF {
			p.addError(
				open.Line,
				open.Column,
				"unterminated object literal",
			)
			return nil, false
		}

		if p.Current().Kind == token.Symbol_Ellipsis {
			spread := p.Advance()
			source, ok := p.ParseExpression()
			if !ok {
				return nil, false
			}
			elements = append(elements, SpreadElement{
				Position: posOf(spread),
				Source:   source,
			})
		} else {
			name, ok := p.Expect(
				token.Kind_Identifier,
				"field name expected",
			)
			if !ok {
				return nil, false
			}
			if _, ok := p.Expect(
				token.Symbol_Colon,
				"symbol : expected",
			); !ok {
				return nil, false
			}
			value, ok := p.ParseExpression()
			if !ok {
				return nil, false
			}
			elements = append(elements, FieldInit{
				Position: posOf(name),
				Name:     name.Lexeme,
				Value:    value,
			})
		}

		p.skipComments()
		if p.Current().Kind == token.Symbol_RightBrace {
			break
		}
		if _, ok := p.Expect(
			token.Symbol_Comma,
			"symbol , expected",
		); !ok {
			return nil, false
		}
		p.skipComments()
		if p.Current().Kind == token.Symbol_RightBrace {
			break
		}
	}

	if _, ok := p.Expect(
		token.Symbol_RightBrace,
		"symbol } expected",
	); !ok {
		return nil, false
	}
	return ObjectLiteralExpression{
		Position: posOf(open),
		Elements: elements,
	}, true
}

func (p *Parser) ParseUnaryExpression() (Expression, bool) {
	symbol := p.Current()

	var expr Expression

	if symbol.Kind == token.Symbol_Not ||
		symbol.Kind == token.Symbol_Minus ||
		symbol.Kind == token.Symbol_Tilde {
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

	expr, ok := p.ParsePostfixExpression()
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
		p.Current().Kind == token.Symbol_FSlash ||
		p.Current().Kind == token.Symbol_Percent {
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

// ParseShiftExpression handles `<<` and `>>`, which in C bind tighter than the
// relational operators but looser than additive ones.
func (p *Parser) ParseShiftExpression() (Expression, bool) {
	left, ok := p.ParseAdditiveExpression()
	if !ok {
		return nil, false
	}

	p.skipComments()
	for p.Current().Kind == token.Symbol_ShiftLeft ||
		p.Current().Kind == token.Symbol_ShiftRight {
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

func (p *Parser) ParseComparisionExpression() (Expression, bool) {
	left, ok := p.ParseShiftExpression()
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
		right, ok := p.ParseShiftExpression()
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

// Bitwise binary operators sit between comparison and logical-and, binding
// tighter than `&&`/`||` but looser than any comparison. Among themselves the
// C precedence holds: `&` (tightest) > `^` > `|` (loosest).
func (p *Parser) ParseBitwiseAndExpression() (Expression, bool) {
	left, ok := p.ParseComparisionExpression()
	if !ok {
		return nil, false
	}

	p.skipComments()
	for p.Current().Kind == token.Symbol_Ampersand {
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

func (p *Parser) ParseBitwiseXorExpression() (Expression, bool) {
	left, ok := p.ParseBitwiseAndExpression()
	if !ok {
		return nil, false
	}

	p.skipComments()
	for p.Current().Kind == token.Symbol_Caret {
		operator := p.Advance()
		right, ok := p.ParseBitwiseAndExpression()
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

func (p *Parser) ParseBitwiseOrExpression() (Expression, bool) {
	left, ok := p.ParseBitwiseXorExpression()
	if !ok {
		return nil, false
	}

	p.skipComments()
	for p.Current().Kind == token.Symbol_Pipe {
		operator := p.Advance()
		right, ok := p.ParseBitwiseXorExpression()
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
	left, ok := p.ParseBitwiseOrExpression()
	if !ok {
		return nil, false
	}

	p.skipComments()
	for p.Current().Kind == token.Symbol_LogicalAnd {
		operator := p.Advance()
		right, ok := p.ParseBitwiseOrExpression()
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

func (p *Parser) ParsePostfixExpression() (Expression, bool) {
	expr, ok := p.ParsePrimaryExpression()
	if !ok {
		return nil, false
	}

	for {
		p.skipComments()
		switch p.Current().Kind {
		case token.Symbol_LeftParen:
			expr, ok = p.ParseFunctionCallExpression(expr)
			if !ok {
				return nil, false
			}
		case token.Symbol_Dot:
			expr, ok = p.ParseMemberAccessExpression(expr)
			if !ok {
				return nil, false
			}
		case token.Symbol_Increment, token.Symbol_Decrement:
			return PostfixUnaryExpression{
				Position: expr.Pos(),
				Operand:  expr,
				Operator: p.Advance().Lexeme,
			}, true
		default:
			return expr, true
		}
	}
}

func (p *Parser) ParseMemberAccessExpression(
	receiver Expression,
) (Expression, bool) {
	p.Advance() // consume dot
	member, ok := p.Expect(token.Kind_Identifier, "member name expected")
	if !ok {
		return nil, false
	}
	return MemberAccessExpression{
		Position: posOf(member),
		Receiver: receiver,
		Member:   member.Lexeme,
	}, true
}

func (p *Parser) ParseFunctionCallExpression(
	callee Expression,
) (Expression, bool) {
	p.skipComments()
	for p.Current().Kind == token.Symbol_LeftParen {
		var arguments []Expression
		p.Advance() // consume left paren
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
				p.Advance() // consume comma
				expr, ok := p.ParseExpression()
				if !ok {
					return nil, false
				}
				arguments = append(arguments, expr)
				p.skipComments()
			}
		}
		if _, ok := p.Expect(
			token.Symbol_RightParen,
			"expected ) symbol",
		); !ok {
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

// ParseExpression order of parsing
// AssignmentExpo
// MemberExpr
// FunctionCall
// LogicalExpr        (|| then &&)
// BitwiseExpr        (| then ^ then &)
// ComparisonExpr
// AdditiveExpr
// MultiplicitaveExpr
// UnaryExpr          (! - ~)
// PrimaryExpr
func (p *Parser) ParseExpression() (Expression, bool) {
	return p.ParseLogicalExpression()
}

func (p *Parser) ParseReturnStatement(
	checkBlock bool,
) (ReturnStatement, bool) {
	keyword := p.Advance() // consume `return`
	error := false

	if p.Current().Kind == token.Keyword_Error {
		p.Advance() // consume error
		error = true
		if _, ok := p.Expect(
			token.Keyword_As,
			"keyword as expected here",
		); !ok {
			return ReturnStatement{}, false
		}
	}

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
		p.Advance() // consume comma
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
	return ReturnStatement{
		Position: posOf(keyword),
		Values:   values,
		Error:    error,
	}, true
}

func (p *Parser) ParseTypeReference() (TypeReference, bool) {
	p.skipComments()

	// Optional reference prefix: `&T` (read-only) or `edit &T` (mutable,
	// exclusive). `edit` without a following `&` is an error.
	edit, isRef := false, false
	if p.Current().Kind == token.Keyword_Edit {
		edit = true
		p.Advance() // consume `edit`
		p.skipComments()
	}
	if p.Current().Kind == token.Symbol_Ampersand {
		isRef = true
		p.Advance() // consume `&`
		p.skipComments()
	}
	if edit && !isRef {
		current := p.Current()
		p.addError(
			current.Line,
			current.Column,
			"`edit` may only qualify a reference (`edit &T`)",
		)
		return TypeReference{}, false
	}

	if p.Current().Kind == token.Symbol_LeftBrace {
		current := p.Current()
		p.addError(
			current.Line,
			current.Column,
			"anonymous object types are not allowed here (§8.3)",
		)
		return TypeReference{}, false
	}

	typeIdentifier, ok := p.Expect(
		token.Kind_Identifier,
		"type identifier expected",
	)
	if !ok {
		return TypeReference{}, false
	}
	reference := TypeReference{
		Name: Identifier{
			Position: posOf(typeIdentifier),
			Name:     typeIdentifier.Lexeme,
		},
		Reference: isRef,
		Edit:      edit,
	}
	// A reference to a previously declared type is a custom record type,
	// not a primitive. Reuse the canonical type's kind and fields.
	if existing := p.lookupType(reference.Name.Name); existing != nil {
		reference.Kind = existing.Kind
		reference.Fields = existing.Fields
	}
	return reference, true
}

func (p *Parser) ParseVarDeclStatement() (Statement, bool) {
	modifier := p.Advance() // consume const/let  keyword

	ident, ok := p.Expect(token.Kind_Identifier, "identifier expected")
	if !ok {
		return VariableDeclarationStatement{}, false
	}

	typeReference := TypeReference{Name: Identifier{}}
	p.skipComments()
	if p.Current().Kind == token.Symbol_Colon {
		p.Advance() // consume colon
		parsedType, ok := p.ParseTypeReference()
		if !ok {
			return VariableDeclarationStatement{}, false
		}
		typeReference = parsedType
	}

	if p.Current().Kind == token.Symbol_Semicolon {
		p.Advance() // consume semicolon
		return VariableDeclarationStatement{
			Position: posOf(modifier),
			Mutable:  modifier.Kind == token.Keyword_Let,
			Name:     ident.Lexeme,
			Type:     typeReference,
			Value:    nil,
		}, true
	}

	p.skipComments()
	if _, ok := p.Expect(token.Symbol_Equals, "symbol = expected"); !ok {
		return VariableDeclarationStatement{}, false
	}

	value, ok := p.ParseExpression()
	if !ok {
		return VariableDeclarationStatement{}, false
	}

	declaration := VariableDeclarationStatement{
		Position: posOf(modifier),
		Mutable:  modifier.Kind == token.Keyword_Let,
		Name:     ident.Lexeme,
		Type:     typeReference,
		Value:    value,
	}

	if p.Current().Kind == token.Keyword_As {
		p.Advance() // consume as
		result, _ := p.Expect(
			token.Kind_Identifier,
			"identifier expected",
		)

		if _, ok := p.Expect(
			token.Symbol_Semicolon,
			"; expected",
		); !ok {
			return VariableDeclarationStatement{}, false
		}

		// set caught to true and update the declaration.Value in case of a fallible function call expression
		if call, ok := declaration.Value.(FunctionCallExpression); ok {
			call.Caught = true
			declaration.Value = call
		}

		statement := FallibleStatement{
			Position: declaration.Position,
			Inner:    declaration,
			Result: Identifier{
				Position: posOf(result),
				Name:     result.Lexeme,
			},
		}

		return statement, true
	}

	if _, ok := p.Expect(token.Symbol_Semicolon, "; expected"); !ok {
		return VariableDeclarationStatement{}, false
	}

	return declaration, true
}

func (p *Parser) ParseExpressionStatement() (Statement, bool) {
	expr, ok := p.ParseExpression()
	if !ok {
		return ExpressionStatement{}, false
	}

	statement := ExpressionStatement{
		Position: expr.Pos(),
		Value:    expr,
	}

	if p.Current().Kind == token.Keyword_As {
		p.Advance() // consume as
		result, ok := p.Expect(
			token.Kind_Identifier,
			"identifier expected",
		)
		if !ok {
			return ExpressionStatement{}, false
		}

		if _, ok := p.Expect(
			token.Symbol_Semicolon,
			"; expected",
		); !ok {
			return ExpressionStatement{}, false
		}

		// update the property caught to true for FunctionCallExpression
		if f, ok := statement.Value.(FunctionCallExpression); ok {
			f.Caught = true
			statement.Value = f
		}

		return FallibleStatement{
			Position: statement.Position,
			Inner:    statement,
			Result: Identifier{
				Position: posOf(result),
				Name:     result.Lexeme,
			},
		}, true
	}

	if _, ok := p.Expect(token.Symbol_Semicolon, "; expected"); !ok {
		return ExpressionStatement{}, false
	}

	return statement, true
}

func (p *Parser) ParseAssignmentStatement() (Statement, bool) {
	target := p.Advance() // consume root identifier
	root := Identifier{Position: posOf(target), Name: target.Lexeme}
	var targetExpression Expression = root

	p.skipComments()
	for p.Current().Kind == token.Symbol_Dot {
		var ok bool
		targetExpression, ok = p.ParseMemberAccessExpression(
			targetExpression,
		)
		if !ok {
			return AssignmentStatement{}, false
		}
		p.skipComments()
	}

	// The assignment operator is either plain `=` or a compound form
	// (`+=`, `-=`, `*=`); the latter records the arithmetic operator.
	opTok := p.Advance()
	operator := ""
	switch opTok.Kind {
	case token.Symbol_Equals:
	case token.Symbol_PlusEquals:
		operator = "+"
	case token.Symbol_MinusEquals:
		operator = "-"
	case token.Symbol_AsteriskEquals:
		operator = "*"
	default:
		p.addError(
			opTok.Line,
			opTok.Column,
			"assignment operator expected",
		)
		return AssignmentStatement{}, false
	}

	value, ok := p.ParseExpression()
	if !ok {
		return AssignmentStatement{}, false
	}

	assignment := AssignmentStatement{
		Position:         posOf(target),
		Target:           root,
		TargetExpression: targetExpression,
		Operator:         operator,
		Value:            value,
	}

	if p.Current().Kind == token.Keyword_As {
		p.Advance() // consume as
		result, _ := p.Expect(
			token.Kind_Identifier,
			"identifier expected",
		)

		if _, ok := p.Expect(
			token.Symbol_Semicolon,
			"; expected",
		); !ok {
			return AssignmentStatement{}, false
		}

		statement := FallibleStatement{
			Position: assignment.Position,
			Inner:    assignment,
			Result: Identifier{
				Position: posOf(result),
				Name:     result.Lexeme,
			},
		}

		return statement, true
	}

	if _, ok := p.Expect(token.Symbol_Semicolon, "; expected"); !ok {
		return AssignmentStatement{}, false
	}

	return assignment, true
}

func (p *Parser) ParseIfElseBlock() (Statement, bool) {
	keyword := p.Advance() // consume if
	if _, ok := p.Expect(token.Symbol_LeftParen, "symbol ( expected"); !ok {
		return nil, false
	}

	condition, ok := p.ParseExpression()
	if !ok {
		return nil, false
	}
	if _, ok := p.Expect(
		token.Symbol_RightParen,
		"symbol ) expected",
	); !ok {
		return nil, false
	}

	if _, ok := p.Expect(token.Symbol_LeftBrace, "symbol { expected"); !ok {
		return nil, false
	}

	thenBlock, ok := p.ParseBlockStatement(IfBlock)
	if !ok {
		return nil, false
	}

	var elseBlock BlockStatement

	p.skipComments()
	if p.Current().Kind == token.Keyword_Else {
		p.Advance() // consume else
		if _, ok := p.Expect(
			token.Symbol_LeftBrace,
			"symbol { expected",
		); !ok {
			return nil, false
		}
		elseBlock, ok = p.ParseBlockStatement(ElseBlock)
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

func (p *Parser) ParseForStatementBlock() (ForStatement, bool) {
	p.loopDepth++
	keyword := p.Advance() // consume for keyword
	if _, ok := p.Expect(token.Symbol_LeftParen, "symbol ( expected"); !ok {
		return ForStatement{}, false
	}

	var init Statement

	if p.Current().Kind == token.Symbol_Semicolon {
		p.Advance() // consume semicolon
	} else {
		init, _ = p.ParseVarDeclStatement()
	}

	var cond Expression
	if p.Current().Kind == token.Symbol_Semicolon {
		p.Advance() // consume semicolon
	} else {
		cond, _ = p.ParseExpression()
		if _, ok := p.Expect(
			token.Symbol_Semicolon,
			"symbol ; expected",
		); !ok {
			return ForStatement{}, false
		}
	}

	var step Expression
	if p.Current().Kind == token.Symbol_RightParen {
		p.Advance() // consume right paren
	} else {
		step, _ = p.ParseExpression()
		if _, ok := p.Expect(
			token.Symbol_RightParen,
			"symbol ) expected",
		); !ok {
			return ForStatement{}, false
		}
	}

	if _, ok := p.Expect(token.Symbol_LeftBrace, "symbol { expected"); !ok {
		return ForStatement{}, false
	}

	body, _ := p.ParseBlockStatement(ForBlock)

	p.loopDepth--
	return ForStatement{
		Position: posOf(keyword),
		Init:     init,
		Cond:     cond,
		Step:     step,
		Body:     &body,
	}, true
}

func (p *Parser) ParseSwitchStatementBlock() (SwitchStatement, bool) {
	keyword := p.Advance()
	if _, ok := p.Expect(token.Symbol_LeftParen, "symbol ( expected"); !ok {
		return SwitchStatement{}, false
	}

	scrutinee, ok := p.ParseExpression()
	if !ok {
		return SwitchStatement{}, false
	}

	if scrutinee == nil {
		p.addError(
			keyword.Line,
			keyword.Column,
			"empty scrutinee in switch statement is not allowed",
		)
	}

	if _, ok := p.Expect(
		token.Symbol_RightParen,
		"symbol ) expected",
	); !ok {
		return SwitchStatement{}, false
	}

	if _, ok := p.Expect(token.Symbol_LeftBrace, "symbol { expected"); !ok {
		return SwitchStatement{}, false
	}

	var cases []*SwitchCase
	var def SwitchCase

	for p.Current().Kind != token.Symbol_RightBrace {
		// Comments are real tokens; skip any sitting before a case/default or
		// before the switch's closing brace so they don't read as unexpected.
		p.skipComments()
		if p.Current().Kind == token.Symbol_RightBrace {
			break
		}

		var label Expression

		if p.Current().Kind != token.Keyword_Case &&
			p.Current().Kind != token.Keyword_Default {
			p.addError(
				p.Current().Line,
				p.Current().Column,
				"keyword case or default expected",
			)
		}

		for p.Current().Kind == token.Keyword_Case {
			var caseValue SwitchCase
			p.Advance() // consume case keyword
			label, ok = p.ParseExpression()
			if !ok {
				return SwitchStatement{}, false
			}

			switch label := label.(type) {
			case IntegerLiteral, CharacterLiteral, UnaryExpression:
				caseValue.Labels = append(
					caseValue.Labels,
					label,
				)
			default:
				p.addError(
					p.Current().Line,
					p.Current().Column,
					"case labels must be integer or char literals",
				)
			}

			if p.Current().Kind == token.Symbol_Comma {
				for p.Current().Kind != token.Symbol_Colon {
					p.Advance() // consume comma
					label, _ = p.ParseExpression()
					switch label := label.(type) {
					case IntegerLiteral,
						CharacterLiteral,
						UnaryExpression:
						caseValue.Labels = append(
							caseValue.Labels,
							label,
						)
					default:
						p.addError(
							p.Current().Line,
							p.Current().Column,
							"case labels must be integer or char literals",
						)
					}
				}
			}

			if _, ok := p.Expect(
				token.Symbol_Colon,
				"symbol : expected",
			); !ok {
				return SwitchStatement{}, false
			}

			if _, ok := p.Expect(
				token.Symbol_LeftBrace,
				"symbol { expected",
			); !ok {
				return SwitchStatement{}, false
			}

			caseBody, _ := p.ParseBlockStatement(CaseBlock)

			for _, stmt := range caseBody.Statements {
				if brk, ok := stmt.(BreakStatement); ok &&
					p.loopDepth == 0 {
					p.addError(
						brk.Line,
						brk.Column,
						"break is not allowed outside of a loop",
					)
				}
			}

			caseValue.Body = &caseBody
			cases = append(cases, &caseValue)
			// Tolerate comments between consecutive case clauses.
			p.skipComments()
		}

		if _, ok := p.Expect(
			token.Keyword_Default,
			"missing default case",
		); !ok {
			return SwitchStatement{}, false
		}

		if _, ok := p.Expect(
			token.Symbol_Colon,
			"symbol : expected",
		); !ok {
			return SwitchStatement{}, false
		}

		if _, ok := p.Expect(
			token.Symbol_LeftBrace,
			"symbol { expected",
		); !ok {
			return SwitchStatement{}, false
		}

		defBlock, _ := p.ParseBlockStatement(DefaultBlock)
		def.Body = &defBlock
	}

	p.Advance() // consume right brace for end of switch statement

	return SwitchStatement{
		Position:  posOf(keyword),
		Scrutinee: scrutinee,
		Cases:     cases,
		Default:   &def,
	}, true
}

func (p *Parser) ParseWhileBlock() (WhileStatement, bool) {
	p.loopDepth++
	keyword := p.Advance() // consume while
	if _, ok := p.Expect(token.Symbol_LeftParen, "symbol ( expected"); !ok {
		return WhileStatement{}, false
	}

	condition, ok := p.ParseExpression()
	if !ok {
		return WhileStatement{}, false
	}
	if _, ok := p.Expect(
		token.Symbol_RightParen,
		"symbol ) expected",
	); !ok {
		return WhileStatement{}, false
	}

	if _, ok := p.Expect(token.Symbol_LeftBrace, "symbol { expected"); !ok {
		return WhileStatement{}, false
	}

	block, ok := p.ParseBlockStatement(WhileBlock)
	if !ok {
		return WhileStatement{}, false
	}

	p.loopDepth--
	return WhileStatement{
		Position:  posOf(keyword),
		Condition: condition,
		Body:      block,
	}, true
}

func (p *Parser) ParseCheckStatement() (CheckStatement, bool) {
	checkKeyword := p.Advance() // consume check keyword
	result, ok := p.Expect(token.Kind_Identifier, "identifier expected")
	if !ok {
		return CheckStatement{}, false
	}

	if _, ok := p.Expect(token.Symbol_LeftBrace, "symbol { expected"); !ok {
		return CheckStatement{}, false
	}

	block, ok := p.ParseBlockStatement(CheckBlock)

	if !ok {
		return CheckStatement{}, false
	}

	return CheckStatement{
		Position: posOf(checkKeyword),
		Result:   Identifier{Name: result.Lexeme},
		Body:     &block,
	}, true
}

type BlockKind int

const (
	FunctionBlock BlockKind = iota
	ForBlock
	SwitchBlock
	WhileBlock
	IfBlock
	ElseBlock
	CaseBlock
	CheckBlock
	DefaultBlock
)

func (p *Parser) ParseBlockStatement(
	blockKind BlockKind,
) (BlockStatement, bool) {
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
			var returnStatement ReturnStatement
			var ok bool
			if blockKind == CheckBlock {
				returnStatement, ok = p.ParseReturnStatement(
					true,
				)
			} else {
				returnStatement, ok = p.ParseReturnStatement(
					false,
				)
			}
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, returnStatement)
			continue
		}

		if p.Current().Kind == token.Keyword_Break {
			if p.loopDepth == 0 {
				p.addError(
					p.Current().Line,
					p.Current().Column,
					"break is not allowed outside of a loop",
				)
			}

			keyword := p.Advance() // consume break
			if _, ok := p.Expect(
				token.Symbol_Semicolon,
				"symbol ; expected",
			); !ok {
				continue
			}
			statements = append(
				statements,
				BreakStatement{Position: posOf(keyword)},
			)
			continue
		}

		if p.Current().Kind == token.Keyword_Continue {
			if p.loopDepth == 0 {
				p.addError(
					p.Current().Line,
					p.Current().Column,
					"continue is not allowed outside of a loop",
				)
			}

			keyword := p.Advance() // consume continue
			if _, ok := p.Expect(
				token.Symbol_Semicolon,
				"symbol ; expected",
			); !ok {
				continue
			}
			statements = append(
				statements,
				ContinueStatement{Position: posOf(keyword)},
			)
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

		assignmentStart := false
		if p.Current().Kind == token.Kind_Identifier {
			index := p.Position + 1
			for index < len(p.Tokens) &&
				isCommentKind(p.Tokens[index].Kind) {
				index++
			}
			for index < len(p.Tokens) &&
				p.Tokens[index].Kind == token.Symbol_Dot {
				index++
				for index < len(p.Tokens) &&
					isCommentKind(p.Tokens[index].Kind) {
					index++
				}
				if index >= len(p.Tokens) ||
					p.Tokens[index].Kind != token.Kind_Identifier {
					break
				}
				index++
				for index < len(p.Tokens) &&
					isCommentKind(p.Tokens[index].Kind) {
					index++
				}
			}
			assignmentStart = index < len(p.Tokens) &&
				isAssignmentOperator(p.Tokens[index].Kind)
		}

		if assignmentStart {
			identStmt, ok := p.ParseAssignmentStatement()
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, identStmt)
			continue
		}

		if p.Current().Kind == token.Keyword_If {
			ifStmt, ok := p.ParseIfElseBlock()
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, ifStmt)
			continue
		}

		if p.Current().Kind == token.Keyword_For {
			forStmt, ok := p.ParseForStatementBlock()
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, forStmt)
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

		if p.Current().Kind == token.Keyword_Switch {
			switchStmt, ok := p.ParseSwitchStatementBlock()
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, switchStmt)
			continue
		}

		if p.Current().Kind == token.Keyword_Check {
			checkStmt, ok := p.ParseCheckStatement()
			if !ok {
				p.synchronizeStatement(start)
				continue
			}
			statements = append(statements, checkStmt)
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
	p.Advance() // consume right brace
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
	paramType, ok := p.ParseTypeReference()
	if !ok {
		return FunctionParameter{}, false
	}

	return FunctionParameter{
		Position: posOf(paramName),
		Name: Identifier{
			Position: posOf(paramName),
			Name:     paramName.Lexeme,
		},
		Type: paramType,
	}, true
}

func (p *Parser) ParseFunctionParameters() ([]FunctionParameter, bool) {
	parameters := []FunctionParameter{}

	p.skipComments()
	if p.Current().Kind == token.Symbol_RightParen {
		p.Advance() // consume right paren
		return parameters, true
	}

	first, ok := p.ParseFunctionParameter()
	if !ok {
		return nil, false
	}
	parameters = append(parameters, first)

	p.skipComments()
	for p.Current().Kind != token.Symbol_RightParen {
		if _, ok := p.Expect(
			token.Symbol_Comma,
			"symbol , expected",
		); !ok {
			return nil, false
		}
		param, ok := p.ParseFunctionParameter()
		if !ok {
			return nil, false
		}
		parameters = append(parameters, param)
		p.skipComments()
	}
	if _, ok := p.Expect(
		token.Symbol_RightParen,
		"symbol ) expected",
	); !ok {
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

	// Optional receiver clause: `function (recv: &T) name(...)` makes this a
	// receiver method. Disambiguation is a single-token check — `function (`
	// starts a receiver, `function name(` is a free function. The receiver is
	// an ordinary `name: Type` binding whose type is a reference; the type
	// being a reference to a record is enforced later by semantic analysis.
	var receiver *FunctionParameter
	p.skipComments()
	if p.Current().Kind == token.Symbol_LeftParen {
		p.Advance() // consume `(`
		recv, ok := p.ParseFunctionParameter()
		if !ok {
			return FunctionDeclaration{}, false
		}
		if _, ok := p.Expect(
			token.Symbol_RightParen,
			"expected ')' after receiver",
		); !ok {
			return FunctionDeclaration{}, false
		}
		receiver = &recv
		p.skipComments()
	}

	functionName, ok := p.Expect(
		token.Kind_Identifier,
		"identifier expected",
	)
	if !ok {
		return FunctionDeclaration{}, false
	}

	if _, ok := p.Expect(
		token.Symbol_LeftParen,
		"expected '(' symbol",
	); !ok {
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
		p.Advance() // consume colon
		returnType, ok := p.ParseTypeReference()
		if !ok {
			return FunctionDeclaration{}, false
		}
		returns = append(returns, returnType)

		p.skipComments()
		for p.Current().Kind == token.Symbol_Comma {
			p.Advance() // consume comma
			returnType, ok := p.ParseTypeReference()
			if !ok {
				return FunctionDeclaration{}, false
			}
			returns = append(returns, returnType)
			p.skipComments()
		}

		p.skipComments()
		if p.Current().Kind == token.Symbol_Pipe {
			p.Advance() //consume | symbol
			errorType, ok := p.ParseTypeReference()
			if !ok {
				return FunctionDeclaration{}, false
			}

			errors = append(errors, errorType)

			p.skipComments()
			for p.Current().Kind == token.Symbol_Comma {
				p.Advance() // consume comma
				errorType, ok := p.ParseTypeReference()
				if !ok {
					return FunctionDeclaration{}, false
				}
				errors = append(errors, errorType)
				p.skipComments()
			}
		}

	}

	p.skipComments()
	if _, ok := p.Expect(token.Symbol_LeftBrace, "expected { symbol"); !ok {
		return FunctionDeclaration{}, false
	}

	body, ok := p.ParseBlockStatement(FunctionBlock)
	if !ok {
		return FunctionDeclaration{}, false
	}

	return FunctionDeclaration{
		Position:    keywordPos,
		Receiver:    receiver,
		Name:        functionName.Lexeme,
		Parameters:  parameters,
		ReturnTypes: returns,
		ErrorTypes:  errors,
		Body:        &body,
	}, true
}

func (p *Parser) ParseConstDeclaration() (ConstDeclaration, bool) {
	stmt, ok := p.ParseVarDeclStatement()
	varDecl := stmt.(VariableDeclarationStatement)
	if !ok {
		return ConstDeclaration{}, false
	}

	return ConstDeclaration{
		Position: varDecl.Position,
		Name: Identifier{
			Position: varDecl.Position,
			Name:     varDecl.Name,
		},
		Type:  varDecl.Type,
		Value: varDecl.Value,
	}, true
}

func (p *Parser) ParseRecordTypeBody() (TypeRHS, bool) {
	open, ok := p.Expect(token.Symbol_LeftBrace, "symbol { expected")
	if !ok {
		return nil, false
	}

	var operands []CompositionOperand
	var fields []RecordField
	hasSpread := false

	p.skipComments()
	for p.Current().Kind != token.Symbol_RightBrace {
		if p.Current().Kind == token.Kind_EOF {
			p.addError(
				open.Line,
				open.Column,
				"unterminated record type",
			)
			return nil, false
		}

		if p.Current().Kind == token.Symbol_Ellipsis {
			hasSpread = true
			if len(fields) > 0 {
				inline := RecordRHS{
					Position: fields[0].Position,
					Fields: append(
						[]RecordField(nil),
						fields...,
					),
				}
				operands = append(operands, CompositionOperand{
					Position: inline.Position,
					Inline:   &inline,
				})
				fields = nil
			}
			spread := p.Advance()
			target, ok := p.ParseTypeReference()
			if !ok {
				return nil, false
			}
			if _, ok := p.Expect(
				token.Symbol_Semicolon,
				"symbol ; expected",
			); !ok {
				return nil, false
			}
			targetCopy := target
			operands = append(operands, CompositionOperand{
				Position: posOf(spread),
				Named:    &targetCopy,
			})
			p.skipComments()
			continue
		}

		if p.Current().Kind == token.Kind_Identifier &&
			(p.Current().Lexeme == "public" ||
				p.Current().Lexeme == "private") &&
			p.Peek().Kind == token.Kind_Identifier {
			current := p.Current()
			p.addError(
				current.Line,
				current.Column,
				"field visibility is not allowed in record types (§8.5)",
			)
			return nil, false
		}

		name, ok := p.Expect(
			token.Kind_Identifier,
			"field name expected",
		)
		if !ok {
			return nil, false
		}
		p.skipComments()
		if p.Current().Kind == token.Symbol_LeftParen {
			p.addError(
				name.Line,
				name.Column,
				"methods are not allowed in record types",
			)
			return nil, false
		}
		if _, ok := p.Expect(
			token.Symbol_Colon,
			"symbol : expected",
		); !ok {
			return nil, false
		}
		fieldType, ok := p.ParseTypeReference()
		if !ok {
			return nil, false
		}
		p.skipComments()
		if p.Current().Kind == token.Symbol_Equals {
			p.addError(
				p.Current().Line,
				p.Current().Column,
				"field defaults are not allowed in record types (§8.11)",
			)
			return nil, false
		}
		if _, ok := p.Expect(
			token.Symbol_Semicolon,
			"symbol ; expected",
		); !ok {
			return nil, false
		}
		fields = append(fields, RecordField{
			Position: posOf(name),
			Name: Identifier{
				Position: posOf(name),
				Name:     name.Lexeme,
			},
			Type: fieldType,
		})
		p.skipComments()
	}

	if _, ok := p.Expect(
		token.Symbol_RightBrace,
		"symbol } expected",
	); !ok {
		return nil, false
	}

	if !hasSpread {
		return RecordRHS{
			Position: posOf(open),
			Fields:   fields,
		}, true
	}

	if len(fields) > 0 {
		inline := RecordRHS{
			Position: fields[0].Position,
			Fields:   append([]RecordField(nil), fields...),
		}
		operands = append(operands, CompositionOperand{
			Position: inline.Position,
			Inline:   &inline,
		})
	}
	return CompositionRHS{
		Position: posOf(open),
		Operands: operands,
		Style:    SpreadForm,
	}, true
}

func (p *Parser) ParseTypeRHS() (TypeRHS, bool) {
	p.skipComments()
	if p.Current().Kind == token.Symbol_LeftParen {
		current := p.Current()
		p.addError(
			current.Line,
			current.Column,
			"parentheses in type RHS are not supported (§8.13)",
		)
		return nil, false
	}

	var first TypeRHS
	switch p.Current().Kind {
	case token.Kind_Identifier:
		target, ok := p.ParseTypeReference()
		if !ok {
			return nil, false
		}
		first = AliasRHS{Position: target.Name.Position, Target: target}
	case token.Symbol_LeftBrace:
		var ok bool
		first, ok = p.ParseRecordTypeBody()
		if !ok {
			return nil, false
		}
	default:
		current := p.Current()
		p.addError(current.Line, current.Column, "type RHS expected")
		return nil, false
	}

	p.skipComments()
	if p.Current().Kind != token.Symbol_Ampersand {
		return first, true
	}

	var operands []CompositionOperand
	switch first := first.(type) {
	case AliasRHS:
		target := first.Target
		target.Kind = Custom
		operands = append(operands, CompositionOperand{
			Position: target.Name.Position,
			Named:    &target,
		})
	case RecordRHS:
		inline := first
		operands = append(operands, CompositionOperand{
			Position: inline.Position,
			Inline:   &inline,
		})
	case CompositionRHS:
		operands = append(operands, first.Operands...)
	}

	for p.Current().Kind == token.Symbol_Ampersand {
		p.Advance()
		p.skipComments()

		switch p.Current().Kind {
		case token.Kind_Identifier:
			target, ok := p.ParseTypeReference()
			if !ok {
				return nil, false
			}
			targetCopy := target
			operands = append(operands, CompositionOperand{
				Position: target.Name.Position,
				Named:    &targetCopy,
			})
		case token.Symbol_LeftBrace:
			rhs, ok := p.ParseRecordTypeBody()
			if !ok {
				return nil, false
			}
			switch rhs := rhs.(type) {
			case RecordRHS:
				inline := rhs
				operands = append(operands, CompositionOperand{
					Position: inline.Position,
					Inline:   &inline,
				})
			case CompositionRHS:
				operands = append(operands, rhs.Operands...)
			}
		case token.Symbol_LeftParen:
			current := p.Current()
			p.addError(
				current.Line,
				current.Column,
				"parentheses in type RHS are not supported (§8.13)",
			)
			return nil, false
		default:
			current := p.Current()
			p.addError(
				current.Line,
				current.Column,
				"composition operand expected",
			)
			return nil, false
		}
		p.skipComments()
	}

	return CompositionRHS{
		Position: first.Pos(),
		Operands: operands,
		Style:    IntersectionForm,
	}, true
}

func (p *Parser) typeReferenceChain(
	references []TypeReference,
) []*TypeReference {
	if len(references) == 0 {
		return nil
	}
	fields := make([]*TypeReference, 0, len(references))
	for _, reference := range references {
		if existing := p.lookupType(
			reference.Name.Name,
		); existing != nil {
			fields = append(fields, existing)
			continue
		}
		current := reference
		current.Fields = nil
		fields = append(fields, &current)
	}
	return fields
}

func (p *Parser) lookupType(name string) *TypeReference {
	if name == "" {
		return nil
	}
	return p.declaredTypes[name]
}

func (p *Parser) registerType(typ *TypeReference) {
	if p.declaredTypes == nil {
		p.declaredTypes = map[string]*TypeReference{}
	}
	p.declaredTypes[typ.Name.Name] = typ
}

func typeReferencesForRecord(fields []RecordField) []TypeReference {
	references := make([]TypeReference, 0, len(fields))
	for _, field := range fields {
		references = append(references, field.Type)
	}
	return references
}

func (p *Parser) populateTypeRHS(rhs TypeRHS, typ *TypeReference) TypeRHS {
	switch rhs := rhs.(type) {
	case RecordRHS:
		typ.Fields = p.typeReferenceChain(
			typeReferencesForRecord(rhs.Fields),
		)
		rhs.Type = *typ
		return rhs
	case AliasRHS:
		typ.Fields = p.typeReferenceChain([]TypeReference{rhs.Target})
		rhs.Type = *typ
		return rhs
	case CompositionRHS:
		references := make([]TypeReference, 0, len(rhs.Operands))
		for index, operand := range rhs.Operands {
			if operand.Named != nil {
				references = append(references, *operand.Named)
			}
			if operand.Inline != nil {
				inline := *operand.Inline
				inlineType := *typ
				inlineReferences := typeReferencesForRecord(
					inline.Fields,
				)
				inlineType.Fields = p.typeReferenceChain(
					inlineReferences,
				)
				inline.Type = inlineType
				rhs.Operands[index].Inline = &inline
				references = append(
					references,
					inlineReferences...,
				)
			}
		}
		typ.Fields = p.typeReferenceChain(references)
		rhs.Type = *typ
		return rhs
	default:
		return rhs
	}
}

func (p *Parser) ParseTypeDeclaration() (TypeDeclaration, bool) {
	keyword := p.Advance()
	name, ok := p.Expect(token.Kind_Identifier, "type name expected")
	if !ok {
		return TypeDeclaration{}, false
	}
	if _, ok := p.Expect(token.Symbol_Equals, "symbol = expected"); !ok {
		return TypeDeclaration{}, false
	}
	rhs, ok := p.ParseTypeRHS()
	if !ok {
		return TypeDeclaration{}, false
	}
	if _, ok := p.Expect(token.Symbol_Semicolon, "symbol ; expected"); !ok {
		return TypeDeclaration{}, false
	}
	declaredType := &TypeReference{
		Name: Identifier{
			Position: posOf(name),
			Name:     name.Lexeme,
		},
		Kind: Custom,
	}
	populatedRHS := p.populateTypeRHS(rhs, declaredType)
	p.registerType(declaredType)
	return TypeDeclaration{
		Position: posOf(keyword),
		Name:     declaredType.Name,
		RHS:      populatedRHS,
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

	if p.Current().Kind == token.Keyword_Type {
		declaration, ok := p.ParseTypeDeclaration()
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
			token.Keyword_Type,
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
		if p.Position > 0 &&
			p.Previous().Kind == token.Symbol_Semicolon {
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
