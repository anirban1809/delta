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
	TextDocumentSync       TextDocumentSyncOptions `json:"textDocumentSync"`
	HoverProvider          bool                    `json:"hoverProvider,omitempty"`
	DefinitionProvider     bool                    `json:"definitionProvider,omitempty"`
	CompletionProvider     *CompletionOptions      `json:"completionProvider,omitempty"`
	SignatureHelpProvider  *SignatureHelpOptions   `json:"signatureHelpProvider,omitempty"`
	DocumentSymbolProvider bool                    `json:"documentSymbolProvider,omitempty"`
	ReferencesProvider     bool                    `json:"referencesProvider,omitempty"`
	RenameProvider         *RenameOptions          `json:"renameProvider,omitempty"`
	SemanticTokensProvider *SemanticTokensOptions  `json:"semanticTokensProvider,omitempty"`
	InlayHintProvider      bool                    `json:"inlayHintProvider,omitempty"`
	FoldingRangeProvider   bool                    `json:"foldingRangeProvider,omitempty"`
	SelectionRangeProvider bool                    `json:"selectionRangeProvider,omitempty"`
	CodeActionProvider     bool                    `json:"codeActionProvider,omitempty"`
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
	Label            string         `json:"label"`
	Kind             int            `json:"kind"`
	Detail           string         `json:"detail,omitempty"`
	Documentation    *MarkupContent `json:"documentation,omitempty"`
	SortText         string         `json:"sortText,omitempty"`
	FilterText       string         `json:"filterText,omitempty"`
	InsertText       string         `json:"insertText,omitempty"`
	InsertTextFormat int            `json:"insertTextFormat,omitempty"`
	TextEdit         *TextEdit      `json:"textEdit,omitempty"`
}

type CompletionList struct {
	IsIncomplete bool             `json:"isIncomplete"`
	Items        []CompletionItem `json:"items"`
}

// LSP CompletionItemKind values we use. Full enum is 1..25; only these
// are meaningful for the language surface today.
const (
	CompletionItemKindFunction = 3
	CompletionItemKindField    = 5
	CompletionItemKindVariable = 6
	CompletionItemKindKeyword  = 14
	CompletionItemKindConstant = 21
	CompletionItemKindStruct   = 22
)

const (
	InsertTextFormatPlainText = 1
	InsertTextFormatSnippet   = 2
)

type SignatureHelpOptions struct {
	TriggerCharacters   []string `json:"triggerCharacters,omitempty"`
	RetriggerCharacters []string `json:"retriggerCharacters,omitempty"`
}

type SignatureHelp struct {
	Signatures      []SignatureInformation `json:"signatures"`
	ActiveSignature int                    `json:"activeSignature,omitempty"`
	ActiveParameter int                    `json:"activeParameter,omitempty"`
}

type SignatureInformation struct {
	Label      string                 `json:"label"`
	Parameters []ParameterInformation `json:"parameters,omitempty"`
}

type ParameterInformation struct {
	Label string `json:"label"`
}

type DocumentSymbolParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
}

type DocumentSymbol struct {
	Name           string           `json:"name"`
	Detail         string           `json:"detail,omitempty"`
	Kind           int              `json:"kind"`
	Range          Range            `json:"range"`
	SelectionRange Range            `json:"selectionRange"`
	Children       []DocumentSymbol `json:"children,omitempty"`
}

const (
	SymbolKindFile     = 1
	SymbolKindFunction = 12
	SymbolKindConstant = 14
	SymbolKindStruct   = 23
	SymbolKindField    = 8
	SymbolKindVariable = 13
)

type ReferenceParams struct {
	TextDocumentPositionParams
	Context ReferenceContext `json:"context"`
}

type ReferenceContext struct {
	IncludeDeclaration bool `json:"includeDeclaration"`
}

type RenameOptions struct {
	PrepareProvider bool `json:"prepareProvider"`
}

type PrepareRenameResult struct {
	Range       Range  `json:"range"`
	Placeholder string `json:"placeholder"`
}

type RenameParams struct {
	TextDocumentPositionParams
	NewName string `json:"newName"`
}

type WorkspaceEdit struct {
	Changes map[string][]TextEdit `json:"changes"`
}

type TextEdit struct {
	Range   Range  `json:"range"`
	NewText string `json:"newText"`
}

type SemanticTokensOptions struct {
	Legend SemanticTokensLegend `json:"legend"`
	Full   bool                 `json:"full"`
}

type SemanticTokensLegend struct {
	TokenTypes     []string `json:"tokenTypes"`
	TokenModifiers []string `json:"tokenModifiers"`
}

type SemanticTokensParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
}

type SemanticTokens struct {
	Data []uint32 `json:"data"`
}

type InlayHintParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
	Range        Range                  `json:"range"`
}

type InlayHint struct {
	Position Position `json:"position"`
	Label    string   `json:"label"`
	Kind     int      `json:"kind,omitempty"`
}

const InlayHintKindType = 1

type FoldingRangeParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
}

type FoldingRange struct {
	StartLine      int    `json:"startLine"`
	StartCharacter int    `json:"startCharacter,omitempty"`
	EndLine        int    `json:"endLine"`
	EndCharacter   int    `json:"endCharacter,omitempty"`
	Kind           string `json:"kind,omitempty"`
}

type SelectionRangeParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
	Positions    []Position             `json:"positions"`
}

type SelectionRange struct {
	Range  Range           `json:"range"`
	Parent *SelectionRange `json:"parent,omitempty"`
}

type CodeActionParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
	Range        Range                  `json:"range"`
	Context      CodeActionContext      `json:"context"`
}

type CodeActionContext struct {
	Diagnostics []Diagnostic `json:"diagnostics"`
}

type CodeAction struct {
	Title       string        `json:"title"`
	Kind        string        `json:"kind,omitempty"`
	Diagnostics []Diagnostic  `json:"diagnostics,omitempty"`
	Edit        WorkspaceEdit `json:"edit,omitempty"`
	IsPreferred bool          `json:"isPreferred,omitempty"`
}
