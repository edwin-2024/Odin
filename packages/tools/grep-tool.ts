import type {
    Workspace,
} from "@odin/runtime";

import type {
    Tool,
    ToolResult,
} from "./tool";

export interface GrepInput {
    pattern: string;
    path?: string;
    caseSensitive?: boolean;
}

export class GrepTool
    implements Tool<GrepInput> {
    readonly name = "grep";

    readonly description =
        "Search for text in files.";

    readonly schema = {
        type: "object" as const,

        properties: {
            pattern: {
                type: "string",
                description:
                    "Text or regex to search for",
            },

            path: {
                type: "string",
                description:
                    "Directory or file to search",
            },

            caseSensitive: {
                type: "boolean",
            },
        },

        required: ["pattern"],
    };

    constructor(
        private readonly workspace: Workspace
    ) { }

    async execute(
        input: GrepInput
    ): Promise<ToolResult> {
        const matches =
            await this.workspace.grep(
                input.pattern,
                {
                    path: input.path,
                    caseSensitive:
                        input.caseSensitive,
                }
            );

        return {
            content: JSON.stringify(
                matches,
                null,
                2
            ),
        };
    }
}