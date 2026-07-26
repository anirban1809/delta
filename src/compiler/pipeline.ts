import { AnalyzerCore } from "../analysis/core.js";
import type { Scope } from "../analysis/scope.js";
import { Parser } from "../ast/parser.js";
import { Tokenizer } from "../ast/tokenizer.js";
import type { Module } from "../ast/types.js";
import { Diagnostics, type Error as CompilerError } from "../diagnostics/diagnostics.js";

/** The in-memory compiler entry point shared by the CLI-facing editor server. */
export type CompileResult = {
    ast?: Module;
    diagnostics: CompilerError[];
    globalScope?: Scope;
};

/** Runs Delta's tokenize → parse → semantic-analysis pipeline over one file. */
export function compileSource(source: string, fileName: string): CompileResult {
    const diagnostics = new Diagnostics(fileName);
    const ast = new Parser(fileName, diagnostics).parse(new Tokenizer(source).tokenize());
    if (!ast) return { diagnostics: diagnostics.errors };

    const globalScope = new AnalyzerCore(ast, diagnostics).analyze();
    return { ast, diagnostics: diagnostics.errors, globalScope };
}
