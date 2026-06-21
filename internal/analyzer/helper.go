package analyzer

import "delta/internal/ast"

// helpers
func getIdentName(i ast.Identifier) string {
	return i.Name
}

func getTypeRefPos(t ast.TypeReference) ast.Position {
	return t.Name.Position
}

func getTypeRefName(t ast.TypeReference) string {
	return t.Name.Name
}

func isNumeric(t Type) bool {
	return isInteger(t) || t.Kind == TypeFloat32 || t.Kind == TypeFloat64
}

func isEquable(t Type) bool {
	return isNumeric(t) || t.Kind == TypeBool || t.Kind == TypeChar
}

func isComparable(t Type) bool {
	return isInteger(t) || t.Kind == TypeChar
}

func isInteger(t Type) bool {
	switch t.Kind {
	case TypeInt8,
		TypeInt16,
		TypeInt32,
		TypeInt64,
		TypeIntSize,
		TypeUInt8,
		TypeUInt16,
		TypeUInt32,
		TypeUInt64,
		TypeUIntSize:
		return true
	}
	return false
}

func bitWidth(t Type) int {
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

func isPrimitiveType(ref ast.TypeReference) bool {
	typeName := ref.Name.Name

	switch typeName {
	case "bool",
		"char",
		"int8",
		"int16",
		"int32",
		"int64",
		"uint8",
		"uint16",
		"uint32",
		"uint64",
		"uintsize",
		"intsize",
		"float64",
		"float32",
		"string":
		return true
	}

	return false
}

func isSwitchable(t Type) bool {
	return isInteger(t) || t.Kind == TypeChar || t.Kind == TypeBool
}

// convOpType maps a conversion-operator name (e.g. "int32", "char") to the
// scalar Type it produces. The second return value reports whether name is a
// recognised conversion operator. The set is kept in sync with the scalar
// types declared in types.go.
func convOpType(name string) (Type, bool) {
	switch name {
	case "int8":
		return Type{Kind: TypeInt8, Name: "int8"}, true
	case "int16":
		return Type{Kind: TypeInt16, Name: "int16"}, true
	case "int32":
		return Type{Kind: TypeInt32, Name: "int32"}, true
	case "int64":
		return Type{Kind: TypeInt64, Name: "int64"}, true
	case "intsize":
		return Type{Kind: TypeIntSize, Name: "intsize"}, true
	case "uint8":
		return Type{Kind: TypeUInt8, Name: "uint8"}, true
	case "uint16":
		return Type{Kind: TypeUInt16, Name: "uint16"}, true
	case "uint32":
		return Type{Kind: TypeUInt32, Name: "uint32"}, true
	case "uint64":
		return Type{Kind: TypeUInt64, Name: "uint64"}, true
	case "uintsize":
		return Type{Kind: TypeUIntSize, Name: "uintsize"}, true
	case "float32":
		return Type{Kind: TypeFloat32, Name: "float32"}, true
	case "float64":
		return Type{Kind: TypeFloat64, Name: "float64"}, true
	case "char":
		return Type{Kind: TypeChar, Name: "char"}, true
	}
	return Type{}, false
}

func isFloat(t Type) bool {
	return t.Kind == TypeFloat32 || t.Kind == TypeFloat64
}

// exprText renders an expression operand back to a short source-like string,
// used to describe the value being converted in a Conversion record.
func exprText(e ast.Expression) string {
	switch e := e.(type) {
	case ast.Identifier:
		return e.Name
	case ast.IntegerLiteral:
		return e.Value
	case ast.FloatLiteral:
		return e.Value
	case ast.BooleanLiteral:
		return e.Value
	case ast.StringLiteral:
		return e.Value
	case ast.CharacterLiteral:
		return e.Value
	case ast.MemberAccessExpression:
		return exprText(e.Receiver) + "." + e.Member
	}
	return ""
}

// isConvertible reports whether a value of type from can be converted to to via
// a conversion operator. Conversions are defined between integer and char types
// (e.g. int64(x), char(y)) and between float types (float32(z), float64(w)).
// Float↔integer/char and bool conversions are not permitted.
func isConvertible(from, to Type) bool {
	source := isInteger(from) || from.Kind == TypeChar || isFloat(from)
	target := isInteger(to) || to.Kind == TypeChar || isFloat(to)
	if !source || !target {
		return false
	}

	// floats only convert to/from floats
	if isFloat(from) || isFloat(to) {
		return isFloat(from) && isFloat(to)
	}

	return true
}
