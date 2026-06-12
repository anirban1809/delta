package codegen

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
	"delta/internal/semantics"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
)

type Emitter struct {
	File         ast.File
	ErrorBag     *diagnostics.ErrorBag
	PositionRefs map[ast.Position]semantics.Symbol

	// Conversions maps each `T(x)` conversion call (by position) to its
	// resolved direction, recorded by the analyzer. SourcePath is the
	// original .delta path, used so runtime panics print "file.delta:line".
	Conversions map[ast.Position]semantics.ConversionInfo

	// Divisions maps each integer `/` and `%` expression (by position) to its
	// operand type, recorded by the analyzer, so codegen can emit a
	// divisor-checked helper that traps on division/modulo by zero.
	Divisions map[ast.Position]semantics.Type

	// Shifts maps each `<<` / `>>` expression (by position) to its left-operand
	// type, so codegen can emit a helper that traps when the shift count is out
	// of range.
	Shifts map[ast.Position]semantics.Type

	// IncDecs maps each postfix `++` / `--` (by position) to its operand type,
	// so codegen can emit an overflow-checked post-increment/decrement helper.
	IncDecs    map[ast.Position]semantics.Type
	SourcePath string

	// usedHelpers collects the trap helpers referenced during emission,
	// keyed by helper name, so Emit only renders the ones actually needed.
	usedHelpers       map[string]semantics.ConversionInfo
	usedDivHelpers    map[string]divHelper
	usedShiftHelpers  map[string]divHelper
	usedArithHelpers  map[string]divHelper
	usedIncDecHelpers map[string]divHelper

	// records maps every declared type name — record, composition, or alias —
	// to its canonical record info. Aliases share the target's *recordInfo, so
	// nominal identity falls out of pointer identity. Built from the AST's
	// TypeDeclarations in Emit(); the analyzer has already validated field
	// sets, collisions, and cycles.
	records map[string]*recordInfo

	// recordOrder lists canonical records in a dependency-respecting order
	// (inline record fields before the records that embed them) so struct
	// definitions can be emitted top-down.
	recordOrder []*recordInfo

	// usedEqHelpers collects the records compared with == / != during
	// emission, keyed by helper name, so only those helpers are rendered.
	usedEqHelpers map[string]*recordInfo

	// funcSigs maps each declared function to its resolved parameter and
	// return types, so call sites can pin object-literal arguments and
	// typeOfExpr can type call results.
	funcSigs map[string]fnSig

	// globalTypes holds file-level const types; localTypes holds the current
	// function's parameter and local binding types. Both feed typeOfExpr,
	// codegen's record-aware expression typing.
	globalTypes map[string]semantics.Type
	localTypes  map[string]semantics.Type

	// currentReturn is the enclosing function's return type while a body is
	// being emitted; it pins object literals in return statements.
	currentReturn semantics.Type

	indent   int
	indentOn bool
}

// recordInfo is codegen's resolved view of one nominal record type: its
// canonical Delta name, the C struct name, and the field list in declaration
// order (composition operands expanded left to right).
type recordInfo struct {
	Name   string
	CName  string
	Fields []recordFieldInfo
}

type recordFieldInfo struct {
	Name string
	Type semantics.Type
}

// fnSig is the resolved signature of a declared function, kept by codegen for
// expression typing and object-literal pinning at call sites.
type fnSig struct {
	Params []semantics.Type
	Return semantics.Type
}

// divHelper records an operator + operand type for a runtime arithmetic guard
// (division, shift, or compound-assignment overflow), keyed in its used*Helpers
// map by the generated C function name.
type divHelper struct {
	Op   string
	Type semantics.Type
}

func cType(t semantics.Type) (string, error) {
	switch t.Kind {
	case semantics.TypeVoid:
		return "void", nil
	case semantics.TypeBool:
		return "bool", nil
	case semantics.TypeInt8:
		return "int8_t", nil
	case semantics.TypeInt16:
		return "int16_t", nil
	case semantics.TypeInt32:
		return "int32_t", nil
	case semantics.TypeInt64:
		return "int64_t", nil
	case semantics.TypeIntSize:
		return "intptr_t", nil
	case semantics.TypeUInt8:
		return "uint8_t", nil
	case semantics.TypeUInt16:
		return "uint16_t", nil
	case semantics.TypeUInt32:
		return "uint32_t", nil
	case semantics.TypeUInt64:
		return "uint64_t", nil
	case semantics.TypeUIntSize:
		return "uintptr_t", nil
	case semantics.TypeFloat32:
		return "float", nil
	case semantics.TypeFloat64:
		return "double", nil
	case semantics.TypeChar:
		return "char", nil
	}

	return "", errors.New("unsupported type for v0")
}

// resolveType resolves a source-level type name to a semantics.Type,
// extending the primitive table with the user-declared records (aliases
// resolve to their canonical record name).
func (e *Emitter) resolveType(name string) (semantics.Type, error) {
	if t, ok := semantics.ResolveTypeName(name); ok {
		return t, nil
	}
	if rec, ok := e.records[name]; ok {
		return semantics.Type{Name: rec.Name, Kind: semantics.TypeCustom}, nil
	}
	return semantics.Type{Kind: semantics.TypeInvalid},
		fmt.Errorf("unknown type %q", name)
}

// cTypeOf renders the C type for a semantics.Type, including record types,
// which cType (primitives only) does not know about.
func (e *Emitter) cTypeOf(t semantics.Type) (string, error) {
	if t.Kind == semantics.TypeCustom {
		if rec, ok := e.records[t.Name]; ok {
			return rec.CName, nil
		}
		return "", fmt.Errorf("unknown record type %q", t.Name)
	}
	return cType(t)
}

// recordOf returns the canonical record behind a type, or nil when the type
// is not a record.
func (e *Emitter) recordOf(t semantics.Type) *recordInfo {
	if t.Kind != semantics.TypeCustom {
		return nil
	}
	return e.records[t.Name]
}

