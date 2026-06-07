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

	indent   int
	indentOn bool
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
	operandType semantics.Type,
) string {
	helper := arithHelperName(stmt.Operator, operandType)
	if e.usedArithHelpers == nil {
		e.usedArithHelpers = map[string]divHelper{}
	}
	e.usedArithHelpers[helper] = divHelper{Op: stmt.Operator, Type: operandType}

	return fmt.Sprintf(
		"%s(%s, %s, %q, %d)",
		helper, stmt.Target.Name, e.EmitExpression(stmt.Value),
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
	e.usedIncDecHelpers[helper] = divHelper{Op: expr.Operator, Type: operandType}

	return fmt.Sprintf(
		"%s(&%s, %q, %d)",
		helper, e.EmitExpression(expr.Operand), e.SourcePath, expr.Position.Line)
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
func buildSignature(
	decl ast.FunctionDeclaration,
) (string, error) {
	var pList strings.Builder
	for i, p := range decl.Parameters {
		pType, _ := semantics.ResolveTypeName(p.Type.Name.Name)
		cPtype, err := cType(pType)

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
		retType, _ = semantics.ResolveTypeName(decl.ReturnTypes[0].Name.Name)
		cRetType, _ = cType(retType)
	}

	return fmt.Sprintf("%s %s(%s);", cRetType, fnName, pList.String()), nil
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
		parentPrec := binaryPrecedence(expr.Operator)
		left := e.emitOperand(expr.Left, parentPrec, true)
		right := e.emitOperand(expr.Right, parentPrec, false)
		op := " " + expr.Operator + " "

		finalExpr.WriteString(left)
		finalExpr.WriteString(op)
		finalExpr.WriteString(right)

	case ast.Identifier:
		finalExpr.WriteString(expr.Name)

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

		for i, arg := range expr.Arguments {
			finalExpr.WriteString(e.EmitExpression(arg))
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
			expr := e.EmitExpression(stmt.Values[0])
			fmt.Fprintf(&finalStmt, e.Indent()+"return %s;", expr)
		}

	case ast.VariableDeclarationStatement:
		vType, _ := semantics.ResolveTypeName(stmt.Type.Name.Name)
		cVType, _ := cType(vType)

		if !stmt.Mutable {
			finalStmt.WriteString(e.Indent() + "const " + cVType)
		} else {
			finalStmt.WriteString(e.Indent() + cVType)
		}

		finalStmt.WriteString(" " + stmt.Name + " = ")
		finalStmt.WriteString(e.EmitExpression(stmt.Value) + ";")

	case ast.WhileStatement:
		finalStmt.WriteString(e.Indent() + "while (")
		finalStmt.WriteString(e.EmitExpression(stmt.Condition))
		finalStmt.WriteString(")")
		finalStmt.WriteString(e.EmitBlockStatement(stmt.Body))

	case ast.AssignmentStatement:
		if stmt.Operator != "" {
			// Compound `x op= e` lowers to `x = delta_rt_<op>_<type>(x, e, …)`,
			// an overflow-checked helper. The target type comes from the
			// resolved symbol recorded by the analyzer.
			operandType := e.PositionRefs[stmt.Target.Position].Type
			finalStmt.WriteString(e.Indent() + stmt.Target.Name + " = ")
			finalStmt.WriteString(e.emitCompoundAssign(stmt, operandType) + ";")
		} else {
			finalStmt.WriteString(e.Indent() + stmt.Target.Name + " = ")
			finalStmt.WriteString(e.EmitExpression(stmt.Value) + ";")
		}

	case ast.IfStatement:
		finalStmt.WriteString(e.Indent() + "if (")
		finalStmt.WriteString(e.EmitExpression(stmt.Condition))
		finalStmt.WriteString(")")
		finalStmt.WriteString(e.EmitBlockStatement(stmt.ThenBlock))

		if len(stmt.ElseBlock.Statements) > 0 {
			finalStmt.WriteString(" else")
			finalStmt.WriteString(e.EmitBlockStatement(stmt.ElseBlock))
		}

	case ast.ForStatement:
		finalStmt.WriteString(e.Indent() + "for (")

		if stmt.Init.(ast.VariableDeclarationStatement).Name == "" {
			finalStmt.WriteString(";")
		} else {
			e.indentOn = false
			finalStmt.WriteString(e.EmitStatement(stmt.Init))
		}

		if stmt.Cond == nil {
			finalStmt.WriteString(";")
		} else {
			finalStmt.WriteString(" " + e.EmitExpression(stmt.Cond) + "; ")
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
	sig, err := buildSignature(fn)

	if err != nil {
		return "", err
	}

	res.WriteString(sig[:len(sig)-1])
	res.WriteString(e.EmitBlockStatement(*fn.Body))
	return res.String(), nil
}

func (e *Emitter) EmitConstDeclaration(decl ast.ConstDeclaration) string {
	var constDecl strings.Builder
	vTypeName, _ := semantics.ResolveTypeName(decl.Type.Name.Name)
	cVType, _ := cType(vTypeName)

	constDecl.WriteString("static const " + cVType + " " + decl.Name.Name)
	constDecl.WriteString(" = " + e.EmitExpression(decl.Value) + ";\n")
	return constDecl.String()
}

func (e *Emitter) Emit() []byte {
	e.indentOn = true
	var fwdDecls strings.Builder
	for _, decl := range e.File.Declarations {

		switch decl := decl.(type) {
		case ast.FunctionDeclaration:
			fwdDecl, err := buildSignature(decl)
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

	final := fmt.Sprintf(`%s%s
%s
%s
%s
int main() {
	return (int)delta_main();
}
`, includes, runtime.String(), fwdDecls.String(), constDecls.String(), funcDecls.String())
	return []byte(final)
}
