import type { Statement } from "../../ast/types.js";
import type { BlockContext } from "../analyzer.js";
import type { Scope } from "../scope.js";

/** Function used by nested statement analyzers to dispatch another statement. */
export type AnalyzeStatement = (s: Statement, context: BlockContext, scope: Scope) => void;
