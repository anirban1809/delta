package lsp

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"delta/internal/analyzer"
	"delta/internal/ast"
	"delta/internal/pipeline"
)

func TestCallAtTracksActiveParameter(t *testing.T) {
	source := []byte("let value = connect(host, nested(1, 2), po")
	name, active, ok := callAt(source, Position{Line: 0, Character: len(source)})
	if !ok || name != "connect" || active != 2 {
		t.Fatalf("callAt = %q, %d, %v", name, active, ok)
	}
}

func TestFunctionCompletionUsesParameterSnippets(t *testing.T) {
	item := symbolToCompletion(analyzer.Symbol{
		Name: "connect",
		Kind: analyzer.SymbolFunction,
		Signature: &analyzer.FunctionSignature{
			ParameterNames: []string{"host", "port"},
			Parameters: []analyzer.Type{
				{Name: "string", Kind: analyzer.TypeString},
				{Name: "uint16", Kind: analyzer.TypeUInt16},
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
	source := []byte("function main() {\n    ret\n}")
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
function main() {
    let user: User = { name: "Ada", age: 37 };
}
`)
	result := pipeline.Compile("test.delta", complete)
	if len(result.ErrorBag.Errors) != 0 {
		t.Fatalf("compile errors: %+v", result.ErrorBag.Errors)
	}
	incomplete := []byte(`
type User = { name: string; age: int32; };
function main() {
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
		Position:     astPositionFor(source, "2);"),
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

func TestLSPMultiFileCompletionAndDefinition(t *testing.T) {
	dir := t.TempDir()
	mainPath := filepath.Join(dir, "main.delta")
	utilPath := filepath.Join(dir, "util.delta")
	util := []byte(`export function add(left: int32, right: int32): int32 {
	return left + right;
}
`)
	main := []byte(`import { add } from "./util";

function main(): int32 {
	return add(1, 2);
}
`)
	if err := os.WriteFile(utilPath, util, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(mainPath, main, 0o644); err != nil {
		t.Fatal(err)
	}

	mainURI := uriFromPath(mainPath)
	utilURI := uriFromPath(utilPath)
	var output bytes.Buffer
	server := &Server{
		out:                  &output,
		log:                  log.New(io.Discard, "", 0),
		documents:            map[string]*docState{},
		publishedDiagnostics: map[string]bool{},
	}
	server.documents[utilURI] = &docState{contents: util, path: utilPath}
	server.documents[mainURI] = &docState{contents: main, path: mainPath}
	server.analyzeAndPublish(mainURI)

	st := server.documents[mainURI]
	if st == nil || st.result == nil {
		t.Fatal("main document was not analyzed")
	}
	astPos := astPositionFor(main, "add(1")
	sym, ok := lookupAtPosition(
		st.result.RootScope,
		ast.Position{Line: astPos.Line + 1, Column: astPos.Character + 1},
		"add",
	)
	if !ok || sym.Kind != analyzer.SymbolFunction {
		t.Fatalf("imported add not visible in scope: %+v, %v", sym, ok)
	}

	output.Reset()
	completionParams, _ := json.Marshal(CompletionParams{
		TextDocument: TextDocumentIdentifier{URI: mainURI},
		Position:     astPositionFor(main, "add(1"),
	})
	server.handleCompletion(&Message{
		JSONRPC: "2.0",
		ID:      json.RawMessage("1"),
		Params:  completionParams,
	})
	completionBody := frameBody(t, output.Bytes())
	var completionResponse struct {
		Result CompletionList `json:"result"`
	}
	if err := json.Unmarshal(completionBody, &completionResponse); err != nil {
		t.Fatal(err)
	}
	if !completionLabels(completionResponse.Result.Items)["add"] {
		t.Fatalf("completion items missing imported add: %+v", completionResponse.Result.Items)
	}

	output.Reset()
	params, _ := json.Marshal(DefinitionParams{
		TextDocument: TextDocumentIdentifier{URI: mainURI},
		Position:     astPos,
	})
	server.handleDefinition(&Message{
		JSONRPC: "2.0",
		ID:      json.RawMessage("1"),
		Params:  params,
	})
	body := frameBody(t, output.Bytes())
	var defResponse struct {
		Result []Location `json:"result"`
	}
	if err := json.Unmarshal(body, &defResponse); err != nil {
		t.Fatal(err)
	}
	if len(defResponse.Result) != 1 || defResponse.Result[0].URI != utilURI {
		t.Fatalf("definition = %+v, want util URI %s", defResponse.Result, utilURI)
	}
}

func TestLSPMultiFileImportDiagnostics(t *testing.T) {
	dir := t.TempDir()
	mainPath := filepath.Join(dir, "main.delta")
	utilPath := filepath.Join(dir, "util.delta")
	util := []byte(`function hidden(): int32 {
	return 1;
}
`)
	main := []byte(`import { hidden } from "./util";

function main(): int32 {
	return 0;
}
`)
	if err := os.WriteFile(utilPath, util, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(mainPath, main, 0o644); err != nil {
		t.Fatal(err)
	}

	mainURI := uriFromPath(mainPath)
	utilURI := uriFromPath(utilPath)
	var output bytes.Buffer
	server := &Server{
		out:                  &output,
		log:                  log.New(io.Discard, "", 0),
		documents:            map[string]*docState{},
		publishedDiagnostics: map[string]bool{},
	}
	server.documents[utilURI] = &docState{contents: util, path: utilPath}
	server.documents[mainURI] = &docState{contents: main, path: mainPath}
	server.analyzeAndPublish(mainURI)

	messages := framedMessages(t, output.Bytes())
	found := false
	for _, msg := range messages {
		if msg.Method != "textDocument/publishDiagnostics" {
			continue
		}
		var params PublishDiagnosticsParams
		if err := json.Unmarshal(msg.Params, &params); err != nil {
			t.Fatal(err)
		}
		if params.URI != mainURI {
			continue
		}
		for _, diag := range params.Diagnostics {
			if strings.Contains(diag.Message, "hidden is not exported") {
				found = true
			}
		}
	}
	if !found {
		t.Fatalf("missing non-exported import diagnostic in frames: %+v", messages)
	}
}

func TestMethodCompletionUsesReceiverType(t *testing.T) {
	source := []byte(`
type Counter = { value: int32; };

function (c: edit &Counter) add(n: int32) {
    c.value = c.value + n;
}

function (c: &Counter) get(): int32 {
    return c.value;
}

function main(): int32 {
    let c: Counter = { value: 1 };
    return c.value;
}
`)
	result := pipeline.Compile("test.delta", source)
	if len(result.ErrorBag.Errors) != 0 {
		t.Fatalf("compile errors: %+v", result.ErrorBag.Errors)
	}
	st := &docState{contents: source, result: result, lastGood: result}
	items := (&Server{}).fieldCompletions(st, []string{"c"}, Position{Line: 12, Character: len("    return c.")})
	labels := map[string]bool{}
	for _, item := range items {
		labels[item.Label] = true
	}
	for _, want := range []string{"value", "add", "get"} {
		if !labels[want] {
			t.Fatalf("missing completion %q in %+v", want, items)
		}
	}
}

func TestMemberCompletionRepairsTrailingDotWithoutLastGood(t *testing.T) {
	source := []byte(`
type Counter = { value: int32; };

function (c: edit &Counter) add(n: int32) {
    c.value = c.value + n;
}

function main(): int32 {
    let c: Counter = { value: 1 };
    return c.
}
`)
	result := pipeline.Compile("test.delta", source)
	if !pipeline.HasParseErrors(result) {
		t.Fatalf("expected trailing-dot source to have parse errors")
	}
	st := &docState{contents: source, result: result}
	items := (&Server{}).fieldCompletions(st, []string{"c"}, Position{Line: 9, Character: len("    return c.")})
	labels := map[string]bool{}
	for _, item := range items {
		labels[item.Label] = true
	}
	for _, want := range []string{"value", "add"} {
		if !labels[want] {
			t.Fatalf("missing completion %q in %+v", want, items)
		}
	}
}

func TestMemberCompletionPrefersRepairedCurrentDocumentOverStaleLastGood(t *testing.T) {
	lastGoodSource := []byte(`
type Handle = {
    value: int32;
};

function (h: edit &Handle) Extend() {
    h.value = 34;
}

function main(): int32{
    const c: Handle = {value: 23};
    return 0;
}
`)
	lastGood := pipeline.Compile("test.delta", lastGoodSource)
	if len(lastGood.ErrorBag.Errors) != 0 {
		t.Fatalf("compile errors: %+v", lastGood.ErrorBag.Errors)
	}
	current := []byte(`
type Handle = {
    value: int32;
};

function (h: edit &Handle) Extend() {
    h.value = 34;
}

function main(): int32{
    const c: Handle = {value: 23};
    c.
    return 0;
}
`)
	result := pipeline.Compile("test.delta", current)
	if !pipeline.HasParseErrors(result) {
		t.Fatalf("expected trailing-dot source to have parse errors")
	}
	st := &docState{contents: current, result: result, lastGood: lastGood}
	items := (&Server{}).fieldCompletions(st, []string{"c"}, Position{Line: 11, Character: len("    c.")})
	labels := map[string]bool{}
	for _, item := range items {
		labels[item.Label] = true
	}
	for _, want := range []string{"value", "Extend"} {
		if !labels[want] {
			t.Fatalf("missing completion %q in %+v", want, items)
		}
	}
}

func TestCompletionHandlerReturnsMembersForTypedBindingTrailingDot(t *testing.T) {
	lastGoodSource := []byte(`
type Handle = {
    value: int32;
};

function (h: edit &Handle) Extend() {
    h.value = 34;
}

function main(): int32{
    const c: Handle = {value: 23};
    return 0;
}
`)
	lastGood := pipeline.Compile("file:///test.delta", lastGoodSource)
	if len(lastGood.ErrorBag.Errors) != 0 {
		t.Fatalf("compile errors: %+v", lastGood.ErrorBag.Errors)
	}
	current := []byte(`
type Handle = {
    value: int32;
};

function (h: edit &Handle) Extend() {
    h.value = 34;
}

function main(): int32{
    const c: Handle = {value: 23};
    c.
    return 0;
}
`)
	result := pipeline.Compile("file:///test.delta", current)
	if !pipeline.HasParseErrors(result) {
		t.Fatalf("expected trailing-dot source to have parse errors")
	}
	server, output := testServer("file:///test.delta", current, result)
	server.documents["file:///test.delta"].lastGood = lastGood
	params, _ := json.Marshal(CompletionParams{
		TextDocument: TextDocumentIdentifier{URI: "file:///test.delta"},
		Position:     Position{Line: 11, Character: len("    c.")},
	})
	server.handleCompletion(&Message{
		JSONRPC: "2.0",
		ID:      json.RawMessage("1"),
		Params:  params,
	})
	var response struct {
		Result CompletionList `json:"result"`
	}
	if err := json.Unmarshal(frameBody(t, output.Bytes()), &response); err != nil {
		t.Fatal(err)
	}
	labels := map[string]bool{}
	for _, item := range response.Result.Items {
		labels[item.Label] = true
	}
	for _, want := range []string{"value", "Extend"} {
		if !labels[want] {
			t.Fatalf("missing completion %q in %+v", want, response.Result.Items)
		}
	}
}

func TestCompletionHandlerReturnsMembersForHeapBindingTrailingDot(t *testing.T) {
	current := []byte(`
type Handle = {
    value: int32;
};

function (h: edit &Handle) Extend() {
    h.value = 34;
}

function main(): int32{
    let h: heap<Handle>;
    h.
    return 0;
}
`)
	result := pipeline.Compile("file:///test.delta", current)
	if !pipeline.HasParseErrors(result) {
		t.Fatalf("expected trailing-dot source to have parse errors")
	}
	server, output := testServer("file:///test.delta", current, result)
	params, _ := json.Marshal(CompletionParams{
		TextDocument: TextDocumentIdentifier{URI: "file:///test.delta"},
		Position:     Position{Line: 11, Character: len("    h.")},
	})
	server.handleCompletion(&Message{
		JSONRPC: "2.0",
		ID:      json.RawMessage("1"),
		Params:  params,
	})
	var response struct {
		Result CompletionList `json:"result"`
	}
	if err := json.Unmarshal(frameBody(t, output.Bytes()), &response); err != nil {
		t.Fatal(err)
	}
	labels := map[string]bool{}
	for _, item := range response.Result.Items {
		labels[item.Label] = true
	}
	for _, want := range []string{"value", "Extend"} {
		if !labels[want] {
			t.Fatalf("missing completion %q in %+v", want, response.Result.Items)
		}
	}
}

func TestMethodSignatureHelpHandler(t *testing.T) {
	source := []byte(`
type Counter = { value: int32; };

function (c: edit &Counter) add(n: int32) {
    c.value = c.value + n;
}

function main(): int32 {
    let c: Counter = { value: 1 };
    c.add(5);
    return c.value;
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
		Position:     Position{Line: 9, Character: len("    c.add(")},
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
	if got := response.Result.Signatures[0].Label; !strings.Contains(got, "function (c: edit &Counter) add(n: int32)") {
		t.Fatalf("signature label = %q", got)
	}
}

func TestReceiverMethodCallHoverAndDefinition(t *testing.T) {
	source := []byte(`
type Counter = { value: int32; };

function (c: edit &Counter) add(n: int32) {
    c.value = c.value + n;
}

function main(): int32 {
    let c: Counter = { value: 1 };
    c.add(5);
    return c.value;
}
`)
	result := pipeline.Compile("file:///test.delta", source)
	if len(result.ErrorBag.Errors) != 0 {
		t.Fatalf("compile errors: %+v", result.ErrorBag.Errors)
	}
	server, output := testServer("file:///test.delta", source, result)
	callLine := 9
	callCol := strings.Index(lineAt(source, callLine), "add") + 1
	params, _ := json.Marshal(HoverParams{
		TextDocument: TextDocumentIdentifier{URI: "file:///test.delta"},
		Position:     Position{Line: callLine, Character: callCol},
	})
	server.handleHover(&Message{JSONRPC: "2.0", ID: json.RawMessage("1"), Params: params})
	var hoverResponse struct {
		Result Hover `json:"result"`
	}
	if err := json.Unmarshal(frameBody(t, output.Bytes()), &hoverResponse); err != nil {
		t.Fatal(err)
	}
	if got := hoverResponse.Result.Contents.Value; !strings.Contains(got, "function (c: edit &Counter) add(n: int32)") {
		t.Fatalf("hover = %q", got)
	}

	output.Reset()
	defParams, _ := json.Marshal(DefinitionParams{
		TextDocument: TextDocumentIdentifier{URI: "file:///test.delta"},
		Position:     Position{Line: callLine, Character: callCol},
	})
	server.handleDefinition(&Message{JSONRPC: "2.0", ID: json.RawMessage("2"), Params: defParams})
	var defResponse struct {
		Result []Location `json:"result"`
	}
	if err := json.Unmarshal(frameBody(t, output.Bytes()), &defResponse); err != nil {
		t.Fatal(err)
	}
	if len(defResponse.Result) != 1 || defResponse.Result[0].Range.Start.Line != 3 {
		t.Fatalf("definition locations = %+v", defResponse.Result)
	}

	output.Reset()
	semanticParams, _ := json.Marshal(SemanticTokensParams{
		TextDocument: TextDocumentIdentifier{URI: "file:///test.delta"},
	})
	server.handleSemanticTokens(&Message{JSONRPC: "2.0", ID: json.RawMessage("3"), Params: semanticParams})
	var semanticResponse struct {
		Result SemanticTokens `json:"result"`
	}
	if err := json.Unmarshal(frameBody(t, output.Bytes()), &semanticResponse); err != nil {
		t.Fatal(err)
	}
	if !hasSemanticToken(semanticResponse.Result.Data, callLine, callCol-1, len("add"), 1) {
		t.Fatalf("missing function semantic token for call add at %d:%d in %v", callLine, callCol-1, semanticResponse.Result.Data)
	}
}

func TestReceiverMethodDeclarationHover(t *testing.T) {
	source := []byte(`
type Counter = { value: int32; };

function (c: edit &Counter) add(n: int32) {
    c.value = c.value + n;
}
`)
	result := pipeline.Compile("file:///test.delta", source)
	if len(result.ErrorBag.Errors) != 0 {
		t.Fatalf("compile errors: %+v", result.ErrorBag.Errors)
	}
	server, output := testServer("file:///test.delta", source, result)
	params, _ := json.Marshal(HoverParams{
		TextDocument: TextDocumentIdentifier{URI: "file:///test.delta"},
		Position:     Position{Line: 3, Character: strings.Index(lineAt(source, 3), "add") + 1},
	})
	server.handleHover(&Message{
		JSONRPC: "2.0",
		ID:      json.RawMessage("1"),
		Params:  params,
	})
	body := frameBody(t, output.Bytes())
	var response struct {
		Result Hover `json:"result"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatal(err)
	}
	if got := response.Result.Contents.Value; !strings.Contains(got, "function (c: edit &Counter) add(n: int32)") {
		t.Fatalf("hover = %q", got)
	}
}

func TestReceiverMethodDeclarationSemanticToken(t *testing.T) {
	source := []byte(`
type Counter = { value: int32; };

function (c: edit &Counter) add(n: int32) {
    c.value = c.value + n;
}
`)
	result := pipeline.Compile("file:///test.delta", source)
	if len(result.ErrorBag.Errors) != 0 {
		t.Fatalf("compile errors: %+v", result.ErrorBag.Errors)
	}
	server, output := testServer("file:///test.delta", source, result)
	params, _ := json.Marshal(SemanticTokensParams{
		TextDocument: TextDocumentIdentifier{URI: "file:///test.delta"},
	})
	server.handleSemanticTokens(&Message{
		JSONRPC: "2.0",
		ID:      json.RawMessage("1"),
		Params:  params,
	})
	body := frameBody(t, output.Bytes())
	var response struct {
		Result SemanticTokens `json:"result"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatal(err)
	}
	methodLine := 3
	methodCol := strings.Index(lineAt(source, methodLine), "add")
	if !hasSemanticToken(response.Result.Data, methodLine, methodCol, len("add"), 1) {
		t.Fatalf("missing function semantic token for add at %d:%d in %v", methodLine, methodCol, response.Result.Data)
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

func framedMessages(t *testing.T, frames []byte) []Message {
	t.Helper()
	var out []Message
	rest := frames
	for len(rest) > 0 {
		header, bodyAndRest, ok := bytes.Cut(rest, []byte("\r\n\r\n"))
		if !ok {
			t.Fatalf("invalid frame stream: %q", rest)
		}
		length := -1
		for _, line := range bytes.Split(header, []byte("\r\n")) {
			name, value, ok := bytes.Cut(line, []byte(":"))
			if !ok {
				continue
			}
			if strings.EqualFold(strings.TrimSpace(string(name)), "content-length") {
				n, err := strconv.Atoi(strings.TrimSpace(string(value)))
				if err != nil {
					t.Fatal(err)
				}
				length = n
			}
		}
		if length < 0 || length > len(bodyAndRest) {
			t.Fatalf("bad frame length %d in %q", length, rest)
		}
		var msg Message
		if err := json.Unmarshal(bodyAndRest[:length], &msg); err != nil {
			t.Fatal(err)
		}
		out = append(out, msg)
		rest = bodyAndRest[length:]
	}
	return out
}

func astPositionFor(source []byte, needle string) Position {
	offset := bytes.Index(source, []byte(needle))
	if offset < 0 {
		return Position{}
	}
	line, col := 0, 0
	for _, b := range source[:offset] {
		if b == '\n' {
			line++
			col = 0
			continue
		}
		col++
	}
	return Position{Line: line, Character: col}
}

func completionLabels(items []CompletionItem) map[string]bool {
	out := map[string]bool{}
	for _, item := range items {
		out[item.Label] = true
	}
	return out
}

func testServer(uri string, source []byte, result *pipeline.Result) (*Server, *bytes.Buffer) {
	var output bytes.Buffer
	server := &Server{
		out: &output,
		log: log.New(io.Discard, "", 0),
		documents: map[string]*docState{
			uri: {contents: source, result: result, lastGood: result},
		},
	}
	return server, &output
}

func hasSemanticToken(data []uint32, wantLine, wantCol, wantLen, wantType int) bool {
	line, col := 0, 0
	for i := 0; i+4 < len(data); i += 5 {
		line += int(data[i])
		if data[i] == 0 {
			col += int(data[i+1])
		} else {
			col = int(data[i+1])
		}
		if line == wantLine && col == wantCol && int(data[i+2]) == wantLen && int(data[i+3]) == wantType {
			return true
		}
	}
	return false
}
