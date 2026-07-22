import type { Workspace } from "@odin/runtime";
import type { ListDirectoryInput, Tool, ToolResult } from "./tool";

export class ListDirectoryTool
    implements Tool<ListDirectoryInput> {
    readonly name = "list_directory";
  readonly executionMode = "parallel" as const;

    readonly description =
        "Lists the files and folders inside a directory.";

    readonly schema = {
        type: "object" as const,

        properties: {
            path: {
                type: "string",
                description: "Directory path",
            },
        },

        required: ["path"],
    };

    constructor(
        private readonly workspace: Workspace
    ) { }

    async execute(
        input: ListDirectoryInput
    ): Promise<ToolResult> {
        const entries = await this.workspace.list(input.path || ".");

        return {
            content: JSON.stringify(entries, null, 2),
        };
    }
}