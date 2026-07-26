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
 * A single source file and the top-level declarations it contains.
 *
 * `fileName` is retained so diagnostics and later compiler stages can map a
 * declaration back to the file it originated from.
 */
export type Module = {
    fileName: string;
    declarations: Declaration[];
};

/** A top-level item in a module: a function, file-scope constant, or type. */
export type Declaration =
    | ImportDeclaration
    | FunctionDeclaration
    | VariableDeclarationStatement
    | TypeDeclaration;

/** A named reference in the source — the spelling of a symbol or type. */
export type Identifier = {
    kind: "identifier";
    name: string;
    typeArguments?: Type[];
    position?: Position;
};

export function CreateIdentifier(name: string, position?: Position): Identifier {
    return { name, kind: "identifier", position };
}

/**
 * A type reference as written at a use site (parameter, return position, …).
 *
 * `name` is the type's identifier as it appears in source, while `kind`
 * records which built-in/resolved {@link TypeValue} it denotes.
 */
export type Type = {
    position?: Position;
    //here kind: "type" represents all the primitive types and a default type kind
    kind: "type" | "struct" | "enum" | "union" | "array" | "generic";

    /**
     * Static-array extents, ordered from the outermost dimension to the
     * innermost one. For example, `int32[2][3]` is `[2, 3]`.
     */
    arrayLengths?: number[];
    /** Non-owning contiguous view (`T[]`) represented by a pointer and element count. */
    slice?: boolean;
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
    typeParameters?: Type[];
    /** Non-owning reference capability (`&T` / `edit &T`). */
    reference?: boolean;
    /** Mutable, exclusive reference capability. Implies `reference`. */
    edit?: boolean;
};

/**
 * Constructs a {@link Type} from a source `name` and its resolved
 * {@link TypeValue}, wrapping `name` in an {@link Identifier}.
 */
