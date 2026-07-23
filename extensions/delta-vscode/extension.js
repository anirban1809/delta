const path = require("path");
const vscode = require("vscode");
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");

let client;

function activate(context) {
    const output = vscode.window.createOutputChannel("Delta Language Server");
    context.subscriptions.push(output);
    const configuredPath = vscode.workspace.getConfiguration("delta.languageServer").get("path");
    const serverModule = configuredPath || context.asAbsolutePath(path.join("server", "server.js"));
    const projectFiles = vscode.workspace.createFileSystemWatcher("**/{*.delta,delta.json}");
    context.subscriptions.push(projectFiles);
    output.appendLine(`Starting Delta language server: ${serverModule}`);
    client = new LanguageClient(
        "deltaLanguageServer",
        "Delta Language Server",
        {
            run: { module: serverModule, transport: TransportKind.stdio },
            debug: { module: serverModule, transport: TransportKind.stdio },
        },
        {
            documentSelector: [
                { scheme: "file", language: "delta" },
                { scheme: "untitled", language: "delta" },
            ],
            synchronize: {
                configurationSection: "delta",
                fileEvents: projectFiles,
            },
            outputChannel: output,
            traceOutputChannel: output,
        },
    );
    client.start().then(
        () => output.appendLine("Delta language server is running."),
        (error) => {
            output.appendLine(
                `Failed to start Delta language server: ${error.stack || error.message || error}`,
            );
            vscode.window.showErrorMessage(
                "Delta language server failed to start. See the Delta Language Server output channel.",
            );
        },
    );
}

function deactivate() {
    return client?.stop();
}

module.exports = { activate, deactivate };
