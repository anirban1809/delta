package codegen

import (
	"fmt"
	"sort"

	"delta/internal/ast"
)

// This file is the fallible-statement layer. A Delta function that can fail is
// declared `f(): T | E`; instead of returning a bare T it returns a tagged
// result struct:
//
//	typedef struct delta_result_i32 { uint8_t tag; int32_t value; };
//
// tag == 0 means success (read .value); a non-zero tag means an error occurred.
// At a call site the value is bound with `as result` and the error is dealt
// with in a following `check` block:
//
//	let x = getInt(2) as result;   // run the call, keep the result struct
//	check result { return 1; }     // on error, divert; otherwise fall through
//	// ... x is now usable
//
// which lowers to:
//
//	delta_result_i32 __delta_result_0 = getInt(2);
//	if (__delta_result_0.tag != 0) { return 1; }
//	const int32_t x = __delta_result_0.value;   // committed AFTER the check
//
// The binding (x) is declared only after the check, mirroring the analyzer's
// rule that a pending result cannot be used until it has been checked.

// resultTypeName returns the delta_result_* C name for a success type. An empty
// (or void) success type uses the shared payload-less delta_result_void.
func resultTypeName(deltaType string) string {
	if deltaType == "" || deltaType == "void" {
		return "delta_result_void"
	}
	return "delta_result_" + typeCode(deltaType)
}

// requireResultType registers the result struct for a success type (once) and
// returns its C name.
func (e *Emitter) requireResultType(deltaType string) string {
	if e.resultTypes == nil {
		e.resultTypes = map[string]string{}
	}
	name := resultTypeName(deltaType)
	if name == "delta_result_void" {
		deltaType = ""
	}
	e.resultTypes[name] = deltaType
	return name
}

// addResultHelper registers an `as result` helper body under its name (once).
func (e *Emitter) addResultHelper(name, body string) string {
	if e.resultHelpers == nil {
		e.resultHelpers = map[string]string{}
	}
	if _, ok := e.resultHelpers[name]; !ok {
		e.resultHelpers[name] = body
	}
	return name
}

// emitFallibleExpression lowers the expression behind an `as result` into a C
// expression that evaluates to a result struct, plus the success type it
// carries.
func (e *Emitter) emitFallibleExpression(expr ast.Expression) (string, string) {
	switch expr := expr.(type) {
	case ast.NewExpression:
		inner := ""
		if expr.Type != nil {
			inner = typeRefName(*expr.Type)
		} else {
			inner = e.inferType(expr.Value)
		}
		return e.emitExpr(expr, "heap<"+inner+">", ExprContext{Fallible: true}), "heap<" + inner + ">"

	case ast.FunctionCallExpression:
		if callee, ok := expr.Callee.(ast.Identifier); ok {
			// (a) A call to a fallible function already returns a result struct.
			if e.funcFallible[callee.Name] {
				return e.emitExpr(expr, "", ExprContext{}), e.funcReturns[callee.Name]
			}
			// (b) A conversion taken as a result, e.g. int8(x) as r.
			if isConversionType(callee.Name) {
				from := e.inferType(expr.Arguments[0])
				to := callee.Name
				name := e.convResultHelper(from, to)
				return fmt.Sprintf("%s(%s)", name, e.emitExpr(expr.Arguments[0], "", ExprContext{})), to
			}
		}

	case ast.BinaryExpression:
		// (c) A trapping operation taken as a result, e.g. a / b as r.
		t := e.inferType(expr.Left)
		if name, ok := e.binaryResultHelper(expr.Operator, t); ok {
			return fmt.Sprintf(
				"%s(%s, %s)",
				name, e.emitExpr(expr.Left, "", ExprContext{}), e.emitExpr(expr.Right, "", ExprContext{}),
			), t
		}
	}

	// Not a recognised fallible producer: emit it plainly. The analyzer should
	// have rejected this, so this is only a safe fallback.
	return e.emitExpr(expr, "", ExprContext{}), e.inferType(expr)
}

