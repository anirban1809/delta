package lsp

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/url"
	"strconv"
	"strings"

	"delta/internal/diagnostics"
	"delta/internal/pipeline"
)

const serverName = "delta-lsp"
const serverVersion = "0.0.1"

// docState is the per-URI cache. contents is the latest text from the
// client; result is the analyzer output for that text (possibly partial
// if there were parse errors); lastGood is the most recent fully-parsed
// result, used by completion when the user is mid-edit.
type docState struct {
	contents []byte
	result   *pipeline.Result
	lastGood *pipeline.Result
	path     string
}

type Server struct {
	in                   *bufio.Reader
	out                  io.Writer
	log                  *log.Logger
	documents            map[string]*docState
	publishedDiagnostics map[string]bool
	shutdown             bool
}

// Run starts the LSP message loop. It reads JSON-RPC frames from in, dispatches
// them, and writes responses/notifications to out. Diagnostics from the
// framing layer go to errLog (stderr in production); never to out.
func Run(in io.Reader, out io.Writer, errLog io.Writer) error {
	s := &Server{
		in:                   bufio.NewReader(in),
		out:                  out,
		log:                  log.New(errLog, "delta-lsp: ", log.LstdFlags),
		documents:            map[string]*docState{},
		publishedDiagnostics: map[string]bool{},
	}

	for {
		msg, err := readMessage(s.in)
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			s.log.Printf("read: %v", err)
			continue
		}

		s.handle(msg)

		if s.shutdown && msg.Method == "exit" {
			return nil
		}
	}
}

// ---- framing ----

// readMessage reads one LSP frame: HTTP-style headers terminated by CRLFCRLF,
// followed by exactly Content-Length bytes of JSON body.
func readMessage(r *bufio.Reader) (*Message, error) {
	contentLength := -1
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return nil, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break
		}
		name, value, ok := strings.Cut(line, ":")
		if !ok {
			return nil, fmt.Errorf("malformed header: %q", line)
		}
		if strings.EqualFold(strings.TrimSpace(name), "content-length") {
			n, err := strconv.Atoi(strings.TrimSpace(value))
			if err != nil {
				return nil, fmt.Errorf("bad content-length: %w", err)
			}
			contentLength = n
		}
	}
	if contentLength < 0 {
		return nil, errors.New("missing Content-Length header")
	}

	body := make([]byte, contentLength)
	if _, err := io.ReadFull(r, body); err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	var msg Message
	if err := json.Unmarshal(body, &msg); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &msg, nil
}

// writeFrame marshals payload and writes one LSP frame to out. Length is
// computed from the marshaled byte slice — never from string length, which
// would miscount multi-byte runes.
func (s *Server) writeFrame(payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	if _, err := fmt.Fprintf(s.out, "Content-Length: %d\r\n\r\n", len(body)); err != nil {
		return err
	}
	if _, err := s.out.Write(body); err != nil {
		return err
	}
	return nil
}

// ---- dispatch ----

func (s *Server) handle(msg *Message) {
	isRequest := len(msg.ID) > 0

	switch msg.Method {
	case "initialize":
		s.handleInitialize(msg)
	case "initialized":
		// no-op
	case "shutdown":
		s.shutdown = true
		s.reply(msg, json.RawMessage("null"))
	case "exit":
		// loop exits after this dispatch
	case "textDocument/didOpen":
		s.handleDidOpen(msg)
	case "textDocument/didChange":
		s.handleDidChange(msg)
	case "textDocument/didClose":
		s.handleDidClose(msg)
	case "textDocument/hover":
		s.handleHover(msg)
	case "textDocument/definition":
		s.handleDefinition(msg)
	case "textDocument/completion":
		s.handleCompletion(msg)
	case "textDocument/signatureHelp":
		s.handleSignatureHelp(msg)
	case "textDocument/documentSymbol":
		s.handleDocumentSymbols(msg)
	case "textDocument/references":
		s.handleReferences(msg)
	case "textDocument/prepareRename":
		s.handlePrepareRename(msg)
	case "textDocument/rename":
		s.handleRename(msg)
	case "textDocument/semanticTokens/full":
		s.handleSemanticTokens(msg)
	case "textDocument/inlayHint":
		s.handleInlayHints(msg)
	case "textDocument/foldingRange":
		s.handleFoldingRanges(msg)
	case "textDocument/selectionRange":
		s.handleSelectionRanges(msg)
	case "textDocument/codeAction":
		s.handleCodeActions(msg)
	default:
		if isRequest {
			s.replyError(msg, ErrorCodeMethodNotFound, "method not found: "+msg.Method)
		}
		// notifications: silently ignore per LSP spec
	}
}

