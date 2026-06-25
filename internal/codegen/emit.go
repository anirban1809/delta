package codegen

import (
	"fmt"
	"sort"
	"strings"

	"delta/internal/ast"
	"delta/internal/diagnostics"
)

// Emitter lowers a type-checked Delta AST to C. It is intentionally simple: the
// analyzer (internal/analyzer) has already validated the program, so codegen
// only walks the tree and prints the corresponding C. There is no separate
// type system here — every type is resolved straight from the AST's type names.
type Emitter struct {
	File       ast.File
	ErrorBag   *diagnostics.ErrorBag
	SourcePath string
	ModuleID   string
	EmitMain   bool

	moduleInfo ModuleInfo

	// records maps each declared type name to its resolved C shape. Aliases
	// resolve to the target's struct; records and compositions get their own.
	records map[string]recordInfo
	// rhsByName is the raw right-hand side of each type declaration, used while
	// resolving records.
	rhsByName map[string]ast.TypeRHS
	// funcParams maps each function name to its parameter type names, so call
	// sites can pin object-literal arguments to the right record.
	funcParams map[string][]string
	// funcReturns maps each function name to its return type name (empty for
	// void), used to type inferred bindings like `let x = f();`.
	funcReturns map[string]string

	// globalTypes holds file-level const types; localTypes holds the current
	// function's parameter and local binding types. Both are Delta type names,
	// keyed by binding name, and feed inferType.
	globalTypes map[string]string
	localTypes  map[string]string

	// === Phase L (receiver methods) BEGIN ===
	// methods maps a receiver Delta type name -> method name -> info.
	methods map[string]map[string]methodInfo
	// pointerLocals marks binding names that are C pointers (currently only a
	// method receiver), so field access lowers to `->` and call sites don't
	// re-take the address.
	pointerLocals map[string]bool
	// === Phase L (receiver methods) END ===

	// funcFallible records which functions return an error (`T | E`) and so
	// lower to a result struct instead of a bare value.
	funcFallible map[string]bool

	// helpers / resultHelpers collect the generated C for each runtime guard
	// actually used, keyed by the helper's C function name (the body is built
	// once, when the helper is first referenced). resultTypes records every
	// delta_result_* struct that must be emitted, keyed by its C name.
	helpers       map[string]string
	resultHelpers map[string]string
	resultTypes   map[string]string
	needsStdlib   bool

	// pendingResults links a checked result name to the temp holding its
	// result struct and the binding it commits to once the check passes.
	pendingResults map[string]pendingResult
	resultCounter  int

	currentReturnType string
	currentFallible   bool
	indent            int

	// === Phase F (ownership and move) BEGIN ===
	// owners tracks, per block, the unique-typed bindings that block must drop
	// when control leaves it. Locals are registered as they are declared and
	// by-value owned parameters at function entry; a moved binding is marked so
	// it is skipped.
	owners map[*ast.BlockStatement][]*owned
	// dropTypes is the set of Delta type names that have a generated
	// delta__<T>_drop helper (a unique type that defines a dispose method).
	dropTypes map[string]bool
	// manualDropTypes is the subset of dropTypes backed by a user-authored
	// dispose method.
	manualDropTypes map[string]bool
	// funcParamBorrow records, per function name, whether each parameter is a
	// borrow (`&T` / `edit &T`) so call sites can auto-take its address.
	funcParamBorrow map[string][]bool
	// counters for the temporaries introduced by return transfer and owned
	// replacement, so each generated name is unique.
	returnCounter      int
	replacementCounter int
	// === Phase F (ownership and move) END ===
}

type ModuleInfo struct {
	Imports map[string]ImportedSymbol
	Types   map[string]ImportedType
}

type ImportedSymbol struct {
	CName       string
	IsFunction  bool
	ParamTypes  []string
	ParamBorrow []bool
	ReturnType  string
	Fallible    bool
	ConstType   string
}

type ImportedType struct {
	CName  string
	Fields []ImportedField
}

type ImportedField struct {
	Name      string
	DeltaType string
}

func (e *Emitter) ConfigureModule(info ModuleInfo) {
	e.moduleInfo = info
}

type owned struct {
	// name
	n string
	// type
	t string
	// moved is set once the binding's value has been transferred away (via
	// `move` or by being returned), so it must not be dropped.
	moved bool
}

// pendingResult is the bookkeeping for one `as result` binding between its
// fallible statement and the `check` block that consumes it.
type pendingResult struct {
	Temp   string // C variable holding the delta_result_* struct
	Commit string // statement that binds the success value, run after the check
}

type recordInfo struct {
	CName  string // C struct name (for an alias: the target's C name)
	Fields []recordField
	Emit   bool // true for records/compositions that need a struct typedef
}

type recordField struct {
	Name      string
	DeltaType string // Delta type name, used to pin nested object literals
	CType     string
}

// === Phase L (receiver methods) BEGIN ===

// methodInfo is the codegen view of a receiver method.
type methodInfo struct {
	CName      string   // mangled C name: delta__<RecvType>_<method>
	ParamTypes []string // Delta param type names, for argument pinning
	ReturnType string   // Delta return type name; "" for void
	Fallible   bool
}

// === Phase L (receiver methods) END ===

// primitiveCType maps Delta primitive type names to their C spellings.
var primitiveCType = map[string]string{
	"bool":     "bool",
	"char":     "char",
	"int8":     "int8_t",
	"int16":    "int16_t",
	"int32":    "int32_t",
	"int64":    "int64_t",
	"intsize":  "intptr_t",
	"uint8":    "uint8_t",
	"uint16":   "uint16_t",
	"uint32":   "uint32_t",
	"uint64":   "uint64_t",
	"uintsize": "uintptr_t",
	"float32":  "float",
	"float64":  "double",
}

// isConversionType reports whether name is a built-in conversion operator, i.e.
// a scalar type that can be written as a call like int32(x) or char(y). Matches
// the conversion set the analyzer accepts.
func isConversionType(name string) bool {
	switch name {
	case "int8", "int16", "int32", "int64", "intsize",
		"uint8", "uint16", "uint32", "uint64", "uintsize",
		"float32", "float64", "char":
		return true
	}
	return false
}

func typeRefName(t ast.TypeIdentifier) string {
	if t.Name.Name == "heap" && t.Inner != nil && t.Inner.Name.Name != "" {
		return "heap<" + typeRefName(*t.Inner) + ">"
	}
	return t.Name.Name
}

func isHeapName(name string) bool {
	return strings.HasPrefix(name, "heap<") && strings.HasSuffix(name, ">")
}

func heapInner(name string) string {
	if !isHeapName(name) {
		return ""
	}
	return strings.TrimSuffix(strings.TrimPrefix(name, "heap<"), ">")
}