// emitFallible lowers a `<stmt> as result;` into the result-struct temp, and
// records the commit that the matching check block will run.
func (e *Emitter) emitFallible(stmt ast.FallibleStatement, context *BlockContext) string {
	// Step 1: find the expression that produces the fallible value.
	var inner ast.Expression
	switch s := stmt.Inner.(type) {
	case ast.VariableDeclarationStatement:
		inner = s.Value
	case ast.AssignmentStatement:
		inner = s.Value
	case ast.ExpressionStatement:
		inner = s.Value
	}

	// Step 2: lower it to a result-producing C expression and its success type.
	valueC, successType := e.emitFallibleExpression(inner)
	resultName := e.requireResultType(successType)

	// Step 3: store the result struct in a fresh temp.
	temp := fmt.Sprintf("__delta_result_%d", e.resultCounter)
	e.resultCounter++

	// Step 4: work out the statement that commits the success value. It is run
	// after the check passes, so the bound name does not exist on the error
	// path.
	commit := ""
	switch s := stmt.Inner.(type) {
	case ast.VariableDeclarationStatement:
		e.localTypes[s.Name] = successType
		if context != nil && e.needsDrop(successType) {
			e.owners[context.block] = append(
				e.owners[context.block], &owned{n: s.Name, t: successType},
			)
		}
		declType := e.cType(successType)
		if !s.Mutable {
			if isHeapName(successType) {
				declType += " const"
			} else {
				declType = "const " + declType
			}
		}
		commit = fmt.Sprintf(
			"%s %s = %s.value;",
			declType, s.Name, temp,
		)
	case ast.AssignmentStatement:
		target := s.Target.Name
		if _, ok := s.TargetExpression.(ast.MemberAccessExpression); ok {
			target = e.emitExpr(s.TargetExpression, "", ExprContext{})
		}
		commit = fmt.Sprintf("%s = %s.value;", target, temp)
	}

	// Step 5: remember the temp and commit, keyed by the result name, so the
	// check block can find them.
	if e.pendingResults == nil {
		e.pendingResults = map[string]pendingResult{}
	}
	e.pendingResults[stmt.Result.Name] = pendingResult{Temp: temp, Commit: commit}

	// Step 6: emit the temp declaration.
	return e.pad() + resultName + " " + temp + " = " + valueC + ";"
}

// emitCheck lowers a `check result { ... }` into the tag test plus the deferred
// commit of the success value.
func (e *Emitter) emitCheck(stmt ast.CheckStatement) string {
	pending, ok := e.pendingResults[stmt.Result.Name]
	if !ok {
		return ""
	}

	// Step 1: take the error branch when the tag is non-zero.
	out := e.pad() + "if (" + pending.Temp + ".tag != 0)" + e.emitBlock(stmt.Body, nil)

	// Step 2: once the error path is ruled out, commit the success value.
	if pending.Commit != "" {
		out += "\n" + e.pad() + pending.Commit
	}

	delete(e.pendingResults, stmt.Result.Name)
	return out
}

// --- `as result` helper bodies ---------------------------------------------
// These mirror the trapping helpers in traps.go, but instead of panicking they
// return the tagged result struct so the caller can handle the failure.

func (e *Emitter) convResultHelper(from, to string) string {
	resultName := e.requireResultType(to)
	name := "delta_rt_conv_" + typeCode(from) + "_to_" + typeCode(to) + "_result"
	cond, _ := convCheck(from, to)
	body := fmt.Sprintf(
		`static inline %s %s(%s v) {
	if (%s) return (%s){ .tag = 1 };
	return (%s){ .tag = 0, .value = (%s)v };
}`,
		resultName, name, e.cType(from), cond, resultName, resultName, e.cType(to),
	)
	return e.addResultHelper(name, body)
}

// binaryResultHelper returns the `as result` helper name for a trapping binary
// operation, or ok == false if the operator is not a trapping one.
func (e *Emitter) binaryResultHelper(op, t string) (string, bool) {
	resultName := e.requireResultType(t)
	ct := e.cType(t)

	switch op {
	case "/", "%":
		name := "delta_rt_" + divVerb(op) + "_" + typeCode(t) + "_result"
		body := fmt.Sprintf(
			`static inline %s %s(%s a, %s b) {
	if (b == 0) return (%s){ .tag = 1 };
	return (%s){ .tag = 0, .value = a %s b };
}`,
			resultName, name, ct, ct, resultName, resultName, op,
		)
		return e.addResultHelper(name, body), true

	case "<<", ">>":
		cond := fmt.Sprintf("b >= %d", bitWidth(t))
		if isSignedName(t) {
			cond = "b < 0 || " + cond
		}
		name := "delta_rt_" + shiftVerb(op) + "_" + typeCode(t) + "_result"
		body := fmt.Sprintf(
			`static inline %s %s(%s a, %s b) {
	if (%s) return (%s){ .tag = 1 };
	return (%s){ .tag = 0, .value = a %s b };
}`,
			resultName, name, ct, ct, cond, resultName, resultName, op,
		)
		return e.addResultHelper(name, body), true

	case "+", "-", "*":
		name := "delta_rt_" + arithVerb(op) + "_" + typeCode(t) + "_result"
		body := fmt.Sprintf(
			`static inline %s %s(%s a, %s b) {
	%s value;
	if (%s(a, b, &value)) return (%s){ .tag = 1 };
	return (%s){ .tag = 0, .value = value };
}`,
			resultName, name, ct, ct, ct, builtinOverflow(op), resultName, resultName,
		)
		return e.addResultHelper(name, body), true
	}

	return "", false
}

// --- preamble rendering ----------------------------------------------------

// emitResultTypes renders the delta_result_* struct typedefs, sorted by name
// for stable output.
func (e *Emitter) emitResultTypes() string {
	names := make([]string, 0, len(e.resultTypes))
	for name := range e.resultTypes {
		names = append(names, name)
	}
	sort.Strings(names)

	var out string
	for _, name := range names {
		deltaType := e.resultTypes[name]
		out += "typedef struct " + name + " {\n\tuint8_t tag;\n"
		if deltaType != "" {
			out += "\t" + e.cType(deltaType) + " value;\n"
		}
		out += "} " + name + ";\n\n"
	}
	return out
}