// buildRecordTable resolves every TypeDeclaration in the file into a
// recordInfo and fills e.records / e.recordOrder. The semantic pass has
// already rejected unknown operands, field collisions, and cycles, so
// resolution here cannot loop and merge order is purely mechanical.
func (e *Emitter) buildRecordTable() {
	e.records = map[string]*recordInfo{}

	rhsByName := map[string]ast.TypeRHS{}
	declOrder := []string{}
	for _, decl := range e.File.Declarations {
		if td, ok := decl.(ast.TypeDeclaration); ok {
			rhsByName[td.Name.Name] = td.RHS
			declOrder = append(declOrder, td.Name.Name)
		}
	}

	var resolve func(name string) *recordInfo
	resolveFields := func(fields []ast.RecordField) []recordFieldInfo {
		out := make([]recordFieldInfo, 0, len(fields))
		for _, f := range fields {
			ft, ok := semantics.ResolveTypeName(f.Type.Name.Name)
			if !ok {
				if dep := resolve(f.Type.Name.Name); dep != nil {
					ft = semantics.Type{
						Name: dep.Name,
						Kind: semantics.TypeCustom,
					}
				}
			}
			out = append(out, recordFieldInfo{Name: f.Name.Name, Type: ft})
		}
		return out
	}

	resolve = func(name string) *recordInfo {
		if rec, ok := e.records[name]; ok {
			return rec
		}
		rhs, ok := rhsByName[name]
		if !ok {
			return nil
		}
		switch rhs := rhs.(type) {
		case ast.RecordRHS:
			rec := &recordInfo{Name: name, CName: "delta__" + name}
			e.records[name] = rec
			rec.Fields = resolveFields(rhs.Fields)
			return rec
		case ast.AliasRHS:
			rec := resolve(rhs.Target.Name.Name)
			if rec != nil {
				e.records[name] = rec
			}
			return rec
		case ast.CompositionRHS:
			rec := &recordInfo{Name: name, CName: "delta__" + name}
			e.records[name] = rec
			for _, op := range rhs.Operands {
				if op.Inline != nil {
					rec.Fields = append(
						rec.Fields, resolveFields(op.Inline.Fields)...)
				} else if op.Named != nil {
					if dep := resolve(op.Named.Name.Name); dep != nil {
						rec.Fields = append(rec.Fields, dep.Fields...)
					}
				}
			}
			return rec
		}
		return nil
	}

	// Emit canonical structs in dependency order: a record whose field embeds
	// another record by value needs that struct defined first. The semantic
	// cycle check guarantees this DFS terminates.
	emitted := map[*recordInfo]bool{}
	var visit func(rec *recordInfo)
	visit = func(rec *recordInfo) {
		if rec == nil || emitted[rec] {
			return
		}
		emitted[rec] = true
		for _, f := range rec.Fields {
			if f.Type.Kind == semantics.TypeCustom {
				dep := e.records[f.Type.Name]
				if dep != rec {
					visit(dep)
				}
			}
		}
		e.recordOrder = append(e.recordOrder, rec)
	}
	for _, name := range declOrder {
		visit(resolve(name))
	}
}

// emitStructDefs renders one typedef struct per canonical record, in
// dependency order. Aliases emit nothing.
func (e *Emitter) emitStructDefs() string {
	var out strings.Builder
	for _, rec := range e.recordOrder {
		fmt.Fprintf(&out, "typedef struct %s {\n", rec.CName)
		for _, f := range rec.Fields {
			ct, _ := e.cTypeOf(f.Type)
			fmt.Fprintf(&out, "\t%s %s;\n", ct, f.Name)
		}
		fmt.Fprintf(&out, "} %s;\n\n", rec.CName)
	}
	return out.String()
}

func eqHelperName(rec *recordInfo) string {
	return rec.CName + "_eq"
}

// requireEqHelper registers a structural-equality helper for a record (and,
// recursively, for any record-typed fields it compares) and returns the
// helper's name.
func (e *Emitter) requireEqHelper(rec *recordInfo) string {
	name := eqHelperName(rec)
	if e.usedEqHelpers == nil {
		e.usedEqHelpers = map[string]*recordInfo{}
	}
	if _, ok := e.usedEqHelpers[name]; !ok {
		e.usedEqHelpers[name] = rec
		for _, f := range rec.Fields {
			if dep := e.recordOf(f.Type); dep != nil {
				e.requireEqHelper(dep)
			}
		}
	}
	return name
}

// eqHelperBody renders the compiler-derived structural == for one record:
// per-field comparison joined with &&, record-typed fields delegating to
// their own helper.
func eqHelperBody(rec *recordInfo) string {
	var conds []string
	for _, f := range rec.Fields {
		if f.Type.Kind == semantics.TypeCustom {
			conds = append(conds, fmt.Sprintf(
				"delta__%s_eq(a.%s, b.%s)", f.Type.Name, f.Name, f.Name))
		} else {
			conds = append(conds, fmt.Sprintf("a.%s == b.%s", f.Name, f.Name))
		}
	}
	body := "true"
	if len(conds) > 0 {
		body = strings.Join(conds, " && ")
	}
	return fmt.Sprintf(
		`static inline bool %s(%s a, %s b) {
	return %s;
}`, eqHelperName(rec), rec.CName, rec.CName, body)
}

// deltaPanicDef is the shared trap routine every runtime safety check calls.
// It prints "<file>:<line>: panic: <msg>" to stderr and aborts (non-zero
// exit), matching the panic mechanism in spec §5.15.
const deltaPanicDef = `static void delta_panic(const char *file, int line, const char *msg) {
	fprintf(stderr, "%s:%d: panic: %s\n", file, line, msg);
	abort();
}`

