import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

type ClangType = {
    qualType?: string;
    desugaredQualType?: string;
};

type ClangNode = {
    kind?: string;
    name?: string;
    type?: ClangType;
    variadic?: boolean;
    inner?: ClangNode[];
};

type Header = {
    includeName: string;
    spelling: string;
};

type FunctionBinding = {
    name: string;
    cSignature: string;
    parameters: { name: string; type: string }[];
    returnType?: string;
};

export type BindgenResult = {
    outputPath: string;
    source: string;
    symbols: string[];
    skippedSymbols: string[];
};

export type BindgenCliArguments = {
    header: string;
    symbols?: string[];
    outputPath: string;
};

const DELTA_KEYWORDS = new Set([
    "as",
    "break",
    "check",
    "clone",
    "const",
    "continue",
    "dynamic",
    "edit",
    "else",
    "enum",
    "export",
    "extern",
    "false",
    "ffi",
    "for",
    "forward",
    "from",
    "function",
    "header",
    "heap",
    "if",
    "ignore",
    "import",
    "let",
    "module",
    "move",
    "new",
    "of",
    "return",
    "static",
    "struct",
    "switch",
    "true",
    "type",
    "union",
    "unique",
    "unsafe",
    "while",
]);

const PARAMETER_HINTS: Record<string, string[]> = {
    open: ["path", "flags", "mode"],
    openat: ["fd", "path", "flags", "mode"],
    creat: ["path", "mode"],
    close: ["fd"],
    read: ["fd", "buffer", "count"],
    write: ["fd", "buffer", "count"],
};

function parseHeader(value: string): Header {
    if (/[\r\n]/.test(value)) throw new Error("header name cannot contain a newline");
    const angle = value.match(/^<([^<>]+)>$/);
    if (angle) return { includeName: angle[1]!, spelling: value };
    const quoted = value.match(/^"([^"]+)"$/);
    if (quoted) return { includeName: quoted[1]!, spelling: value };
    if (!value.length) throw new Error("header name cannot be empty");
    return {
        includeName: value,
        spelling: `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
    };
}

function moduleNameForHeader(header: Header): string {
    const basename = path.basename(header.includeName).replace(/(?:\.[^.]+)+$/, "");
    let name = basename.replace(/[^A-Za-z0-9_]/g, "_");
    if (!name || /^[0-9]/.test(name) || DELTA_KEYWORDS.has(name)) name = `_${name || "header"}`;
    return name;
}

function identifier(value: string, fallback: string): string {
    let name = value.replace(/[^A-Za-z0-9_]/g, "_");
    if (!name || /^[0-9]/.test(name) || DELTA_KEYWORDS.has(name)) name = fallback;
    return name;
}

function clangAst(header: Header, cwd: string, clangPath: string): ClangNode {
    const result = spawnSync(
        clangPath,
        [
            "-x",
            "c",
            "-std=c17",
            "-Wno-everything",
            "-Xclang",
            "-ast-dump=json",
            "-fsyntax-only",
            "-include",
            header.includeName,
            "-",
        ],
        {
            cwd,
            encoding: "utf8",
            input: "",
            maxBuffer: 256 * 1024 * 1024,
        },
    );
    if (result.error) {
        if ((result.error as NodeJS.ErrnoException).code == "ENOENT") {
            throw new Error(`Clang was not found at \`${clangPath}\``);
        }
        throw result.error;
    }
    if (result.status != 0) {
        const detail = result.stderr.trim();
        throw new Error(`Clang could not parse ${header.spelling}${detail ? `:\n${detail}` : ""}`);
    }
    try {
        return JSON.parse(result.stdout) as ClangNode;
    } catch {
        throw new Error(`Clang returned an invalid AST for ${header.spelling}`);
    }
}

function collectFunctions(root: ClangNode): Map<string, ClangNode> {
    const functions = new Map<string, ClangNode>();
    const visit = (node: ClangNode) => {
        if (
            node.kind == "FunctionDecl" &&
            node.name &&
            /^[A-Za-z_][A-Za-z0-9_]*$/.test(node.name)
        ) {
            const existing = functions.get(node.name);
            const parameters =
                node.inner?.filter((child) => child.kind == "ParmVarDecl").length ?? 0;
            const existingParameters =
                existing?.inner?.filter((child) => child.kind == "ParmVarDecl").length ?? -1;
            if (!existing || parameters > existingParameters) functions.set(node.name, node);
        }
        for (const child of node.inner ?? []) visit(child);
    };
    visit(root);
    return functions;
}

