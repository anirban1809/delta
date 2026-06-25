package token

type Kind int

const (
	Kind_Illegal Kind = iota
	Kind_EOF

	Kind_Identifier
	Kind_IntegerLiteral
	Kind_FloatLiteral
	Kind_BooleanLiteral
	Kind_StringLiteral
	Kind_CharacterLiteral
	Kind_LineComment
	Kind_BlockComment

	Keyword_Function
	Keyword_Return
	Keyword_Const
	Keyword_Let
	Keyword_If
	Keyword_Else
	Keyword_While
	Keyword_For
	Keyword_Switch
	Keyword_Continue
	Keyword_Case
	Keyword_Default
	Keyword_Break
	Keyword_Type
	Keyword_Error
	Keyword_As
	Keyword_Forward
	Keyword_Check
	Keyword_Import
	Keyword_Export
	Keyword_From
	Keyword_Edit
	Keyword_New
	Keyword_Clone
	Keyword_Move
	Keyword_Unique
	Keyword_Heap

	Type_Int32

	Symbol_LeftParen
	Symbol_RightParen
	Symbol_LeftBrace
	Symbol_RightBrace
	Symbol_Colon
	Symbol_Semicolon
	Symbol_Comma
	Symbol_Plus
	Symbol_Minus
	Symbol_Asterisk
	Symbol_FSlash
	Symbol_Percent
	Symbol_Less
	Symbol_LessEq
	Symbol_Greater
	Symbol_GreaterEq
	Symbol_Equals
	Symbol_Equality
	Symbol_NotEquals
	Symbol_Not
	Symbol_LogicalAnd
	Symbol_LogicalOr
	Symbol_Pipe
	Symbol_Ampersand
	Symbol_Caret
	Symbol_Tilde
	Symbol_ShiftLeft
	Symbol_ShiftRight
	Symbol_PlusEquals
	Symbol_MinusEquals
	Symbol_AsteriskEquals
	Symbol_Increment
	Symbol_Decrement
	Symbol_Dot
	Symbol_Range
	Symbol_Ellipsis
)

type Token struct {
	Kind   Kind
	Lexeme string
	Line   int
	Column int
}

func (k Kind) String() string {
	switch k {
	case Kind_Illegal:
		return "illegal"
	case Kind_EOF:
		return "end of file"
	case Kind_Identifier:
		return "identifier"
	case Kind_IntegerLiteral:
		return "integer literal"
	case Kind_FloatLiteral:
		return "float literal"
	case Kind_BooleanLiteral:
		return "boolean literal"
	case Kind_StringLiteral:
		return "string literal"
	case Kind_CharacterLiteral:
		return "character literal"
	case Kind_LineComment:
		return "line comment"
	case Kind_BlockComment:
		return "block comment"
	case Keyword_Function:
		return "function"
	case Keyword_Return:
		return "return"
	case Keyword_Const:
		return "const"
	case Keyword_Let:
		return "let"
	case Keyword_If:
		return "if"
	case Keyword_Else:
		return "else"
	case Keyword_While:
		return "while"
	case Keyword_For:
		return "for"
	case Keyword_Switch:
		return "switch"
	case Keyword_Case:
		return "case"
	case Keyword_Default:
		return "default"
	case Keyword_Continue:
		return "contnue"
	case Keyword_Break:
		return "break"
	case Keyword_Type:
		return "type"
	case Symbol_LeftParen:
		return "("
	case Symbol_RightParen:
		return ")"
	case Symbol_LeftBrace:
		return "{"
	case Symbol_RightBrace:
		return "}"
	case Symbol_Colon:
		return ":"
	case Symbol_Semicolon:
		return ";"
	case Symbol_Comma:
		return ","
	case Symbol_Plus:
		return "+"
	case Symbol_Minus:
		return "-"
	case Symbol_Asterisk:
		return "*"
	case Symbol_FSlash:
		return "/"
	case Symbol_Percent:
		return "%"
	case Symbol_Less:
		return "<"
	case Symbol_LessEq:
		return "<="
	case Symbol_Greater:
		return ">"
	case Symbol_GreaterEq:
		return ">="
	case Symbol_Equals:
		return "="
	case Symbol_Equality:
		return "=="
	case Symbol_NotEquals:
		return "!="
	case Symbol_Not:
		return "!"
	case Symbol_LogicalAnd:
		return "&&"
	case Symbol_LogicalOr:
		return "||"
	case Symbol_Pipe:
		return "|"
	case Symbol_Ampersand:
		return "&"
	case Symbol_Caret:
		return "^"
	case Symbol_Tilde:
		return "~"
	case Symbol_ShiftLeft:
		return "<<"
	case Symbol_ShiftRight:
		return ">>"
	case Symbol_PlusEquals:
		return "+="
	case Symbol_MinusEquals:
		return "-="
	case Symbol_AsteriskEquals:
		return "*="
	case Symbol_Increment:
		return "++"
	case Symbol_Decrement:
		return "--"
	case Symbol_Dot:
		return "."
	case Symbol_Range:
		return ".."
	case Symbol_Ellipsis:
		return "..."
	case Keyword_As:
		return "as"
	case Keyword_Error:
		return "error"
	case Keyword_Forward:
		return "forward"
	case Keyword_Check:
		return "check"
	case Keyword_Import:
		return "import"
	case Keyword_Export:
		return "export"
	case Keyword_From:
		return "from"
	case Keyword_Edit:
		return "edit"
	case Keyword_New:
		return "new"
	case Keyword_Move:
		return "move"
	case Keyword_Clone:
		return "clone"
	case Keyword_Unique:
		return "unique"
	case Keyword_Heap:
		return "heap"

	default:
		return "unknown"
	}
}

func LookupIdent(s string) Kind {
	switch s {
	case "function":
		return Keyword_Function
	case "return":
		return Keyword_Return
	case "const":
		return Keyword_Const
	case "let":
		return Keyword_Let
	case "if":
		return Keyword_If
	case "else":
		return Keyword_Else
	case "while":
		return Keyword_While
	case "for":
		return Keyword_For
	case "true":
		return Kind_BooleanLiteral
	case "false":
		return Kind_BooleanLiteral
	case "switch":
		return Keyword_Switch
	case "case":
		return Keyword_Case
	case "default":
		return Keyword_Default
	case "continue":
		return Keyword_Continue
	case "break":
		return Keyword_Break
	case "type":
		return Keyword_Type
	case "as":
		return Keyword_As
	case "error":
		return Keyword_Error
	case "forward":
		return Keyword_Forward
	case "check":
		return Keyword_Check
	case "import":
		return Keyword_Import
	case "export":
		return Keyword_Export
	case "from":
		return Keyword_From
	case "edit":
		return Keyword_Edit
	case "new":
		return Keyword_New
	case "move":
		return Keyword_Move
	case "clone":
		return Keyword_Clone
	case "unique":
		return Keyword_Unique
	case "heap":
		return Keyword_Heap

	default:
		return Kind_Identifier
	}
}

// Keywords returns the source-language keywords accepted by LookupIdent.
// Boolean literals are included because editors present them alongside
// keywords in expression completion.
func Keywords() []string {
	return []string{
		"function", "return", "const", "let", "if", "else", "while", "for",
		"switch", "case", "default", "continue", "break", "type",
		"as", "error", "forward", "check", "import", "export", "from",
		"true", "false", "edit", "new", "move", "clone", "unique", "heap",
	}
}
