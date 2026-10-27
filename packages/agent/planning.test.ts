import { describe, it, expect } from "bun:test";
import { LLMPlanner } from "./planning/llm-planner";
import { Conversation } from "./conversation";
import type { ChatModel } from "@odin/ai";
import { EventStream } from "@odin/ai";

class MockChatModel implements ChatModel {
  calls = 0;

  constructor(private readonly responseContent: string) {}

  async chat(): Promise<EventStream> {
    this.calls++;
    const stream = new EventStream();
    stream.push({ type: "text", delta: this.responseContent });
    stream.push({ type: "done" });
    return stream;
  }
}

describe("LLMPlanner", () => {
  it("bypasses LLM call for simple conversational queries", async () => {
    const mockModel = new MockChatModel("should not be called");
    const planner = new LLMPlanner(mockModel);
    const conversation = new Conversation("system");
    conversation.addUser("Hello how are you today?");

    const plan = await planner.plan(conversation);
    expect(plan.tasks.length).toBe(1);
    expect(plan.tasks[0]!.title).toBe("Respond to user");
  });

  it("does not treat action words inside other words as commands", async () => {
    const mockModel = new MockChatModel("should not be called");
    const planner = new LLMPlanner(mockModel);
    const conversation = new Conversation("system");
    conversation.addUser("Reply with exactly: ready");

    const plan = await planner.plan(conversation);
    expect(plan.tasks[0]!.title).toBe("Respond to user");
    expect(mockModel.calls).toBe(0);
  });

  it("parses valid JSON plan response from model", async () => {
    const mockJson = JSON.stringify({
      goal: "Implement authentication",
      tasks: [
        { id: "1", title: "Review auth schema", objective: "Check user schema", dependsOn: [] },
        { id: "2", title: "Add auth endpoint", objective: "Create /login route", dependsOn: ["1"] },
      ],
    });

    const mockModel = new MockChatModel(mockJson);
    const planner = new LLMPlanner(mockModel);
    const conversation = new Conversation("system");
    conversation.addUser("Implement authentication with JWT and login endpoints");

    const plan = await planner.plan(conversation);
    expect(plan.goal).toBe("Implement authentication");
    expect(plan.tasks.length).toBe(2);
    expect(plan.tasks[0]!.title).toBe("Review auth schema");
    expect(plan.tasks[1]!.dependsOn).toEqual(["1"]);
  });

  it("safely strips markdown code fences from JSON output", async () => {
    const mockFencedJson =
      "```json\n" +
      JSON.stringify({
        goal: "Refactor database queries",
        tasks: [{ id: "t1", title: "Optimize index", objective: "Add index" }],
      }) +
      "\n```";

    const mockModel = new MockChatModel(mockFencedJson);
    const planner = new LLMPlanner(mockModel);
    const conversation = new Conversation("system");
    conversation.addUser("Refactor database queries for faster user lookups");

    const plan = await planner.plan(conversation);
    expect(plan.tasks.length).toBe(1);
    expect(plan.tasks[0]!.title).toBe("Optimize index");
  });

  it("falls back gracefully when model returns unparseable text", async () => {
    const mockModel = new MockChatModel("Here is what you should do: first do this, then do that.");
    const planner = new LLMPlanner(mockModel);
    const conversation = new Conversation("system");
    conversation.addUser("Fix the broken build and test pipelines");

    const plan = await planner.plan(conversation);
    expect(plan.tasks.length).toBe(1);
    expect(plan.tasks[0]!.title).toBe("Fulfill request");
  });

  it("dynamically replans when a sub-task fails", async () => {
    const replanJson = JSON.stringify({
      goal: "Implement authentication",
      tasks: [
        { id: "r1", title: "Debug JWT secret missing", objective: "Check environment variables", dependsOn: [] },
      ],
    });

    const mockModel = new MockChatModel(replanJson);
    const planner = new LLMPlanner(mockModel);
    const conversation = new Conversation("system");
    conversation.addUser("Implement auth");

    const initialPlan = {
      goal: "Implement authentication",
      tasks: [
        { id: "1", title: "Review auth schema", status: "completed" as const, dependsOn: [] },
        { id: "2", title: "Add auth endpoint", status: "running" as const, dependsOn: [] },
      ],
    };

    const revisedPlan = await planner.replan(conversation, initialPlan, "2", "Error: JWT_SECRET not found in .env");

    expect(revisedPlan.tasks.length).toBe(3);
    expect(revisedPlan.tasks[0]!.title).toBe("Review auth schema");
    expect(revisedPlan.tasks[0]!.status).toBe("completed");
    expect(revisedPlan.tasks[1]!.id).toBe("2");
    expect(revisedPlan.tasks[1]!.status).toBe("failed");
    expect(revisedPlan.tasks[2]!.title).toBe("Debug JWT secret missing");
    expect(revisedPlan.tasks[2]!.status).toBe("pending");
  });
});
