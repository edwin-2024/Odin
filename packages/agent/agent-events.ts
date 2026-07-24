import type { AIEvent } from "@odin/shared";
import type { ExecutionPlan } from "./planning";


export type ToolEvent = 
    | { phase: "start"; id: string; toolName: string }
    | { phase: "event"; id: string; toolName: string; payload: unknown }
    | { phase: "end"; id: string; toolName: string };

export type AgentEvent =
    | { type: "tool"; payload: ToolEvent }
    | { type: "model"; payload: AIEvent }
    | { type: "plan:set"; plan: ExecutionPlan };

export interface AgentCallbacks {
  onEvent?(event: AgentEvent): void;
}