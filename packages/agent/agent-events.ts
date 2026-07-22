import type { AIEvent } from "@odin/shared";
import type { Task } from "./task";

export interface TaskEvent {
    type: "task:started" | "task:completed" | "task:failed";
    task: Readonly<Task>;
}

export interface ToolEvent {
    type: "tool:start" | "tool:end" | "tool:event";
    toolName: string;
    payload?: unknown;
}

export interface ModelEvent {
    type: "model";
    payload: AIEvent;
}

export type AgentEvent =
    | { type: "task"; payload: TaskEvent }
    | { type: "tool"; payload: ToolEvent }
    | { type: "model"; payload: AIEvent };

export interface AgentCallbacks {
  onEvent?(event: AgentEvent): void;
}