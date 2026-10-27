import type { Tool } from "./tool";
import type { Workspace } from "@odin/runtime";

export interface EditFileInput {
    path: string;
    search: string;
    replace: string;
    occurrence?: number;
}

export class EditFileTool implements Tool<EditFileInput> {
    readonly name = "edit_file";
    readonly executionMode = "serial" as const;

    readonly description =
        "Edit an existing file by searching for an exact string match and replacing it. Supports optional occurrence for disambiguation if the text appears multiple times.";

    readonly schema = {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "Path to the file to edit",
            },
            search: {
                type: "string",
                description: "The exact string to search for and replace. Must match uniquely unless occurrence is specified.",
            },
            replace: {
                type: "string",
                description: "The new string to replace the search string with.",
            },
            occurrence: {
                type: "number",
                description: "Optional 1-based occurrence number to replace when the search string appears multiple times in the file.",
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
            { occurrence: input.occurrence }
        );

        return {
            content: `Successfully edited ${input.path}`,
        };
    }
}
