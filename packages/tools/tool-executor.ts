import type { ToolCall, ToolMessage } from "@odin/shared";

import { ToolRegistry } from "./registry";

export class ToolExecutor {
    constructor(
        private readonly registry: ToolRegistry,
    ) { }

    async execute(call: ToolCall): Promise<ToolMessage> {
        const tool = this.registry.get(call.name);

        const result = await tool.execute(call.input);

        return {
            role: "tool",
            toolCallId: call.id,
            content: result.content,
        };
    }
}