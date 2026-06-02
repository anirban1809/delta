# Plan: Delta LSP v1 (Hover, Go-to-Definition, Completion)

Date drafted: 2026-06-01
Status: planning, not started.
Predecessor: [lsp-v0.md](lsp-v0.md) — diagnostics-only server.

## Goal

Build on the v0 server (framing, dispatch, document cache, diagnostics) to
ship three editor features that share the same underlying machinery:

1. **`textDocument/hover`** — show the symbol kind and signature when the
   cursor sits on an identifier.
2. **`textDocument/definition`** — jump from a use-site identifier to its
   declaration site.
3. **`textDocument/completion`** — offer Delta keywords plus identifiers
   that are visible in the scope at the cursor.

All three need the same two primitives v0 doesn't have:
- A way to map `(uri, line, column)` to the AST node under the cursor.
- A way to enumerate symbols that are visible at a position, with their
  declaration sites.

Doing them together amortizes that work. Doing any one of them in isolation
would still pay for ~80% of it.

## What's missing today

- `pipeline.Compile` returns `Result{File, ErrorBag}` but the LSP only reads
  `ErrorBag` — the AST is thrown away after each analysis.
- `semantics.Symbol` stores `Name` and `Kind`, no declaration position and
  no rendered type/signature. Definition jumps and hover labels both need
  that.
- `Analyzer` resolves identifiers against scopes but discards the result —
  there's no `Identifier → Symbol` map an LSP handler can query.
- There's no scope tree indexed by source position, so a request can't
  answer "what's in scope here?" without re-walking the AST.

Each of these is a small, local change; together they are the whole plan.

## Decisions already made

- **Reuse v0 scaffolding**: same `Server` struct, same dispatch, same
  framing. Hover/definition/completion become three more cases on the
  `switch msg.Method`.
- **Cache analysis, not re-run on request**: keep the latest
  `*pipeline.Result` per URI alongside the source text. Hover/definition
  read from it directly; completion may fall back to the prior good result
  when the current text doesn't parse (see "Tolerance" below).
- **Position-indexed scope tree, not on-demand re-walk**: the analyzer
  builds a tree of `(BlockStatement.Position range, *Scope)` nodes during
  its existing walk. Completion looks up the deepest node containing the
  cursor.
- **Identifier→Symbol map captured during analysis**: `Analyzer` writes
  every resolved reference into `map[ast.Identifier]Symbol` on the
  `Result`. Hover and definition are O(1) lookups after position→identifier.
- **Identifier range from name length**: today `ast.Position` has just
  `Line` and `Column`. Adding an end position to every node is invasive;
  instead, for identifiers, compute the range as
  `[col, col+len(name))` on the same line. Identifiers don't span lines.
- **No semantic tokens, no signature help, no rename, no document
  symbols, no workspace symbols** — those are v2+. Keep v1 tightly scoped.
- **Trigger characters for completion**: none. Editors invoke completion
  on identifier characters by default; we don't need `.` or `::` yet
  (no member access, no qualified names in the language).
- **Snippet support**: not in v1. Plain text inserts only. Function
  completions don't auto-insert `(…)`; that's a v2 nicety.

## Architecture overview

```
                       ┌──────────────────────┐
   editor request ───▶ │ Server (lsp/server)  │
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │ docState[uri]        │
                       │  ├─ contents []byte  │
                       │  └─ result *Result   │ ← cached from last analyze
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │ pipeline.Result      │
                       │  ├─ File             │
                       │  ├─ ErrorBag         │
                       │  ├─ Refs   map[Ident→Symbol]  ← NEW
                       │  └─ Scopes ScopeTree           ← NEW
                       └──────────────────────┘
```

Hover/definition: `(uri, pos) → identifier → Refs → Symbol → DefPos / type`.
Completion: `(uri, pos) → ScopeTree.lookup(pos) → walk scope chain → items`,
plus keyword list (static), plus a partial-word filter the editor applies.

## File and type changes

### `internal/ast/types.go`

No structural change. Identifiers already carry `Position` (line, column).
Their byte length is `len(Name)`; we'll compute end column as needed.

If we later need precise end positions for non-identifier nodes (e.g. for
hover on function-call expressions), add `EndPosition Position` to the
nodes that need it. Not required for v1.