function cleanCType(value: string): string {
    return value
        .replace(/\b(?:_Nullable|_Nonnull|_Null_unspecified|__restrict|restrict|volatile)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function translateType(type: ClangType | undefined, allowVoid: boolean): string | undefined {
    let value = cleanCType(type?.qualType ?? "");
    if (!value || value.includes("(*)") || value.includes("(^")) return;

    let pointerDepth = 0;
    while (/\[[^\]]*\]\s*$/.test(value)) {
        value = value.replace(/\[[^\]]*\]\s*$/, "").trim();
        pointerDepth++;
    }
    while (/\*\s*(?:const\s*)?$/.test(value)) {
        value = value.replace(/\*\s*(?:const\s*)?$/, "").trim();
        pointerDepth++;
    }

    const isConst = /\bconst\b/.test(value);
    value = value
        .replace(/\bconst\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

    let translated: string | undefined;
    switch (value) {
        case "void":
            translated = allowVoid || pointerDepth > 0 ? "c.void" : undefined;
            break;
        case "int":
        case "signed int":
            translated = "c.int";
            break;
        case "size_t":
            translated = "c.size_t";
            break;
        case "ssize_t":
            translated = "c.ssize_t";
            break;
        default:
            // The current Delta C ABI deliberately treats opaque and character
            // pointees as void. Other unsupported scalar types are rejected.
            if (pointerDepth > 0) translated = "c.void";
    }
    if (!translated) return;
    if (isConst && pointerDepth > 0) translated = `c.const<${translated}>`;
    for (let i = 0; i < pointerDepth; i++) translated = `c.ptr<${translated}>`;
    return translated;
}

function returnTypeOf(node: ClangNode): ClangType | undefined {
    const signature = node.type?.qualType;
    if (!signature) return;
    const boundary = signature.indexOf("(");
    if (boundary < 0) return;
    return { qualType: signature.slice(0, boundary) };
}

function cSignatureOf(node: ClangNode): string | undefined {
    const signature = node.type?.qualType?.replace(/\s+/g, " ").trim();
    if (!signature || !node.name) return;
    const boundary = signature.indexOf("(");
    if (boundary < 0) return;
    const prefix = signature.slice(0, boundary).trimEnd();
    const separator = prefix.endsWith("*") ? "" : " ";
    return `${prefix}${separator}${node.name}${signature.slice(boundary)};`;
}

function translateFunction(node: ClangNode): FunctionBinding | undefined {
    if (!node.name || DELTA_KEYWORDS.has(node.name)) return;
    const cSignature = cSignatureOf(node);
    if (!cSignature) return;
    const hints = PARAMETER_HINTS[node.name] ?? [];
    const usedNames = new Set<string>();
    const parameters: { name: string; type: string }[] = [];
    const parameterNodes = node.inner?.filter((child) => child.kind == "ParmVarDecl") ?? [];

    for (let index = 0; index < parameterNodes.length; index++) {
        const parameter = parameterNodes[index]!;
        const type = translateType(parameter.type, false);
        if (!type) return;
        const fallback = hints[index] ?? `arg${index}`;
        let name = identifier(parameter.name ?? fallback, fallback);
        while (usedNames.has(name)) name = `${name}_${index}`;
        usedNames.add(name);
        parameters.push({ name, type });
    }

    // Delta does not yet model C variadic arguments. A variadic declaration is
    // projected to its callable fixed prefix, matching the initial FFI surface.
    const returnType = node.variadic ? undefined : translateType(returnTypeOf(node), true);
    if (!node.variadic && !returnType) return;
    return {
        name: node.name,
        cSignature,
        parameters,
        returnType: returnType == "c.void" ? undefined : returnType,
    };
}

function render(header: Header, functions: FunctionBinding[]): string {
    const headerLiteral = header.spelling.startsWith("<")
        ? JSON.stringify(header.spelling)
        : `'${header.spelling.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
    const lines = [`ffi header ${headerLiteral};`, "", "extern {"];
    for (const fn of functions) {
        const parameters = fn.parameters
            .map((parameter) => `${parameter.name}: ${parameter.type}`)
            .join(", ");
        lines.push(`    /// ${fn.cSignature}`);
        lines.push(
            `    function ${fn.name}(${parameters})${fn.returnType ? `: ${fn.returnType}` : ""};`,
        );
    }
    lines.push("}", "", `export module ${moduleNameForHeader(header)};`, "");
    return lines.join("\n");
}

