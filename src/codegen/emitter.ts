import { string, TokenKind } from "../ast/tokens.js";
import {
    TypeDeclKind,
    TypeValue,
    type AssignmentStatement,
    type BinaryExpression,
    type BlockStatement,
    type Declaration,
    type EnumDecl,
    type Expression,
    type FieldInit,
    type ForStatement,
    type FunctionCallExpression,
    type FunctionDeclaration,
    type IfStatement,
    type MemberAccessExpression,
    type Module,
    type ObjectLiteralExpression,
    type Statement,
    type StructDecl,
    type SwitchCase,
    type SwitchStatement,
    type Type,
    type TypeAlias,
    type TypeDeclaration,
    type U,
    type UnaryExpression,
    type UnionDecl,
    type VariableDeclarationStatement,
    type WhileStatement,
} from "../ast/types.js";

/**
 * Lowers a parsed {@link Module} to C source text.
 *
 * The emitter walks the AST and produces a single C translation unit: standard
 * headers, forward declarations for every function (so call order within the
 * module is irrelevant), the function definitions themselves, and a C `main`
 * shim that calls into the program's Delta `main`. `final` accumulates the
 * output and `indent` tracks the current nesting depth for pretty-printing.
 */
export class Emitter {
    final: string;
    indent: number;
    guards: {
        conversions: { fromType: string; toType: string }[];
        divisions: { type: string }[];
        shifts: { type: string }[];
        overflows: { type: string }[];
        underflows: { type: string }[];
    };
    guardNames: Map<string, string>;

    constructor(public ast: Module) {
        this.guardNames = new Map();
        this.guards = {
            overflows: [],
            underflows: [],
            conversions: [],
            divisions: [],
            shifts: [],
        };
        this.final = "";
        this.indent = 0;
    }

    /**
     * Maps a Delta {@link Type} to its C spelling. Primitive widths lower to the
     * `<stdint.h>` fixed-width types, `intsize`/`uintsize` to the pointer-width
     * `intptr_t`/`uintptr_t`, and user-defined types to a `delta__`-prefixed
     * struct name. An unresolved type lowers to `void`.
     */
    cType(t: Type): string {
        if (!t) {
            return "void";
        }
        switch (t.value) {
            case TypeValue.Type_Int8:
                return "int8_t";
            case TypeValue.Type_Int16:
                return "int16_t";
            case TypeValue.Type_Int32:
                return "int32_t";
            case TypeValue.Type_Int64:
                return "int64_t";
            case TypeValue.Type_UInt8:
                return "uint8_t";
            case TypeValue.Type_UInt16:
                return "uint16_t";
            case TypeValue.Type_UInt32:
                return "uint32_t";
            case TypeValue.Type_UInt64:
                return "uint64_t";
            case TypeValue.Type_IntSize:
                return "intptr_t";
            case TypeValue.Type_UIntSize:
                return "uintptr_t";
            case TypeValue.Type_Char:
                return "char";
            case TypeValue.Type_Float32:
                return "float";
            case TypeValue.Type_Float64:
                return "double";
            case TypeValue.Type_Bool:
                return "bool";
            case TypeValue.TypeCustom:
                const name = this.resolveTargetIfAlias(t);
                return "delta__" + name;
            case TypeValue.TypeInvalid:
                return "void";
        }
    }

    resolveTargetIfAlias(t: Type) {
        for (const d of this.ast.declarations) {
            if (d.kind == "type_declaration" && d.declKind == TypeDeclKind.Alias) {
                return (d.declaration as TypeAlias).target.name.name;
            }
        }

        return t.name.name;
    }

    /** Emits the standard C headers every generated unit depends on. */
    emitHeaders() {
        return "#include<stdio.h>\n#include<stdint.h>\n#include<stdbool.h>\n#include <stdlib.h>\n#include <math.h>\n\n";
    }

    /** Returns the indentation whitespace for the current nesting depth. */
    emitIndent(): string {
        return "    ".repeat(this.indent);
    }

    convertDeltaToCType(name: string): U<string> {
        switch (name) {
            case "int8":
                return "int8_t";
            case "int16":
                return "int16_t";
            case "int32":
                return "int32_t";
            case "int64":
                return "int64_t";
            case "uint8":
                return "uint8_t";
            case "uint16":
                return "uint16_t";
            case "uint32":
                return "uint32_t";
            case "uint64":
                return "uint64_t";
            case "intsize":
                return "intptr_t";
            case "uintsize":
                return "uintptr_t";
            case "char":
                return "char";
            case "float32":
                return "float";
            case "float64":
                return "double";
            case "bool":
                return "bool";
        }
    }