// emitConversion lowers a resolved `T(x)` numeric conversion. A free
// conversion is a plain C cast; a trapping one calls a range-checked helper
// (emitted into the TU preamble) that panics with the source location.
func (e *Emitter) emitConversion(
	call ast.FunctionCallExpression,
	conv semantics.ConversionInfo,
) string {
	arg := e.EmitExpression(call.Arguments[0])

	if conv.Kind == semantics.ConvFree {
		ct, _ := cType(conv.To)
		return fmt.Sprintf("(%s)(%s)", ct, arg)
	}

	helper := convHelperName(conv.From, conv.To)
	if e.usedHelpers == nil {
		e.usedHelpers = map[string]semantics.ConversionInfo{}
	}
	e.usedHelpers[helper] = conv
	return fmt.Sprintf(
		"%s(%s, %q, %d)", helper, arg, e.SourcePath, call.Position.Line)
}

func (e *Emitter) emitDivision(
	expr ast.BinaryExpression,
	operandType semantics.Type,
) string {
	left := e.EmitExpression(expr.Left)
	right := e.EmitExpression(expr.Right)

	helper := divHelperName(expr.Operator, operandType)
	if e.usedDivHelpers == nil {
		e.usedDivHelpers = map[string]divHelper{}
	}
	e.usedDivHelpers[helper] = divHelper{Op: expr.Operator, Type: operandType}

	return fmt.Sprintf(
		"%s(%s, %s, %q, %d)",
		helper, left, right, e.SourcePath, expr.Position.Line)
}

// typeCode is the short mnemonic for a type used in trap-helper names.
func typeCode(t semantics.Type) string {
	switch t.Kind {
	case semantics.TypeInt8:
		return "i8"
	case semantics.TypeInt16:
		return "i16"
	case semantics.TypeInt32:
		return "i32"
	case semantics.TypeInt64:
		return "i64"
	case semantics.TypeIntSize:
		return "isz"
	case semantics.TypeUInt8:
		return "u8"
	case semantics.TypeUInt16:
		return "u16"
	case semantics.TypeUInt32:
		return "u32"
	case semantics.TypeUInt64:
		return "u64"
	case semantics.TypeUIntSize:
		return "usz"
	case semantics.TypeFloat32:
		return "f32"
	case semantics.TypeFloat64:
		return "f64"
	case semantics.TypeChar:
		return "char"
	}
	return "x"
}

func convHelperName(from, to semantics.Type) string {
	return fmt.Sprintf("delta_rt_conv_%s_to_%s", typeCode(from), typeCode(to))
}

func divHelperName(op string, t semantics.Type) string {
	verb := "div"
	if op == "%" {
		verb = "mod"
	}
	return fmt.Sprintf("delta_rt_%s_%s", verb, typeCode(t))
}

// divHelperBody renders a `static inline` integer div/mod guard that traps
// on a zero divisor. Works for signed and unsigned alike; the helper name
// (via typeCode) keeps the two apart.
func divHelperBody(op string, t semantics.Type) string {
	ct, _ := cType(t)
	// Both `/` and `%` share one message so the trap reads "division by zero"
	// regardless of operator (see primitives/tests.json: mod_zero_trap).
	return fmt.Sprintf(
		`static inline %s %s(%s a, %s b, const char *file, int line){
        if (b == 0) delta_panic(file, line, "integer division by zero");
        return a %s b;
  }`,
		ct,
		divHelperName(op, t),
		ct,
		ct,
		op,
	)
}

func (e *Emitter) emitShift(
	expr ast.BinaryExpression,
	leftType semantics.Type,
) string {
	left := e.EmitExpression(expr.Left)
	right := e.EmitExpression(expr.Right)

	helper := shiftHelperName(expr.Operator, leftType)
	if e.usedShiftHelpers == nil {
		e.usedShiftHelpers = map[string]divHelper{}
	}
	e.usedShiftHelpers[helper] = divHelper{Op: expr.Operator, Type: leftType}

	return fmt.Sprintf(
		"%s(%s, %s, %q, %d)",
		helper, left, right, e.SourcePath, expr.Position.Line)
}

func shiftHelperName(op string, t semantics.Type) string {
	verb := "shl"
	if op == ">>" {
		verb = "shr"
	}
	return fmt.Sprintf("delta_rt_%s_%s", verb, typeCode(t))
}

// shiftHelperBody renders a `static inline` shift guard that traps when the
// count is negative (signed sources) or >= the operand's bit width.
func shiftHelperBody(op string, t semantics.Type) string {
	ct, _ := cType(t)
	cond := fmt.Sprintf("b >= %d", t.BitWidth())
	if t.IsSigned() {
		cond = "b < 0 || " + cond
	}
	return fmt.Sprintf(
		`static inline %s %s(%s a, %s b, const char *file, int line){
        if (%s) delta_panic(file, line, "shift count out of range");
        return a %s b;
  }`,
		ct,
		shiftHelperName(op, t),
		ct,
		ct,
		cond,
		op,
	)
}

// emitCompoundAssign lowers `x op= e` to `x = delta_rt_<op>_<type>(x, e, …)`,
// an overflow-checked helper call.
func (e *Emitter) emitCompoundAssign(
	stmt ast.AssignmentStatement,
	target string,
	operandType semantics.Type,
) string {
	helper := arithHelperName(stmt.Operator, operandType)
	if e.usedArithHelpers == nil {
		e.usedArithHelpers = map[string]divHelper{}
	}
	e.usedArithHelpers[helper] = divHelper{Op: stmt.Operator, Type: operandType}

	return fmt.Sprintf(
		"%s(%s, %s, %q, %d)",
		helper, target, e.EmitExpression(stmt.Value),
		e.SourcePath, stmt.Position.Line)
}

func arithHelperName(op string, t semantics.Type) string {
	verb := map[string]string{"+": "add", "-": "sub", "*": "mul"}[op]
	return fmt.Sprintf("delta_rt_%s_%s", verb, typeCode(t))
}

