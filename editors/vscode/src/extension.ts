import * as path from 'path';
import {
  CancellationToken,
  CompletionItem,
  CompletionItemKind,
  CompletionItemProvider,
  CompletionList,
  commands,
  Disposable,
  ExtensionContext,
  languages,
  Position,
  Range,
  StatusBarAlignment,
  StatusBarItem,
  TextDocument,
  TextEdit,
  Uri,
  window,
  workspace,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;
let output = window.createOutputChannel('Delta Language Server');
let status: StatusBarItem | undefined;
let stateListener: Disposable | undefined;
const deltaDocumentSelector = [{ scheme: 'file' as const, language: 'delta' }];

export async function activate(context: ExtensionContext): Promise<void> {
  status = window.createStatusBarItem(StatusBarAlignment.Left, 50);
  status.command = 'delta.showServerOutput';
  status.text = '$(sync~spin) Delta';
  status.tooltip = 'Delta language server is starting';
  status.show();

  context.subscriptions.push(
    output,
    status,
    commands.registerCommand('delta.restartServer', restartClient),
    commands.registerCommand('delta.showServerOutput', () => output.show(true)),
    languages.registerCompletionItemProvider(
      deltaDocumentSelector,
      new DeltaAutoImportProvider(),
    ),
    workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('delta.server.path')) {
        await restartClient();
      }
    }),
  );

  await startClient();
}

async function startClient(): Promise<void> {
  const serverPath = configuredServerPath();
  const serverOptions: ServerOptions = {
    command: serverPath,
    args: ['lsp'],
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: deltaDocumentSelector,
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.delta'),
    },
    outputChannel: output,
  };

  client = new LanguageClient(
    'delta',
    'Delta Language Server',
    serverOptions,
    clientOptions,
  );
  stateListener?.dispose();
  stateListener = client.onDidChangeState(({ newState }) => updateStatus(newState));
  updateStatus(State.Starting);

  try {
    await client.start();
  } catch (err) {
    updateStatus(State.Stopped);
    window.showErrorMessage(
      `Failed to start delta lsp (${serverPath} lsp): ${err}. ` +
        `Set "delta.server.path" to the Delta binary.`,
      'Show Output',
    ).then((choice) => {
      if (choice === 'Show Output') {
        output.show(true);
      }
    });
  }
}

async function restartClient(): Promise<void> {
  status!.text = '$(sync~spin) Delta';
  status!.tooltip = 'Restarting Delta language server';
  stateListener?.dispose();
  stateListener = undefined;
  if (client) {
    await client.stop();
    client = undefined;
  }
  await startClient();
}

function configuredServerPath(): string {
  const configured =
    (workspace.getConfiguration('delta').get<string>('server.path') ?? '').trim();
  if (!configured || path.isAbsolute(configured)) {
    return configured || 'delta';
  }
  const root = workspace.workspaceFolders?.[0]?.uri.fsPath;
  return root ? path.resolve(root, configured) : configured;
}

function updateStatus(state: State): void {
  if (!status) {
    return;
  }
  switch (state) {
    case State.Running:
      status.text = '$(check) Delta';
      status.tooltip = 'Delta language server is running';
      break;
    case State.Starting:
      status.text = '$(sync~spin) Delta';
      status.tooltip = 'Delta language server is starting';
      break;
    case State.Stopped:
      status.text = '$(error) Delta';
      status.tooltip = 'Delta language server stopped. Click to show output.';
      break;
  }
}

type ExportKind = 'function' | 'const' | 'type';

type ExportedSymbol = {
  name: string;
  kind: ExportKind;
  uri: Uri;
};

class DeltaAutoImportProvider implements CompletionItemProvider {
  async provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
  ): Promise<CompletionList | CompletionItem[]> {
    if (document.uri.scheme !== 'file' || isMemberAccess(document, position)) {
      return [];
    }

    const currentText = document.getText();
    const existingImports = importedNames(currentText);
    const locals = localDeclarations(currentText);
    const exports = await workspaceExports(token);
    const items: CompletionItem[] = [];

    for (const symbol of exports) {
      if (
        symbol.uri.toString() === document.uri.toString() ||
        existingImports.has(symbol.name) ||
        locals.has(symbol.name)
      ) {
        continue;
      }

      const importPath = deltaImportPath(document.uri, symbol.uri);
      const item = new CompletionItem(symbol.name, completionKind(symbol.kind));
      item.detail = `Auto import from ${importPath}`;
      item.sortText = `9_auto_import_${symbol.name}`;
      item.additionalTextEdits = [importEdit(document, symbol.name, importPath)];
      items.push(item);
    }

    return items;
  }
}

