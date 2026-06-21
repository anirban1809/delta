package lsp

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"

	"delta/internal/ast"
	"delta/internal/pipeline"
	"delta/internal/semantics"
	"delta/internal/token"
)

var validIdentifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func (s *Server) handleSignatureHelp(msg *Message) {
	var p TextDocumentPositionParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil {
		s.reply(msg, json.RawMessage("null"))
		return
	}
	name, active, ok := callAt(st.contents, p.Position)
	if !ok {
		s.reply(msg, json.RawMessage("null"))
		return
	}
	src := usableResult(st)
	if src == nil || src.RootScope == nil {
		s.reply(msg, json.RawMessage("null"))
		return
	}
	pos := ast.Position{Line: p.Position.Line + 1, Column: p.Position.Character + 1}
	sym, ok := lookupAtPosition(src.RootScope, pos, name)
	if !ok || sym.Kind != semantics.SymbolFunction || sym.Signature == nil {
		s.reply(msg, json.RawMessage("null"))
		return
	}

	sig := sym.Signature
	params := make([]ParameterInformation, 0, len(sig.Parameters))
	labels := make([]string, 0, len(sig.Parameters))
	for i, typ := range sig.Parameters {
		paramName := "arg"
		if i < len(sig.ParameterNames) && sig.ParameterNames[i] != "" {
			paramName = sig.ParameterNames[i]
		}
		label := paramName + ": " + typ.String()
		labels = append(labels, label)
		params = append(params, ParameterInformation{Label: label})
	}
	label := "function " + sym.Name + "(" + strings.Join(labels, ", ") + ")"
	if len(sig.ReturnTypes) > 0 {
		parts := make([]string, 0, len(sig.ReturnTypes))
		for _, typ := range sig.ReturnTypes {
			parts = append(parts, typ.String())
		}
		label += " -> " + strings.Join(parts, ", ")
	}
	if len(sig.ErrorTypes) > 0 {
		parts := make([]string, 0, len(sig.ErrorTypes))
		for _, typ := range sig.ErrorTypes {
			parts = append(parts, typ.String())
		}
		label += " | " + strings.Join(parts, ", ")
	}
	if active >= len(params) && len(params) > 0 {
		active = len(params) - 1
	}
	s.replyJSON(msg, SignatureHelp{
		Signatures: []SignatureInformation{{
			Label:      label,
			Parameters: params,
		}},
		ActiveParameter: max(active, 0),
	})
}

func callAt(contents []byte, pos Position) (string, int, bool) {
	offset := byteOffset(contents, pos)
	if offset < 0 {
		return "", 0, false
	}
	prefix := string(contents[:offset])
	depth := 0
	active := 0
	for i := len(prefix) - 1; i >= 0; i-- {
		switch prefix[i] {
		case ')', '}', ']':
			depth++
		case '(', '{', '[':
			if depth > 0 {
				depth--
				continue
			}
			if prefix[i] != '(' {
				return "", 0, false
			}
			j := i - 1
			for j >= 0 && (prefix[j] == ' ' || prefix[j] == '\t' || prefix[j] == '\n' || prefix[j] == '\r') {
				j--
			}
			end := j + 1
			for j >= 0 && isIdentByte(prefix[j]) {
				j--
			}
			if end == j+1 {
				return "", 0, false
			}
			return prefix[j+1 : end], active, true
		case ',':
			if depth == 0 {
				active++
			}
		}
	}
	return "", 0, false
}

func (s *Server) handleDocumentSymbols(msg *Message) {
	var p DocumentSymbolParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil || st.result == nil {
		s.replyJSON(msg, []DocumentSymbol{})
		return
	}
	var out []DocumentSymbol
	for _, declaration := range st.result.File.Declarations {
		switch decl := declaration.(type) {
		case ast.FunctionDeclaration:
			namePos := ast.Position{Line: decl.Line, Column: decl.Column + len("function ")}
			rng := rangeForBlockOrLine(decl.Body, decl.Position, st.contents)
			out = append(out, DocumentSymbol{
				Name:           decl.Name,
				Detail:         functionDetail(st.result, namePos, decl.Name),
				Kind:           SymbolKindFunction,
				Range:          rng,
				SelectionRange: definitionRange(namePos, decl.Name),
			})
		case ast.ConstDeclaration:
			out = append(out, DocumentSymbol{
				Name:           decl.Name.Name,
				Detail:         typeReferenceDetail(decl.Type),
				Kind:           SymbolKindConstant,
				Range:          lineRange(st.contents, decl.Line-1),
				SelectionRange: identRange(decl.Name),
			})
		case ast.TypeDeclaration:
			symbol := DocumentSymbol{
				Name:           decl.Name.Name,
				Kind:           SymbolKindStruct,
				Range:          lineRange(st.contents, decl.Line-1),
				SelectionRange: identRange(decl.Name),
			}
			if record, ok := decl.RHS.(ast.RecordRHS); ok {
				for _, field := range record.Fields {
					symbol.Children = append(symbol.Children, DocumentSymbol{
						Name:           field.Name.Name,
						Detail:         field.Type.Name.Name,
						Kind:           SymbolKindField,
						Range:          lineRange(st.contents, field.Line-1),
						SelectionRange: identRange(field.Name),
					})
				}
			}
			out = append(out, symbol)
		}
	}
	s.replyJSON(msg, out)
}

