import type { ChatModel } from "@odin/ai";

import { Conversation } from "./conversation";
import { AgentExecutor } from "./agent-executor";

import { ToolRegistry, ToolExecutor } from "@odin/tools";
import type { PermissionManager } from "@odin/runtime";
import type { AgentCallbacks } from "./agent-events";
import type { ContextManager } from "./context-manager";
import { TaskManager } from "./task-manager";
import { LLMPlanner } from "./planning";

export class Agent {
  private readonly conversation = new Conversation(`
    You are Odin, a coding agent.

    Capabilities:
    - You have access to the local workspace.
    - Execute requested actions; do not claim you cannot unless a tool or permission prevents it.

    Behavior:
    - Before using tools, briefly explain your reasoning for the current task.
    - You are a task-execution agent. The user's message is overarching context. You must ONLY focus on completing the 'Current Task' assigned to you.
`);


  private readonly executor: AgentExecutor;
  public readonly taskManager = new TaskManager();

  constructor(
    private readonly model: ChatModel,
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionManager,
    private readonly contextManager: ContextManager,
  ) {
    this.executor = new AgentExecutor(
      model,
      new ToolExecutor(),
      contextManager,
      new LLMPlanner(model)
    );
  }

  clear(): void {
    this.conversation.clear();
    this.taskManager.clear();
  }

  async send(input: string, callbacks?: AgentCallbacks) {
    this.conversation.addUser(input);

    this.taskManager.emit = (event) => callbacks?.onEvent?.(event);

    return this.executor.execute({
      conversation: this.conversation,
      registry: this.registry,
      permissions: this.permissions,
      callbacks,
      taskManager: this.taskManager,
    });
  }
}