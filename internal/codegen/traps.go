package codegen

import "fmt"

// This file is the trap helper layer. Delta requires that a handful of
// operations abort the program with a located panic instead of silently
// producing a wrong value or undefined behaviour:
//
//   - narrowing / sign-changing integer conversions  (int8(x), uint32(y), ...)
//   - integer -> char conversions of invalid scalars  (char(n))
//   - integer division / modulo by zero               (a / b, a % b)
//   - shifts whose count is out of range              (a << b, a >> b)
//   - arithmetic overflow on +=, -=, *=               (compound assignment)
//   - arithmetic overflow on ++ / --                  (postfix inc/dec)
//
// Each such site lowers to a call to a generated `delta_rt_*` helper that does
// the check and, on failure, calls delta_panic(file, line, msg) and aborts.
// Helpers are generated on demand: the first time a site needs one, we build
// its C source and stash it in e.helpers keyed by name, so the preamble only
// contains the helpers a program actually uses.

// deltaPanic is the shared trap routine. It prints "<file>:<line>: panic: <msg>"
// to stderr and aborts with a non-zero exit.
const deltaPanic = `static void delta_panic(const char *file, int line, const char *msg) {
	fprintf(stderr, "%s:%d: panic: %s\n", file, line, msg);
	abort();
}`

// addHelper registers a helper body under its C name (once) and returns the
// name, so callers can build the call site with it.
func (e *Emitter) addHelper(name, body string) string {
	if e.helpers == nil {
		e.helpers = map[string]string{}
	}
	if _, ok := e.helpers[name]; !ok {
		e.helpers[name] = body
	}
	return name
}

// loc renders the file/line argument pair every trap helper takes, so a panic
// can report "file.delta:line".
func (e *Emitter) loc(line int) string {
	return fmt.Sprintf("%q, %d", e.SourcePath, line)
}

// --- conversions -----------------------------------------------------------

// convIsFree reports whether a T(x) conversion can be a plain C cast with no
// runtime check. A conversion is free when no value of the source type can be
// lost or misinterpreted in the target type.
func convIsFree(from, to string) bool {
	// Identity conversion: nothing to check.
	if from == to {
		return true
	}
	// Float conversions never trap (the analyzer forbids float<->int, so the
	// only float conversions left are float<->float, which C casts cleanly).
	if isFloatName(from) || isFloatName(to) {
		return true
	}
	// Converting to char must validate the Unicode scalar range, so it is only
	// free when the source is already a char (handled by from == to above).
	if to == "char" {
		return false
	}
	// Integer (or char) source to integer target: free only when the sign
	// matches and the target is at least as wide, so every source value fits.
	return isSignedName(from) == isSignedName(to) && bitWidth(to) >= bitWidth(from)
}

// trapConversion lowers a checked T(x) conversion to a call to its range-checked
// helper, registering the helper body.
func (e *Emitter) trapConversion(argC, from, to string, line int) string {
	name := "delta_rt_conv_" + typeCode(from) + "_to_" + typeCode(to)
	e.addHelper(name, e.convHelperBody(name, from, to))
	return fmt.Sprintf("%s(%s, %s)", name, argC, e.loc(line))
}

// convCheck returns the C condition that means "this conversion would lose or
// misrepresent the value" together with the panic message to use.
func convCheck(from, to string) (cond, msg string) {
	// Integer -> char: must be a Unicode scalar (<= U+10FFFF, not a surrogate).
	if to == "char" {
		cond = "v > 0x10FFFF || (v >= 0xD800 && v <= 0xDFFF)"
		if isSignedName(from) {
			cond = "v < 0 || " + cond
		}
		return cond, "invalid Unicode scalar value"
	}

	// Integer -> integer: the check depends on the signedness relationship.
	switch {
	case isSignedName(from) && isSignedName(to):
		return fmt.Sprintf("v < %s || v > %s", limitMin(to), limitMax(to)),
			"narrowing conversion out of range"
	case !isSignedName(from) && !isSignedName(to):
		return fmt.Sprintf("v > %s", limitMax(to)),
			"narrowing conversion out of range"
	case isSignedName(from) && !isSignedName(to):
		return fmt.Sprintf("v < 0 || (uintmax_t)v > (uintmax_t)%s", limitMax(to)),
			"sign-flip conversion out of range"
	default: // unsigned/char source -> signed target
		return fmt.Sprintf("v > (uintmax_t)%s", limitMax(to)),
			"sign-flip conversion out of range"
	}
}