// cType returns the C type for a Delta type name, resolving records and aliases
// through the record table and primitives through primitiveCType.
func (e *Emitter) cType(name string) string {
	if isHeapName(name) {
		return e.cType(heapInner(name)) + "*"
	}
	if c, ok := primitiveCType[name]; ok {
		return c
	}
	if e.moduleInfo.Types != nil {
		if t, ok := e.moduleInfo.Types[name]; ok {
			return t.CName
		}
	}
	if rec, ok := e.records[name]; ok {
		return rec.CName
	}
	return "delta__" + name
}

func (e *Emitter) projectMode() bool {
	return e.ModuleID != ""
}

func (e *Emitter) exportedName(name string) string {
	return "delta__" + e.ModuleID + "__" + name
}

func (e *Emitter) functionCName(fn ast.FunctionDeclaration) string {
	if fn.Name == "main" {
		return "delta_main"
	}
	if e.projectMode() && fn.Exported {
		return e.exportedName(fn.Name)
	}
	return fn.Name
}

func (e *Emitter) constCName(decl ast.ConstDeclaration) string {
	if e.projectMode() && decl.Exported {
		return e.exportedName(decl.Name.Name)
	}
	return decl.Name.Name
}

func (e *Emitter) calleeCName(name string) string {
	if imp, ok := e.moduleInfo.Imports[name]; ok {
		return imp.CName
	}
	for _, decl := range e.File.Declarations {
		fn, ok := decl.(ast.FunctionDeclaration)
		if ok && fn.Receiver == nil && fn.Name == name {
			return e.functionCName(fn)
		}
	}
	return name
}

func (e *Emitter) identCName(name string) string {
	if imp, ok := e.moduleInfo.Imports[name]; ok && !imp.IsFunction {
		return imp.CName
	}
	for _, decl := range e.File.Declarations {
		c, ok := decl.(ast.ConstDeclaration)
		if ok && c.Name.Name == name {
			return e.constCName(c)
		}
	}
	return name
}

// pad returns the current indentation.
func (e *Emitter) pad() string {
	return strings.Repeat("\t", e.indent)
}

// buildRecords resolves every type declaration into a recordInfo.
func (e *Emitter) buildRecords() {
	e.records = map[string]recordInfo{}
	e.rhsByName = map[string]ast.TypeRHS{}
	for name, typ := range e.moduleInfo.Types {
		rec := recordInfo{CName: typ.CName, Emit: false}
		for _, f := range typ.Fields {
			rec.Fields = append(rec.Fields, recordField{
				Name:      f.Name,
				DeltaType: f.DeltaType,
				CType:     e.cType(f.DeltaType),
			})
		}
		e.records[name] = rec
	}
	for _, decl := range e.File.Declarations {
		if td, ok := decl.(ast.TypeDeclaration); ok {
			e.rhsByName[td.Name.Name] = td.RHS
		}
	}
	for name := range e.rhsByName {
		e.resolve(name)
	}
}

// resolve computes (and memoizes) the recordInfo for a declared type name.
func (e *Emitter) resolve(name string) recordInfo {
	if rec, ok := e.records[name]; ok {
		return rec
	}
	rhs := e.rhsByName[name]

	switch rhs := rhs.(type) {
	case ast.RecordRHS:
		rec := recordInfo{CName: "delta__" + name, Emit: true}
		if e.projectMode() && e.typeExported(name) {
			rec.CName = e.exportedName(name)
		}
		for _, f := range rhs.Fields {
			deltaType := typeRefName(f.Type)
			rec.Fields = append(rec.Fields, recordField{
				Name:      f.Name.Name,
				DeltaType: deltaType,
				CType:     e.cType(deltaType),
			})
		}
		e.records[name] = rec
		return rec

	case ast.AliasRHS:
		target := rhs.Target.Name.Name
		rec := recordInfo{CName: e.cType(target)}
		if t, ok := e.records[target]; ok {
			rec.Fields = t.Fields
		}
		e.records[name] = rec
		return rec

	case ast.CompositionRHS:
		rec := recordInfo{CName: "delta__" + name, Emit: true}
		if e.projectMode() && e.typeExported(name) {
			rec.CName = e.exportedName(name)
		}
		for _, op := range rhs.Operands {
			if op.Named != nil {
				rec.Fields = append(
					rec.Fields,
					e.resolve(op.Named.Name.Name).Fields...,
				)
			} else if op.Inline != nil {
				for _, f := range op.Inline.Fields {
					deltaType := typeRefName(f.Type)
					rec.Fields = append(rec.Fields, recordField{
						Name:      f.Name.Name,
						DeltaType: deltaType,
						CType:     e.cType(deltaType),
					})
				}
			}
		}
		e.records[name] = rec
		return rec
	}

	return recordInfo{}
}

func (e *Emitter) typeExported(name string) bool {
	for _, decl := range e.File.Declarations {
		td, ok := decl.(ast.TypeDeclaration)
		if ok && td.Name.Name == name {
			return td.Exported
		}
	}
	return false
}

// buildFuncs records each function's parameter and return type names, used for
// call-site pinning of object-literal arguments and for typing inferred
// bindings (`let x = f();`).
func (e *Emitter) buildFuncs() {
	e.funcParams = map[string][]string{}
	e.funcReturns = map[string]string{}
	e.funcFallible = map[string]bool{}
	e.funcParamBorrow = map[string][]bool{}
	for name, imp := range e.moduleInfo.Imports {
		if !imp.IsFunction {
			continue
		}
		e.funcParams[name] = append([]string(nil), imp.ParamTypes...)
		e.funcParamBorrow[name] = append([]bool(nil), imp.ParamBorrow...)
		e.funcReturns[name] = imp.ReturnType
		e.funcFallible[name] = imp.Fallible
	}
	for _, decl := range e.File.Declarations {
		fn, ok := decl.(ast.FunctionDeclaration)
		if !ok {
			continue
		}
		// === Phase L (receiver methods) BEGIN ===
		if fn.Receiver != nil { // methods are tracked in buildMethods, not here
			continue
		}
		// === Phase L (receiver methods) END ===
		types := make([]string, 0, len(fn.Parameters))
		borrows := make([]bool, 0, len(fn.Parameters))
		for _, p := range fn.Parameters {
			types = append(types, typeRefName(p.Type))
			borrows = append(borrows, p.Type.Reference)
		}
		e.funcParams[fn.Name] = types
		e.funcParamBorrow[fn.Name] = borrows
		if len(fn.ReturnTypes) > 0 {
			e.funcReturns[fn.Name] = typeRefName(fn.ReturnTypes[0])
		}
		e.funcFallible[fn.Name] = len(fn.ErrorTypes) > 0
	}
}

// === Phase L (receiver methods) BEGIN ===

