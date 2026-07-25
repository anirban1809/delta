/** Decodes the escape subset accepted by ordinary Delta string literals. */
export function decodeStringLiteral(value: string): string {
    const body = value.slice(1, -1);
    let decoded = "";
    for (let i = 0; i < body.length; i++) {
        const current = body[i]!;
        if (current != "\\") {
            const codePoint = body.codePointAt(i)!;
            decoded += String.fromCodePoint(codePoint);
            if (codePoint > 0xffff) i++;
            continue;
        }

        const escaped = body[++i];
        switch (escaped) {
            case "n":
                decoded += "\n";
                break;
            case "r":
                decoded += "\r";
                break;
            case "t":
                decoded += "\t";
                break;
            case "0":
                decoded += "\0";
                break;
            case "\\":
                decoded += "\\";
                break;
            case '"':
                decoded += '"';
                break;
            case "'":
                decoded += "'";
                break;
            case "\n":
                break;
            case "u": {
                if (body[i + 1] != "{") {
                    decoded += "u";
                    break;
                }
                const close = body.indexOf("}", i + 2);
                if (close < 0) {
                    decoded += "u";
                    break;
                }
                const codePoint = Number.parseInt(body.slice(i + 2, close), 16);
                const validScalar =
                    Number.isInteger(codePoint) &&
                    codePoint <= 0x10ffff &&
                    !(codePoint >= 0xd800 && codePoint <= 0xdfff);
                decoded += validScalar ? String.fromCodePoint(codePoint) : "\ufffd";
                i = close;
                break;
            }
            case "x": {
                const hex = body.slice(i + 1, i + 3);
                if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                    decoded += String.fromCharCode(Number.parseInt(hex, 16));
                    i += 2;
                } else {
                    decoded += "x";
                }
                break;
            }
            default:
                decoded += escaped ?? "\\";
        }
    }
    return decoded;
}
