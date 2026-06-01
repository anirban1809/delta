package ast

import (
	"fmt"
	"strings"
)

func FormatAST(file File) string {
	var out strings.Builder
	out.WriteString("File\n")

	for _, declaration := range file.Declarations {
		formatDeclaration(&out, declaration, 1)
	}

	return out.String()
}

func formatDeclaration(
	out *strings.Builder,
	declaration Declaration,
	depth int,
) {
	switch declaration := declaration.(type) {
	case Comment:
		formatComment(out, declaration, depth)
	case *Comment:
		formatComment(out, *declaration, depth)
	case FunctionDeclaration:
		formatFunctionDeclaration(out, declaration, depth)
	case *FunctionDeclaration:
		formatFunctionDeclaration(out, *declaration, depth)
	case ConstDeclaration:
		formatConstDeclaration(out, declaration, depth)
	case *ConstDeclaration:
		formatConstDeclaration(out, *declaration, depth)
	default:
		writeLine(out, depth, "UnknownDeclaration")
	}
}

func formatComment(out *strings.Builder, comment Comment, depth int) {
	kind := "LineComment"
	if comment.Multiline {
		kind = "BlockComment"
	}

	writeLine(out, depth, "%s text=%q", kind, comment.Text)
}

func formatConstDeclaration(
	out *strings.Builder,
	declaration ConstDeclaration,
	depth int,
) {
	writeLine(out, depth, "ConstDeclaration")
	writeLine(out, depth+1, "Name")
	formatExpression(out, declaration.Name, depth+2)
	if declaration.Type.Name.Name != "" {
		writeLine(out, depth+1, "Type")
		formatExpression(out, declaration.Type.Name, depth+2)
	}
	writeLine(out, depth+1, "Value")
	formatExpression(out, declaration.Value, depth+2)
}

func formatFunctionDeclaration(
	out *strings.Builder,
	declaration FunctionDeclaration,
	depth int,
) {
	writeLine(
		out,
		depth,
		"FunctionDeclaration name=%q",
		declaration.Name,
	)
	writeLine(out, depth+1, "Parameters")
	for index, parameter := range declaration.Parameters {
		writeLine(out, depth+2, "Parameter %d", index)
		writeLine(out, depth+3, "Name")
		formatExpression(out, parameter.Name, depth+4)
		writeLine(out, depth+3, "Type")
		formatExpression(out, parameter.Type.Name, depth+4)
	}

	writeLine(out, depth+1, "ReturnTypes")
	formatTypeReferences(out, declaration.ReturnTypes, depth+2)

	if len(declaration.ErrorTypes) > 0 {
		writeLine(out, depth+1, "ErrorTypes")
		formatTypeReferences(out, declaration.ErrorTypes, depth+2)
	}

	if declaration.Body == nil {
		writeLine(out, depth+1, "Body <nil>")
		return
	}

	formatBlockStatement(out, declaration.Body, depth+1)
}

func formatTypeReferences(
	out *strings.Builder,
	types []TypeReference,
	depth int,
) {
	for index, typ := range types {
		writeLine(out, depth, "Type %d", index)
		formatExpression(out, typ.Name, depth+1)
	}
}

func formatBlockStatement(
	out *strings.Builder,
	block *BlockStatement,
	depth int,
) {
	writeLine(out, depth, "BlockStatement")

	for _, statement := range block.Statements {
		formatStatement(out, statement, depth+1)
	}
}

func formatStatement(out *strings.Builder, statement Statement, depth int) {
	switch statement := statement.(type) {
	case Comment:
		formatComment(out, statement, depth)
	case *Comment:
		formatComment(out, *statement, depth)
	case ReturnStatement:
		writeLine(out, depth, "ReturnStatement")
		for index, value := range statement.Values {
			writeLine(out, depth+1, "Value %d", index)
			formatExpression(out, value, depth+2)
		}
	case VariableDeclarationStatement:
		kind := "const"
		if statement.Mutable {
			kind = "let"
		}

		writeLine(
			out,
			depth,
			"VariableDeclarationStatement kind=%q name=%q",
			kind,
			statement.Name,
		)
		if statement.Type.Name.Name != "" {
			writeLine(out, depth+1, "Type")
			formatExpression(out, statement.Type.Name, depth+2)
		}
		writeLine(out, depth+1, "Value")
		formatExpression(out, statement.Value, depth+2)
	case ExpressionStatement:
		writeLine(out, depth, "ExpressionStatement")
		formatExpression(out, statement.Value, depth+1)
	case AssignmentStatement:
		writeLine(out, depth, "AssignmentStatement")
		writeLine(out, depth+1, "Target")
		formatExpression(out, statement.Target, depth+2)
		writeLine(out, depth+1, "Value")
		formatExpression(out, statement.Value, depth+2)
	case IfStatement:
		writeLine(out, depth, "IfStatement")
		writeLine(out, depth+1, "Condition")
		formatExpression(out, statement.Condition, depth+2)
		writeLine(out, depth+1, "Then")
		formatBlockStatement(out, &statement.ThenBlock, depth+2)
		if len(statement.ElseBlock.Statements) > 0 {
			writeLine(out, depth+1, "Else")
			formatBlockStatement(out, &statement.ElseBlock, depth+2)
		}
	case WhileStatement:
		writeLine(out, depth, "WhileStatement")
		writeLine(out, depth+1, "Condition")
		formatExpression(out, statement.Condition, depth+2)
		writeLine(out, depth+1, "Body")
		formatBlockStatement(out, &statement.Body, depth+2)
	default:
		writeLine(out, depth, "UnknownStatement")
	}
}

func formatExpression(out *strings.Builder, expression Expression, depth int) {
	switch expression := expression.(type) {
	case UnaryExpression:
		writeLine(out, depth, "UnaryExpression operator=%q", expression.Operator)
		writeLine(out, depth+1, "Expression")
		formatExpression(out, expression.Expression, depth+2)
	case BinaryExpression:
		writeLine(out, depth, "BinaryExpression operator=%q", expression.Operator)
		writeLine(out, depth+1, "Left")
		formatExpression(out, expression.Left, depth+2)
		writeLine(out, depth+1, "Right")
		formatExpression(out, expression.Right, depth+2)
	case FunctionCallExpression:
		writeLine(out, depth, "FunctionCallExpression")
		writeLine(out, depth+1, "Callee")
		formatExpression(out, expression.Callee, depth+2)
		writeLine(out, depth+1, "Arguments")
		for index, argument := range expression.Arguments {
			writeLine(out, depth+2, "Argument %d", index)
			formatExpression(out, argument, depth+3)
		}
	case IntegerLiteral:
		writeLine(out, depth, "IntegerLiteral value=%q", expression.Value)
	case BooleanLiteral:
		writeLine(out, depth, "BooleanLiteral value=%q", expression.Value)
	case StringLiteral:
		writeLine(out, depth, "StringLiteral value=%q", expression.Value)
	case CharacterLiteral:
		writeLine(out, depth, "CharacterLiteral value=%q", expression.Value)
	case Identifier:
		writeLine(out, depth, "Identifier name=%q", expression.Name)
	default:
		writeLine(out, depth, "UnknownExpression")
	}
}

func writeLine(out *strings.Builder, depth int, format string, args ...any) {
	out.WriteString(strings.Repeat("  ", depth))
	fmt.Fprintf(out, format, args...)
	out.WriteByte('\n')
}