    /** Emits a call expression as C: `callee(arg, …)`. */
    emitFunctionCallExpression(e: FunctionCallExpression): string {
        const callee = e.callee.name;

        if (e.conversion) {
            const deltaFromType = e.conversion.fromType;
            const deltaToType = e.conversion.toType;

            const converterName = "delta_rt__convert_" + `${deltaFromType}_to_${deltaToType}`;
            if (!this.guardNames.has(converterName)) {
                this.guards.conversions.push({
                    fromType: e.conversion.fromType,
                    toType: e.conversion.toType,
                });
                this.guardNames.set(converterName, "");
            }

            const args = e.arguments.map((x) => this.emitExpression(x)).join(",");
            return `${converterName}(${args}, "${this.ast.fileName}:${e.position.line}")`;
        }

        const args = e.arguments.map((x) => this.emitExpression(x)).join(",");
        return `${callee}(${args})`;
    }

    /** Emits a binary expression as C: `left <op> right`. */
    emitBinaryExpression(e: BinaryExpression): string {
        let left = this.emitExpression(e.left);
        let right = this.emitExpression(e.right);

        if (e.left.kind == "binary_expression") {
            left = "(" + left + ")";
        }

        if (e.right.kind == "binary_expression") {
            right = "(" + right + ")";
        }

        if (
            [string(TokenKind.Symbol_FSlash), string(TokenKind.Symbol_Percent)].includes(
                e.operator,
            ) &&
            !this.isFloatType(e.types?.rightT ?? "")
        ) {
            const converterName = `delta_rt__check_divisor_${e.types?.rightT}`;
            right = `${converterName}(${right}, "${this.ast.fileName}:${e.right.position.line}")`;
            if (!this.guardNames.has(converterName)) {
                this.guardNames.set(converterName, "");
                this.guards.divisions.push({
                    type: e.types?.rightT!,
                });
            }
        }

        if (
            [string(TokenKind.Symbol_ShiftLeft), string(TokenKind.Symbol_ShiftRight)].includes(
                e.operator,
            )
        ) {
            const converterName = `delta_rt__check_shift_${e.types?.rightT}`;
            right = `${converterName}(${right}, "${this.ast.fileName}:${e.right.position.line}")`;
            if (!this.guardNames.has(converterName)) {
                this.guardNames.set(converterName, "");
                this.guards.shifts.push({
                    type: e.types?.rightT!,
                });
            }
        }

        return `${left} ${e.operator} ${right}`;
    }

    /**
     * Emits a unary expression as C. `++`/`--` on an integer-typed identifier
     * gets routed through the overflow guard (`delta_rt__overflow_*`) instead
     * of a bare `<op>operand` — this applies wherever a unary expression is
     * emitted (a for-statement's modifier, a standalone `i++;` statement,
     * anywhere else `emitExpression` is reached), not just inside a for-loop's
     * step position.
     */
    emitUnaryExpression(e: UnaryExpression): string {
        const isIncr = e.operator == string(TokenKind.Symbol_Increment);
        const isDecr = e.operator == string(TokenKind.Symbol_Decrement);

        if (
            (isIncr || isDecr) &&
            e.operand.kind == "identifier" &&
            (this.isSignedIntType(e.type!) || this.isUnsignedIntType(e.type!))
        ) {
            const guardname = isIncr
                ? `delta_rt__overflow_${e.type!}`
                : `delta_rt__underflow_${e.type!}`;
            if (!this.guardNames.has(guardname)) {
                this.guardNames.set(guardname, "");
                if (isIncr) {
                    this.guards.overflows.push({ type: e.type! });
                } else {
                    this.guards.underflows.push({ type: e.type! });
                }
            }
            return `${guardname}(&${e.operand.name}, "${this.ast.fileName}:${e.operand.position.line}")`;
        }

        return `${e.operator}${this.emitExpression(e.operand)}`;
    }

    emitObjectLiteralExpression(e: ObjectLiteralExpression): string {
        const structName = `delta__${e.type.name.name}`;
        const members = e.elements
            .map((x) => {
                const f = x as FieldInit;
                return `.${f.field.name.name} = ${this.emitExpression(f.field.value)}`;
            })
            .join(", ");
        return `(${structName}){${members}}`;
    }