### `internal/semantics/semantics.go`

Extend `Symbol`:

```go
type Symbol struct {
    Name      string
    Kind      SymbolKind
    DefPos    ast.Position   // 1-based, start of the declaring identifier
    Signature string         // pretty-printed for hover, e.g.
                             //   "function add(a: int32, b: int32) -> int32"
                             //   "const PI: float64"
                             //   "let counter: int32"
}
```

Populate `DefPos` and `Signature` at every `AddSymbol` call site:

| Declaration site                              | DefPos                       | Signature shape |
| --------------------------------------------- | ---------------------------- | --------------- |
| `FunctionDeclaration` (global pass)           | `declaration.Position`       | `function NAME(params) -> ret` |
| `ConstDeclaration` (global pass)              | `declaration.Name.Position`  | `const NAME: TYPE` |
| `FunctionParameter` (function scope)          | `parameter.Position`         | `param NAME: TYPE` |
| `VariableDeclarationStatement` (block scope)  | `statement.Position`         | `const/let NAME: TYPE` (use `Mutable` to pick) |

`Signature` is built from the AST node at declaration time — cheap, and
keeps hover formatting out of the LSP layer.

Add a reference map and scope tree to the analyzer's outputs:

```go
type ScopeNode struct {
    Range    ast.Range       // start/end positions; see below
    Scope    *Scope
    Children []*ScopeNode
}

// ast.Range is a new tiny struct (or use two ast.Position fields directly):
//   type Range struct { Start, End Position }

type Analyzer struct {
    AST         ast.File
    ErrorBag    *diagnostics.ErrorBag
    GlobalScope *Scope

    // Outputs populated during Analyze().
    Refs        map[*ast.Identifier]Symbol  // resolved references
    RootScope   *ScopeNode                  // tree of block scopes
}
```

Why `*ast.Identifier` keys instead of value keys: `ast.Identifier` is a
struct and not addressable across re-walks. We need a stable identity. Two
options:

- **(a)** Switch `Expression` cases that hold an `Identifier` to use
  `*ast.Identifier`. Invasive — touches parser and every analyzer arm.
- **(b)** Key by `ast.Position` instead: `map[ast.Position]Symbol`. Two
  identifiers never share the same `(line, column)` in a valid AST.
  Cheap, no parser changes, slightly less type-safe.

**Decision: (b)**. Position keys. The map is internal to the result; if we
ever want type safety we can wrap it in a method.

```go
Refs map[ast.Position]Symbol  // identifier-use-position → resolved symbol
```

The scope tree is built when `AnalyzeScope` and `AnalyzeFunctionDeclaration`
construct their `Scope` values: wrap each in a `ScopeNode`, link to parent,
record the originating block's start/end positions. For block start, use
`block.Position` (start of `{`); for end, use the position of the closing
`}` — which the parser knows but doesn't currently store. Easiest fix: have
the parser set `BlockStatement.End` (a new `ast.Position` field) when it
consumes the `RightBrace` token. One-line parser change.

`Refs` is populated in two places:

1. `AnalyzeExpression`'s `ast.Identifier` case — after `FindSymbol`, record
   `Refs[expression.Position] = a.GetSymbol(scope, expression.Name)`.
2. `AssignmentStatement` — record the target identifier's resolution.

(Function-call callees already go through the `Identifier` arm via the
recursive `AnalyzeExpression(expression.Callee, scope)` call; nothing extra
needed there.)

### `internal/pipeline/pipeline.go`

Expose the new analyzer outputs on `Result`:

```go
type Result struct {
    File      ast.File
    ErrorBag  *diagnostics.ErrorBag
    Refs      map[ast.Position]semantics.Symbol
    RootScope *semantics.ScopeNode
}
```

`Compile` returns the result even when there are parse errors, as today.
Hover/definition just return `null`/`[]` when the lookup misses, so partial
analysis is fine.

### `internal/lsp/server.go`

Replace the document map:

```go
type docState struct {
    contents []byte
    result   *pipeline.Result   // last analysis; may be a partial result on parse error
    lastGood *pipeline.Result   // last result with no parse errors; used by completion fallback
}

type Server struct {
    // ... existing fields ...
    documents map[string]*docState
}
```

