import { Tokenizer } from "../ast/tokenizer.js";
import { TokenKind, type Token } from "../ast/tokens.js";
import { documentationBefore } from "../ast/documentation.js";

export type IndexedSymbol = {
    name: string;
    kind: "function" | "method" | "type" | "variable" | "parameter" | "field";
    type?: string;
    signature?: string;
    /** Markdown documentation attached to the declaration. */
    documentation?: string;
    typeParameters?: string[];
    errorTypes?: string[];
    exported?: boolean;
    uri?: string;
    token: Token;
    scope: LexicalScope;
};

export type StructInfo = { fields: IndexedSymbol[]; aliasOf?: string };

/** Formats a symbol signature and its documentation for LSP Markdown fields. */
export function symbolMarkdown(symbol: IndexedSymbol): string {
    const detail =
        symbol.signature ?? `${symbol.kind} ${symbol.name}${symbol.type ? `: ${symbol.type}` : ""}`;
    const signature = `\`\`\`delta\n${detail}\n\`\`\``;
    return symbol.documentation ? `${signature}\n\n${symbol.documentation}` : signature;
}

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

    /**
     * Finds documentation before a declaration, including comments placed
     * before a `unique` modifier.
     */
    private documentationAt(index: number): string | undefined {
        const direct = documentationBefore(this.tokens, index);
        if (direct) return direct;

        let cursor = previous(this.tokens, index);
        while (cursor >= 0 && this.tokens[cursor]!.kind === TokenKind.Keyword_Unique) {
            const documentation = documentationBefore(this.tokens, cursor);
            if (documentation) return documentation;
            cursor = previous(this.tokens, cursor);
        }
        return undefined;
    }

    private indexDeclarations() {
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
        }
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

    private typeParameterNames(open: number, close: number): string[] {
        const names: string[] = [];
        let expectName = true;
        let nested = 0;
        for (let i = open + 1; i < close; i++) {
            const token = this.tokens[i]!;
            if (token.kind === TokenKind.Symbol_Less) nested++;
            else if (token.kind === TokenKind.Symbol_Greater && nested > 0) nested--;
            else if (nested === 0 && token.kind === TokenKind.Symbol_Comma) expectName = true;
            else if (expectName && token.kind === TokenKind.Kind_Identifier) {
                names.push(token.value);
                expectName = false;
            }
        }
        return names;
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
            typeParameters = this.typeParameterNames(open, closeTypes);
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
        let terminator = close + 1;
        while (
            terminator < this.tokens.length &&
            ![TokenKind.Symbol_LeftBrace, TokenKind.Symbol_Semicolon].includes(
                this.tokens[terminator]!.kind,
            )
        ) {
            terminator++;
        }
        const bodyOpen =
            this.tokens[terminator]?.kind === TokenKind.Symbol_LeftBrace ? terminator : -1;
        const requirementEnd =
            this.tokens[terminator]?.kind === TokenKind.Symbol_Semicolon ? terminator : -1;
        const signatureStart = index;
        const symbol: IndexedSymbol = {
            name: name.value,
            kind: receiverType ? "method" : "function",
            type: returnType,
            signature:
                bodyOpen >= 0
                    ? this.source
                          .slice(this.tokens[signatureStart]!.start, this.tokens[bodyOpen]!.start)
                          .trim()
                    : requirementEnd >= 0
                      ? this.source
                            .slice(
                                this.tokens[signatureStart]!.start,
                                this.tokens[requirementEnd]!.end,
                            )
                            .trim()
                      : `function ${name.value}${typeParameters?.length ? `<${typeParameters.join(", ")}>` : ""}(${parameters.join(", ")})${returnType ? `: ${returnType}` : ""}`,
            documentation: this.documentationAt(index),
            typeParameters,
            errorTypes,
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
            documentation: this.documentationAt(index),
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
            typeParameters = this.typeParameterNames(afterName, closeTypes);
            afterName = next(this.tokens, closeTypes);
        }
        const declarationEnd = this.tokens.findIndex(
            (token, i) => i > cursor && token.kind === TokenKind.Symbol_Semicolon,
        );
        const signatureStart = index;
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
            documentation: this.documentationAt(index),
            typeParameters,
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
        for (const info of this.structs.values()) {
            const declaredMember = info.fields.find((member) => member.token.start === token.start);
            if (declaredMember) return declaredMember;
        }
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
            return receiver ? this.fieldsFor(receiver.type ?? receiver.name) : [];
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
