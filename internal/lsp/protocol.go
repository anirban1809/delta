package lsp

import "encoding/json"

// JSON-RPC 2.0 envelope. A single struct covers requests, responses, and
// notifications — the dispatcher splits on whether ID and Method are set.
//
// ID is json.RawMessage so we can echo it back unchanged (the spec allows
// strings, numbers, or null, and clients are picky about the original form).
type Message struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *ResponseError  `json:"error,omitempty"`
}

type ResponseError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// JSON-RPC error codes we care about.
const (
	ErrorCodeParseError     = -32700
	ErrorCodeInvalidRequest = -32600
	ErrorCodeMethodNotFound = -32601
	ErrorCodeInvalidParams  = -32602
	ErrorCodeInternalError  = -32603
)

// initialize

type InitializeParams struct {
	// Intentionally unused. The plan ignores everything the client sends.
}

type InitializeResult struct {
	Capabilities ServerCapabilities `json:"capabilities"`
	ServerInfo   ServerInfo         `json:"serverInfo"`
}

type ServerCapabilities struct {
	TextDocumentSync   TextDocumentSyncOptions `json:"textDocumentSync"`
	HoverProvider      bool                    `json:"hoverProvider,omitempty"`
	DefinitionProvider bool                    `json:"definitionProvider,omitempty"`
	CompletionProvider *CompletionOptions      `json:"completionProvider,omitempty"`
}

// CompletionOptions advertises completion. TriggerCharacters is empty in
// v1 — Delta has no `.`/`::` member access, so identifier characters
// (which the client triggers on by default) are sufficient.
type CompletionOptions struct {
	TriggerCharacters []string `json:"triggerCharacters,omitempty"`
	ResolveProvider   bool     `json:"resolveProvider"`
}

type TextDocumentSyncOptions struct {
	OpenClose bool `json:"openClose"`
	Change    int  `json:"change"` // 0=None, 1=Full, 2=Incremental
}

const (
	TextDocumentSyncNone        = 0
	TextDocumentSyncFull        = 1
	TextDocumentSyncIncremental = 2
)

type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// textDocument/did{Open,Change,Close}

type DidOpenTextDocumentParams struct {
	TextDocument TextDocumentItem `json:"textDocument"`
}

type DidChangeTextDocumentParams struct {
	TextDocument   VersionedTextDocumentIdentifier  `json:"textDocument"`
	ContentChanges []TextDocumentContentChangeEvent `json:"contentChanges"`
}

type DidCloseTextDocumentParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
}

type TextDocumentItem struct {
	URI        string `json:"uri"`
	LanguageID string `json:"languageId"`
	Version    int    `json:"version"`
	Text       string `json:"text"`
}

type VersionedTextDocumentIdentifier struct {
	URI     string `json:"uri"`
	Version int    `json:"version"`
}

type TextDocumentIdentifier struct {
	URI string `json:"uri"`
}

// Full-sync change events carry just the new text. Range/RangeLength are
// only set for incremental sync, which v0 doesn't advertise.
type TextDocumentContentChangeEvent struct {
	Text string `json:"text"`
}

// textDocument/publishDiagnostics

type PublishDiagnosticsParams struct {
	URI         string       `json:"uri"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

type Diagnostic struct {
	Range    Range              `json:"range"`
	Severity DiagnosticSeverity `json:"severity"`
	Source   string             `json:"source"`
	Message  string             `json:"message"`
}

type DiagnosticSeverity int

const (
	DiagnosticSeverityError       DiagnosticSeverity = 1
	DiagnosticSeverityWarning     DiagnosticSeverity = 2
	DiagnosticSeverityInformation DiagnosticSeverity = 3
	DiagnosticSeverityHint        DiagnosticSeverity = 4
)

type Range struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

// Position is 0-based. Character is a UTF-16 code unit offset per the LSP
// spec; safe for ASCII-only Delta source today (see lsp-v0 plan).
type Position struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

// textDocument/{hover,definition,completion}

type TextDocumentPositionParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
	Position     Position               `json:"position"`
}

type HoverParams = TextDocumentPositionParams

// Hover renders as a single MarkupContent block plus an optional range
// the client uses to underline the symbol under the cursor.
type Hover struct {
	Contents MarkupContent `json:"contents"`
	Range    *Range        `json:"range,omitempty"`
}

type MarkupContent struct {
	Kind  string `json:"kind"` // "markdown" or "plaintext"
	Value string `json:"value"`
}

type DefinitionParams = TextDocumentPositionParams

// Location names a region inside a document. v1 only ever emits the
// document the request came in on — multi-file resolution isn't on the
// roadmap until modules land.
type Location struct {
	URI   string `json:"uri"`
	Range Range  `json:"range"`
}

type CompletionParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
	Position     Position               `json:"position"`
	Context      *CompletionContext     `json:"context,omitempty"`
}

type CompletionContext struct {
	TriggerKind      int    `json:"triggerKind"`
	TriggerCharacter string `json:"triggerCharacter,omitempty"`
}

type CompletionItem struct {
	Label      string `json:"label"`
	Kind       int    `json:"kind"`                 // LSP CompletionItemKind enum
	Detail     string `json:"detail,omitempty"`     // signature / type
	SortText   string `json:"sortText,omitempty"`   // for ordering
	InsertText string `json:"insertText,omitempty"` // defaults to Label
}

type CompletionList struct {
	IsIncomplete bool             `json:"isIncomplete"`
	Items        []CompletionItem `json:"items"`
}

// LSP CompletionItemKind values we use. Full enum is 1..25; only these
// are meaningful for the language surface today.
const (
	CompletionItemKindFunction = 3
	CompletionItemKindVariable = 6
	CompletionItemKindKeyword  = 14
	CompletionItemKindConstant = 21
)