func (e *Emitter) convHelperBody(name, from, to string) string {
	cond, msg := convCheck(from, to)
	return fmt.Sprintf(
		`static inline %s %s(%s v, const char *file, int line) {
	if (%s) delta_panic(file, line, "%s");
	return (%s)v;
}`,
		e.cType(to), name, e.cType(from), cond, msg, e.cType(to),
	)
}

// --- division / modulo -----------------------------------------------------

// trapBinary lowers a checked integer `/`, `%`, `<<` or `>>` to its guard
// helper. The operand type t drives both the helper name and the check.
func (e *Emitter) trapBinary(op, leftC, rightC, t string, line int) string {
	var name, body string
	switch op {
	case "/", "%":
		name = "delta_rt_" + divVerb(op) + "_" + typeCode(t)
		body = divHelperBody(name, op, e.cType(t))
	default: // "<<", ">>"
		name = "delta_rt_" + shiftVerb(op) + "_" + typeCode(t)
		body = shiftHelperBody(name, op, e.cType(t), t)
	}
	e.addHelper(name, body)
	return fmt.Sprintf("%s(%s, %s, %s)", name, leftC, rightC, e.loc(line))
}

func divVerb(op string) string {
	if op == "%" {
		return "mod"
	}
	return "div"
}

func divHelperBody(name, op, ct string) string {
	return fmt.Sprintf(
		`static inline %s %s(%s a, %s b, const char *file, int line) {
	if (b == 0) delta_panic(file, line, "integer division by zero");
	return a %s b;
}`,
		ct, name, ct, ct, op,
	)
}

// --- shifts ----------------------------------------------------------------

func shiftVerb(op string) string {
	if op == ">>" {
		return "shr"
	}
	return "shl"
}

func shiftHelperBody(name, op, ct, t string) string {
	// The count must be below the operand's bit width; a signed count must also
	// be non-negative.
	cond := fmt.Sprintf("b >= %d", bitWidth(t))
	if isSignedName(t) {
		cond = "b < 0 || " + cond
	}
	return fmt.Sprintf(
		`static inline %s %s(%s a, %s b, const char *file, int line) {
	if (%s) delta_panic(file, line, "shift count out of range");
	return a %s b;
}`,
		ct, name, ct, ct, cond, op,
	)
}

// --- compound assignment overflow ------------------------------------------

// trapCompound lowers `x op= e` to `delta_rt_<op>_<t>(x, e, file, line)`, an
// overflow-checked add/sub/mul.
func (e *Emitter) trapCompound(op, targetC, valueC, t string, line int) string {
	name := "delta_rt_" + arithVerb(op) + "_" + typeCode(t)
	e.addHelper(name, arithHelperBody(name, op, e.cType(t)))
	return fmt.Sprintf("%s(%s, %s, %s)", name, targetC, valueC, e.loc(line))
}

// arithVerb maps an arithmetic or compound-assignment operator to its verb.
func arithVerb(op string) string {
	switch op {
	case "-", "-=":
		return "sub"
	case "*", "*=":
		return "mul"
	default: // "+", "+="
		return "add"
	}
}

// builtinOverflow maps an arithmetic verb to clang's checked-arithmetic builtin.
func builtinOverflow(op string) string {
	switch arithVerb(op) {
	case "sub":
		return "__builtin_sub_overflow"
	case "mul":
		return "__builtin_mul_overflow"
	default:
		return "__builtin_add_overflow"
	}
}

