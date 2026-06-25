package lsp

import (
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"delta/internal/analyzer"
	"delta/internal/ast"
	"delta/internal/pipeline"
	"delta/internal/token"
)

var deltaKeywords = token.Keywords()

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

	if member, field, ok := memberFieldAt(st.result, p.Position); ok {
		rng := definitionRange(member.Position, member.Member)
		s.replyJSON(msg, Hover{
			Contents: MarkupContent{
				Kind:  "markdown",
				Value: "```delta\nfield " + field.Name + ": " + field.Type.String() + "\n```",
			},
			Range: &rng,
		})
		return
	}
	if member, sig, ok := memberMethodAt(st.result, p.Position); ok {
		rng := definitionRange(member.Position, member.Member)
		s.replyJSON(msg, Hover{
			Contents: MarkupContent{
				Kind:  "markdown",
				Value: "```delta\n" + renderMethodDetail(member.Member, sig) + "\n```",
			},
			Range: &rng,
		})
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
		sym, ok = functionDeclarationSymbolAt(st.result, *id)
	}
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

	if _, field, ok := memberFieldAt(st.result, p.Position); ok {
		s.replyJSON(msg, []Location{{
			URI:   p.TextDocument.URI,
			Range: definitionRange(field.Position, field.Name),
		}})
		return
	}
	if member, _, ok := memberMethodAt(st.result, p.Position); ok {
		if def, ok := methodDeclarationPosition(st.result, member); ok {
			s.replyJSON(msg, []Location{{
				URI:   p.TextDocument.URI,
				Range: definitionRange(def, member.Member),
			}})
			return
		}
	}

	id := identAt(st.result.File, p.Position)
	if id == nil {
		s.reply(msg, json.RawMessage("[]"))
		return
	}

	// Value use-sites carry a Refs entry. Type references (e.g. `Vec3` in
	// an annotation, field, alias, or composition) don't — they resolve to
	// their `type` declaration via a scope lookup by name.
	sym, ok := st.result.Refs[id.Position]
	if !ok {
		sym, ok = functionDeclarationSymbolAt(st.result, *id)
	}
	if !ok {
		if t, found := lookupAtPosition(st.result.RootScope, id.Position, id.Name); found && t.Kind == analyzer.SymbolTypeDecl {
			sym, ok = t, true
		}
	}
	// Clicking on the declaration site itself is conventionally a no-op.
	if !ok || sym.DefPos == (ast.Position{}) || sym.DefPos == id.Position {
		s.reply(msg, json.RawMessage("[]"))
		return
	}

	targetURI := p.TextDocument.URI
	if sym.SourcePath != "" {
		targetURI = uriFromPath(sym.SourcePath)
	}
	loc := Location{
		URI:   targetURI,
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

	st := s.documents[p.TextDocument.URI]

	if st != nil {
		if items, ok := pendingResultCompletions(st.contents, p.Position); ok {
			s.replyJSON(msg, CompletionList{IsIncomplete: false, Items: items})
			return
		}
	}

	if st != nil {
		if items, ok := objectLiteralCompletions(st, p.Position); ok {
			s.replyJSON(msg, CompletionList{IsIncomplete: false, Items: items})
			return
		}
	}

	// Member-access completion: when the cursor sits after a dotted
	// record-typed receiver (`v.`, `a.b.fo`), offer that record's fields
	// and nothing else — keywords and in-scope names don't belong here.
	if st != nil {
		if chain, ok := memberChainBefore(st.contents, p.Position); ok {
			items := s.fieldCompletions(st, chain, p.Position)
			body, err := json.Marshal(CompletionList{IsIncomplete: false, Items: items})
			if err != nil {
				s.replyError(msg, ErrorCodeInternalError, err.Error())
				return
			}
			s.reply(msg, body)
			return
		}
		if name, ok := callReceiverBefore(st.contents, p.Position); ok {
			items := s.callFieldCompletions(st, name, p.Position)
			s.replyJSON(msg, CompletionList{IsIncomplete: false, Items: items})
			return
		}
	}

	context := completionContextAt(nil, p.Position)
	if st != nil {
		context = completionContextAt(st.contents, p.Position)
	}
	items := contextKeywordCompletions(context)

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
			symbols := visibleSymbolValues(src.RootScope, astPos)
			expected := expectedTypeAt(st.contents, p.Position, src, astPos)
			for _, sym := range symbols {
				if context == completionType && sym.Kind != analyzer.SymbolTypeDecl {
					continue
				}
				if context != completionType && sym.Kind == analyzer.SymbolTypeDecl {
					continue
				}
				item := symbolToCompletion(sym)
				if expected.Kind != analyzer.TypeInvalid &&
					expected.Kind != analyzer.TypeEmpty &&
					symbolMatchesType(sym, expected) {
					item.SortText = "0-" + sym.Name
				}
				items = append(items, item)
			}
			if context == completionType {
				items = append(items, primitiveTypeCompletions()...)
			}
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
func lookupAtPosition(root *analyzer.ScopeNode, pos ast.Position, name string) (analyzer.Symbol, bool) {
	if root == nil {
		return analyzer.Symbol{}, false
	}
	deepest := root.FindDeepest(pos)
	for n := deepest; n != nil; n = n.Parent {
		if n.Scope == nil {
			continue
		}
		if sym, ok := n.Scope.Symbols[name]; ok {
			return *sym, true
		}
	}
	return analyzer.Symbol{}, false
}

// visibleSymbols enumerates every symbol reachable from pos's scope.
// Locals declared after pos in the same block are filtered out;
// parameters and global symbols are always visible (the analyzer's
// two-pass design admits forward references at file scope).
func visibleSymbols(root *analyzer.ScopeNode, pos ast.Position) []CompletionItem {
	symbols := visibleSymbolValues(root, pos)
	out := make([]CompletionItem, 0, len(symbols))
	for _, sym := range symbols {
		out = append(out, symbolToCompletion(sym))
	}
	return out
}

func visibleSymbolValues(root *analyzer.ScopeNode, pos ast.Position) []analyzer.Symbol {
	if root == nil {
		return nil
	}
	deepest := root.FindDeepest(pos)

	seen := map[string]bool{}
	var out []analyzer.Symbol
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
			out = append(out, *sym)
		}
	}
	// Stable, alphabetical order so the editor's UI doesn't flicker between
	// requests — Go map iteration is intentionally randomized.
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
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