// emitIncDec lowers a postfix `x++` / `x--` to a call to an overflow-checked
// helper that takes &x, traps on overflow, and returns the pre-update value
// so the expression keeps postfix value semantics.
func (e *Emitter) emitIncDec(
	expr ast.PostfixUnaryExpression,
	operandType semantics.Type,
) string {
	helper := incDecHelperName(expr.Operator, operandType)
	if e.usedIncDecHelpers == nil {
		e.usedIncDecHelpers = map[string]divHelper{}
	}
	e.usedIncDecHelpers[helper] = divHelper{
		Op:   expr.Operator,
		Type: operandType,
	}

	return fmt.Sprintf(
		"%s(&%s, %q, %d)",
		helper,
		e.EmitExpression(expr.Operand),
		e.SourcePath,
		expr.Position.Line,
	)
}

// arithHelperBody renders a `static inline` overflow-checked +/-/* used by
// compound assignment, relying on clang's __builtin_*_overflow intrinsics.
func arithHelperBody(op string, t semantics.Type) string {
	ct, _ := cType(t)
	builtin := map[string]string{
		"+": "__builtin_add_overflow",
		"-": "__builtin_sub_overflow",
		"*": "__builtin_mul_overflow",
	}[op]
	msg := "arithmetic overflow in `" + op + "`"
	return fmt.Sprintf(
		`static inline %s %s(%s a, %s b, const char *file, int line){
        %s r;
        if (%s(a, b, &r)) delta_panic(file, line, "%s");
        return r;
  }`,
		ct,
		arithHelperName(op, t),
		ct,
		ct,
		ct,
		builtin,
		msg,
	)
}

// incDecHelperName maps a postfix operator + operand type to the generated C
// function name, e.g. delta_rt_postinc_i32 / delta_rt_postdec_u8.
func incDecHelperName(op string, t semantics.Type) string {
	verb := map[string]string{"++": "postinc", "--": "postdec"}[op]
	return fmt.Sprintf("delta_rt_%s_%s", verb, typeCode(t))
}

// incDecHelperBody renders a `static inline` overflow-checked postfix
// increment/decrement. It takes the operand by pointer, returns the
// pre-update value (postfix semantics), and traps via delta_panic when the
// ±1 step overflows — unsigned wrap included (spec §5).
func incDecHelperBody(op string, t semantics.Type) string {
	ct, _ := cType(t)
	builtin := map[string]string{
		"++": "__builtin_add_overflow",
		"--": "__builtin_sub_overflow",
	}[op]
	msg := "arithmetic overflow in `" + op + "`"
	return fmt.Sprintf(
		`static inline %s %s(%s *p, const char *file, int line){
        %s old = *p;
        %s r;
        if (%s(old, (%s)1, &r)) delta_panic(file, line, "%s");
        *p = r;
        return old;
  }`,
		ct,
		incDecHelperName(op, t),
		ct,
		ct,
		ct,
		builtin,
		ct,
		msg,
	)
}

// limitMax returns the <stdint.h> macro for a type's maximum value.
func limitMax(t semantics.Type) string {
	switch t.Kind {
	case semantics.TypeInt8:
		return "INT8_MAX"
	case semantics.TypeInt16:
		return "INT16_MAX"
	case semantics.TypeInt32:
		return "INT32_MAX"
	case semantics.TypeInt64:
		return "INT64_MAX"
	case semantics.TypeIntSize:
		return "INTPTR_MAX"
	case semantics.TypeUInt8:
		return "UINT8_MAX"
	case semantics.TypeUInt16:
		return "UINT16_MAX"
	case semantics.TypeUInt32:
		return "UINT32_MAX"
	case semantics.TypeUInt64:
		return "UINT64_MAX"
	case semantics.TypeUIntSize:
		return "UINTPTR_MAX"
	}
	return "0"
}

// limitMin returns the <stdint.h> macro for a signed type's minimum value.
// Unsigned types have a minimum of 0.
func limitMin(t semantics.Type) string {
	switch t.Kind {
	case semantics.TypeInt8:
		return "INT8_MIN"
	case semantics.TypeInt16:
		return "INT16_MIN"
	case semantics.TypeInt32:
		return "INT32_MIN"
	case semantics.TypeInt64:
		return "INT64_MIN"
	case semantics.TypeIntSize:
		return "INTPTR_MIN"
	}
	return "0"
}

// convHelperBody renders a `static inline` range-checked conversion helper.
// The check and panic message depend on the signedness relationship:
// same-sign conversions are narrowings; cross-sign conversions are sign flips.
func convHelperBody(from, to semantics.Type) string {
	st, _ := cType(from)
	dt, _ := cType(to)

	// float -> int: reject NaN, then anything outside the target's range.
	// NaN is the only value that compares unequal to itself, so `v != v`
	// is a NaN test that needs no <math.h>; ±infinity and out-of-magnitude
	// values are caught by the range comparison.
	if from.IsFloat() && to.IsInteger() {
		return fmt.Sprintf(
			`static inline %s %s(%s v, const char *file, int line){
        if (v != v) delta_panic(file, line, "float-to-int conversion of NaN");
        if (v < (%s)%s || v > (%s)%s) delta_panic(file, line, "float conversion out of range");
        return (%s)v;
  }`,
			dt,
			convHelperName(from, to),
			st,
			st,
			limitMin(to),
			st,
			limitMax(to),
			dt,
		)
	}

	// integer -> char: the value must be a Unicode scalar — at most U+10FFFF
	// and outside the UTF-16 surrogate range D800..DFFF. The `v < 0` guard is
	// only added for signed sources, to avoid a tautological-compare warning
	// on unsigned ones.
	if from.IsInteger() && to.Kind == semantics.TypeChar {
		cond := "v > 0x10FFFF || (v >= 0xD800 && v <= 0xDFFF)"
		if from.IsSigned() {
			cond = "v < 0 || " + cond
		}
		return fmt.Sprintf(
			`static inline %s %s(%s v, const char *file, int line){
        if (%s) delta_panic(file, line, "invalid Unicode scalar value");
        return (%s)v;
  }`,
			dt,
			convHelperName(from, to),
			st,
			cond,
			dt,
		)
	}

	var cond, msg string
	switch {
	case from.IsSigned() && to.IsSigned():
		cond = fmt.Sprintf("v < %s || v > %s", limitMin(to), limitMax(to))
		msg = "narrowing conversion out of range"
	case from.IsUnsigned() && to.IsUnsigned():
		cond = fmt.Sprintf("v > %s", limitMax(to))
		msg = "narrowing conversion out of range"
	case from.IsSigned() && to.IsUnsigned():
		cond = fmt.Sprintf(
			"v < 0 || (uintmax_t)v > (uintmax_t)%s",
			limitMax(to),
		)
		msg = "sign-flip conversion out of range"
	default: // unsigned -> signed
		cond = fmt.Sprintf("v > (uintmax_t)%s", limitMax(to))
		msg = "sign-flip conversion out of range"
	}

	return fmt.Sprintf(`static inline %s %s(%s v, const char *file, int line) {
	if (%s) delta_panic(file, line, "%s");
	return (%s)v;
}`, dt, convHelperName(from, to), st, cond, msg, dt)
}