// buildMethods records each receiver method's C name, parameter/return types,
// and fallibility, keyed by the receiver's Delta type name then method name.
func (e *Emitter) buildMethods() {
	e.methods = map[string]map[string]methodInfo{}
	for _, decl := range e.File.Declarations {
		fn, ok := decl.(ast.FunctionDeclaration)
		if !ok || fn.Receiver == nil {
			continue
		}
		recvType := fn.Receiver.Type.Name.Name
		params := make([]string, 0, len(fn.Parameters))
		for _, p := range fn.Parameters {
			params = append(params, typeRefName(p.Type))
		}
		ret := ""
		if len(fn.ReturnTypes) > 0 {
			ret = typeRefName(fn.ReturnTypes[0])
		}
		if e.methods[recvType] == nil {
			e.methods[recvType] = map[string]methodInfo{}
		}
		e.methods[recvType][fn.Name] = methodInfo{
			CName:      "delta__" + recvType + "_" + fn.Name,
			ParamTypes: params,
			ReturnType: ret,
			Fallible:   len(fn.ErrorTypes) > 0,
		}
	}
}

// lookupMethod returns the method info for `name` on receiver type `recvType`.
func (e *Emitter) lookupMethod(recvType, name string) (methodInfo, bool) {
	if methods, ok := e.methods[recvType]; ok {
		mi, ok := methods[name]
		return mi, ok
	}
	return methodInfo{}, false
}

// === Phase L (receiver methods) END ===

// inferType returns the Delta type name of an expression. It mirrors the
// analyzer's typing rules closely enough to give inferred bindings (`let x =
// ...`) a concrete C type; it returns "" when it cannot determine the type.
func (e *Emitter) inferType(expr ast.Expression) string {
	switch expr := expr.(type) {
	case ast.IntegerLiteral:
		return "int32"
	case ast.FloatLiteral:
		return "float64"
	case ast.BooleanLiteral:
		return "bool"
	case ast.CharacterLiteral:
		return "char"
	case ast.StringLiteral:
		return "string"
	case ast.Identifier:
		if t, ok := e.localTypes[expr.Name]; ok {
			return t
		}
		return e.globalTypes[expr.Name]
	case ast.MemberAccessExpression:
		recvType := e.inferType(expr.Receiver)
		if isHeapName(recvType) {
			recvType = heapInner(recvType)
		}
		if rec, ok := e.records[recvType]; ok {
			return fieldDeltaType(rec, expr.Member)
		}
	case ast.NewExpression:
		if expr.Type != nil {
			return "heap<" + typeRefName(*expr.Type) + ">"
		}
		return "heap<" + e.inferType(expr.Value) + ">"
	case ast.CloneExpression:
		return e.inferType(expr.Source)
	case ast.MoveExpression:
		return e.inferType(expr.Source)
	case ast.UnaryExpression:
		if expr.Operator == "!" {
			return "bool"
		}
		return e.inferType(expr.Expression)
	case ast.PostfixUnaryExpression:
		return e.inferType(expr.Operand)
	case ast.BinaryExpression:
		switch expr.Operator {
		case "==", "!=", "<", "<=", ">", ">=", "&&", "||":
			return "bool"
		}
		return e.inferType(expr.Left)
	case ast.FunctionCallExpression:
		// === Phase L (receiver methods) BEGIN ===
		if member, ok := expr.Callee.(ast.MemberAccessExpression); ok {
			recvType := e.inferType(member.Receiver)
			if isHeapName(recvType) {
				recvType = heapInner(recvType)
			}
			if mi, ok := e.lookupMethod(
				recvType,
				member.Member,
			); ok {
				return mi.ReturnType
			}
		}
		// === Phase L (receiver methods) END ===
		if callee, ok := expr.Callee.(ast.Identifier); ok {
			if isConversionType(callee.Name) {
				return callee.Name
			}
			return e.funcReturns[callee.Name]
		}
	}
	return ""
}

// fieldDeltaType returns the Delta type name of a record field, or "" if the
// field is not found.
func fieldDeltaType(rec recordInfo, name string) string {
	for _, f := range rec.Fields {
		if f.Name == name {
			return f.DeltaType
		}
	}
	return ""
}

// === Phase F (ownership and move) BEGIN ===

// buildDropTypes records which types own cleanup. A unique type with a dispose
// method gets a generated delta__<T>_drop helper (which calls dispose); every
// value of such a type is dropped when it leaves scope. Must run after
// buildMethods.
func (e *Emitter) buildDropTypes() {
	e.dropTypes = map[string]bool{}
	e.manualDropTypes = map[string]bool{}
	for recvType, methods := range e.methods {
		if _, ok := methods["dispose"]; ok {
			e.dropTypes[recvType] = true
			e.manualDropTypes[recvType] = true
		}
	}
	changed := true
	for changed {
		changed = false
		for name, rec := range e.records {
			if !rec.Emit || e.dropTypes[name] {
				continue
			}
			for _, f := range rec.Fields {
				if e.needsDrop(f.DeltaType) {
					e.dropTypes[name] = true
					changed = true
					break
				}
			}
		}
	}
}

// needsDrop reports whether values of a Delta type require a scope-exit drop.
func (e *Emitter) needsDrop(typeName string) bool {
	if isHeapName(typeName) {
		return true
	}
	return e.dropTypes[typeName]
}

// paramCType lowers a parameter's C type. A borrow (`&T` / `edit &T`) becomes a
// pointer: `const delta__T*` for a read-only `&T`, `delta__T*` for `edit &T`. An
// ordinary by-value parameter keeps its plain C type.
func (e *Emitter) paramCType(t ast.TypeIdentifier) string {
	typeName := typeRefName(t)
	c := e.cType(typeName)
	if !t.Reference {
		return c
	}
	if isHeapName(typeName) {
		if t.Edit {
			return c + "*"
		}
		return c + " const *"
	}
	if t.Edit {
		return c + "*"
	}
	return "const " + c + "*"
}

// isPointerExpr reports whether an argument expression is already a pointer
// local (a borrow being re-passed), so a call site forwards it unchanged rather
// than taking its address again.
func (e *Emitter) isPointerExpr(expr ast.Expression) bool {
	id, ok := expr.(ast.Identifier)
	return ok && e.pointerLocals[id.Name]
}

// dropCall renders the cleanup call for one owned binding.
func (e *Emitter) dropCall(name, typeName string) string {
	if isHeapName(typeName) {
		return e.heapDisposeHelper(heapInner(typeName)) + "(" + name + ");"
	}
	return "delta__" + typeName + "_drop(&" + name + ");"
}

// dropHelperSignature / dropHelperBody render the generated _drop helper for a
// type. The helper simply forwards to the type's dispose method.
func (e *Emitter) dropHelperSignature(typeName string) string {
	return "void delta__" + typeName + "_drop(" + e.cType(typeName) + "* value)"
}