func (s *Server) handleReferences(msg *Message) {
	var p ReferenceParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil || st.result == nil {
		s.replyJSON(msg, []Location{})
		return
	}
	sym, id, ok := symbolAt(st.result, p.Position)
	if !ok {
		s.replyJSON(msg, []Location{})
		return
	}
	locations := symbolLocations(p.TextDocument.URI, st.result, sym, p.Context.IncludeDeclaration)
	if len(locations) == 0 && id != nil {
		locations = []Location{{URI: p.TextDocument.URI, Range: identRange(*id)}}
	}
	s.replyJSON(msg, locations)
}

func (s *Server) handlePrepareRename(msg *Message) {
	var p TextDocumentPositionParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil || st.result == nil {
		s.reply(msg, json.RawMessage("null"))
		return
	}
	_, id, ok := symbolAt(st.result, p.Position)
	if !ok || id == nil {
		s.reply(msg, json.RawMessage("null"))
		return
	}
	s.replyJSON(msg, PrepareRenameResult{Range: identRange(*id), Placeholder: id.Name})
}

func (s *Server) handleRename(msg *Message) {
	var p RenameParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	if !validIdentifier.MatchString(p.NewName) || token.LookupIdent(p.NewName) != token.Kind_Identifier {
		s.replyError(msg, ErrorCodeInvalidParams, "new name is not a valid Delta identifier")
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil || st.result == nil {
		s.replyJSON(msg, WorkspaceEdit{})
		return
	}
	sym, _, ok := symbolAt(st.result, p.Position)
	if !ok {
		s.replyJSON(msg, WorkspaceEdit{})
		return
	}
	locations := symbolLocations(p.TextDocument.URI, st.result, sym, true)
	edits := make([]TextEdit, 0, len(locations))
	for _, location := range locations {
		edits = append(edits, TextEdit{Range: location.Range, NewText: p.NewName})
	}
	s.replyJSON(msg, WorkspaceEdit{Changes: map[string][]TextEdit{p.TextDocument.URI: edits}})
}

func symbolAt(src *pipeline.Result, pos Position) (semantics.Symbol, *ast.Identifier, bool) {
	id := identAt(src.File, pos)
	if id == nil {
		return semantics.Symbol{}, nil, false
	}
	if sym, ok := src.Refs[id.Position]; ok {
		return sym, id, true
	}
	sym, ok := lookupAtPosition(src.RootScope, id.Position, id.Name)
	if !ok {
		return semantics.Symbol{}, id, false
	}
	return sym, id, true
}

func symbolLocations(uri string, src *pipeline.Result, target semantics.Symbol, includeDeclaration bool) []Location {
	seen := map[ast.Position]bool{}
	var out []Location
	if includeDeclaration && target.DefPos != (ast.Position{}) {
		seen[target.DefPos] = true
		out = append(out, Location{URI: uri, Range: definitionRange(target.DefPos, target.Name)})
	}
	walkIdentifiers(src.File, func(id ast.Identifier) bool {
		sym, ok := src.Refs[id.Position]
		if !ok {
			candidate, found := lookupAtPosition(src.RootScope, id.Position, id.Name)
			if found && candidate.Kind == semantics.SymbolTypeDecl {
				sym, ok = candidate, true
			}
		}
		if ok && sym.DefPos == target.DefPos && sym.Name == target.Name && !seen[id.Position] {
			seen[id.Position] = true
			out = append(out, Location{URI: uri, Range: identRange(id)})
		}
		return true
	})
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i].Range.Start, out[j].Range.Start
		return a.Line < b.Line || (a.Line == b.Line && a.Character < b.Character)
	})
	return out
}

