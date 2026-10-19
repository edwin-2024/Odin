import { describe, it, expect } from "bun:test";
import { SimpleContextManager } from "./simple-context-manager";
import type { Message, AssistantMessage, ToolMessage } from "@odin/shared";

describe("SimpleContextManager", () => {
  it("preserves system prompt at index 0", async () => {
    const manager = new SimpleContextManager(3);
    const messages: Message[] = [
      { role: "system", content: "You are Odin" },
      { role: "user", content: "Task 1" },
      { role: "assistant", content: "Done 1", toolCalls: [] },
      { role: "user", content: "Task 2" },
      { role: "assistant", content: "Done 2", toolCalls: [] },
    ];

    const result = await manager.prepare(messages);
    expect(result[0]!.role).toBe("system");
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("never slices into an orphaned tool message", async () => {
    // Budget 3 (1 system + 2 non-system)
    const manager = new SimpleContextManager(3);
    const messages: Message[] = [
      { role: "system", content: "System" },
      { role: "user", content: "Run bash" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "bash", input: { command: "ls" } }],
      },
      { role: "tool", toolCallId: "call_1", content: "file.txt" },
      { role: "assistant", content: "Files found", toolCalls: [] },
      { role: "user", content: "Next prompt" },
      { role: "assistant", content: "Replying", toolCalls: [] },
    ];

    const result = await manager.prepare(messages);
    expect(result[0]!.role).toBe("system");

    // The first non-system message must not be an orphaned tool message
    expect(result[1]!.role).not.toBe("tool");
  });

  it("returns all messages if within budget", async () => {
    const manager = new SimpleContextManager(10);
    const messages: Message[] = [
      { role: "system", content: "Sys" },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello", toolCalls: [] },
    ];

    const result = await manager.prepare(messages);
    expect(result.length).toBe(3);
  });
});
