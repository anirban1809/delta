package analyzer

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
)

type (
	Validator struct {
		GlobalScope     Scope
		Errors          *diagnostics.ErrorBag
		Conversions     []Conversion
		ImportedSymbols map[string]Symbol
		// Methods holds receiver methods keyed by receiver record type name,
		// then method name. Methods are not free-function symbols in the global
		// scope; they are resolved through this table at call sites.
		Methods map[string]map[string]*FunctionSignature
		Result  *Result

		Refs      map[ast.Position]Symbol
		RootScope *ScopeNode
		Records   map[string][]ResolvedRecordField
		Divisions map[ast.Position]Type
		Shifts    map[ast.Position]Type
		IncDecs   map[ast.Position]Type

		currentNode *ScopeNode
	}
	Conversion struct {
		from  string
		to    string
		value string
	}

	OwnedSymbol struct {
		Name  string
		Type  string
		Moved bool
	}

	Result struct {
		Conversions []Conversion
		Errors      *diagnostics.ErrorBag
	}
)

type ScopeNode struct {
	Start    ast.Position
	End      ast.Position
	Scope    *Scope
	Parent   *ScopeNode
	Children []*ScopeNode
}

func (n *ScopeNode) Contains(pos ast.Position) bool {
	if n.Parent == nil {
		return true
	}
	if astPositionBefore(pos, n.Start) {
		return false
	}
	if n.End == (ast.Position{}) {
		return true
	}
	return !astPositionBefore(n.End, pos)
}

func (n *ScopeNode) FindDeepest(pos ast.Position) *ScopeNode {
	for _, child := range n.Children {
		if child.Contains(pos) {
			return child.FindDeepest(pos)
		}
	}
	return n
}

type Flow uint8

const (
	FlowContinues Flow = iota
	FlowReturns
	FlowBreaks
	FlowContinuesLoop
	FlowExit
)

type SymbolKind int

const (
	SymbolFunction SymbolKind = iota
	SymbolFileConst
	SymbolParameter
	SymbolReturn
	SymbolError
	SymbolLocalConst
	SymbolLocalLet
	SymbolTypeDecl
	SymbolResult
)

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

	TypeCustom
	TypeUninit
)

type Field struct {
	Type     Type
	Name     string
	Position ast.Position
}

type ResolvedRecordField struct {
	Name     string
	Type     Type
	Position ast.Position
}

type Type struct {
	Name      string
	Kind      TypeKind
	Alias     string  // used to track the name of the type of which this is an alias
	Fields    []Field // for user defined record types, for other types it stays nil (always check)
	Edit      bool    // if the type is an editable reference e.g.: edit &t (Reference needs to be true for this)
	Reference bool    // if the type if a reference e.g. &t
	Unique    bool
}

type FunctionSignature struct {
	Name           string
	ParameterNames []string
	Parameters     []Type
	ReturnTypes    []Type
	ErrorTypes     []Type
	// === Phase L (receiver methods) BEGIN ===
	// ReceiverType is nil for free functions. For a receiver method it is the
	// record type the method is attached to; ReceiverName is the receiver
	// binding name (it replaces `this`); ReceiverEdit is true for `edit &T`.
	ReceiverType *Type
	ReceiverName string
	ReceiverEdit bool
	// === Phase L (receiver methods) END ===
}

type CheckContext struct {
	FnSig       *FunctionSignature
	LoopDepth   int
	SwitchDepth int
}

type SymbolStatus int

const (
	StatusActive SymbolStatus = iota
	StatusPending
)

// MovedStatus tracks the move state of an owned binding. A binding starts
// Active, becomes Moved after `move`, and becomes MaybeMoved where control-flow
// paths disagree on whether it was moved. Reading, writing, borrowing, cloning,
// or moving anything that is not Active is rejected.
type MovedStatus int

const (
	Active MovedStatus = iota
	Moved
	MaybeMoved
)

type Symbol struct {
	Name        string
	Kind        SymbolKind
	Type        Type
	Initialized bool
	Position    ast.Position
	DefPos      ast.Position

	// status of the symbol which is a result from a fallible operation. it will remain pending until checked
	Status SymbolStatus

	// for if the "result" in "as result" has been checked
	Checked bool

	// move state of the value; anything other than Active is unusable
	Moved MovedStatus

	// tracks the position of the move site
	MovePos   ast.Position
	Display   string
	Signature *FunctionSignature

	Exported   bool
	Imported   bool
	ModuleID   string
	CName      string
	SourcePath string

	// contains the name of the symbol associtate with the result
	// for example:
	// const x = y() as value;
	// here for the result "value", the FallibleSymbol is x
	FallibleSymbol string
}

