export type DiffLineType = "add" | "delete" | "context";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface UnifiedDiff {
  path: string;
  isNewFile: boolean;
  isCRLF: boolean;
  hunks: DiffHunk[];
  searchFound?: boolean;
}

export interface FormatDiffOptions {
  maxLines?: number;
  detailed?: boolean;
  colorize?: boolean;
}

export interface PermissionCardOptions {
  tool: string;
  path?: string;
  diff?: string;
  details?: string;
  actionChoices?: Array<{ key: string; label: string }>;
  extraInfo?: Record<string, unknown>;
}

// ── Lightweight ANSI Styling ───────────────────────────────────

export const ansi = {
  reset: "\x1b[0m",
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
  green: (s: string) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
  white: (s: string) => `\x1b[37m${s}\x1b[39m`,
  accent: (s: string) => `\x1b[38;2;167;139;250m${s}\x1b[39m`, // Variant A purple #A78BFA
};

// ── CRLF-Preserving String Replacer ────────────────────────────

export function applyEditToFile(
  fileContent: string,
  search: string,
  replace: string,
): {
  updated: string;
  isCRLF: boolean;
  searchFound: boolean;
} {
  const unescapedSearch = search
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
  const unescapedReplace = replace
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");

  const isCRLF = fileContent.includes("\r\n");
  const normalizedSearch = isCRLF
    ? unescapedSearch.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
    : unescapedSearch.replace(/\r\n/g, "\n");
  const normalizedReplace = isCRLF
    ? unescapedReplace.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
    : unescapedReplace;

  const count = fileContent.split(normalizedSearch).length - 1;
  if (count === 0) {
    return { updated: fileContent, isCRLF, searchFound: false };
  }

  const updated = fileContent.replace(normalizedSearch, normalizedReplace);
  return { updated, isCRLF, searchFound: true };
}

// ── Myers Diff Engine with Common Affix Trimming ───────────────

interface EditOp {
  type: DiffLineType;
  oldIdx?: number;
  newIdx?: number;
}

