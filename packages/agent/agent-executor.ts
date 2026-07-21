import type { ChatModel } from "@odin/ai";
import { MessageBuilder } from "@odin/ai";

import type { AssistantMessage, ToolCall } from "@odin/shared";

import { Conversation } from "./conversation";

import { ToolRegistry, ToolExecutor } from "@odin/tools";
import type { AgentCallbacks } from "./agent-events";

import type { ContextManager } from "./context-manager";

export class AgentExecutor {
  constructor(
    private readonly model: ChatModel,
    private readonly conversation: Conversation,
    private readonly registry: ToolRegistry,
    private readonly toolExecutor: ToolExecutor,
    private readonly contextManager: ContextManager,
  ) { }

  private async executeToolCall(call: ToolCall, callbacks?: AgentCallbacks) {

    console.log(
      `🔧 Executing tool: ${call.name}`,
    );
    callbacks?.onToolStart?.(call.name);

    try {
      const message = await this.toolExecutor.execute(call, {
        onEvent: (event) => callbacks?.onToolEvent?.(call.name, event)
      });

      console.log("✅ Tool result:", message);
      this.conversation.addTool(message);
    } catch (error) {
      console.log(`❌ Tool failed:`, error instanceof Error ? error.message : error);
      this.conversation.addTool({
        role: "tool",
        toolCallId: call.id,
        content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      callbacks?.onToolEnd?.(call.name);
    }

  }

  private async callModel(callbacks?: AgentCallbacks): Promise<AssistantMessage> {
    const history = [...this.conversation.history()];
    const messages = await this.contextManager.prepare(history);

    const stream = await this.model.chat(
      messages,
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