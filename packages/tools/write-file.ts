import type { Tool } from "./tool";
import type { Workspace } from "@odin/runtime";

export interface WriteFileInput {
    path: string;
    content: string;
}

export class WriteFileTool
    implements Tool<WriteFileInput> {
    readonly name = "write_file";

    readonly description =
        "Write UTF-8 text to a file.";

    readonly schema = {
        type: "object" as const,

        properties: {
            path: {
                type: "string",
            },

            content: {
                type: "string",
            },
        },

        required: [
            "path",
            "content",
        ],
    };

    constructor(
        private readonly workspace: Workspace,
    ) { }

    async execute(
        input: WriteFileInput,
    ) {
        await this.workspace.write(
            input.path,
            input.content,
        );

        return {
            content: `Successfully wrote ${input.path}`,
        };
    }
}