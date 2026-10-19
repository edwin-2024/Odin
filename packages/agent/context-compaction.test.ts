import { describe, it, expect } from "bun:test";
import {
  CompactingContextManager,
  HeuristicTokenEstimator,
  defaultTokenEstimator,
} from "./index";
import type { Message, AssistantMessage, ToolMessage } from "@odin/shared";

describe("CompactingContextManager & Token Management", () => {
  describe("Token Budget Estimation", () => {
    it("estimates string tokens accurately", () => {
      const estimator = new HeuristicTokenEstimator(4); // 4 chars per token
      expect(estimator.estimateTokens("")).toBe(0);
      expect(estimator.estimateTokens("test")).toBe(1);
      expect(estimator.estimateTokens("12345678")).toBe(2);
      expect(estimator.estimateTokens("123456789")).toBe(3);
    });

    it("estimates message tokens accounting for role, content, and framing", () => {
      const estimator = new HeuristicTokenEstimator(4);

      const userMsg: Message = { role: "user", content: "Hello world" }; // 11 chars -> 3 tokens + 4 framing + 1 role = 8
      const userTokens = estimator.estimateMessageTokens(userMsg);
      expect(userTokens).toBeGreaterThan(0);

      const systemMsg: Message = { role: "system", content: "You are Odin" };
      expect(estimator.estimateMessageTokens(systemMsg)).toBeGreaterThan(0);
    });

    it("accurately estimates tool call and tool response message tokens", () => {
      const estimator = new HeuristicTokenEstimator(4);

      const assistantToolMsg: AssistantMessage = {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_abc",
            name: "read_file",
            input: { path: "src/index.ts" },
          },
        ],
      };

      const toolMsg: ToolMessage = {
        role: "tool",
        toolCallId: "call_abc",
        content: "const x = 1;",
      };

      const assistantTokens = estimator.estimateMessageTokens(assistantToolMsg);
      const toolTokens = estimator.estimateMessageTokens(toolMsg);

      expect(assistantTokens).toBeGreaterThan(10);
      expect(toolTokens).toBeGreaterThan(5);

      const totalTokens = estimator.estimateMessagesTokens([
        assistantToolMsg,
        toolMsg,
      ]);
      // Includes priming overhead (+3)
      expect(totalTokens).toBe(assistantTokens + toolTokens + 3);
    });

    it("defaults to 24,000 tokens budget and 75% threshold", () => {
      const manager = new CompactingContextManager();
      expect(manager.getTokenBudget()).toBe(24_000);
      expect(manager.getThresholdTokens()).toBe(18_000); // 75% of 24_000
    });

    it("accepts custom token budget and threshold", () => {
      const manager = new CompactingContextManager({
        maxTokens: 10_000,
        compactThreshold: 0.8,
      });
      expect(manager.getTokenBudget()).toBe(10_000);
      expect(manager.getThresholdTokens()).toBe(8_000);
    });
  });

  describe("Invariant 1: Preservation of system prompt at index 0 under heavy compaction", () => {
    it("always preserves system prompt at index 0 even under aggressive compaction", async () => {
      // Very tight budget (400 tokens) with large multi-turn conversation
      const manager = new CompactingContextManager({
        maxTokens: 400,
        compactThreshold: 0.5, // 200 tokens threshold
        minRecentTurns: 2,
      });

      const systemPrompt =
        "You are Odin, a software engineering agent with strict rules.";
      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: "Task 1: Search the codebase for configurations.",
        },
        {
          role: "assistant",
          content: "Searching codebase now.",
          toolCalls: [{ id: "c1", name: "list_dir", input: { path: "." } }],
        },
        {
          role: "tool",
          toolCallId: "c1",
          content: Array.from({ length: 50 }, (_, i) => `file_${i}.ts`).join(
            "\n",
          ),
        },
        { role: "assistant", content: "Found directory files.", toolCalls: [] },
        { role: "user", content: "Task 2: Read the main configuration file." },
        {
          role: "assistant",
          content: "Reading configuration file.",
          toolCalls: [
            { id: "c2", name: "read_file", input: { path: "config.json" } },
          ],
        },
        {
          role: "tool",
          toolCallId: "c2",
          content: JSON.stringify(
            { name: "odin", version: "1.0.0", settings: { debug: true } },
            null,
            2,
          ),
        },
        {
          role: "assistant",
          content: "Read configuration successfully.",
          toolCalls: [],
        },
        { role: "user", content: "Task 3: Run the test suite." },
        { role: "assistant", content: "Running tests.", toolCalls: [] },
      ];

      const result = await manager.prepare(messages);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.role).toBe("system");
      expect(result[0]!.content).toBe(systemPrompt);
    });

    it("preserves system prompt when conversation only contains system message", async () => {
      const manager = new CompactingContextManager();
      const messages: Message[] = [
        { role: "system", content: "System prompt only" },
      ];
      const result = await manager.prepare(messages);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("system");
      expect(result[0]!.content).toBe("System prompt only");
    });
  });

  describe("Invariant 2: Atomic retention of tool call & tool result pairs", () => {
    it("never separates an assistant tool_calls message from its tool response message", async () => {
      const manager = new CompactingContextManager({
        maxTokens: 500,
        compactThreshold: 0.6,
        minRecentTurns: 2,
      });

      const messages: Message[] = [
        { role: "system", content: "You are Odin" },
        { role: "user", content: "Inspect tools" },
        {
          role: "assistant",
          content: "Executing bash command",
          toolCalls: [
            { id: "bash_1", name: "bash", input: { command: "echo step1" } },
          ],
        },
        { role: "tool", toolCallId: "bash_1", content: "step1 output" },
        { role: "assistant", content: "Step 1 complete", toolCalls: [] },
        { role: "user", content: "Now run step 2" },
        {
          role: "assistant",
          content: "Executing second command",
          toolCalls: [
            { id: "call_a", name: "read_file", input: { path: "a.txt" } },
            { id: "call_b", name: "read_file", input: { path: "b.txt" } },
          ],
        },
        { role: "tool", toolCallId: "call_a", content: "content of a" },
        { role: "tool", toolCallId: "call_b", content: "content of b" },
        { role: "assistant", content: "Step 2 done", toolCalls: [] },
        { role: "user", content: "Final prompt" },
        { role: "assistant", content: "All done", toolCalls: [] },
      ];

      const result = await manager.prepare(messages);

      // Verify every tool message in result has a preceding assistant message with matching toolCallId
      for (let i = 0; i < result.length; i++) {
        const msg = result[i]!;
        if (msg.role === "tool") {
          const toolMsg = msg as ToolMessage;
          const prevMsg = result[i - 1];
          // Either the immediately preceding message is the assistant that called it,
          // or another tool message from the same multi-tool call batch
          expect(prevMsg).toBeDefined();

          let foundCallingAssistant = false;
          for (let j = i - 1; j >= 0; j--) {
            const candidate = result[j]!;
            if (candidate.role === "assistant") {
              const assistant = candidate as AssistantMessage;
              if (
                assistant.toolCalls?.some((tc) => tc.id === toolMsg.toolCallId)
              ) {
                foundCallingAssistant = true;
                break;
              }
            } else if (candidate.role !== "tool") {
              break;
            }
          }
          expect(foundCallingAssistant).toBe(true);
        }

        // Verify every assistant message with toolCalls has its tool results in result
        if (msg.role === "assistant") {
          const assistant = msg as AssistantMessage;
          if (assistant.toolCalls && assistant.toolCalls.length > 0) {
            for (const call of assistant.toolCalls) {
              const matchingTool = result
                .slice(i + 1)
                .find(
                  (m) =>
                    m.role === "tool" &&
                    (m as ToolMessage).toolCallId === call.id,
                );
              expect(matchingTool).toBeDefined();
            }
          }
        }
      }
    });

    it("discards orphaned tool messages that have no preceding assistant message", async () => {
      const manager = new CompactingContextManager({
        maxTokens: 1000,
      });

      const messages: Message[] = [
        { role: "system", content: "Sys" },
        { role: "tool", toolCallId: "orphan_call", content: "orphan output" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi", toolCalls: [] },
      ];

      const result = await manager.prepare(messages);

      // Orphan tool message must not be present
      expect(result.some((m) => m.role === "tool")).toBe(false);
      expect(result.some((m) => m.role === "user")).toBe(true);
      expect(result.some((m) => m.role === "assistant")).toBe(true);
    });
  });

  describe("Boundary behavior with large tool payloads (e.g. 100+ line read_file)", () => {
    it("condenses 100+ line read_file payloads in intermediate turns while preserving toolCallId", async () => {
      const manager = new CompactingContextManager({
        maxTokens: 2000,
        compactThreshold: 0.5, // 1000 tokens
        minRecentTurns: 2,
        maxIntermediateToolTokens: 100,
        condenseHeadLines: 5,
        condenseTailLines: 5,
      });

      // Generate a 150-line file payload
      const largeFileContent = Array.from(
        { length: 150 },
        (_, i) =>
          `export const variable_${i} = "sample code line ${i} with substantial length";`,
      ).join("\n");

      const messages: Message[] = [
        { role: "system", content: "You are Odin" },
        { role: "user", content: "Inspect big-file.ts" },
        {
          role: "assistant",
          content: "Reading big-file.ts",
          toolCalls: [
            {
              id: "call_read_150",
              name: "read_file",
              input: { path: "big-file.ts" },
            },
          ],
        },
        {
          role: "tool",
          toolCallId: "call_read_150",
          content: largeFileContent,
        },
        {
          role: "assistant",
          content: "I have examined the file.",
          toolCalls: [],
        },
        // Recent turns (minRecentTurns = 2)
        { role: "user", content: "What is your conclusion?" },
        {
          role: "assistant",
          content: "The file contains 150 exported variables.",
          toolCalls: [],
        },
      ];

      const originalTokens =
        defaultTokenEstimator.estimateMessagesTokens(messages);
      expect(originalTokens).toBeGreaterThan(1500);

      const result = await manager.prepare(messages);
      const compactedTokens =
        defaultTokenEstimator.estimateMessagesTokens(result);

      // Must be compacted to fit comfortably
      expect(compactedTokens).toBeLessThan(originalTokens);

      // System prompt preserved at index 0
      expect(result[0]!.role).toBe("system");

      // Check the tool message in result
      const toolMsg = result.find((m) => m.role === "tool") as
        ToolMessage | undefined;
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.toolCallId).toBe("call_read_150");
      expect(toolMsg!.content).toContain(
        "lines omitted / tool output condensed for context budget",
      );
      expect(toolMsg!.content).toContain("variable_0");
      expect(toolMsg!.content).toContain("variable_149");

      // Verify line count is drastically reduced from 150 lines to ~11 lines
      const resultLines = toolMsg!.content.split("\n");
      expect(resultLines.length).toBeLessThan(20);
    });

    it("handles large single-line payload without newlines (e.g. minified payload)", async () => {
      const manager = new CompactingContextManager({
        maxTokens: 1500,
        compactThreshold: 0.5,
        minRecentTurns: 2,
        maxIntermediateToolTokens: 100,
      });

      const massivePayload = "A".repeat(4000);

      const messages: Message[] = [
        { role: "system", content: "You are Odin" },
        { role: "user", content: "Fetch data" },
        {
          role: "assistant",
          content: "Fetching",
          toolCalls: [{ id: "c_min", name: "fetch", input: {} }],
        },
        {
          role: "tool",
          toolCallId: "c_min",
          content: massivePayload,
        },
        { role: "assistant", content: "Fetched data.", toolCalls: [] },
        { role: "user", content: "Process it" },
        { role: "assistant", content: "Processing completed.", toolCalls: [] },
      ];

      const result = await manager.prepare(messages);
      const toolMsg = result.find((m) => m.role === "tool") as
        ToolMessage | undefined;
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.toolCallId).toBe("c_min");
      expect(toolMsg!.content).toContain(
        "characters condensed for context budget",
      );
      expect(toolMsg!.content.length).toBeLessThan(massivePayload.length);
    });
  });

  describe("Invariant 3: Verbatim retention of recent conversational turns", () => {
    it("preserves minimum last 4 turns completely verbatim", async () => {
      const manager = new CompactingContextManager({
        maxTokens: 2500,
        compactThreshold: 0.6,
        minRecentTurns: 4,
      });

      const messages: Message[] = [
        { role: "system", content: "You are Odin" },
        // Older intermediate turn 1
        { role: "user", content: "Old Turn 1: Check status" },
        { role: "assistant", content: "Status is active.", toolCalls: [] },
        // Older intermediate turn 2
        { role: "user", content: "Old Turn 2: Run build" },
        {
          role: "assistant",
          content: "Building",
          toolCalls: [
            { id: "b1", name: "bash", input: { command: "turbo build" } },
          ],
        },
        {
          role: "tool",
          toolCallId: "b1",
          content: Array.from({ length: 40 }, (_, i) => `build log ${i}`).join(
            "\n",
          ),
        },
        { role: "assistant", content: "Build succeeded.", toolCalls: [] },

        // Recent Turn 1 (4th from end)
        { role: "user", content: "Recent Turn 1: Check git diff" },
        // Recent Turn 2 (3rd from end)
        {
          role: "assistant",
          content: "Running git diff",
          toolCalls: [{ id: "g1", name: "git_diff", input: {} }],
        },
        {
          role: "tool",
          toolCallId: "g1",
          content: "+ added line 1\n+ added line 2",
        },
        // Recent Turn 3 (2nd from end)
        { role: "assistant", content: "Diff checked.", toolCalls: [] },
        // Recent Turn 4 (1st from end)
        { role: "user", content: "Recent Turn 4: Final confirmation" },
      ];

      const result = await manager.prepare(messages);

      // Check that the last 4 turns (user, assistant+tool, assistant, user) are verbatim in result
      const originalRecentTail = messages.slice(-5); // Recent Turn 1 through 4
      const resultTail = result.slice(-5);

      expect(resultTail).toEqual(originalRecentTail);
    });
  });

  describe("Within-budget behavior", () => {
    it("returns all messages untouched when tokens are within budget threshold", async () => {
      const manager = new CompactingContextManager({
        maxTokens: 24_000,
        compactThreshold: 0.75,
      });

      const messages: Message[] = [
        { role: "system", content: "You are Odin" },
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          content: "Hi there, how can I help?",
          toolCalls: [],
        },
        { role: "user", content: "List files" },
        {
          role: "assistant",
          content: "Listing files",
          toolCalls: [{ id: "l1", name: "ls", input: {} }],
        },
        { role: "tool", toolCallId: "l1", content: "file1.ts\nfile2.ts" },
        { role: "assistant", content: "Here are the files.", toolCalls: [] },
      ];

      const result = await manager.prepare(messages);
      expect(result).toEqual(messages);
    });

    it("returns empty array for empty messages", async () => {
      const manager = new CompactingContextManager();
      const result = await manager.prepare([]);
      expect(result).toEqual([]);
    });
  });
});
