import chalk from "chalk";

// ── Color Palette ──────────────────────────────────────────────

export const c = {
    dim:     chalk.dim,
    bold:    chalk.bold,
    cyan:    chalk.cyan,
    green:   chalk.green,
    red:     chalk.red,
    yellow:  chalk.yellow,
    magenta: chalk.magenta,
    blue:    chalk.blue,
    gray:    chalk.gray,
    white:   chalk.white,
    
    // Semantic colors
    success: chalk.green,
    error:   chalk.red,
    warning: chalk.yellow,
    info:    chalk.cyan,
    muted:   chalk.dim,
    accent:  chalk.hex("#A78BFA"),  // soft purple accent
};

// ── Status Icons ───────────────────────────────────────────────

export function taskIcon(status: string): string {
    switch (status) {
        case "completed": return c.success("✓");
        case "running":   return c.accent("◉");
        case "failed":    return c.error("✗");
        default:          return c.dim("○");
    }
}

// ── Box Drawing ────────────────────────────────────────────────

const BOX_WIDTH = 48;

export function boxTop(title: string): string {
    const titleStr = ` ${title} `;
    const remaining = BOX_WIDTH - 2 - titleStr.length; // -2 for ┌ and ┐
    return c.dim("┌") + c.dim("─") + c.bold(titleStr) + c.dim("─".repeat(Math.max(0, remaining - 1))) + c.dim("┐");
}

export function boxRow(content: string): string {
    return c.dim("│") + " " + content;
}

export function boxBottom(): string {
    return c.dim("└" + "─".repeat(BOX_WIDTH - 2) + "┘");
}

export function horizontalRule(): string {
    return c.dim("─".repeat(BOX_WIDTH));
}

// ── Time Formatting ────────────────────────────────────────────

export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = ((ms % 60_000) / 1000).toFixed(0);
    return `${minutes}m${seconds}s`;
}

// ── Gutter ─────────────────────────────────────────────────────

export const GUTTER = c.dim("│ ");
const GUTTER_BLANK = "  ";
