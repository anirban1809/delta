const path = require("path");
const vscode = require("vscode");
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");

let client;

function activate(context) {
    const output = vscode.window.createOutputChannel("Delta Language Server");
    context.subscriptions.push(output);
    const configuredPath = vscode.workspace.getConfiguration("delta.languageServer").get("path");
    const configuredStandardLibrary = vscode.workspace
        .getConfiguration("delta.standardLibrary")
        .get("path");
    const serverModule = configuredPath || context.asAbsolutePath(path.join("server", "server.js"));
    const serverEnvironment = { ...process.env };
    if (configuredStandardLibrary) {
        serverEnvironment.DELTA_STD_LIB = configuredStandardLibrary;
    }
    const projectFiles = vscode.workspace.createFileSystemWatcher("**/{*.delta,delta.json}");
    const fileEvents = [projectFiles];
    const standardLibraryPath = serverEnvironment.DELTA_STD_LIB
        ? path.resolve(serverEnvironment.DELTA_STD_LIB)
        : undefined;
    if (standardLibraryPath) {
        const standardLibraryFiles = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(standardLibraryPath, "**/*.delta"),
        );
        fileEvents.push(standardLibraryFiles);
    }
    context.subscriptions.push(...fileEvents);
    output.appendLine(`Starting Delta language server: ${serverModule}`);
    if (serverEnvironment.DELTA_STD_LIB) {
        output.appendLine(`Delta standard library: ${serverEnvironment.DELTA_STD_LIB}`);
        output.appendLine(`Watching Delta standard-library sources: ${standardLibraryPath}`);
    }
    client = new LanguageClient(
        "deltaLanguageServer",
        "Delta Language Server",
        {
            run: {
                module: serverModule,
                transport: TransportKind.stdio,
                options: { env: serverEnvironment },
            },
            debug: {
                module: serverModule,
                transport: TransportKind.stdio,
                options: { env: serverEnvironment },
            },
        },
        {
            documentSelector: [
                { scheme: "file", language: "delta" },
                { scheme: "untitled", language: "delta" },
            ],
            synchronize: {
                configurationSection: "delta",
                fileEvents,
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
