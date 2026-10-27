import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SessionStore } from "./session-store";
import type { AssistantMessage, ToolMessage, UserMessage } from "@odin/shared";

describe("SessionStore (bun:sqlite)", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("creates and retrieves session records", () => {
    const session = store.createSession({
      id: "sess-1",
      goal: "Build login feature",
      provider: "ollama",
      model: "qwen3:4b-instruct-2507-q4_K_M",
    });

    expect(session.id).toBe("sess-1");
    expect(session.status).toBe("active");

    const retrieved = store.getSession("sess-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.goal).toBe("Build login feature");
    expect(retrieved?.provider).toBe("ollama");
  });

  it("updates session status", () => {
    store.createSession({
      id: "sess-2",
      goal: "Fix bug",
      provider: "openai",
      model: "gpt-4o",
    });

    store.updateSessionStatus("sess-2", "completed");
    const updated = store.getSession("sess-2");
    expect(updated?.status).toBe("completed");
  });

  it("saves and retrieves conversation messages preserving tool calls and IDs", () => {
    store.createSession({
      id: "sess-3",
      goal: "Analyze code",
      provider: "ollama",
      model: "qwen3:4b",
    });

    const userMsg: UserMessage = { role: "user", content: "Read package.json" };
    const assistantMsg: AssistantMessage = {
      role: "assistant",
      content: "I will read the file.",
      toolCalls: [
        { id: "call-1", name: "read_file", input: { path: "package.json" } },
      ],
    };
    const toolMsg: ToolMessage = {
      role: "tool",
      content: '{"name": "odin"}',
      toolCallId: "call-1",
    };

    store.saveMessage("sess-3", userMsg);
    store.saveMessage("sess-3", assistantMsg);
    store.saveMessage("sess-3", toolMsg);

    const messages = store.getMessages("sess-3");
    expect(messages.length).toBe(3);
    expect(messages[0]!.role).toBe("user");
    expect(messages[1]!.role).toBe("assistant");
    expect((messages[1] as AssistantMessage).toolCalls[0]!.name).toBe("read_file");
    expect(messages[2]!.role).toBe("tool");
    expect((messages[2] as ToolMessage).toolCallId).toBe("call-1");
  });

  it("persists and retrieves execution plans", () => {
    store.createSession({
      id: "sess-4",
      goal: "Refactor",
      provider: "ollama",
      model: "qwen3:4b",
    });

    const plan = {
      goal: "Refactor",
      tasks: [
        { id: "t1", title: "Step 1", status: "completed" as const, dependsOn: [] },
        { id: "t2", title: "Step 2", status: "pending" as const, dependsOn: ["t1"] },
      ],
    };

    store.savePlan("sess-4", plan);
    const retrieved = store.getPlan("sess-4");

    expect(retrieved).not.toBeNull();
    expect(retrieved?.tasks.length).toBe(2);
    expect(retrieved?.tasks[0]!.title).toBe("Step 1");
    expect(retrieved?.tasks[0]!.status).toBe("completed");
  });

  it("saves and retrieves telemetry metrics", () => {
    store.createSession({
      id: "sess-5",
      goal: "Metrics test",
      provider: "ollama",
      model: "qwen3:4b",
    });

    const metrics = {
      startedAt: 1000,
      finishedAt: 5000,
      totalDurationMs: 4000,
      modelDurationMs: 3000,
      toolWallClockMs: 1000,
      toolAccumulatedMs: 1500,
      toolCalls: 3,
      reasoningIterations: 2,
    };

    store.saveTelemetry("sess-5", metrics);
    const retrieved = store.getTelemetry("sess-5");

    expect(retrieved).not.toBeNull();
    expect(retrieved?.totalDurationMs).toBe(4000);
    expect(retrieved?.toolCalls).toBe(3);
  });

  it("lists sessions ordered by updated_at and deletes session cascades", () => {
    store.createSession({ id: "s1", goal: "A", provider: "p", model: "m" });
    store.createSession({ id: "s2", goal: "B", provider: "p", model: "m" });

    store.saveMessage("s1", { role: "user", content: "test" });

    const list = store.listSessions(10);
    expect(list.length).toBe(2);

    store.deleteSession("s1");
    expect(store.getSession("s1")).toBeNull();
    expect(store.getMessages("s1").length).toBe(0);
    expect(store.listSessions(10).length).toBe(1);
  });
});
