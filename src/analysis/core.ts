import type { Module } from "../ast/types.js";
import type { Diagnostics } from "../diagnostics/diagnostics.js";
import { Scope } from "./scope.js";
import { DeclarationAnalyzer } from "./declarations.js";

/**
 * Composition root for the extracted analyzer classes. It preserves the
 * original two-pass module flow while declaration-specific work lives in
 * {@link DeclarationAnalyzer}.
 */
export class AnalyzerCore {
    globalScope = new Scope();
    private declarationAnalyzer: DeclarationAnalyzer;

    constructor(
        public ast: Module,
        public diagnostics: Diagnostics,
    ) {
        this.declarationAnalyzer = new DeclarationAnalyzer(ast, diagnostics, this.globalScope);
    }

    /** Registers functions first, then analyzes every declaration. */
    analyze(): Scope {
        this.declarationAnalyzer.registerFunctions();
        this.ast.declarations.forEach((declaration) =>
            this.declarationAnalyzer.analyze(declaration),
        );
        return this.globalScope;
    }
}
