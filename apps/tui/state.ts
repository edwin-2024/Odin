import type { TaskManager, AgentEvent } from "@odin/agent";
import type { Task } from "@odin/agent";

export interface ToolExecution {
    id: string;
    toolName: string;
}

export interface RuntimeState {
    currentTask?: Readonly<Task>;
    tasks: Map<string, Readonly<Task>>;
    runningTools: Map<string, ToolExecution>;
    completedTools: ToolExecution[];
}

export function createInitialState(): RuntimeState {
    return {
        tasks: new Map(),
        runningTools: new Map(),
        completedTools: []
    };
}

export function reducer(state: RuntimeState, event: AgentEvent): RuntimeState {
    // Redux-style shallow copy of state maps/arrays if we modify them
    const nextState = { ...state };

    switch (event.type) {
        case "task": {
            const { phase, task } = event.payload;
            
            // Clone the tasks map so React-style pure renders can detect change
            nextState.tasks = new Map(state.tasks);
            nextState.tasks.set(task.id, task);

            if (phase === "start") {
                nextState.currentTask = task;
            } else if (phase === "complete" || phase === "fail") {
                nextState.currentTask = task;
            }
            break;
        }

        case "tool": {
            const { phase, id, toolName } = event.payload;
            
            if (phase === "start") {
                nextState.runningTools = new Map(state.runningTools);
                nextState.runningTools.set(id, { id, toolName });
            } else if (phase === "end") {
                const execution = state.runningTools.get(id);
                if (execution) {
                    nextState.runningTools = new Map(state.runningTools);
                    nextState.runningTools.delete(id);
                    
                    nextState.completedTools = [...state.completedTools, execution];
                }
            }
            // For 'event' phase we don't modify state in this minimal normalized view,
            // but we could store outputs here if needed.
            break;
        }

        case "model": {
            // Text events are streamed directly to stdout, no state mutation required
            break;
        }
    }

    return nextState;
}