// typeOfExpr is codegen's best-effort expression typing, used to decide when
// record lowering applies (equality helpers, spread expansion, member access).
// It only needs to be precise for record-bearing expressions; anything it
// cannot type returns TypeEmpty, which keeps the primitive paths unchanged.
func (e *Emitter) typeOfExpr(expr ast.Expression) semantics.Type {
	switch expr := expr.(type) {
	case ast.Identifier:
		if t, ok := e.localTypes[expr.Name]; ok {
			return t
		}
		if t, ok := e.globalTypes[expr.Name]; ok {
			return t
		}
	case ast.MemberAccessExpression:
		if rec := e.recordOf(e.typeOfExpr(expr.Receiver)); rec != nil {
			for _, f := range rec.Fields {
				if f.Name == expr.Member {
					return f.Type
				}
			}
		}
	case ast.FunctionCallExpression:
		if callee, ok := expr.Callee.(ast.Identifier); ok {
			if sig, ok := e.funcSigs[callee.Name]; ok {
				return sig.Return
			}
		}
	}
	return semantics.Type{Kind: semantics.TypeEmpty}
}

// emitObjectLiteral lowers a pinned object literal to a C compound literal.
// Fields are emitted in the target record's declaration order regardless of
// source order; spread sources fill every field not explicitly provided with
// a `(source).field` projection (the analyzer guarantees exact coverage and
// that spread sources share the target's type).
func (e *Emitter) emitObjectLiteral(
	lit ast.ObjectLiteralExpression,
	rec *recordInfo,
) string {
	provided := map[string]string{}
	for _, element := range lit.Elements {
		switch element := element.(type) {
		case ast.FieldInit:
			var fieldType semantics.Type
			for _, f := range rec.Fields {
				if f.Name == element.Name {
					fieldType = f.Type
					break
				}
			}
			provided[element.Name] = e.emitPinnedExpression(
				element.Value, fieldType)
		case ast.SpreadElement:
			src := "(" + e.EmitExpression(element.Source) + ")"
			for _, f := range rec.Fields {
				if _, ok := provided[f.Name]; !ok {
					provided[f.Name] = src + "." + f.Name
				}
			}
		}
	}

	parts := make([]string, 0, len(rec.Fields))
	for _, f := range rec.Fields {
		parts = append(parts, fmt.Sprintf(".%s = %s", f.Name, provided[f.Name]))
	}
	return fmt.Sprintf("(%s){ %s }", rec.CName, strings.Join(parts, ", "))
}

// emitPinnedExpression emits an expression under a known expected type, so
// an object literal in that position lowers against the right record. All
// other expressions fall through to the ordinary path.
func (e *Emitter) emitPinnedExpression(
	expr ast.Expression,
	expected semantics.Type,
) string {
	if lit, ok := expr.(ast.ObjectLiteralExpression); ok {
		if rec := e.recordOf(expected); rec != nil {
			return e.emitObjectLiteral(lit, rec)
		}
	}
	return e.EmitExpression(expr)
}

func (e *Emitter) Indent() string {
	var indents strings.Builder
	if e.indentOn {
		for range e.indent {
			indents.WriteString("\t")
		}
	}
	e.indentOn = true
	return indents.String()
}

// function f(a: int32, b:int32): int32 {} -> int32_t f(int32_t, int32_t);
func (e *Emitter) buildSignature(
	decl ast.FunctionDeclaration,
) (string, error) {
	var pList strings.Builder
	for i, p := range decl.Parameters {
		pType, _ := e.resolveType(p.Type.Name.Name)
		cPtype, err := e.cTypeOf(pType)

		if err != nil {
			return "", err
		}

		fmt.Fprintf(&pList, "%s %s", cPtype, p.Name.Name)

		if i < len(decl.Parameters)-1 {
			pList.WriteString(", ")
		}
	}
	fnName := decl.Name

	if decl.Name == "main" {
		fnName = "delta_main"
	}

	var retType semantics.Type
	var cRetType string

	if len(decl.ReturnTypes) == 0 {
		cRetType = "void"
	} else {
		retType, _ = e.resolveType(decl.ReturnTypes[0].Name.Name)
		cRetType, _ = e.cTypeOf(retType)
	}

	return fmt.Sprintf("%s %s(%s);", cRetType, fnName, pList.String()), nil
}

// buildFuncSigs resolves every function declaration's parameter and return
// types into e.funcSigs for call-site pinning and expression typing.
func (e *Emitter) buildFuncSigs() {
	e.funcSigs = map[string]fnSig{}
	for _, decl := range e.File.Declarations {
		fn, ok := decl.(ast.FunctionDeclaration)
		if !ok {
			continue
		}
		sig := fnSig{Return: semantics.Type{Kind: semantics.TypeVoid}}
		for _, p := range fn.Parameters {
			pt, _ := e.resolveType(p.Type.Name.Name)
			sig.Params = append(sig.Params, pt)
		}
		if len(fn.ReturnTypes) > 0 {
			sig.Return, _ = e.resolveType(fn.ReturnTypes[0].Name.Name)
		}
		e.funcSigs[fn.Name] = sig
	}
}

