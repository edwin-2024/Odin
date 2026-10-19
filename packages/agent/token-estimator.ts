import type { Message, AssistantMessage, ToolMessage } from "@odin/shared";

export interface TokenEstimator {
  estimateTokens(text: string): number;
  estimateMessageTokens(message: Message): number;
  estimateMessagesTokens(messages: Message[]): number;
}

export class HeuristicTokenEstimator implements TokenEstimator {
  private readonly charsPerToken: number;

  constructor(charsPerToken: number = 3.8) {
    this.charsPerToken = charsPerToken > 0 ? charsPerToken : 3.8;
  }

  estimateTokens(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }
    return Math.max(1, Math.ceil(text.length / this.charsPerToken));
  }

  estimateMessageTokens(message: Message): number {
    // Framing overhead per message (e.g. <|im_start|>role\n ... <|im_end|>\n)
    let tokens = 4;
    tokens += this.estimateTokens(message.role);

    if (message.content) {
      tokens += this.estimateTokens(message.content);
    }

    if (message.role === "assistant") {
      const assistant = message as AssistantMessage;
      if (assistant.toolCalls && Array.isArray(assistant.toolCalls)) {
        for (const call of assistant.toolCalls) {
          // Tool call syntactic framing overhead
          tokens += 6;
          if (call.id) tokens += this.estimateTokens(call.id);
          if (call.name) tokens += this.estimateTokens(call.name);
          if (call.input !== undefined && call.input !== null) {
            const inputStr =
              typeof call.input === "string"
                ? call.input
                : JSON.stringify(call.input);
            tokens += this.estimateTokens(inputStr);
          }
        }
      }
    } else if (message.role === "tool") {
      const tool = message as ToolMessage;
      if (tool.toolCallId) {
        tokens += 2 + this.estimateTokens(tool.toolCallId);
      }
    }

    return tokens;
  }

  estimateMessagesTokens(messages: Message[]): number {
    if (!messages || messages.length === 0) {
      return 0;
    }
    let total = 0;
    for (const msg of messages) {
      total += this.estimateMessageTokens(msg);
    }
    // Priming overhead for the assistant response turn
    total += 3;
    return total;
  }
}

export const defaultTokenEstimator = new HeuristicTokenEstimator();
