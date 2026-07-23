#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionDirectory = join(repositoryRoot, "extensions", "delta-vscode");
const extensionManifest = join(extensionDirectory, "package.json");
const lspVersionSource = join(repositoryRoot, "src", "lsp", "version.ts");
const requestedVersion = process.argv[2] ?? "patch";

if (["--help", "-h"].includes(requestedVersion)) {
    console.log(`Usage: npm run release:vscode -- [patch|minor|major|VERSION]

Defaults to a patch release. The command bumps the extension version, syncs the
LSP version, builds and packages the extension, installs it in VS Code, and
verifies the installed version.`);
    process.exit(0);
}

if (
    !/^(?:patch|minor|major|prepatch|preminor|premajor|prerelease|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.test(
        requestedVersion,
    )
) {
    throw new Error(`Invalid version or release type: ${requestedVersion}`);
}

function run(command, args, cwd = repositoryRoot, capture = false) {
    console.log(`> ${command} ${args.join(" ")}`);
    return execFileSync(command, args, {
        cwd,
        encoding: capture ? "utf8" : undefined,
        stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
}

// Fail before changing versioned files when required release tools are missing.
run("vsce", ["--version"], repositoryRoot, true);
run("code", ["--version"], repositoryRoot, true);

run(
    "npm",
    ["version", requestedVersion, "--no-git-tag-version", "--allow-same-version"],
    extensionDirectory,
);

const { version } = JSON.parse(readFileSync(extensionManifest, "utf8"));
writeFileSync(
    lspVersionSource,
    `// Kept in sync with the VS Code extension manifest by scripts/release-vscode.mjs.\nexport const LSP_VERSION = "${version}";\n`,
);

run("npm", ["run", "build:vscode"]);

const vsixName = `delta-vscode-${version}.vsix`;
const vsixPath = join(extensionDirectory, vsixName);
run("vsce", ["package", "--out", vsixPath], extensionDirectory);
run("code", ["--install-extension", vsixPath, "--force"]);

const installed = run("code", ["--list-extensions", "--show-versions"], repositoryRoot, true);
const expected = `delta-lang.delta-vscode@${version}`;
if (!installed.split(/\r?\n/).includes(expected)) {
    throw new Error(`VS Code did not report the expected installed extension: ${expected}`);
}

console.log(`\nInstalled ${expected}`);
console.log(`VSIX: ${vsixPath}`);
