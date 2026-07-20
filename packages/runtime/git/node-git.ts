import type { Git, GitStatus } from "./git";
import type { Terminal } from "../terminal/terminal";

export class NodeGit implements Git {
  constructor(
    private readonly terminal: Terminal,
  ) {}

  async status(): Promise<GitStatus> {
    const stream = this.terminal.run(
      "git status --porcelain=v1 -b",
    );

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    for await (const event of stream) {
      switch (event.type) {
        case "stdout":
          stdout += event.data;
          break;
        case "stderr":
          stderr += event.data;
          break;
        case "exit":
          exitCode = event.code;
          break;
      }
    }

    if (exitCode !== 0) {
      throw new Error(stderr);
    }

    const lines = stdout
      .split("\n")
      .filter(Boolean);

    const branch =
      lines.shift()?.replace("## ", "") ??
      "unknown";

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      if (line.startsWith("??")) {
        untracked.push(line.slice(3));
        continue;
      }

      const x = line[0];
      const y = line[1];
      const file = line.slice(3);

      if (x !== " ") {
        staged.push(file);
      }

      if (y !== " ") {
        modified.push(file);
      }
    }

    return {
      branch,
      staged,
      modified,
      untracked,
    };
  }

  async diff(): Promise<string> {
    const stream = this.terminal.run("git diff");

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    for await (const event of stream) {
      switch (event.type) {
        case "stdout":
          stdout += event.data;
          break;
        case "stderr":
          stderr += event.data;
          break;
        case "exit":
          exitCode = event.code;
          break;
      }
    }

    if (exitCode !== 0) {
      throw new Error(stderr);
    }

    return stdout;
  }

  async commit(message: string) {
    const stream = this.terminal.run(`git commit -m "${message}"`);

    let stderr = "";
    let exitCode = 0;

    for await (const event of stream) {
      switch (event.type) {
        case "stderr":
          stderr += event.data;
          break;
        case "exit":
          exitCode = event.code;
          break;
      }
    }

    if (exitCode !== 0) {
      throw new Error(stderr);
    }
  }
}
