import type { Tool } from "./tool";
import type { Git } from "@odin/runtime";

export interface GitStatusInput {}

export class GitStatusTool implements Tool<GitStatusInput> {
    readonly name = "git_status";

    readonly description =
        "Get the current status of the git repository.";

    readonly schema = {
        type: "object" as const,
        properties: {},
        required: [],
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
