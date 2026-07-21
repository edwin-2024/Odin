import type { Message } from "@odin/shared";

export interface ContextManager {
  prepare(messages: Message[]): Promise<Message[]>;
}