func memberFieldAt(
	src *pipeline.Result,
	pos Position,
) (ast.MemberAccessExpression, semantics.ResolvedRecordField, bool) {
	var matched ast.MemberAccessExpression
	found := false
	walkMemberExpressions(src.File, func(expr ast.MemberAccessExpression) {
		if found || expr.Member == "" || expr.Line != pos.Line+1 {
			return
		}
		col := pos.Character + 1
		if col >= expr.Column && col <= expr.Column+len(expr.Member) {
			matched = expr
			found = true
		}
	})
	if !found {
		return ast.MemberAccessExpression{}, semantics.ResolvedRecordField{}, false
	}
	receiverType, ok := expressionType(src, matched.Receiver)
	if !ok {
		return ast.MemberAccessExpression{}, semantics.ResolvedRecordField{}, false
	}
	fields, ok := recordFields(src, receiverType)
	if !ok {
		return ast.MemberAccessExpression{}, semantics.ResolvedRecordField{}, false
	}
	for _, field := range fields {
		if field.Name == matched.Member {
			return matched, field, true
		}
	}
	return ast.MemberAccessExpression{}, semantics.ResolvedRecordField{}, false
}

func expressionType(src *pipeline.Result, expression ast.Expression) (semantics.Type, bool) {
	switch expr := expression.(type) {
	case ast.Identifier:
		if sym, ok := src.Refs[expr.Position]; ok {
			return sym.Type, sym.Type.Kind != semantics.TypeInvalid
		}
		if sym, ok := lookupAtPosition(src.RootScope, expr.Position, expr.Name); ok {
			return sym.Type, sym.Type.Kind != semantics.TypeInvalid
		}
	case ast.IntegerLiteral:
		return semantics.ResolveTypeName("int32")
	case ast.FloatLiteral:
		return semantics.ResolveTypeName("float64")
	case ast.BooleanLiteral:
		return semantics.ResolveTypeName("bool")
	case ast.StringLiteral:
		return semantics.ResolveTypeName("string")
	case ast.CharacterLiteral:
		return semantics.ResolveTypeName("char")
	case ast.FunctionCallExpression:
		if identifier, ok := expr.Callee.(ast.Identifier); ok {
			sym, found := src.Refs[identifier.Position]
			if !found {
				sym, found = lookupAtPosition(src.RootScope, identifier.Position, identifier.Name)
			}
			if found && sym.Signature != nil && len(sym.Signature.ReturnTypes) == 1 {
				return sym.Signature.ReturnTypes[0], true
			}
		}
	case ast.MemberAccessExpression:
		receiverType, ok := expressionType(src, expr.Receiver)
		if !ok {
			return semantics.Type{}, false
		}
		fields, ok := recordFields(src, receiverType)
		if !ok {
			return semantics.Type{}, false
		}
		return fieldTypeByName(fields, expr.Member)
	}
	return semantics.Type{}, false
}

var semanticTokenTypes = []string{
	"type", "function", "parameter", "variable", "property",
}

func (s *Server) handleSemanticTokens(msg *Message) {
	var p SemanticTokensParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil || st.result == nil {
		s.replyJSON(msg, SemanticTokens{Data: []uint32{}})
		return
	}
	type item struct {
		line, col, length, typ int
	}
	var items []item
	seen := map[ast.Position]bool{}
	walkIdentifiers(st.result.File, func(id ast.Identifier) bool {
		if id.Name == "" || seen[id.Position] {
			return true
		}
		sym, ok := st.result.Refs[id.Position]
		if !ok {
			sym, ok = lookupAtPosition(st.result.RootScope, id.Position, id.Name)
		}
		if !ok {
			return true
		}
		typ := semanticTypeForSymbol(sym.Kind)
		if typ < 0 {
			return true
		}
		seen[id.Position] = true
		items = append(items, item{id.Line - 1, id.Column - 1, len(id.Name), typ})
		return true
	})
	walkMemberExpressions(st.result.File, func(expr ast.MemberAccessExpression) {
		if expr.Member == "" || seen[expr.Position] {
			return
		}
		seen[expr.Position] = true
		items = append(items, item{expr.Line - 1, expr.Column - 1, len(expr.Member), 4})
	})
	sort.Slice(items, func(i, j int) bool {
		return items[i].line < items[j].line ||
			(items[i].line == items[j].line && items[i].col < items[j].col)
	})
	data := make([]uint32, 0, len(items)*5)
	lastLine, lastCol := 0, 0
	for i, current := range items {
		deltaLine := current.line - lastLine
		deltaCol := current.col
		if i > 0 && deltaLine == 0 {
			deltaCol -= lastCol
		}
		data = append(data,
			uint32(deltaLine), uint32(deltaCol), uint32(current.length),
			uint32(current.typ), 0,
		)
		lastLine, lastCol = current.line, current.col
	}
	s.replyJSON(msg, SemanticTokens{Data: data})
}

