import type { AgentEvent } from "@odin/agent";
import type { ExecutionPlan } from "@odin/agent/planning";

interface ToolExecution {
    id: string;
    toolName: string;
    startedAt: number;
    finishedAt?: number;
}

type Phase = "idle" | "planning" | "thinking" | "tool" | "done";

export interface RuntimeState {
    plan?: ExecutionPlan;
    phase: Phase;
    currentToolName?: string;
    runningTools: Map<string, ToolExecution>;
    completedTools: ToolExecution[];
}

export function createInitialState(): RuntimeState {
    return {
        phase: "planning",
        runningTools: new Map(),
        completedTools: []
    };
}

export function reducer(state: RuntimeState, event: AgentEvent): RuntimeState {
    const nextState = { ...state };

    switch (event.type) {
        case "plan:set": {
            nextState.plan = event.plan;
            nextState.phase = "idle";
            break;
        }

        case "tool": {
            const { phase, id, toolName } = event.payload;
            
            if (phase === "start") {
                nextState.runningTools = new Map(state.runningTools);
                nextState.runningTools.set(id, { id, toolName, startedAt: Date.now() });
                nextState.currentToolName = toolName;
                nextState.phase = "tool";
            } else if (phase === "end") {
                const execution = state.runningTools.get(id);
                if (execution) {
                    nextState.runningTools = new Map(state.runningTools);
                    nextState.runningTools.delete(id);
                    
                    nextState.completedTools = [...state.completedTools, { ...execution, finishedAt: Date.now() }];
                }
                if (nextState.runningTools.size === 0) {
                    nextState.phase = "thinking";
                    nextState.currentToolName = undefined;
                }
            }
            break;
        }

        case "model": {
            if (event.payload.type === "thinking" || event.payload.type === "text") {
                nextState.phase = "thinking";
            } else if (event.payload.type === "done" || event.payload.type === "error") {
                nextState.phase = "idle";
            }
            break;
        }
    }

    return nextState;
}
