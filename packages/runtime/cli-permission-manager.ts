import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import fs from "node:fs/promises";
import path from "node:path";

import { Mutex } from "@odin/shared";

import type {
  PermissionDecision,
  PermissionManager,
  PermissionRequest,
  PermissionRule,
} from "./permission-manager";
import type { Workspace } from "./workspace";
import {
  ansi,
  formatUnifiedDiff,
  generateEditDiff,
  generateWriteDiff,
  renderPermissionCard,
  type UnifiedDiff,
} from "./diff-formatter";

export interface CliPermissionManagerOptions {
  workspace?: Workspace;
  workspaceRoot?: string;
  diffFormatter?: (
    permission: PermissionRequest,
    options?: { detailed?: boolean },
  ) => Promise<string | null> | string | null;
}

export class CliPermissionManager implements PermissionManager {
  private readonly allowed = new Set<string>();
  private readonly allowedFiles = new Set<string>();
  private readonly pending = new Map<string, Promise<PermissionDecision>>();
  private readonly mutex = new Mutex();

  public onBeforePrompt?: () => void;
  public onAfterPrompt?: () => void;

  constructor(
    private readonly rl: ReturnType<typeof createInterface>,
    private readonly policies: PermissionRule[] = [],
    private readonly options: CliPermissionManagerOptions = {},
  ) {}

  public isPathAllowed(filePath: string): boolean {
    const normalized = this.normalizePath(filePath);
    return this.allowedFiles.has(normalized);
  }

