import type { ChatModel } from "@odin/ai";
import { MessageBuilder } from "@odin/ai";

import type { AssistantMessage, ToolCall } from "@odin/shared";

import { Conversation } from "./conversation";

import { ToolRegistry, ToolExecutor } from "@odin/tools";
import type { AgentCallbacks } from "./agent-events";

export class AgentExecutor {
  constructor(
    private readonly model: ChatModel,
    private readonly conversation: Conversation,
    private readonly registry: ToolRegistry,
    private readonly toolExecutor: ToolExecutor,
  ) { }

  private async executeToolCall(call: ToolCall, callbacks?: AgentCallbacks) {

    console.log(
      `🔧 Executing tool: ${call.name}`,
    );
    callbacks?.onToolStart?.(call.name);

    const message = await this.toolExecutor.execute(call, {
      onEvent: (event) => callbacks?.onToolEvent?.(call.name, event)
    });

    console.log("✅ Tool result:", message);
    callbacks?.onToolEnd?.(call.name);
    this.conversation.addTool(message);

  }

  private async callModel(callbacks?: AgentCallbacks): Promise<AssistantMessage> {
    const stream = await this.model.chat(
      [...this.conversation.history()],
      this.registry.list(),
    );

    const builder = new MessageBuilder();

    for await (const event of stream) {
      callbacks?.onEvent?.(event);
      builder.consume(event);
    }

    const assistant = builder.build();

    this.conversation.addAssistant(assistant);

    console.log(
      "\n\nAssistant tool calls:",
      assistant.toolCalls,
    );

    return assistant;
  }

  async execute(callbacks?: AgentCallbacks): Promise<AssistantMessage> {
    while (true) {
      console.log(`\n🤖 Calling model... ${process.env.ODIN_MODEL}\n`);
      const assistant = await this.callModel(callbacks);



      if (assistant.toolCalls.length === 0) {
        return assistant;
      }

      for (const call of assistant.toolCalls) {
        await this.executeToolCall(call, callbacks);
      }
      // Loop again with updated conversation
    }
  }
}