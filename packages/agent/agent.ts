import type { ChatModel } from "@odin/ai";

import { Conversation } from "./conversation";
import { AgentExecutor } from "./agent-executor";

import { ToolRegistry, ToolExecutor } from "@odin/tools";
import type { PermissionManager } from "@odin/runtime";
import type { AgentCallbacks } from "./agent-events";
import * as os from "node:os";

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
    cannot.`
  );

  private readonly executor: AgentExecutor;

  constructor(
    model: ChatModel,
    registry: ToolRegistry,
    permissions: PermissionManager,
  ) {
    this.executor = new AgentExecutor(
      model,
      this.conversation,
      registry,
      new ToolExecutor(registry, permissions)
    );
  }

  async send(input: string, callbacks?: AgentCallbacks) {
    this.conversation.addUser(input);

    return this.executor.execute(callbacks);
  }
}