import { promises as fs } from "node:fs";

import type { Tool } from "./tool";
import type { Workspace } from "@odin/runtime";
export interface ReadFileInput {
  path: string;
  startLine?: number;
  endLine?: number;
}

export class ReadFileTool
  implements Tool<ReadFileInput> {
  readonly name = "read_file";
  constructor(
    private readonly workspace: Workspace,
  ) { }

  readonly description =
    "Read a UTF-8 text file. You can optionally specify startLine and endLine to read a specific range. All responses include line numbers.";

  readonly schema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "Path to the file",
      },
      startLine: {
        type: "number",
        description: "The 1-indexed line number to start reading from.",
      },
      endLine: {
        type: "number",
        description: "The 1-indexed line number to stop reading at.",
      },
    },
    required: ["path"],
  };

  async execute(input: ReadFileInput) {
    const content = await this.workspace.read(
      input.path,
      { startLine: input.startLine, endLine: input.endLine }
    );

    return {
      content,
    };
  }
}