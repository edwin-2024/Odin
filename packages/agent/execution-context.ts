import type { Conversation } from "./conversation";
import type { AgentCallbacks } from "./agent-events";
import type { ToolRegistry } from "@odin/tools";
import type { PermissionManager } from "@odin/runtime";

import type { TaskManager } from "./task-manager";

export interface ExecutionContext {
    readonly conversation: Conversation;
    readonly registry: ToolRegistry;
    readonly permissions: PermissionManager;
    readonly callbacks?: AgentCallbacks;
    readonly taskManager: TaskManager;
}
