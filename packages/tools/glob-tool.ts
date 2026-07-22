import type { Workspace } from "@odin/runtime";
import type { GlobInput, Tool, ToolResult } from "./tool";



export class GlobTool implements Tool<GlobInput> {
    readonly name = "glob";
  readonly executionMode = "parallel" as const;

    readonly description =
        "Find files matching a glob pattern.";

    readonly schema = {
        type: "object" as const,

        properties: {
            pattern: {
                type: "string",
                description:
                    "Glob pattern like **/*.ts or **/package.json",
            },
        },

        required: ["pattern"],
    };

    constructor(
        private readonly workspace: Workspace,
    ) { }

    async execute(input: GlobInput): Promise<ToolResult> {
        const DEFAULT_IGNORE = [
            "**/node_modules/**",
            "**/.git/**",
            "**/.turbo/**",
            "**/dist/**",
            "**/build/**",
        ];

        const files = await this.workspace.glob(input.pattern, {
            ignore: DEFAULT_IGNORE,
        });

        const MAX_RESULTS = 100;

        if (files.length > MAX_RESULTS) {
            return {
                content: JSON.stringify({
                    truncated: true,
                    totalMatches: files.length,
                    results: files.slice(0, MAX_RESULTS),
                }, null, 2),
            };
        }

        return {
            content: JSON.stringify(files, null, 2),
        };
    }
}