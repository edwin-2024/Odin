export interface ToolResult {
  content: string;
}

export type ExecutionMode = "parallel" | "serial";

export interface Tool<TInput = any, TCallbacks = any> {
  readonly name: string;

  readonly description: string;

  readonly executionMode: ExecutionMode;

  readonly schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };

  execute(input: TInput, callbacks?: TCallbacks): Promise<ToolResult>;
}

export interface ListDirectoryInput {
  path: string;
}

export interface GlobInput {
  pattern: string;
}