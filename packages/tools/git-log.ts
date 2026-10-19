import type { Git } from "@odin/runtime";
import type { Tool, ToolResult } from "./tool";

export interface GitLogInput {
  maxCount?: number;
  path?: string;
}

export class GitLogTool implements Tool<GitLogInput> {
  readonly name = "git_log";
  readonly executionMode = "parallel" as const;

  readonly description =
    "Examine git commit log entries (hash, author, date, subject) with optional maxCount (default 10, max 50) and path filter.";

  readonly schema = {
    type: "object" as const,
    properties: {
      maxCount: {
        type: "number",
        description:
          "Maximum number of commits to return (default: 10, max: 50).",
      },
      path: {
        type: "string",
        description:
          "Optional file path to filter commit logs for a specific file or directory.",
      },
    },
  };

  constructor(private readonly git: Git) {}

  async execute(input?: GitLogInput): Promise<ToolResult> {
    let maxCount = 10;

    if (input) {
      if (input.maxCount !== undefined) {
        if (
          typeof input.maxCount !== "number" ||
          isNaN(input.maxCount) ||
          input.maxCount < 1
        ) {
          throw new Error("maxCount must be a positive number");
        }
        if (input.maxCount > 50) {
          throw new Error("maxCount cannot exceed 50");
        }
        maxCount = Math.floor(input.maxCount);
      }

      if (
        input.path !== undefined &&
        (typeof input.path !== "string" || input.path.trim().length === 0)
      ) {
        throw new Error("path must be a non-empty string");
      }
    }

    const logs = await this.git.log({
      maxCount,
      path: input?.path,
    });

    return {
      content: JSON.stringify(logs, null, 2),
    };
  }
}
