import { describe, it, expect } from "bun:test";
import { ToolRegistry } from "./registry";
import type { Tool, ToolResult } from "./tool";

class MockTool implements Tool<{ value: string }> {
  readonly name = "mock_tool";
  readonly executionMode = "parallel" as const;
  readonly description = "Mock tool for testing";
  readonly schema = {
    type: "object" as const,
    properties: {
      value: { type: "string" },
    },
    required: ["value"],
  };

  async execute(input: { value: string }): Promise<ToolResult> {
    return { content: `Received ${input.value}` };
  }
}

describe("ToolRegistry", () => {
  it("registers and retrieves tools", () => {
    const registry = new ToolRegistry();
    const tool = new MockTool();
    registry.register(tool);

    expect(registry.get("mock_tool")).toBe(tool);
    expect(registry.list().length).toBe(1);
    expect(registry.list()[0]!.name).toBe("mock_tool");
  });

  it("throws for unregistered tools", () => {
    const registry = new ToolRegistry();
    expect(() => registry.get("non_existent")).toThrow("Unknown tool: non_existent");
  });
});