func (e *Emitter) dropHelperBody(typeName string) string {
	var b strings.Builder
	b.WriteString(e.dropHelperSignature(typeName) + " {\n")
	if e.manualDropTypes[typeName] {
		b.WriteString("\tdelta__" + typeName + "_dispose(value);\n")
	}
	if rec, ok := e.records[typeName]; ok {
		for i := len(rec.Fields) - 1; i >= 0; i-- {
			f := rec.Fields[i]
			if !e.needsDrop(f.DeltaType) {
				continue
			}
			if isHeapName(f.DeltaType) {
				b.WriteString("\t" + e.heapDisposeHelper(heapInner(f.DeltaType)) + "(value->" + f.Name + ");\n")
			} else {
				b.WriteString("\tdelta__" + f.DeltaType + "_drop(&value->" + f.Name + ");\n")
			}
		}
	}
	b.WriteString("}")
	return b.String()
}

func (e *Emitter) heapAllocHelper(inner string) string {
	e.needsStdlib = true
	resultName := e.requireResultType("heap<" + inner + ">")
	name := "delta_rt_heap_alloc_" + typeCode(inner)
	body := fmt.Sprintf(
		`static inline %s %s(%s value) {
	%s p = (%s)malloc(sizeof(%s));
	if (!p) return (%s){ .tag = 1 };
	*p = value;
	return (%s){ .tag = 0, .value = p };
}`,
		resultName, name, e.cType(inner), e.cType("heap<"+inner+">"),
		e.cType("heap<"+inner+">"), e.cType(inner), resultName, resultName,
	)
	return e.addResultHelper(name, body)
}

func (e *Emitter) heapNewHelper(inner string) string {
	name := "delta_rt_heap_new_" + typeCode(inner)
	alloc := e.heapAllocHelper(inner)
	body := fmt.Sprintf(
		`static inline %s %s(%s value, const char *file, int line) {
	%s r = %s(value);
	if (r.tag != 0) delta_panic(file, line, "allocation failed");
	return r.value;
}`,
		e.cType("heap<"+inner+">"), name, e.cType(inner),
		e.requireResultType("heap<"+inner+">"), alloc,
	)
	return e.addHelper(name, body)
}

func (e *Emitter) heapDisposeHelper(inner string) string {
	e.needsStdlib = true
	name := "delta_rt_heap_dispose_" + typeCode(inner)
	body := fmt.Sprintf(
		`static inline void %s(%s value) {
	if (!value) return;
	%s
	free(value);
}`,
		name, e.cType("heap<"+inner+">"), e.heapInnerDropLine(inner),
	)
	return e.addResultHelper(name, body)
}

func (e *Emitter) heapInnerDropLine(inner string) string {
	if e.needsDrop(inner) {
		return "delta__" + inner + "_drop(value);"
	}
	return "(void)value;"
}

// markMoved flags the owned binding `name` in `block` as moved, so it is not
// dropped at scope exit. It is a no-op when the name is not an owned binding.
func (e *Emitter) markMoved(name string, block *ast.BlockStatement) {
	for _, o := range e.owners[block] {
		if o.n == name {
			o.moved = true
			return
		}
	}
}

// takeOwners returns the bindings in `block` that are still live (not moved)
// and marks them moved, so the same exit (a return followed by the block's
// closing brace) cannot drop them twice. Returned in declaration order.
func (e *Emitter) takeOwners(block *ast.BlockStatement) []*owned {
	var live []*owned
	for _, o := range e.owners[block] {
		if !o.moved {
			live = append(live, o)
			o.moved = true
		}
	}
	return live
}

// isConstLiteral reports whether an expression is a literal constant, which
// cannot reference (and so cannot be invalidated by) a dropped local.
func isConstLiteral(expr ast.Expression) bool {
	switch expr.(type) {
	case ast.IntegerLiteral, ast.FloatLiteral, ast.BooleanLiteral,
		ast.CharacterLiteral, ast.StringLiteral:
		return true
	}
	return false
}

// === Phase F (ownership and move) END ===

// ExprContext is top-down information about the C slot an expression lowers
// into. The analyzer has already decided what is legal; these fields only steer
// code generation (value vs address, move/drop coordination, fallible
// wrapping). The zero value means "plain rvalue, nothing special".
type ExprContext struct {
	// WantAddress lowers a borrow slot to `&x` instead of passing by value.
	WantAddress bool

	// Consumes is set when the slot takes ownership (a move into a by-value
	// unique parameter, `return move y`, `let z = move y`). When set, the
	// source binding's end-of-scope drop must be suppressed.
	Consumes bool
	// SourceSym is the binding being moved out, used to flip its ownership
	// ledger entry to moved so the drop pass skips it.
	SourceSym string
	// DestOwner is the binding receiving ownership, registered as the new owner.
	DestOwner string
	// Block is the enclosing block whose ownership ledger a consume updates.
	Block *ast.BlockStatement

	// Fallible marks a slot that must be lowered into a delta_result_* wrapper.
	Fallible bool

	// Callee is the target function name (informational at codegen).
	Callee string
}

// emitExpr lowers an expression to C. expected is the Delta type name the
// expression is used as (used to lower object literals against the right
// record); pass "" when it is unknown.
func (e *Emitter) emitExpr(expr ast.Expression, expected string, context ExprContext) string {
	out := e.emitExprRaw(expr, expected, context)
	actual := e.inferType(expr)
	if expected != "" && isHeapName(actual) && heapInner(actual) == expected {
		return "(*(" + out + "))"
	}
	return out
}

