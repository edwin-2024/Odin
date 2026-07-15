import { promises as fs } from "node:fs";

import type { Tool } from "./tool";

export interface ReadFileInput {
  path: string;
}

export class ReadFileTool
  implements Tool<ReadFileInput> {
  readonly name = "read_file";

  readonly description =
    "Read a UTF-8 text file.";

  readonly schema = {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "Path to the file",
      },
    },
    required: ["path"],
  };

  async execute(input: ReadFileInput) {
    const content = await fs.readFile(
      input.path,
      "utf8",
    );

    return {
      content,
    };
  }
}