import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  GitDiffTool,
  GitLogTool,
  GitCommitTool,
  GitStatusTool,
  ToolRegistry,
} from "./index";
import {
  NodeTerminal,
  NodeGit,
  type Git,
  type GitCommitLog,
} from "@odin/runtime";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

describe("Git Tools Definitions", () => {
  const dummyGit: Git = {
    status: async () => ({
      branch: "main",
      staged: [],
      modified: [],
      untracked: [],
    }),
    diff: async () => "",
    log: async () => [],
    commit: async () => {},
  };

  it("GitDiffTool has correct metadata and schema", () => {
    const tool = new GitDiffTool(dummyGit);
    expect(tool.name).toBe("git_diff");
    expect(tool.executionMode).toBe("parallel");
    expect(tool.description).toContain("diff");
    expect(tool.schema.type).toBe("object");
    expect(tool.schema.properties.staged).toBeDefined();
    expect(tool.schema.properties.path).toBeDefined();
    expect(tool.schema.properties.target).toBeDefined();
  });

  it("GitLogTool has correct metadata and schema", () => {
    const tool = new GitLogTool(dummyGit);
    expect(tool.name).toBe("git_log");
    expect(tool.executionMode).toBe("parallel");
    expect(tool.description).toContain("log");
    expect(tool.schema.type).toBe("object");
    expect(tool.schema.properties.maxCount).toBeDefined();
    expect(tool.schema.properties.path).toBeDefined();
  });

  it("GitCommitTool has correct metadata and schema", () => {
    const tool = new GitCommitTool(dummyGit);
    expect(tool.name).toBe("git_commit");
    expect(tool.executionMode).toBe("serial");
    expect(tool.description).toContain("commit");
    expect(tool.schema.type).toBe("object");
    expect(tool.schema.required).toContain("message");
    expect(tool.schema.properties.message).toBeDefined();
    expect(tool.schema.properties.all).toBeDefined();
    expect(tool.schema.properties.files).toBeDefined();
  });

  it("registers all git tools in ToolRegistry", () => {
    const registry = new ToolRegistry();
    const diffTool = new GitDiffTool(dummyGit);
    const logTool = new GitLogTool(dummyGit);
    const commitTool = new GitCommitTool(dummyGit);

    registry.register(diffTool);
    registry.register(logTool);
    registry.register(commitTool);

    expect(registry.get("git_diff")).toBe(diffTool);
    expect(registry.get("git_log")).toBe(logTool);
    expect(registry.get("git_commit")).toBe(commitTool);

    const schemas = registry.toolSchemas();
    const schemaNames = schemas.map((s) => s.function.name);
    expect(schemaNames).toContain("git_diff");
    expect(schemaNames).toContain("git_log");
    expect(schemaNames).toContain("git_commit");
  });
});

