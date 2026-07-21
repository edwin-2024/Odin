import ollama from "ollama";

import type { ChatModel } from "../chat-model";
import { EventStream } from "../event-stream";

import type { Message, ToolCall } from "../../shared/messages";
import type { Tool } from "../../tools/tool";
import { toOllamaMessages } from "./mapper";

export class OllamaProvider implements ChatModel {
  constructor(private readonly model: string) { }

  private toOllamaTools(tools: Tool[]) {
    return tools.map((tool) => ({
      type: "function" as const,

      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
      },
    }));
  }

  async chat(
    messages: Message[],
    tools: Tool[] = []
  ): Promise<EventStream> {
    const stream = new EventStream();

    const response = await ollama.chat({
      model: this.model,
      stream: true,

      messages: toOllamaMessages(messages),

      tools: this.toOllamaTools(tools) as any,

      options: {
        num_ctx: 32768,
        temperature: 0.1
      }
    });

    (async () => {
      try {
        let isThinking = false;

        for await (const chunk of response) {
          // Stream thinking
          const thinking = (chunk.message as any).thinking;
          
          if (thinking) {
            if (!isThinking) {
              isThinking = true;
              stream.push({ type: "thinking", delta: `\x1b[90m> Thinking...\n` });
            }
            stream.push({ type: "thinking", delta: thinking });
          } else if (isThinking) {
            isThinking = false;
            stream.push({ type: "thinking", delta: `\n> ...done thinking.\x1b[0m\n\n` });
          }

          // Stream text
          const delta = chunk.message.content;

          if (delta) {
            stream.push({
              type: "text",
              delta,
            });
          }

          // Stream tool calls
          const toolCalls = chunk.message.tool_calls;

          if (toolCalls) {
            for (const call of toolCalls) {
              stream.push({
                type: "tool-call",

                toolCall: {
                  id: crypto.randomUUID(),

                  name: call.function.name,

                  input: call.function.arguments as Record<string, unknown>,
                },
              });
            }
          }
        }

        stream.push({
          type: "done",
        });
      } catch (error) {
        stream.push({
          type: "error",
          error:
            error instanceof Error
              ? error
              : new Error(String(error)),
        });
      }
    })();

    return stream;
  }
}