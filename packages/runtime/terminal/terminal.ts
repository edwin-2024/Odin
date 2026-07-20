import type { TerminalStream } from "./terminal-stream";
export interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export interface Terminal {
    run(command: string, timeout?: number): TerminalStream;
}