// binaryPrecedence returns a relative precedence for each binary operator
// the v0 surface supports. Higher numbers bind tighter. Returns 0 for
// anything unrecognized so the conservative "wrap in parens" path is taken.
//
// Precedence levels match standard C so that the natural C-precedence
// reading of the emitted source matches the AST grouping the parser built.
func binaryPrecedence(op string) int {
	switch op {
	case "||":
		return 1
	case "&&":
		return 2
	case "|":
		return 3
	case "^":
		return 4
	case "&":
		return 5
	case "==", "!=":
		return 6
	case "<", "<=", ">", ">=":
		return 7
	case "<<", ">>":
		return 8
	case "+", "-":
		return 9
	case "*", "/", "%":
		return 10
	}
	return 0
}

// emitOperand emits a sub-expression of a binary operator and wraps it in
// parens iff the natural C precedence reading would otherwise re-group
// differently than the AST demands.
//
// All v0 binary operators are left-associative, so an equal-precedence
// operand on the right (e.g. `a - (b - c)`) requires parens, but on the
// left (e.g. `a - b - c` ≡ `(a - b) - c`) does not.
func (e *Emitter) emitOperand(
	expr ast.Expression,
	parentPrec int,
	isLeft bool,
) string {
	inner, ok := expr.(ast.BinaryExpression)
	if !ok {
		return e.EmitExpression(expr)
	}
	innerPrec := binaryPrecedence(inner.Operator)
	needsParens := innerPrec < parentPrec ||
		(innerPrec == parentPrec && !isLeft)
	if needsParens {
		return "(" + e.EmitExpression(expr) + ")"
	}
	return e.EmitExpression(expr)
}

func (e *Emitter) EmitExpression(expr ast.Expression) string {
	var finalExpr strings.Builder
	switch expr := expr.(type) {
	case ast.IntegerLiteral:
		finalExpr.WriteString(expr.Value)
	case ast.FloatLiteral:
		finalExpr.WriteString(expr.Value)
	case ast.BooleanLiteral:
		finalExpr.WriteString(expr.Value)
	case ast.CharacterLiteral:
		// The lexeme is the inner character with any escape preserved (e.g.
		// `a`, `\n`, `\x41`), so wrap it back in single quotes to form a C
		// char constant.
		finalExpr.WriteString("'" + expr.Value + "'")

	case ast.BinaryExpression:
		if operandType, ok := e.Divisions[expr.Position]; ok {
			return e.emitDivision(expr, operandType)
		}
		if leftType, ok := e.Shifts[expr.Position]; ok {
			return e.emitShift(expr, leftType)
		}
		// Record == / != lowers to the compiler-derived structural-equality
		// helper; C has no struct comparison operator.
		if expr.Operator == "==" || expr.Operator == "!=" {
			if rec := e.recordOf(e.typeOfExpr(expr.Left)); rec != nil {
				helper := e.requireEqHelper(rec)
				call := fmt.Sprintf(
					"%s(%s, %s)",
					helper,
					e.EmitExpression(expr.Left),
					e.EmitExpression(expr.Right),
				)
				if expr.Operator == "!=" {
					return "!" + call
				}
				return call
			}
		}
		parentPrec := binaryPrecedence(expr.Operator)
		left := e.emitOperand(expr.Left, parentPrec, true)
		right := e.emitOperand(expr.Right, parentPrec, false)
		op := " " + expr.Operator + " "

		finalExpr.WriteString(left)
		finalExpr.WriteString(op)
		finalExpr.WriteString(right)

	case ast.Identifier:
		finalExpr.WriteString(expr.Name)

	case ast.MemberAccessExpression:
		// Record values live inline, so field access is plain C member
		// access on the receiver value — no deref.
		finalExpr.WriteString(
			e.EmitExpression(expr.Receiver) + "." + expr.Member)

	case ast.UnaryExpression:
		finalExpr.WriteString(expr.Operator + e.EmitExpression(expr.Expression))

	case ast.PostfixUnaryExpression:
		if operandType, ok := e.IncDecs[expr.Position]; ok {
			return e.emitIncDec(expr, operandType)
		}
		finalExpr.WriteString(e.EmitExpression(expr.Operand) + expr.Operator)

	case ast.FunctionCallExpression:
		// A `T(x)` numeric conversion the analyzer resolved: lower it to a
		// plain cast (free) or a range-checked runtime helper (trapping),
		// not a function call.
		if conv, ok := e.Conversions[expr.Position]; ok {
			return e.emitConversion(expr, conv)
		}

		fnName := e.EmitExpression(expr.Callee)

		intTypes := []string{"int8", "int16", "int32", "int64"}
		uintTypes := []string{"uint8", "uint16", "uint32", "uint64"}

		if slices.Contains(intTypes, fnName) || slices.Contains(uintTypes, fnName) {
			fnTypeName, _ := semantics.ResolveTypeName(fnName)
			fnType, _ := cType(fnTypeName)
			fmt.Fprintf(&finalExpr, "(%s)", fnType)
		} else {
			finalExpr.WriteString(fnName)
		}

		finalExpr.WriteString("(")

		// Object-literal arguments are pinned by the callee's declared
		// parameter type (analyzer Decision 3); other arguments emit as-is.
		sig, hasSig := e.funcSigs[fnName]
		for i, arg := range expr.Arguments {
			if hasSig && i < len(sig.Params) {
				finalExpr.WriteString(e.emitPinnedExpression(arg, sig.Params[i]))
			} else {
				finalExpr.WriteString(e.EmitExpression(arg))
			}
			if i < len(expr.Arguments)-1 {
				finalExpr.WriteString(", ")
			}
		}
		finalExpr.WriteString(")")
	}

	return finalExpr.String()
}

