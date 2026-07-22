import type { RuntimeState } from "./state";
import type { TaskManager } from "@odin/agent";
import type { TerminalEvent } from "@odin/runtime/terminal/events";
import logUpdate from "log-update";

export class Renderer {
    private committedIndex = 0;
    private lastEntriesCount = 0;

    constructor(private readonly taskManager: TaskManager) {}

    startTurn() {
        this.committedIndex = 0;
        this.lastEntriesCount = 0;
    }

    reset() {
        logUpdate.done();
        this.committedIndex = this.lastEntriesCount;
    }

    render(state: RuntimeState) {
        this.lastEntriesCount = state.entries.length;
        let output = "";
        
        output += "──────────────────────────\n";
        output += "Tasks\n";
        
        const tasks = this.taskManager.list();
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

        logUpdate(output);
    }
}
