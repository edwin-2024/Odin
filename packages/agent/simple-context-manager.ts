import type { ContextManager } from "./context-manager";
import type { Message } from "@odin/shared";

export class SimpleContextManager implements ContextManager {
  constructor(
    private readonly maxMessages = 20
  ) {}

  async prepare(
    messages: Message[]
  ): Promise<Message[]> {
    if (messages.length === 0) {
        return [];
    }
      
    const hasSystem = messages[0]?.role === "system";

    if (!hasSystem) {
      return messages.slice(-this.maxMessages);
    }

    return [
      messages[0],
      ...messages.slice(-(this.maxMessages - 1)),
    ];
  }
}
