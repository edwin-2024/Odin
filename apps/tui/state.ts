import type { TaskManager, AgentEvent } from "@odin/agent";
import type { Task } from "@odin/agent";

export interface ToolExecution {
    toolName: string;
    events: any[];
    status: "running" | "completed";
}

export type OutputEntry = 
    | { type: "text"; text: string }
    | { type: "tool"; toolName: string; events: any[]; status: "running" | "completed" };

export interface RuntimeState {
    currentTask?: Readonly<Task>;
    entries: OutputEntry[];
}

export function createInitialState(): RuntimeState {
    return {
        entries: []
    };
}

export function reducer(state: RuntimeState, event: AgentEvent): RuntimeState {
    const nextState = { ...state };

    switch (event.type) {
        case "task": {
            if (event.payload.type === "task:started") {
                nextState.currentTask = event.payload.task;
            } else if (event.payload.type === "task:completed" || event.payload.type === "task:failed") {
                nextState.currentTask = event.payload.task;
            }
            break;
        }

        case "tool": {
            const { toolName, type, payload } = event.payload;
            
            if (type === "tool:start") {
                nextState.entries.push({ type: "tool", toolName, events: [], status: "running" });
            } else {
                for (let i = nextState.entries.length - 1; i >= 0; i--) {
                    const entry = nextState.entries[i];
                    if (entry && entry.type === "tool" && entry.toolName === toolName && entry.status === "running") {
                        if (type === "tool:event") {
                            entry.events.push(payload);
                        } else if (type === "tool:end") {
                            entry.status = "completed";
                        }
                        break;
                    }
                }
            }
            break;
        }

        case "model": {
            const aiEvent = event.payload;
            if (aiEvent.type === "text" || aiEvent.type === "thinking") {
                const lastEntry = nextState.entries[nextState.entries.length - 1];
                if (lastEntry && lastEntry.type === "text") {
                    lastEntry.text += aiEvent.delta;
                } else {
                    nextState.entries.push({ type: "text", text: aiEvent.delta });
                }
            }
            break;
        }
    }

    return nextState;
}
