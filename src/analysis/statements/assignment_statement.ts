import { type AssignmentStatement, type Identifier } from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import { BlockKind, SymbolKind, type BlockContext } from "../analyzer.js";
import type { Scope } from "../scope.js";

/** Validates assignment targets and tracks definite assignment for bindings. */
export class AssignmentStatementAnalyzer {
    constructor(public diagnostics: Diagnostics) {}

    analyze(s: AssignmentStatement, context: BlockContext, scope: Scope) {
        let rootName = "";
        if (s.root.kind == "identifier") rootName = s.root.name;
        if (s.root.kind == "member_access_expression") {
            rootName = (s.root.receiver as Identifier).name;
        }

        const symbol = scope.getSymbol(rootName);
        if (!symbol) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    "unknown identifier '" + rootName + "'",
                ),
            );
            return;
        }

        if (
            symbol.kind == SymbolKind.SymbolLocalConst ||
            symbol.kind == SymbolKind.SymbolFileConst
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    "cannot assign to const binding '" + rootName + "'",
                ),
            );
            return;
        }
        if (symbol.kind == SymbolKind.SymbolParameter) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    "cannot assign to const function parameter '" + rootName + "'",
                ),
            );
            return;
        }
        if (symbol.kind == SymbolKind.SymbolFuncDecl) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    "cannot assign to function '" + rootName + "'",
                ),
            );
            return;
        }

        // Assignments in loops and conditional branches are not immediately definite.
        if (
            context.loopDepth == 0 &&
            context.kind != BlockKind.IfBlock &&
            s.root.kind != "member_access_expression"
        ) {
            symbol.assigned = true;
        }
        if (
            context.kind == BlockKind.IfBlock &&
            context.scopedAssignments.includes(symbol.name) &&
            !symbol.assigned &&
            s.root.kind != "member_access_expression"
        ) {
            symbol.assigned = true;
        } else {
            context.scopedAssignments.push(symbol.name);
        }

        if (!symbol.assigned && s.root.kind == "member_access_expression") {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    "partial initialization of struct is not allowed, " +
                        rootName +
                        " is still uninitialized",
                ),
            );
        }
        return;
    }
}