func (e *Emitter) emitExprRaw(expr ast.Expression, expected string, context ExprContext) string {
	switch expr := expr.(type) {
	case ast.IntegerLiteral:
		return expr.Value
	case ast.FloatLiteral:
		return expr.Value
	case ast.BooleanLiteral:
		return expr.Value
	case ast.StringLiteral:
		return "\"" + expr.Value + "\""
	case ast.CharacterLiteral:
		return "'" + expr.Value + "'"

	case ast.Identifier:
		return e.identCName(expr.Name)

	case ast.MemberAccessExpression:
		recvType := e.inferType(expr.Receiver)
		recvC := e.emitExpr(expr.Receiver, "", ExprContext{})
		if isHeapName(recvType) {
			if id, ok := expr.Receiver.(ast.Identifier); ok && e.pointerLocals[id.Name] {
				return "(*" + recvC + ")->" + expr.Member
			}
			return recvC + "->" + expr.Member
		}
		if id, ok := expr.Receiver.(ast.Identifier); ok && e.pointerLocals[id.Name] {
			return recvC + "->" + expr.Member
		}
		return recvC + "." + expr.Member

	case ast.UnaryExpression:
		return "(" + expr.Operator + e.emitExpr(expr.Expression, "", ExprContext{}) + ")"

	case ast.PostfixUnaryExpression:
		operand := e.emitExpr(expr.Operand, "", ExprContext{})
		// `x++` / `x--` on an integer is overflow-checked.
		if t := e.inferType(expr.Operand); isIntegral(t) {
			return e.trapIncDec(expr.Operator, operand, t, expr.Line)
		}
		return operand + expr.Operator

	case ast.BinaryExpression:
		left := e.emitExpr(expr.Left, "", ExprContext{})
		right := e.emitExpr(expr.Right, "", ExprContext{})
		// Integer `/` `%` (zero divisor) and `<<` `>>` (count out of range) are
		// checked at runtime; everything else is a plain C operator.
		t := e.inferType(expr.Left)
		switch expr.Operator {
		case "/", "%", "<<", ">>":
			if isIntegral(t) {
				return e.trapBinary(
					expr.Operator,
					left,
					right,
					t,
					expr.Line,
				)
			}
		}
		// Always parenthesize: correct regardless of C precedence.
		return "(" + left + " " + expr.Operator + " " + right + ")"

	case ast.FunctionCallExpression:
		// === Phase L (receiver methods) BEGIN ===
		// `recv.method(args)` lowers to delta__<Type>_<method>(<recvptr>, args).
		if member, ok := expr.Callee.(ast.MemberAccessExpression); ok {
			recvType := e.inferType(member.Receiver)
			methodRecvType := recvType
			if isHeapName(methodRecvType) {
				methodRecvType = heapInner(methodRecvType)
			}
			if mi, ok := e.lookupMethod(methodRecvType, member.Member); ok {
				recvC := e.emitExpr(member.Receiver, "", ExprContext{})
				if isHeapName(recvType) {
					if id, isID := member.Receiver.(ast.Identifier); isID &&
						e.pointerLocals[id.Name] {
						recvC = "*" + recvC
					}
				} else if id, isID := member.Receiver.(ast.Identifier); !isID ||
					!e.pointerLocals[id.Name] {
					recvC = "&" + recvC
				}
				args := []string{recvC}
				for i, arg := range expr.Arguments {
					at := ""
					if i < len(mi.ParamTypes) {
						at = mi.ParamTypes[i]
					}
					args = append(args, e.emitExpr(arg, at, ExprContext{
						Callee: member.Member,
						Block:  context.Block,
					}))
				}
				return mi.CName + "(" + strings.Join(args, ", ") + ")"
			}
		}
		// === Phase L (receiver methods) END ===
		// A T(x) conversion lowers to a plain C cast when it cannot lose the
		// value, or to a range-checked trap helper when it can.
		if callee, ok := expr.Callee.(ast.Identifier); ok &&
			isConversionType(callee.Name) {
			from := e.inferType(expr.Arguments[0])
			to := callee.Name
			argC := e.emitExpr(expr.Arguments[0], "", ExprContext{})
			if convIsFree(from, to) {
				return "(" + e.cType(to) + ")(" + argC + ")"
			}
			return e.trapConversion(argC, from, to, expr.Line)
		}

		name := e.emitExpr(expr.Callee, "", ExprContext{})
		if callee, ok := expr.Callee.(ast.Identifier); ok {
			name = e.calleeCName(callee.Name)
		}
		paramTypes := e.funcParams[name]
		if callee, ok := expr.Callee.(ast.Identifier); ok {
			paramTypes = e.funcParams[callee.Name]
		}
		borrows := e.funcParamBorrow[name]
		if callee, ok := expr.Callee.(ast.Identifier); ok {
			borrows = e.funcParamBorrow[callee.Name]
		}
		args := make([]string, 0, len(expr.Arguments))
		for i, arg := range expr.Arguments {
			argType := ""
			if i < len(paramTypes) {
				argType = paramTypes[i]
			}
			argC := e.emitExpr(arg, argType, ExprContext{
				Callee: name,
				Block:  context.Block,
			})
			// Auto-borrow: a value passed to a `&T` / `edit &T` parameter is
			// passed by address. A borrow being re-passed is already a pointer,
			// so it is forwarded unchanged.
			if i < len(borrows) && borrows[i] && !e.isPointerExpr(arg) {
				argC = "&" + argC
			}
			args = append(args, argC)
		}
		return name + "(" + strings.Join(args, ", ") + ")"

	case ast.ObjectLiteralExpression:
		return e.emitObjectLiteral(expr, expected, context)

	case ast.MoveExpression:
		// `move x` lowers to the bare value `x`; the move itself is a no-op at
		// runtime. Its effect is on ownership: the value leaves the current
		// scope, so that scope must not drop x. Mark it moved in the ledger.
		e.markMoved(expr.Source.Name, context.Block)
		return expr.Source.Name

	case ast.NewExpression:
		inner := ""
		if expr.Type != nil {
			inner = typeRefName(*expr.Type)
		} else {
			inner = e.inferType(expr.Value)
		}
		valueC := e.emitExpr(expr.Value, inner, ExprContext{Block: context.Block})
		if context.Fallible {
			return e.heapAllocHelper(inner) + "(" + valueC + ")"
		}
		return e.heapNewHelper(inner) + "(" + valueC + ", " + e.loc(expr.Line) + ")"

	case ast.CloneExpression:
		return e.emitExpr(expr.Source, expected, context)
	}

	return ""
}

// emitObjectLiteral lowers an object literal to a C compound literal against
// the record named by expected. Fields are emitted in the record's declaration
// order; a spread fills every field not given explicitly.
func (e *Emitter) emitObjectLiteral(
	lit ast.ObjectLiteralExpression,
	expected string,
	context ExprContext,
) string {
	rec, ok := e.records[expected]
	if !ok {
		return ""
	}

	provided := map[string]string{}
	for _, element := range lit.Elements {
		switch element := element.(type) {
		case ast.FieldInit:
			provided[element.Name] = e.emitExpr(
				element.Value, fieldDeltaType(rec, element.Name), context,
			)
		case ast.SpreadElement:
			src := "(" + e.emitExpr(element.Source, "", ExprContext{}) + ")"
			for _, f := range rec.Fields {
				if _, done := provided[f.Name]; !done {
					provided[f.Name] = src + "." + f.Name
				}
			}
		}
	}

	parts := make([]string, 0, len(rec.Fields))
	for _, f := range rec.Fields {
		parts = append(parts, "."+f.Name+" = "+provided[f.Name])
	}
	return "(" + rec.CName + "){ " + strings.Join(parts, ", ") + " }"
}

// ctxBlock returns the enclosing block of a statement context, or nil when the
// statement is emitted outside a tracked block (e.g. a for-loop initializer).
// It is the source of ExprContext.Block, which move expressions use to find the
// scope that currently owns the value.
func (e *Emitter) ctxBlock(context *BlockContext) *ast.BlockStatement {
	if context == nil {
		return nil
	}
	return context.block
}