export function generateFfiBindings(
    headerValue: string,
    symbols?: string[],
    options: { cwd?: string; clangPath?: string } = {},
): Omit<BindgenResult, "outputPath"> {
    const cwd = path.resolve(options.cwd ?? process.cwd());
    const header = parseHeader(headerValue);
    const declarations = collectFunctions(clangAst(header, cwd, options.clangPath ?? "clang"));
    const requested = symbols?.length ? symbols : [...declarations.keys()];
    const missing = symbols?.filter((name) => !declarations.has(name)) ?? [];
    if (missing.length) {
        throw new Error(
            `symbol${missing.length == 1 ? "" : "s"} not found in ${header.spelling}: ${missing.join(", ")}`,
        );
    }

    const functions: FunctionBinding[] = [];
    const skippedSymbols: string[] = [];
    for (const name of requested) {
        const declaration = declarations.get(name);
        const binding = declaration && translateFunction(declaration);
        if (binding) functions.push(binding);
        else skippedSymbols.push(name);
    }
    if (symbols?.length && skippedSymbols.length) {
        throw new Error(
            `unsupported C signature${skippedSymbols.length == 1 ? "" : "s"}: ${skippedSymbols.join(", ")}`,
        );
    }
    if (!functions.length) {
        throw new Error(`no supported C function declarations found in ${header.spelling}`);
    }
    return {
        source: render(header, functions),
        symbols: functions.map((fn) => fn.name),
        skippedSymbols,
    };
}

export function writeFfiBindings(
    header: string,
    symbols: string[] | undefined,
    outputPath: string,
    options: { cwd?: string; clangPath?: string } = {},
): BindgenResult {
    if (!outputPath.endsWith(".ffi.delta")) {
        throw new Error("bindgen output must end with `.ffi.delta`");
    }
    const cwd = path.resolve(options.cwd ?? process.cwd());
    const generated = generateFfiBindings(header, symbols, { ...options, cwd });
    const resolvedOutput = path.resolve(cwd, outputPath);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, generated.source, "utf8");
    return { ...generated, outputPath: resolvedOutput };
}

function parseSymbolList(value: string): string[] {
    let list = value.trim();
    if (list.startsWith("[") || list.endsWith("]")) {
        if (!(list.startsWith("[") && list.endsWith("]"))) {
            throw new Error("symbol list must be enclosed in matching `[` and `]`");
        }
        list = list.slice(1, -1).trim();
    }
    if (!list) throw new Error("symbol list cannot be empty");
    const symbols = list.split(/[\s,]+/).filter(Boolean);
    for (const symbol of symbols) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(symbol)) {
            throw new Error(`invalid C symbol name: ${symbol}`);
        }
    }
    return [...new Set(symbols)];
}

export function parseBindgenCliArguments(args: string[]): BindgenCliArguments {
    const outputFlags = args
        .map((argument, index) => ({ argument, index }))
        .filter(({ argument }) => argument == "-o" || argument == "--output");
    if (outputFlags.length != 1) {
        throw new Error("bindgen requires exactly one `-o <file.ffi.delta>` option");
    }
    const outputIndex = outputFlags[0]!.index;
    const outputPath = args[outputIndex + 1];
    if (!outputPath) throw new Error("output path expected after `-o`");
    if (outputIndex + 2 != args.length) {
        throw new Error("unexpected argument after bindgen output path");
    }
    const positional = args.slice(0, outputIndex);
    const header = positional[0];
    if (!header) throw new Error("C header name expected");
    const symbolText = positional.slice(1).join(" ").trim();
    return {
        header,
        symbols: symbolText ? parseSymbolList(symbolText) : undefined,
        outputPath,
    };
}
