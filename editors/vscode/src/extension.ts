import * as path from 'path';
import {
  commands,
  Disposable,
  ExtensionContext,
  StatusBarAlignment,
  StatusBarItem,
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
    documentSelector: [{ scheme: 'file', language: 'delta' }],
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

export function deactivate(): Thenable<void> | undefined {
  stateListener?.dispose();
  return client?.stop();
}
