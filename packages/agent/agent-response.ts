import type { AssistantMessage } from "@odin/shared";
import type { EventStream } from "@odin/ai";

export interface AgentResponse {
  stream: EventStream;
  complete: Promise<AssistantMessage>;
}