    emitMemberAccessExpression(e: MemberAccessExpression): string {
        if (e.enumMember) {
            return `delta__${this.emitExpression(e.receiver as Expression)}_${this.emitExpression(e.member as Expression)}`;
        }

        return `${this.emitExpression(e.receiver as Expression)}.${this.emitExpression(e.member as Expression)}`;
    }

    /** Emits a single expression as its C text. */
    emitExpression(e?: Expression): string {
        if (!e) {
            return "";
        }
        switch (e.kind) {
            case "integer_literal":
                if (e.value.includes("_")) {
                    e.value = e.value.replaceAll("_", "");
                }
                return e.value;
            case "float_literal":
                return e.value;
            case "char_literal":
                return e.value;
            case "boolean_literal":
                return e.value;
            case "identifier":
                return e.name;
            case "function_call_expression":
                return this.emitFunctionCallExpression(e as FunctionCallExpression);
            case "binary_expression":
                return this.emitBinaryExpression(e as BinaryExpression);
            case "unary_expression":
                return this.emitUnaryExpression(e as UnaryExpression);
            case "object_literal":
                return this.emitObjectLiteralExpression(e as ObjectLiteralExpression);
            case "member_access_expression":
                return this.emitMemberAccessExpression(e as MemberAccessExpression);
        }
    }

    /**
     * Emits a variable declaration as C. An initializer-less declaration emits
     * just `type name;`; a file-scope declaration is qualified `static const`.
     */
    emitVariableDeclarationStatement(e: VariableDeclarationStatement): string {
        const name = e.name.name;
        let type = this.cType(e.type);
        let value = this.emitExpression(e.value);

        if (e.value?.kind == "object_literal" && e.type.kind == "union") {
            const valueType = e.value.type.name.name;
            const unionType = e.type.name.name;
            value = `delta__${unionType} ${name} = (delta__${unionType}){
        .tag = delta__${unionType}_Tag_${valueType},
        .payload = {.${valueType} = ${value}}
    };
    (void)${name};`;
            return value;
        }

        if (!value) {
            return type + " " + name + ";";
        }

        if (e.file) {
            type = "static const " + type;
        }

        return type + " " + name + " = " + value + ";";
    }

    /** Emits an assignment statement as C: `root = target;`. */
    emitAssignmentStatement(e: AssignmentStatement) {
        const root = this.emitExpression(e.root);
        const target = this.emitExpression(e.target);

        return `${root} = ${target};`;
    }

    emitForStatement(e: ForStatement): string {
        const decl = e.declaration ? this.emitStatement(e.declaration) : "; ";
        const condition = e.condition ? this.emitExpression(e.condition) : "";
        const modifier = e.modifier ? this.emitExpression(e.modifier) : "";
        const body = this.emitBlockStatement(e.body);

        return `for(${decl} ${condition}; ${modifier})${body}\n`;
    }

    emitCaseBlock(s: SwitchCase, defaultCase: boolean): string {
        if (s.body.statements.length == 0) {
            return "";
        }

        //if defaultCase is true:
        //emit the default keyword
        //do not emit the labels
        //
        //If there are more than one labels
        //separate them using a comma,
        //else just emit the single label value
        const decl =
            this.emitIndent() +
            (defaultCase ? "default" : "case ") +
            (!defaultCase
                ? (s.labels.length > 1
                      ? s.labels.map((x) => x.value).join(",")
                      : s.labels[0]?.value) + ":"
                : ":");
        const body = this.emitBlockStatement(s.body as unknown as BlockStatement, true);
        return `${decl}\n${body}`;
    }

    emitSwitchStatement(s: SwitchStatement): string {
        const decl = `switch(${this.emitExpression(s.scrutinee)})`;
        this.indent++;
        const cases = `${s.cases.map((x) => this.emitCaseBlock(x, false)).join("\n")}`;
        const defaultCase = this.emitCaseBlock(s.default!, true);
        this.indent--;
        const final = `${decl}{\n${cases}${defaultCase}${this.emitIndent()}}`;
        return final;
    }

