import type { AIEvent } from "@odin/shared";

export interface AgentCallbacks {
  onEvent?(event: AIEvent): void;
  onToolStart?(name: string): void;
  onToolEnd?(name: string): void;
}