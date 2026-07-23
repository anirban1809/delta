import {
    TypeValue,
    type BlockStatement,
    type SwitchStatement,
    type Type,
} from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import type { BlockContext } from "../analyzer.js";
import { Scope } from "../scope.js";
import { BlockStatementAnalyzer } from "./block_statement.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";
import { TypeAnalyzer } from "../type_analyzer.js";

/** Validates switch labels, exhaustiveness, and control flow through switch cases. */
export class SwitchStatementAnalyzer {
    constructor(
        public diagnostics: Diagnostics,
        private expressionAnalyzer: ExpressionAnalyzer,
        private typeAnalyzer: TypeAnalyzer,
        private blockAnalyzer: BlockStatementAnalyzer,
    ) {}

    analyze(s: SwitchStatement, context: BlockContext, scope: Scope) {
        const scrutineeT = this.expressionAnalyzer.dereferenceOwnedValue(
            s.scrutinee,
            this.expressionAnalyzer.analyze(s.scrutinee, scope),
        );
        if (scrutineeT.value == TypeValue.TypeInvalid) return;
        if (!this.isSwitchable(scrutineeT)) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.scrutinee.position,
                    `cannot switch on type ${scrutineeT.name.name}, must be an int or char`,
                ),
            );
            return;
        }
        if (
            scrutineeT.kind == "enum" &&
            scrutineeT.variants?.length != s.cases.length &&
            s.default?.body.statements.length == 0
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    `all variants of enum \`${scrutineeT.name.name}\` are not being checked, must include default statement`,
                ),
            );
            return;
        }

        const seenLabels = new Map<string, boolean>();
        for (const caseObj of s.cases) {
            for (const label of caseObj.labels) {
                const labelT = this.expressionAnalyzer.analyze(label, scope);
                if (!this.typeAnalyzer.typesMatch(labelT, scrutineeT)) {
                    if (
                        this.typeAnalyzer.isInteger(labelT) &&
                        this.typeAnalyzer.isInteger(scrutineeT)
                    ) {
                        if (!this.isSigned(scrutineeT) && label.value.startsWith("-")) {
                            this.diagnostics.addError(
                                Error(
                                    this.diagnostics.fileName,
                                    "semantic",
                                    label.position,
                                    "incompatible type in case",
                                ),
                            );
                            return;
                        }
                        if (
                            this.typeAnalyzer.sizeOf(scrutineeT) >= this.typeAnalyzer.sizeOf(labelT)
                        )
                            continue;
                    }
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            label.position,
                            `case label does not match scrutinee type; want ${scrutineeT.name.name}, got ${labelT.name.name}`,
                        ),
                    );
                    return;
                }

                const key =
                    label.kind == "integer_literal" ? "int:" + label.value : "char:" + label.value;
                if (seenLabels.has(key)) {
                    this.diagnostics.addError(
                        Error(
                            this.diagnostics.fileName,
                            "semantic",
                            label.position,
                            "duplicate label detected",
                        ),
                    );
                    return;
                }
                seenLabels.set(key, true);
            }
        }

        if (scrutineeT.kind != "enum" && s.default?.body.statements.length == 0) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.scrutinee.position,
                    "missing default statement",
                ),
            );
            return;
        }

        for (const caseObj of s.cases) {
            const caseCtx = context;
            caseCtx.switch = true;
            this.blockAnalyzer.analyze(
                caseObj.body as unknown as BlockStatement,
                caseCtx,
                new Scope(scope),
            );
        }
        if (s.default?.body.statements.length! > 0) {
            const defaultCtx = context;
            defaultCtx.switch = true;
            this.blockAnalyzer.analyze(
                s.default!.body as unknown as BlockStatement,
                defaultCtx,
                new Scope(scope),
            );
        }
        return;
    }

    /** Returns whether a type is allowed as a switch scrutinee. */
    private isSwitchable(t: Type) {
        return t.kind == "enum" || this.typeAnalyzer.isInteger(t) || t.value == TypeValue.Type_Char;
    }

    /** Returns whether an integer-like type accepts negative case labels. */
    private isSigned(t: Type): boolean {
        return this.typeAnalyzer.isInteger(t) && !t.value.startsWith("Type_U");
    }
}
