import type { ToolCall, ToolMessage } from "@odin/shared";

import { ToolRegistry } from "./registry";
import type { PermissionManager } from "@odin/runtime";


export interface ToolCallbacks {
    onEvent?(event: unknown): void;
}

export class ToolExecutor {
    constructor(
        private readonly registry: ToolRegistry,
        private readonly permissions: PermissionManager,
    ) { }

    async execute(call: ToolCall, callbacks?: ToolCallbacks): Promise<ToolMessage> {
        const tool = this.registry.get(call.name);

        const decision = await this.permissions.request({
            tool: call.name,
            input: call.input,
        });

        if (decision === "deny") {
            return {
                role: "tool",
                toolCallId: call.id,
                content: "Execution denied by user.",
            };
        }

        const result = await tool.execute(call.input, {
            onEvent: (event: unknown) => callbacks?.onEvent?.(event)
        });

        return {
            role: "tool",
            toolCallId: call.id,
            content: result.content,
        };
    }
}