    /** Emits a single statement as a line of C, dispatching on its `kind`. */
    emitStatement(s: Statement): string {
        switch (s.kind) {
            case "assignment_statement":
                return this.emitAssignmentStatement(s);
            case "variable_declaration_statement":
                return this.emitVariableDeclarationStatement(s);
            case "return_statement":
                return `return ${this.emitExpression(s.expression)};`;
            case "switch_statement":
                return this.emitSwitchStatement(s as SwitchStatement);
            case "if_statement":
                return this.emitIfStatement(s as IfStatement);
            case "while_statement":
                return this.emitWhileStatement(s as WhileStatement);
            case "for_statement":
                return this.emitForStatement(s as ForStatement);
            case "expression_statement":
                return this.emitExpression(s.expression) + ";";
            case "break_statement":
                return "break;";
            case "continue_statement":
                return "continue;";
        }

        return "";
    }

    emitWhileStatement(s: WhileStatement): string {
        const condition = this.emitExpression(s.condition);
        let statement = `if (${condition}) ${this.emitBlockStatement(s.body)}`;
        return statement;
    }

    emitIfStatement(s: IfStatement): string {
        const condition = this.emitExpression(s.condition);
        const thenBlock = this.emitBlockStatement(s.thenBlock);

        let statement = `if (${condition}) ${thenBlock}`;
        if (s.elseBlock) {
            statement += `else${this.emitBlockStatement(s.elseBlock)}`;
        }

        return statement;
    }

    /** Emits a brace-delimited block of statements. */
    emitBlockStatement(b: BlockStatement, caseBlock: boolean = false): string {
        this.indent++;
        const statements = b.statements.map((x) => {
            return this.emitIndent() + this.emitStatement(x);
        });
        let block = caseBlock ? statements.join("\n") : "{\n" + statements.join("\n");
        this.indent--;
        block += "\n" + this.emitIndent() + (caseBlock ? "\n" : "}\n");
        return block;
    }

    /**
     * Emits a function's C signature, and its body unless `forwardDecl` is set
     * (in which case it emits just the prototype terminated by `;`). The Delta
     * `main` function is renamed to `delta_main` so the generated C `main` shim
     * can wrap it.
     */
    emitFunctionDeclaration(f: FunctionDeclaration, forwardDecl: boolean): string {
        const rT = this.cType(f.returnTypes[0]!);
        let fnName = f.name.name;
        if (fnName == "main") {
            fnName = "delta_main";
        }

        const params = f.parameters.map((x) => `${this.cType(x.type)} ${x.name.name}`).join(",");

        const signature = `${rT} ${fnName}(${params})`;

        if (forwardDecl) {
            return `${signature};`;
        }

        const body = this.emitBlockStatement(f.body);
        return signature + body;
    }

    /** Emits just the prototype for a function, for the forward-declaration block. */
    emitForwardDeclaration(f: FunctionDeclaration) {
        return this.emitFunctionDeclaration(f, true);
    }

    emitTypeDeclaration(d: TypeDeclaration): string {
        if (d.declKind == TypeDeclKind.Struct) {
            const sig = `delta__${d.name.name}`;
            this.indent++;
            const members = (d.declaration as StructDecl).fields
                .map((x) => {
                    return this.emitIndent() + `${this.cType(x.type)} ${x.name.name};`;
                })
                .join("\n");
            this.indent--;

            return `typedef struct ${sig}{\n${members}\n} ${sig};`;
        }

        if (d.declKind == TypeDeclKind.Enum) {
            const sig = `delta__${d.name.name}`;
            this.indent++;
            const members = (d.declaration as EnumDecl).variants
                .map((x) => {
                    return this.emitIndent() + `${sig}_${x.name.name} = ${x.value.value};`;
                })
                .join("\n");
            this.indent--;

            return `typedef enum ${sig}{\n${members}\n} ${sig};`;
        }

        if (d.declKind == TypeDeclKind.Union) {
            this.indent++;
            const memberNames = (d.declaration as UnionDecl).variants.map((x) => x.name.name);

            const tagSig = `delta__${d.name.name}_Tag`;
            const tagMembers = memberNames
                .map((x) => {
                    return this.emitIndent() + `${tagSig}_${x}`;
                })
                .join(",\n");

            const unionMembers = memberNames
                .map((x) => {
                    return (
                        this.emitIndent() +
                        this.emitIndent() +
                        this.emitIndent() +
                        `delta__${x} ${x}`
                    );
                })
                .join(";\n");

            this.indent--;
            const tagEnum = `typedef enum ${tagSig}{\n${tagMembers}\n} ${tagSig};`;
            const taggedUnion = `typedef struct delta__${d.name.name} {\n\tdelta__${d.name.name}_Tag tag;\n\tunion {\n${unionMembers}\n\t} payload;\n} delta__${d.name.name};`;

            return `${tagEnum}\n${taggedUnion}`;
        }

        return "";
    }

