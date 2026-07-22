import type { Tool } from "./tool";
import type { Git } from "@odin/runtime";

export interface GitStatusInput {}

export class GitStatusTool implements Tool<GitStatusInput> {
    readonly name = "git_status";
  readonly executionMode = "parallel" as const;

    readonly description =
        "Get the current status of the git repository.";

    readonly schema = {
        type: "object" as const,
        properties: {
            dummy: {
                type: "string",
                description: "Ignore this field. It exists only to satisfy strict JSON schema parsers.",
            },
        },
    };

    constructor(
        private readonly git: Git,
    ) { }

  async execute() {
    const status =
      await this.git.status();

    return {
      content: JSON.stringify(
        status,
        null,
        2,
      ),
    };
  }
}