func semanticTypeForSymbol(kind semantics.SymbolKind) int {
	switch kind {
	case semantics.SymbolTypeDecl, semantics.SymbolReturn, semantics.SymbolError:
		return 0
	case semantics.SymbolFunction:
		return 1
	case semantics.SymbolParameter:
		return 2
	case semantics.SymbolFileConst, semantics.SymbolLocalConst, semantics.SymbolLocalLet:
		return 3
	default:
		return -1
	}
}

func (s *Server) handleInlayHints(msg *Message) {
	var p InlayHintParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil || st.result == nil {
		s.replyJSON(msg, []InlayHint{})
		return
	}
	var hints []InlayHint
	walkVariableDeclarations(st.result.File, func(decl ast.VariableDeclarationStatement) {
		if decl.Type.Name.Name != "" || decl.Name == "" {
			return
		}
		namePos := ast.Position{Line: decl.Line, Column: decl.Column + len("const ")}
		if decl.Mutable {
			namePos.Column = decl.Column + len("let ")
		}
		sym, ok := lookupAtPosition(st.result.RootScope, namePos, decl.Name)
		if !ok || sym.Type.Kind == semantics.TypeInvalid || sym.Type.Kind == semantics.TypeEmpty {
			return
		}
		pos := Position{Line: namePos.Line - 1, Character: namePos.Column - 1 + len(decl.Name)}
		if positionInRange(pos, p.Range) {
			hints = append(hints, InlayHint{Position: pos, Label: ": " + sym.Type.String(), Kind: InlayHintKindType})
		}
	})
	s.replyJSON(msg, hints)
}

func (s *Server) handleFoldingRanges(msg *Message) {
	var p FoldingRangeParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil || st.result == nil {
		s.replyJSON(msg, []FoldingRange{})
		return
	}
	var out []FoldingRange
	walkBlocks(st.result.File, func(block ast.BlockStatement) {
		if block.End.Line > block.Line {
			out = append(out, FoldingRange{
				StartLine: block.Line - 1,
				EndLine:   block.End.Line - 1,
			})
		}
	})
	s.replyJSON(msg, out)
}

func (s *Server) handleSelectionRanges(msg *Message) {
	var p SelectionRangeParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil || st.result == nil {
		s.replyJSON(msg, []SelectionRange{})
		return
	}
	out := make([]SelectionRange, 0, len(p.Positions))
	for _, pos := range p.Positions {
		base := lineRange(st.contents, pos.Line)
		if id := identAt(st.result.File, pos); id != nil {
			base = identRange(*id)
		}
		current := &SelectionRange{Range: base}
		var containing []ast.BlockStatement
		walkBlocks(st.result.File, func(block ast.BlockStatement) {
			rng := blockRange(block)
			if positionInRange(pos, rng) {
				containing = append(containing, block)
			}
		})
		sort.Slice(containing, func(i, j int) bool {
			return rangeSize(blockRange(containing[i])) < rangeSize(blockRange(containing[j]))
		})
		for _, block := range containing {
			rng := blockRange(block)
			if rng == current.Range {
				continue
			}
			current = &SelectionRange{Range: rng, Parent: current}
		}
		// LSP expects the smallest selection at the top level.
		for current.Parent != nil && current.Parent.Range == base {
			current = current.Parent
		}
		out = append(out, reverseSelection(current))
	}
	s.replyJSON(msg, out)
}

func reverseSelection(root *SelectionRange) SelectionRange {
	ranges := []Range{}
	for current := root; current != nil; current = current.Parent {
		ranges = append(ranges, current.Range)
	}
	var result *SelectionRange
	for _, rng := range ranges {
		result = &SelectionRange{Range: rng, Parent: result}
	}
	if result == nil {
		return SelectionRange{}
	}
	return *result
}

