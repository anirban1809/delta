package ast

// Position is the source location of an AST node. Line and Column are
// 1-based; the zero value means "unknown".
type Position struct {
	Line   int
	Column int
}

// Pos returns the position itself. Embedding Position in a node type
// automatically promotes this method, so every concrete node satisfies
// the Pos() method required by the Expression / Statement / Declaration
// interfaces below.
func (p Position) Pos() Position { return p }

type File struct {
	Declarations []Declaration
}

type Declaration interface {
	declarationNode()
	Pos() Position
}

type Comment struct {
	Position
	Text      string
	Multiline bool
}

func (Comment) declarationNode() {}
func (Comment) statementNode()   {}

type FunctionParameter struct {
	Position
	Name Identifier
	Type TypeReference
}

type FunctionDeclaration struct {
	Position
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
	Position
	// End is the source position of the closing `}`. Used by the LSP to
	// answer "is the cursor inside this block?" when building the
	// scope-at-position tree. Zero value when the block was never closed
	// (e.g. truncated input recovered by the parser).
	End        Position
	Statements []Statement
}

type Statement interface {
	statementNode()
	Pos() Position
}

type ReturnStatement struct {
	Position
	Values []Expression
}

func (ReturnStatement) statementNode() {}

type Expression interface {
	expressionNode()
	Pos() Position
}

type IntegerLiteral struct {
	Position
	Value string
}

type BooleanLiteral struct {
	Position
	Value string
}

type StringLiteral struct {
	Position
	Value string
}

func (StringLiteral) expressionNode() {}

type CharacterLiteral struct {
	Position
	Value string
}

func (CharacterLiteral) expressionNode() {}

func (IntegerLiteral) expressionNode() {}
func (BooleanLiteral) expressionNode() {}

type Identifier struct {
	Position
	Name string
}

func (Identifier) expressionNode() {}

type UnaryExpression struct {
	Position
	Operator   string
	Expression Expression
}

func (UnaryExpression) expressionNode() {}

type BinaryExpression struct {
	Position
	Left     Expression
	Operator string
	Right    Expression
}

func (BinaryExpression) expressionNode() {}

type FunctionCallExpression struct {
	Position
	Callee    Expression
	Arguments []Expression
}

func (FunctionCallExpression) expressionNode() {}

type VariableDeclarationStatement struct {
	Position
	Mutable bool
	Name    string
	Type    TypeReference
	Value   Expression
}

func (VariableDeclarationStatement) statementNode() {}

type ExpressionStatement struct {
	Position
	Value Expression
}

func (ExpressionStatement) statementNode() {}

type AssignmentStatement struct {
	Position
	Target Identifier
	Value  Expression
}

func (AssignmentStatement) statementNode() {}

type IfStatement struct {
	Position
	Condition Expression
	ThenBlock BlockStatement
	ElseBlock BlockStatement
}

func (IfStatement) statementNode() {}

type WhileStatement struct {
	Position
	Condition Expression
	Body      BlockStatement
}

func (WhileStatement) statementNode() {}

type ConstDeclaration struct {
	Position
	Name  Identifier
	Type  TypeReference
	Value Expression
}

func (ConstDeclaration) declarationNode() {}