func (e *Emitter) EmitStatement(stmt ast.Statement) string {
	var finalStmt strings.Builder
	switch stmt := stmt.(type) {
	case ast.ReturnStatement:
		if len(stmt.Values) > 0 {
			expr := e.emitPinnedExpression(stmt.Values[0], e.currentReturn)
			fmt.Fprintf(&finalStmt, e.Indent()+"return %s;", expr)
		}

	case ast.VariableDeclarationStatement:
		vType, _ := e.resolveType(stmt.Type.Name.Name)
		cVType, _ := e.cTypeOf(vType)
		if e.localTypes != nil {
			e.localTypes[stmt.Name] = vType
		}

		if !stmt.Mutable {
			finalStmt.WriteString(e.Indent() + "const " + cVType)
		} else {
			finalStmt.WriteString(e.Indent() + cVType)
		}

		finalStmt.WriteString(" " + stmt.Name)
		// `let v: Vec3;` — a record binding with no initializer is legal;
		// definite assignment guarantees a whole-value write before any use.
		if stmt.Value == nil {
			finalStmt.WriteString(";")
			break
		}
		finalStmt.WriteString(" = ")
		finalStmt.WriteString(e.emitPinnedExpression(stmt.Value, vType) + ";")

	case ast.WhileStatement:
		finalStmt.WriteString(e.Indent() + "while (")
		finalStmt.WriteString(e.EmitExpression(stmt.Condition))
		finalStmt.WriteString(")")
		finalStmt.WriteString(e.EmitBlockStatement(stmt.Body))

	case ast.AssignmentStatement:
		// The target may be a plain identifier or a member-access chain
		// (`dog.age = 4;`); both lower to the same C l-value syntax.
		target := stmt.Target.Name
		targetType := e.typeOfExpr(stmt.TargetExpression)
		if _, isMember := stmt.TargetExpression.(ast.MemberAccessExpression); isMember {
			target = e.EmitExpression(stmt.TargetExpression)
		}
		if stmt.Operator != "" {
			// Compound `x op= e` lowers to `x = delta_rt_<op>_<type>(x, e, …)`,
			// an overflow-checked helper. The target type comes from the
			// resolved symbol recorded by the analyzer, falling back to
			// codegen's own typing for member-access targets.
			operandType := e.PositionRefs[stmt.Target.Position].Type
			if targetType.Kind != semantics.TypeEmpty &&
				targetType.Kind != semantics.TypeCustom {
				operandType = targetType
			}
			finalStmt.WriteString(e.Indent() + target + " = ")
			finalStmt.WriteString(
				e.emitCompoundAssign(stmt, target, operandType) + ";")
		} else {
			finalStmt.WriteString(e.Indent() + target + " = ")
			finalStmt.WriteString(
				e.emitPinnedExpression(stmt.Value, targetType) + ";")
		}

	case ast.IfStatement:
		finalStmt.WriteString(e.Indent())
		finalStmt.WriteString("if (")
		finalStmt.WriteString(e.EmitExpression(stmt.Condition))
		finalStmt.WriteString(")")
		finalStmt.WriteString(e.EmitBlockStatement(stmt.ThenBlock))

		if len(stmt.ElseBlock.Statements) > 0 {
			finalStmt.WriteString(" else")
			finalStmt.WriteString(e.EmitBlockStatement(stmt.ElseBlock))
		}

	case ast.ForStatement:
		finalStmt.WriteString(e.Indent())
		finalStmt.WriteString("for (")

		if stmt.Init.(ast.VariableDeclarationStatement).Name == "" {
			finalStmt.WriteString(";")
		} else {
			e.indentOn = false
			finalStmt.WriteString(e.EmitStatement(stmt.Init))
		}

		if stmt.Cond == nil {
			finalStmt.WriteString(";")
		} else {
			finalStmt.WriteString(" ")
			finalStmt.WriteString(e.EmitExpression(stmt.Cond))
			finalStmt.WriteString("; ")
		}

		if stmt.Step != nil {
			finalStmt.WriteString(e.EmitExpression(stmt.Step))
		}

		finalStmt.WriteString(")")
		finalStmt.WriteString(e.EmitBlockStatement(*stmt.Body))

	case ast.SwitchStatement:
		finalStmt.WriteString(e.Indent() + "switch (")
		finalStmt.WriteString(e.EmitExpression(stmt.Scrutinee))
		finalStmt.WriteString(") {\n")
		e.indent += 1
		for _, c := range stmt.Cases {
			finalStmt.WriteString(e.Indent() + "case ")
			for i, l := range c.Labels {
				finalStmt.WriteString(e.EmitExpression(l))
				finalStmt.WriteString(":")
				if i < len(c.Labels)-1 {
					finalStmt.WriteString(" case ")
				}
			}

			finalStmt.WriteString(e.EmitBlockStatement(*c.Body) + "\n")
			finalStmt.WriteString(e.Indent() + "break;\n")
		}

		if stmt.Default != nil {
			finalStmt.WriteString(e.Indent() + "default :")
			finalStmt.WriteString(e.EmitBlockStatement(*stmt.Default.Body))
		}

		finalStmt.WriteString("}")

	case ast.BreakStatement:
		finalStmt.WriteString(e.Indent() + "break;")

	case ast.ContinueStatement:
		finalStmt.WriteString(e.Indent() + "continue;")

	case ast.ExpressionStatement:
		finalStmt.WriteString(e.Indent() + e.EmitExpression(stmt.Value) + ";")

	}

	return finalStmt.String()
}

func (e *Emitter) EmitBlockStatement(block ast.BlockStatement) string {
	var finalBlock strings.Builder
	finalBlock.WriteString(" {\n")
	e.indent += 1

	for _, stmt := range block.Statements {
		finalBlock.WriteString(e.EmitStatement(stmt) + "\n")
	}
	e.indent -= 1
	finalBlock.WriteString(e.Indent() + "}")

	return finalBlock.String()
}

