import { readFileSync } from "fs";
import type { Position } from "../ast/types.js";

/**
 * A single compiler error, tied to a span of source.
 *
 * `kind` records which compiler stage raised it (`"parser"` or `"semantic"`)
 * so messages can be grouped or filtered, and `position` locates the offending
 * span for rendering an underlined snippet.
 */
export type Error = {
    filepath: string;
    kind: "parser" | "semantic";
    position: Position;
    message: string;
};

/**
 * Constructs an {@link Error} record. A plain factory used in place of `new`
 * so call sites read as data rather than class instantiation (and so the
 * `Error` name shadows the global without needing `new`).
 */
export function Error(
    filepath: string,
    kind: "parser" | "semantic",
    position: Position,
    message: string,
): Error {
    return {
        filepath,
        kind,
        position,
        message,
    };
}

/** Reads `filePath` and returns the text of its 1-based `targetLine`. */
function getLineByNumber(filePath: string, targetLine: number): string {
    const file = readFileSync(filePath, "utf-8");
    const lines = file.split(/\r?\n/);
    return lines[targetLine - 1]!;
}

/**
 * Converts an absolute character offset into the 0-based column within its
 * line, by measuring the distance from the preceding newline.
 */
function getColumnIndex(filePath: string, charIndex: number): number {
    const file = readFileSync(filePath, "utf-8");
    const lineStart = file.lastIndexOf("\n", charIndex - 1) + 1;
    return charIndex - lineStart;
}

/**
 * Collects compiler errors and renders them for display.
 *
 * Errors are accumulated as the compiler runs so that several can be reported
 * from a single pass instead of aborting on the first failure.
 */
export class Diagnostics {
    errors: Error[];
    constructor() {
        this.errors = [];
    }

    /** Appends an error to the collection. */
    addError(e: Error) {
        this.errors.push(e);
    }

    /**
     * Renders one error as a multi-line, human-readable snippet: the message,
     * the file:line:col location, the offending source line, and a caret run
     * (`^`) underlining the exact span the error covers.
     */
    format(e: Error): string {
        const line = getLineByNumber(e.filepath, e.position.line);
        const startIndex = getColumnIndex(e.filepath, e.position.start);
        const endIndex = getColumnIndex(e.filepath, e.position.end - 1);
        return `${e.kind} error: ${e.message}
at ${e.filepath}:${e.position.line}:${e.position.column}
      |
    ${e.position.line} |\t${line}
      |\t${" ".repeat(startIndex)}${"^".repeat(endIndex - startIndex + 1)}`;
    }
}
