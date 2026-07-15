import type { AIEvent } from "@odin/shared";
import { MessageBuilder } from "@odin/ai";
import type { EventStream } from "@odin/ai";
import type { AssistantMessage } from "@odin/shared";

export class AgentRunner {
  private readonly builder = new MessageBuilder();

  constructor(
    private readonly stream: EventStream,
    private readonly onEvent?: (event: AIEvent) => void
  ) {}

  async run(): Promise<AssistantMessage> {
    for await (const event of this.stream) {
      this.onEvent?.(event);

      this.builder.consume(event);
    }

    return this.builder.build();
  }
}