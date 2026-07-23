import type { RuntimeState } from "./state";
import type { TelemetryMetrics } from "@odin/agent";
import logUpdate from "log-update";

export interface RuntimeSnapshot {
    state: RuntimeState;
    telemetry: TelemetryMetrics;
}

export class Renderer {
    hide() {
        logUpdate.clear();
    }

    freeze() {
        logUpdate.done();
    }

    render(snapshot: RuntimeSnapshot) {
        let output = "";
        
        output += "──────────────────────────\n";
        output += "Tasks\n";
        
        const tasks = [...snapshot.state.tasks.values()];
        for (const task of tasks) {
            let icon = " ";
            if (task.status === "running") icon = "▶";
            else if (task.status === "completed") icon = "✓";
            else if (task.status === "failed") icon = "✗";

            let durationStr = "";
            if (task.startedAt) {
                const end = task.completedAt || new Date();
                const ms = end.getTime() - task.startedAt.getTime();
                durationStr = ` (${ms} ms)`;
            }

            output += `${icon} ${task.description}${durationStr}\n`;
        }
        
        output += "──────────────────────────\n";

        // Render Telemetry Summary if the turn is finished
        if (snapshot.telemetry.finishedAt) {
            output += `Total Duration: ${snapshot.telemetry.totalDurationMs} ms\n`;
            output += `Language Model: ${snapshot.telemetry.modelDurationMs} ms (${snapshot.telemetry.reasoningIterations} calls)\n`;
            output += `Tools Executed: ${snapshot.telemetry.toolCalls} (${snapshot.telemetry.toolWallClockMs} ms wall-clock, ${snapshot.telemetry.toolAccumulatedMs} ms accumulated)\n`;
            output += "──────────────────────────\n";
        }

        logUpdate(output);
    }
}
