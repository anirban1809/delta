import type { Position } from "./types.js";

export type Token = {
    kind: TokenKind;
    value: string;
    line: number;
    column: number;
    start: number;
    end: number;
};

export function getTokenPosition(t: Token): Position {
    return {
        line: t.line,
        column: t.column,
        start: t.start,
        end: t.end,
    };
}

export enum TokenKind {
    Kind_Illegal = "Kind_Illegal",
    Kind_EOF = "Kind_EOF",

    //general purpose
    Kind_Identifier = "Kind_Identifier",
    Kind_IntegerLiteral = "Kind_IntegerLiteral",
    Kind_FloatLiteral = "Kind_FloatLiteral",
    Kind_BooleanLiteral = "Kind_BooleanLiteral",
    Kind_StringLiteral = "Kind_StringLiteral",
    Kind_CharacterLiteral = "Kind_CharacterLiteral",
    Kind_LineComment = "Kind_LineComment",
    Kind_BlockComment = "Kind_BlockComment",

    //keywords
    Keyword_Function = "Keyword_Function",
    Keyword_Return = "Keyword_Return",
    Keyword_Const = "Keyword_Const",
    Keyword_Let = "Keyword_Let",
    Keyword_If = "Keyword_If",
    Keyword_Else = "Keyword_Else",
    Keyword_While = "Keyword_While",
    Keyword_For = "Keyword_For",
    Keyword_Switch = "Keyword_Switch",
    Keyword_Continue = "Keyword_Continue",
    Keyword_Case = "Keyword_Case",
    Keyword_Default = "Keyword_Default",
    Keyword_Break = "Keyword_Break",
    Keyword_Type = "Keyword_Type",
    Keyword_Error = "Keyword_Error",
    Keyword_As = "Keyword_As",
    Keyword_Forward = "Keyword_Forward",
    Keyword_Check = "Keyword_Check",
    Keyword_Import = "Keyword_Import",
    Keyword_Export = "Keyword_Export",
    Keyword_Module = "Keyword_Module",
    Keyword_From = "Keyword_From",
    Keyword_Edit = "Keyword_Edit",
    Keyword_New = "Keyword_New",
    Keyword_Clone = "Keyword_Clone",
    Keyword_Move = "Keyword_Move",
    Keyword_Unique = "Keyword_Unique",
    Keyword_Heap = "Keyword_Heap",
    Keyword_Struct = "Keyword_Struct",
    Keyword_Enum = "Keyword_Enum",
    Keyword_Union = "Keyword_Union",
    Keyword_Extern = "Keyword_Extern",
    Keyword_Ffi = "Keyword_Ffi",
    Keyword_Header = "Keyword_Header",
    Keyword_Unsafe = "Keyword_Unsafe",
    Keyword_Static = "Keyword_Static",
    Keyword_Dynamic = "Keyword_Dynamic",