export function computeUnifiedDiff(
  oldContent: string,
  newContent: string,
  filePath: string,
  options: { contextLines?: number; isNewFile?: boolean } = {},
): UnifiedDiff {
  const contextSize = options.contextLines ?? 3;
  const isNewFile = options.isNewFile ?? oldContent === "";
  const isCRLF = oldContent.includes("\r\n") || newContent.includes("\r\n");

  const splitLines = (str: string): string[] => {
    if (!str) return [];
    const lines = str.replace(/\r\n/g, "\n").split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines;
  };

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  if (isNewFile) {
    const lines: DiffLine[] = newLines.map((content, idx) => ({
      type: "add",
      content,
      newLineNumber: idx + 1,
    }));
    return {
      path: filePath,
      isNewFile: true,
      isCRLF,
      hunks: [
        {
          oldStart: 0,
          oldCount: 0,
          newStart: 1,
          newCount: lines.length,
          lines,
        },
      ],
    };
  }

  const n = oldLines.length;
  const m = newLines.length;

  if (n === 0 && m === 0) {
    return { path: filePath, isNewFile: false, isCRLF, hunks: [] };
  }

  if (m === 0) {
    const lines: DiffLine[] = oldLines.map((content, idx) => ({
      type: "delete",
      content,
      oldLineNumber: idx + 1,
    }));
    return {
      path: filePath,
      isNewFile: false,
      isCRLF,
      hunks: [
        {
          oldStart: 1,
          oldCount: lines.length,
          newStart: 0,
          newCount: 0,
          lines,
        },
      ],
    };
  }

  let start = 0;
  while (start < n && start < m && oldLines[start] === newLines[start]) {
    start++;
  }
  let endA = n - 1;
  let endB = m - 1;
  while (endA >= start && endB >= start && oldLines[endA] === newLines[endB]) {
    endA--;
    endB--;
  }

  if (start > endA && start > endB) {
    return { path: filePath, isNewFile: false, isCRLF, hunks: [] };
  }

  const sliceA = oldLines.slice(start, endA + 1);
  const sliceB = newLines.slice(start, endB + 1);
  const sn = sliceA.length;
  const sm = sliceB.length;
  const smax = sn + sm;

  const v: Record<number, number> = { 1: 0 };
  const trace: Record<number, number>[] = [];
  let dFound = -1;

  for (let d = 0; d <= smax; d++) {
    trace.push({ ...v });
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[k - 1] ?? 0) < (v[k + 1] ?? 0))) {
        x = v[k + 1] ?? 0;
      } else {
        x = (v[k - 1] ?? 0) + 1;
      }
      let y = x - k;
      while (x < sn && y < sm && sliceA[x] === sliceB[y]) {
        x++;
        y++;
      }
      v[k] = x;
      if (x >= sn && y >= sm) {
        dFound = d;
        break;
      }
    }
    if (dFound >= 0) break;
  }

  const edits: EditOp[] = [];

  // Leading context from common prefix
  const leadStart = Math.max(0, start - contextSize);
  for (let i = leadStart; i < start; i++) {
    edits.push({ type: "context", oldIdx: i, newIdx: i });
  }

  if (dFound >= 0) {
    let bx = sn;
    let by = sm;
    const middle: EditOp[] = [];
    for (let step = dFound; step > 0; step--) {
      const tv = trace[step]!;
      const tk = bx - by;
      const prevK =
        tk === -step || (tk !== step && (tv[tk - 1] ?? 0) < (tv[tk + 1] ?? 0))
          ? tk + 1
          : tk - 1;
      const prevX = tv[prevK] ?? 0;
      const prevY = prevX - prevK;
      while (bx > prevX && by > prevY) {
        middle.push({
          type: "context",
          oldIdx: start + bx - 1,
          newIdx: start + by - 1,
        });
        bx--;
        by--;
      }
      if (step > 0) {
        if (bx === prevX) {
          middle.push({ type: "add", newIdx: start + by - 1 });
          by--;
        } else {
          middle.push({ type: "delete", oldIdx: start + bx - 1 });
          bx--;
        }
      }
    }
    while (bx > 0 && by > 0) {
      middle.push({
        type: "context",
        oldIdx: start + bx - 1,
        newIdx: start + by - 1,
      });
      bx--;
      by--;
    }
    middle.reverse();
    edits.push(...middle);
  }

  // Trailing context from common suffix
  const trailEnd = Math.min(n, endA + 1 + contextSize);
  for (let i = endA + 1; i < trailEnd; i++) {
    const offsetInNew = i - (endA + 1);
    edits.push({
      type: "context",
      oldIdx: i,
      newIdx: endB + 1 + offsetInNew,
    });
  }

  // Cluster edits into distinct hunks
  const changeIndices: number[] = [];
  for (let k = 0; k < edits.length; k++) {
    if (edits[k]!.type !== "context") {
      changeIndices.push(k);
    }
  }

  if (changeIndices.length === 0) {
    return { path: filePath, isNewFile: false, isCRLF, hunks: [] };
  }

  const clusters: number[][] = [];
  let currentCluster: number[] = [changeIndices[0]!];
  for (let idx = 1; idx < changeIndices.length; idx++) {
    const prev = changeIndices[idx - 1]!;
    const curr = changeIndices[idx]!;
    if (curr - prev <= 2 * contextSize) {
      currentCluster.push(curr);
    } else {
      clusters.push(currentCluster);
      currentCluster = [curr];
    }
  }
  clusters.push(currentCluster);

  const hunks: DiffHunk[] = [];
  for (const cluster of clusters) {
    const firstChange = cluster[0]!;
    const lastChange = cluster[cluster.length - 1]!;

    const startIdx = Math.max(0, firstChange - contextSize);
    const endIdx = Math.min(edits.length, lastChange + contextSize + 1);

    const rawHunk = edits.slice(startIdx, endIdx);
    const hunkLines: DiffLine[] = rawHunk.map((e) => ({
      type: e.type,
      content: e.type === "add" ? newLines[e.newIdx!]! : oldLines[e.oldIdx!]!,
      oldLineNumber: e.oldIdx !== undefined ? e.oldIdx + 1 : undefined,
      newLineNumber: e.newIdx !== undefined ? e.newIdx + 1 : undefined,
    }));

    const firstWithOld = hunkLines.find((l) => l.oldLineNumber !== undefined);
    const firstWithNew = hunkLines.find((l) => l.newLineNumber !== undefined);
    const oldStart = firstWithOld?.oldLineNumber ?? 1;
    const newStart = firstWithNew?.newLineNumber ?? 1;
    const oldCount = hunkLines.filter(
      (l) => l.type === "context" || l.type === "delete",
    ).length;
    const newCount = hunkLines.filter(
      (l) => l.type === "context" || l.type === "add",
    ).length;

    hunks.push({
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines: hunkLines,
    });
  }

  return {
    path: filePath,
    isNewFile: false,
    isCRLF,
    hunks,
  };
}

