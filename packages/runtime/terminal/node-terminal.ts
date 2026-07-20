import { spawn } from "node:child_process";

import { TerminalStream } from "./terminal-stream";
import type { Terminal } from "./terminal";

export class NodeTerminal
    implements Terminal {
    constructor(
        private readonly cwd: string,
    ) { }

    run(command: string): TerminalStream {
        const stream = new TerminalStream();

        const child = spawn(command, {
            cwd: this.cwd,
            shell: true,
        });

        child.stdout.on("data", chunk => {
            stream.push({
                type: "stdout",
                data: chunk.toString(),
            });
        });

        child.stderr.on("data", chunk => {
            stream.push({
                type: "stderr",
                data: chunk.toString(),
            });
        });

        child.on("close", code => {
            stream.push({
                type: "exit",
                code: code ?? 0,
            });

            stream.close();
        });

        child.on("error", err => {
            stream.push({
                type: "stderr",
                data: err.message,
            });

            stream.push({
                type: "exit",
                code: 1,
            });

            stream.close();
        });

        return stream;
    }
}