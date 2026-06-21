package lsp

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"strings"
	"testing"

	"delta/internal/pipeline"
	"delta/internal/semantics"
)

func TestCallAtTracksActiveParameter(t *testing.T) {
	source := []byte("let value = connect(host, nested(1, 2), po")
	name, active, ok := callAt(source, Position{Line: 0, Character: len(source)})
	if !ok || name != "connect" || active != 2 {
		t.Fatalf("callAt = %q, %d, %v", name, active, ok)
	}
}

func TestFunctionCompletionUsesParameterSnippets(t *testing.T) {
	item := symbolToCompletion(semantics.Symbol{
		Name: "connect",
		Kind: semantics.SymbolFunction,
		Signature: &semantics.FunctionSignature{
			ParameterNames: []string{"host", "port"},
			Parameters: []semantics.Type{
				{Name: "string", Kind: semantics.TypeString},
				{Name: "uint16", Kind: semantics.TypeUInt16},
			},
		},
	})
	if item.InsertText != "connect(${1:host}, ${2:port})" {
		t.Fatalf("unexpected snippet: %q", item.InsertText)
	}
	if item.InsertTextFormat != InsertTextFormatSnippet {
		t.Fatalf("insertTextFormat = %d", item.InsertTextFormat)
	}
}

func TestCompletionContexts(t *testing.T) {
	if got := completionContextAt([]byte("fun"), Position{Line: 0, Character: 3}); got != completionTopLevel {
		t.Fatalf("top-level context = %v", got)
	}
	source := []byte("function main(): void {\n    ret\n}")
	if got := completionContextAt(source, Position{Line: 1, Character: 7}); got != completionStatement {
		t.Fatalf("statement context = %v", got)
	}
}

func TestPendingResultCompletion(t *testing.T) {
	source := []byte("work() as first;\nother() as second;\ncheck sec")
	items, ok := pendingResultCompletions(source, Position{Line: 2, Character: len("check sec")})
	if !ok || len(items) != 2 || items[0].Label != "second" {
		t.Fatalf("items = %+v, ok = %v", items, ok)
	}
}

func TestObjectLiteralCompletionOmitsPresentFields(t *testing.T) {
	complete := []byte(`
type User = { name: string; age: int32; };
function main(): void {
    let user: User = { name: "Ada", age: 37 };
}
`)
	result := pipeline.Compile("test.delta", complete)
	if len(result.ErrorBag.Errors) != 0 {
		t.Fatalf("compile errors: %+v", result.ErrorBag.Errors)
	}
	incomplete := []byte(`
type User = { name: string; age: int32; };
function main(): void {
    let user: User = { name: "Ada",
}
`)
	st := &docState{contents: incomplete, lastGood: result}
	items, ok := objectLiteralCompletions(st, Position{Line: 3, Character: len(`    let user: User = { name: "Ada",`)})
	if !ok || len(items) != 1 || items[0].Label != "age" {
		t.Fatalf("items = %+v, ok = %v", items, ok)
	}
}

func TestMemberFieldNavigationUsesResolvedRecord(t *testing.T) {
	source := []byte(`
type User = { name: string; };
function main(): string {
    let user: User = { name: "Ada" };
    return user.name;
}
`)
	result := pipeline.Compile("test.delta", source)
	if len(result.ErrorBag.Errors) != 0 {
		t.Fatalf("compile errors: %+v", result.ErrorBag.Errors)
	}
	_, field, ok := memberFieldAt(result, Position{Line: 4, Character: len("    return user.na")})
	if !ok || field.Name != "name" || field.Type.String() != "string" {
		t.Fatalf("field = %+v, ok = %v", field, ok)
	}
}

func TestSignatureHelpHandler(t *testing.T) {
	source := []byte(`
function add(left: int32, right: int32): int32 {
    return left + right;
}
function main(): int32 {
    return add(1, 2);
}
`)
	result := pipeline.Compile("file:///test.delta", source)
	if len(result.ErrorBag.Errors) != 0 {
		t.Fatalf("compile errors: %+v", result.ErrorBag.Errors)
	}
	var output bytes.Buffer
	server := &Server{
		out: &output,
		log: log.New(io.Discard, "", 0),
		documents: map[string]*docState{
			"file:///test.delta": {contents: source, result: result, lastGood: result},
		},
	}
	params, _ := json.Marshal(TextDocumentPositionParams{
		TextDocument: TextDocumentIdentifier{URI: "file:///test.delta"},
		Position:     Position{Line: 5, Character: len("    return add(1, ")},
	})
	server.handleSignatureHelp(&Message{
		JSONRPC: "2.0",
		ID:      json.RawMessage("1"),
		Params:  params,
	})
	body := frameBody(t, output.Bytes())
	var response struct {
		Result SignatureHelp `json:"result"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatal(err)
	}
	if response.Result.ActiveParameter != 1 {
		t.Fatalf("active parameter = %d", response.Result.ActiveParameter)
	}
	if got := response.Result.Signatures[0].Label; !strings.Contains(got, "left: int32, right: int32") {
		t.Fatalf("signature label = %q", got)
	}
}

func frameBody(t *testing.T, frame []byte) []byte {
	t.Helper()
	parts := bytes.SplitN(frame, []byte("\r\n\r\n"), 2)
	if len(parts) != 2 {
		t.Fatalf("invalid frame: %q", frame)
	}
	return parts[1]
}
