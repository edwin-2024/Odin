import type { Message } from "@odin/shared";

export function toOllamaMessages(messages: Message[]) {
    return messages.map((message) => {
        switch (message.role) {
            case "system":
                return {
                    role: "system",
                    content: message.content,
                };

            case "user":
                return {
                    role: "user",
                    content: message.content,
                };

            case "assistant":
                return {
                    role: "assistant",
                    content: message.content,

                    ...(message.toolCalls.length > 0 && {
                        tool_calls: message.toolCalls.map((call) => ({
                            function: {
                                name: call.name,
                                arguments: call.input,
                            },
                        })),
                    }),
                };

            case "tool":
                return {
                    role: "tool",

                    content: message.content,

                    tool_call_id: message.toolCallId,
                };

            default: {
                const exhaustive: never = message;
                return exhaustive;
            }
        }
    });
}