    /** Emits a top-level declaration, dispatching on its `kind`. */
    emitDeclaration(d: Declaration): string {
        switch (d.kind) {
            case "variable_declaration_statement":
                return this.emitVariableDeclarationStatement(d as VariableDeclarationStatement);
            case "function_declaration":
                return this.emitFunctionDeclaration(d as FunctionDeclaration, false);
            case "type_declaration":
                return this.emitTypeDeclaration(d as TypeDeclaration);
        }
    }

    /**
     * Emits the C `main` entry point: a thin shim that invokes the program's
     * `delta_main` and returns its result as the process exit code.
     */
    emitMain(): string {
        return `int main(){
    return (int)delta_main();
}
`;
    }

    getTypeMinValue(t: string): string {
        switch (t) {
            case "int8":
                return "INT8_MIN";
            case "int16":
                return "INT16_MIN";
            case "int32":
                return "INT32_MIN";
            case "int64":
                return "INT64_MIN";
            case "intsize":
                return "INTPTR_MIN";
            case "uint8":
            case "uint16":
            case "uint32":
            case "uint64":
            case "uintsize":
                return "0";
        }
        return "";
    }

    getTypeMaxValue(t: string): string {
        switch (t) {
            case "int8":
                return "INT8_MAX";
            case "int16":
                return "INT16_MAX";
            case "int32":
                return "INT32_MAX";
            case "int64":
                return "INT64_MAX";
            case "intsize":
                return "INTPTR_MAX";
            case "uint8":
                return "UINT8_MAX";
            case "uint16":
                return "UINT16_MAX";
            case "uint32":
                return "UINT32_MAX";
            case "uint64":
                return "UINT64_MAX";
            case "uintsize":
                return "UINTPTR_MAX";
        }
        return "";
    }

    /**
     * Returns the storage size, in bytes, of a primitive Delta type — the same
     * value its lowered C type would report from `sizeof`. `intsize`/`uintsize`
     * assume a 64-bit target, matching their `intptr_t`/`uintptr_t` lowering.
     * Returns `0` for anything that isn't a recognized primitive.
     */
    sizeOfDeltaType(t: string): number {
        switch (t) {
            case "int8":
            case "uint8":
            case "bool":
            case "char":
                return 1;
            case "int16":
            case "uint16":
                return 2;
            case "int32":
            case "uint32":
            case "float32":
                return 4;
            case "int64":
            case "uint64":
            case "float64":
            case "intsize":
            case "uintsize":
                return 8;
        }
        return 0;
    }

    isSignedIntType(t: string): boolean {
        return ["int8", "int16", "int32", "int64", "intsize"].includes(t);
    }

    isUnsignedIntType(t: string): boolean {
        return ["uint8", "uint16", "uint32", "uint64", "uintsize"].includes(t);
    }

    isFloatType(t: string): boolean {
        return t == "float32" || t == "float64";
    }

    /**
     * Builds the out-of-range condition for a `fromT -> toT` conversion. The
     * shape of the check depends on the conversion's category — a plain
     * min/max bound isn't correct (or isn't even expressible) for all of them:
     *
     * - `char` targets are a Unicode scalar-value validity check (the
     *   surrogate range is excluded), not a min/max bound.
     * - float sources must also reject NaN: `NaN < x` and `NaN > x` are both
     *   false in IEEE-754, so an ordered range check alone silently lets NaN
     *   through.
     * - signed -> unsigned only needs a sign check: any negative signed value
     *   is invalid, and the unsigned target's positive range always dwarfs
     *   what a same-or-narrower signed source can hold, so a max-side check
     *   never actually fires.
     * - everything else (same-signedness narrowing) is a plain inclusive
     *   range check against the target's bounds.
     */
    converterRangeCheck(fromT: string, toT: string): string {
        if (toT == "char") {
            return "value > 0x10FFFF || (value >= 0xD800 && value <= 0xDFFF)";
        }

        const minValue = this.getTypeMinValue(toT);
        const maxValue = this.getTypeMaxValue(toT);

        if (this.isFloatType(fromT) && !this.isFloatType(toT)) {
            return `isnan(value) || value < ${minValue} || value > ${maxValue}`;
        }

        if (this.isSignedIntType(fromT) && this.isUnsignedIntType(toT)) {
            return "value < 0";
        }

        return `value < ${minValue} || value > ${maxValue}`;
    }