type completionContext int

const (
	completionExpression completionContext = iota
	completionType
	completionStatement
	completionTopLevel
)

func completionContextAt(contents []byte, pos Position) completionContext {
	line := lineAt(contents, pos.Line)
	col := min(pos.Character, len(line))
	prefix := strings.TrimSpace(line[:col])
	if regexp.MustCompile(`:\s*[A-Za-z_0-9]*$`).MatchString(prefix) {
		return completionType
	}
	if braceDepthBefore(contents, pos) == 0 {
		return completionTopLevel
	}
	if prefix == "" || strings.HasSuffix(prefix, "{") || strings.HasSuffix(prefix, ";") ||
		validIdentifier.MatchString(prefix) {
		return completionStatement
	}
	return completionExpression
}

func contextKeywordCompletions(context completionContext) []CompletionItem {
	if context == completionType {
		return nil
	}
	allowed := map[string]bool{}
	switch context {
	case completionTopLevel:
		for _, keyword := range []string{
			"function", "const", "type", "import", "export",
		} {
			allowed[keyword] = true
		}
	case completionStatement:
		for _, keyword := range []string{
			"const", "let", "if", "while", "for", "switch", "return", "check",
			"break", "continue",
		} {
			allowed[keyword] = true
		}
	default:
		allowed["true"] = true
		allowed["false"] = true
		allowed["as"] = true
		allowed["new"] = true
		allowed["move"] = true
		allowed["clone"] = true
	}
	var out []CompletionItem
	for _, keyword := range deltaKeywords {
		if !allowed[keyword] {
			continue
		}
		item := CompletionItem{
			Label:    keyword,
			Kind:     CompletionItemKindKeyword,
			SortText: "9-" + keyword,
		}
		if snippet, ok := keywordSnippet(keyword); ok {
			item.InsertText = snippet
			item.InsertTextFormat = InsertTextFormatSnippet
		}
		out = append(out, item)
	}
	if context == completionStatement {
		out = append(out, CompletionItem{
			Label:            "return error as",
			Kind:             CompletionItemKindKeyword,
			Detail:           "propagate a declared error",
			InsertText:       "return error as { ${0} };",
			InsertTextFormat: InsertTextFormatSnippet,
			SortText:         "8-return-error-as",
		})
	}
	return out
}

