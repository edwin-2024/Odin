import type { Git } from "@odin/runtime";
import type { Tool, ToolResult } from "./tool";

export interface GitDiffInput {
  staged?: boolean;
  path?: string;
  target?: string;
}

export class GitDiffTool implements Tool<GitDiffInput> {
  readonly name = "git_diff";
  readonly executionMode = "parallel" as const;

  readonly description =
    "Inspect git diffs for working tree, staged changes, or against specific branches/commits. Output is capped at 50KB / 1000 lines to prevent context blowout.";

  readonly schema = {
    type: "object" as const,
    properties: {
      staged: {
        type: "boolean",
        description:
          "Whether to view staged changes compared against HEAD instead of the working tree.",
      },
      path: {
        type: "string",
        description:
          "Optional file path to limit the diff to a specific file or directory.",
      },
      target: {
        type: "string",
        description:
          "Optional commit hash, branch name, or git ref to diff against.",
      },
    },
  };

  constructor(private readonly git: Git) {}

  async execute(input?: GitDiffInput): Promise<ToolResult> {
    if (input) {
      if (input.staged !== undefined && typeof input.staged !== "boolean") {
        throw new Error("staged must be a boolean");
      }
      if (
        input.path !== undefined &&
        (typeof input.path !== "string" || input.path.trim().length === 0)
      ) {
        throw new Error("path must be a non-empty string");
      }
      if (
        input.target !== undefined &&
        (typeof input.target !== "string" || input.target.trim().length === 0)
      ) {
        throw new Error("target must be a non-empty string");
      }
    }

    const MAX_LINES = 1000;
    const MAX_BYTES = 50 * 1024; // 50KB

    let diff = await this.git.diff(input);

    let truncated = false;
    const lines = diff.split("\n");
    if (lines.length > MAX_LINES) {
      diff = lines.slice(0, MAX_LINES).join("\n");
      truncated = true;
    }

    if (Buffer.byteLength(diff, "utf-8") > MAX_BYTES) {
      const buf = Buffer.from(diff, "utf-8").subarray(0, MAX_BYTES);
      diff = buf.toString("utf-8");
      truncated = true;
    }

    if (truncated) {
      diff += "\n\n[Diff truncated: exceeded 50KB or 1000 lines limit]";
    }

    return {
      content: diff,
    };
  }
}