// ---- handlers ----

func (s *Server) handleInitialize(msg *Message) {
	result := InitializeResult{
		Capabilities: ServerCapabilities{
			TextDocumentSync: TextDocumentSyncOptions{
				OpenClose: true,
				Change:    TextDocumentSyncFull,
			},
			HoverProvider:      true,
			DefinitionProvider: true,
			CompletionProvider: &CompletionOptions{
				// `.` triggers member-access completion: after a
				// record-typed receiver, completion offers that record's
				// fields (Phase K). Identifier characters trigger the
				// default in-scope-name + keyword completion.
				TriggerCharacters: []string{"."},
				ResolveProvider:   false,
			},
			SignatureHelpProvider: &SignatureHelpOptions{
				TriggerCharacters:   []string{"(", ","},
				RetriggerCharacters: []string{","},
			},
			DocumentSymbolProvider: true,
			ReferencesProvider:     true,
			RenameProvider:         &RenameOptions{PrepareProvider: true},
			SemanticTokensProvider: &SemanticTokensOptions{
				Legend: SemanticTokensLegend{
					TokenTypes: semanticTokenTypes,
				},
				Full: true,
			},
			InlayHintProvider:      true,
			FoldingRangeProvider:   true,
			SelectionRangeProvider: true,
			CodeActionProvider:     true,
		},
		ServerInfo: ServerInfo{Name: serverName, Version: serverVersion},
	}
	body, err := json.Marshal(result)
	if err != nil {
		s.replyError(msg, ErrorCodeInternalError, err.Error())
		return
	}
	s.reply(msg, body)
}

func (s *Server) handleDidOpen(msg *Message) {
	var p DidOpenTextDocumentParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.log.Printf("didOpen: %v", err)
		return
	}
	s.documents[p.TextDocument.URI] = &docState{
		contents: []byte(p.TextDocument.Text),
		path:     pathFromURI(p.TextDocument.URI),
	}
	s.analyzeAndPublish(p.TextDocument.URI)
}

func (s *Server) handleDidChange(msg *Message) {
	var p DidChangeTextDocumentParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.log.Printf("didChange: %v", err)
		return
	}
	if len(p.ContentChanges) == 0 {
		return
	}
	// Full sync: the last change carries the whole new document.
	st := s.documents[p.TextDocument.URI]
	if st == nil {
		st = &docState{}
		s.documents[p.TextDocument.URI] = st
	}
	st.contents = []byte(p.ContentChanges[len(p.ContentChanges)-1].Text)
	st.path = pathFromURI(p.TextDocument.URI)
	s.analyzeAndPublish(p.TextDocument.URI)
}

func (s *Server) handleDidClose(msg *Message) {
	var p DidCloseTextDocumentParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.log.Printf("didClose: %v", err)
		return
	}
	delete(s.documents, p.TextDocument.URI)
	s.publishDiagnostics(p.TextDocument.URI, []Diagnostic{})
}

// ---- pipeline + publish ----

