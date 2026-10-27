import { spawn } from "node:child_process";

import { TerminalStream } from "./terminal-stream";
import type { Terminal } from "./terminal";

export const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)\s+[\/\\]/i, // rm -rf / or rm -rf \
    /\bformat\s+[a-zA-Z]:/i,                                         // format C:
    /\bmkfs(\.[a-zA-Z0-9]+)?\s+/i,                                  // mkfs filesystem wipe
    /\b(:(){ :\|:& };:)\b/,                                         // fork bomb
    /\bdd\s+if=.*of=\/dev\/(sd[a-z]|nvme[0-9]|hd[a-z])/i,          // raw disk overwrite
];

export class NodeTerminal implements Terminal {
    constructor(
        private readonly cwd: string,
        private readonly defaultTimeoutMs: number = 30000,
    ) { }

    run(command: string, timeout?: number): TerminalStream {
        const stream = new TerminalStream();
        const effectiveTimeout = typeof timeout === "number" ? timeout : this.defaultTimeoutMs;

        // 1. Guard against overtly dangerous system commands
        const isDangerous = DANGEROUS_COMMAND_PATTERNS.some(pattern => pattern.test(command.trim()));
        if (isDangerous) {
            setTimeout(() => {
                stream.push({
                    type: "stderr",
                    data: `Security Error: Command blocked by safety policy (dangerous system pattern detected).\n`,
                });
                stream.push({
                    type: "exit",
                    code: 126,
                });
                stream.close();
            }, 0);
            return stream;
        }

        const child = spawn(command, {
            cwd: this.cwd,
            shell: true,
        });

        let timedOut = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        if (effectiveTimeout > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                stream.push({
                    type: "stderr",
                    data: `\nExecution Error: Command timed out after ${effectiveTimeout}ms. Terminating process...\n`,
                });
                try {
                    child.kill("SIGTERM");
                    setTimeout(() => {
                        try {
                            child.kill("SIGKILL");
                        } catch {}
                    }, 1500);
                } catch {}
            }, effectiveTimeout);
        }

        child.stdout?.on("data", chunk => {
            stream.push({
                type: "stdout",
                data: chunk.toString(),
            });
        });

        child.stderr?.on("data", chunk => {
            stream.push({
                type: "stderr",
                data: chunk.toString(),
            });
        });

        child.on("close", code => {
            if (timer) clearTimeout(timer);

            stream.push({
                type: "exit",
                code: timedOut ? 124 : (code ?? 0),
            });

            stream.close();
        });

        child.on("error", err => {
            if (timer) clearTimeout(timer);

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