// ── High-Level Generators for edit_file and write_file ─────────

export function generateEditDiff(
  existingContent: string,
  search: string,
  replace: string,
  filePath: string,
  options: { contextLines?: number } = {},
): UnifiedDiff {
  const { updated, isCRLF, searchFound } = applyEditToFile(
    existingContent,
    search,
    replace,
  );

  if (!searchFound) {
    // Search text not found: build a fallback diff preview showing requested search vs replace
    const searchLines = search.replace(/\r\n/g, "\n").split("\n");
    const replaceLines = replace.replace(/\r\n/g, "\n").split("\n");

    const lines: DiffLine[] = [
      ...searchLines.map((content, idx) => ({
        type: "delete" as const,
        content,
        oldLineNumber: idx + 1,
      })),
      ...replaceLines.map((content, idx) => ({
        type: "add" as const,
        content,
        newLineNumber: idx + 1,
      })),
    ];

    return {
      path: filePath,
      isNewFile: false,
      isCRLF,
      searchFound: false,
      hunks: [
        {
          oldStart: 1,
          oldCount: searchLines.length,
          newStart: 1,
          newCount: replaceLines.length,
          lines,
        },
      ],
    };
  }

  const diff = computeUnifiedDiff(existingContent, updated, filePath, options);
  diff.isCRLF = isCRLF;
  diff.searchFound = true;
  return diff;
}

export function generateWriteDiff(
  existingContent: string | null,
  newContent: string,
  filePath: string,
  options: { contextLines?: number } = {},
): UnifiedDiff {
  if (existingContent === null || existingContent.trim() === "") {
    return computeUnifiedDiff("", newContent, filePath, {
      ...options,
      isNewFile: true,
    });
  }

  return computeUnifiedDiff(existingContent, newContent, filePath, {
    ...options,
    isNewFile: false,
  });
}

// ── ANSI Unified Diff Formatter ────────────────────────────────

