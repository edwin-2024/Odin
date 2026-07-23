import type { AIEvent } from "@odin/shared";
import type { Task } from "./task";

export type TaskEvent = 
    | { phase: "start"; task: Readonly<Task> }
    | { phase: "complete"; task: Readonly<Task> }
    | { phase: "fail"; task: Readonly<Task>; error?: unknown };

export type ToolEvent = 
    | { phase: "start"; id: string; toolName: string }
    | { phase: "event"; id: string; toolName: string; payload: unknown }
    | { phase: "end"; id: string; toolName: string };

export type AgentEvent =
    | { type: "task"; payload: TaskEvent }
    | { type: "tool"; payload: ToolEvent }
    | { type: "model"; payload: AIEvent };

export interface AgentCallbacks {
  onEvent?(event: AgentEvent): void;
}