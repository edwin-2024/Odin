import { describe, expect, it } from "bun:test";
import { CliPermissionManager } from "./cli-permission-manager";
import type { PermissionRule } from "./permission-manager";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

function createMockRl(responses: string[]) {
  let idx = 0;
  return {
    async question(_prompt: string): Promise<string> {
      return responses[idx++] ?? "";
    },
    pause() {},
    resume() {},
    close() {},
  } as any;
}

describe("CliPermissionManager", () => {
  describe("Policy Matching", () => {
    it("auto-allows requests matching configured policies without prompting", async () => {
      const rl = createMockRl([]);
      const policies: PermissionRule[] = [
        {
          tool: "read_file",
          matcher: () => true,
        },
        {
          tool: "write_file",
          matcher: (input: any) =>
            typeof input?.path === "string" && input.path.startsWith("src/"),
        },
      ];

      const manager = new CliPermissionManager(rl, policies);

      const decision = await manager.request({
        tool: "write_file",
        input: { path: "src/index.ts", content: "hello" },
      });

      expect(decision).toBe("allow-always");
    });
  });

  describe("Permission Decision Handling", () => {
    it("returns 'allow-once' when user accepts with 'y'", async () => {
      const rl = createMockRl(["y"]);
      const manager = new CliPermissionManager(rl, []);

      const decision = await manager.request({
        tool: "edit_file",
        input: { path: "package.json", search: "foo", replace: "bar" },
      });

      expect(decision).toBe("allow-once");
    });

    it("returns 'deny' when user rejects with 'n'", async () => {
      const rl = createMockRl(["n"]);
      const manager = new CliPermissionManager(rl, []);

      const decision = await manager.request({
        tool: "edit_file",
        input: { path: "package.json", search: "foo", replace: "bar" },
      });

      expect(decision).toBe("deny");
    });

    it("returns 'allow-always' and persists permission for the active session when user selects 'a'", async () => {
      const rl = createMockRl(["a"]); // Only one prompt response needed
      const manager = new CliPermissionManager(rl, []);

      const targetPath = "lib/critical.ts";

      // First request: prompts user, user answers 'a'
      const firstDecision = await manager.request({
        tool: "edit_file",
        input: { path: targetPath, search: "old", replace: "new1" },
      });
      expect(firstDecision).toBe("allow-always");
      expect(manager.isPathAllowed(targetPath)).toBe(true);

      // Second request on same file with DIFFERENT search/replace:
      // Must auto-allow without prompting (rl has no more responses)
      const secondDecision = await manager.request({
        tool: "edit_file",
        input: { path: targetPath, search: "other", replace: "new2" },
      });
      expect(secondDecision).toBe("allow-always");

      // Write request on same file:
      // Must also auto-allow
      const thirdDecision = await manager.request({
        tool: "write_file",
        input: { path: targetPath, content: "full replacement" },
      });
      expect(thirdDecision).toBe("allow-always");
    });

    it("handles [d] detailed full diff view then accepts with 'y'", async () => {
      // First response: 'd' (detailed view), Second response: 'y' (accept)
      const rl = createMockRl(["d", "y"]);
      const manager = new CliPermissionManager(rl, []);

      const decision = await manager.request({
        tool: "edit_file",
        input: {
          path: "README.md",
          search: "# Old Title",
          replace: "# New Title",
        },
      });

      expect(decision).toBe("allow-once");
    });
  });

  describe("In-flight Concurrency and Deduplication", () => {
    it("shares pending promise for identical concurrent permission requests", async () => {
      const rl = createMockRl(["y"]);
      const manager = new CliPermissionManager(rl, []);

      const req = {
        tool: "bash",
        input: { command: "npm test" },
      };

      const [res1, res2] = await Promise.all([
        manager.request(req),
        manager.request(req),
      ]);

      expect(res1).toBe("allow-once");
      expect(res2).toBe("allow-once");
    });
  });

  describe("Workspace File Reading for Diff Generation", () => {
    it("correctly diffs against file on disk when target exists", async () => {
      const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "odin-perm-test-"),
      );
      const testFile = "sample.txt";
      await fs.writeFile(
        path.join(tempDir, testFile),
        "line 1\nline 2\nline 3\n",
        "utf8",
      );

      const rl = createMockRl(["y"]);
      const manager = new CliPermissionManager(rl, [], {
        workspaceRoot: tempDir,
      });

      const decision = await manager.request({
        tool: "edit_file",
        input: {
          path: testFile,
          search: "line 2",
          replace: "line 2 modified",
        },
      });

      expect(decision).toBe("allow-once");
      await fs.rm(tempDir, { recursive: true, force: true });
    });
  });
});
