import type { TerminalEvent } from "@odin/runtime/terminal/events";
import type { Tool } from "./tool";
import type { Terminal } from "@odin/runtime";

export interface BashInput {
    command: string;
    timeout?: number;
}

export interface BashCallbacks {
    onEvent?(
        event: TerminalEvent,
    ): void;
}

export class BashTool implements Tool<BashInput> {
    readonly name = "bash";
  readonly executionMode = "serial" as const;

    readonly description =
        "Execute a shell command in the current workspace.";

    readonly schema = {
        type: "object" as const,

        properties: {
            command: {
                type: "string",
                description: "Shell command to execute",
            },
            timeout: {
                type: "number",
                description: "Timeout in milliseconds (optional)",
            }
        },

        required: ["command"],
    };

    constructor(
        private readonly terminal: Terminal,
    ) { }

    async execute(input: BashInput, callbacks?: BashCallbacks) {
        const stream =
            this.terminal.run(input.command);

        let stdout = "";
        let stderr = "";
        let exitCode = 0;

        for await (const event of stream) {
            callbacks?.onEvent?.(event);

            switch (event.type) {
                case "stdout":
                    stdout += event.data;
                    break;

                case "stderr":
                    stderr += event.data;
                    break;

                case "exit":
                    exitCode = event.code;
                    break;
            }
        }

        return {
            content: JSON.stringify({
                stdout,
                stderr,
                exitCode,
            }),
        };
    }
}