func keywordSnippet(keyword string) (string, bool) {
	switch keyword {
	case "function":
		return "function ${1:name}(${2}) {\n\t${0}\n}", true
	case "type":
		return "type ${1:Name} = {\n\t${2:field}: ${3:type};\n};", true
	case "import":
		return "import { ${1:symbol} } from \"${2:./module}\";", true
	case "const":
		return "const ${1:name}: ${2:type} = ${3:value};", true
	case "let":
		return "let ${1:name}: ${2:type} = ${3:value};", true
	case "if":
		return "if (${1:condition}) {\n\t${0}\n}", true
	case "while":
		return "while (${1:condition}) {\n\t${0}\n}", true
	case "for":
		return "for (let ${1:i}: int32 = 0; ${1:i} < ${2:count}; ${1:i}++) {\n\t${0}\n}", true
	case "switch":
		return "switch (${1:value}) {\n\tcase ${2:0}: {\n\t\t${3}\n\t}\n\tdefault: {\n\t\t${0}\n\t}\n}", true
	case "check":
		return "check ${1:result} {\n\t${0}\n}", true
	case "return":
		return "return ${0};", true
	}
	return "", false
}

func braceDepthBefore(contents []byte, pos Position) int {
	offset := byteOffset(contents, pos)
	if offset < 0 {
		return 0
	}
	depth := 0
	inString := byte(0)
	escaped := false
	for _, ch := range contents[:offset] {
		if inString != 0 {
			if escaped {
				escaped = false
			} else if ch == '\\' {
				escaped = true
			} else if ch == inString {
				inString = 0
			}
			continue
		}
		if ch == '"' || ch == '\'' {
			inString = ch
			continue
		}
		switch ch {
		case '{':
			depth++
		case '}':
			depth = max(depth-1, 0)
		}
	}
	return depth
}

func primitiveTypeCompletions() []CompletionItem {
	names := []string{
		"int8", "int16", "int32", "int64", "intsize",
		"uint8", "uint16", "uint32", "uint64", "uintsize",
		"float32", "float64", "bool", "string", "char",
	}
	out := make([]CompletionItem, 0, len(names))
	for _, name := range names {
		out = append(out, CompletionItem{
			Label:    name,
			Kind:     CompletionItemKindStruct,
			SortText: "1-" + name,
		})
	}
	return out
}

func symbolToCompletion(sym analyzer.Symbol) CompletionItem {
	item := CompletionItem{
		Label:    sym.Name,
		Kind:     completionKindFor(sym.Kind),
		Detail:   sym.Display,
		SortText: "1-" + sym.Name,
	}
	if sym.Kind == analyzer.SymbolFunction && sym.Signature != nil {
		var snippet strings.Builder
		snippet.WriteString(sym.Name)
		snippet.WriteByte('(')
		for i, typ := range sym.Signature.Parameters {
			if i > 0 {
				snippet.WriteString(", ")
			}
			name := "arg" + strconv.Itoa(i+1)
			if i < len(sym.Signature.ParameterNames) && sym.Signature.ParameterNames[i] != "" {
				name = sym.Signature.ParameterNames[i]
			}
			snippet.WriteString("${")
			snippet.WriteString(strconv.Itoa(i + 1))
			snippet.WriteByte(':')
			snippet.WriteString(name)
			snippet.WriteByte('}')
			_ = typ
		}
		snippet.WriteByte(')')
		item.InsertText = snippet.String()
		item.InsertTextFormat = InsertTextFormatSnippet
	}
	return item
}

