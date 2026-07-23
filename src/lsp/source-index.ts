import { Tokenizer } from "../ast/tokenizer.js";
import { TokenKind, type Token } from "../ast/tokens.js";

export type IndexedSymbol = {
    name: string;
    kind: "function" | "method" | "type" | "variable" | "parameter" | "field" | "module";
    type?: string;
    signature?: string;
    typeParameters?: string[];
    errorTypes?: string[];
    exported?: boolean;
    uri?: string;
    importPath?: string;
    namespaceKey?: string;
    token: Token;
    scope: LexicalScope;
};

export type StructInfo = { fields: IndexedSymbol[]; aliasOf?: string };

export type IndexedImport = {
    kind: "named" | "module";
    path: string;
    names: string[];
    moduleName?: string;
    localName?: string;
    leftBrace?: Token;
    rightBrace?: Token;
    end: number;
};

class LexicalScope {
    readonly symbols = new Map<string, IndexedSymbol>();
    readonly children: LexicalScope[] = [];

    constructor(
        readonly start: number,
        public end: number,
        readonly parent?: LexicalScope,
    ) {}

    contains(offset: number): boolean {
        return this.start <= offset && offset <= this.end;
    }

    findScope(offset: number): LexicalScope {
        return this.children.find((child) => child.contains(offset))?.findScope(offset) ?? this;
    }

    lookup(name: string): IndexedSymbol | undefined {
        return this.symbols.get(name) ?? this.parent?.lookup(name);
    }
}

const isTrivia = (token: Token | undefined) =>
    token?.kind === TokenKind.Kind_LineComment || token?.kind === TokenKind.Kind_BlockComment;

function previous(tokens: Token[], index: number): number {
    for (let i = index - 1; i >= 0; i--) if (!isTrivia(tokens[i])) return i;
    return -1;
}

function next(tokens: Token[], index: number): number {
    for (let i = index + 1; i < tokens.length; i++) if (!isTrivia(tokens[i])) return i;
    return -1;
}

function scopeFor(root: LexicalScope, offset: number): LexicalScope {
    return root.findScope(offset);
}

/**
 * A tolerant source index for editor queries. It deliberately operates on the
 * token stream: it remains useful while an in-progress document has parser
 * errors, while diagnostics still come from the real compiler pipeline.
 */
export class SourceIndex {
    readonly tokens: Token[];
    readonly root: LexicalScope;
    readonly structs = new Map<string, StructInfo>();
    readonly namespaces = new Map<string, IndexedSymbol[]>();
    readonly imports: IndexedImport[] = [];
    exportModuleName?: string;
    moduleDeclaration?: IndexedSymbol;

    constructor(
        readonly source: string,
        readonly uri?: string,
    ) {
        this.tokens = new Tokenizer(source)
            .tokenize()
            .filter((token) => token.kind !== TokenKind.Kind_EOF);
        this.root = new LexicalScope(0, source.length);
        this.buildScopes();
        this.indexDeclarations();
        this.indexResultBindings();
    }

    private buildScopes() {
        const stack = [this.root];
        for (const token of this.tokens) {
            if (token.kind === TokenKind.Symbol_LeftBrace) {
                const parent = stack[stack.length - 1]!;
                const scope = new LexicalScope(token.start, this.source.length, parent);
                parent.children.push(scope);
                stack.push(scope);
            } else if (token.kind === TokenKind.Symbol_RightBrace && stack.length > 1) {
                stack.pop()!.end = token.end;
            }
        }
    }

    private add(symbol: IndexedSymbol) {
        symbol.scope.symbols.set(symbol.name, symbol);
    }