describe("Git Tools Parameter Validation", () => {
  const dummyGit: Git = {
    status: async () => ({
      branch: "main",
      staged: [],
      modified: [],
      untracked: [],
    }),
    diff: async () => "",
    log: async () => [],
    commit: async () => {},
  };

  describe("GitDiffTool validation", () => {
    const tool = new GitDiffTool(dummyGit);

    it("rejects non-boolean staged parameter", async () => {
      expect(tool.execute({ staged: "true" as any })).rejects.toThrow(
        "staged must be a boolean",
      );
    });

    it("rejects invalid path parameter", async () => {
      expect(tool.execute({ path: 123 as any })).rejects.toThrow(
        "path must be a non-empty string",
      );
      expect(tool.execute({ path: "   " })).rejects.toThrow(
        "path must be a non-empty string",
      );
    });

    it("rejects invalid target parameter", async () => {
      expect(tool.execute({ target: 123 as any })).rejects.toThrow(
        "target must be a non-empty string",
      );
      expect(tool.execute({ target: "   " })).rejects.toThrow(
        "target must be a non-empty string",
      );
    });
  });

  describe("GitLogTool validation", () => {
    const tool = new GitLogTool(dummyGit);

    it("rejects non-positive maxCount", async () => {
      expect(tool.execute({ maxCount: 0 })).rejects.toThrow(
        "maxCount must be a positive number",
      );
      expect(tool.execute({ maxCount: -5 })).rejects.toThrow(
        "maxCount must be a positive number",
      );
      expect(tool.execute({ maxCount: "10" as any })).rejects.toThrow(
        "maxCount must be a positive number",
      );
    });

    it("rejects maxCount greater than 50", async () => {
      expect(tool.execute({ maxCount: 51 })).rejects.toThrow(
        "maxCount cannot exceed 50",
      );
      expect(tool.execute({ maxCount: 100 })).rejects.toThrow(
        "maxCount cannot exceed 50",
      );
    });

    it("rejects invalid path parameter", async () => {
      expect(tool.execute({ path: 123 as any })).rejects.toThrow(
        "path must be a non-empty string",
      );
      expect(tool.execute({ path: "" })).rejects.toThrow(
        "path must be a non-empty string",
      );
    });
  });

  describe("GitCommitTool validation", () => {
    const tool = new GitCommitTool(dummyGit);

    it("rejects empty or missing commit message", async () => {
      expect(tool.execute({} as any)).rejects.toThrow(
        "Commit message must be a non-empty string",
      );
      expect(tool.execute({ message: "" })).rejects.toThrow(
        "Commit message must be a non-empty string",
      );
      expect(tool.execute({ message: "   \n\t  " })).rejects.toThrow(
        "Commit message must be a non-empty string",
      );
      expect(tool.execute({ message: 42 as any })).rejects.toThrow(
        "Commit message must be a non-empty string",
      );
    });

    it("rejects non-boolean all parameter", async () => {
      expect(
        tool.execute({ message: "feat: test", all: "yes" as any }),
      ).rejects.toThrow("all must be a boolean");
    });

    it("rejects invalid files parameter", async () => {
      expect(
        tool.execute({ message: "feat: test", files: "file.txt" as any }),
      ).rejects.toThrow("files must be an array");
      expect(
        tool.execute({ message: "feat: test", files: [""] }),
      ).rejects.toThrow("Each file path must be a non-empty string");
      expect(
        tool.execute({ message: "feat: test", files: [123 as any] }),
      ).rejects.toThrow("Each file path must be a non-empty string");
    });
  });
});

describe("GitDiffTool Truncation", () => {
  it("truncates diff output when exceeding 1000 lines", async () => {
    const longDiff = Array.from({ length: 1200 }, (_, i) => `+line ${i}`).join(
      "\n",
    );
    const mockGit: Git = {
      status: async () => ({
        branch: "main",
        staged: [],
        modified: [],
        untracked: [],
      }),
      diff: async () => longDiff,
      log: async () => [],
      commit: async () => {},
    };

    const tool = new GitDiffTool(mockGit);
    const result = await tool.execute({});
    expect(result.content).toContain(
      "[Diff truncated: exceeded 50KB or 1000 lines limit]",
    );
    const lines = result.content.split("\n");
    expect(lines.slice(0, 1000).length).toBe(1000);
  });

  it("truncates diff output when exceeding 50KB", async () => {
    const longLine = "a".repeat(600);
    const largeDiff = Array.from({ length: 100 }, () => longLine).join("\n");
    expect(Buffer.byteLength(largeDiff, "utf-8")).toBeGreaterThan(50 * 1024);

    const mockGit: Git = {
      status: async () => ({
        branch: "main",
        staged: [],
        modified: [],
        untracked: [],
      }),
      diff: async () => largeDiff,
      log: async () => [],
      commit: async () => {},
    };

    const tool = new GitDiffTool(mockGit);
    const result = await tool.execute({});
    expect(result.content).toContain(
      "[Diff truncated: exceeded 50KB or 1000 lines limit]",
    );
  });
});

