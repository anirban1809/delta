package lsp

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"strconv"
	"strings"

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
}

type Server struct {
	in        *bufio.Reader
	out       io.Writer
	log       *log.Logger
	documents map[string]*docState
	shutdown  bool
}

// Run starts the LSP message loop. It reads JSON-RPC frames from in, dispatches
// them, and writes responses/notifications to out. Diagnostics from the
// framing layer go to errLog (stderr in production); never to out.
func Run(in io.Reader, out io.Writer, errLog io.Writer) error {
	s := &Server{
		in:        bufio.NewReader(in),
		out:       out,
		log:       log.New(errLog, "delta-lsp: ", log.LstdFlags),
		documents: map[string]*docState{},
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
				// No trigger characters: editors invoke completion on
				// identifier characters by default, and Delta has no
				// member access syntax (`.`/`::`) in v1.
				ResolveProvider: false,
			},
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
	st := s.documents[uri]
	if st == nil {
		return
	}
	diags := []Diagnostic{}
	func() {
		defer func() {
			if r := recover(); r != nil {
				s.log.Printf("pipeline panic on %s: %v", uri, r)
			}
		}()
		result := pipeline.Compile(uri, st.contents)
		st.result = result
		if result != nil && result.ErrorBag != nil {
			diags = ToDiagnostics(result.ErrorBag.Errors)
		}
		// Track the last result that parsed cleanly so completion can
		// fall back when the user is mid-edit. Semantic errors are fine
		// — they're often *why* the user is asking for completion.
		if result != nil && !pipeline.HasParseErrors(result) {
			st.lastGood = result
		}
	}()
	s.publishDiagnostics(uri, diags)
}

func (s *Server) publishDiagnostics(uri string, diags []Diagnostic) {
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
