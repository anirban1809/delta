package semantics

import "delta/internal/ast"

// ScopeNode mirrors the analyzer's scope tree with source-position ranges
// so the LSP can answer "what scope contains this cursor position?".
//
// The root corresponds to the file's global scope. Each function body and
// each block introduces a child node. End is the position of the closing
// `}` (or the file end for the root).
type ScopeNode struct {
	Start    ast.Position
	End      ast.Position
	Scope    *Scope
	Parent   *ScopeNode
	Children []*ScopeNode
}

// Contains reports whether pos lies within this node's source range.
// The root has a zero Start and treats every position as inside.
func (n *ScopeNode) Contains(pos ast.Position) bool {
	if n.Parent == nil {
		return true // root spans the whole file
	}
	if positionBefore(pos, n.Start) {
		return false
	}
	if n.End == (ast.Position{}) {
		return true // unterminated block — best-effort
	}
	if positionBefore(n.End, pos) {
		return false
	}
	return true
}

// FindDeepest returns the deepest ScopeNode whose range contains pos.
// Walks children depth-first; falls back to the current node when no
// child contains the position.
func (n *ScopeNode) FindDeepest(pos ast.Position) *ScopeNode {
	for _, c := range n.Children {
		if c.Contains(pos) {
			return c.FindDeepest(pos)
		}
	}
	return n
}

// positionBefore reports whether a strictly precedes b in source order.
func positionBefore(a, b ast.Position) bool {
	if a.Line != b.Line {
		return a.Line < b.Line
	}
	return a.Column < b.Column
}

type TypeKind int

const (
	TypeInvalid TypeKind = iota // poison value; suppresses cascades
	TypeVoid
	TypeInt32
	TypeBool
	TypeString
	TypeChar
	TypeEmpty
)

type Type struct {
	Kind TypeKind
}

func (t Type) String() string {
	switch t.Kind {
	case TypeVoid:
		return "void"
	case TypeInt32:
		return "int32"
	case TypeBool:
		return "bool"
	case TypeString:
		return "string"
	case TypeChar:
		return "char"
	case TypeEmpty:
		return ""
	default:
		return "<invalid>"
	}
}

func resolveTypeName(name string) (Type, bool) {
	switch name {
	case "int32":
		return Type{TypeInt32}, true
	case "bool":
		return Type{TypeBool}, true
	case "void":
		return Type{TypeVoid}, true
	case "string":
		return Type{TypeString}, true
	case "char":
		return Type{TypeChar}, true
	case "":
		return Type{TypeEmpty}, true
	}
	return Type{TypeInvalid}, false
}

type FunctionSignature struct {
	Parameters  []Type
	ReturnTypes []Type
	ErrorTypes  []Type
}
