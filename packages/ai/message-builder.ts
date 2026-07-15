import type {
  AIEvent,
  TextEvent,
  ToolCallEvent,
} from "@odin/shared";

import type {
  AssistantMessage,
  ToolCall,
} from "@odin/shared";

export class MessageBuilder {
  private content = "";

  private toolCalls: ToolCall[] = [];

  consume(event: AIEvent): void {
    switch (event.type) {
      case "text":
        this.consumeText(event);
        break;

      case "tool-call":
        this.consumeToolCall(event);
        break;

      case "done":
      case "error":
        break;

      default:
        this.assertNever(event);
    }
  }

  build(): AssistantMessage {
    return {
      role: "assistant",
      content: this.content,
      toolCalls: [...this.toolCalls],
    };
  }

  private consumeText(event: TextEvent) {
    this.content += event.delta;
  }

  private consumeToolCall(event: ToolCallEvent) {
    this.toolCalls.push(event.toolCall);
  }

  private assertNever(value: never): never {
    throw new Error(`Unhandled event: ${JSON.stringify(value)}`);
  }
}