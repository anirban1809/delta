package analyzer

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
)

type (
	Validator struct {
		GlobalScope Scope
		Errors      *diagnostics.ErrorBag
		Conversions []Conversion
		// === Phase L (receiver methods) BEGIN ===
		// Methods holds receiver methods keyed by receiver record type name,
		// then method name. Methods are not free-function symbols in the global
		// scope; they are resolved through this table at call sites.
		Methods map[string]map[string]*FunctionSignature
		// === Phase L (receiver methods) END ===
	}
	Conversion struct {
		from  string
		to    string
		value string
	}

	Result struct {
		Conversions []Conversion
		Errors      *diagnostics.ErrorBag
	}
)

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
	Type Type
	Name string
}

type Type struct {
	Name   string
	Kind   TypeKind
	Alias  string  // used to track the name of the type of which this is an alias
	Fields []Field // for user defined record types, for other types it stays nil (always check)
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
	Active SymbolStatus = iota
	Pending
)

type Symbol struct {
	Name        string
	Kind        SymbolKind
	Type        Type
	Initialized bool
	Position    ast.Position

	// status of the symbol which is a result from a fallible operation. it will remain pending until checked
	Status SymbolStatus

	// for if the "result" in "as result" has been checked
	Checked   bool
	Display   string
	Signature *FunctionSignature

	// contains the name of the symbol associtate with the result
	// for example:
	// const x = y() as value;
	// here for the result "value", the FallibleSymbol is x
	FallibleSymbol string
}

type Scope struct {
	Parent  *Scope
	Symbols map[string]*Symbol
}

func (s *Scope) NewScope(parent *Scope) Scope {
	return Scope{
		Parent:  parent,
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