async function workspaceExports(token: CancellationToken): Promise<ExportedSymbol[]> {
  const files = await workspace.findFiles(
    '**/*.delta',
    '**/{build,node_modules,out,.git}/**',
  );
  const out: ExportedSymbol[] = [];
  for (const uri of files) {
    if (token.isCancellationRequested) {
      break;
    }
    const text = await documentText(uri);
    for (const symbol of exportedSymbols(text)) {
      out.push({ ...symbol, uri });
    }
  }
  return out;
}

async function documentText(uri: Uri): Promise<string> {
  const open = workspace.textDocuments.find((document) => {
    return document.uri.toString() === uri.toString();
  });
  if (open) {
    return open.getText();
  }
  const bytes = await workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf8');
}

function exportedSymbols(text: string): Array<Omit<ExportedSymbol, 'uri'>> {
  const symbols: Array<Omit<ExportedSymbol, 'uri'>> = [];
  const re = /^\s*export\s+(?:(?:unique)\s+)?(function|const|type)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  for (const match of text.matchAll(re)) {
    symbols.push({ kind: match[1] as ExportKind, name: match[2] });
  }
  return symbols;
}

function importedNames(text: string): Set<string> {
  const names = new Set<string>();
  const re = /^\s*import\s*\{([^}]*)\}\s*from\s*"[^"]+"\s*;/gm;
  for (const match of text.matchAll(re)) {
    for (const part of match[1].split(',')) {
      const name = part.trim();
      if (name) {
        names.add(name);
      }
    }
  }
  return names;
}

function localDeclarations(text: string): Set<string> {
  const names = new Set<string>();
  const re = /^\s*(?:export\s+)?(?:(?:unique)\s+)?(?:function|const|type)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  for (const match of text.matchAll(re)) {
    names.add(match[1]);
  }
  return names;
}

function importEdit(document: TextDocument, name: string, importPath: string): TextEdit {
  const text = document.getText();
  const imports = [...text.matchAll(/^\s*import\s*\{([^}]*)\}\s*from\s*"([^"]+)"\s*;/gm)];
  for (const match of imports) {
    if (match[2] !== importPath || match.index === undefined) {
      continue;
    }
    const namesStart = match.index + match[0].indexOf('{') + 1;
    const namesEnd = match.index + match[0].indexOf('}');
    const existing = match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const next = [...new Set([...existing, name])].sort();
    return TextEdit.replace(
      new Range(document.positionAt(namesStart), document.positionAt(namesEnd)),
      ` ${next.join(', ')} `,
    );
  }

  const insertLine = imports.length > 0
    ? document.positionAt(
      (imports[imports.length - 1].index ?? 0) + imports[imports.length - 1][0].length,
    ).line + 1
    : firstNonCommentLine(document);
  return TextEdit.insert(
    new Position(insertLine, 0),
    `import { ${name} } from "${importPath}";\n`,
  );
}

function firstNonCommentLine(document: TextDocument): number {
  for (let line = 0; line < document.lineCount; line++) {
    const text = document.lineAt(line).text.trim();
    if (text === '' || text.startsWith('//')) {
      continue;
    }
    return line;
  }
  return 0;
}

function deltaImportPath(from: Uri, to: Uri): string {
  const fromDir = path.dirname(from.fsPath);
  const target = to.fsPath.replace(/\.delta$/, '');
  let rel = path.relative(fromDir, target).split(path.sep).join('/');
  if (!rel.startsWith('.')) {
    rel = `./${rel}`;
  }
  return rel;
}

function completionKind(kind: ExportKind): CompletionItemKind {
  switch (kind) {
    case 'function':
      return CompletionItemKind.Function;
    case 'const':
      return CompletionItemKind.Constant;
    case 'type':
      return CompletionItemKind.Struct;
  }
}

function isMemberAccess(document: TextDocument, position: Position): boolean {
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
  return /\.\s*[A-Za-z_0-9]*$/.test(linePrefix);
}

export function deactivate(): Thenable<void> | undefined {
  stateListener?.dispose();
  return client?.stop();
}
