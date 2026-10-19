import type { Git } from "@odin/runtime";
import type { Tool, ToolResult } from "./tool";

export interface GitCommitInput {
  message: string;
  all?: boolean;
  files?: string[];
}

export class GitCommitTool implements Tool<GitCommitInput> {
  readonly name = "git_commit";
  readonly executionMode = "serial" as const;

  readonly description =
    "Create a git commit with a commit message, optional staging of all modified/untracked files, or a specific list of files.";

  readonly schema = {
    type: "object" as const,
    properties: {
      message: {
        type: "string",
        description: "Commit message describing the changes.",
      },
      all: {
        type: "boolean",
        description:
          "Automatically stage all modified and deleted files before committing.",
      },
      files: {
        type: "array",
        items: {
          type: "string",
        },
        description: "Specific list of file paths to stage before committing.",
      },
    },
    required: ["message"],
  };

  constructor(private readonly git: Git) {}

  async execute(input: GitCommitInput): Promise<ToolResult> {
    if (
      !input ||
      typeof input.message !== "string" ||
      input.message.trim().length === 0
    ) {
      throw new Error("Commit message must be a non-empty string");
    }

    if (input.all !== undefined && typeof input.all !== "boolean") {
      throw new Error("all must be a boolean");
    }

    if (input.files !== undefined) {
      if (!Array.isArray(input.files)) {
        throw new Error("files must be an array of strings");
      }
      for (const file of input.files) {
        if (typeof file !== "string" || file.trim().length === 0) {
          throw new Error("Each file path must be a non-empty string");
        }
      }
    }

    await this.git.commit({
      message: input.message,
      all: input.all,
      files: input.files,
    });

    return {
      content: `Successfully committed changes with message: "${input.message}"`,
    };
  }
}
