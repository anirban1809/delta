import { TypeValue, type AssignmentStatement } from "../../ast/types.js";
import { Error, type Diagnostics } from "../../diagnostics/diagnostics.js";
import { BlockKind, SymbolKind, type BlockContext } from "../analyzer.js";
import type { Scope } from "../scope.js";
import { ExpressionAnalyzer } from "../expression_analyzer.js";
import { TypeAnalyzer } from "../type_analyzer.js";

/** Validates assignment targets and tracks definite assignment for bindings. */
export class AssignmentStatementAnalyzer {
    expr: ExpressionAnalyzer;
    types: TypeAnalyzer;

    constructor(public diagnostics: Diagnostics) {
        this.expr = new ExpressionAnalyzer(diagnostics);
        this.types = new TypeAnalyzer(diagnostics);
    }

    analyze(s: AssignmentStatement, context: BlockContext, scope: Scope) {
        const getRootName = (expression: AssignmentStatement["root"]): string => {
            if (expression.kind == "identifier") return expression.name;
            if (expression.kind == "member_access_expression") {
                return getRootName(expression.receiver as AssignmentStatement["root"]);
            }
            if (expression.kind == "index_expression") {
                return getRootName(expression.receiver as AssignmentStatement["root"]);
            }
            return "";
        };

        const rootName = getRootName(s.root);

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

        let readOnlyMemberMessage: string | undefined;
        let readOnlyMemberPosition = s.position;
        if (s.root.kind == "member_access_expression") {
            const receiverType = this.expr.analyze(s.root.receiver, scope);
            readOnlyMemberPosition = s.root.member.position ?? s.position;
            if (s.root.member.name == "length" && receiverType.value == TypeValue.Type_String) {
                readOnlyMemberMessage = "string length is read-only";
            } else if (["length", "size"].includes(s.root.member.name) && receiverType.slice) {
                readOnlyMemberMessage = "slice length is read-only";
            }
        }

        if (readOnlyMemberMessage) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    readOnlyMemberPosition,
                    readOnlyMemberMessage,
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
        if (symbol.kind == SymbolKind.SymbolParameter && !symbol.type?.edit) {
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

        // For an indexed target (`a[i] = ...`), validate the index the same way a
        // read does: reuse analyzeIndexExpression, which reports a compile-time
        // out-of-bounds error for a literal index or a `let` bound to a constant.
        let wantT = s.root.kind == "identifier" ? symbol.type : this.expr.analyze(s.root, scope);
        if (!wantT || wantT.value == TypeValue.TypeInvalid) {
            // Target analysis already reported why this place cannot be assigned.
            return;
        }
        if (
            s.target.kind == "move_expression" &&
            s.target.source.kind == "identifier" &&
            s.root.kind == "identifier" &&
            s.target.source.name == s.root.name
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.position,
                    `cannot move ${s.root.name} into itself`,
                ),
            );
            return;
        }
        if (s.target.kind == "object_literal" && wantT && !s.target.type.name.name) {
            s.target.type = structuredClone(wantT);
        }
        let haveT = s.operator
            ? this.expr.analyze(
                  {
                      kind: "binary_expression",
                      position: s.operatorPosition ?? s.position,
                      operator: s.operator.slice(0, -1),
                      left: s.root,
                      right: s.target,
                  },
                  scope,
              )
            : this.expr.analyze(s.target, scope, wantT);

        // An owned place is transparent when the RHS is a pointee value. An
        // owned RHS still selects the separate ownership-replacement path.
        let pointeeT = wantT;
        while (this.types.isIndirection(pointeeT) && pointeeT.typeParameters?.[0]) {
            pointeeT = pointeeT.typeParameters[0]!;
        }
        const writesPointee =
            pointeeT != wantT &&
            (this.types.arrayTypesMatch(pointeeT, haveT) ||
                this.types.isAliasOf(pointeeT, haveT, scope) ||
                (s.target.kind == "integer_literal" &&
                    this.types.isInteger(pointeeT) &&
                    this.types.isInteger(haveT) &&
                    this.types.checkIntegerRange(pointeeT, s.target)));
        if (writesPointee || (s.operator && s.root.implicitDereference)) {
            wantT = this.expr.dereferenceOwnedValue(s.root, wantT);
        }

        if (!s.operator && this.types.isIndirection(haveT)) {
            const pointee = haveT.typeParameters?.[0];
            if (
                pointee &&
                (this.types.typesMatch(wantT, pointee) ||
                    this.types.isAliasOf(wantT, pointee, scope))
            ) {
                haveT = this.expr.dereferenceOwnedValue(s.target, haveT);
            }
        }
        if (
            ["identifier", "member_access_expression", "index_expression"].includes(s.target.kind)
        ) {
            const tier = this.types.ownershipTier(haveT, scope);
            if (tier != "copyable") {
                const source = s.target.kind == "identifier" ? ` ${s.target.name}` : "";
                this.diagnostics.addError(
                    Error(
                        this.diagnostics.fileName,
                        "semantic",
                        s.target.position,
                        tier == "unique"
                            ? `cannot copy non-copyable unique value${source}; move a whole mutable binding instead`
                            : `cannot copy non-copyable value${source}; use move on a whole binding or clone this value`,
                    ),
                );
                return;
            }
        }
        if (
            haveT.value != TypeValue.TypeInvalid &&
            !this.types.arrayTypesMatch(wantT, haveT) &&
            !this.types.isAliasOf(wantT, haveT, scope) &&
            !(wantT.kind == "union" && this.types.isUnionVariant(wantT, haveT)) &&
            !(
                s.target.kind == "integer_literal" &&
                this.types.isInteger(wantT) &&
                this.types.isInteger(haveT) &&
                this.types.checkIntegerRange(wantT, s.target)
            )
        ) {
            this.diagnostics.addError(
                Error(
                    this.diagnostics.fileName,
                    "semantic",
                    s.target.position,
                    `assignment type mismatch: expected \`${wantT.name.name}\`, got \`${haveT.name.name}\``,
                ),
            );
            return;
        }

        if (s.root.kind == "identifier") {
            symbol.moved = "active";
            // A mutable binding's declaration-time literal is no longer a
            // sound compile-time constant after any assignment.
            symbol.value = undefined;
        }

        // A direct assignment is definite on the current path. Branch and loop
        // analyzers merge or restore this path-local state at their boundaries.
        if (s.root.kind == "identifier") symbol.assigned = true;
        if (!context.scopedAssignments.includes(symbol.name)) {
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
