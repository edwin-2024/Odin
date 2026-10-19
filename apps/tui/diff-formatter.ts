export type {
  DiffLineType,
  DiffLine,
  DiffHunk,
  UnifiedDiff,
  FormatDiffOptions,
  PermissionCardOptions,
} from "@odin/runtime";

export {
  applyEditToFile,
  computeUnifiedDiff,
  generateEditDiff,
  generateWriteDiff,
  formatUnifiedDiff,
  renderPermissionCard,
  ansi,
} from "@odin/runtime";

import {
  type UnifiedDiff,
  type FormatDiffOptions,
  type PermissionCardOptions,
  formatUnifiedDiff,
  renderPermissionCard,
} from "@odin/runtime";
import { c, diffTheme } from "./theme";

/**
 * Convenience helper to format a unified diff preview for TUI display.
 */
export function formatDiffPreview(
  diff: UnifiedDiff,
  options: FormatDiffOptions = {},
): string {
  return formatUnifiedDiff(diff, {
    detailed: false,
    maxLines: options.maxLines ?? 15,
    colorize: options.colorize ?? true,
  });
}

/**
 * Convenience helper to render the Variant A authorization card for TUI display.
 */
export function createPermissionCard(options: PermissionCardOptions): string {
  return renderPermissionCard(options);
}
