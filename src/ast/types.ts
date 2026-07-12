import type { TokenKind } from "./tokens.js";

/** Shorthand for "T or undefined", the result of a parse step that may fail. */
export type U<T> = T | undefined;

/**
 * Source location of a node, spanning a contiguous run of characters.
 *
 * `line` and `column` are 1-based and point at the node's first character,
 * matching the coordinates produced by the tokenizer. `start` and `end` are
 * 0-based byte offsets into the source: `start` is inclusive, `end` is
 * exclusive, so `source.slice(start, end)` yields the node's exact text.
 */
export type Position = {
    line: number;
    column: number;
    start: number;
    end: number;
};

/** Constructs a {@link Position} from its four coordinates. */
export function Position(line: number, column: number, start: number, end: number): Position {
    return {
        line,
        column,
        start,
        end,
    };
}

/**
 * Root of a parsed program: the full set of modules that make up a build.
 *
 * Delta uses a multi-file module system, so a project aggregates every module
 * that was discovered and parsed together.
 */
export type Project = {
    modules: Module[];
};

/**
 * A single source file and the top-level declarations it contains.
 *
 * `fileName` is retained so diagnostics and later compiler stages can map a
 * declaration back to the file it originated from.
 */
export type Module = {
    fileName: string;
    declarations: Declaration[];
};

/**
 * A top-level item in a module.
 *
 * Currently only function declarations are supported; this union is expected
 * to grow as more declaration forms (types, imports, etc.) are parsed.
 */
export type Declaration = FunctionDeclaration | VariableDeclarationStatement | TypeDeclaration;

/** A named reference in the source — the spelling of a symbol or type. */
export type Identifier = { kind: "identifier"; name: string };

export function CreateIdentifier(name: string): Identifier {
    return { name, kind: "identifier" };
}

/**
 * A type reference as written at a use site (parameter, return position, …).
 *
 * `name` is the type's identifier as it appears in source, while `kind`
 * records which built-in/resolved {@link TypeValue} it denotes.
 */
export type Type = {
    position?: Position;
    kind: "type" | "struct" | "enum" | "union";
    name: Identifier;
    value: TypeValue;
    custom?: boolean;
    fields?: {
        name: Identifier;
        type: Type;
    }[];
    variants?: {
        name: Identifier;
        value: IntegerLiteral;
    }[];
    unionVariants?: Type[];
};

/**
 * Constructs a {@link Type} from a source `name` and its resolved
 * {@link TypeValue}, wrapping `name` in an {@link Identifier}.
 */
export function CreateType(name: string, value: TypeValue, position?: Position): Type {
    return {
        kind: "type",
        name: { name, kind: "identifier" },
        value,
        position,
    };
}

export enum TypeDeclKind {
    Alias,
    Struct,
    Enum,
    Union,
}

export type StructDecl = {
    name: Identifier;
    fields: {
        name: Identifier;
        type: Type;
    }[];
};

export type EnumDecl = {
    name: Identifier;
    variants: {
        name: Identifier;
        value: IntegerLiteral;
    }[];
};

export type UnionDecl = {
    name: Identifier;
    variants: Type[];
};

export type TypeAlias = {
    target: Type;
};

export type TypeDeclaration = {
    position: Position;
    kind: "type_declaration";
    name: Identifier;
    declKind: TypeDeclKind;
    declaration: StructDecl | EnumDecl | UnionDecl | TypeAlias;
};

/**
 * A function declaration.
 *
 * `returnTypes` is a list rather than a single type because Delta's
 * channel-style error model lets a function yield several results (e.g. a
 * value alongside an error state) instead of using exceptions or wrapper
 * types. `body` is the sequence of statements in the function's block.
 */
export type FunctionDeclaration = {
    position: Position;
    kind: "function_declaration";
    name: Identifier;
    returnTypes: Type[];
    errorTypes: Type[];
    parameters: FunctionParameter[];
    body: BlockStatement;
};

/** A single declared parameter of a function: its name and annotated type. */
export type FunctionParameter = {
    position: Position;
    name: Identifier;
    type: Type;
};

export type IfStatement = {
    position: Position;
    kind: "if_statement";
    condition: Expression;
    thenBlock: BlockStatement;
    elseBlock?: BlockStatement;
};

export type WhileStatement = {
    position: Position;
    kind: "while_statement";
    condition: Expression;
    body: BlockStatement;
};

/**
 * Any executable statement within a function body.
 *
 * Expands as more control-flow and binding forms are implemented; today it
 * covers nested blocks and returns.
 */
export type Statement =
    | ContinueStatement
    | BreakStatement
    | ForStatement
    | WhileStatement
    | IfStatement
    | BlockStatement
    | ReturnStatement
    | VariableDeclarationStatement
    | AssignmentStatement
    | ExpressionStatement
    | SwitchStatement
    | CaseBlockStatement;

export type ContinueStatement = {
    kind: "continue_statement";
    position: Position;
};

export type BreakStatement = {
    kind: "break_statement";
    position: Position;
};