func (s *Server) analyzeAndPublish(uri string) {
	allDiagnostics := map[string][]Diagnostic{}
	touched := map[string]bool{}
	func() {
		defer func() {
			if r := recover(); r != nil {
				s.log.Printf("pipeline panic on %s: %v", uri, r)
			}
		}()

		overlays := s.documentOverlays()
		fileTargets := s.fileDocumentURIs()
		if len(fileTargets) == 0 {
			if st := s.documents[uri]; st != nil {
				result := pipeline.Compile(uri, st.contents)
				st.result = result
				if result != nil && result.ErrorBag != nil {
					allDiagnostics[uri] = ToDiagnostics(result.ErrorBag.Errors)
				}
				updateLastGood(st, result)
			}
			touched[uri] = true
			return
		}

		for _, targetURI := range fileTargets {
			target := s.documents[targetURI]
			if target == nil || target.path == "" {
				continue
			}
			graph, bag := pipeline.AnalyzeProject(
				target.path,
				pipeline.AnalyzeOptions{Overlays: overlays},
			)
			if graph != nil {
				for _, mod := range graph.Modules {
					modURI := uriFromPath(mod.Path)
					if st := s.documents[modURI]; st != nil {
						result := pipeline.ResultForModule(mod)
						st.result = result
						updateLastGood(st, result)
					}
					touched[modURI] = true
				}
			} else if targetURI == uri {
				result := pipeline.Compile(uri, target.contents)
				target.result = result
				updateLastGood(target, result)
			}
			if bag != nil {
				for diagURI, diagnostics := range diagnosticsByURI(bag.Errors, targetURI) {
					allDiagnostics[diagURI] = diagnostics
					touched[diagURI] = true
				}
			}
			touched[targetURI] = true
		}
	}()

	for openURI := range s.documents {
		touched[openURI] = true
	}
	for previous := range s.publishedDiagnostics {
		touched[previous] = true
	}
	for diagURI := range touched {
		s.publishDiagnostics(diagURI, allDiagnostics[diagURI])
	}
}

func (s *Server) publishDiagnostics(uri string, diags []Diagnostic) {
	if s.publishedDiagnostics == nil {
		s.publishedDiagnostics = map[string]bool{}
	}
	s.publishedDiagnostics[uri] = len(diags) > 0
	notif := Message{
		JSONRPC: "2.0",
		Method:  "textDocument/publishDiagnostics",
	}
	params, err := json.Marshal(PublishDiagnosticsParams{URI: uri, Diagnostics: diags})
	if err != nil {
		s.log.Printf("marshal publishDiagnostics: %v", err)
		return
	}
	notif.Params = params
	if err := s.writeFrame(notif); err != nil {
		s.log.Printf("write publishDiagnostics: %v", err)
	}
}

func updateLastGood(st *docState, result *pipeline.Result) {
	if st == nil || result == nil {
		return
	}
	if !pipeline.HasParseErrors(result) {
		st.lastGood = result
	}
}

func (s *Server) documentOverlays() map[string][]byte {
	overlays := map[string][]byte{}
	for uri, st := range s.documents {
		if st == nil {
			continue
		}
		path := st.path
		if path == "" {
			path = pathFromURI(uri)
			st.path = path
		}
		if path == "" {
			continue
		}
		overlays[path] = st.contents
	}
	return overlays
}

func (s *Server) fileDocumentURIs() []string {
	var uris []string
	for uri, st := range s.documents {
		if st == nil {
			continue
		}
		if st.path == "" {
			st.path = pathFromURI(uri)
		}
		if st.path != "" {
			uris = append(uris, uri)
		}
	}
	return uris
}

func diagnosticsByURI(
	errors []diagnostics.SourceError,
	fallbackURI string,
) map[string][]Diagnostic {
	out := map[string][]Diagnostic{}
	for _, err := range errors {
		uri := uriFromPath(err.File)
		if uri == "" {
			uri = fallbackURI
		}
		out[uri] = append(out[uri], toDiagnostic(err))
	}
	return out
}

func pathFromURI(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "file" {
		return ""
	}
	return u.Path
}

func uriFromPath(path string) string {
	if path == "" {
		return ""
	}
	return (&url.URL{Scheme: "file", Path: path}).String()
}

// ---- response helpers ----

func (s *Server) reply(req *Message, result json.RawMessage) {
	if len(req.ID) == 0 {
		return // notifications get no response
	}
	resp := Message{JSONRPC: "2.0", ID: req.ID, Result: result}
	if err := s.writeFrame(resp); err != nil {
		s.log.Printf("write reply to %s: %v", req.Method, err)
	}
}

func (s *Server) replyError(req *Message, code int, message string) {
	if len(req.ID) == 0 {
		return
	}
	resp := Message{
		JSONRPC: "2.0",
		ID:      req.ID,
		Error:   &ResponseError{Code: code, Message: message},
	}
	if err := s.writeFrame(resp); err != nil {
		s.log.Printf("write error reply to %s: %v", req.Method, err)
	}
}