func arithHelperBody(name, op, ct string) string {
	return fmt.Sprintf(
		`static inline %s %s(%s a, %s b, const char *file, int line) {
	%s r;
	if (%s(a, b, &r)) delta_panic(file, line, "arithmetic overflow");
	return r;
}`,
		ct, name, ct, ct, ct, builtinOverflow(op),
	)
}

// --- postfix increment / decrement -----------------------------------------

// trapIncDec lowers `x++` / `x--` to a helper that takes &x, traps on overflow,
// and returns the pre-update value (postfix semantics).
func (e *Emitter) trapIncDec(op, operandC, t string, line int) string {
	verb := "inc"
	step := "1"
	if op == "--" {
		verb, step = "dec", "1"
	}
	name := "delta_rt_post" + verb + "_" + typeCode(t)
	e.addHelper(name, incDecHelperBody(name, op, e.cType(t), step))
	return fmt.Sprintf("%s(&%s, %s)", name, operandC, e.loc(line))
}

func incDecHelperBody(name, op, ct, step string) string {
	return fmt.Sprintf(
		`static inline %s %s(%s *p, const char *file, int line) {
	%s old = *p;
	%s r;
	if (%s(old, (%s)%s, &r)) delta_panic(file, line, "arithmetic overflow");
	*p = r;
	return old;
}`,
		ct, name, ct, ct, ct, builtinOverflow(op), ct, step,
	)
}

// --- type-name helpers -----------------------------------------------------
// These translate a Delta type name into the small facts the helpers above
// need: a short mnemonic for naming, signedness, bit width, and the
// <stdint.h> limit macros.

func typeCode(name string) string {
	switch name {
	case "int8":
		return "i8"
	case "int16":
		return "i16"
	case "int32":
		return "i32"
	case "int64":
		return "i64"
	case "intsize":
		return "isz"
	case "uint8":
		return "u8"
	case "uint16":
		return "u16"
	case "uint32":
		return "u32"
	case "uint64":
		return "u64"
	case "uintsize":
		return "usz"
	case "float32":
		return "f32"
	case "float64":
		return "f64"
	case "char":
		return "char"
	}
	return name
}

func isSignedName(name string) bool {
	switch name {
	case "int8", "int16", "int32", "int64", "intsize":
		return true
	}
	return false
}

func isFloatName(name string) bool {
	return name == "float32" || name == "float64"
}

// isIntegral reports whether a type takes part in the integer trap helpers
// (the signed/unsigned integers and char).
func isIntegral(name string) bool {
	switch name {
	case "int8", "int16", "int32", "int64", "intsize",
		"uint8", "uint16", "uint32", "uint64", "uintsize", "char":
		return true
	}
	return false
}

func bitWidth(name string) int {
	switch name {
	case "int8", "uint8":
		return 8
	case "int16", "uint16":
		return 16
	case "int32", "uint32", "float32":
		return 32
	case "char":
		return 21 // Unicode scalars need 21 bits
	}
	return 64 // int64, uint64, intsize, uintsize, float64
}

func limitMax(name string) string {
	switch name {
	case "int8":
		return "INT8_MAX"
	case "int16":
		return "INT16_MAX"
	case "int32":
		return "INT32_MAX"
	case "int64":
		return "INT64_MAX"
	case "intsize":
		return "INTPTR_MAX"
	case "uint8":
		return "UINT8_MAX"
	case "uint16":
		return "UINT16_MAX"
	case "uint32":
		return "UINT32_MAX"
	case "uint64":
		return "UINT64_MAX"
	case "uintsize":
		return "UINTPTR_MAX"
	}
	return "0"
}

func limitMin(name string) string {
	switch name {
	case "int8":
		return "INT8_MIN"
	case "int16":
		return "INT16_MIN"
	case "int32":
		return "INT32_MIN"
	case "int64":
		return "INT64_MIN"
	case "intsize":
		return "INTPTR_MIN"
	}
	return "0" // unsigned types
}
