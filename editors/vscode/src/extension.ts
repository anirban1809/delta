import { workspace, ExtensionContext, window } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(_context: ExtensionContext): Promise<void> {
  const config = workspace.getConfiguration('delta');
  const serverPath =
    (config.get<string>('server.path') ?? '').trim() || 'delta';

  const serverOptions: ServerOptions = {
    command: serverPath,
    args: ['lsp'],
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'delta' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.delta'),
    },
    outputChannel: window.createOutputChannel('Delta Language Server'),
  };

  client = new LanguageClient(
    'delta',
    'Delta Language Server',
    serverOptions,
    clientOptions,
  );

  try {
    await client.start();
  } catch (err) {
    window.showErrorMessage(
      `Failed to start delta lsp (${serverPath} lsp): ${err}. ` +
        `Set "delta.server.path" in settings to the full path of the delta binary.`,
    );
  }
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