func completionKindFor(k analyzer.SymbolKind) int {
	switch k {
	case analyzer.SymbolFunction:
		return CompletionItemKindFunction
	case analyzer.SymbolFileConst, analyzer.SymbolLocalConst:
		return CompletionItemKindConstant
	case analyzer.SymbolParameter, analyzer.SymbolLocalLet:
		return CompletionItemKindVariable
	case analyzer.SymbolTypeDecl:
		return CompletionItemKindStruct
	}
	return CompletionItemKindVariable
}

// isPositionGated reports whether a symbol's visibility depends on
// declaration order within the scope. Parameters and globals are not
// gated; local var/const bindings are.
func isPositionGated(k analyzer.SymbolKind) bool {
	switch k {
	case analyzer.SymbolLocalConst, analyzer.SymbolLocalLet:
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

// ---- member-access completion ----

// memberChainRe matches a dotted receiver chain ending in `.` plus an
// optional partial field at the cursor. Group 1 captures the receiver
// (e.g. `a.b` in `a.b.fo`). Anchored to the end of the line prefix.
var memberChainRe = regexp.MustCompile(`([A-Za-z_][A-Za-z0-9_]*(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*\.\s*[A-Za-z0-9_]*$`)

// identRe extracts the identifier segments from a captured receiver chain.
var identRe = regexp.MustCompile(`[A-Za-z_][A-Za-z0-9_]*`)
var callReceiverRe = regexp.MustCompile(`([A-Za-z_][A-Za-z0-9_]*)\s*\([^()]*\)\s*\.\s*[A-Za-z0-9_]*$`)

// memberChainBefore reports whether the cursor sits in member-access
// position and, if so, returns the receiver segment chain. For `v.|` it
// returns ["v"]; for `a.b.|` -> ["a","b"]; for `a.b.fo|` -> ["a","b"].
// ok is false when the cursor is not after a dotted receiver.
func memberChainBefore(contents []byte, pos Position) ([]string, bool) {
	line := lineAt(contents, pos.Line)
	col := min(pos.Character, len(line))
	prefix := line[:col]
	m := memberChainRe.FindStringSubmatch(prefix)
	if m == nil {
		return nil, false
	}
	segs := identRe.FindAllString(m[1], -1)
	if len(segs) == 0 {
		return nil, false
	}
	return segs, true
}

func callReceiverBefore(contents []byte, pos Position) (string, bool) {
	line := lineAt(contents, pos.Line)
	col := min(pos.Character, len(line))
	match := callReceiverRe.FindStringSubmatch(line[:col])
	if len(match) != 2 {
		return "", false
	}
	return match[1], true
}

// lineAt returns the 0-based line of contents (without its terminator),
// or "" when line is out of range. ASCII-only Delta source means byte
// offsets equal LSP UTF-16 offsets.
func lineAt(contents []byte, line int) string {
	cur := 0
	start := 0
	for i := range len(contents) {
		if contents[i] == '\n' {
			if cur == line {
				end := i
				if end > start && contents[end-1] == '\r' {
					end--
				}
				return string(contents[start:end])
			}
			cur++
			start = i + 1
		}
	}
	if cur == line {
		return string(contents[start:])
	}
	return ""
}

// fieldCompletions resolves the receiver chain to a record type and returns
// its fields as completion items. The first segment is resolved as an
// in-scope binding; each subsequent segment walks into a record field's
// type. Returns nil when any step fails to land on a record type.
func (s *Server) fieldCompletions(st *docState, chain []string, pos Position) []CompletionItem {
	src := st.result
	if pipeline.HasParseErrors(src) {
		src = repairedMemberCompletionResult(st, pos)
		if src == nil || src.RootScope == nil || src.Records == nil {
			src = st.lastGood
		}
	}
	if src == nil || src.RootScope == nil || src.Records == nil {
		return nil
	}

	astPos := ast.Position{Line: pos.Line + 1, Column: pos.Character + 1}
	t, ok := receiverChainType(src, chain, astPos)
	if !ok {
		return nil
	}

	fields, ok := recordFields(src, t)
	if !ok {
		return nil
	}
	out := make([]CompletionItem, 0, len(fields))
	for _, f := range fields {
		out = append(out, CompletionItem{
			Label:    f.Name,
			Kind:     CompletionItemKindField,
			Detail:   f.Name + ": " + f.Type.String(),
			SortText: "0-" + f.Name, // fields sort first in member context
		})
	}
	if methods := src.Methods[memberSurfaceTypeName(t)]; len(methods) > 0 {
		for name, sig := range methods {
			out = append(out, methodCompletion(name, sig))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Label < out[j].Label })
	return out
}

func repairedMemberCompletionResult(st *docState, pos Position) *pipeline.Result {
	if st == nil {
		return nil
	}
	offset := byteOffset(st.contents, pos)
	if offset < 0 || offset > len(st.contents) {
		return nil
	}
	insert := "__delta_completion_placeholder"
	line := lineAt(st.contents, pos.Line)
	col := min(pos.Character, len(line))
	if strings.TrimSpace(line[col:]) == "" {
		insert += ";"
	}
	repaired := make([]byte, 0, len(st.contents)+len(insert))
	repaired = append(repaired, st.contents[:offset]...)
	repaired = append(repaired, insert...)
	repaired = append(repaired, st.contents[offset:]...)
	result := pipeline.Compile("completion.delta", repaired)
	if pipeline.HasParseErrors(result) {
		return nil
	}
	return result
}

func receiverChainType(
	src *pipeline.Result,
	chain []string,
	pos ast.Position,
) (analyzer.Type, bool) {
	if src == nil || src.RootScope == nil || len(chain) == 0 {
		return analyzer.Type{}, false
	}
	sym, ok := lookupAtPosition(src.RootScope, pos, chain[0])
	if !ok {
		return analyzer.Type{}, false
	}
	t := sym.Type
	for _, seg := range chain[1:] {
		fields, ok := recordFields(src, t)
		if !ok {
			return analyzer.Type{}, false
		}
		next, ok := fieldTypeByName(fields, seg)
		if !ok {
			return analyzer.Type{}, false
		}
		t = next
	}
	return t, true
}

func methodCompletion(name string, sig *analyzer.FunctionSignature) CompletionItem {
	item := CompletionItem{
		Label:    name,
		Kind:     CompletionItemKindFunction,
		Detail:   renderMethodDetail(name, sig),
		SortText: "0-" + name,
	}
	if sig != nil {
		var snippet strings.Builder
		snippet.WriteString(name)
		snippet.WriteByte('(')
		for i := range sig.Parameters {
			if i > 0 {
				snippet.WriteString(", ")
			}
			name := "arg" + strconv.Itoa(i+1)
			if i < len(sig.ParameterNames) && sig.ParameterNames[i] != "" {
				name = sig.ParameterNames[i]
			}
			snippet.WriteString("${")
			snippet.WriteString(strconv.Itoa(i + 1))
			snippet.WriteByte(':')
			snippet.WriteString(name)
			snippet.WriteByte('}')
		}
		snippet.WriteByte(')')
		item.InsertText = snippet.String()
		item.InsertTextFormat = InsertTextFormatSnippet
	}
	return item
}

func renderMethodDetail(name string, sig *analyzer.FunctionSignature) string {
	if sig == nil {
		return "function " + name + "()"
	}
	var params []string
	for i, typ := range sig.Parameters {
		label := typ.String()
		if i < len(sig.ParameterNames) && sig.ParameterNames[i] != "" {
			label = sig.ParameterNames[i] + ": " + label
		}
		params = append(params, label)
	}
	detail := "function "
	if sig.ReceiverType != nil {
		receiverName := sig.ReceiverName
		if receiverName == "" {
			receiverName = "recv"
		}
		receiverType := "&" + sig.ReceiverType.Name
		if sig.ReceiverEdit {
			receiverType = "edit &" + sig.ReceiverType.Name
		}
		detail += "(" + receiverName + ": " + receiverType + ") "
	}
	detail += name + "(" + strings.Join(params, ", ") + ")"
	if len(sig.ReturnTypes) > 0 {
		parts := make([]string, 0, len(sig.ReturnTypes))
		for _, typ := range sig.ReturnTypes {
			parts = append(parts, typ.String())
		}
		detail += " -> " + strings.Join(parts, ", ")
	}
	if len(sig.ErrorTypes) > 0 {
		parts := make([]string, 0, len(sig.ErrorTypes))
		for _, typ := range sig.ErrorTypes {
			parts = append(parts, typ.String())
		}
		detail += " | " + strings.Join(parts, ", ")
	}
	return detail
}

func (s *Server) callFieldCompletions(st *docState, name string, pos Position) []CompletionItem {
	src := usableResult(st)
	if src == nil || src.RootScope == nil {
		return nil
	}
	astPos := ast.Position{Line: pos.Line + 1, Column: pos.Character + 1}
	sym, ok := lookupAtPosition(src.RootScope, astPos, name)
	if !ok || sym.Signature == nil || len(sym.Signature.ReturnTypes) != 1 {
		return nil
	}
	fields, ok := recordFields(src, sym.Signature.ReturnTypes[0])
	if !ok {
		return nil
	}
	out := make([]CompletionItem, 0, len(fields))
	for _, field := range fields {
		out = append(out, CompletionItem{
			Label:    field.Name,
			Kind:     CompletionItemKindField,
			Detail:   field.Name + ": " + field.Type.String(),
			SortText: "0-" + field.Name,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Label < out[j].Label })
	return out
}

// recordFields returns the resolved fields for a custom record type, or
// false when t is not a record type known to the registry.
func recordFields(src *pipeline.Result, t analyzer.Type) ([]analyzer.ResolvedRecordField, bool) {
	if t.Kind != analyzer.TypeCustom {
		return nil, false
	}
	fields, ok := src.Records[memberSurfaceTypeName(t)]
	if ok {
		return fields, true
	}
	if len(t.Fields) > 0 {
		fields := make([]analyzer.ResolvedRecordField, 0, len(t.Fields))
		for _, field := range t.Fields {
			fields = append(fields, analyzer.ResolvedRecordField{
				Name:     field.Name,
				Type:     field.Type,
				Position: field.Position,
			})
		}
		return fields, true
	}
	return fields, ok
}

func memberSurfaceTypeName(t analyzer.Type) string {
	if inner, ok := heapInnerTypeName(t.Name); ok {
		return inner
	}
	return t.Name
}

func heapInnerTypeName(name string) (string, bool) {
	if len(name) <= len("heap<>") || !strings.HasPrefix(name, "heap<") || !strings.HasSuffix(name, ">") {
		return "", false
	}
	return name[len("heap<") : len(name)-1], true
}

// fieldTypeByName looks up a field by name in a resolved field list.
func fieldTypeByName(fields []analyzer.ResolvedRecordField, name string) (analyzer.Type, bool) {
	for _, f := range fields {
		if f.Name == name {
			return f.Type, true
		}
	}
	return analyzer.Type{}, false
}

func symbolMatchesType(sym analyzer.Symbol, expected analyzer.Type) bool {
	if sym.Kind == analyzer.SymbolFunction {
		return sym.Signature != nil &&
			len(sym.Signature.ReturnTypes) == 1 &&
			sym.Signature.ReturnTypes[0].String() == expected.String()
	}
	return sym.Type.String() == expected.String()
}

func expectedTypeAt(
	contents []byte,
	pos Position,
	src *pipeline.Result,
	astPos ast.Position,
) analyzer.Type {
	line := lineAt(contents, pos.Line)
	col := min(pos.Character, len(line))
	prefix := line[:col]
	annotation := regexp.MustCompile(`:\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*[^;]*$`).FindStringSubmatch(prefix)
	if len(annotation) == 2 {
		if typ, ok := analyzer.ResolveTypeName(annotation[1]); ok {
			return typ
		}
		return analyzer.Type{Kind: analyzer.TypeCustom, Name: annotation[1]}
	}
	if name, active, ok := callAt(contents, pos); ok {
		if sym, found := lookupAtPosition(src.RootScope, astPos, name); found &&
			sym.Signature != nil && active < len(sym.Signature.Parameters) {
			return sym.Signature.Parameters[active]
		}
	}
	return analyzer.Type{Kind: analyzer.TypeInvalid}
}

func objectLiteralCompletions(st *docState, pos Position) ([]CompletionItem, bool) {
	src := usableResult(st)
	if src == nil || src.Records == nil {
		return nil, false
	}
	offset := byteOffset(st.contents, pos)
	if offset < 0 {
		return nil, false
	}
	prefix := string(st.contents[:offset])
	open := strings.LastIndex(prefix, "{")
	if open < 0 {
		return nil, false
	}
	if close := strings.LastIndex(prefix, "}"); close > open {
		return nil, false
	}
	header := prefix[:open]
	match := regexp.MustCompile(`(?:let|const)\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*$`).FindStringSubmatch(header)
	if len(match) != 2 {
		return nil, false
	}
	fields, ok := src.Records[match[1]]
	if !ok {
		return nil, false
	}
	body := prefix[open+1:]
	present := map[string]bool{}
	for _, found := range regexp.MustCompile(`([A-Za-z_][A-Za-z0-9_]*)\s*:`).FindAllStringSubmatch(body, -1) {
		present[found[1]] = true
	}
	var out []CompletionItem
	for _, field := range fields {
		if present[field.Name] {
			continue
		}
		out = append(out, CompletionItem{
			Label:            field.Name,
			Kind:             CompletionItemKindField,
			Detail:           field.Name + ": " + field.Type.String(),
			InsertText:       field.Name + ": ${1:value}",
			InsertTextFormat: InsertTextFormatSnippet,
			SortText:         "0-" + field.Name,
		})
	}
	return out, true
}

func pendingResultCompletions(contents []byte, pos Position) ([]CompletionItem, bool) {
	line := lineAt(contents, pos.Line)
	col := min(pos.Character, len(line))
	if !regexp.MustCompile(`^\s*check\s+[A-Za-z0-9_]*$`).MatchString(line[:col]) {
		return nil, false
	}
	offset := byteOffset(contents, pos)
	if offset < 0 {
		return nil, true
	}
	prefix := string(contents[:offset])
	bound := regexp.MustCompile(`\bas\s+([A-Za-z_][A-Za-z0-9_]*)\s*;`).FindAllStringSubmatch(prefix, -1)
	checked := map[string]bool{}
	for _, match := range regexp.MustCompile(`\bcheck\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{`).FindAllStringSubmatch(prefix, -1) {
		checked[match[1]] = true
	}
	seen := map[string]bool{}
	var out []CompletionItem
	for i := len(bound) - 1; i >= 0; i-- {
		name := bound[i][1]
		if checked[name] || seen[name] {
			continue
		}
		seen[name] = true
		out = append(out, CompletionItem{
			Label:    name,
			Kind:     CompletionItemKindVariable,
			Detail:   "pending result",
			SortText: "0-" + name,
		})
	}
	return out, true
}
