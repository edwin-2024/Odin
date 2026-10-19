import type { ContextManager, ContextManagerOptions } from "./context-manager";
import type { Message, AssistantMessage, ToolMessage } from "@odin/shared";
import { defaultTokenEstimator, type TokenEstimator } from "./token-estimator";

export interface CompactingContextManagerOptions extends ContextManagerOptions {
  /**
   * Maximum total token budget.
   * Defaults to 24,000 tokens for standard models.
   */
  maxTokens?: number;

  /**
   * Threshold fraction of maxTokens at which dynamic compaction triggers.
   * Defaults to 0.75 (75%).
   */
  compactThreshold?: number;

  /**
   * Minimum number of recent conversational turns to preserve completely verbatim.
   * Defaults to 4 turns.
   */
  minRecentTurns?: number;

  /**
   * Token estimator implementation.
   * Defaults to HeuristicTokenEstimator.
   */
  tokenEstimator?: TokenEstimator;

  /**
   * Token threshold for an individual tool payload in intermediate turns
   * above which it gets condensed.
   * Defaults to 300 tokens (~1200 characters).
   */
  maxIntermediateToolTokens?: number;

  /**
   * Number of lines to preserve at head and tail when condensing large tool outputs.
   * Defaults to 8 lines.
   */
  condenseHeadLines?: number;
  condenseTailLines?: number;
}

interface ConversationalTurn {
  id: number;
  messages: Message[];
  hasToolCalls: boolean;
  isUser: boolean;
}

export class CompactingContextManager implements ContextManager {
  private readonly maxTokens: number;
  private readonly compactThreshold: number;
  private readonly minRecentTurns: number;
  private readonly tokenEstimator: TokenEstimator;
  private readonly maxIntermediateToolTokens: number;
  private readonly condenseHeadLines: number;
  private readonly condenseTailLines: number;

  constructor(options: CompactingContextManagerOptions = {}) {
    this.maxTokens = options.maxTokens ?? 24_000;
    this.compactThreshold = options.compactThreshold ?? 0.75;
    this.minRecentTurns = options.minRecentTurns ?? 4;
    this.tokenEstimator = options.tokenEstimator ?? defaultTokenEstimator;
    this.maxIntermediateToolTokens = options.maxIntermediateToolTokens ?? 300;
    this.condenseHeadLines = options.condenseHeadLines ?? 8;
    this.condenseTailLines = options.condenseTailLines ?? 8;
  }

  getTokenBudget(): number {
    return this.maxTokens;
  }

  getThresholdTokens(): number {
    return Math.floor(this.maxTokens * this.compactThreshold);
  }

  getEstimatedTokens(messages: Message[]): number {
    return this.tokenEstimator.estimateMessagesTokens(messages);
  }