type Scope struct {
	Parent *Scope

	// set to true if the scope if a part of an conditional if branch which may or may not get executed
	Branch  bool
	Moves   map[*Symbol]MovedStatus
	Symbols map[string]*Symbol
}

func (t Type) String() string {
	prefix := ""
	if t.Edit {
		prefix = "edit &"
	} else if t.Reference {
		prefix = "&"
	}
	if t.Name != "" {
		return prefix + t.Name
	}
	switch t.Kind {
	case TypeVoid:
		return prefix + "void"
	case TypeInt8:
		return prefix + "int8"
	case TypeInt16:
		return prefix + "int16"
	case TypeInt32:
		return prefix + "int32"
	case TypeInt64:
		return prefix + "int64"
	case TypeIntSize:
		return prefix + "intsize"
	case TypeUInt8:
		return prefix + "uint8"
	case TypeUInt16:
		return prefix + "uint16"
	case TypeUInt32:
		return prefix + "uint32"
	case TypeUInt64:
		return prefix + "uint64"
	case TypeUIntSize:
		return prefix + "uintsize"
	case TypeFloat32:
		return prefix + "float32"
	case TypeFloat64:
		return prefix + "float64"
	case TypeBool:
		return prefix + "bool"
	case TypeString:
		return prefix + "string"
	case TypeChar:
		return prefix + "char"
	case TypeEmpty:
		return ""
	default:
		return prefix + "<invalid>"
	}
}

func (s *Scope) NewScope(parent *Scope) Scope {
	return Scope{
		Parent:  parent,
		Moves:   map[*Symbol]MovedStatus{},
		Symbols: map[string]*Symbol{},
	}
}

func (s *Scope) Lookup(name string) (*Symbol, bool) {
	v, ok := s.Symbols[name]
	if !ok {
		if s.Parent != nil {
			return s.Parent.Lookup(name)
		}
		return &Symbol{}, false
	}
	return v, true
}

func (s *Scope) Define(name string, symbol Symbol) bool {
	symbol.Name = name
	if symbol.DefPos == (ast.Position{}) {
		symbol.DefPos = symbol.Position
	}
	if symbol.Position == (ast.Position{}) {
		symbol.Position = symbol.DefPos
	}
	if symbol.Display == "" {
		symbol.Display = renderSymbolDisplay(symbol)
	}
	s.Symbols[name] = &symbol
	return true
}

// AddError  Helper to add error to the errorbag
func (v *Validator) AddError(position ast.Position, message string) {
	v.Errors.AddError(
		diagnostics.SourceError{
			Stage:   diagnostics.Semantic,
			Line:    position.Line,
			Column:  position.Column,
			Message: message,
		},
	)
}

func ResolveTypeName(name string) (Type, bool) {
	switch name {
	case "int8":
		return Type{Name: name, Kind: TypeInt8}, true
	case "int16":
		return Type{Name: name, Kind: TypeInt16}, true
	case "int32":
		return Type{Name: name, Kind: TypeInt32}, true
	case "int64":
		return Type{Name: name, Kind: TypeInt64}, true
	case "intsize":
		return Type{Name: name, Kind: TypeIntSize}, true
	case "uint8":
		return Type{Name: name, Kind: TypeUInt8}, true
	case "uint16":
		return Type{Name: name, Kind: TypeUInt16}, true
	case "uint32":
		return Type{Name: name, Kind: TypeUInt32}, true
	case "uint64":
		return Type{Name: name, Kind: TypeUInt64}, true
	case "uintsize":
		return Type{Name: name, Kind: TypeUIntSize}, true
	case "float32":
		return Type{Name: name, Kind: TypeFloat32}, true
	case "float64":
		return Type{Name: name, Kind: TypeFloat64}, true
	case "bool":
		return Type{Name: name, Kind: TypeBool}, true
	case "void":
		return Type{Name: name, Kind: TypeVoid}, true
	case "string":
		return Type{Name: name, Kind: TypeString}, true
	case "char":
		return Type{Name: name, Kind: TypeChar}, true
	case "":
		return Type{Name: name, Kind: TypeEmpty}, true
	}
	return Type{Name: name, Kind: TypeInvalid}, false
}

func astPositionBefore(a, b ast.Position) bool {
	if a.Line != b.Line {
		return a.Line < b.Line
	}
	return a.Column < b.Column
}
