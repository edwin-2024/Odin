import type { ChatModel } from "../chat-model";
import { OllamaProvider } from "./ollama-provider";
import { OpenAIProvider } from "./openai-provider";

export interface ProviderConfig {
  provider?: "ollama" | "openai" | "openrouter" | "groq" | "deepseek" | string;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
}

export function createProvider(config: ProviderConfig = {}): ChatModel {
  const provider = (
    config.provider ||
    process.env.ODIN_PROVIDER ||
    "ollama"
  ).toLowerCase();

  const model =
    config.model ||
    process.env.ODIN_MODEL ||
    (provider === "ollama" ? "qwen3:4b-instruct-2507-q4_K_M" : "gpt-4o");

  if (provider === "ollama") {
    return new OllamaProvider(model);
  }

  let defaultBaseUrl = "https://api.openai.com/v1";
  if (provider === "openrouter") {
    defaultBaseUrl = "https://openrouter.ai/api/v1";
  } else if (provider === "groq") {
    defaultBaseUrl = "https://api.groq.com/openai/v1";
  } else if (provider === "deepseek") {
    defaultBaseUrl = "https://api.deepseek.com/v1";
  }

  const baseURL =
    config.baseURL ||
    process.env.ODIN_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    defaultBaseUrl;

  const apiKey =
    config.apiKey ||
    process.env.ODIN_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "";

  return new OpenAIProvider({
    model,
    apiKey,
    baseURL,
    temperature: config.temperature,
  });
}
