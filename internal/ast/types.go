package ast

type File struct {
	Declarations []Declaration
}

type Declaration interface {
	declarationNode()
}

type FunctionParameter struct {
	Name Identifier
	Type TypeReference
}

type FunctionDeclaration struct {
	Name        string
	ReturnTypes []TypeReference
	ErrorTypes  []TypeReference
	Parameters  []FunctionParameter
	Body        *BlockStatement
}

func (FunctionDeclaration) declarationNode() {}

type TypeReference struct {
	Name Identifier
}

type BlockStatement struct {
	Statements []Statement
}

type Statement interface {
	statementNode()
}

type ReturnStatement struct {
	Values []Expression
}

func (ReturnStatement) statementNode() {}

type Expression interface {
	expressionNode()
}

type IntegerLiteral struct {
	Value string
}

type BooleanLiteral struct {
	Value string
}

type StringLiteral struct {
	Value string
}

func (StringLiteral) expressionNode() {}

type CharacterLiteral struct {
	Value string
}

func (CharacterLiteral) expressionNode() {}

func (IntegerLiteral) expressionNode() {}
func (BooleanLiteral) expressionNode() {}

type Identifier struct {
	Name string
}

func (Identifier) expressionNode() {}

type UnaryExpression struct {
	operator   string
	expression Expression
}

func (UnaryExpression) expressionNode() {}

type BinaryExpression struct {
	left     Expression
	operator string
	right    Expression
}

func (BinaryExpression) expressionNode() {}

type FunctionCallExpression struct {
	Callee    Expression
	Arguments []Expression
}

func (FunctionCallExpression) expressionNode() {}

type VariableDeclarationStatement struct {
	Mutable bool
	Name    string
	Type    TypeReference
	Value   Expression
}

func (VariableDeclarationStatement) statementNode() {}

type ExpressionStatement struct {
	Value Expression
}

func (ExpressionStatement) statementNode() {}

type AssignmentStatement struct {
	Target Identifier
	Value  Expression
}

func (AssignmentStatement) statementNode() {}

type IfStatement struct {
	Condition Expression
	ThenBlock BlockStatement
	ElseBlock BlockStatement
}

func (IfStatement) statementNode() {}

type WhileStatement struct {
	Condition Expression
	Body      BlockStatement
}

func (WhileStatement) statementNode() {}

type ConstDeclaration struct {
	Name  Identifier
	Type  TypeReference
	Value Expression
}

func (ConstDeclaration) declarationNode() {}
