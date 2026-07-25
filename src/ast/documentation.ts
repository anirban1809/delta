import { TokenKind, type Token } from "./tokens.js";

/** Returns whether a comment uses one of Delta's documentation-comment forms. */
export function isDocumentationComment(token: Token): boolean {
    return (
        (token.kind === TokenKind.Kind_LineComment && token.value.startsWith("///")) ||
        (token.kind === TokenKind.Kind_BlockComment && token.value.startsWith("/**"))
    );
}

/** Returns the last source line occupied by a token. */
export function tokenEndLine(token: Token): number {
    return token.line + (token.value.match(/\n/g)?.length ?? 0);
}

/** Removes documentation delimiters while preserving the Markdown body. */
export function documentationCommentText(token: Token): string {
    if (token.kind === TokenKind.Kind_LineComment) {
        return token.value.slice(3).replace(/^ /, "");
    }

    const body = token.value.slice(3, token.value.endsWith("*/") ? -2 : undefined);
    let lines = body.replace(/\r\n?/g, "\n").split("\n");
    lines = lines.map((line) => {
        const starred = line.match(/^[ \t]*\*(?: ?)(.*)$/);
        return starred ? starred[1]! : line;
    });
    while (lines.length && lines[0]!.trim() === "") lines.shift();
    while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();

    const indents = lines
        .filter((line) => line.trim().length > 0)
        .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
    const commonIndent = indents.length ? Math.min(...indents) : 0;
    if (commonIndent) lines = lines.map((line) => line.slice(commonIndent));

    if (lines.length) {
        lines[0] = lines[0]!.replace(/^[ \t]+/, "");
        lines[lines.length - 1] = lines[lines.length - 1]!.replace(/[ \t]+$/, "");
    }
    return lines.join("\n");
}

/** Combines a contiguous run of documentation comments into one Markdown document. */
export function documentationFromComments(tokens: Token[]): string | undefined {
    const documentation = tokens.map(documentationCommentText).join("\n");
    return documentation.length ? documentation : undefined;
}

/**
 * Finds documentation immediately preceding a declaration token. A blank line
 * or an ordinary comment breaks the association.
 */
export function documentationBefore(tokens: Token[], declarationIndex: number): string | undefined {
    const declaration = tokens[declarationIndex];
    if (!declaration) return undefined;

    const comments: Token[] = [];
    let laterLine = declaration.line;
    for (let index = declarationIndex - 1; index >= 0; index--) {
        const token = tokens[index]!;
        if (!isDocumentationComment(token) || laterLine - tokenEndLine(token) > 1) break;
        comments.unshift(token);
        laterLine = token.line;
    }
    return documentationFromComments(comments);
}