    conversionGuardTemplate(fromT: string, toT: string): string {
        const cFromType = this.convertDeltaToCType(fromT);
        const cToType = this.convertDeltaToCType(toT);
        const converterName = `delta_rt__convert_${fromT}_to_${toT}`;
        const check = this.converterRangeCheck(fromT, toT);

        return `static ${cToType} ${converterName}(${cFromType} value, const char *loc) {
    if (${check}) {
        delta_panic("conversion failed: out of range", loc);
    }
    return (${cToType})value;
}\n\n`;
    }

    divisionGuardTemplate(t: string): string {
        const cType = this.convertDeltaToCType(t);
        return `static int32_t delta_rt__check_divisor_${t}(${cType} b, const char *loc) {
    if (b == 0) {
        delta_panic("division by zero", loc);
    }
    return b;
}\n\n`;
    }

    shiftGuardTemplate(t: string): string {
        const cType = this.convertDeltaToCType(t);
        return `static int32_t delta_rt__check_shift_${t}(${cType} amount, const char *loc) {
    if (amount >= ${this.sizeOfDeltaType(t) * 8}) {
        delta_panic("shift count out of range", loc);
    }
    return amount;
}\n\n`;
    }

    overflowGuardTemplate(t: string): string {
        const cType = this.convertDeltaToCType(t);
        return `static void delta_rt__overflow_${t}(${cType} *v, const char *loc) {
    if (*v == ${this.getTypeMaxValue(t)}) {
        delta_panic("arithmetic overflow", loc);
    }
    (*v)++;
}\n\n`;
    }

    underflowGuardTemplate(t: string): string {
        const cType = this.convertDeltaToCType(t);
        return `static void delta_rt__underflow_${t}(${cType} *v, const char *loc) {
    if (*v == ${this.getTypeMinValue(t)}) {
        delta_panic("arithmetic overflow", loc);
    }
    (*v)--;
}\n\n`;
    }

    emitPanicFunction(): string {
        return `static void delta_panic(const char *msg, const char *loc) {
    fprintf(stderr, "panic: %s\\n  at %s\\n", msg, loc);
    exit(1);
}\n\n`;
    }

    /**
     * Emits the complete C translation unit: headers, all forward declarations,
     * the function definitions, and the `main` shim, joined in dependency-safe
     * order. Returns the assembled source.
     */
    emit(): string {
        this.final += this.emitHeaders();
        this.final += this.emitPanicFunction();
        this.final += "<conversion-guards>";
        this.final += "<division-guards>";
        this.final += "<shift-guards>";
        this.final += "<overflow-guards>";
        this.final += "<underflow-guards>";

        const fwdDecls = this.ast.declarations.map((x) => {
            if (x.kind == "function_declaration") {
                return this.emitForwardDeclaration(x as FunctionDeclaration);
            }
            return "";
        });

        const decls = this.ast.declarations.map((x) => {
            return this.emitDeclaration(x);
        });

        const conversionGuards = this.guards.conversions.map((x) =>
            this.conversionGuardTemplate(x.fromType, x.toType),
        );

        const divisionGuards = this.guards.divisions.map((x) => this.divisionGuardTemplate(x.type));
        const shiftGuards = this.guards.shifts.map((x) => this.shiftGuardTemplate(x.type));
        const overflowGuards = this.guards.overflows.map((x) => this.overflowGuardTemplate(x.type));
        const underflowGuards = this.guards.underflows.map((x) =>
            this.underflowGuardTemplate(x.type),
        );

        this.final = this.final.replace("<conversion-guards>", conversionGuards.join("\n"));
        this.final = this.final.replace("<division-guards>", divisionGuards.join("\n"));
        this.final = this.final.replace("<shift-guards>", shiftGuards.join("\n"));
        this.final = this.final.replace("<overflow-guards>", overflowGuards.join("\n"));
        this.final = this.final.replace("<underflow-guards>", underflowGuards.join("\n"));

        this.final =
            this.final + fwdDecls.join("\n") + "\n\n" + decls.join("\n") + "\n\n" + this.emitMain();

        return this.final.replace(/^\s*[\r\n]/gm, "").replace(/\}\r?\n/g, "}\n\n");
    }
}
