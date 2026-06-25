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

type ImportSpecifier struct {
	Position
	Name string
}

type ImportDeclaration struct {
	Position
	Specifiers []ImportSpecifier
	Path       string
}

func (ImportDeclaration) declarationNode() {}

type FunctionParameter struct {
	Position
	Name Identifier
	Type TypeIdentifier
}

type FunctionDeclaration struct {
	Position
	// Receiver is nil for free functions. When non-nil the declaration is a
	// receiver method: its Type is a reference (`&T` / `edit &T`) to the
	// record the method is attached to. The receiver name replaces `this`.
	Receiver     *FunctionParameter
	Name         string
	NamePosition Position
	ReturnTypes  []TypeIdentifier
	ErrorTypes   []TypeIdentifier
	Parameters   []FunctionParameter
	Body         *BlockStatement

	// Exported is true when the declaration is prefixed with `export`.
	Exported bool
}

func (FunctionDeclaration) declarationNode() {}

type TypeKind int

const (
	Primitive TypeKind = iota
	Custom
)

type TypeIdentifier struct {
	Name   Identifier
	Kind   TypeKind
	Fields []*TypeIdentifier // only populated in case of custom user defined record types, nil for other cases.

	// Reference is true for `&T` and `edit &T`. Edit is true only for the
	// mutable, exclusive form `edit &T` (and implies Reference). Both are
	// false for an ordinary by-value type.
	Reference bool
	Inner     *TypeIdentifier // populated in case of indirection type such as heap<T> and array<T>; this should not be used for generics
	Edit      bool
	Unique    bool
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
	Error  bool
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

type FloatLiteral struct {
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
func (FloatLiteral) expressionNode()   {}
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

type NewExpression struct {
	Position
	Type  *TypeIdentifier
	Value Expression
}

func (NewExpression) expressionNode() {}

type MoveExpression struct {
	Position
	Source Identifier
}

func (MoveExpression) expressionNode() {}

type CloneExpression struct {
	Position
	Source Expression
}

func (CloneExpression) expressionNode() {}

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

	// to check if the error returned by the resulting expression has been caught using the "as result" syntax
	Caught bool
}

func (FunctionCallExpression) expressionNode() {}

// ObjectLiteralExpression is a shape-only `{ ... }` value. Its nominal type
// is supplied later by semantic analysis from the surrounding typed context.
type ObjectLiteralExpression struct {
	Position
	Elements []ObjectLiteralElement
}

func (ObjectLiteralExpression) expressionNode() {}

type ObjectLiteralElement interface {
	objectLiteralElementNode()
	Pos() Position
}

type FieldInit struct {
	Position
	Name  string
	Value Expression
}

func (FieldInit) objectLiteralElementNode() {}

type SpreadElement struct {
	Position
	Source Expression
}

func (SpreadElement) objectLiteralElementNode() {}

type MemberAccessExpression struct {
	Position
	Receiver Expression
	Member   string
}

func (MemberAccessExpression) expressionNode() {}

type VariableDeclarationStatement struct {
	Position
	Mutable bool
	Name    string
	Type    TypeIdentifier
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
	// TargetExpression preserves member-access assignment targets while
	// Target remains available to the existing semantic/codegen phases.
	TargetExpression Expression
	// Operator is the compound-assignment arithmetic operator ("+", "-",
	// "*") for `+=`/`-=`/`*=`, or "" for a plain `=` assignment.
	Operator string
	Value    Expression
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
	Name     Identifier
	Type     TypeIdentifier
	Value    Expression
	Exported bool
}

func (ConstDeclaration) declarationNode() {}

type ForStatement struct {
	Position            // position of `for`
	Init     Statement  // *VariableDeclarationStatement or *ExpressionStatement, may be nil
	Cond     Expression // required; analyzer enforces bool typing
	Step     Expression // expression evaluated for effect; may be nil
	Body     *BlockStatement
}

func (ForStatement) statementNode() {}

type (
	BreakStatement    struct{ Position }
	ContinueStatement struct{ Position }
)

func (BreakStatement) statementNode()    {}
func (ContinueStatement) statementNode() {}

type PostfixUnaryExpression struct {
	Position            // position of the `++` / `--` token
	Operand  Expression // place expression
	Operator string     // "++" or "--"
}

func (PostfixUnaryExpression) expressionNode() {}

type SwitchStatement struct {
	Position  // position of `switch`
	Scrutinee Expression
	Cases     []*SwitchCase // ordered as written; every entry has len(Labels) >= 1
	Default   *SwitchCase   // required by analyzer; nil only when missing (analyzer errors)
}

func (SwitchStatement) statementNode() {}

type SwitchCase struct {
	Position              // position of `case` or `default`
	Labels   []Expression // nil iff this case is the Default
	Body     *BlockStatement
}

type FallibleStatement struct {
	Position
	Inner  Statement
	Result Identifier
}

func (FallibleStatement) statementNode() {}

type CheckStatement struct {
	Position
	Result Identifier
	Body   *BlockStatement
}

func (CheckStatement) statementNode() {}

type TypeDeclaration struct {
	Position
	Unique   bool
	Copyable bool
	Name     Identifier
	RHS      TypeRHS
	Exported bool
}

func (TypeDeclaration) declarationNode() {}

type TypeRHS interface {
	typeRHSNode()
	Pos() Position
}

type RecordRHS struct {
	Position
	Type   TypeIdentifier
	Fields []RecordField
}

func (RecordRHS) typeRHSNode() {}

type AliasRHS struct {
	Position
	Type   TypeIdentifier
	Target TypeIdentifier
}

func (AliasRHS) typeRHSNode() {}

type CompositionRHS struct {
	Position
	Type     TypeIdentifier
	Operands []CompositionOperand
	Style    CompositionStyle
}

func (CompositionRHS) typeRHSNode() {}

type CompositionStyle int

const (
	SpreadForm CompositionStyle = iota
	IntersectionForm
)

type CompositionOperand struct {
	Position
	Named  *TypeIdentifier
	Inline *RecordRHS
}

type RecordField struct {
	Position
	Name Identifier
	Type TypeIdentifier
}
