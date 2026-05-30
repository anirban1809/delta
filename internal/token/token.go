package token

type Kind int

const (
	Kind_Illegal Kind = iota
	Kind_EOF

	Kind_Identifier
	Kind_IntegerLiteral
	Kind_BooleanLiteral
	Kind_StringLiteral
	Kind_CharacterLiteral

	Keyword_Function
	Keyword_Return
	Keyword_Const
	Keyword_Let
	Keyword_If
	Keyword_Else
	Keyword_While

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
	case Kind_BooleanLiteral:
		return "boolean literal"
	case Kind_StringLiteral:
		return "string literal"
	case Kind_CharacterLiteral:
		return "character literal"
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
	// case Type_Int32:
	// 	return "int32"
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
	case "true":
		return Kind_BooleanLiteral
	case "false":
		return Kind_BooleanLiteral
	default:
		return Kind_Identifier
	}
}
