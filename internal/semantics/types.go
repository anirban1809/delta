package semantics

import (
	"delta/internal/ast"
	"slices"
)

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

	TypeInt8
	TypeInt16
	TypeInt32
	TypeInt64
	TypeIntSize

	TypeUInt8
	TypeUInt16
	TypeUInt32
	TypeUInt64
	TypeUIntSize

	TypeFloat32
	TypeFloat64

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
	case TypeInt8:
		return "int8"
	case TypeInt16:
		return "int16"
	case TypeInt32:
		return "int32"
	case TypeInt64:
		return "int64"
	case TypeIntSize:
		return "intsize"
	case TypeUInt8:
		return "uint8"
	case TypeUInt16:
		return "uint16"
	case TypeUInt32:
		return "uint32"
	case TypeUInt64:
		return "uint64"
	case TypeUIntSize:
		return "uintsize"
	case TypeFloat32:
		return "float32"
	case TypeFloat64:
		return "float64"
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

// IsInteger reports whether the type is one of the supported integer types.
func (t Type) IsInteger() bool {
	switch t.Kind {
	case TypeInt8, TypeInt16, TypeInt32, TypeInt64, TypeIntSize,
		TypeUInt8, TypeUInt16, TypeUInt32, TypeUInt64, TypeUIntSize:
		return true
	default:
		return false
	}
}

// IsFloat reports whether the type is one of the supported floating-point
// types.
func (t Type) IsFloat() bool {
	switch t.Kind {
	case TypeFloat32, TypeFloat64:
		return true
	default:
		return false
	}
}

func ResolveTypeName(name string) (Type, bool) {
	switch name {
	case "int8":
		return Type{TypeInt8}, true
	case "int16":
		return Type{TypeInt16}, true
	case "int32":
		return Type{TypeInt32}, true
	case "int64":
		return Type{TypeInt64}, true
	case "intsize":
		return Type{TypeIntSize}, true
	case "uint8":
		return Type{TypeUInt8}, true
	case "uint16":
		return Type{TypeUInt16}, true
	case "uint32":
		return Type{TypeUInt32}, true
	case "uint64":
		return Type{TypeUInt64}, true
	case "uintsize":
		return Type{TypeUIntSize}, true
	case "float32":
		return Type{TypeFloat32}, true
	case "float64":
		return Type{TypeFloat64}, true
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

func (t *Type) BitWidth() int {
	switch t.Kind {
	case TypeInt8:
		return 8
	case TypeInt16:
		return 16
	case TypeInt32:
		return 32
	case TypeInt64:
		return 64
	case TypeIntSize:
		return 64
	case TypeUInt8:
		return 8
	case TypeUInt16:
		return 16
	case TypeUInt32:
		return 32
	case TypeUInt64:
		return 64
	case TypeUIntSize:
		return 64
	case TypeFloat32:
		return 32
	case TypeFloat64:
		return 64
	}

	return 0
}

func (t *Type) IsSigned() bool {
	signedT := []Type{
		{TypeInt8},
		{TypeInt16},
		{TypeInt32},
		{TypeInt64},
		{TypeIntSize},
	}
	return slices.Contains(signedT, *t)
}

func (t *Type) IsUnsigned() bool {
	unsigned := []Type{
		{TypeUInt8},
		{TypeUInt16},
		{TypeUInt32},
		{TypeUInt64},
		{TypeUIntSize},
	}
	return slices.Contains(unsigned, *t)
}

type ConvKind int

const (
	ConvForbidden ConvKind = iota
	ConvFree
	ConvTrap
)

// ConversionInfo is a resolved `T(x)` numeric conversion, recorded by the
// analyzer (keyed by the call expression's position) so codegen can lower it
// without re-running type inference: a ConvFree becomes a plain C cast, a
// ConvTrap a range-checked runtime helper.
type ConversionInfo struct {
	From Type
	To   Type
	Kind ConvKind
}

// ClassifyConversion decides how a `T(x)` numeric conversion is realized.
//
//   - ConvForbidden: no conversion form exists between these types (e.g. a
//     non-numeric operand such as bool). The analyzer reports a compile error.
//   - ConvFree: same signedness and a destination at least as wide as the
//     source (widening or identity). Lowered to a plain C cast, never traps.
//   - ConvTrap: any narrowing, or any change of signedness. Lowered to a
//     range-checked runtime helper that traps when the value does not fit.
func ClassifyConversion(from Type, to Type) ConvKind {
	// integer -> char must be validated at runtime: the value has to be a
	// Unicode scalar (<= U+10FFFF and not a UTF-16 surrogate), so it traps.
	// char is not numeric, so this is handled before the numeric guard below.
	if from.IsInteger() && to.Kind == TypeChar {
		return ConvTrap
	}

	if !isNumeric(from) || !isNumeric(to) {
		return ConvForbidden
	}

	// float -> int is the only numeric conversion that can fail at runtime:
	// the source may be NaN, ±infinity, or outside the integer's range.
	if from.IsFloat() && to.IsInteger() {
		return ConvTrap
	}

	// int -> float and float -> float are defined for every input. They may
	// lose precision, but they never trap.
	if from.IsFloat() || to.IsFloat() {
		return ConvFree
	}

	if from.IsSigned() == to.IsSigned() && to.BitWidth() >= from.BitWidth() {
		return ConvFree
	}

	return ConvTrap
}