  public getAllowedFiles(): string[] {
    return Array.from(this.allowedFiles);
  }

  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  }

  private extractFilePath(input: unknown): string | undefined {
    if (
      input &&
      typeof input === "object" &&
      "path" in input &&
      typeof (input as any).path === "string"
    ) {
      return (input as any).path;
    }
    return undefined;
  }

  private async readTargetFile(filePath: string): Promise<string | null> {
    try {
      const root = this.options.workspaceRoot ?? process.cwd();
      const resolved = path.resolve(root, filePath);
      return await fs.readFile(resolved, "utf8");
    } catch {
      return null;
    }
  }

  private async readKey(
    promptText: string,
    validKeys: string[],
  ): Promise<string> {
    const isRawSupported = Boolean(
      stdin.isTTY && typeof stdin.setRawMode === "function",
    );

    if (isRawSupported) {
      stdout.write(promptText);
      return new Promise<string>((resolve) => {
        const wasRaw = stdin.isRaw;
        this.rl.pause();
        stdin.setRawMode(true);
        stdin.resume();

        const onData = (data: Buffer) => {
          const char = data.toString("utf8");
          if (char === "\u0003") {
            cleanup();
            stdout.write("\n");
            process.exit(130);
          }

          const key = char.trim().toLowerCase();
          if (validKeys.includes(key)) {
            cleanup();
            stdout.write(key + "\n");
            resolve(key);
          }
        };

        const cleanup = () => {
          stdin.removeListener("data", onData);
          try {
            if (typeof wasRaw === "boolean") {
              stdin.setRawMode(wasRaw);
            }
          } catch {}
          this.rl.resume();
        };

        stdin.on("data", onData);
      });
    }

    while (true) {
      const answer = (await this.rl.question(promptText)).trim().toLowerCase();
      if (validKeys.includes(answer)) {
        return answer;
      }
      if (answer === "") {
        return "n";
      }
      stdout.write(
        `Invalid choice '${answer}'. Please choose from [${validKeys.join("/")}]: `,
      );
    }
  }

  async request(permission: PermissionRequest): Promise<PermissionDecision> {
    const policyMatch = this.policies.some(
      (p) => p.tool === permission.tool && p.matcher(permission.input),
    );

    if (policyMatch) {
      return "allow-always";
    }

    const filePath = this.extractFilePath(permission.input);
    if (filePath && this.isPathAllowed(filePath)) {
      return "allow-always";
    }

    const key = JSON.stringify(permission);

    if (this.allowed.has(key)) {
      return "allow-once";
    }

    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }

    const promise = this.mutex.lock(async () => {
      // Re-check after waiting for mutex lock
      if (filePath && this.isPathAllowed(filePath)) {
        return "allow-always";
      }
      if (this.allowed.has(key)) {
        return "allow-once";
      }

      this.onBeforePrompt?.();

      let diffObj: UnifiedDiff | null = null;
      let diffPreview = "";
      let isDiffAvailable = false;

      if (permission.tool === "edit_file" && filePath) {
        const existing = await this.readTargetFile(filePath);
        const input = permission.input as { search: string; replace: string };
        diffObj = generateEditDiff(
          existing ?? "",
          input.search,
          input.replace,
          filePath,
        );
        diffPreview = formatUnifiedDiff(diffObj, { detailed: false });
        isDiffAvailable = true;
      } else if (permission.tool === "write_file" && filePath) {
        const existing = await this.readTargetFile(filePath);
        const input = permission.input as { content: string };
        diffObj = generateWriteDiff(existing, input.content, filePath);
        diffPreview = formatUnifiedDiff(diffObj, { detailed: false });
        isDiffAvailable = true;
      }

      const card = renderPermissionCard({
        tool: permission.tool,
        path: filePath,
        diff: isDiffAvailable ? diffPreview : undefined,
        details: !isDiffAvailable
          ? typeof (permission.input as any)?.command === "string"
            ? `Command: ${(permission.input as any).command}`
            : undefined
          : undefined,
        extraInfo:
          !isDiffAvailable &&
          typeof (permission.input as any)?.command !== "string"
            ? (permission.input as Record<string, unknown>)
            : undefined,
        actionChoices: isDiffAvailable
          ? [
              { key: "y", label: "Accept & Apply" },
              { key: "n", label: "Deny" },
              {
                key: "a",
                label:
                  "Always Allow for this file (persists for active session)",
              },
              { key: "d", label: "Detailed full diff view" },
            ]
          : [
              { key: "y", label: "Accept & Apply" },
              { key: "n", label: "Deny" },
              { key: "a", label: "Always Allow for this session" },
            ],
      });

      console.log();
      console.log(card);

      const promptText = ansi.accent(
        `\n  Allow? [${isDiffAvailable ? "y/n/a/d" : "y/n/a"}]: `,
      );
      const validKeys = isDiffAvailable
        ? ["y", "n", "a", "d"]
        : ["y", "n", "a"];

      let chosenAction = await this.readKey(promptText, validKeys);

      // Handle [d] Detailed full diff view
      if (chosenAction === "d" && diffObj) {
        const fullDiff = formatUnifiedDiff(diffObj, { detailed: true });
        console.log();
        console.log(
          ansi.dim("┌─ ") +
            ansi.accent("Detailed Full Diff View: ") +
            ansi.bold(filePath ?? "") +
            " " +
            ansi.dim("─".repeat(20)),
        );
        for (const line of fullDiff.split("\n")) {
          console.log(ansi.dim("│ ") + line);
        }
        console.log(ansi.dim("└" + "─".repeat(50)));
        console.log();
        console.log(
          `  ${ansi.accent("[y]")} Accept & Apply   ${ansi.accent("[n]")} Deny   ${ansi.accent("[a]")} Always Allow for this file`,
        );

        chosenAction = await this.readKey(ansi.accent("\n  Allow? [y/n/a]: "), [
          "y",
          "n",
          "a",
        ]);
      }

      this.onAfterPrompt?.();

      switch (chosenAction) {
        case "a":
          if (filePath) {
            this.allowedFiles.add(this.normalizePath(filePath));
          }
          this.allowed.add(key);
          return "allow-always";

        case "y":
          this.allowed.add(key);
          return "allow-once";

        default:
          return "deny";
      }
    });

    this.pending.set(key, promise);

    try {
      return await promise;
    } finally {
      this.pending.delete(key);
    }
  }
}