    //symbols
    Symbol_LeftParen = "Symbol_LeftParen",
    Symbol_RightParen = "Symbol_RightParen",
    Symbol_LeftBrace = "Symbol_LeftBrace",
    Symbol_RightBrace = "Symbol_RightBrace",
    Symbol_LeftBracket = "Symbol_LeftBracket",
    Symbol_RightBracket = "Symbol_RightBracket",
    Symbol_Colon = "Symbol_Colon",
    Symbol_Semicolon = "Symbol_Semicolon",
    Symbol_Comma = "Symbol_Comma",
    Symbol_Plus = "Symbol_Plus",
    Symbol_Minus = "Symbol_Minus",
    Symbol_Asterisk = "Symbol_Asterisk",
    Symbol_FSlash = "Symbol_FSlash",
    Symbol_Percent = "Symbol_Percent",
    Symbol_Less = "Symbol_Less",
    Symbol_LessEq = "Symbol_LessEq",
    Symbol_Greater = "Symbol_Greater",
    Symbol_GreaterEq = "Symbol_GreaterEq",
    Symbol_Equals = "Symbol_Equals",
    Symbol_Equality = "Symbol_Equality",
    Symbol_NotEquals = "Symbol_NotEquals",
    Symbol_Not = "Symbol_Not",
    Symbol_LogicalAnd = "Symbol_LogicalAnd",
    Symbol_LogicalOr = "Symbol_LogicalOr",
    Symbol_Pipe = "Symbol_Pipe",
    Symbol_Ampersand = "Symbol_Ampersand",
    Symbol_Caret = "Symbol_Caret",
    Symbol_Tilde = "Symbol_Tilde",
    Symbol_ShiftLeft = "Symbol_ShiftLeft",
    Symbol_ShiftRight = "Symbol_ShiftRight",
    Symbol_PlusEquals = "Symbol_PlusEquals",
    Symbol_MinusEquals = "Symbol_MinusEquals",
    Symbol_AsteriskEquals = "Symbol_AsteriskEquals",
    Symbol_FSlashEquals = "Symbol_FSlashEquals",
    Symbol_PercentEquals = "Symbol_PercentEquals",
    Symbol_AmpersandEquals = "Symbol_AmpersandEquals",
    Symbol_PipeEquals = "Symbol_PipeEquals",
    Symbol_CaretEquals = "Symbol_CaretEquals",
    Symbol_ShiftLeftEquals = "Symbol_ShiftLeftEquals",
    Symbol_ShiftRightEquals = "Symbol_ShiftRightEquals",
    Symbol_Increment = "Symbol_Increment",
    Symbol_Decrement = "Symbol_Decrement",
    Symbol_Dot = "Symbol_Dot",
    Symbol_Range = "Symbol_Range",
    Symbol_Ellipsis = "Symbol_Ellipsis",
}

