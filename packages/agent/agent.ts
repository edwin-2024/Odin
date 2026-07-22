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
  private readonly conversation = new Conversation(
    `You are Odin, a powerful coding agent. 
    You are currently running on a ${os.platform()} machine — this means 
    you are on Windows, using cmd.exe as your shell. Unix commands like 
    ls, grep, find, head, and which do NOT exist here. Use Windows 
    equivalents instead: 'dir' instead of 'ls', 'type' instead of 'cat', 
    'findstr' instead of 'grep', 'where' instead of 'which'.
    If a shell command fails with "not recognized", do not repeat the 
    same command or a close variant — switch to a different approach 
    immediately.
    You have full access to the local environment and the 'bun' tool via 
    your bash tool.
    Always execute shell commands when asked, do not refuse or claim you 
    cannot.
    CRITICAL INSTRUCTION: You must ALWAYS explain your reasoning, plan, 
    and thought process out loud before making any tool calls so the user 
    can see your thinking. Do not silently call tools.
    You must NEVER stop your turn midway through. You must either make a tool 
    call, or provide a final answer to the user.`
  );

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