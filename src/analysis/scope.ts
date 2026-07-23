import { type FunctionSignature, type Symbol } from "./analyzer.js";
/**
 * A lexical scope: a list of symbols plus a link to its enclosing scope.
 *
 * Scopes form a chain from the innermost block out to the global scope (whose
 * `parent` is undefined), so name lookup can walk outward through enclosing
 * scopes.
 */
export class Scope {
    parent: Scope | undefined; //parent scope can be empty for global scope
    symbols: Map<string, Symbol>;
    methods: Map<string, Map<string, FunctionSignature>>;

    constructor(parent?: Scope) {
        this.parent = parent;
        this.symbols = new Map();
        this.methods = parent?.methods ?? new Map();
    }

    /** Declares a symbol in this scope. */
    addSymbol(s: Symbol) {
        this.symbols.set(s.name, s);
    }

    getSymbol(name: string): Symbol | undefined {
        let found = this.symbols.get(name);
        if (!found) {
            if (this.parent) {
                found = this.parent.getSymbol(name);
            }
        }
        return found;
    }

    addMethod(typeName: string, name: string, signature: FunctionSignature): boolean {
        const methods = this.methods.get(typeName) ?? new Map<string, FunctionSignature>();
        if (methods.has(name)) return false;
        methods.set(name, signature);
        this.methods.set(typeName, methods);
        return true;
    }

    getMethod(typeName: string, name: string): FunctionSignature | undefined {
        return this.methods.get(typeName)?.get(name);
    }

    visibleSymbols(): Symbol[] {
        const result = new Map<string, Symbol>();
        for (let scope: Scope | undefined = this; scope; scope = scope.parent) {
            scope.symbols.forEach((symbol, name) => { if (!result.has(name)) result.set(name, symbol); });
        }
        return [...result.values()];
    }
}