// string returns the canonical string representation of a token kind:
// the literal lexeme for keywords and symbols, and a human-readable
// description for the general-purpose kinds that have no fixed lexeme.
export function string(kind: TokenKind): string {
    switch (kind) {
        case TokenKind.Kind_Illegal:
            return "illegal";
        case TokenKind.Kind_EOF:
            return "end of file";
        case TokenKind.Kind_Identifier:
            return "identifier";
        case TokenKind.Kind_IntegerLiteral:
            return "integer literal";
        case TokenKind.Kind_FloatLiteral:
            return "float literal";
        case TokenKind.Kind_BooleanLiteral:
            return "boolean literal";
        case TokenKind.Kind_StringLiteral:
            return "string literal";
        case TokenKind.Kind_CharacterLiteral:
            return "character literal";
        case TokenKind.Kind_LineComment:
            return "line comment";
        case TokenKind.Kind_BlockComment:
            return "block comment";

        case TokenKind.Keyword_Function:
            return "function";
        case TokenKind.Keyword_Return:
            return "return";
        case TokenKind.Keyword_Const:
            return "const";
        case TokenKind.Keyword_Let:
            return "let";
        case TokenKind.Keyword_If:
            return "if";
        case TokenKind.Keyword_Else:
            return "else";
        case TokenKind.Keyword_While:
            return "while";
        case TokenKind.Keyword_For:
            return "for";
        case TokenKind.Keyword_Switch:
            return "switch";
        case TokenKind.Keyword_Continue:
            return "continue";
        case TokenKind.Keyword_Case:
            return "case";
        case TokenKind.Keyword_Default:
            return "default";
        case TokenKind.Keyword_Break:
            return "break";
        case TokenKind.Keyword_Type:
            return "type";
        case TokenKind.Keyword_Error:
            return "error";
        case TokenKind.Keyword_As:
            return "as";
        case TokenKind.Keyword_Forward:
            return "forward";
        case TokenKind.Keyword_Check:
            return "check";
        case TokenKind.Keyword_Import:
            return "import";
        case TokenKind.Keyword_Export:
            return "export";
        case TokenKind.Keyword_Module:
            return "module";
        case TokenKind.Keyword_From:
            return "from";
        case TokenKind.Keyword_Edit:
            return "edit";
        case TokenKind.Keyword_New:
            return "new";
        case TokenKind.Keyword_Clone:
            return "clone";
        case TokenKind.Keyword_Move:
            return "move";
        case TokenKind.Keyword_Unique:
            return "unique";
        case TokenKind.Keyword_Heap:
            return "heap";
        case TokenKind.Keyword_Struct:
            return "struct";
        case TokenKind.Keyword_Union:
            return "union";
        case TokenKind.Keyword_Enum:
            return "enum";
        case TokenKind.Keyword_Extern:
            return "extern";
        case TokenKind.Keyword_Ffi:
            return "ffi";
        case TokenKind.Keyword_Header:
            return "header";
        case TokenKind.Keyword_Unsafe:
            return "unsafe";
        case TokenKind.Keyword_Static:
            return "static";
        case TokenKind.Keyword_Dynamic:
            return "dynamic";

        case TokenKind.Symbol_LeftParen:
            return "(";
        case TokenKind.Symbol_RightParen:
            return ")";
        case TokenKind.Symbol_LeftBrace:
            return "{";
        case TokenKind.Symbol_RightBrace:
            return "}";
        case TokenKind.Symbol_LeftBracket:
            return "[";
        case TokenKind.Symbol_RightBracket:
            return "]";
        case TokenKind.Symbol_Colon:
            return ":";
        case TokenKind.Symbol_Semicolon:
            return ";";
        case TokenKind.Symbol_Comma:
            return ",";
        case TokenKind.Symbol_Plus:
            return "+";
        case TokenKind.Symbol_Minus:
            return "-";
        case TokenKind.Symbol_Asterisk:
            return "*";
        case TokenKind.Symbol_FSlash:
            return "/";
        case TokenKind.Symbol_Percent:
            return "%";
        case TokenKind.Symbol_Less:
            return "<";
        case TokenKind.Symbol_LessEq:
            return "<=";
        case TokenKind.Symbol_Greater:
            return ">";
        case TokenKind.Symbol_GreaterEq:
            return ">=";
        case TokenKind.Symbol_Equals:
            return "=";
        case TokenKind.Symbol_Equality:
            return "==";
        case TokenKind.Symbol_NotEquals:
            return "!=";
        case TokenKind.Symbol_Not:
            return "!";
        case TokenKind.Symbol_LogicalAnd:
            return "&&";
        case TokenKind.Symbol_LogicalOr:
            return "||";
        case TokenKind.Symbol_Pipe:
            return "|";
        case TokenKind.Symbol_Ampersand:
            return "&";
        case TokenKind.Symbol_Caret:
            return "^";
        case TokenKind.Symbol_Tilde:
            return "~";
        case TokenKind.Symbol_ShiftLeft:
            return "<<";
        case TokenKind.Symbol_ShiftRight:
            return ">>";
        case TokenKind.Symbol_PlusEquals:
            return "+=";
        case TokenKind.Symbol_MinusEquals:
            return "-=";
        case TokenKind.Symbol_AsteriskEquals:
            return "*=";
        case TokenKind.Symbol_FSlashEquals:
            return "/=";
        case TokenKind.Symbol_PercentEquals:
            return "%=";
        case TokenKind.Symbol_AmpersandEquals:
            return "&=";
        case TokenKind.Symbol_PipeEquals:
            return "|=";
        case TokenKind.Symbol_CaretEquals:
            return "^=";
        case TokenKind.Symbol_ShiftLeftEquals:
            return "<<=";
        case TokenKind.Symbol_ShiftRightEquals:
            return ">>=";
        case TokenKind.Symbol_Increment:
            return "++";
        case TokenKind.Symbol_Decrement:
            return "--";
        case TokenKind.Symbol_Dot:
            return ".";
        case TokenKind.Symbol_Range:
            return "..";
        case TokenKind.Symbol_Ellipsis:
            return "...";

        default:
            return "unknown";
    }
}

