import {
    CompletionItemKind,
    createConnection,
    DiagnosticSeverity,
    DidChangeWatchedFilesNotification,
    MarkupKind,
    ProposedFeatures,
    TextDocumentSyncKind,
    type CompletionItem,
    type Connection,
    type Diagnostic,
    type Position,
} from "vscode-languageserver/node.js";
import { fileURLToPath } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver/node.js";
import { compileSource } from "../compiler/pipeline.js";
import { SourceIndex, symbolMarkdown, type IndexedSymbol } from "./source-index.js";
import { LSP_VERSION } from "./version.js";

type DocumentState = { index: SourceIndex };
const documents = new TextDocuments(TextDocument);
const states = new Map<string, DocumentState>();
const connection: Connection = createConnection(
    ProposedFeatures.all,
    process.stdin,
    process.stdout,
);

const keywords = [
    "function",
    "return",
    "const",
    "let",
    "if",
    "else",
    "while",
    "for",
    "switch",
    "case",
    "default",
    "type",
    "struct",
    "enum",
    "union",
    "as",
    "check",
    "forward",
    "error",
    "break",
    "continue",
    "new",
    "move",
    "clone",
    "edit",
    "unique",
    "heap",
    "owned",
];
const primitives = [
    "int8",
    "int16",
    "int32",
    "int64",
    "uint8",
    "uint16",
    "uint32",
    "uint64",
    "intsize",
    "uintsize",
    "float32",
    "float64",
    "bool",
    "char",
    "string",
    "stringview",
    "void",
];

function offset(document: TextDocument, position: Position): number {
    return document.offsetAt(position);
}

function position(document: TextDocument, sourceOffset: number): Position {
    return document.positionAt(sourceOffset);
}

function documentPath(document: TextDocument): string | undefined {
    if (!document.uri.startsWith("file:")) return undefined;
    try {
        return fileURLToPath(document.uri);
    } catch {
        return undefined;
    }
}

function lspDiagnostics(document: TextDocument): Diagnostic[] {
    const result = compileSource(document.getText(), documentPath(document) ?? document.uri);
    return result.diagnostics.map((error) => ({
        severity: DiagnosticSeverity.Error,
        range: {
            start: position(document, error.position.start),
            end: position(document, error.position.end),
        },
        source: "delta",
        message: error.message,
    }));
}

function update(document: TextDocument) {
    const index = new SourceIndex(document.getText(), documentPath(document) ?? document.uri);
    states.set(document.uri, { index });
    connection.sendDiagnostics({ uri: document.uri, diagnostics: lspDiagnostics(document) });
}

function state(uri: string): DocumentState | undefined {
    return states.get(uri);
}

function completionKind(symbol: IndexedSymbol): CompletionItemKind {
    switch (symbol.kind) {
        case "function":
            return CompletionItemKind.Function;
        case "type":
            return CompletionItemKind.Struct;
        case "field":
            return CompletionItemKind.Field;
        case "method":
            return CompletionItemKind.Method;
        case "parameter":
            return CompletionItemKind.Variable;
        default:
            return CompletionItemKind.Variable;
    }
}

connection.onInitialize(() => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            hoverProvider: true,
            definitionProvider: true,
            completionProvider: { triggerCharacters: ["."] },
        },
        serverInfo: { name: "delta-language-server", version: LSP_VERSION },
    };
});
connection.onNotification(DidChangeWatchedFilesNotification.type, () => {
    for (const document of documents.all()) update(document);
});
documents.onDidOpen((event) => update(event.document));
documents.onDidChangeContent((event) => update(event.document));
documents.onDidClose((event) => {
    states.delete(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    const index = state(params.textDocument.uri)?.index;
    if (!document || !index) return null;
    const symbol = index.resolveAt(offset(document, params.position));
    if (!symbol) return null;
    const hover: any = {
        contents: { kind: MarkupKind.Markdown, value: symbolMarkdown(symbol) },
    };
    if (!symbol.uri || symbol.uri === params.textDocument.uri) {
        hover.range = {
            start: position(document, symbol.token.start),
            end: position(document, symbol.token.end),
        };
    }
    return hover;
});

connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);
    const index = state(params.textDocument.uri)?.index;
    if (!document || !index) return null;
    const symbol = index.resolveAt(offset(document, params.position));
    if (!symbol) return null;
    return {
        uri: symbol.uri ?? params.textDocument.uri,
        range: {
            start: { line: symbol.token.line - 1, character: symbol.token.column - 1 },
            end: {
                line: symbol.token.line - 1,
                character: symbol.token.column - 1 + symbol.token.value.length,
            },
        },
    };
});

connection.onCompletion((params): CompletionItem[] => {
    const document = documents.get(params.textDocument.uri);
    const index = state(params.textDocument.uri)?.index;
    if (!document || !index) return [];
    const completionOffset = offset(document, params.position);
    const symbols = index.completions(completionOffset);
    const symbolItems = symbols.map((symbol) => ({
        label: symbol.name,
        kind: completionKind(symbol),
        detail: symbol.signature ?? symbol.type,
        documentation: { kind: MarkupKind.Markdown, value: symbolMarkdown(symbol) },
    }));
    if (index.isMemberCompletion(offset(document, params.position))) return symbolItems;
    return [
        ...symbolItems,
        ...keywords.map((label) => ({ label, kind: CompletionItemKind.Keyword })),
        ...primitives.map((label) => ({ label, kind: CompletionItemKind.TypeParameter })),
    ];
});

/** Starts the stdio JSON-RPC loop. Kept explicit so the compiler CLI can host it. */
export function startLanguageServer() {
    documents.listen(connection);
    connection.listen();
}
