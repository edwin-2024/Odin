import type { RuntimeState } from "./state";
import type { TelemetryMetrics } from "@odin/agent";
import logUpdate from "log-update";
import { c, taskIcon, boxTop, boxRow, boxBottom, formatDuration } from "./theme";
import { Spinner } from "./spinner";

export interface RuntimeSnapshot {
    state: RuntimeState;
    telemetry: TelemetryMetrics;
}

export class Renderer {
    private readonly spinner = new Spinner("dots");
    private snapshot?: RuntimeSnapshot;

    hide() {
        logUpdate.clear();
    }

    freeze() {
        this.spinner.stop();
        logUpdate.done();
    }

    startSpinner() {
        if (!this.spinner.isRunning) {
            this.spinner.start(() => {
                if (this.snapshot) {
                    this.render(this.snapshot);
                }
            });
        }
    }

    stopSpinner() {
        this.spinner.stop();
    }

    render(snapshot: RuntimeSnapshot) {
        this.snapshot = snapshot;
        const { state, telemetry } = snapshot;

        const lines: string[] = [];

        // ── Plan Box ───────────────────────────────────────────
        if (state.plan) {
            lines.push(boxTop("Plan"));
            for (const task of state.plan.tasks) {
                const icon = task.status === "running"
                    ? c.accent(this.spinner.getFrame())
                    : taskIcon(task.status);
                const title = task.status === "running"
                    ? c.white(task.title)
                    : task.status === "completed"
                        ? c.dim(task.title)
                        : task.status === "failed"
                            ? c.red(task.title)
                            : c.dim(task.title);
                lines.push(boxRow(`${icon} ${title}`));
            }
            lines.push(boxBottom());
        } else {
            // Planning phase — no plan yet
            lines.push(boxTop("Plan"));
            lines.push(boxRow(`${c.accent(this.spinner.getFrame())} ${c.dim("Generating plan...")}`));
            lines.push(boxBottom());
        }

        // ── Active Tool Indicator ──────────────────────────────
        if (state.phase === "tool" && state.currentToolName) {
            lines.push(
                `  ${c.info(this.spinner.getFrame())} ${c.dim("Running")} ${c.cyan(state.currentToolName)}${c.dim("...")}`
            );
        }

        // ── Telemetry Summary (compact, dimmed) ────────────────
        if (telemetry.finishedAt) {
            const total = formatDuration(telemetry.totalDurationMs);
            const model = formatDuration(telemetry.modelDurationMs);
            const tools = formatDuration(telemetry.toolWallClockMs);
            lines.push("");
            lines.push(
                c.dim(`  ─ ${total} total · ${telemetry.reasoningIterations} model calls (${model}) · ${telemetry.toolCalls} tools (${tools})`)
            );
        }

        logUpdate(lines.join("\n"));
    }
}
