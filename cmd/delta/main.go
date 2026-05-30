package main

import (
	"delta/internal/ast"
	"delta/internal/token"
	"delta/internal/tokenizer"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: delta <command>")
		os.Exit(2)
	}

	switch os.Args[1] {
	case "build":
		runBuild(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		os.Exit(2)
	}
}

func runBuild(args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "missing file path")
		os.Exit(2)
	}

	sourcePath := args[0]
	if filepath.Ext(sourcePath) != ".delta" {
		fmt.Fprintln(os.Stderr, "invalid extension: must be .delta")
		os.Exit(2)
	}

	contents, err := os.ReadFile(sourcePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read %s: %v\n", sourcePath, err)
		os.Exit(1)
	}

	tokens, err := tokenizer.Tokenize(string(contents))
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to tokenize %s: %v\n", sourcePath, err)
		os.Exit(1)
	}

	parser := ast.Parser{Tokens: tokens, Position: 0}
	file, err := parser.Parse()

	if err != nil {
		fmt.Println(err.Error())
		return
	}

	fmt.Println(ast.FormatAST(file))
}

func printTokens(tokens []token.Token) {
	for _, tok := range tokens {
		fmt.Printf(
			"%d:%d\t%s\t%q\n",
			tok.Line,
			tok.Column,
			tok.Kind,
			tok.Lexeme,
		)
	}
}
