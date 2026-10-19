import type { Message } from "@odin/shared";
import type { TokenEstimator } from "./token-estimator";

export interface ContextManagerOptions {
  maxTokens?: number;
  compactThreshold?: number;
  minRecentTurns?: number;
  tokenEstimator?: TokenEstimator;
}

export interface ContextManager {
  prepare(messages: Message[]): Promise<Message[]>;
  getEstimatedTokens?(messages: Message[]): number;
  getTokenBudget?(): number;
}
