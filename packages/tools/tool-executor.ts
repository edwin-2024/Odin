import type { ToolCall, ToolMessage } from "@odin/shared";

import { ToolRegistry } from "./registry";
import type { PermissionManager } from "@odin/runtime";


export interface ToolCallbacks {
    onEvent?(event: 
        | { phase: "start"; id: string; toolName: string }
        | { phase: "event"; id: string; toolName: string; payload: unknown }
        | { phase: "end"; id: string; toolName: string }
    ): void;
}
export interface ToolExecutionContext {
    readonly registry: ToolRegistry;
    readonly permissions: PermissionManager;
    readonly callbacks?: ToolCallbacks;
}

export class ToolExecutor {
    private async executeSingle(call: ToolCall, context: ToolExecutionContext): Promise<ToolMessage> {
        try {
            const tool = context.registry.get(call.name);
            if (!tool) {
                return {
                    role: "tool",
                    toolCallId: call.id,
                    content: `Error: Tool '${call.name}' not found.`,
                };
            }

            const decision = await context.permissions.request({
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

            context.callbacks?.onEvent?.({
                phase: "start",
                id: call.id,
                toolName: call.name
            });

            const result = await tool.execute(call.input, {
                onEvent: (event: unknown) => context.callbacks?.onEvent?.({
                    phase: "event",
                    id: call.id,
                    toolName: call.name,
                    payload: event
                })
            });

            const message: ToolMessage = {
                role: "tool",
                toolCallId: call.id,
                content: result.content,
            };

            return message;

        } catch (error) {
            const errorMessage = `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;

            return {
                role: "tool",
                toolCallId: call.id,
                content: errorMessage,
            };
        } finally {
            context.callbacks?.onEvent?.({
                phase: "end",
                id: call.id,
                toolName: call.name
            });
        }
    }

    async execute(calls: ToolCall[], context: ToolExecutionContext): Promise<ToolMessage[]> {
        const results: ToolMessage[] = new Array(calls.length);
        const parallelPromises: Promise<void>[] = [];

        // 1. Queue Parallel Calls
        for (let i = 0; i < calls.length; i++) {
            const call = calls[i]!;
            const tool = context.registry.get(call.name);

            if (tool?.executionMode === "parallel") {
                parallelPromises.push(
                    this.executeSingle(call, context).then(res => { results[i] = res; })
                );
            }
        }

        // 2. Await all Parallel Calls simultaneously
        await Promise.all(parallelPromises);

        // 3. Execute Serial Calls sequentially
        for (let i = 0; i < calls.length; i++) {
            const call = calls[i]!;
            const tool = context.registry.get(call.name);

            if (!tool || tool.executionMode !== "parallel") {
                results[i] = await this.executeSingle(call, context);
            }
        }

        return results;
    }
}