func (e *Emitter) EmitFunctionDeclaration(
	fn ast.FunctionDeclaration,
) (string, error) {
	var res strings.Builder
	sig, err := e.buildSignature(fn)

	if err != nil {
		return "", err
	}

	// Fresh per-function binding-type table (parameters seed it; locals are
	// added as their declarations are emitted) and the return type used to
	// pin `return { ... };` literals.
	e.localTypes = map[string]semantics.Type{}
	for _, p := range fn.Parameters {
		e.localTypes[p.Name.Name], _ = e.resolveType(p.Type.Name.Name)
	}
	e.currentReturn = semantics.Type{Kind: semantics.TypeVoid}
	if len(fn.ReturnTypes) > 0 {
		e.currentReturn, _ = e.resolveType(fn.ReturnTypes[0].Name.Name)
	}

	res.WriteString(sig[:len(sig)-1])
	res.WriteString(e.EmitBlockStatement(*fn.Body))
	return res.String(), nil
}

func (e *Emitter) EmitConstDeclaration(decl ast.ConstDeclaration) string {
	var constDecl strings.Builder
	vType, _ := e.resolveType(decl.Type.Name.Name)
	cVType, _ := e.cTypeOf(vType)
	if e.globalTypes == nil {
		e.globalTypes = map[string]semantics.Type{}
	}
	e.globalTypes[decl.Name.Name] = vType

	constDecl.WriteString("static const " + cVType + " " + decl.Name.Name)
	constDecl.WriteString(" = " + e.emitPinnedExpression(decl.Value, vType) + ";\n")
	return constDecl.String()
}

func (e *Emitter) Emit() []byte {
	e.indentOn = true

	// Resolve the record table and function signatures first: forward
	// declarations, expression typing, and literal pinning all read them.
	e.buildRecordTable()
	e.buildFuncSigs()
	e.globalTypes = map[string]semantics.Type{}
	for _, decl := range e.File.Declarations {
		if c, ok := decl.(ast.ConstDeclaration); ok {
			e.globalTypes[c.Name.Name], _ = e.resolveType(c.Type.Name.Name)
		}
	}

	var fwdDecls strings.Builder
	for _, decl := range e.File.Declarations {

		switch decl := decl.(type) {
		case ast.FunctionDeclaration:
			fwdDecl, err := e.buildSignature(decl)
			if err != nil {
				println(err.Error())
			}

			fwdDecls.WriteString(fwdDecl + "\n")
		}
	}

	var funcDecls strings.Builder
	var constDecls strings.Builder

	for _, decl := range e.File.Declarations {
		switch decl := decl.(type) {
		case ast.FunctionDeclaration:
			funcDecl, err := e.EmitFunctionDeclaration(decl)
			if err != nil {
				println(err.Error())
			}

			funcDecls.WriteString(funcDecl + "\n")
		case ast.ConstDeclaration:
			constDecls.WriteString((e.EmitConstDeclaration(decl)))
		}
	}

	includes := "#include <stdint.h>\n#include <stdbool.h>\n"

	// Runtime preamble: only emitted when a trapping conversion is present,
	// so programs without traps keep byte-identical output.
	var runtime strings.Builder
	if len(e.usedHelpers) > 0 || len(e.usedDivHelpers) > 0 ||
		len(e.usedShiftHelpers) > 0 || len(e.usedArithHelpers) > 0 ||
		len(e.usedIncDecHelpers) > 0 {
		includes += "#include <stdio.h>\n#include <stdlib.h>\n"
		runtime.WriteString("\n" + deltaPanicDef + "\n")

		names := make([]string, 0, len(e.usedHelpers))
		for name := range e.usedHelpers {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			conv := e.usedHelpers[name]
			runtime.WriteString(
				"\n" + convHelperBody(conv.From, conv.To) + "\n",
			)
		}

		divNames := make([]string, 0, len(e.usedDivHelpers))
		for name := range e.usedDivHelpers {
			divNames = append(divNames, name)
		}
		sort.Strings(divNames)
		for _, name := range divNames {
			dh := e.usedDivHelpers[name]
			runtime.WriteString("\n" + divHelperBody(dh.Op, dh.Type) + "")
		}

		shiftNames := make([]string, 0, len(e.usedShiftHelpers))
		for name := range e.usedShiftHelpers {
			shiftNames = append(shiftNames, name)
		}
		sort.Strings(shiftNames)
		for _, name := range shiftNames {
			sh := e.usedShiftHelpers[name]
			runtime.WriteString("\n" + shiftHelperBody(sh.Op, sh.Type) + "\n")
		}

		arithNames := make([]string, 0, len(e.usedArithHelpers))
		for name := range e.usedArithHelpers {
			arithNames = append(arithNames, name)
		}
		sort.Strings(arithNames)
		for _, name := range arithNames {
			ah := e.usedArithHelpers[name]
			runtime.WriteString("\n" + arithHelperBody(ah.Op, ah.Type) + "\n")
		}

		incDecNames := make([]string, 0, len(e.usedIncDecHelpers))
		for name := range e.usedIncDecHelpers {
			incDecNames = append(incDecNames, name)
		}
		sort.Strings(incDecNames)
		for _, name := range incDecNames {
			ih := e.usedIncDecHelpers[name]
			runtime.WriteString("\n" + incDecHelperBody(ih.Op, ih.Type) + "\n")
		}
	}

	// Struct typedefs come right after the runtime preamble; the
	// equality helpers (registered while bodies were emitted above)
	// follow the structs they take by value.
	var recordDefs strings.Builder
	if len(e.recordOrder) > 0 {
		recordDefs.WriteString("\n" + e.emitStructDefs())
	}
	eqNames := make([]string, 0, len(e.usedEqHelpers))
	for name := range e.usedEqHelpers {
		eqNames = append(eqNames, name)
	}
	sort.Strings(eqNames)
	for _, name := range eqNames {
		recordDefs.WriteString(eqHelperBody(e.usedEqHelpers[name]) + "\n\n")
	}

	final := fmt.Sprintf(`%s%s
%s%s
%s
%s
int main() {
	return (int)delta_main();
}
`, includes, runtime.String(), recordDefs.String(), fwdDecls.String(),
		constDecls.String(), funcDecls.String())
	return []byte(final)
}
