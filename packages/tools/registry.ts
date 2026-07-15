import type { Tool } from "./tool";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return tool;
  }

  list() {
    return [...this.tools.values()];
  }

  toolSchemas() {
    return this.list().map((tool) => ({
      type: "function",

      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
      },
    }));
  }
}
