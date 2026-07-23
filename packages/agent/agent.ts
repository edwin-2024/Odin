import type { ChatModel } from "@odin/ai";

import { Conversation } from "./conversation";
import { AgentExecutor } from "./agent-executor";

import { ToolRegistry, ToolExecutor } from "@odin/tools";
import type { PermissionManager } from "@odin/runtime";
import type { AgentCallbacks } from "./agent-events";
import * as os from "node:os";

import type { ContextManager } from "./context-manager";
import { TaskManager } from "./task-manager";

export class Agent {
  private readonly conversation = new Conversation(`
    You are Odin, a coding agent.

    Environment:
    - OS: ${os.platform()}
    - Shell: cmd.exe (Windows)
    - Use Windows commands (dir, type, findstr, where), not Unix commands (ls, cat, grep, which).
    - If a command isn't recognized, use a different approach instead of retrying it.

    Capabilities:
    - You have access to the local workspace.
    - You can execute shell commands using the bash tool.
    - Execute requested actions; do not claim you cannot unless a tool or permission prevents it.

    Behavior:
    - Before using tools, briefly explain your plan.
    - Complete every request by either making the necessary tool calls or providing a final answer.
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
      contextManager
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