// emitStmt lowers a statement to a single line (or block) of C, including
// leading indentation.
func (e *Emitter) emitStmt(stmt ast.Statement, context *BlockContext) string {
	switch stmt := stmt.(type) {
	case ast.ReturnStatement:
		// Inside a fallible function every return is wrapped in the result
		// struct: a value/empty return is a success (tag 0), `return error` is
		// a failure (tag 1).
		if e.currentFallible {
			resultName := e.requireResultType(e.currentReturnType)
			if stmt.Error {
				return e.pad() + "return (" + resultName + "){ .tag = 1 };"
			}
			if len(stmt.Values) > 0 {
				return e.pad() + "return (" + resultName + "){ .tag = 0, .value = " +
					e.emitExpr(
						stmt.Values[0],
						e.currentReturnType,
						ExprContext{Block: e.ctxBlock(context)},
					) + " };"
			}
			return e.pad() + "return (" + resultName + "){ .tag = 0 };"
		}
		// A non-fallible return leaves the function scope, so any unique-typed
		// bindings it still owns are dropped here, before returning.
		block := e.ctxBlock(context)
		if len(stmt.Values) > 0 {
			valueC := e.emitExpr(stmt.Values[0], e.currentReturnType, ExprContext{Block: block})
			// Returning a binding by name moves it out to the caller, so the
			// scope must not drop it.
			if id, ok := stmt.Values[0].(ast.Identifier); ok {
				e.markMoved(id.Name, block)
			}
			drops := e.takeOwners(block)
			if len(drops) == 0 {
				return e.pad() + "return " + valueC + ";"
			}
			// There are values to drop. A constant return value is independent
			// of any local, so it can be returned directly after the drops.
			// Otherwise stash it in a temp first, since a drop may invalidate a
			// local the return expression reads.
			var b strings.Builder
			retExpr := valueC
			if !isConstLiteral(stmt.Values[0]) {
				temp := fmt.Sprintf("__delta_return_%d", e.returnCounter)
				e.returnCounter++
				b.WriteString(e.pad() + e.cType(e.currentReturnType) + " " + temp + " = " + valueC + ";\n")
				retExpr = temp
			}
			for _, o := range drops {
				b.WriteString(e.pad() + e.dropCall(o.n, o.t) + "\n")
			}
			b.WriteString(e.pad() + "return " + retExpr + ";")
			return b.String()
		}
		// Void return: drop owned bindings, then return.
		var b strings.Builder
		for _, o := range e.takeOwners(block) {
			b.WriteString(e.pad() + e.dropCall(o.n, o.t) + "\n")
		}
		b.WriteString(e.pad() + "return;")
		return b.String()

	case ast.VariableDeclarationStatement:
		// An inferred binding (`let x = expr;`) carries no type annotation, so
		// derive its type from the initializer.
		declType := typeRefName(stmt.Type)
		if declType == "" {
			declType = e.inferType(stmt.Value)
		}
		e.localTypes[stmt.Name] = declType

		// Phase F: a unique binding that owns cleanup is dropped at scope exit,
		// so register it with the current block.
		if e.needsDrop(declType) {
			e.owners[context.block] = append(
				e.owners[context.block], &owned{n: stmt.Name, t: declType},
			)
		}

		cType := e.cType(declType)
		prefix := cType
		if !stmt.Mutable {
			if isHeapName(declType) {
				prefix = cType + " const"
			} else {
				prefix = "const " + cType
			}
		}
		if stmt.Value == nil {
			return e.pad() + prefix + " " + stmt.Name + ";"
		}
		return e.pad() + prefix + " " + stmt.Name + " = " +
			e.emitExpr(stmt.Value, declType, ExprContext{Block: e.ctxBlock(context)}) + ";"

	case ast.AssignmentStatement:
		block := e.ctxBlock(context)
		_, isMember := stmt.TargetExpression.(ast.MemberAccessExpression)

		// Phase F: assigning into an owned binding first drops the value it
		// currently holds. Materialize the incoming value, drop the old
		// contents, then store — so the previous value is released exactly once
		// and the incoming (already moved) value is not dropped here.
		if !isMember && stmt.Operator == "" && e.needsDrop(e.localTypes[stmt.Target.Name]) {
			targetType := e.localTypes[stmt.Target.Name]
			value := e.emitExpr(stmt.Value, targetType, ExprContext{Block: block})
			temp := fmt.Sprintf("__delta_replacement_%d", e.replacementCounter)
			e.replacementCounter++
			var b strings.Builder
			b.WriteString(e.pad() + e.cType(targetType) + " " + temp + " = " + value + ";\n")
			b.WriteString(e.pad() + e.dropCall(stmt.Target.Name, targetType) + "\n")
			b.WriteString(e.pad() + stmt.Target.Name + " = " + temp + ";")
			return b.String()
		}

		target := stmt.Target.Name
		if isMember {
			target = e.emitExpr(stmt.TargetExpression, "", ExprContext{})
		}
		value := e.emitExpr(stmt.Value, "", ExprContext{Block: block})
		// Compound `x += e` / `-=` / `*=` on an integer is overflow-checked:
		// lower it to `x = delta_rt_<op>_<t>(x, e, ...)`.
		if t := e.inferType(stmt.TargetExpression); stmt.Operator != "" && isIntegral(t) {
			call := e.trapCompound(stmt.Operator, target, value, t, stmt.Position.Line)
			return e.pad() + target + " = " + call + ";"
		}
		op := "="
		if stmt.Operator != "" {
			op = stmt.Operator
		}
		return e.pad() + target + " " + op + " " + value + ";"

	case ast.ExpressionStatement:
		return e.pad() + e.emitExpr(stmt.Value, "", ExprContext{Block: e.ctxBlock(context)}) + ";"

	case ast.IfStatement:
		out := e.pad() + "if (" + e.emitExpr(stmt.Condition, "", ExprContext{}) + ")"
		out += e.emitBlock(&stmt.ThenBlock, nil)
		if len(stmt.ElseBlock.Statements) > 0 {
			out += " else" + e.emitBlock(&stmt.ElseBlock, nil)
		}
		return out

	case ast.WhileStatement:
		return e.pad() + "while (" + e.emitExpr(stmt.Condition, "", ExprContext{}) + ")" +
			e.emitBlock(&stmt.Body, nil)

	case ast.ForStatement:
		init := ";"
		if stmt.Init != nil {
			init = strings.TrimSpace(e.emitStmt(stmt.Init, nil))
		}
		cond := ""
		if stmt.Cond != nil {
			cond = e.emitExpr(stmt.Cond, "", ExprContext{})
		}
		step := ""
		if stmt.Step != nil {
			step = e.emitExpr(stmt.Step, "", ExprContext{})
		}
		return e.pad() + "for (" + init + " " + cond + "; " + step + ")" +
			e.emitBlock(stmt.Body, nil)

	case ast.SwitchStatement:
		return e.emitSwitch(stmt)

	case ast.FallibleStatement:
		return e.emitFallible(stmt, context)

	case ast.CheckStatement:
		return e.emitCheck(stmt)

	case ast.BreakStatement:
		return e.pad() + "break;"

	case ast.ContinueStatement:
		return e.pad() + "continue;"
	}

	return ""
}

