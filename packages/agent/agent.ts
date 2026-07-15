import type { ChatModel } from "@odin/ai";

import { Conversation } from "./conversation";
import { AgentExecutor } from "./agent-executor";

import { ToolRegistry } from "@odin/tools";
import type { AgentCallbacks } from "./agent-events";

export class Agent {
  private readonly conversation = new Conversation(
    "You are Odin, a coding assistant."
  );

  private readonly executor: AgentExecutor;

  constructor(
    model: ChatModel,
    registry: ToolRegistry,
  ) {
    this.executor = new AgentExecutor(
      model,
      this.conversation,
      registry,
    );
  }

  async send(input: string, callbacks?: AgentCallbacks) {
    this.conversation.addUser(input);

    return this.executor.execute(callbacks);
  }
}