export type ForStatement = {
    kind: "for_statement";
    position: Position;
    declaration?: VariableDeclarationStatement;
    condition?: Expression;
    modifier?: Expression;
    body: BlockStatement;
};

export type SwitchCase = {
    position: Position;
    labels: (IntegerLiteral | CharacterLiteral)[];
    body: CaseBlockStatement;
};

export type CaseBlockStatement = {
    position: Position;
    kind: "case_block_statement";
    statements: Statement[];
};

export type SwitchStatement = {
    kind: "switch_statement";
    position: Position;
    scrutinee: Expression;
    cases: SwitchCase[];
    default?: SwitchCase;
};

/**
 * A `let`/`const` variable declaration. `mutable` distinguishes `let` from
 * `const`; `file` marks a file-scope (module-level) declaration; `value` is the
 * initializer, absent only for an uninitialized `let`.
 */
export type VariableDeclarationStatement = {
    kind: "variable_declaration_statement";
    file: boolean;
    position: Position;
    mutable: boolean;
    type: Type;
    name: Identifier;
    value?: Expression;
};

/** A `{ … }` block introducing a nested scope with its own statements. */
export type BlockStatement = {
    position: Position;
    kind: "block_statement";
    statements: Statement[];
};

/** A `return` statement yielding the value of its expression. */
export type ReturnStatement = {
    position: Position;
    kind: "return_statement";
    expression: Expression;
};

/**
 * Any value-producing expression.
 */
export type Expression = { position: Position } & (
    | MemberAccessExpression
    | ObjectLiteralExpression
    | UnaryExpression
    | BinaryExpression
    | FunctionCallExpression
    | IntegerLiteral
    | FloatLiteral
    | BooleanLiteral
    | CharacterLiteral
    | Identifier
);

export type MemberAccessExpression = {
    kind: "member_access_expression";
    receiver: Expression;
    member: Identifier;
    enumMember?: boolean;
};

export type FieldInit = {
    kind: "field_init";
    field: {
        name: Identifier;
        value: Expression;
    };
};

export type SpreadElement = {
    kind: "spread_element";
    source: Expression;
};

export type ObjectLiteralElement = { position: Position } & (FieldInit | SpreadElement);

export type ObjectLiteralExpression = {
    kind: "object_literal";
    type: Type;
    elements: ObjectLiteralElement[];
};

/** A prefix unary operation (`!`, `-`, `~`) applied to a single operand. */
export type UnaryExpression = {
    kind: "unary_expression";
    operator: string;
    operand: Expression;
    type?: string;
};

/** A binary operation (`operator`) over a left and right operand. */
export type BinaryExpression = {
    kind: "binary_expression";
    left: Expression;
    right: Expression;
    operator: string;
    types?: {
        leftT: string;
        rightT: string;
    };
};

/** A call expression: a `callee` applied to a list of argument expressions. */
export type FunctionCallExpression = {
    kind: "function_call_expression";
    conversion?: {
        fromType: string;
        toType: string;
    };
    callee: Identifier;
    arguments: Expression[];
    position: Position;
};

/** An assignment `root = target;` to an existing binding. */
export type AssignmentStatement = {
    position: Position;
    kind: "assignment_statement";
    root: Expression;
    target: Expression;
};

export type ExpressionStatement = {
    kind: "expression_statement";
    position: Position;
    expression: Expression;
};

/**
 * An integer literal.
 *
 * The lexeme is kept as a string (`value`) so the original textual form is
 * preserved exactly until a later stage decides how to parse and range-check
 * it for a concrete integer type.
 */
export type IntegerLiteral = {
    position: Position;
    kind: "integer_literal";
    value: string;
};

export type CharacterLiteral = {
    position: Position;
    kind: "char_literal";
    value: string;
};

/**
 * A floating-point literal. Like {@link IntegerLiteral}, the lexeme is kept as
 * a string so the original textual form is preserved until a later stage
 * resolves it to a concrete float type.
 */
export type FloatLiteral = {
    kind: "float_literal";
    value: string;
};

/** A boolean literal (`true` or `false`), kept as its source lexeme. */
export type BooleanLiteral = {
    kind: "boolean_literal";
    value: string;
};

/**
 * The resolved kind of a {@link Type}.
 *
 * String-valued so the enum member serializes to its own readable name,
 * mirroring the convention used by `TokenKind`.
 */
export enum TypeValue {
    Type_Int32 = "Type_Int32",
    Type_Int64 = "Type_Int64",
    Type_Int16 = "Type_Int16",
    Type_Int8 = "Type_Int8",
    Type_UInt32 = "Type_UInt32",
    Type_UInt64 = "Type_UInt64",
    Type_UInt16 = "Type_UInt16",
    Type_UInt8 = "Type_UInt8",
    Type_IntSize = "Type_IntSize",
    Type_UIntSize = "Type_UIntSize",
    Type_Char = "Type_Char",
    Type_Bool = "Type_Bool",
    Type_Float32 = "Type_Float32",
    Type_Float64 = "Type_Float64",
    TypeCustom = "TypeCustom",
    TypeInvalid = "TypeInvalid",
}
