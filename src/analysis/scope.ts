import { type Symbol } from "./analyzer.js";
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

    constructor(parent?: Scope) {
        this.parent = parent;
        this.symbols = new Map();
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
}