    private indexDeclarations() {
        for (let i = 0; i < this.tokens.length; i++) {
            if (
                this.tokens[i]!.kind === TokenKind.Keyword_Export &&
                this.tokens[next(this.tokens, i)]?.kind === TokenKind.Keyword_Module
            ) {
                const name = this.tokens[next(this.tokens, next(this.tokens, i))];
                if (name?.kind === TokenKind.Kind_Identifier) {
                    this.exportModuleName = name.value;
                    this.moduleDeclaration = {
                        name: name.value,
                        kind: "module",
                        signature: `export module ${name.value}`,
                        exported: true,
                        uri: this.uri,
                        token: name,
                        scope: this.root,
                    };
                }
            }
        }
        // Index record shapes first so receiver functions can attach to types
        // even when a method appears before its record declaration.
        for (let i = 0; i < this.tokens.length; i++) {
            if (this.tokens[i]!.kind === TokenKind.Keyword_Type) this.indexType(i);
        }
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i]!;
            if (token.kind === TokenKind.Keyword_Function) this.indexFunction(i);
            if (token.kind === TokenKind.Keyword_Const || token.kind === TokenKind.Keyword_Let)
                this.indexVariable(i);
            if (token.kind === TokenKind.Keyword_Import) this.indexImport(i);
        }
    }

    private isExported(index: number): boolean {
        return (
            !!this.exportModuleName ||
            this.tokens[previous(this.tokens, index)]?.kind === TokenKind.Keyword_Export
        );
    }

    private text(start: number, end: number): string {
        const first = this.tokens[start];
        const last = this.tokens[end];
        return first && last ? this.source.slice(first.start, last.end) : "";
    }

    private typeTextAfter(nameIndex: number, stopKinds: TokenKind[]): string | undefined {
        const colon = next(this.tokens, nameIndex);
        if (this.tokens[colon]?.kind !== TokenKind.Symbol_Colon) return undefined;
        const start = next(this.tokens, colon);
        if (start < 0) return undefined;
        let angle = 0;
        let square = 0;
        let end = start;
        for (let i = start; i < this.tokens.length; i++) {
            const kind = this.tokens[i]!.kind;
            if (kind === TokenKind.Symbol_Less) angle++;
            else if (kind === TokenKind.Symbol_Greater && angle > 0) angle--;
            else if (kind === TokenKind.Symbol_LeftBracket) square++;
            else if (kind === TokenKind.Symbol_RightBracket && square > 0) square--;
            if (angle === 0 && square === 0 && stopKinds.includes(kind)) break;
            end = i;
        }
        return this.text(start, end).trim();
    }

    private matchingAngle(open: number): number {
        return this.match(open, TokenKind.Symbol_Less, TokenKind.Symbol_Greater);
    }

    private indexFunction(index: number) {
        let nameIndex = next(this.tokens, index);
        let receiverName: Token | undefined;
        let receiverType: string | undefined;
        if (this.tokens[nameIndex]?.kind === TokenKind.Symbol_LeftParen) {
            const receiverClose = this.match(
                nameIndex,
                TokenKind.Symbol_LeftParen,
                TokenKind.Symbol_RightParen,
            );
            if (receiverClose < 0) return;
            const receiverNameIndex = next(this.tokens, nameIndex);
            receiverName = this.tokens[receiverNameIndex];
            if (receiverName?.kind !== TokenKind.Kind_Identifier) return;
            receiverType = this.typeTextAfter(receiverNameIndex, [TokenKind.Symbol_RightParen]);
            if (!receiverType) return;
            nameIndex = next(this.tokens, receiverClose);
        }
        const name = this.tokens[nameIndex];
        if (!name || name.kind !== TokenKind.Kind_Identifier) return;
        let open = next(this.tokens, nameIndex);
        let typeParameters: string[] | undefined;
        if (this.tokens[open]?.kind === TokenKind.Symbol_Less) {
            const closeTypes = this.matchingAngle(open);
            if (closeTypes < 0) return;
            typeParameters = this.tokens
                .slice(open + 1, closeTypes)
                .filter((token) => token.kind === TokenKind.Kind_Identifier)
                .map((token) => token.value);
            open = next(this.tokens, closeTypes);
        }
        if (this.tokens[open]?.kind !== TokenKind.Symbol_LeftParen) return;
        const close = this.match(open, TokenKind.Symbol_LeftParen, TokenKind.Symbol_RightParen);
        if (close < 0) return;

        let returnType: string | undefined;
        let errorTypes: string[] | undefined;
        const afterClose = next(this.tokens, close);
        if (this.tokens[afterClose]?.kind === TokenKind.Symbol_Colon) {
            const start = next(this.tokens, afterClose);
            let cursor = start;
            let angle = 0;
            while (cursor >= 0 && cursor < this.tokens.length) {
                const kind = this.tokens[cursor]!.kind;
                if (kind === TokenKind.Symbol_Less) angle++;
                else if (kind === TokenKind.Symbol_Greater && angle > 0) angle--;
                if (
                    angle === 0 &&
                    (kind === TokenKind.Symbol_Pipe || kind === TokenKind.Symbol_LeftBrace)
                )
                    break;
                cursor++;
            }
            if (cursor > start) returnType = this.text(start, cursor - 1).trim();
            if (this.tokens[cursor]?.kind === TokenKind.Symbol_Pipe) {
                const errorStart = next(this.tokens, cursor);
                let errorEnd = errorStart;
                while (
                    errorEnd < this.tokens.length &&
                    this.tokens[errorEnd]!.kind !== TokenKind.Symbol_LeftBrace
                )
                    errorEnd++;
                errorTypes = this.tokens
                    .slice(errorStart, errorEnd)
                    .filter((token) => token.kind === TokenKind.Kind_Identifier)
                    .map((token) => token.value);
            }
        }
        const parameters: string[] = [];
        for (let i = open + 1; i < close; i++) {
            const parameter = this.tokens[i]!;
            if (parameter.kind !== TokenKind.Kind_Identifier) continue;
            const type = this.typeTextAfter(i, [
                TokenKind.Symbol_Comma,
                TokenKind.Symbol_RightParen,
            ]);
            if (!type) continue;
            parameters.push(`${parameter.value}: ${type}`);
        }
        const bodyOpen = this.tokens.findIndex(
            (token, i) => i > close && token.kind === TokenKind.Symbol_LeftBrace,
        );
        const previousIndex = previous(this.tokens, index);
        const signatureStart =
            this.tokens[previousIndex]?.kind === TokenKind.Keyword_Export ? previousIndex : index;
        const symbol: IndexedSymbol = {
            name: name.value,
            kind: receiverType ? "method" : "function",
            type: returnType,
            signature:
                bodyOpen >= 0
                    ? this.source
                          .slice(this.tokens[signatureStart]!.start, this.tokens[bodyOpen]!.start)
                          .trim()
                    : `function ${name.value}${typeParameters?.length ? `<${typeParameters.join(", ")}>` : ""}(${parameters.join(", ")})${returnType ? `: ${returnType}` : ""}`,
            typeParameters,
            errorTypes,
            exported: this.isExported(index),
            uri: this.uri,
            token: name,
            scope: this.root,
        };
        if (receiverType) {
            const receiverInfo = this.structs.get(this.baseTypeName(receiverType));
            if (receiverInfo && !receiverInfo.fields.some((member) => member.name === name.value)) {
                receiverInfo.fields.push(symbol);
            }
        } else {
            this.add(symbol);
        }

        if (bodyOpen < 0) return;
        const functionScope = scopeFor(this.root, this.tokens[bodyOpen]!.start + 1);
        if (receiverName && receiverType) {
            this.add({
                name: receiverName.value,
                kind: "parameter",
                type: receiverType,
                token: receiverName,
                scope: functionScope,
                uri: this.uri,
            });
        }
        for (let i = open + 1; i < close; i++) {
            const parameter = this.tokens[i]!;
            const type = this.typeTextAfter(i, [
                TokenKind.Symbol_Comma,
                TokenKind.Symbol_RightParen,
            ]);
            if (parameter.kind === TokenKind.Kind_Identifier && type) {
                this.add({
                    name: parameter.value,
                    kind: "parameter",
                    type,
                    token: parameter,
                    scope: functionScope,
                    uri: this.uri,
                });
            }
        }
    }

    private indexVariable(index: number) {
        const nameIndex = next(this.tokens, index);
        const name = this.tokens[nameIndex];
        if (!name || name.kind !== TokenKind.Kind_Identifier) return;
        const scope = scopeFor(this.root, name.start);
        const type =
            this.typeTextAfter(nameIndex, [TokenKind.Symbol_Equals, TokenKind.Symbol_Semicolon]) ??
            this.inferVariableType(nameIndex, scope);
        this.add({
            name: name.value,
            kind: "variable",
            type,
            signature: `${this.tokens[index]!.value} ${name.value}${type ? `: ${type}` : ""}`,
            exported: scope === this.root && this.isExported(index),
            uri: this.uri,
            token: name,
            scope,
        });
    }

    private inferVariableType(nameIndex: number, scope: LexicalScope): string | undefined {
        const equals = next(this.tokens, nameIndex);
        if (this.tokens[equals]?.kind !== TokenKind.Symbol_Equals) return undefined;
        const valueIndex = next(this.tokens, equals);
        const value = this.tokens[valueIndex];
        if (!value) return undefined;
        switch (value.kind) {
            case TokenKind.Kind_IntegerLiteral:
                return "int32";
            case TokenKind.Kind_FloatLiteral:
                return "float64";
            case TokenKind.Kind_BooleanLiteral:
                return "bool";
            case TokenKind.Kind_StringLiteral:
                return "string";
            case TokenKind.Kind_CharacterLiteral:
                return "char";
            case TokenKind.Kind_Identifier:
                if (
                    this.tokens[next(this.tokens, valueIndex)]?.kind === TokenKind.Symbol_Dot &&
                    this.tokens[next(this.tokens, next(this.tokens, valueIndex))]?.value ===
                        "length" &&
                    scope.lookup(value.value)?.type === "string"
                ) {
                    return "uintsize";
                }
                if (this.tokens[next(this.tokens, valueIndex)]?.kind === TokenKind.Symbol_LeftBrace)
                    return value.value;
                if (this.tokens[next(this.tokens, valueIndex)]?.kind === TokenKind.Symbol_LeftParen)
                    return scope.lookup(value.value)?.type;
                return scope.lookup(value.value)?.type;
            default:
                return undefined;
        }
    }

    private indexType(index: number) {
        let cursor = next(this.tokens, index);
        if (
            this.tokens[cursor]?.kind === TokenKind.Keyword_Struct ||
            this.tokens[cursor]?.kind === TokenKind.Keyword_Enum ||
            this.tokens[cursor]?.kind === TokenKind.Keyword_Union
        )
            cursor = next(this.tokens, cursor);
        const name = this.tokens[cursor];
        if (!name || name.kind !== TokenKind.Kind_Identifier) return;
        const isStruct =
            this.tokens[previous(this.tokens, cursor)]?.kind === TokenKind.Keyword_Struct;
        let afterName = next(this.tokens, cursor);
        let typeParameters: string[] | undefined;
        if (this.tokens[afterName]?.kind === TokenKind.Symbol_Less) {
            const closeTypes = this.matchingAngle(afterName);
            if (closeTypes < 0) return;
            typeParameters = this.tokens
                .slice(afterName + 1, closeTypes)
                .filter((token) => token.kind === TokenKind.Kind_Identifier)
                .map((token) => token.value);
            afterName = next(this.tokens, closeTypes);
        }
        const declarationEnd = this.tokens.findIndex(
            (token, i) => i > cursor && token.kind === TokenKind.Symbol_Semicolon,
        );
        const signatureStart = this.isExported(index) ? previous(this.tokens, index) : index;
        const symbol: IndexedSymbol = {
            name: name.value,
            kind: "type",
            type: `${name.value}${typeParameters?.length ? `<${typeParameters.join(", ")}>` : ""}`,
            signature:
                declarationEnd >= 0
                    ? this.source.slice(
                          this.tokens[signatureStart]!.start,
                          this.tokens[declarationEnd]!.end,
                      )
                    : undefined,
            typeParameters,
            exported: this.isExported(index),
            uri: this.uri,
            token: name,
            scope: this.root,
        };
        this.add(symbol);
        const info: StructInfo = { fields: [] };
        this.structs.set(name.value, info);

        const equals = afterName;
        const target = this.tokens[next(this.tokens, equals)];
        if (
            !isStruct &&
            this.tokens[equals]?.kind === TokenKind.Symbol_Equals &&
            target?.kind === TokenKind.Kind_Identifier
        ) {
            info.aliasOf = target.value;
            return;
        }
        if (!isStruct) return;
        const open = this.tokens.findIndex(
            (token, i) => i > cursor && token.kind === TokenKind.Symbol_LeftBrace,
        );
        if (open < 0) return;
        const close = this.match(open, TokenKind.Symbol_LeftBrace, TokenKind.Symbol_RightBrace);
        if (close < 0) return;
        for (let i = open + 1; i < close; i++) {
            const field = this.tokens[i]!;
            const type = this.typeTextAfter(i, [
                TokenKind.Symbol_Comma,
                TokenKind.Symbol_RightBrace,
            ]);
            if (field.kind !== TokenKind.Kind_Identifier || !type) continue;
            const fieldSymbol: IndexedSymbol = {
                name: field.value,
                kind: "field",
                type,
                token: field,
                scope: this.root,
                uri: this.uri,
            };
            info.fields.push(fieldSymbol);
        }
    }

    private indexImport(index: number) {
        const leftIndex = next(this.tokens, index);
        const leftBrace = this.tokens[leftIndex];
        if (leftBrace?.kind !== TokenKind.Symbol_LeftBrace) {
            const moduleToken = leftBrace;
            if (moduleToken?.kind !== TokenKind.Kind_Identifier) return;
            let cursor = next(this.tokens, leftIndex);
            let localToken = moduleToken;
            if (this.tokens[cursor]?.kind === TokenKind.Keyword_As) {
                cursor = next(this.tokens, cursor);
                const alias = this.tokens[cursor];
                if (alias?.kind !== TokenKind.Kind_Identifier) return;
                localToken = alias;
                cursor = next(this.tokens, cursor);
            }
            if (this.tokens[cursor]?.kind !== TokenKind.Keyword_From) return;
            const pathIndex = next(this.tokens, cursor);
            const pathToken = this.tokens[pathIndex];
            if (pathToken?.kind !== TokenKind.Kind_StringLiteral) return;
            const semicolonIndex = next(this.tokens, pathIndex);
            const importPath = pathToken.value.replace(/^['"]|['"]$/g, "");
            this.imports.push({
                kind: "module",
                path: importPath,
                names: [localToken.value],
                moduleName: moduleToken.value,
                localName: localToken.value,
                end:
                    this.tokens[semicolonIndex]?.kind === TokenKind.Symbol_Semicolon
                        ? this.tokens[semicolonIndex]!.end
                        : pathToken.end,
            });
            this.add({
                name: localToken.value,
                kind: "module",
                namespaceKey: localToken.value,
                importPath,
                uri: this.uri,
                token: localToken,
                scope: this.root,
                exported: !!this.exportModuleName,
            });
            return;
        }
        const rightIndex = this.match(
            leftIndex,
            TokenKind.Symbol_LeftBrace,
            TokenKind.Symbol_RightBrace,
        );
        if (rightIndex < 0) return;
        const fromIndex = next(this.tokens, rightIndex);
        const pathIndex = next(this.tokens, fromIndex);
        if (this.tokens[fromIndex]?.kind !== TokenKind.Keyword_From) return;
        const pathToken = this.tokens[pathIndex];
        if (pathToken?.kind !== TokenKind.Kind_StringLiteral) return;
        const importPath = pathToken.value.replace(/^['"]|['"]$/g, "");
        const semicolonIndex = next(this.tokens, pathIndex);
        const names = this.tokens
            .slice(leftIndex + 1, rightIndex)
            .filter((token) => token.kind === TokenKind.Kind_Identifier);
        this.imports.push({
            kind: "named",
            path: importPath,
            names: names.map((token) => token.value),
            leftBrace,
            rightBrace: this.tokens[rightIndex]!,
            end:
                this.tokens[semicolonIndex]?.kind === TokenKind.Symbol_Semicolon
                    ? this.tokens[semicolonIndex]!.end
                    : pathToken.end,
        });
        for (const token of names) {
            this.add({
                name: token.value,
                kind: "variable",
                importPath,
                uri: this.uri,
                token,
                scope: this.root,
            });
        }
    }

    private indexResultBindings() {
        for (let i = 0; i < this.tokens.length; i++) {
            if (this.tokens[i]!.kind !== TokenKind.Keyword_As) continue;
            const nameIndex = next(this.tokens, i);
            const name = this.tokens[nameIndex];
            if (!name || name.kind !== TokenKind.Kind_Identifier) continue;
            if (this.tokens[previous(this.tokens, i)]?.kind === TokenKind.Keyword_Error) continue;

            let statementStart = i - 1;
            while (
                statementStart >= 0 &&
                ![
                    TokenKind.Symbol_Semicolon,
                    TokenKind.Symbol_LeftBrace,
                    TokenKind.Symbol_RightBrace,
                ].includes(this.tokens[statementStart]!.kind)
            ) {
                statementStart--;
            }
            const statementTokens = this.tokens.slice(statementStart + 1, i);
            if (statementTokens.some((token) => token.kind === TokenKind.Keyword_Import)) continue;
            if (statementTokens.some((token) => token.kind === TokenKind.Keyword_Check)) continue;

            let sourceFunction: IndexedSymbol | undefined;
            const closeCall = previous(this.tokens, i);
            if (this.tokens[closeCall]?.kind === TokenKind.Symbol_RightParen) {
                let depth = 0;
                for (let cursor = closeCall; cursor >= statementStart; cursor--) {
                    const kind = this.tokens[cursor]!.kind;
                    if (kind === TokenKind.Symbol_RightParen) depth++;
                    else if (kind === TokenKind.Symbol_LeftParen && --depth === 0) {
                        let calleeIndex = previous(this.tokens, cursor);
                        if (this.tokens[calleeIndex]?.kind === TokenKind.Symbol_Greater) {
                            let angleDepth = 0;
                            for (let typeCursor = calleeIndex; typeCursor >= 0; typeCursor--) {
                                const typeKind = this.tokens[typeCursor]!.kind;
                                if (typeKind === TokenKind.Symbol_Greater) angleDepth++;
                                else if (typeKind === TokenKind.Symbol_Less && --angleDepth === 0) {
                                    calleeIndex = previous(this.tokens, typeCursor);
                                    break;
                                }
                            }
                        }
                        const callee = this.tokens[calleeIndex];
                        if (callee?.kind === TokenKind.Kind_Identifier) {
                            sourceFunction = this.root.lookup(callee.value);
                        }
                        break;
                    }
                }
            }
            const channels = [
                sourceFunction?.type ?? "success",
                ...(sourceFunction?.errorTypes ?? []),
            ];
            this.add({
                name: name.value,
                kind: "variable",
                type: `result<${channels.join(" | ")}>`,
                signature: `result ${name.value}: ${channels.join(" | ")}`,
                token: name,
                uri: this.uri,
                scope: scopeFor(this.root, name.start),
            });
        }
    }

    private match(open: number, left: TokenKind, right: TokenKind): number {
        let depth = 0;
        for (let i = open; i < this.tokens.length; i++) {
            if (this.tokens[i]!.kind === left) depth++;
            if (this.tokens[i]!.kind === right && --depth === 0) return i;
        }
        return -1;
    }

    tokenAt(offset: number): number {
        return this.tokens.findIndex((token) => token.start <= offset && offset < token.end);
    }

    resolveAt(offset: number): IndexedSymbol | undefined {
        const index = this.tokenAt(offset);
        if (index < 0) return undefined;
        const token = this.tokens[index]!;
        if (token.kind !== TokenKind.Kind_Identifier) return undefined;
        if (this.moduleDeclaration?.token.start === token.start) return this.moduleDeclaration;
        if (this.tokens[next(this.tokens, index)]?.kind === TokenKind.Symbol_Colon) {
            const field = this.resolveObjectField(index);
            if (field) return field;
        }
        if (this.tokens[previous(this.tokens, index)]?.kind === TokenKind.Symbol_Dot)
            return this.resolveMember(index);
        return scopeFor(this.root, token.start).lookup(token.value);
    }

    private resolveObjectField(fieldIndex: number): IndexedSymbol | undefined {
        const brace = this.enclosingLeftBrace(fieldIndex);
        if (brace < 0) return undefined;
        const typeName = this.objectTypeBeforeBrace(brace);
        if (!typeName) return undefined;
        return this.fieldsFor(typeName).find(
            (field) => field.name === this.tokens[fieldIndex]!.value,
        );
    }

    private enclosingLeftBrace(index: number): number {
        let depth = 0;
        for (let cursor = index - 1; cursor >= 0; cursor--) {
            const kind = this.tokens[cursor]!.kind;
            if (kind === TokenKind.Symbol_RightBrace) depth++;
            else if (kind === TokenKind.Symbol_LeftBrace) {
                if (depth === 0) return cursor;
                depth--;
            }
        }
        return -1;
    }

    private objectTypeBeforeBrace(brace: number): string | undefined {
        const before = previous(this.tokens, brace);
        const token = this.tokens[before];
        if (!token) return undefined;
        if (token.kind === TokenKind.Kind_Identifier) return token.value;

        if (token.kind === TokenKind.Symbol_Greater || token.kind === TokenKind.Symbol_ShiftRight) {
            let depth = 0;
            for (let cursor = before; cursor >= 0; cursor--) {
                const kind = this.tokens[cursor]!.kind;
                if (kind === TokenKind.Symbol_Greater) depth++;
                else if (kind === TokenKind.Symbol_ShiftRight) depth += 2;
                else if (kind === TokenKind.Symbol_Less && --depth === 0) {
                    const owner = this.tokens[previous(this.tokens, cursor)];
                    return owner?.kind === TokenKind.Kind_Identifier ? owner.value : undefined;
                }
            }
        }

        if (token.kind === TokenKind.Symbol_Colon) {
            const outerField = this.resolveObjectField(previous(this.tokens, before));
            return outerField?.type;
        }

        if (token.kind !== TokenKind.Symbol_Equals) return undefined;
        let statementStart = before - 1;
        while (
            statementStart >= 0 &&
            ![
                TokenKind.Symbol_Semicolon,
                TokenKind.Symbol_LeftBrace,
                TokenKind.Symbol_RightBrace,
            ].includes(this.tokens[statementStart]!.kind)
        ) {
            statementStart--;
        }
        for (let cursor = statementStart + 1; cursor < before; cursor++) {
            if (this.tokens[cursor]!.kind !== TokenKind.Symbol_Colon) continue;
            const annotated = this.tokens[next(this.tokens, cursor)];
            if (annotated?.kind === TokenKind.Kind_Identifier) return annotated.value;
        }
        const assigned = previous(this.tokens, before);
        return this.resolveToken(assigned)?.type;
    }

    private resolveMember(memberIndex: number): IndexedSymbol | undefined {
        const receiverIndex = previous(this.tokens, previous(this.tokens, memberIndex));
        if (receiverIndex < 0) return undefined;
        const receiver = this.resolveToken(receiverIndex);
        if (receiver?.kind === "module") {
            return this.namespaces
                .get(receiver.namespaceKey ?? receiver.name)
                ?.find((member) => member.name === this.tokens[memberIndex]!.value);
        }
        const type = receiver?.type ?? receiver?.name;
        return type
            ? this.fieldsFor(type).find((field) => field.name === this.tokens[memberIndex]!.value)
            : undefined;
    }

    private resolveToken(index: number): IndexedSymbol | undefined {
        const token = this.tokens[index];
        if (!token || token.kind !== TokenKind.Kind_Identifier) return undefined;
        if (this.tokens[previous(this.tokens, index)]?.kind === TokenKind.Symbol_Dot)
            return this.resolveMember(index);
        return scopeFor(this.root, token.start).lookup(token.value);
    }

    fieldsFor(typeName: string): IndexedSymbol[] {
        const namespace = this.namespaces.get(typeName);
        if (namespace) return namespace;
        const seen = new Set<string>();
        let type = this.baseTypeName(typeName);
        while (!seen.has(type)) {
            seen.add(type);
            const info = this.structs.get(type);
            if (!info) return [];
            if (info.fields.length) return info.fields;
            if (!info.aliasOf) return [];
            type = info.aliasOf;
        }
        return [];
    }

    /** Removes access and indirection wrappers to find the member-bearing record. */
    private baseTypeName(typeName: string): string {
        let type = typeName
            .trim()
            .replace(/^edit\s+/, "")
            .replace(/^&\s*/, "");
        const indirection = type.match(/^owned\s*<\s*(.+)\s*>$/);
        if (indirection) type = indirection[1]!;
        return type.replace(/<.*>$/, "").replace(/\[.*$/, "").trim();
    }

    exportedSymbols(): IndexedSymbol[] {
        return [...this.root.symbols.values()].filter(
            (symbol) => !!this.exportModuleName || symbol.exported === true,
        );
    }

    importedNames(): Set<string> {
        return new Set(this.imports.flatMap((declaration) => declaration.names));
    }

    linkImports(
        resolve: (
            importPath: string,
            name: string,
        ) => { symbol: IndexedSymbol; struct?: StructInfo } | undefined,
        resolveModule?: (
            importPath: string,
            moduleName: string,
        ) =>
            | {
                  symbols: IndexedSymbol[];
                  structs: Map<string, StructInfo>;
                  namespaces: Map<string, IndexedSymbol[]>;
                  declaration?: IndexedSymbol;
              }
            | undefined,
    ) {
        for (const declaration of this.imports) {
            if (declaration.kind === "module") {
                const localName = declaration.localName!;
                const external = resolveModule?.(declaration.path, declaration.moduleName!);
                if (!external) continue;
                const binding = this.root.symbols.get(localName);
                if (binding && external.declaration) {
                    binding.signature = external.declaration.signature;
                    binding.uri = external.declaration.uri;
                    binding.token = external.declaration.token;
                }
                this.namespaces.set(
                    localName,
                    external.symbols.map((symbol) => ({
                        ...symbol,
                        namespaceKey:
                            symbol.kind === "module"
                                ? `${localName}.${symbol.name}`
                                : symbol.namespaceKey,
                        scope: this.root,
                        importPath: declaration.path,
                    })),
                );
                for (const symbol of external.symbols) {
                    if (symbol.kind !== "module") continue;
                    const sourceKey = symbol.namespaceKey ?? symbol.name;
                    const members = external.namespaces.get(sourceKey);
                    if (members) this.namespaces.set(`${localName}.${symbol.name}`, members);
                }
                for (const [name, struct] of external.structs) {
                    this.structs.set(`${localName}.${name}`, struct);
                }
                continue;
            }
            for (const name of declaration.names) {
                const external = resolve(declaration.path, name);
                if (!external) continue;
                this.root.symbols.set(name, {
                    ...external.symbol,
                    name,
                    scope: this.root,
                    importPath: declaration.path,
                });
                if (external.struct) this.structs.set(name, external.struct);
            }
        }
        this.indexResultBindings();
    }

    autoImportEdit(
        name: string,
        importPath: string,
    ): { start: number; end: number; newText: string } | undefined {
        if (this.root.symbols.has(name) || this.importedNames().has(name)) return undefined;
        const existing = this.imports.find(
            (declaration) => declaration.kind === "named" && declaration.path === importPath,
        );
        if (existing?.rightBrace) {
            return {
                start: existing.rightBrace.start,
                end: existing.rightBrace.start,
                newText: `${existing.names.length ? ", " : ""}${name}`,
            };
        }
        const insertion = this.imports.length ? this.imports[this.imports.length - 1]!.end : 0;
        return {
            start: insertion,
            end: insertion,
            newText: `${insertion ? "\n" : ""}import { ${name} } from "${importPath}";\n`,
        };
    }

    completions(offset: number): IndexedSymbol[] {
        let index = this.tokens.findIndex((token) => token.start <= offset && offset < token.end);
        if (
            index >= 0 &&
            this.tokens[index]!.kind === TokenKind.Kind_Identifier &&
            this.tokens[index]!.start < offset
        )
            index = previous(this.tokens, index);
        else index = this.tokens.reduce((best, token, i) => (token.end <= offset ? i : best), -1);
        if (this.tokens[index]?.kind === TokenKind.Symbol_Dot) {
            const receiver = this.resolveToken(previous(this.tokens, index));
            return receiver
                ? this.fieldsFor(receiver.namespaceKey ?? receiver.type ?? receiver.name)
                : [];
        }
        const visible: IndexedSymbol[] = [];
        for (
            let scope: LexicalScope | undefined = scopeFor(this.root, offset);
            scope;
            scope = scope.parent
        )
            visible.push(...scope.symbols.values());
        return [...new Map(visible.map((symbol) => [symbol.name, symbol])).values()];
    }

    isMemberCompletion(offset: number): boolean {
        let index = this.tokens.findIndex((token) => token.start <= offset && offset < token.end);
        if (
            index >= 0 &&
            this.tokens[index]!.kind === TokenKind.Kind_Identifier &&
            this.tokens[index]!.start < offset
        )
            index = previous(this.tokens, index);
        else index = this.tokens.reduce((best, token, i) => (token.end <= offset ? i : best), -1);
        return this.tokens[index]?.kind === TokenKind.Symbol_Dot;
    }
}
