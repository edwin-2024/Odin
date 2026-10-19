import type {
  Git,
  GitCommitLog,
  GitCommitOptions,
  GitDiffOptions,
  GitLogOptions,
  GitStatus,
} from "./git";
import type { Terminal } from "../terminal/terminal";

export class NodeGit implements Git {
  constructor(private readonly terminal: Terminal) {}

  private async runCommand(
    command: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const stream = this.terminal.run(command);

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
      const errorMsg =
        stderr.trim() ||
        stdout.trim() ||
        `Command failed with exit code ${exitCode}`;
      throw new Error(errorMsg);
    }

    return { stdout, stderr, exitCode };
  }

  async status(): Promise<GitStatus> {
    const { stdout } = await this.runCommand("git status --porcelain=v1 -b");

    const lines = stdout.split("\n").filter(Boolean);

    const branch = lines.shift()?.replace("## ", "") ?? "unknown";

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

  async diff(options?: GitDiffOptions): Promise<string> {
    const args: string[] = ["git", "diff"];

    if (options?.staged) {
      args.push("--staged");
    }

    if (options?.target) {
      const target = options.target.includes(" ")
        ? `"${options.target.replace(/"/g, '\\"')}"`
        : options.target;
      args.push(target);
    }

    if (options?.path) {
      args.push("--", `"${options.path.replace(/"/g, '\\"')}"`);
    }

    const { stdout } = await this.runCommand(args.join(" "));
    return stdout;
  }

  async log(options?: GitLogOptions): Promise<GitCommitLog[]> {
    const maxCount = options?.maxCount ?? 10;
    const args: string[] = [
      "git",
      "log",
      `-n ${maxCount}`,
      `--format="%H%x1f%an%x1f%ad%x1f%s"`,
    ];

    if (options?.path) {
      args.push("--", `"${options.path.replace(/"/g, '\\"')}"`);
    }

    const { stdout } = await this.runCommand(args.join(" "));
    if (!stdout.trim()) {
      return [];
    }

    const lines = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.map((line) => {
      const [hash = "", author = "", date = "", subject = ""] =
        line.split("\x1f");
      return {
        hash,
        author,
        date,
        subject,
      };
    });
  }

  async commit(
    messageOrOptions: string | GitCommitOptions,
    maybeOptions?: Omit<GitCommitOptions, "message">,
  ): Promise<void> {
    const options: GitCommitOptions =
      typeof messageOrOptions === "string"
        ? { message: messageOrOptions, ...maybeOptions }
        : messageOrOptions;

    if (
      !options.message ||
      typeof options.message !== "string" ||
      options.message.trim().length === 0
    ) {
      throw new Error("Commit message must be a non-empty string");
    }

    if (options.files && options.files.length > 0) {
      const fileArgs = options.files
        .map((f) => `"${f.replace(/"/g, '\\"')}"`)
        .join(" ");
      await this.runCommand(`git add -- ${fileArgs}`);
    }

    if (options.all) {
      await this.runCommand("git add -A");
    }

    const paragraphs = options.message
      .split(/\r?\n\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const messageFlags =
      paragraphs.length > 0
        ? paragraphs.map((p) => `-m "${p.replace(/"/g, '\\"')}"`).join(" ")
        : `-m "${options.message.replace(/"/g, '\\"')}"`;

    await this.runCommand(`git commit ${messageFlags}`);
  }
}