func (s *Server) handleCodeActions(msg *Message) {
	var p CodeActionParams
	if err := json.Unmarshal(msg.Params, &p); err != nil {
		s.replyError(msg, ErrorCodeInvalidParams, err.Error())
		return
	}
	st := s.documents[p.TextDocument.URI]
	if st == nil {
		s.replyJSON(msg, []CodeAction{})
		return
	}
	var actions []CodeAction
	for _, diagnostic := range p.Context.Diagnostics {
		line := lineAt(st.contents, diagnostic.Range.Start.Line)
		switch {
		case strings.Contains(diagnostic.Message, "must be followed by `as result`"):
			if idx := strings.LastIndex(line, ";"); idx >= 0 {
				edit := TextEdit{
					Range: Range{
						Start: Position{Line: diagnostic.Range.Start.Line, Character: idx},
						End:   Position{Line: diagnostic.Range.Start.Line, Character: idx},
					},
					NewText: " as result",
				}
				actions = append(actions, quickFix(
					"Bind the fallible result",
					p.TextDocument.URI,
					diagnostic,
					edit,
				))
			}
		case strings.Contains(diagnostic.Message, "cannot fail; remove `as result`"):
			if idx := strings.LastIndex(line, " as "); idx >= 0 {
				end := idx + len(" as ")
				for end < len(line) && isIdentByte(line[end]) {
					end++
				}
				edit := TextEdit{
					Range: Range{
						Start: Position{Line: diagnostic.Range.Start.Line, Character: idx},
						End:   Position{Line: diagnostic.Range.Start.Line, Character: end},
					},
				}
				actions = append(actions, quickFix(
					"Remove unnecessary result binding",
					p.TextDocument.URI,
					diagnostic,
					edit,
				))
			}
		}
	}
	s.replyJSON(msg, actions)
}

func quickFix(title, uri string, diagnostic Diagnostic, edit TextEdit) CodeAction {
	return CodeAction{
		Title:       title,
		Kind:        "quickfix",
		Diagnostics: []Diagnostic{diagnostic},
		Edit:        WorkspaceEdit{Changes: map[string][]TextEdit{uri: {edit}}},
		IsPreferred: true,
	}
}

func (s *Server) replyJSON(msg *Message, value any) {
	body, err := json.Marshal(value)
	if err != nil {
		s.replyError(msg, ErrorCodeInternalError, err.Error())
		return
	}
	s.reply(msg, body)
}

func usableResult(st *docState) *pipeline.Result {
	if st == nil {
		return nil
	}
	if st.result == nil {
		return st.lastGood
	}
	if pipeline.HasParseErrors(st.result) {
		return st.lastGood
	}
	return st.result
}

func functionDetail(src *pipeline.Result, pos ast.Position, name string) string {
	if sym, ok := lookupAtPosition(src.RootScope, pos, name); ok {
		return sym.Display
	}
	return ""
}

func typeReferenceDetail(ref ast.TypeReference) string {
	return ref.Name.Name
}

func rangeForBlockOrLine(block *ast.BlockStatement, start ast.Position, contents []byte) Range {
	if block == nil || block.End == (ast.Position{}) {
		return lineRange(contents, start.Line-1)
	}
	return Range{
		Start: astPositionToLSP(start),
		End:   Position{Line: block.End.Line - 1, Character: block.End.Column},
	}
}

func lineRange(contents []byte, line int) Range {
	text := lineAt(contents, line)
	return Range{
		Start: Position{Line: max(line, 0), Character: 0},
		End:   Position{Line: max(line, 0), Character: len(text)},
	}
}

func blockRange(block ast.BlockStatement) Range {
	end := astPositionToLSP(block.End)
	if block.End == (ast.Position{}) {
		end = astPositionToLSP(block.Position)
	}
	return Range{Start: astPositionToLSP(block.Position), End: end}
}

func positionInRange(pos Position, rng Range) bool {
	if pos.Line < rng.Start.Line || pos.Line > rng.End.Line {
		return false
	}
	if pos.Line == rng.Start.Line && pos.Character < rng.Start.Character {
		return false
	}
	if pos.Line == rng.End.Line && pos.Character > rng.End.Character {
		return false
	}
	return true
}

func rangeSize(rng Range) int {
	return (rng.End.Line-rng.Start.Line)*1_000_000 + rng.End.Character - rng.Start.Character
}

func byteOffset(contents []byte, pos Position) int {
	line, offset := 0, 0
	for line < pos.Line && offset < len(contents) {
		if contents[offset] == '\n' {
			line++
		}
		offset++
	}
	if line != pos.Line {
		return -1
	}
	return min(offset+pos.Character, len(contents))
}

func isIdentByte(ch byte) bool {
	return ch == '_' || ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9'
}