  async prepare(messages: Message[]): Promise<Message[]> {
    if (messages.length === 0) {
      return [];
    }

    // Invariant 1: System prompt at index 0 must ALWAYS be preserved
    const systemMessage =
      messages[0]?.role === "system" ? messages[0] : undefined;
    const nonSystem = systemMessage ? messages.slice(1) : [...messages];

    if (nonSystem.length === 0) {
      return systemMessage ? [systemMessage] : [];
    }

    // Group non-system messages into atomic turns to protect paired tool transactions
    // and filter out any orphaned tool messages
    const turns = this.groupIntoTurns(nonSystem);

    if (turns.length === 0) {
      return systemMessage ? [systemMessage] : [];
    }

    const cleanNonSystem = turns.flatMap((t) => t.messages);
    const cleanMessages = systemMessage
      ? [systemMessage, ...cleanNonSystem]
      : cleanNonSystem;

    // Check if current clean messages already fit comfortably within the compaction threshold
    const totalTokens =
      this.tokenEstimator.estimateMessagesTokens(cleanMessages);
    const thresholdTokens = this.getThresholdTokens();

    if (totalTokens <= thresholdTokens) {
      return cleanMessages;
    }

    // Invariant 3: Keep recent conversational turns (minimum last 4 turns) completely verbatim
    const recentTurnCount = Math.min(turns.length, this.minRecentTurns);
    const recentTurns = turns.slice(turns.length - recentTurnCount);
    const intermediateTurns = turns.slice(0, turns.length - recentTurnCount);

    // If there are no intermediate turns to condense, keep recent turns verbatim
    if (intermediateTurns.length === 0) {
      const resultNonSystem = turns.flatMap((t) => t.messages);
      return systemMessage
        ? [systemMessage, ...resultNonSystem]
        : resultNonSystem;
    }

    // Stage 1: Condense large tool payloads in older intermediate turns
    const stage1IntermediateTurns = intermediateTurns.map((turn) =>
      this.condenseTurnToolPayloads(turn),
    );

    const stage1NonSystem = [
      ...stage1IntermediateTurns.flatMap((t) => t.messages),
      ...recentTurns.flatMap((t) => t.messages),
    ];
    const candidate1 = systemMessage
      ? [systemMessage, ...stage1NonSystem]
      : stage1NonSystem;

    if (
      this.tokenEstimator.estimateMessagesTokens(candidate1) <= thresholdTokens
    ) {
      return candidate1;
    }

    // Stage 2: Progressively condense older intermediate turns into a structured summary
    // to preserve conversation continuity while strictly respecting the token budget
    return this.summarizeOlderIntermediateTurns(
      systemMessage,
      stage1IntermediateTurns,
      recentTurns,
      thresholdTokens,
    );
  }

  /**
   * Group messages into atomic conversational turns.
   * Invariant 2: Never slice into an orphaned tool message or separate
   * an assistant tool_calls message from its corresponding tool response messages.
   */
  private groupIntoTurns(messages: Message[]): ConversationalTurn[] {
    const turns: ConversationalTurn[] = [];
    let i = 0;

    while (i < messages.length) {
      const msg = messages[i]!;

      if (msg.role === "user") {
        turns.push({
          id: turns.length,
          messages: [msg],
          hasToolCalls: false,
          isUser: true,
        });
        i++;
      } else if (msg.role === "assistant") {
        const assistant = msg as AssistantMessage;
        if (assistant.toolCalls && assistant.toolCalls.length > 0) {
          // Collect the assistant message and all matching tool responses into a single atomic turn
          const turnMessages: Message[] = [assistant];
          const expectedIds = new Set(assistant.toolCalls.map((tc) => tc.id));
          i++;

          while (i < messages.length) {
            const nextMsg = messages[i]!;
            if (nextMsg.role === "tool") {
              const toolMsg = nextMsg as ToolMessage;
              turnMessages.push(toolMsg);
              expectedIds.delete(toolMsg.toolCallId);
              i++;
              if (expectedIds.size === 0) {
                // All tool calls in this assistant turn have received responses
                break;
              }
            } else {
              // Non-tool message encountered before all tool results arrived;
              // do not consume non-tool message here
              break;
            }
          }

          turns.push({
            id: turns.length,
            messages: turnMessages,
            hasToolCalls: true,
            isUser: false,
          });
        } else {
          // Assistant message with plain text content
          turns.push({
            id: turns.length,
            messages: [assistant],
            hasToolCalls: false,
            isUser: false,
          });
          i++;
        }
      } else if (msg.role === "tool") {
        // Invariant 2: Never allow an orphaned tool response without its calling assistant message.
        // Skip orphaned tool messages so they are never retained independently.
        i++;
      } else {
        // Any other message role
        turns.push({
          id: turns.length,
          messages: [msg],
          hasToolCalls: false,
          isUser: false,
        });
        i++;
      }
    }

    return turns;
  }

