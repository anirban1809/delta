import {
    CompletionItemKind,
    createConnection,
    DiagnosticSeverity,
    DidChangeConfigurationNotification,
    DidChangeWatchedFilesNotification,
    FileChangeType,
    MarkupKind,
    ProposedFeatures,
    TextDocumentSyncKind,
    type CompletionItem,
    type Connection,
    type Diagnostic,
    type Position,
} from "vscode-languageserver/node.js";
import { fileURLToPath, pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver/node.js";
import { compileModuleSource, compileSource } from "../compiler/pipeline.js";
import { SourceIndex, symbolMarkdown, type IndexedSymbol } from "./source-index.js";
import { LSP_VERSION } from "./version.js";
import { WorkspaceIndex } from "./workspace-index.js";

type DocumentState = { index: SourceIndex };
const documents = new TextDocuments(TextDocument);
const states = new Map<string, DocumentState>();
const connection: Connection = createConnection(
    ProposedFeatures.all,
    process.stdin,
    process.stdout,
);
const workspace = new WorkspaceIndex();
let autoImportsEnabled = true;
let workspaceRoots: string[] = [];
let supportsWorkspaceFolderChanges = false;

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
    "import",
    "unsafe",
    "export",
    "extern",
    "ffi",
    "header",
    "static",
    "dynamic",
    "module",
    "from",
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
    const fileName = documentPath(document);
    const result = fileName
        ? compileModuleSource(
              document.getText(),
              fileName,
              workspace.readSource,
              workspace.resolveImport,
          )
        : compileSource(document.getText(), document.uri);
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
    const fileName = documentPath(document);
    const index = fileName
        ? workspace.update(fileName, document.getText())
        : new SourceIndex(document.getText(), document.uri);
    states.set(document.uri, { index });
    connection.sendDiagnostics({ uri: document.uri, diagnostics: lspDiagnostics(document) });
}

function state(uri: string): DocumentState | undefined {
    if (uri.startsWith("file:")) {
        try {
            workspace.refreshImports(fileURLToPath(uri), (fileName) =>
                documents.get(pathToFileURL(fileName).toString())?.getText(),
            );
        } catch {
            // Keep editor queries available if a dependency disappears mid-request.
        }
    }
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
        case "module":
            return CompletionItemKind.Module;
        case "parameter":
            return CompletionItemKind.Variable;
        default:
            return CompletionItemKind.Variable;
    }
}

connection.onInitialize((params) => {
    supportsWorkspaceFolderChanges = params.capabilities.workspace?.workspaceFolders === true;
    workspaceRoots =
        params.workspaceFolders?.map((folder) => fileURLToPath(folder.uri)) ??
        (params.rootUri?.startsWith("file:") ? [fileURLToPath(params.rootUri)] : []);
    workspace.setRoots(workspaceRoots);
    workspace.scan();
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            hoverProvider: true,
            definitionProvider: true,
            completionProvider: { triggerCharacters: ["."] },
            workspace: { workspaceFolders: { supported: true, changeNotifications: true } },
        },
        serverInfo: { name: "delta-language-server", version: LSP_VERSION },
    };
});
connection.onInitialized(() => {
    if (!supportsWorkspaceFolderChanges) return;
    connection.workspace.onDidChangeWorkspaceFolders((event) => {
        const removed = new Set(event.removed.map((folder) => fileURLToPath(folder.uri)));
        workspaceRoots = workspaceRoots.filter((root) => !removed.has(root));
        workspaceRoots.push(...event.added.map((folder) => fileURLToPath(folder.uri)));
        workspace.setRoots(workspaceRoots);
        workspace.scan();
    });
});
connection.onNotification(DidChangeConfigurationNotification.type, (params: any) => {
    const configured =
        params?.settings?.delta?.autoImports?.enabled ?? params?.settings?.autoImports?.enabled;
    autoImportsEnabled = configured !== false;
});
connection.onNotification(DidChangeWatchedFilesNotification.type, (params) => {
    for (const change of params.changes) {
        if (!change.uri.startsWith("file:")) continue;
        const fileName = fileURLToPath(change.uri);
        if (change.type === FileChangeType.Deleted) workspace.remove(fileName);
        else workspace.refresh(fileName);
    }
    for (const document of documents.all()) update(document);
});
documents.onDidOpen((event) => update(event.document));
documents.onDidChangeContent((event) => update(event.document));
documents.onDidClose((event) => {
    states.delete(event.document.uri);
    const fileName = documentPath(event.document);
    if (fileName) workspace.refresh(fileName);
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
    const fileName = documentPath(document);
    const visible = new Set(symbols.map((symbol) => symbol.name));
    const autoImportItems: CompletionItem[] = [];
    if (autoImportsEnabled && fileName) {
        for (const candidate of workspace.autoImports(fileName)) {
            if (visible.has(candidate.symbol.name)) continue;
            const edit = index.autoImportEdit(
                candidate.symbol.name,
                candidate.importPath,
                candidate.importKind,
            );
            if (!edit) continue;
            autoImportItems.push({
                label: candidate.symbol.name,
                kind: completionKind(candidate.symbol),
                detail: `${candidate.symbol.signature ?? candidate.symbol.type ?? candidate.symbol.kind} — auto import from ${candidate.importPath}`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: symbolMarkdown(candidate.symbol),
                },
                sortText: `9_${candidate.symbol.name}_${candidate.importPath}`,
                additionalTextEdits: [
                    {
                        range: {
                            start: position(document, edit.start),
                            end: position(document, edit.end),
                        },
                        newText: edit.newText,
                    },
                ],
            });
        }
    }
    return [
        ...symbolItems,
        ...autoImportItems,
        ...keywords.map((label) => ({ label, kind: CompletionItemKind.Keyword })),
        ...primitives.map((label) => ({ label, kind: CompletionItemKind.TypeParameter })),
    ];
});

/** Starts the stdio JSON-RPC loop. Kept explicit so the compiler CLI can host it. */
export function startLanguageServer() {
    documents.listen(connection);
    connection.listen();
}