func (e *Emitter) emitSwitch(stmt ast.SwitchStatement) string {
	var out strings.Builder
	out.WriteString(
		e.pad() + "switch (" + e.emitExpr(stmt.Scrutinee, "", ExprContext{}) + ") {\n",
	)
	e.indent++
	for _, c := range stmt.Cases {
		labels := make([]string, 0, len(c.Labels))
		for _, l := range c.Labels {
			labels = append(labels, "case "+e.emitExpr(l, "", ExprContext{})+":")
		}
		out.WriteString(e.pad() + strings.Join(labels, " "))
		out.WriteString(e.emitBlock(c.Body, nil) + "\n")
		out.WriteString(e.pad() + "\tbreak;\n")
	}
	if stmt.Default != nil {
		out.WriteString(e.pad() + "default:" + e.emitBlock(stmt.Default.Body, nil) + "\n")
	}
	e.indent--
	out.WriteString(e.pad() + "}")
	return out.String()
}

// BlockContext contains additional metadata for processing a block
type BlockContext struct {
	block *ast.BlockStatement
}

// emitBlock takes the block by pointer so its address is a stable key into the
// owners ledger: the same pointer identifies the block when locals register
// themselves and when their drops are emitted here.
func (e *Emitter) emitBlock(block *ast.BlockStatement, context *BlockContext) string {
	var out strings.Builder
	out.WriteString(" {\n")
	e.indent++

	if context == nil {
		context = &BlockContext{}
	}

	context.block = block
	for _, stmt := range block.Statements {
		if line := e.emitStmt(stmt, context); line != "" {
			out.WriteString(line + "\n")
		}
	}

	// Phase F: drop the bindings this block still owns. A return inside the
	// block has already taken (and dropped) its owners, so only the bindings of
	// a block that falls off its end are dropped here.
	for _, o := range e.takeOwners(block) {
		out.WriteString(e.pad() + e.dropCall(o.n, o.t) + "\n")
	}

	e.indent--
	out.WriteString(e.pad() + "}")
	return out.String()
}

// signature renders a function's C declarator (without body or trailing ";").
// A fallible function (`f(): T | E`) returns the delta_result_* struct for T
// rather than a bare T.
func (e *Emitter) signature(fn ast.FunctionDeclaration) string {
	name := e.functionCName(fn)
	returnType := ""
	if len(fn.ReturnTypes) > 0 {
		returnType = typeRefName(fn.ReturnTypes[0])
	}
	ret := "void"
	if returnType != "" {
		ret = e.cType(returnType)
	}
	if len(fn.ErrorTypes) > 0 {
		ret = e.requireResultType(returnType)
	}
	params := make([]string, 0, len(fn.Parameters))
	for _, p := range fn.Parameters {
		params = append(params, e.paramCType(p.Type)+" "+p.Name.Name)
	}
	prefix := ""
	if e.projectMode() && !fn.Exported && fn.Name != "main" {
		prefix = "static "
	}
	return prefix + ret + " " + name + "(" + strings.Join(params, ", ") + ")"
}

func (e *Emitter) emitFunc(fn ast.FunctionDeclaration) string {
	e.currentReturnType = ""
	if len(fn.ReturnTypes) > 0 {
		e.currentReturnType = typeRefName(fn.ReturnTypes[0])
	}
	e.currentFallible = len(fn.ErrorTypes) > 0
	// Fresh per-function binding-type table seeded with the parameters.
	e.localTypes = map[string]string{}
	e.pointerLocals = map[string]bool{} // Phase L: no pointer receiver in a free function
	for _, p := range fn.Parameters {
		paramType := typeRefName(p.Type)
		e.localTypes[p.Name.Name] = paramType
		switch {
		case p.Type.Reference:
			// A borrow parameter is a pointer, so its field accesses use `->`.
			e.pointerLocals[p.Name.Name] = true
		case e.needsDrop(paramType):
			// A by-value owned parameter is dropped at the callee's scope exit.
			e.owners[fn.Body] = append(
				e.owners[fn.Body], &owned{n: p.Name.Name, t: paramType},
			)
		}
	}

	context := BlockContext{}
	return e.signature(fn) + e.emitBlock(fn.Body, &context)
}

// === Phase L (receiver methods) BEGIN ===

// methodSignature renders a receiver method's C declarator. The receiver is the
// first parameter, lowered to a pointer: `const T*` for `&T`, `T*` for `edit &T`.
func (e *Emitter) methodSignature(fn ast.FunctionDeclaration) string {
	recvType := fn.Receiver.Type.Name.Name
	mi := e.methods[recvType][fn.Name]

	ret := "void"
	if mi.Fallible {
		ret = e.requireResultType(mi.ReturnType)
	} else if mi.ReturnType != "" {
		ret = e.cType(mi.ReturnType)
	}

	recvC := e.cType(recvType) + "*"
	if !fn.Receiver.Type.Edit {
		recvC = "const " + recvC
	}
	params := []string{recvC + " " + fn.Receiver.Name.Name}
	for _, p := range fn.Parameters {
		params = append(params, e.paramCType(p.Type)+" "+p.Name.Name)
	}
	return ret + " " + mi.CName + "(" + strings.Join(params, ", ") + ")"
}

// emitMethod renders a receiver method definition. The receiver binding is a
// pointer, so its field accesses inside the body lower to `->`.
func (e *Emitter) emitMethod(fn ast.FunctionDeclaration) string {
	recvType := fn.Receiver.Type.Name.Name
	mi := e.methods[recvType][fn.Name]

	e.currentReturnType = mi.ReturnType
	e.currentFallible = mi.Fallible
	e.localTypes = map[string]string{}
	e.pointerLocals = map[string]bool{}

	e.localTypes[fn.Receiver.Name.Name] = recvType
	e.pointerLocals[fn.Receiver.Name.Name] = true
	for _, p := range fn.Parameters {
		paramType := typeRefName(p.Type)
		e.localTypes[p.Name.Name] = paramType
		switch {
		case p.Type.Reference:
			e.pointerLocals[p.Name.Name] = true
		case e.needsDrop(paramType):
			e.owners[fn.Body] = append(
				e.owners[fn.Body], &owned{n: p.Name.Name, t: paramType},
			)
		}
	}
	return e.methodSignature(fn) + e.emitBlock(fn.Body, nil)
}

// === Phase L (receiver methods) END ===

func (e *Emitter) emitConst(decl ast.ConstDeclaration) string {
	deltaType := typeRefName(decl.Type)
	cType := e.cType(deltaType)
	prefix := "static const "
	if e.projectMode() && decl.Exported {
		prefix = "const "
	}
	return prefix + cType + " " + e.constCName(decl) + " = " +
		e.emitExpr(decl.Value, deltaType, ExprContext{}) + ";"
}

// emitStructs renders one typedef struct per record/composition, in source
// declaration order. Aliases emit nothing.
func (e *Emitter) emitStructs() string {
	var out strings.Builder
	for _, decl := range e.File.Declarations {
		td, ok := decl.(ast.TypeDeclaration)
		if !ok {
			continue
		}
		rec := e.records[td.Name.Name]
		if !rec.Emit {
			continue
		}
		out.WriteString("typedef struct " + rec.CName + " {\n")
		for _, f := range rec.Fields {
			out.WriteString("\t" + f.CType + " " + f.Name + ";\n")
		}
		out.WriteString("} " + rec.CName + ";\n\n")
	}
	return out.String()
}

