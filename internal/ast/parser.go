package ast

import (
	"delta/internal/token"
	"errors"
	"fmt"
	"strings"
)

type Parser struct {
	Tokens   []token.Token
	Position int
}

func (p *Parser) Current() token.Token {
	return p.Tokens[p.Position]
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

func (p *Parser) Expect(kind token.Kind, message string) (token.Token, error) {
	if p.Current().Kind == kind {
		return p.Advance(), nil
	}

	return token.Token{}, errors.New(message)
}

func (p *Parser) ParsePrimaryExpression() (Expression, error) {

	if p.Current().Kind == token.Kind_StringLiteral {
		return StringLiteral{
			Value: p.Advance().Lexeme,
		}, nil
	}

	if p.Current().Kind == token.Kind_CharacterLiteral {
		return CharacterLiteral{
			Value: p.Advance().Lexeme,
		}, nil
	}

	if p.Current().Kind == token.Kind_IntegerLiteral {
		return IntegerLiteral{
			Value: p.Advance().Lexeme,
		}, nil
	}

	if p.Current().Kind == token.Kind_BooleanLiteral {
		return BooleanLiteral{
			Value: p.Advance().Lexeme,
		}, nil
	}

	if p.Current().Kind == token.Kind_Identifier {
		return Identifier{
			Name: p.Advance().Lexeme,
		}, nil
	}

	if p.Current().Kind == token.Symbol_LeftParen {
		p.Advance() //consume left paren
		inner, err := p.ParseExpression()
		if err != nil {
			return nil, err
		}
		_, err = p.Expect(token.Symbol_RightParen, ") symbol expected")

		if err != nil {
			return nil, err
		}

		return inner, nil
	}

	return nil, errors.New("invalid expression")
}

func (p *Parser) ParseUnaryExpression() (Expression, error) {
	symbol := p.Current()

	var expr Expression
	var err error

	if symbol.Kind == token.Symbol_Not || symbol.Kind == token.Symbol_Minus {
		p.Advance()
		expr, err := p.ParseUnaryExpression()
		if err != nil {
			return nil, err
		}

		return UnaryExpression{
			expression: expr,
			operator:   symbol.Lexeme,
		}, nil

	}

	expr, err = p.ParseFunctionCallExpression()
	if err != nil {
		return nil, err
	}

	return expr, nil
}

func (p *Parser) ParseMultiplicativeExpression() (Expression, error) {
	left, err := p.ParseUnaryExpression()
	if err != nil {
		return nil, err
	}

	for p.Current().Kind == token.Symbol_Asterisk ||
		p.Current().Kind == token.Symbol_FSlash {
		operator := p.Advance()
		right, err := p.ParseUnaryExpression()
		if err != nil {
			return nil, err
		}

		left = BinaryExpression{
			left:     left,
			operator: operator.Lexeme,
			right:    right,
		}
	}

	return left, nil
}

func (p *Parser) ParseAdditiveExpression() (Expression, error) {
	left, err := p.ParseMultiplicativeExpression()
	if err != nil {
		return nil, err
	}

	for p.Current().Kind == token.Symbol_Plus ||
		p.Current().Kind == token.Symbol_Minus {
		operator := p.Advance()
		right, err := p.ParseMultiplicativeExpression()
		if err != nil {
			return nil, err
		}

		left = BinaryExpression{
			left:     left,
			operator: operator.Lexeme,
			right:    right,
		}
	}

	return left, nil
}

func (p *Parser) ParseComparisionExpression() (Expression, error) {
	left, err := p.ParseAdditiveExpression()
	if err != nil {
		return nil, err
	}

	for p.Current().Kind == token.Symbol_Less ||
		p.Current().Kind == token.Symbol_LessEq ||
		p.Current().Kind == token.Symbol_Greater ||
		p.Current().Kind == token.Symbol_GreaterEq ||
		p.Current().Kind == token.Symbol_Equality ||
		p.Current().Kind == token.Symbol_NotEquals {
		operator := p.Advance()
		right, err := p.ParseAdditiveExpression()
		if err != nil {
			return nil, err
		}

		left = BinaryExpression{
			left:     left,
			operator: operator.Lexeme,
			right:    right,
		}
	}

	return left, nil

}

func (p *Parser) ParseLogicalAndExpression() (Expression, error) {
	left, err := p.ParseComparisionExpression()
	if err != nil {
		return nil, err
	}

	for p.Current().Kind == token.Symbol_LogicalAnd {
		operator := p.Advance()
		right, err := p.ParseComparisionExpression()
		if err != nil {
			return nil, err
		}

		left = BinaryExpression{
			left:     left,
			operator: operator.Lexeme,
			right:    right,
		}
	}

	return left, nil
}

func (p *Parser) ParseLogicalOrExpression() (Expression, error) {
	left, err := p.ParseLogicalAndExpression()
	if err != nil {
		return nil, err
	}

	for p.Current().Kind == token.Symbol_LogicalOr {
		operator := p.Advance()
		right, err := p.ParseLogicalAndExpression()
		if err != nil {
			return nil, err
		}

		left = BinaryExpression{
			left:     left,
			operator: operator.Lexeme,
			right:    right,
		}
	}

	return left, nil
}

func (p *Parser) ParseLogicalExpression() (Expression, error) {
	return p.ParseLogicalOrExpression()
}

func (p *Parser) ParseFunctionCallExpression() (Expression, error) {
	callee, err := p.ParsePrimaryExpression()
	if err != nil {
		return nil, err
	}

	for p.Current().Kind == token.Symbol_LeftParen {
		var arguments []Expression
		p.Advance() //consume left paren
		if p.Current().Kind == token.Symbol_RightParen {
			arguments = []Expression{}
		} else {
			expr, err := p.ParseExpression()
			if err != nil {
				return nil, err
			}
			arguments = append(arguments, expr)
			for p.Current().Kind == token.Symbol_Comma {
				p.Advance() //consume comma
				expr, err := p.ParseExpression()
				if err != nil {
					return nil, err
				}
				arguments = append(arguments, expr)
			}
		}
		_, err := p.Expect(token.Symbol_RightParen, "expected ) symbol")

		if err != nil {
			return nil, err
		}
		callee = FunctionCallExpression{
			Callee:    callee,
			Arguments: arguments,
		}
	}

	return callee, nil
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
func (p *Parser) ParseExpression() (Expression, error) {
	expr, err := p.ParseLogicalExpression()
	if err != nil {
		return nil, err
	}
	return expr, nil
}

func (p *Parser) ParseReturnStatement() (ReturnStatement, error) {
	p.Advance()
	expr, err := p.ParseExpression()

	if err != nil {
		return ReturnStatement{}, err
	}

	_, err = p.Expect(token.Symbol_Semicolon, "; expected")
	if err != nil {
		return ReturnStatement{}, err
	}
	return ReturnStatement{Value: expr}, nil
}

func (p *Parser) ParseVarDeclStatement() (VariableDeclarationStatement, error) {
	modifier := p.Advance() //consume const/let  keyword

	ident, err := p.Expect(token.Kind_Identifier, "identifier expected")

	if err != nil {
		return VariableDeclarationStatement{}, err
	}

	typeReference := TypeReference{Name: Identifier{}}
	if p.Current().Kind == token.Symbol_Colon {
		p.Advance() // consume colon
		typeIdentifier, err := p.Expect(
			token.Kind_Identifier,
			"type identifier expected",
		)
		if err != nil {
			return VariableDeclarationStatement{}, err
		}
		typeReference = TypeReference{
			Name: Identifier{Name: typeIdentifier.Lexeme},
		}
	}

	_, err = p.Expect(token.Symbol_Equals, "symbol = expected")
	if err != nil {
		return VariableDeclarationStatement{}, err
	}

	value, err := p.ParseExpression()
	if err != nil {
		return VariableDeclarationStatement{}, err
	}

	_, err = p.Expect(token.Symbol_Semicolon, "; expected")
	if err != nil {
		return VariableDeclarationStatement{}, err
	}

	return VariableDeclarationStatement{
		Mutable: modifier.Kind == token.Keyword_Let,
		Name:    ident.Lexeme,
		Type:    typeReference,
		Value:   value,
	}, nil

}

func (p *Parser) ParseExpressionStatement() (ExpressionStatement, error) {
	expr, err := p.ParseExpression()

	if err != nil {
		return ExpressionStatement{}, err
	}

	_, err = p.Expect(token.Symbol_Semicolon, "; expected")

	if err != nil {
		return ExpressionStatement{}, err
	}

	return ExpressionStatement{
		Value: expr,
	}, nil
}

func (p *Parser) ParseAssignmentStatement() (AssignmentStatement, error) {
	target := p.Advance() // consume identifier

	_, err := p.Expect(token.Symbol_Equals, "symbol '=' expected")
	if err != nil {
		return AssignmentStatement{}, err
	}

	value, err := p.ParseExpression()

	if err != nil {
		return AssignmentStatement{}, err
	}

	_, err = p.Expect(token.Symbol_Semicolon, "symbol ';' expected")
	if err != nil {
		return AssignmentStatement{}, err
	}

	return AssignmentStatement{
		Target: Identifier{Name: target.Lexeme},
		Value:  value,
	}, nil
}

func (p *Parser) ParseIfElseBlock() (Statement, error) {
	p.Advance() //consume if
	_, err := p.Expect(token.Symbol_LeftParen, "symbol ( expected")
	if err != nil {
		return nil, err
	}

	condition, err := p.ParseExpression()
	if err != nil {
		return nil, err
	}
	_, err = p.Expect(token.Symbol_RightParen, "symbol ) expected")
	if err != nil {
		return nil, err
	}

	_, err = p.Expect(token.Symbol_LeftBrace, "symbol { expected")
	if err != nil {
		return nil, err
	}

	thenBlock, err := p.ParseBlockStatement()
	if err != nil {
		return nil, err
	}

	var elseBlock BlockStatement

	if p.Current().Kind == token.Keyword_Else {
		p.Advance() //consume else
		_, err = p.Expect(token.Symbol_LeftBrace, "symbol { expected")
		if err != nil {
			return nil, err
		}
		elseBlock, err = p.ParseBlockStatement()
		if err != nil {
			return nil, err
		}
	}

	return IfStatement{
		ThenBlock: thenBlock,
		ElseBlock: elseBlock,
		Condition: condition,
	}, nil

}

func (p *Parser) ParseWhileBlock() (WhileStatement, error) {
	p.Advance() //consume while
	_, err := p.Expect(token.Symbol_LeftParen, "symbol ( expected")
	if err != nil {
		return WhileStatement{}, err
	}

	condition, err := p.ParseExpression()
	if err != nil {
		return WhileStatement{}, err
	}
	_, err = p.Expect(token.Symbol_RightParen, "symbol ) expected")
	if err != nil {
		return WhileStatement{}, err
	}

	_, err = p.Expect(token.Symbol_LeftBrace, "symbol { expected")
	if err != nil {
		return WhileStatement{}, err
	}

	block, err := p.ParseBlockStatement()
	if err != nil {
		return WhileStatement{}, err
	}
	return WhileStatement{
		Condition: condition,
		Body:      block,
	}, nil

}

func (p *Parser) ParseBlockStatement() (BlockStatement, error) {
	statements := []Statement{}

	for p.Current().Kind != token.Symbol_RightBrace {
		if p.Current().Kind == token.Kind_EOF {
			return BlockStatement{}, errors.New(
				"reached the end of file while parsing",
			)
		}

		if p.Current().Kind == token.Keyword_Return {
			returnStatement, err := p.ParseReturnStatement()
			if err != nil {
				return BlockStatement{}, err
			}
			statements = append(statements, returnStatement)
			continue
		}

		if p.Current().Kind == token.Keyword_Const ||
			p.Current().Kind == token.Keyword_Let {
			constStatement, err := p.ParseVarDeclStatement()
			if err != nil {
				return BlockStatement{}, err
			}
			statements = append(statements, constStatement)
			continue
		}

		if p.Current().Kind == token.Kind_Identifier &&
			p.Peek().Kind == token.Symbol_Equals {
			constStatement, err := p.ParseAssignmentStatement()
			if err != nil {
				return BlockStatement{}, err
			}
			statements = append(statements, constStatement)
			continue
		}

		if p.Current().Kind == token.Keyword_If {
			constStatement, err := p.ParseIfElseBlock()
			if err != nil {
				return BlockStatement{}, err
			}
			statements = append(statements, constStatement)
			continue
		}

		if p.Current().Kind == token.Keyword_While {
			constStatement, err := p.ParseWhileBlock()
			if err != nil {
				return BlockStatement{}, err
			}
			statements = append(statements, constStatement)
			continue
		}

		expr, err := p.ParseExpressionStatement()

		if err != nil {
			return BlockStatement{}, err
		}

		statements = append(statements, expr)

	}
	p.Advance() //consume right brace
	return BlockStatement{Statements: statements}, nil
}

func (p *Parser) ParseFunctionParameter() (FunctionParameter, error) {
	paramName, err := p.Expect(token.Kind_Identifier, "identifier expected")
	if err != nil {
		return FunctionParameter{}, err
	}
	_, err = p.Expect(token.Symbol_Colon, "Symbol : expected")
	if err != nil {
		return FunctionParameter{}, err
	}
	paramType, err := p.Expect(token.Kind_Identifier, "identifier expected")
	if err != nil {
		return FunctionParameter{}, err
	}

	return FunctionParameter{
		Name: Identifier{Name: paramName.Lexeme},
		Type: TypeReference{Name: Identifier{Name: paramType.Lexeme}},
	}, nil
}

func (p *Parser) ParseFunctionParameters() ([]FunctionParameter, error) {
	var parameters = []FunctionParameter{}

	if p.Current().Kind == token.Symbol_RightParen {
		p.Advance() //consume right paren
		return parameters, nil
	}

	first, err := p.ParseFunctionParameter()
	if err != nil {
		return nil, err
	}
	parameters = append(parameters, first)

	for p.Current().Kind != token.Symbol_RightParen {
		_, err = p.Expect(token.Symbol_Comma, "symbol , expected")
		if err != nil {
			return nil, err
		}
		param, err := p.ParseFunctionParameter()
		if err != nil {
			return nil, err
		}
		parameters = append(parameters, param)
	}
	_, err = p.Expect(token.Symbol_RightParen, "symbol ) expected")
	if err != nil {
		return nil, err
	}

	return parameters, nil
}

func (p *Parser) ParseFunctionDeclaration() (FunctionDeclaration, error) {
	functionName, err := p.Expect(token.Kind_Identifier, "identifier expected")

	if err != nil {
		return FunctionDeclaration{}, err
	}
	_, err = p.Expect(token.Symbol_LeftParen, "expected '(' symbol")

	if err != nil {
		return FunctionDeclaration{}, err
	}

	parameters, err := p.ParseFunctionParameters()
	if err != nil {
		return FunctionDeclaration{}, err
	}

	_, err = p.Expect(token.Symbol_Colon, "expected ':' symbol")

	if err != nil {
		return FunctionDeclaration{}, err
	}

	returnType, err := p.Expect(token.Kind_Identifier, "identifier expected")
	if err != nil {
		return FunctionDeclaration{}, err
	}

	_, err = p.Expect(token.Symbol_LeftBrace, "expected { symbol")
	if err != nil {
		return FunctionDeclaration{}, err
	}

	body, err := p.ParseBlockStatement()

	if err != nil {
		return FunctionDeclaration{}, err
	}

	return FunctionDeclaration{
		Name:       functionName.Lexeme,
		Parameters: parameters,
		ReturnType: TypeReference{Name: Identifier{Name: returnType.Lexeme}},
		Body:       &body,
	}, nil
}

func (p *Parser) ParseConstDeclaration() (ConstDeclaration, error) {
	decl, err := p.ParseVarDeclStatement()
	if err != nil {
		return ConstDeclaration{}, err
	}

	return ConstDeclaration{
		Name:  Identifier{Name: decl.Name},
		Type:  decl.Type,
		Value: decl.Value,
	}, nil
}

func (p *Parser) ParseDeclaration() (Declaration, error) {
	if p.Current().Kind == token.Keyword_Function {
		p.Advance()
		declaration, err := p.ParseFunctionDeclaration()

		if err != nil {
			return nil, err
		}

		return declaration, nil
	}

	if p.Current().Kind == token.Keyword_Const ||
		p.Current().Kind == token.Keyword_Let {
		if p.Current().Kind == token.Keyword_Let {
			return nil, errors.New("let is not allowed at file scope")
		}

		declaration, err := p.ParseConstDeclaration()
		if err != nil {
			return nil, err
		}

		return declaration, nil
	}

	return nil, errors.New("failed to parse declaration")
}

func (p *Parser) Parse() (File, error) {
	file := File{}
	for p.Current().Kind != token.Kind_EOF {
		declaration, err := p.ParseDeclaration()
		if err != nil {
			return File{}, err
		}
		file.Declarations = append(file.Declarations, declaration)
	}
	return file, nil
}

func FormatAST(file File) string {
	var out strings.Builder
	out.WriteString("File\n")

	for _, declaration := range file.Declarations {
		formatDeclaration(&out, declaration, 1)
	}

	return out.String()
}

func formatDeclaration(
	out *strings.Builder,
	declaration Declaration,
	depth int,
) {
	switch declaration := declaration.(type) {
	case FunctionDeclaration:
		formatFunctionDeclaration(out, declaration, depth)
	case *FunctionDeclaration:
		formatFunctionDeclaration(out, *declaration, depth)
	case ConstDeclaration:
		formatConstDeclaration(out, declaration, depth)
	case *ConstDeclaration:
		formatConstDeclaration(out, *declaration, depth)
	default:
		writeLine(out, depth, "UnknownDeclaration")
	}
}

func formatConstDeclaration(
	out *strings.Builder,
	declaration ConstDeclaration,
	depth int,
) {
	writeLine(out, depth, "ConstDeclaration")
	writeLine(out, depth+1, "Name")
	formatExpression(out, declaration.Name, depth+2)
	if declaration.Type.Name.Name != "" {
		writeLine(out, depth+1, "Type")
		formatExpression(out, declaration.Type.Name, depth+2)
	}
	writeLine(out, depth+1, "Value")
	formatExpression(out, declaration.Value, depth+2)
}

func formatFunctionDeclaration(
	out *strings.Builder,
	declaration FunctionDeclaration,
	depth int,
) {
	writeLine(
		out,
		depth,
		"FunctionDeclaration name=%q",
		declaration.Name,
	)
	writeLine(out, depth+1, "Parameters")
	for index, parameter := range declaration.Parameters {
		writeLine(out, depth+2, "Parameter %d", index)
		writeLine(out, depth+3, "Name")
		formatExpression(out, parameter.Name, depth+4)
		writeLine(out, depth+3, "Type")
		formatExpression(out, parameter.Type.Name, depth+4)
	}
	writeLine(out, depth+1, "ReturnType")
	formatExpression(out, declaration.ReturnType.Name, depth+2)

	if declaration.Body == nil {
		writeLine(out, depth+1, "Body <nil>")
		return
	}

	formatBlockStatement(out, declaration.Body, depth+1)
}

func formatBlockStatement(
	out *strings.Builder,
	block *BlockStatement,
	depth int,
) {
	writeLine(out, depth, "BlockStatement")

	for _, statement := range block.Statements {
		formatStatement(out, statement, depth+1)
	}
}

func formatStatement(out *strings.Builder, statement Statement, depth int) {
	switch statement := statement.(type) {
	case ReturnStatement:
		writeLine(out, depth, "ReturnStatement")
		formatExpression(out, statement.Value, depth+1)
	case VariableDeclarationStatement:
		kind := "const"
		if statement.Mutable {
			kind = "let"
		}

		writeLine(
			out,
			depth,
			"VariableDeclarationStatement kind=%q name=%q",
			kind,
			statement.Name,
		)
		if statement.Type.Name.Name != "" {
			writeLine(out, depth+1, "Type")
			formatExpression(out, statement.Type.Name, depth+2)
		}
		writeLine(out, depth+1, "Value")
		formatExpression(out, statement.Value, depth+2)
	case ExpressionStatement:
		writeLine(out, depth, "ExpressionStatement")
		formatExpression(out, statement.Value, depth+1)
	case AssignmentStatement:
		writeLine(out, depth, "AssignmentStatement")
		writeLine(out, depth+1, "Target")
		formatExpression(out, statement.Target, depth+2)
		writeLine(out, depth+1, "Value")
		formatExpression(out, statement.Value, depth+2)
	case IfStatement:
		writeLine(out, depth, "IfStatement")
		writeLine(out, depth+1, "Condition")
		formatExpression(out, statement.Condition, depth+2)
		writeLine(out, depth+1, "Then")
		formatBlockStatement(out, &statement.ThenBlock, depth+2)
		if len(statement.ElseBlock.Statements) > 0 {
			writeLine(out, depth+1, "Else")
			formatBlockStatement(out, &statement.ElseBlock, depth+2)
		}
	case WhileStatement:
		writeLine(out, depth, "WhileStatement")
		writeLine(out, depth+1, "Condition")
		formatExpression(out, statement.Condition, depth+2)
		writeLine(out, depth+1, "Body")
		formatBlockStatement(out, &statement.Body, depth+2)
	default:
		writeLine(out, depth, "UnknownStatement")
	}
}

func formatExpression(out *strings.Builder, expression Expression, depth int) {
	switch expression := expression.(type) {
	case UnaryExpression:
		writeLine(out, depth, "UnaryExpression operator=%q", expression.operator)
		writeLine(out, depth+1, "Expression")
		formatExpression(out, expression.expression, depth+2)
	case BinaryExpression:
		writeLine(out, depth, "BinaryExpression operator=%q", expression.operator)
		writeLine(out, depth+1, "Left")
		formatExpression(out, expression.left, depth+2)
		writeLine(out, depth+1, "Right")
		formatExpression(out, expression.right, depth+2)
	case FunctionCallExpression:
		writeLine(out, depth, "FunctionCallExpression")
		writeLine(out, depth+1, "Callee")
		formatExpression(out, expression.Callee, depth+2)
		writeLine(out, depth+1, "Arguments")
		for index, argument := range expression.Arguments {
			writeLine(out, depth+2, "Argument %d", index)
			formatExpression(out, argument, depth+3)
		}
	case IntegerLiteral:
		writeLine(out, depth, "IntegerLiteral value=%q", expression.Value)
	case BooleanLiteral:
		writeLine(out, depth, "BooleanLiteral value=%q", expression.Value)
	case StringLiteral:
		writeLine(out, depth, "StringLiteral value=%q", expression.Value)
	case CharacterLiteral:
		writeLine(out, depth, "CharacterLiteral value=%q", expression.Value)
	case Identifier:
		writeLine(out, depth, "Identifier name=%q", expression.Name)
	default:
		writeLine(out, depth, "UnknownExpression")
	}
}

func writeLine(out *strings.Builder, depth int, format string, args ...any) {
	out.WriteString(strings.Repeat("  ", depth))
	fmt.Fprintf(out, format, args...)
	out.WriteByte('\n')
}