`analyzeAndPublish` updates both fields:

```go
func (s *Server) analyzeAndPublish(uri string) {
    st := s.documents[uri]
    result := pipeline.Compile(uri, st.contents)
    st.result = result
    if result != nil && !hasParseErrors(result.ErrorBag) {
        st.lastGood = result
    }
    // publishDiagnostics as before
}
```

`hasParseErrors` checks `result.ErrorBag.Errors` for `Stage == diagnostics.Parser`
or `Tokenizer`. Semantic errors don't disqualify the result for completion;
they often *are* the reason the user is asking for completion.

### `internal/lsp/protocol.go`

New types (additive — don't touch existing v0 types):

```go
// Hover
type HoverParams = TextDocumentPositionParams
type Hover struct {
    Contents MarkupContent `json:"contents"`
    Range    *Range        `json:"range,omitempty"`
}
type MarkupContent struct {
    Kind  string `json:"kind"`  // "markdown" or "plaintext"
    Value string `json:"value"`
}

// Definition
type DefinitionParams = TextDocumentPositionParams
type Location struct {
    URI   string `json:"uri"`
    Range Range  `json:"range"`
}

// Completion
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
    Kind       int    `json:"kind"`           // LSP CompletionItemKind enum
    Detail     string `json:"detail,omitempty"`         // e.g. signature
    SortText   string `json:"sortText,omitempty"`       // for grouping
    InsertText string `json:"insertText,omitempty"`     // if different from label
}
type CompletionList struct {
    IsIncomplete bool             `json:"isIncomplete"`
    Items        []CompletionItem `json:"items"`
}

// Shared
type TextDocumentPositionParams struct {
    TextDocument TextDocumentIdentifier `json:"textDocument"`
    Position     Position               `json:"position"`
}
```

Extend `ServerCapabilities`:

```go
type ServerCapabilities struct {
    TextDocumentSync   TextDocumentSyncOptions `json:"textDocumentSync"`
    HoverProvider      bool                    `json:"hoverProvider"`
    DefinitionProvider bool                    `json:"definitionProvider"`
    CompletionProvider *CompletionOptions      `json:"completionProvider,omitempty"`
}
type CompletionOptions struct {
    TriggerCharacters []string `json:"triggerCharacters,omitempty"` // empty for v1
    ResolveProvider   bool     `json:"resolveProvider"`             // false
}
```

LSP `CompletionItemKind` values we'll use:

| Symbol kind        | CompletionItemKind |
| ------------------ | ------------------ |
| `SymbolFunction`   | `3` (Function)     |
| `SymbolFileConst`  | `21` (Constant)    |
| `SymbolLocalConst` | `21` (Constant)    |
| `SymbolParameter`  | `6` (Variable)     |
| `SymbolLocalLet`   | `6` (Variable)     |
| Keyword            | `14` (Keyword)     |

## Position-to-identifier lookup

A small file `internal/lsp/position.go`:

```go
// identAt returns the identifier covering pos, or nil. Position is 0-based
// LSP coordinates; converted to 1-based for AST comparison.
func identAt(file ast.File, pos Position) *ast.Identifier {
    line, col := pos.Line+1, pos.Character+1
    var found *ast.Identifier
    walkIdentifiers(file, func(id *ast.Identifier) {
        if id.Line != line {
            return
        }
        start := id.Column
        end := id.Column + len(id.Name)
        if col >= start && col < end {
            found = id
        }
    })
    return found
}
```

`walkIdentifiers` is a hand-written visitor over the AST node types defined
in [internal/ast/types.go](../../internal/ast/types.go). Boring but
mechanical; one case per node type. It returns `*ast.Identifier` so the
caller can read `Position` and `Name` directly.

Identifier range for `Hover.Range` and `Location.Range`:

```go
func identRange(id *ast.Identifier) Range {
    start := Position{Line: id.Line - 1, Character: id.Column - 1}
    end   := Position{Line: id.Line - 1, Character: id.Column - 1 + len(id.Name)}
    return Range{Start: start, End: end}
}
```

## Handlers

### Hover

```go
func (s *Server) handleHover(msg *Message) {
    var p HoverParams
    if err := json.Unmarshal(msg.Params, &p); err != nil {
        s.replyError(msg, ErrorCodeInvalidParams, err.Error())
        return
    }
    doc := s.documents[p.TextDocument.URI]
    if doc == nil || doc.result == nil {
        s.reply(msg, json.RawMessage("null"))
        return
    }
    id := identAt(doc.result.File, p.Position)
    if id == nil {
        s.reply(msg, json.RawMessage("null"))
        return
    }
    sym, ok := doc.result.Refs[id.Position]
    if !ok {
        // Identifier under cursor may itself be a declaration — try resolving by name in scope-at-position.
        sym, ok = lookupAtPosition(doc.result.RootScope, id.Position, id.Name)
        if !ok {
            s.reply(msg, json.RawMessage("null"))
            return
        }
    }
    rng := identRange(id)
    body, _ := json.Marshal(Hover{
        Contents: MarkupContent{
            Kind:  "markdown",
            Value: "```delta\n" + sym.Signature + "\n```",
        },
        Range: &rng,
    })
    s.reply(msg, body)
}
```

Hover-on-declaration is handled by the `lookupAtPosition` fallback: the
`Refs` map only carries *use* sites; declarations resolve themselves by
name in their own scope.

### Definition

```go
func (s *Server) handleDefinition(msg *Message) {
    var p DefinitionParams
    if err := json.Unmarshal(msg.Params, &p); err != nil {
        s.replyError(msg, ErrorCodeInvalidParams, err.Error())
        return
    }
    doc := s.documents[p.TextDocument.URI]
    if doc == nil || doc.result == nil {
        s.reply(msg, json.RawMessage("[]"))
        return
    }
    id := identAt(doc.result.File, p.Position)
    if id == nil {
        s.reply(msg, json.RawMessage("[]"))
        return
    }
    sym, ok := doc.result.Refs[id.Position]
    if !ok || sym.DefPos == (ast.Position{}) {
        s.reply(msg, json.RawMessage("[]"))
        return
    }
    loc := Location{
        URI: p.TextDocument.URI,                                  // single-file: same URI
        Range: Range{
            Start: Position{Line: sym.DefPos.Line - 1, Character: sym.DefPos.Column - 1},
            End:   Position{Line: sym.DefPos.Line - 1, Character: sym.DefPos.Column - 1 + len(sym.Name)},
        },
    }
    body, _ := json.Marshal([]Location{loc})
    s.reply(msg, body)
}
```

Always reply with an array (LSP allows `Location | Location[] | null`;
arrays are simplest for clients). Same URI for v1 — no multi-file resolution
yet.

If the cursor is *on* the declaration itself, `Refs[id.Position]` misses,
and we return `[]`. That's the right behavior — go-to-definition from a
declaration is conventionally a no-op (some servers go to the symbol's
references list, but we don't have a `findReferences` story yet).

### Completion

```go
func (s *Server) handleCompletion(msg *Message) {
    var p CompletionParams
    if err := json.Unmarshal(msg.Params, &p); err != nil {
        s.replyError(msg, ErrorCodeInvalidParams, err.Error())
        return
    }
    doc := s.documents[p.TextDocument.URI]
    items := []CompletionItem{}

    // 1. Static keywords — always offered.
    items = append(items, keywordCompletions()...)

    // 2. Symbols in scope at the cursor.
    if doc != nil {
        src := doc.result
        if src == nil || hasParseErrors(src.ErrorBag) {
            src = doc.lastGood  // fall back to last successful parse
        }
        if src != nil && src.RootScope != nil {
            astPos := ast.Position{Line: p.Position.Line + 1, Column: p.Position.Character + 1}
            for _, sym := range visibleSymbols(src.RootScope, astPos) {
                items = append(items, symbolToCompletion(sym))
            }
        }
    }

    body, _ := json.Marshal(CompletionList{IsIncomplete: false, Items: items})
    s.reply(msg, body)
}
```

#### Keyword set

Pull from [internal/token/token.go](../../internal/token/token.go) so the
list stays in sync. As of today:

```
function, return, const, let, if, else, while, true, false
```

`true`/`false` come back from `LookupIdent` as `Kind_BooleanLiteral` but
they're literal keywords from a completion perspective.

```go
func keywordCompletions() []CompletionItem {
    kw := []string{"function", "return", "const", "let", "if", "else", "while", "true", "false"}
    out := make([]CompletionItem, 0, len(kw))
    for _, k := range kw {
        out = append(out, CompletionItem{
            Label:    k,
            Kind:     14, // Keyword
            SortText: "9-" + k,  // sort keywords after symbols
        })
    }
    return out
}
```

`SortText` puts user-defined symbols above keywords in the popup; the
editor sorts lexicographically on `SortText` if present, otherwise on
`Label`. Use `"1-" + name` for symbols, `"9-" + keyword` for keywords.

#### Scope-at-position

```go
// visibleSymbols returns every symbol reachable from the scope containing pos.
// Locals are filtered by declaration order: a let/const declared *after* pos
// in the same block is not yet visible. Globals (functions, file consts) are
// always visible — the analyzer's two-pass design admits forward references
// at the file level.
func visibleSymbols(root *semantics.ScopeNode, pos ast.Position) []semantics.Symbol {
    deepest := findDeepest(root, pos) // walk down to innermost containing scope
    var out []semantics.Symbol
    seen := map[string]bool{}
    for s := deepest; s != nil; s = parentOf(s) {
        for name, sym := range s.Scope.Symbols {
            if seen[name] {
                continue  // shadowing: inner wins
            }
            if isLocalKind(sym.Kind) && positionBefore(pos, sym.DefPos) {
                continue  // not yet declared
            }
            seen[name] = true
            out = append(out, sym)
        }
    }
    return out
}
```

`isLocalKind` returns true for `SymbolLocalConst`, `SymbolLocalLet`,
`SymbolParameter` (well, parameters are visible throughout the body, so
treat parameters as not-position-gated — they're declared at the function
header which is always before the body). Concretely: gate only
`SymbolLocalConst` and `SymbolLocalLet`.

`positionBefore(a, b)` compares `(a.Line, a.Column)` lexicographically.

`findDeepest` is a recursive walk: if `pos` is inside any child's range,
recurse into the child; otherwise return the current node.

#### Symbol → CompletionItem

```go
func symbolToCompletion(sym semantics.Symbol) CompletionItem {
    return CompletionItem{
        Label:    sym.Name,
        Kind:     completionKindFor(sym.Kind),
        Detail:   sym.Signature,
        SortText: "1-" + sym.Name,
    }
}
```

No `InsertText` — just insert the bare name. Function-call insertion
(`name(${1:arg})`) is a v2 enhancement that needs snippet support.

#### Tolerance: completion on broken source

The user is typing — the document often won't parse. Strategies:

1. **Fall back to `lastGood`** (chosen). If the current document fails to
   parse, scope-aware completion uses the last good `Result`. Worst case:
   the user typed something inside a brand-new block that doesn't exist in
   `lastGood` — they get parent-scope completions only, which is still
   better than nothing.
2. **Recover at the parser level**. Out of scope for v1; the parser
   doesn't yet have error recovery rich enough for this.
3. **Token-only completion**. Skip the AST and provide just keywords +
   globally-declared symbols from a regex scan. Too crude.

Keywords are always offered, even with `lastGood == nil` — that's the
useful answer for an empty buffer.

## Tasks (in execution order)

1. **Parser: record block end position.** Add `End ast.Position` to
   `BlockStatement`; set it when the parser consumes the closing `}`. One
   field, one assignment, two test updates if any assert on the AST shape.
2. **Semantics: extend `Symbol`.** Add `DefPos` and `Signature`. Update
   every `AddSymbol` call site to populate both. Update existing tests for
   the new fields.
3. **Semantics: build `Refs` and `RootScope`.** Add the fields to
   `Analyzer`, populate them inside `AnalyzeExpression`'s identifier arm,
   `AssignmentStatement`'s target, and inside `AnalyzeScope` /
   `AnalyzeFunctionDeclaration` (scope nodes). Wire into `Result`.
4. **LSP: cache analysis per doc.** Replace `documents map[string][]byte`
   with `map[string]*docState`. Track `result` and `lastGood`.
5. **LSP: position lookup helpers.** Add `internal/lsp/position.go` with
   `identAt`, `identRange`, `walkIdentifiers`.
6. **LSP: hover handler + capability + protocol types.** Smoke-test with
   the test source at [test-source/hello.delta](../../test-source/hello.delta).
7. **LSP: definition handler + capability.** Smoke-test that jumping from
   a call site to its function declaration returns the right `Location`.
8. **LSP: completion handler + capability + keyword list.** Smoke-test
   that triggering completion inside a function body returns parameters,
   in-scope locals declared above the cursor, file-level functions/consts,
   and the keyword set.
9. **Verify in VS Code.** Run the existing extension from
   [editors/vscode](../../editors/vscode); hover, F12, and Ctrl-Space
   should all do the right thing.

Steps 1–3 are the analyzer-side bulk of the work. Steps 4–9 are
mechanical once those land.

## What this explicitly does NOT do

- **Signature help** (`textDocument/signatureHelp`) — the popup that shows
  parameter info while typing a call. Needs cursor-inside-call-args
  tracking and per-parameter highlighting. v2.
- **Document symbols / workspace symbols** — outline view, symbol search.
  Easy to add once `Refs` and `RootScope` exist, but not in v1's user
  story.
- **Find references** — inverse of go-to-definition. Needs a multi-pass
  walk to collect every use of a symbol. v2.
- **Rename** — depends on find-references. v2 at earliest.
- **Multi-file resolution** — every `Location.URI` in v1 is the same URI
  the request came in on. Imports/modules don't exist in the language yet.
- **Cross-file completion** — same reason.
- **Snippet insertion** for completion items — plain text only.
- **Type-aware completion** — `completion-after-dot`, member access — not
  in the language surface yet.
- **Incremental document sync** — still full-sync from v0.
- **Cancellation** — completion can be slow if the AST gets large, but
  Delta files are tiny for the foreseeable future. Skip
  `$/cancelRequest` until it matters.

## Risks and footguns

- **Stale `Refs` map after didChange.** The map is rebuilt on every
  `analyzeAndPublish`, so as long as handlers only read from
  `doc.result.Refs` (not from a captured pointer), staleness can't happen.
  Don't cache `*Result` across handler invocations.
- **Cursor at end-of-identifier.** When the user just finished typing
  `foo` and hits Ctrl-Space, the cursor is at column `foo.col + 3`, which
  is *past* the identifier's range (`[col, col+3)` is half-open). For
  completion that's fine — we don't need an identifier to be under the
  cursor. For hover/definition it's a UX wart but acceptable; the user
  clicks slightly to the left.
- **`identAt` on a multi-keyword line.** Identifiers don't span lines in
  this grammar, so a per-line scan is correct. If string interpolation
  arrives and brings multi-line tokens, revisit.
- **Scope-tree consistency with errors.** If the analyzer aborts mid-block
  on a semantic error, scopes for code below the error may be missing.
  Today `AnalyzeScope` doesn't early-return on error — it accumulates and
  keeps going — so this isn't a current issue. Don't add early returns
  without thinking about LSP impact.
- **`lastGood` getting stuck.** If the user opens a file that has never
  parsed cleanly, `lastGood == nil` and completion offers only keywords.
  That's a feature, not a bug — but flag it if users complain.
- **Position-keyed `Refs` collisions.** Two identifiers can't share a
  `(line, column)` in well-formed source, but a broken parser could in
  principle produce duplicates. The map will silently overwrite. Low
  stakes; not worth a defensive check.
- **`true` / `false` aren't really keywords.** The tokenizer returns them
  as `Kind_BooleanLiteral`. We offer them as completion keywords anyway
  because users think of them that way. Just don't add them to a future
  "real keyword" set used by, say, a semantic-tokens encoder.

## What this unblocks

- The first round of "feels like a real language" editor support. The gap
  between v0 (just squiggles) and v1 (jump-to-def + hover + autocomplete)
  is the difference between "compiler with diagnostics" and "language with
  a development environment."
- Foundations for v2 features: `Refs`, `RootScope`, and `identAt` are all
  reusable for signature help, find-references, rename, and document
  symbols. None of those need new core machinery — just new handlers.
