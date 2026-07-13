#!/usr/local/bin/node
import * as fs from "fs";
import { Tokenizer } from "./src/ast/tokenizer.js";
import { Parser } from "./src/ast/parser.js";
import { Diagnostics } from "./src/diagnostics/diagnostics.js";
import { Formatter } from "./src/ast/formatter.js";
// import { Analyzer } from "./src/analysis/analyzer.js";
import { AnalyzerCore } from "./src/analysis/core.js";
import { Emitter } from "./src/codegen/emitter.js";

function build(content: string, filepath: string) {
    const tokenizer = new Tokenizer(content);
    const tokens = tokenizer.tokenize();
    const diagnostics = new Diagnostics();
    const parser = new Parser(filepath, diagnostics);

    const ast = parser.parse(tokens);
    if (!ast) {
        if (diagnostics.errors.length > 0) {
            diagnostics.errors.forEach((e) => {
                console.log(diagnostics.format(e));
            });
        }

        return;
    }
    // const analyzer = new Analyzer(ast, diagnostics);
    const analyzer = new AnalyzerCore(ast, diagnostics);
    const globalScope = analyzer.analyze();

    if (diagnostics.errors.length > 0) {
        diagnostics.errors.forEach((e) => {
            console.log(diagnostics.format(e));
        });

        return;
    }

    const formatter = new Formatter(ast);
    formatter.dump();

    const emitter = new Emitter(ast);
    console.log(emitter.emit());
}

function scaffold(name: string, path: string) {
    // TODO: create empty project scaffold
}

function main() {
    const cmdArg = process.argv[2];

    if (!cmdArg) {
        console.log("usage:\ndelta build filename.delta\ndelta init projectname");
        process.exit(1);
    }

    switch (cmdArg) {
        case "build":
            const fileNameArg = process.argv[3];
            if (!fileNameArg) {
                console.log("usage: delta build filename.delta");
                process.exit(1);
            }

            // TODO: handle file not found
            const file = fs.readFileSync(fileNameArg, "utf8");
            build(file, fileNameArg);

        case "init":
            const projectName = process.argv[3];
            if (!projectName) {
                console.log("usage: delta init projectname");
                process.exit(1);
            }

            scaffold(projectName, process.cwd());
    }
}

main();