export function formatUnifiedDiff(
  diff: UnifiedDiff,
  options: FormatDiffOptions = {},
): string {
  const colorize = options.colorize ?? true;
  const detailed = options.detailed ?? false;
  const maxLines = options.maxLines ?? (detailed ? Infinity : 15);

  const out: string[] = [];

  // Header
  const prefix = diff.isNewFile ? "+++ b/" : "--- a/";
  const oldHeader = colorize
    ? ansi.dim(prefix + diff.path)
    : prefix + diff.path;
  const newHeader = colorize
    ? ansi.dim("+++ b/" + diff.path)
    : "+++ b/" + diff.path;

  if (!diff.isNewFile) {
    out.push(oldHeader);
  }
  out.push(newHeader);

  if (diff.searchFound === false) {
    const warn = colorize
      ? ansi.yellow(
          "  ⚠ Note: search target not found in target file; showing requested change:",
        )
      : "  Note: search target not found in target file; showing requested change:";
    out.push(warn);
  }

  let renderedLines = 0;
  let totalDiffLines = 0;

  for (const hunk of diff.hunks) {
    totalDiffLines += hunk.lines.length;
  }

  for (const hunk of diff.hunks) {
    if (renderedLines >= maxLines) break;

    const hunkHdr = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
    out.push(colorize ? ansi.cyan(hunkHdr) : hunkHdr);

    for (const line of hunk.lines) {
      if (renderedLines >= maxLines) {
        break;
      }

      renderedLines++;
      const lineNum = String(
        line.type === "delete"
          ? (line.oldLineNumber ?? "")
          : (line.newLineNumber ?? ""),
      ).padStart(4, " ");

      if (line.type === "delete") {
        const formatted = colorize
          ? `${ansi.red(`- ${lineNum} │ - ${line.content}`)}`
          : `- ${lineNum} │ - ${line.content}`;
        out.push(formatted);
      } else if (line.type === "add") {
        const formatted = colorize
          ? `${ansi.green(`+ ${lineNum} │ + ${line.content}`)}`
          : `+ ${lineNum} │ + ${line.content}`;
        out.push(formatted);
      } else {
        const formatted = colorize
          ? `${ansi.dim(`  ${lineNum} │ `)}  ${line.content}`
          : `  ${lineNum} │   ${line.content}`;
        out.push(formatted);
      }
    }
  }

  if (!detailed && totalDiffLines > renderedLines) {
    const remaining = totalDiffLines - renderedLines;
    const moreNotice = colorize
      ? ansi.dim(`  ... and ${remaining} more lines (press [d] for full diff)`)
      : `  ... and ${remaining} more lines (press [d] for full diff)`;
    out.push(moreNotice);
  }

  return out.join("\n");
}

// ── Variant A Authorization Card Renderer ──────────────────────

const CARD_WIDTH = 58;

export function renderPermissionCard(options: PermissionCardOptions): string {
  const { tool, path, diff, details, extraInfo } = options;
  const choices = options.actionChoices ?? [
    { key: "y", label: "Accept & Apply" },
    { key: "n", label: "Deny" },
    {
      key: "a",
      label: "Always Allow for this file (persists for active session)",
    },
    { key: "d", label: "Detailed full diff view" },
  ];

  const lines: string[] = [];

  // Top rule with purple accent
  const title = ` ${ansi.accent("⬡")} ${ansi.bold("Authorization Required")} `;
  const topBar =
    ansi.dim("┌─") +
    title +
    ansi.dim("─".repeat(Math.max(0, CARD_WIDTH - 24))) +
    ansi.dim("┐");
  lines.push(topBar);

  // Meta rows
  const toolRow = `  ${ansi.dim("Tool:")}   ${ansi.cyan(tool)}`;
  lines.push(ansi.dim("│") + toolRow);

  if (path) {
    const pathRow = `  ${ansi.dim("Target:")} ${ansi.bold(path)}`;
    lines.push(ansi.dim("│") + pathRow);
  }

  if (extraInfo) {
    for (const [key, val] of Object.entries(extraInfo)) {
      const valStr = typeof val === "string" ? val : JSON.stringify(val);
      lines.push(ansi.dim("│") + `  ${ansi.dim(key + ":")} ${valStr}`);
    }
  }

  // Divider
  lines.push(ansi.dim("├" + "─".repeat(CARD_WIDTH - 2) + "┤"));

  // Diff or details content
  if (diff) {
    const diffLines = diff.split("\n");
    for (const dl of diffLines) {
      lines.push(ansi.dim("│") + " " + dl);
    }
  } else if (details) {
    const detailLines = details.split("\n");
    for (const dl of detailLines) {
      lines.push(ansi.dim("│") + " " + dl);
    }
  }

  // Divider
  lines.push(ansi.dim("├" + "─".repeat(CARD_WIDTH - 2) + "┤"));

  // Action choices
  for (const choice of choices) {
    const keyBadge = ansi.accent(`[${choice.key}]`);
    const labelText = ansi.white(choice.label);
    lines.push(ansi.dim("│") + `  ${keyBadge} ${labelText}`);
  }

  // Bottom rule
  lines.push(ansi.dim("└" + "─".repeat(CARD_WIDTH - 2) + "┘"));

  return lines.join("\n");
}
