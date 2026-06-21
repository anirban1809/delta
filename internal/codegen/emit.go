package codegen

import (
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

	// pendingResults links a checked result name to the temp holding its
	// result struct and the binding it commits to once the check passes.
	pendingResults map[string]pendingResult
	resultCounter  int

	currentReturnType string
	currentFallible   bool
	indent            int
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

// cType returns the C type for a Delta type name, resolving records and aliases
// through the record table and primitives through primitiveCType.
func (e *Emitter) cType(name string) string {
	if c, ok := primitiveCType[name]; ok {
		return c
	}
	if rec, ok := e.records[name]; ok {
		return rec.CName
	}
	return "delta__" + name
}

// pad returns the current indentation.
func (e *Emitter) pad() string {
	return strings.Repeat("\t", e.indent)
}

// buildRecords resolves every type declaration into a recordInfo.
func (e *Emitter) buildRecords() {
	e.records = map[string]recordInfo{}
	e.rhsByName = map[string]ast.TypeRHS{}
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
		for _, f := range rhs.Fields {
			rec.Fields = append(rec.Fields, recordField{
				Name:      f.Name.Name,
				DeltaType: f.Type.Name.Name,
				CType:     e.cType(f.Type.Name.Name),
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
		for _, op := range rhs.Operands {
			if op.Named != nil {
				rec.Fields = append(
					rec.Fields,
					e.resolve(op.Named.Name.Name).Fields...,
				)
			} else if op.Inline != nil {
				for _, f := range op.Inline.Fields {
					rec.Fields = append(rec.Fields, recordField{
						Name:      f.Name.Name,
						DeltaType: f.Type.Name.Name,
						CType:     e.cType(f.Type.Name.Name),
					})
				}
			}
		}
		e.records[name] = rec
		return rec
	}

	return recordInfo{}
}

// buildFuncs records each function's parameter and return type names, used for
// call-site pinning of object-literal arguments and for typing inferred
// bindings (`let x = f();`).
func (e *Emitter) buildFuncs() {
	e.funcParams = map[string][]string{}
	e.funcReturns = map[string]string{}
	e.funcFallible = map[string]bool{}
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
		for _, p := range fn.Parameters {
			types = append(types, p.Type.Name.Name)
		}
		e.funcParams[fn.Name] = types
		if len(fn.ReturnTypes) > 0 {
			e.funcReturns[fn.Name] = fn.ReturnTypes[0].Name.Name
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
			params = append(params, p.Type.Name.Name)
		}
		ret := ""
		if len(fn.ReturnTypes) > 0 {
			ret = fn.ReturnTypes[0].Name.Name
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
		if rec, ok := e.records[e.inferType(expr.Receiver)]; ok {
			return fieldDeltaType(rec, expr.Member)
		}
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
			if mi, ok := e.lookupMethod(e.inferType(member.Receiver), member.Member); ok {
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

// emitExpr lowers an expression to C. expected is the Delta type name the
// expression is used as (used to lower object literals against the right
// record); pass "" when it is unknown.
func (e *Emitter) emitExpr(expr ast.Expression, expected string) string {
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
		return expr.Name

	case ast.MemberAccessExpression:
		// === Phase L (receiver methods) BEGIN ===
		// Field access through a pointer receiver lowers to `->`.
		sep := "."
		if id, ok := expr.Receiver.(ast.Identifier); ok && e.pointerLocals[id.Name] {
			sep = "->"
		}
		return e.emitExpr(expr.Receiver, "") + sep + expr.Member
		// === Phase L (receiver methods) END ===

	case ast.UnaryExpression:
		return "(" + expr.Operator + e.emitExpr(expr.Expression, "") + ")"

	case ast.PostfixUnaryExpression:
		operand := e.emitExpr(expr.Operand, "")
		// `x++` / `x--` on an integer is overflow-checked.
		if t := e.inferType(expr.Operand); isIntegral(t) {
			return e.trapIncDec(expr.Operator, operand, t, expr.Position.Line)
		}
		return operand + expr.Operator

	case ast.BinaryExpression:
		left := e.emitExpr(expr.Left, "")
		right := e.emitExpr(expr.Right, "")
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
					expr.Position.Line,
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
			if mi, ok := e.lookupMethod(recvType, member.Member); ok {
				recvC := e.emitExpr(member.Receiver, "")
				// A value receiver needs its address taken; a pointer local
				// (another receiver) is already a pointer and is passed as-is.
				if id, isID := member.Receiver.(ast.Identifier); !isID || !e.pointerLocals[id.Name] {
					recvC = "&" + recvC
				}
				args := []string{recvC}
				for i, arg := range expr.Arguments {
					at := ""
					if i < len(mi.ParamTypes) {
						at = mi.ParamTypes[i]
					}
					args = append(args, e.emitExpr(arg, at))
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
			argC := e.emitExpr(expr.Arguments[0], "")
			if convIsFree(from, to) {
				return "(" + e.cType(to) + ")(" + argC + ")"
			}
			return e.trapConversion(argC, from, to, expr.Position.Line)
		}

		name := e.emitExpr(expr.Callee, "")
		paramTypes := e.funcParams[name]
		args := make([]string, 0, len(expr.Arguments))
		for i, arg := range expr.Arguments {
			argType := ""
			if i < len(paramTypes) {
				argType = paramTypes[i]
			}
			args = append(args, e.emitExpr(arg, argType))
		}
		return name + "(" + strings.Join(args, ", ") + ")"

	case ast.ObjectLiteralExpression:
		return e.emitObjectLiteral(expr, expected)
	}

	return ""
}

// emitObjectLiteral lowers an object literal to a C compound literal against
// the record named by expected. Fields are emitted in the record's declaration
// order; a spread fills every field not given explicitly.
func (e *Emitter) emitObjectLiteral(
	lit ast.ObjectLiteralExpression,
	expected string,
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
				element.Value, fieldDeltaType(rec, element.Name),
			)
		case ast.SpreadElement:
			src := "(" + e.emitExpr(element.Source, "") + ")"
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

// emitStmt lowers a statement to a single line (or block) of C, including
// leading indentation.
func (e *Emitter) emitStmt(stmt ast.Statement) string {
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
					) + " };"
			}
			return e.pad() + "return (" + resultName + "){ .tag = 0 };"
		}
		if len(stmt.Values) > 0 {
			return e.pad() + "return " +
				e.emitExpr(stmt.Values[0], e.currentReturnType) + ";"
		}
		return e.pad() + "return;"

	case ast.VariableDeclarationStatement:
		// An inferred binding (`let x = expr;`) carries no type annotation, so
		// derive its type from the initializer.
		declType := stmt.Type.Name.Name
		if declType == "" {
			declType = e.inferType(stmt.Value)
		}
		e.localTypes[stmt.Name] = declType

		cType := e.cType(declType)
		prefix := cType
		if !stmt.Mutable {
			prefix = "const " + cType
		}
		if stmt.Value == nil {
			return e.pad() + prefix + " " + stmt.Name + ";"
		}
		return e.pad() + prefix + " " + stmt.Name + " = " +
			e.emitExpr(stmt.Value, declType) + ";"

	case ast.AssignmentStatement:
		target := stmt.Target.Name
		if _, isMember := stmt.TargetExpression.(ast.MemberAccessExpression); isMember {
			target = e.emitExpr(stmt.TargetExpression, "")
		}
		value := e.emitExpr(stmt.Value, "")
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
		return e.pad() + e.emitExpr(stmt.Value, "") + ";"

	case ast.IfStatement:
		out := e.pad() + "if (" + e.emitExpr(stmt.Condition, "") + ")"
		out += e.emitBlock(stmt.ThenBlock)
		if len(stmt.ElseBlock.Statements) > 0 {
			out += " else" + e.emitBlock(stmt.ElseBlock)
		}
		return out

	case ast.WhileStatement:
		return e.pad() + "while (" + e.emitExpr(stmt.Condition, "") + ")" +
			e.emitBlock(stmt.Body)

	case ast.ForStatement:
		init := ";"
		if stmt.Init != nil {
			init = strings.TrimSpace(e.emitStmt(stmt.Init))
		}
		cond := ""
		if stmt.Cond != nil {
			cond = e.emitExpr(stmt.Cond, "")
		}
		step := ""
		if stmt.Step != nil {
			step = e.emitExpr(stmt.Step, "")
		}
		return e.pad() + "for (" + init + " " + cond + "; " + step + ")" +
			e.emitBlock(*stmt.Body)

	case ast.SwitchStatement:
		return e.emitSwitch(stmt)

	case ast.FallibleStatement:
		return e.emitFallible(stmt)

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
	out.WriteString(e.pad() + "switch (" + e.emitExpr(stmt.Scrutinee, "") + ") {\n")
	e.indent++
	for _, c := range stmt.Cases {
		labels := make([]string, 0, len(c.Labels))
		for _, l := range c.Labels {
			labels = append(labels, "case "+e.emitExpr(l, "")+":")
		}
		out.WriteString(e.pad() + strings.Join(labels, " "))
		out.WriteString(e.emitBlock(*c.Body) + "\n")
		out.WriteString(e.pad() + "\tbreak;\n")
	}
	if stmt.Default != nil {
		out.WriteString(e.pad() + "default:" + e.emitBlock(*stmt.Default.Body) + "\n")
	}
	e.indent--
	out.WriteString(e.pad() + "}")
	return out.String()
}

func (e *Emitter) emitBlock(block ast.BlockStatement) string {
	var out strings.Builder
	out.WriteString(" {\n")
	e.indent++
	for _, stmt := range block.Statements {
		if line := e.emitStmt(stmt); line != "" {
			out.WriteString(line + "\n")
		}
	}
	e.indent--
	out.WriteString(e.pad() + "}")
	return out.String()
}

// signature renders a function's C declarator (without body or trailing ";").
// A fallible function (`f(): T | E`) returns the delta_result_* struct for T
// rather than a bare T.
func (e *Emitter) signature(fn ast.FunctionDeclaration) string {
	name := fn.Name
	if name == "main" {
		name = "delta_main"
	}
	returnType := ""
	if len(fn.ReturnTypes) > 0 {
		returnType = fn.ReturnTypes[0].Name.Name
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
		params = append(params, e.cType(p.Type.Name.Name)+" "+p.Name.Name)
	}
	return ret + " " + name + "(" + strings.Join(params, ", ") + ")"
}

func (e *Emitter) emitFunc(fn ast.FunctionDeclaration) string {
	e.currentReturnType = ""
	if len(fn.ReturnTypes) > 0 {
		e.currentReturnType = fn.ReturnTypes[0].Name.Name
	}
	e.currentFallible = len(fn.ErrorTypes) > 0
	// Fresh per-function binding-type table seeded with the parameters.
	e.localTypes = map[string]string{}
	e.pointerLocals = map[string]bool{} // Phase L: no pointer receiver in a free function
	for _, p := range fn.Parameters {
		e.localTypes[p.Name.Name] = p.Type.Name.Name
	}
	return e.signature(fn) + e.emitBlock(*fn.Body)
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
		params = append(params, e.cType(p.Type.Name.Name)+" "+p.Name.Name)
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
		e.localTypes[p.Name.Name] = p.Type.Name.Name
	}
	return e.methodSignature(fn) + e.emitBlock(*fn.Body)
}

// === Phase L (receiver methods) END ===

func (e *Emitter) emitConst(decl ast.ConstDeclaration) string {
	cType := e.cType(decl.Type.Name.Name)
	return "static const " + cType + " " + decl.Name.Name + " = " +
		e.emitExpr(decl.Value, decl.Type.Name.Name) + ";"
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

func (e *Emitter) Emit() []byte {
	e.buildRecords()
	e.buildFuncs()
	e.buildMethods() // Phase L: receiver methods

	// Record file-level const types up front so functions emitted before a
	// const declaration can still type references to it.
	e.globalTypes = map[string]string{}
	for _, decl := range e.File.Declarations {
		if c, ok := decl.(ast.ConstDeclaration); ok {
			e.globalTypes[c.Name.Name] = c.Type.Name.Name
		}
	}

	mainVoid := true
	hasMain := false
	var fwd, consts, funcs strings.Builder
	for _, decl := range e.File.Declarations {
		switch decl := decl.(type) {
		case ast.FunctionDeclaration:
			// === Phase L (receiver methods) BEGIN ===
			if decl.Receiver != nil {
				fwd.WriteString(e.methodSignature(decl) + ";\n")
				funcs.WriteString(e.emitMethod(decl) + "\n\n")
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

	// Only emit the C entry point when the program actually defines a Delta
	// main; otherwise the wrapper would reference an undefined delta_main.
	mainWrapper := ""
	if hasMain {
		mainWrapper = "int main() {\n\treturn (int)delta_main();\n}\n"
		if mainVoid {
			mainWrapper = "int main() {\n\tdelta_main();\n\treturn 0;\n}\n"
		}
	}

	// Assemble the file. The order matters: the runtime preamble and struct /
	// result-struct typedefs must come before the functions that use them.
	var out strings.Builder
	out.WriteString("#include <stdint.h>\n#include <stdbool.h>\n")
	// The trap helpers call delta_panic, which needs stdio/stdlib.
	if len(e.helpers) > 0 {
		out.WriteString("#include <stdio.h>\n#include <stdlib.h>\n")
	}
	out.WriteString("\n")

	out.WriteString(e.emitStructs())
	out.WriteString(e.emitResultTypes())

	if len(e.helpers) > 0 {
		out.WriteString(deltaPanic + "\n\n")
		out.WriteString(joinSorted(e.helpers))
	}
	out.WriteString(joinSorted(e.resultHelpers))

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
