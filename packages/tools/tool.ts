export interface ToolResult {
  content: string;
}

export interface Tool<TInput = unknown> {
  readonly name: string;

  readonly description: string;

  readonly schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };

  execute(input: TInput): Promise<ToolResult>;
}