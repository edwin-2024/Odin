import { describe, expect, it } from "bun:test";
import {
  computeUnifiedDiff,
  generateEditDiff,
  generateWriteDiff,
  formatUnifiedDiff,
  renderPermissionCard,
  applyEditToFile,
} from "./diff-formatter";

describe("Unified Diff Formatter", () => {
  describe("CRLF Preservation and String Replacements", () => {
    it("preserves Windows CRLF endings when editing files", () => {
      const originalCRLF = "line1\r\nline2\r\nline3\r\n";
      const { updated, isCRLF, searchFound } = applyEditToFile(
        originalCRLF,
        "line2",
        "line2_modified\nline2_added",
      );

      expect(searchFound).toBe(true);
      expect(isCRLF).toBe(true);
      expect(updated).toBe(
        "line1\r\nline2_modified\r\nline2_added\r\nline3\r\n",
      );
      // Must contain \r\n and NOT bare \n
      expect(updated.includes("\r\n")).toBe(true);
      expect(updated.replace(/\r\n/g, "").includes("\n")).toBe(false);
    });

    it("preserves Unix LF endings when file uses LF", () => {
      const originalLF = "line1\nline2\nline3\n";
      const { updated, isCRLF } = applyEditToFile(
        originalLF,
        "line2",
        "line2_updated",
      );

      expect(isCRLF).toBe(false);
      expect(updated).toBe("line1\nline2_updated\nline3\n");
      expect(updated.includes("\r")).toBe(false);
    });

    it("correctly handles escaped newline characters in search and replace strings", () => {
      const original = "function foo() {\n  return 1;\n}\n";
      const { updated, searchFound } = applyEditToFile(
        original,
        "function foo() {\\n  return 1;\\n}",
        "function foo() {\\n  return 2;\\n}",
      );

      expect(searchFound).toBe(true);
      expect(updated).toContain("return 2;");
    });

    it("flags when search string does not exist in target file", () => {
      const original = "const a = 1;\n";
      const diff = generateEditDiff(
        original,
        "const b = 2;",
        "const b = 3;",
        "test.ts",
      );

      expect(diff.searchFound).toBe(false);
      const formatted = formatUnifiedDiff(diff);
      expect(formatted).toContain("search target not found");
    });
  });

  describe("Diff Generation for edit_file", () => {
    it("generates correct hunks with line numbers for edit modifications", () => {
      const fileContent = [
        "import os",
        "import sys",
        "",
        "def main():",
        "    x = 1",
        "    y = 2",
        "    print(x + y)",
        "",
        "if __name__ == '__main__':",
        "    main()",
      ].join("\n");

      const diff = generateEditDiff(
        fileContent,
        "    y = 2\n    print(x + y)",
        "    y = 5\n    z = 10\n    print(x + y + z)",
        "main.py",
      );

      expect(diff.path).toBe("main.py");
      expect(diff.isNewFile).toBe(false);
      expect(diff.hunks.length).toBe(1);

      const hunk = diff.hunks[0]!;
      expect(hunk.oldStart).toBeGreaterThanOrEqual(1);
      expect(
        hunk.lines.some(
          (l) => l.type === "delete" && l.content.includes("y = 2"),
        ),
      ).toBe(true);
      expect(
        hunk.lines.some((l) => l.type === "add" && l.content.includes("y = 5")),
      ).toBe(true);
      expect(
        hunk.lines.some(
          (l) => l.type === "add" && l.content.includes("z = 10"),
        ),
      ).toBe(true);
    });
  });

  describe("Diff Generation for write_file", () => {
    it("formats newly created file preview with all additions", () => {
      const newContent = "console.log('hello world');\nconst x = 42;\n";
      const diff = generateWriteDiff(null, newContent, "new-file.ts");

      expect(diff.isNewFile).toBe(true);
      expect(diff.path).toBe("new-file.ts");
      expect(diff.hunks.length).toBe(1);

      const hunk = diff.hunks[0]!;
      expect(hunk.oldStart).toBe(0);
      expect(hunk.newStart).toBe(1);
      expect(hunk.lines.every((l) => l.type === "add")).toBe(true);
      expect(hunk.lines[0]?.content).toBe("console.log('hello world');");
      expect(hunk.lines[0]?.newLineNumber).toBe(1);
      expect(hunk.lines[1]?.newLineNumber).toBe(2);
    });

    it("diffs against existing content when write_file overwrites a file", () => {
      const existing = "old line 1\nold line 2\n";
      const updated = "old line 1\nnew line 2\nnew line 3\n";

      const diff = generateWriteDiff(existing, updated, "existing.txt");
      expect(diff.isNewFile).toBe(false);

      const formatted = formatUnifiedDiff(diff);
      expect(formatted).toContain("--- a/existing.txt");
      expect(formatted).toContain("+++ b/existing.txt");
      expect(formatted).toContain("- old line 2");
      expect(formatted).toContain("+ new line 2");
      expect(formatted).toContain("+ new line 3");
    });
  });

  describe("ANSI Color Output & Formatting", () => {
    it("includes file path header, line numbers, red '-' deletions, and green '+' additions", () => {
      const oldContent = "const a = 1;\nconst b = 2;\n";
      const newContent = "const a = 1;\nconst b = 99;\n";

      const diff = computeUnifiedDiff(oldContent, newContent, "src/config.ts");
      const formatted = formatUnifiedDiff(diff, { colorize: true });

      // File path header
      expect(formatted).toContain("src/config.ts");
      // ANSI escape for red (\x1b[31m) for deletion
      expect(formatted).toContain("\x1b[31m");
      expect(formatted).toContain("- const b = 2;");
      // ANSI escape for green (\x1b[32m) for addition
      expect(formatted).toContain("\x1b[32m");
      expect(formatted).toContain("+ const b = 99;");
      // Line numbers displayed
      expect(formatted).toContain("│");
    });

    it("supports compact preview and full detailed diff views", () => {
      // Generate a 30 line diff
      const oldLines = Array.from(
        { length: 30 },
        (_, i) => `old line ${i + 1}`,
      ).join("\n");
      const newLines = Array.from(
        { length: 30 },
        (_, i) => `new line ${i + 1}`,
      ).join("\n");

      const diff = computeUnifiedDiff(oldLines, newLines, "large.txt");

      const compact = formatUnifiedDiff(diff, {
        detailed: false,
        maxLines: 10,
      });
      expect(compact).toContain("more lines (press [d] for full diff)");

      const detailed = formatUnifiedDiff(diff, { detailed: true });
      expect(detailed).not.toContain("more lines");
      expect(detailed).toContain("new line 30");
    });
  });

  describe("Variant A Authorization Card", () => {
    it("renders card with purple #A78BFA accent, subtle line rules, and action choices", () => {
      const card = renderPermissionCard({
        tool: "edit_file",
        path: "src/server.ts",
        diff: "@@ -1,2 +1,2 @@\n- const port = 3000;\n+ const port = 8080;",
      });

      // Purple accent: \x1b[38;2;167;139;250m
      expect(card).toContain("\x1b[38;2;167;139;250m");
      // Subtle line rules
      expect(card).toContain("┌─");
      expect(card).toContain("│");
      expect(card).toContain("└─");
      // Tool and path
      expect(card).toContain("edit_file");
      expect(card).toContain("src/server.ts");
      // Action choices
      expect(card).toContain("[y]");
      expect(card).toContain("Accept & Apply");
      expect(card).toContain("[n]");
      expect(card).toContain("Deny");
      expect(card).toContain("[a]");
      expect(card).toContain("Always Allow for this file");
      expect(card).toContain("[d]");
      expect(card).toContain("Detailed full diff view");
    });
  });
});
