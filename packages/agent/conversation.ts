import type {
  AssistantMessage,
  Message,
  UserMessage,
  SystemMessage,
  ToolMessage,
} from "@odin/shared";

export class Conversation {
  private readonly messages: Message[] = [];

  constructor(systemPrompt?: string) {
    if (systemPrompt) {
      this.addSystem(systemPrompt);
    }
  }

  addSystem(content: string): void {
    this.messages.push({
      role: "system",
      content,
    });
  }

  addUser(content: string): void {
    this.messages.push({
      role: "user",
      content,
    });
  }

  addAssistant(message: AssistantMessage): void {
    this.messages.push(message);
  }

  addTool(message: ToolMessage): void {
    this.messages.push(message);
  }

  history(): readonly Message[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages.length = 0;
  }
}