describe("Execution against NodeGit (Integration)", () => {
  let tmpDir: string;
  let terminal: NodeTerminal;
  let git: NodeGit;
  let diffTool: GitDiffTool;
  let logTool: GitLogTool;
  let commitTool: GitCommitTool;
  let statusTool: GitStatusTool;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "odin-git-tools-test-"));
    spawnSync("git", ["init"], { cwd: tmpDir });
    spawnSync("git", ["config", "user.name", "Odin Test"], { cwd: tmpDir });
    spawnSync("git", ["config", "user.email", "odin@test.com"], {
      cwd: tmpDir,
    });

    terminal = new NodeTerminal(tmpDir);
    git = new NodeGit(terminal);
    diffTool = new GitDiffTool(git);
    logTool = new GitLogTool(git);
    commitTool = new GitCommitTool(git);
    statusTool = new GitStatusTool(git);
  });

  afterEach(async () => {
    try {
      fs.rmSync(tmpDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    } catch {
      // Ignore cleanup locks on Windows
    }
  });

  it("executes commits and verifies status", async () => {
    const initialStatus = await statusTool.execute();
    const parsedInitial = JSON.parse(initialStatus.content);
    expect(parsedInitial.branch).toBeDefined();

    fs.writeFileSync(path.join(tmpDir, "file1.txt"), "hello world\n");
    const commitResult = await commitTool.execute({
      message: "feat: add file1",
      files: ["file1.txt"],
    });
    expect(commitResult.content).toContain("feat: add file1");

    const statusAfter = await statusTool.execute();
    const parsedAfter = JSON.parse(statusAfter.content);
    expect(parsedAfter.staged.length).toBe(0);
    expect(parsedAfter.modified.length).toBe(0);
  }, 15000);

  it("executes diff for working tree and staged changes", async () => {
    fs.writeFileSync(path.join(tmpDir, "file1.txt"), "original content\n");
    await commitTool.execute({ message: "initial", files: ["file1.txt"] });

    fs.writeFileSync(path.join(tmpDir, "file1.txt"), "modified content\n");
    const wtDiff = await diffTool.execute({});
    expect(wtDiff.content).toContain("-original content");
    expect(wtDiff.content).toContain("+modified content");

    const pathDiff = await diffTool.execute({ path: "file1.txt" });
    expect(pathDiff.content).toContain("+modified content");

    spawnSync("git", ["add", "file1.txt"], { cwd: tmpDir });
    const stagedDiff = await diffTool.execute({ staged: true });
    expect(stagedDiff.content).toContain("+modified content");
  }, 15000);

  it("executes diff against target revision", async () => {
    fs.writeFileSync(path.join(tmpDir, "file1.txt"), "version 1\n");
    await commitTool.execute({ message: "commit 1", files: ["file1.txt"] });

    fs.writeFileSync(path.join(tmpDir, "file1.txt"), "version 2\n");
    await commitTool.execute({ message: "commit 2", files: ["file1.txt"] });

    const targetDiff = await diffTool.execute({ target: "HEAD~1" });
    expect(targetDiff.content).toContain("-version 1");
    expect(targetDiff.content).toContain("+version 2");
  }, 15000);

  it("executes log with filtering and maxCount", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "content a\n");
    await commitTool.execute({ message: "feat: commit A", files: ["a.txt"] });

    fs.writeFileSync(path.join(tmpDir, "b.txt"), "content b\n");
    await commitTool.execute({ message: "feat: commit B", files: ["b.txt"] });

    const logAll = await logTool.execute({});
    const logsAll: GitCommitLog[] = JSON.parse(logAll.content);
    expect(logsAll.length).toBe(2);
    expect(logsAll[0]!.subject).toBe("feat: commit B");
    expect(logsAll[0]!.author).toBe("Odin Test");
    expect(logsAll[1]!.subject).toBe("feat: commit A");

    const logOne = await logTool.execute({ maxCount: 1 });
    const logsOne: GitCommitLog[] = JSON.parse(logOne.content);
    expect(logsOne.length).toBe(1);
    expect(logsOne[0]!.subject).toBe("feat: commit B");

    const logPath = await logTool.execute({ path: "a.txt" });
    const logsPath: GitCommitLog[] = JSON.parse(logPath.content);
    expect(logsPath.length).toBe(1);
    expect(logsPath[0]!.subject).toBe("feat: commit A");
  }, 15000);

  it("NodeGit handles commit with multiline message", async () => {
    fs.writeFileSync(path.join(tmpDir, "multiline.txt"), "multiline content\n");
    await git.commit("feat: title message\n\nDetailed body description", {
      files: ["multiline.txt"],
    });

    const logs = await git.log({ maxCount: 1 });
    expect(logs.length).toBe(1);
    expect(logs[0]!.subject).toBe("feat: title message");
  }, 15000);

  it("NodeGit throws error when git commit fails due to clean tree", async () => {
    fs.writeFileSync(path.join(tmpDir, "init.txt"), "init\n");
    await git.commit({ message: "initial", all: true });

    expect(git.commit({ message: "empty commit" })).rejects.toThrow();
  }, 15000);
});