// getTokenKind maps a source lexeme to its token kind. Keywords and
// symbols resolve to their respective kinds; "true"/"false" resolve to a
// boolean literal; anything else is treated as an identifier.
export function getTokenKind(s: string): TokenKind {
    switch (s) {
        case "function":
            return TokenKind.Keyword_Function;
        case "return":
            return TokenKind.Keyword_Return;
        case "const":
            return TokenKind.Keyword_Const;
        case "let":
            return TokenKind.Keyword_Let;
        case "if":
            return TokenKind.Keyword_If;
        case "else":
            return TokenKind.Keyword_Else;
        case "while":
            return TokenKind.Keyword_While;
        case "for":
            return TokenKind.Keyword_For;
        case "switch":
            return TokenKind.Keyword_Switch;
        case "case":
            return TokenKind.Keyword_Case;
        case "default":
            return TokenKind.Keyword_Default;
        case "continue":
            return TokenKind.Keyword_Continue;
        case "break":
            return TokenKind.Keyword_Break;
        case "type":
            return TokenKind.Keyword_Type;
        case "error":
            return TokenKind.Keyword_Error;
        case "as":
            return TokenKind.Keyword_As;
        case "forward":
            return TokenKind.Keyword_Forward;
        case "check":
            return TokenKind.Keyword_Check;
        case "import":
            return TokenKind.Keyword_Import;
        case "export":
            return TokenKind.Keyword_Export;
        case "module":
            return TokenKind.Keyword_Module;
        case "from":
            return TokenKind.Keyword_From;
        case "edit":
            return TokenKind.Keyword_Edit;
        case "new":
            return TokenKind.Keyword_New;
        case "clone":
            return TokenKind.Keyword_Clone;
        case "move":
            return TokenKind.Keyword_Move;
        case "unique":
            return TokenKind.Keyword_Unique;
        case "heap":
            return TokenKind.Keyword_Heap;
        case "struct":
            return TokenKind.Keyword_Struct;
        case "union":
            return TokenKind.Keyword_Union;
        case "enum":
            return TokenKind.Keyword_Enum;
        case "extern":
            return TokenKind.Keyword_Extern;
        case "ffi":
            return TokenKind.Keyword_Ffi;
        case "header":
            return TokenKind.Keyword_Header;
        case "unsafe":
            return TokenKind.Keyword_Unsafe;
        case "static":
            return TokenKind.Keyword_Static;
        case "dynamic":
            return TokenKind.Keyword_Dynamic;

        case "true":
        case "false":
            return TokenKind.Kind_BooleanLiteral;

        case "(":
            return TokenKind.Symbol_LeftParen;
        case ")":
            return TokenKind.Symbol_RightParen;
        case "{":
            return TokenKind.Symbol_LeftBrace;
        case "}":
            return TokenKind.Symbol_RightBrace;
        case "[":
            return TokenKind.Symbol_LeftBracket;
        case "]":
            return TokenKind.Symbol_RightBracket;
        case ":":
            return TokenKind.Symbol_Colon;
        case ";":
            return TokenKind.Symbol_Semicolon;
        case ",":
            return TokenKind.Symbol_Comma;
        case "+":
            return TokenKind.Symbol_Plus;
        case "-":
            return TokenKind.Symbol_Minus;
        case "*":
            return TokenKind.Symbol_Asterisk;
        case "/":
            return TokenKind.Symbol_FSlash;
        case "%":
            return TokenKind.Symbol_Percent;
        case "<":
            return TokenKind.Symbol_Less;
        case "<=":
            return TokenKind.Symbol_LessEq;
        case ">":
            return TokenKind.Symbol_Greater;
        case ">=":
            return TokenKind.Symbol_GreaterEq;
        case "=":
            return TokenKind.Symbol_Equals;
        case "==":
            return TokenKind.Symbol_Equality;
        case "!=":
            return TokenKind.Symbol_NotEquals;
        case "!":
            return TokenKind.Symbol_Not;
        case "&&":
            return TokenKind.Symbol_LogicalAnd;
        case "||":
            return TokenKind.Symbol_LogicalOr;
        case "|":
            return TokenKind.Symbol_Pipe;
        case "&":
            return TokenKind.Symbol_Ampersand;
        case "^":
            return TokenKind.Symbol_Caret;
        case "~":
            return TokenKind.Symbol_Tilde;
        case "<<":
            return TokenKind.Symbol_ShiftLeft;
        case ">>":
            return TokenKind.Symbol_ShiftRight;
        case "+=":
            return TokenKind.Symbol_PlusEquals;
        case "-=":
            return TokenKind.Symbol_MinusEquals;
        case "*=":
            return TokenKind.Symbol_AsteriskEquals;
        case "++":
            return TokenKind.Symbol_Increment;
        case "--":
            return TokenKind.Symbol_Decrement;
        case ".":
            return TokenKind.Symbol_Dot;
        case "..":
            return TokenKind.Symbol_Range;
        case "...":
            return TokenKind.Symbol_Ellipsis;

        default:
            return TokenKind.Kind_Identifier;
    }
}