export function CreateType(
    name: string,
    value: TypeValue,
    position?: Position,
    arrayLengths?: number[],
): Type {
    return {
        kind: "type",
        name: { name, kind: "identifier" },
        arrayLengths,
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
    typeParameters?: Type[];
    concreteTypesMap?: Map<string, Type[]>;
    fields: {
        name: Identifier;
        type: Type;
    }[];
    /** Named records incorporated through spread/intersection composition. */
    compositions?: Type[];
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
    typeParameters?: Type[];
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
    /** Markdown documentation collected from an immediately preceding doc comment. */
    documentation?: string;
    /** Explicitly non-copyable user-defined type (`unique type ...`). */
    unique?: boolean;
};

export type ImportDeclaration = any;

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
    typeParameters?: Type[];
    returnTypes: Type[];
    errorTypes: Type[];
    parameters: FunctionParameter[];
    body: BlockStatement;
    /** Markdown documentation collected from an immediately preceding doc comment. */
    documentation?: string;
    concreteTypesMap?: Map<string, Type[]>;
    /** Receiver binding for `function (self: &T) method(...)`. */
    receiver?: FunctionParameter;
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
    | ReturnErrorStatement
    | CheckBlockStatement
    | ForwardStatement
    | VariableDeclarationStatement
    | AssignmentStatement
    | ExpressionStatement
    | SwitchStatement
    | CaseBlockStatement;

export type ContinueStatement = {
    kind: "continue_statement";
    position: Position;
    validDivergence?: boolean;
};

export type BreakStatement = {
    kind: "break_statement";
    position: Position;
    validDivergence?: boolean;
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
    asResult?: AsResultBinding;
    /** Markdown documentation for a file-scope constant declaration. */
    documentation?: string;
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
    expression?: Expression;
    /** All returned success values; `expression` aliases the first for compatibility. */
    expressions?: Expression[];
};

/** Metadata attached to a binding/assignment/expression suffixed by `as name`. */
export type AsResultBinding = {
    kind: "as_result_binding";
    position: Position;
    resultName: Identifier;
    successType?: Type;
    errorTypes?: Type[];
};

/** Handles the error edge of a live `as result` binding. */
export type CheckBlockStatement = {
    kind: "check_block_statement";
    position: Position;
    resultName: Identifier;
    /** The error variant selected by `as ErrorType`, when present. */
    errorType?: Type;
    /** Set by analysis when this check completes the result's exhaustive error set. */
    dischargesResult?: boolean;
    body: BlockStatement;
};

/** Propagates a live result's error unchanged to the enclosing caller. */
export type ForwardStatement = {
    kind: "forward_statement";
    position: Position;
    resultName: Identifier;
};

/** Constructs/returns an error value selected from the function's declared error set. */
export type ReturnErrorStatement = {
    kind: "return_error_statement";
    position: Position;
    value: Expression;
    values?: Expression[];
    resolvedErrorType?: Type;
    resolvedErrorTypes?: Type[];
};

/**
 * Any value-producing expression.
 */
export type Expression = {
    position: Position;
    expressionType?: Type;
    /** Number of compiler-inserted reads through an owned pointer in a value context. */
    implicitDereference?: number;
    /** Analysis-marked implicit transfer used only for direct allocation staging. */
    ownershipTransfer?: boolean;
    /** Analyzer-inserted conversion from a fixed array or literal to a slice value. */
    sliceConversion?: {
        sourceType: Type;
        targetType: Type;
    };
} & (
    | NewExpression
    | MoveExpression
    | CloneExpression
    | MemberAccessExpression
    | IndexExpression
    | ObjectLiteralExpression
    | ArrayLiteralExpression
    | UnaryExpression
    | BinaryExpression
    | FunctionCallExpression
    | IntegerLiteral
    | FloatLiteral
    | BooleanLiteral
    | CharacterLiteral
    | StringLiteral
    | Identifier
);

export type MoveExpression = {
    kind: "move_expression";
    source: Expression;
};

export type CloneExpression = {
    kind: "clone_expression";
    source: Expression;
};

export type NewExpression = {
    kind: "new_expression";
    expression: Expression;
};

export type MemberAccessExpression = {
    kind: "member_access_expression";
    receiver: Expression;
    member: Identifier;
    receiverType: Type;
    enumMember?: boolean;
};

/** A postfix array access (`receiver[index]`). */
export type IndexExpression = {
    kind: "index_expression";
    receiver: Expression;
    index: Expression;
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
    genericTypes?: Type[];
    concreteTypeMap?: Map<string, Type[]>;
};

/** A bracketed, ordered sequence of element expressions (`[a, b, c]`). */
export type ArrayLiteralExpression = {
    kind: "array_literal_expression";
    elements: Expression[];
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
    /** Decoded compile-time result for a statically foldable string concatenation. */
    constantStringValue?: string;
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
    callee: Expression;
    arguments: Expression[];
    position: Position;
    genericTypes?: Type[];
    concreteTypeMap?: Map<string, Type[]>;
    /** Error set resolved for either a free function or receiver call. */
    resolvedErrorTypes?: Type[];
    /** Declared parameter types after overload/generic resolution. */
    resolvedParameterTypes?: Type[];
    /** Receiver type name when this is a method call. */
    resolvedReceiverType?: string;
    /** Declared receiver reference used for method-call lowering. */
    resolvedReceiverParameter?: Type;
};

/** An assignment `root = target;` to an existing binding. */
export type AssignmentStatement = {
    position: Position;
    kind: "assignment_statement";
    root: Expression;
    target: Expression;
    operator?: string;
    operatorPosition?: Position;
    asResult?: AsResultBinding;
};

export type ExpressionStatement = {
    kind: "expression_statement";
    position: Position;
    expression: Expression;
    asResult?: AsResultBinding;
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

export type StringLiteral = {
    position: Position;
    kind: "string_literal";
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
    Type_String = "Type_String",
    Type_Float32 = "Type_Float32",
    Type_Float64 = "Type_Float64",
    Type_Owned = "Type_Owned",
    TypeCustom = "TypeCustom",
    TypeGeneric = "TypeGeneric",
    TypeInvalid = "TypeInvalid",
}
