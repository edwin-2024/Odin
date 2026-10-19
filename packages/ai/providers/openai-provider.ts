import type { ChatModel } from "../chat-model";
import { EventStream } from "../event-stream";
import type { Message, ToolCall } from "@odin/shared";
import type { Tool } from "@odin/tools";

export interface OpenAIProviderOptions {
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
}

interface InFlightToolCall {
  id: string;
  name: string;
  argsBuffer: string;
}

export class OpenAIProvider implements ChatModel {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly temperature: number;

  constructor(options: OpenAIProviderOptions) {
    this.model = options.model;
    this.apiKey = options.apiKey || process.env.ODIN_API_KEY || process.env.OPENAI_API_KEY || "";
    this.baseURL = (options.baseURL || process.env.ODIN_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.temperature = options.temperature ?? 0.1;
  }

  private toOpenAITools(tools: Tool[]) {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
      },
    }));
  }

  private toOpenAIMessages(messages: Message[]) {
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
            content: message.content || null,
            ...(message.toolCalls.length > 0 && {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: {
                  name: call.name,
                  arguments:
                    typeof call.input === "string"
                      ? call.input
                      : JSON.stringify(call.input),
                },
              })),
            }),
          };
        case "tool":
          return {
            role: "tool",
            tool_call_id: message.toolCallId,
            content: message.content,
          };
        default: {
          const exhaustive: never = message;
          return exhaustive;
        }
      }
    });
  }

  async chat(messages: Message[], tools: Tool[] = []): Promise<EventStream> {
    const stream = new EventStream();

    const url = `${this.baseURL}/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.model,
      stream: true,
      messages: this.toOpenAIMessages(messages),
      temperature: this.temperature,
    };

    if (tools.length > 0) {
      body.tools = this.toOpenAITools(tools);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    (async () => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(
            `OpenAI Provider request failed (${response.status} ${response.statusText}): ${errorText}`
          );
        }

        if (!response.body) {
          throw new Error("OpenAI Provider: Response body is empty.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        const toolCallsByIndex = new Map<number, InFlightToolCall>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep trailing incomplete line in buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) {
              continue;
            }

            const dataStr = trimmed.slice(5).trim();
            if (dataStr === "[DONE]") {
              continue;
            }

            try {
              const chunk = JSON.parse(dataStr);
              const choice = chunk.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta;
              if (!delta) continue;

              // Stream reasoning / thinking (DeepSeek, Groq, vLLM)
              const thinking = delta.reasoning_content || delta.reasoning || delta.thinking;
              if (thinking) {
                stream.push({
                  type: "thinking",
                  delta: thinking,
                });
              }

              // Stream text content
              if (delta.content) {
                stream.push({
                  type: "text",
                  delta: delta.content,
                });
              }

              // Accumulate streaming tool calls
              if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = typeof tc.index === "number" ? tc.index : 0;
                  const existing = toolCallsByIndex.get(idx) ?? {
                    id: tc.id || crypto.randomUUID(),
                    name: "",
                    argsBuffer: "",
                  };
                  if (tc.id && !existing.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name += tc.function.name;
                  if (tc.function?.arguments) existing.argsBuffer += tc.function.arguments;
                  toolCallsByIndex.set(idx, existing);
                }
              }
            } catch {
              // Ignore malformed chunk lines
            }
          }
        }

        // Flush any remaining buffer line after stream EOF
        if (buffer.trim().startsWith("data:")) {
          const dataStr = buffer.trim().slice(5).trim();
          if (dataStr && dataStr !== "[DONE]") {
            try {
              const chunk = JSON.parse(dataStr);
              const delta = chunk.choices?.[0]?.delta;
              if (delta?.content) {
                stream.push({ type: "text", delta: delta.content });
              }
            } catch {
              // Ignore parse error
            }
          }
        }

        // Push accumulated tool calls
        if (toolCallsByIndex.size > 0) {
          for (const [_, item] of Array.from(toolCallsByIndex.entries()).sort(
            (a, b) => a[0] - b[0]
          )) {
            let input: Record<string, unknown> = {};
            if (item.argsBuffer.trim()) {
              try {
                input = JSON.parse(item.argsBuffer);
              } catch {
                input = { raw: item.argsBuffer };
              }
            }

            stream.push({
              type: "tool-call",
              toolCall: {
                id: item.id,
                name: item.name,
                input,
              },
            });
          }
        }

        stream.push({ type: "done" });
      } catch (error) {
        stream.push({
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    })();

    return stream;
  }
}
