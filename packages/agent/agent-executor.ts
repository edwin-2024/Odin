import type { ChatModel } from "@odin/ai";
import { MessageBuilder } from "@odin/ai";

import type { AssistantMessage, ToolCall } from "@odin/shared";

import { Conversation } from "./conversation";

import { ToolRegistry, ToolExecutor } from "@odin/tools";
import type { AgentCallbacks } from "./agent-events";
import type { ContextManager } from "./context-manager";
import type { ExecutionContext } from "./execution-context";

export class AgentExecutor {
  constructor(
    private readonly model: ChatModel,
    private readonly toolExecutor: ToolExecutor,
    private readonly contextManager: ContextManager,
  ) { }

  private async callModel(context: ExecutionContext): Promise<AssistantMessage> {
    const history = [...context.conversation.history()];
    const messages = await this.contextManager.prepare(history);

    const stream = await this.model.chat(
      messages,
      context.registry.list(),
    );

    const builder = new MessageBuilder();

    for await (const event of stream) {
      context.callbacks?.onEvent?.({ type: "model", payload: event });
      builder.consume(event);
    }

    const assistant = builder.build();

    context.conversation.addAssistant(assistant);

    return assistant;
  }

  async execute(context: ExecutionContext): Promise<AssistantMessage> {
    while (true) {
      
      const modelTask = context.taskManager.start("Calling language model");
      
      let assistant: AssistantMessage;
      try {
          assistant = await this.callModel(context);
          modelTask.complete();
      } catch (e) {
          modelTask.fail(e);
          throw e;
      }

      if (assistant.toolCalls.length === 0) {
        return assistant;
      }

      const toolTask = context.taskManager.start("Executing tools");

      let toolMessages;
      try {
          toolMessages = await this.toolExecutor.execute(assistant.toolCalls, {
            registry: context.registry,
            permissions: context.permissions,
            callbacks: {
              onEvent: (toolEvent) => context.callbacks?.onEvent?.({
                type: "tool",
                payload: toolEvent
              })
            }
          });
          toolTask.complete();
      } catch (e) {
          toolTask.fail(e);
          throw e;
      }

      for (const message of toolMessages) {
        context.conversation.addTool(message);
      }

      // Loop again with updated conversation
    }
  }
}