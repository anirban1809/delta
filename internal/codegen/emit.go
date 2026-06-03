package codegen

import (
	"delta/internal/ast"
	"delta/internal/diagnostics"
	"delta/internal/semantics"
	"errors"
	"fmt"
	"strings"
)

type Emitter struct {
	File         ast.File
	ErrorBag     *diagnostics.ErrorBag
	PositionRefs map[ast.Position]semantics.Symbol
	indent       int
}

func cType(t semantics.Type) (string, error) {
	switch t.Kind {
	case semantics.TypeVoid:
		return "void", nil
	case semantics.TypeBool:
		return "bool", nil
	case semantics.TypeInt32:
		return "int32_t", nil
	case semantics.TypeChar:
		return "char", nil
	}

	return "", errors.New("unsupported type for v0")
}

func (e *Emitter) Indent() string {
	var indents strings.Builder
	for range e.indent {
		indents.WriteString("\t")
	}

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
	case "==", "!=":
		return 3
	case "<", "<=", ">", ">=":
		return 4
	case "+", "-":
		return 5
	case "*", "/":
		return 6
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
	case ast.BooleanLiteral:
		finalExpr.WriteString(expr.Value)

	case ast.BinaryExpression:
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

	case ast.FunctionCallExpression:
		finalExpr.WriteString(e.EmitExpression(expr.Callee))
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
		finalStmt.WriteString(e.Indent() + stmt.Target.Name + " = ")
		finalStmt.WriteString(e.EmitExpression(stmt.Value) + ";")

	case ast.IfStatement:
		finalStmt.WriteString(e.Indent() + "if (")
		finalStmt.WriteString(e.EmitExpression(stmt.Condition))
		finalStmt.WriteString(")")
		finalStmt.WriteString(e.EmitBlockStatement(stmt.ThenBlock))

		if len(stmt.ElseBlock.Statements) > 0 {
			finalStmt.WriteString(" else")
			finalStmt.WriteString(e.EmitBlockStatement(stmt.ElseBlock))
		}
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

	final := fmt.Sprintf(`#include <stdint.h>
#include <stdbool.h>

%s
%s
%s
int main() { 
	return (int)delta_main();
}
`, fwdDecls.String(), constDecls.String(), funcDecls.String())
	return []byte(final)
}
