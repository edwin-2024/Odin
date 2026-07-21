import type { ToolCall } from "./messages";

export type AIEvent = TextEvent | ToolCallEvent | DoneEvent | ErrorEvent | ThinkingEvent;

export interface TextEvent {
  type: "text";

  delta: string;
}

export interface ThinkingEvent {
  type: "thinking";

  delta: string;
}

export interface ToolCallEvent {
  type: "tool-call";

  toolCall: ToolCall;
}

export interface DoneEvent {
  type: "done";
}

export interface ErrorEvent {
  type: "error";

  error: Error;
}
