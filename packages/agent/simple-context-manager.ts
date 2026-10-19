import type { ContextManager } from "./context-manager";
import type { Message, AssistantMessage } from "@odin/shared";

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

    const systemMessage = messages[0]?.role === "system" ? messages[0] : undefined;
    const nonSystem = systemMessage ? messages.slice(1) : [...messages];

    const budget = systemMessage ? Math.max(1, this.maxMessages - 1) : this.maxMessages;
    if (nonSystem.length <= budget) {
      return systemMessage ? [systemMessage, ...nonSystem] : nonSystem;
    }

    // Determine initial slice point
    let startIndex = nonSystem.length - budget;

    // Never slice into the middle of a tool call transaction.
    // If startIndex points to an orphaned tool message or an incomplete assistant toolCall,
    // advance until we find a clean turn boundary (typically a user message).
    while (startIndex < nonSystem.length) {
      const msg = nonSystem[startIndex];
      if (!msg) break;

      // Cannot start on a tool message (orphaned tool response without preceding assistant)
      if (msg.role === "tool") {
        startIndex++;
        continue;
      }

      // If starting on an assistant message that has toolCalls, advance to start from a clean turn
      if (msg.role === "assistant" && (msg as AssistantMessage).toolCalls?.length > 0) {
        startIndex++;
        continue;
      }

      break;
    }

    // If we skipped the entire window trying to avoid orphans, keep at least the last non-system message
    if (startIndex >= nonSystem.length && nonSystem.length > 0) {
      startIndex = nonSystem.length - 1;
    }

    const sliced = nonSystem.slice(startIndex);
    return systemMessage ? [systemMessage, ...sliced] : sliced;
  }
}
