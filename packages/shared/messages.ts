export type Role =
  | "system"
  | "user"
  | "assistant"
  | "tool";

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface BaseMessage {
  role: Role;
}

export interface SystemMessage extends BaseMessage {
  role: "system";
  content: string;
}

export interface UserMessage extends BaseMessage {
  role: "user";
  content: string;
}

export interface ToolMessage extends BaseMessage {
  role: "tool";
  toolCallId: string;
  content: string;
}

export interface AssistantMessage extends BaseMessage {
  role: "assistant";
  content: string;
  toolCalls: ToolCall[];
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;