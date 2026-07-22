import type { Tool } from "./tool";
import type { Workspace } from "@odin/runtime";

export interface EditFileInput {
    path: string;
    search: string;
    replace: string;
}

export class EditFileTool implements Tool<EditFileInput> {
    readonly name = "edit_file";
  readonly executionMode = "serial" as const;

    readonly description =
        "Edit an existing file by searching for an exact string match and replacing it.";

    readonly schema = {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Path to the file to edit",
            },
            search: {
                type: "string",
                description: "The exact string to search for and replace. Must match exactly once in the file.",
            },
            replace: {
                type: "string",
                description: "The new string to replace the search string with.",
            },
        },
        required: ["path", "search", "replace"],
    };

    constructor(
        private readonly workspace: Workspace,
    ) { }

    async execute(input: EditFileInput) {
        await this.workspace.edit(
            input.path,
            input.search,
            input.replace,
        );

        return {
            content: `Successfully edited ${input.path}`,
        };
    }
}
