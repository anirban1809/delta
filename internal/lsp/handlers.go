package lsp

import (
	"encoding/json"
	"sort"

	"delta/internal/ast"
	"delta/internal/pipeline"
	"delta/internal/semantics"
)

// deltaKeywords is the static keyword set offered by completion. Kept in
// sync with internal/token by inspection rather than import — the LSP
// doesn't otherwise reach into the tokenizer.
var deltaKeywords = []string{
	"function", "return", "const", "let",
	"if", "else", "while",
	"true", "false",
}

// ---- hover ----

func (s *Server) handleHover(msg *Message) {
	var p HoverParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil || st.result == nil {
		s.reply(msg, json.RawMessage("null"))
		return
	}

	id := identAt(st.result.File, p.Position)
	if id == nil {
		s.reply(msg, json.RawMessage("null"))
		return
	}

	// Use sites resolve via Refs. Declaration sites (and identifiers that
	// happen to share their position with a declaration) fall through to a
	// scope-at-position lookup by name.
	sym, ok := st.result.Refs[id.Position]
	if !ok {
		sym, ok = lookupAtPosition(st.result.RootScope, id.Position, id.Name)
	}
	if !ok || sym.Display == "" {
		s.reply(msg, json.RawMessage("null"))
		return
	}

	rng := identRange(*id)
	body, err := json.Marshal(Hover{
		Contents: MarkupContent{
			Kind:  "markdown",
			Value: "```delta\n" + sym.Display + "\n```",
		},
		Range: &rng,
	})
	if err != nil {
		s.replyError(msg, ErrorCodeInternalError, err.Error())
		return
	}
	s.reply(msg, body)
}

// ---- definition ----

func (s *Server) handleDefinition(msg *Message) {
	var p DefinitionParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil || st.result == nil {
		s.reply(msg, json.RawMessage("[]"))
		return
	}

	id := identAt(st.result.File, p.Position)
	if id == nil {
		s.reply(msg, json.RawMessage("[]"))
		return
	}

	// Only use sites carry a Refs entry. Clicking on the declaration itself
	// is conventionally a no-op for go-to-def — return an empty array.
	sym, ok := st.result.Refs[id.Position]
	if !ok || sym.DefPos == (ast.Position{}) {
		s.reply(msg, json.RawMessage("[]"))
		return
	}

	loc := Location{
		URI:   p.TextDocument.URI, // single-file v1
		Range: definitionRange(sym.DefPos, sym.Name),
	}
	body, err := json.Marshal([]Location{loc})
	if err != nil {
		s.replyError(msg, ErrorCodeInternalError, err.Error())
		return
	}
	s.reply(msg, body)
}

// ---- completion ----

func (s *Server) handleCompletion(msg *Message) {
	var p CompletionParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}

	items := keywordCompletions()

	st := s.documents[p.TextDocument.URI]
	if st != nil {
		src := st.result
		// Prefer the latest analysis if it parsed; otherwise fall back to
		// the last good result so the user mid-edit still gets symbols.
		if pipeline.HasParseErrors(src) {
			src = st.lastGood
		}
		if src != nil && src.RootScope != nil {
			astPos := ast.Position{
				Line:   p.Position.Line + 1,
				Column: p.Position.Character + 1,
			}
			items = append(items, visibleSymbols(src.RootScope, astPos)...)
		}
	}

	body, err := json.Marshal(CompletionList{IsIncomplete: false, Items: items})
	if err != nil {
		s.replyError(msg, ErrorCodeInternalError, err.Error())
		return
	}
	s.reply(msg, body)
}

// ---- helpers ----

// lookupAtPosition walks the scope tree to find the deepest scope
// containing pos, then resolves name up the parent chain. Returns the
// symbol and true on hit. Used by hover when the cursor lies on a
// declaration site (which doesn't appear in Refs).
func lookupAtPosition(root *semantics.ScopeNode, pos ast.Position, name string) (semantics.Symbol, bool) {
	if root == nil {
		return semantics.Symbol{}, false
	}
	deepest := root.FindDeepest(pos)
	for n := deepest; n != nil; n = n.Parent {
		if n.Scope == nil {
			continue
		}
		if sym, ok := n.Scope.Symbols[name]; ok {
			return sym, true
		}
	}
	return semantics.Symbol{}, false
}

// visibleSymbols enumerates every symbol reachable from pos's scope.
// Locals declared after pos in the same block are filtered out;
// parameters and global symbols are always visible (the analyzer's
// two-pass design admits forward references at file scope).
func visibleSymbols(root *semantics.ScopeNode, pos ast.Position) []CompletionItem {
	if root == nil {
		return nil
	}
	deepest := root.FindDeepest(pos)

	seen := map[string]bool{}
	var out []CompletionItem
	for n := deepest; n != nil; n = n.Parent {
		if n.Scope == nil {
			continue
		}
		for name, sym := range n.Scope.Symbols {
			if seen[name] {
				continue // inner scope wins
			}
			if isPositionGated(sym.Kind) && astPositionBefore(pos, sym.DefPos) {
				continue // not yet declared
			}
			seen[name] = true
			out = append(out, symbolToCompletion(sym))
		}
	}
	// Stable, alphabetical order so the editor's UI doesn't flicker between
	// requests — Go map iteration is intentionally randomized.
	sort.Slice(out, func(i, j int) bool { return out[i].Label < out[j].Label })
	return out
}

func keywordCompletions() []CompletionItem {
	out := make([]CompletionItem, 0, len(deltaKeywords))
	for _, k := range deltaKeywords {
		out = append(out, CompletionItem{
			Label:    k,
			Kind:     CompletionItemKindKeyword,
			SortText: "9-" + k, // keywords sort after user symbols
		})
	}
	return out
}

func symbolToCompletion(sym semantics.Symbol) CompletionItem {
	return CompletionItem{
		Label:    sym.Name,
		Kind:     completionKindFor(sym.Kind),
		Detail:   sym.Display,
		SortText: "1-" + sym.Name,
	}
}

func completionKindFor(k semantics.SymbolKind) int {
	switch k {
	case semantics.SymbolFunction:
		return CompletionItemKindFunction
	case semantics.SymbolFileConst, semantics.SymbolLocalConst:
		return CompletionItemKindConstant
	case semantics.SymbolParameter, semantics.SymbolLocalLet:
		return CompletionItemKindVariable
	}
	return CompletionItemKindVariable
}

// isPositionGated reports whether a symbol's visibility depends on
// declaration order within the scope. Parameters and globals are not
// gated; local var/const bindings are.
func isPositionGated(k semantics.SymbolKind) bool {
	switch k {
	case semantics.SymbolLocalConst, semantics.SymbolLocalLet:
		return true
	}
	return false
}

// astPositionBefore reports whether a strictly precedes b. Mirrors the
// helper in semantics; duplicated here so the lsp package doesn't need
// to import an unexported identifier.
func astPositionBefore(a, b ast.Position) bool {
	if a.Line != b.Line {
		return a.Line < b.Line
	}
	return a.Column < b.Column
}