func (e *Emitter) emitImportedStructs() string {
	if len(e.moduleInfo.Types) == 0 {
		return ""
	}
	names := make([]string, 0, len(e.moduleInfo.Types))
	for name := range e.moduleInfo.Types {
		names = append(names, name)
	}
	sort.Strings(names)
	var out strings.Builder
	for _, name := range names {
		rec := e.records[name]
		if len(rec.Fields) == 0 {
			continue
		}
		out.WriteString("typedef struct " + rec.CName + " {\n")
		for _, f := range rec.Fields {
			out.WriteString("\t" + f.CType + " " + f.Name + ";\n")
		}
		out.WriteString("} " + rec.CName + ";\n\n")
	}
	return out.String()
}

func (e *Emitter) emitImportedForwards() string {
	if len(e.moduleInfo.Imports) == 0 {
		return ""
	}
	names := make([]string, 0, len(e.moduleInfo.Imports))
	for name := range e.moduleInfo.Imports {
		names = append(names, name)
	}
	sort.Strings(names)
	var out strings.Builder
	for _, name := range names {
		imp := e.moduleInfo.Imports[name]
		if imp.IsFunction {
			ret := "void"
			if imp.ReturnType != "" {
				ret = e.cType(imp.ReturnType)
			}
			if imp.Fallible {
				ret = e.requireResultType(imp.ReturnType)
			}
			params := make([]string, 0, len(imp.ParamTypes))
			for i, paramType := range imp.ParamTypes {
				c := e.cType(paramType)
				if i < len(imp.ParamBorrow) && imp.ParamBorrow[i] {
					c = "const " + c + "*"
				}
				params = append(params, c)
			}
			out.WriteString(ret + " " + imp.CName + "(" + strings.Join(params, ", ") + ");\n")
			continue
		}
		out.WriteString("extern const " + e.cType(imp.ConstType) + " " + imp.CName + ";\n")
	}
	if out.Len() > 0 {
		out.WriteString("\n")
	}
	return out.String()
}

func (e *Emitter) Emit() []byte {
	e.buildRecords()
	e.buildFuncs()
	e.buildMethods()   // Phase L: receiver methods
	e.buildDropTypes() // Phase F: which types own a _drop helper

	// Phase F: owners tracks the unique-typed bindings each block must drop at
	// scope exit.
	e.owners = map[*ast.BlockStatement][]*owned{}

	// Record file-level const types up front so functions emitted before a
	// const declaration can still type references to it.
	e.globalTypes = map[string]string{}
	for name, imp := range e.moduleInfo.Imports {
		if !imp.IsFunction {
			e.globalTypes[name] = imp.ConstType
		}
	}
	for _, decl := range e.File.Declarations {
		if c, ok := decl.(ast.ConstDeclaration); ok {
			e.globalTypes[c.Name.Name] = typeRefName(c.Type)
		}
	}

	mainVoid := true
	hasMain := false
	var fwd, consts, funcs strings.Builder
	emittedDrop := map[string]bool{}
	for _, decl := range e.File.Declarations {
		switch decl := decl.(type) {
		case ast.FunctionDeclaration:
			// === Phase L (receiver methods) BEGIN ===
			if decl.Receiver != nil {
				fwd.WriteString(e.methodSignature(decl) + ";\n")
				funcs.WriteString(e.emitMethod(decl) + "\n\n")
				// Phase F: a type's dispose method is paired with a generated
				// _drop helper that forwards to it. Emit the helper right after
				// dispose so its declaration precedes any function that drops a
				// value of this type.
				recvType := decl.Receiver.Type.Name.Name
				if decl.Name == "dispose" && e.dropTypes[recvType] {
					fwd.WriteString(e.dropHelperSignature(recvType) + ";\n")
					funcs.WriteString(e.dropHelperBody(recvType) + "\n\n")
					emittedDrop[recvType] = true
				}
				continue
			}
			// === Phase L (receiver methods) END ===
			fwd.WriteString(e.signature(decl) + ";\n")
			funcs.WriteString(e.emitFunc(decl) + "\n\n")
			if decl.Name == "main" {
				hasMain = true
				mainVoid = len(decl.ReturnTypes) == 0
			}
		case ast.ConstDeclaration:
			consts.WriteString(e.emitConst(decl) + "\n")
		}
	}
	dropNames := make([]string, 0, len(e.dropTypes))
	for name := range e.dropTypes {
		if !emittedDrop[name] {
			dropNames = append(dropNames, name)
		}
	}
	sort.Strings(dropNames)
	for _, name := range dropNames {
		fwd.WriteString(e.dropHelperSignature(name) + ";\n")
		funcs.WriteString(e.dropHelperBody(name) + "\n\n")
	}

	// Only emit the C entry point when the program actually defines a Delta
	// main; otherwise the wrapper would reference an undefined delta_main.
	mainWrapper := ""
	if hasMain {
		mainWrapper = "int main() {\n\treturn (int)delta_main();\n}\n"
		if mainVoid {
			mainWrapper = "int main() {\n\tdelta_main();\n\treturn 0;\n}\n"
		}
	}
	importedForwards := e.emitImportedForwards()

	// Assemble the file. The order matters: the runtime preamble and struct /
	// result-struct typedefs must come before the functions that use them.
	var out strings.Builder
	out.WriteString("#include <stdint.h>\n#include <stdbool.h>\n")
	// The trap helpers call delta_panic, which needs stdio/stdlib.
	if len(e.helpers) > 0 {
		out.WriteString("#include <stdio.h>\n#include <stdlib.h>\n")
	} else if e.needsStdlib {
		out.WriteString("#include <stdlib.h>\n")
	}
	out.WriteString("\n")

	out.WriteString(e.emitImportedStructs())
	out.WriteString(e.emitStructs())
	out.WriteString(e.emitResultTypes())
	out.WriteString(joinSorted(e.resultHelpers))

	if len(e.helpers) > 0 {
		out.WriteString(deltaPanic + "\n\n")
		out.WriteString(joinSorted(e.helpers))
	}

	out.WriteString(importedForwards)
	out.WriteString(fwd.String() + "\n")
	out.WriteString(consts.String())
	out.WriteString(funcs.String())
	out.WriteString(mainWrapper)
	return []byte(out.String())
}

// joinSorted renders the bodies in a name->body map in name order, each
// followed by a blank line, so output is stable run to run.
func joinSorted(bodies map[string]string) string {
	names := make([]string, 0, len(bodies))
	for name := range bodies {
		names = append(names, name)
	}
	sort.Strings(names)

	var out strings.Builder
	for _, name := range names {
		out.WriteString(bodies[name] + "\n\n")
	}
	return out.String()
}