  /**
   * Condense large tool outputs in an intermediate turn while retaining
   * exact toolCallId and assistant toolCalls pairings.
   */
  private condenseTurnToolPayloads(
    turn: ConversationalTurn,
  ): ConversationalTurn {
    if (!turn.hasToolCalls) {
      return turn;
    }

    const condensedMessages = turn.messages.map((msg) => {
      if (msg.role !== "tool") {
        return msg;
      }

      const toolMsg = msg as ToolMessage;
      const tokens = this.tokenEstimator.estimateMessageTokens(toolMsg);

      if (tokens <= this.maxIntermediateToolTokens) {
        return toolMsg;
      }

      const condensedContent = this.condenseContent(toolMsg.content);
      return {
        ...toolMsg,
        content: condensedContent,
      };
    });

    return {
      ...turn,
      messages: condensedMessages,
    };
  }

  /**
   * Condense long text or multi-line content (e.g. 100+ line read_file payload).
   */
  private condenseContent(content: string): string {
    const lines = content.split("\n");
    if (lines.length > this.condenseHeadLines + this.condenseTailLines + 2) {
      const head = lines.slice(0, this.condenseHeadLines).join("\n");
      const tail = lines
        .slice(lines.length - this.condenseTailLines)
        .join("\n");
      const omitted =
        lines.length - this.condenseHeadLines - this.condenseTailLines;
      return `${head}\n... [${omitted} lines omitted / tool output condensed for context budget] ...\n${tail}`;
    }

    if (content.length > 1000) {
      const half = 400;
      return `${content.slice(0, half)}\n... [${content.length - 800} characters condensed for context budget] ...\n${content.slice(-half)}`;
    }

    return content;
  }

  /**
   * Stage 2 Compaction: Condense older intermediate turns into a concise summary
   * while maintaining conversation continuity and guaranteeing tool call atomicity.
   */
  private summarizeOlderIntermediateTurns(
    systemMessage: Message | undefined,
    intermediateTurns: ConversationalTurn[],
    recentTurns: ConversationalTurn[],
    targetTokens: number,
  ): Message[] {
    const recentMessages = recentTurns.flatMap((t) => t.messages);

    // Iteratively compact the oldest intermediate turns into a summary block
    // until the total messages fit within targetTokens.
    for (let cutIndex = 1; cutIndex <= intermediateTurns.length; cutIndex++) {
      const turnsToSummarize = intermediateTurns.slice(0, cutIndex);
      const remainingIntermediateTurns = intermediateTurns.slice(cutIndex);

      const summaryText = this.createContinuitySummary(turnsToSummarize);
      const summaryMessage: Message = {
        role: "user",
        content: summaryText,
      };

      const candidateNonSystem = [
        summaryMessage,
        ...remainingIntermediateTurns.flatMap((t) => t.messages),
        ...recentMessages,
      ];

      const candidate = systemMessage
        ? [systemMessage, ...candidateNonSystem]
        : candidateNonSystem;

      const estimated = this.tokenEstimator.estimateMessagesTokens(candidate);
      if (estimated <= targetTokens || cutIndex === intermediateTurns.length) {
        return candidate;
      }
    }

    // Fallback: system + recent messages
    return systemMessage ? [systemMessage, ...recentMessages] : recentMessages;
  }

  /**
   * Build a concise continuity summary of condensed turns.
   */
  private createContinuitySummary(turns: ConversationalTurn[]): string {
    const lines: string[] = [];

    for (const turn of turns) {
      for (const msg of turn.messages) {
        if (msg.role === "user") {
          const preview = this.truncateText(msg.content, 120);
          lines.push(`- User: "${preview}"`);
        } else if (msg.role === "assistant") {
          const assistant = msg as AssistantMessage;
          if (assistant.toolCalls && assistant.toolCalls.length > 0) {
            const toolNames = assistant.toolCalls
              .map((tc) => tc.name)
              .join(", ");
            lines.push(`- Agent invoked tools: ${toolNames} (completed)`);
          } else if (assistant.content) {
            const preview = this.truncateText(assistant.content, 120);
            lines.push(`- Agent concluded: "${preview}"`);
          }
        }
      }
    }

    return `[Context Summary (${turns.length} earlier conversational turns condensed for token efficiency):\n${lines.join("\n")}]`;
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text) return "";
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, maxLength - 3)}...`;
  }
}
