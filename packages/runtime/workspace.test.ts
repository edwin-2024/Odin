import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { NodeWorkspace, SecurityViolationError } from "./workspace/node-workspace";
import { NodeTerminal, DANGEROUS_COMMAND_PATTERNS } from "./terminal/node-terminal";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("NodeWorkspace", () => {
  let tmpDir: string;
  let workspace: NodeWorkspace;
  let terminal: NodeTerminal;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "odin-workspace-test-"));
    terminal = new NodeTerminal(tmpDir);
    workspace = new NodeWorkspace(tmpDir, terminal);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("reads and writes file content with line numbers for reading", async () => {
    const filePath = "hello.txt";
    await workspace.write(filePath, "line one\nline two\nline three");

    const readOutput = await workspace.read(filePath);
    expect(readOutput).toBe("1 | line one\n2 | line two\n3 | line three");
  });

  it("supports line ranges when reading", async () => {
    const filePath = "hello.txt";
    await workspace.write(filePath, "line 1\nline 2\nline 3\nline 4");

    const readOutput = await workspace.read(filePath, { startLine: 2, endLine: 3 });
    expect(readOutput).toBe("2 | line 2\n3 | line 3");
  });

  it("edits files cleanly without baking line numbers into the file", async () => {
    const filePath = "code.ts";
    const initialCode = "const a = 1;\nconst b = 2;\nconsole.log(a + b);";
    await workspace.write(filePath, initialCode);

    await workspace.edit(filePath, "const b = 2;", "const b = 42;");

    // Read the raw file directly from filesystem to verify NO line numbers ("1 | ...") were written
    const rawContent = await fs.readFile(path.join(tmpDir, filePath), "utf8");
    expect(rawContent).toBe("const a = 1;\nconst b = 42;\nconsole.log(a + b);");
    expect(rawContent).not.toContain("1 |");
  });

  it("preserves CRLF line endings when editing files on Windows", async () => {
    const filePath = "windows.ts";
    const initialCode = "const x = 1;\r\nconst y = 2;\r\nconst z = 3;";
    await workspace.write(filePath, initialCode);

    await workspace.edit(filePath, "const y = 2;", "const y = 20;\nconst extra = true;");

    const rawContent = await fs.readFile(path.join(tmpDir, filePath), "utf8");
    expect(rawContent).toBe("const x = 1;\r\nconst y = 20;\r\nconst extra = true;\r\nconst z = 3;");
    expect(rawContent).not.toContain("\r\r\n");
  });

  it("throws when search target is not found", async () => {
    const filePath = "code.ts";
    await workspace.write(filePath, "const x = 10;");

    expect(
      workspace.edit(filePath, "const y = 20;", "const y = 30;")
    ).rejects.toThrow("Search text not found");
  });

  it("throws when search target matches multiple locations without occurrence hint", async () => {
    const filePath = "duplicate.txt";
    await workspace.write(filePath, "hello\nworld\nhello");

    expect(
      workspace.edit(filePath, "hello", "hi")
    ).rejects.toThrow("Found 2 matches for search text");
  });

  it("replaces specific occurrence when disambiguated by occurrence number", async () => {
    const filePath = "duplicate.txt";
    await workspace.write(filePath, "item\nitem\nitem");

    // Replace 2nd occurrence
    await workspace.edit(filePath, "item", "MODIFIED", { occurrence: 2 });
    const content = await fs.readFile(path.join(tmpDir, filePath), "utf8");
    expect(content).toBe("item\nMODIFIED\nitem");
  });

  it("lists directory entries correctly with relative paths", async () => {
    await workspace.write("sub/a.txt", "a");
    await workspace.write("sub/b.txt", "b");

    const entries = await workspace.list("sub");
    expect(entries.length).toBe(2);
    expect(entries.map((e) => e.name).sort()).toEqual(["a.txt", "b.txt"]);
  });

  it("globs files matching patterns", async () => {
    await workspace.write("src/index.ts", "export {}");
    await workspace.write("src/util.ts", "export {}");
    await workspace.write("docs/readme.md", "# Readme");

    const matches = await workspace.glob("**/*.ts");
    expect(matches.sort()).toEqual(["src/index.ts", "src/util.ts"]);
  });

  it("prevents path traversal outside workspace boundary", async () => {
    expect(
      workspace.read("../../escaped.txt")
    ).rejects.toThrow(SecurityViolationError);

    expect(
      workspace.write("../../../evil.txt", "pwned")
    ).rejects.toThrow(SecurityViolationError);
  });

  it("blocks dangerous command execution in NodeTerminal", async () => {
    const stream = terminal.run("rm -rf /");
    let output = "";
    let exitCode = 0;
    for await (const event of stream) {
      if (event.type === "stderr") output += event.data;
      if (event.type === "exit") exitCode = event.code;
    }
    expect(exitCode).toBe(126);
    expect(output).toContain("blocked by safety policy");
  });
});
