import { describe, it, expect } from "bun:test";
import { createProvider } from "./providers/factory";
import { OllamaProvider } from "./providers/ollama-provider";
import { OpenAIProvider } from "./providers/openai-provider";

describe("createProvider", () => {
  it("creates OllamaProvider when provider is ollama", () => {
    const provider = createProvider({
      provider: "ollama",
      model: "qwen:7b",
    });
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it("creates OpenAIProvider when provider is openai", () => {
    const provider = createProvider({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "test-key",
    });
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it("creates OpenAIProvider when provider is openrouter with correct baseURL", () => {
    const provider = createProvider({
      provider: "openrouter",
      model: "anthropic/claude-3.5-sonnet",
      apiKey: "test-router-key",
    });
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect((provider as any).baseURL).toBe("https://openrouter.ai/api/v1");
  });

  it("creates OpenAIProvider when provider is groq with correct baseURL", () => {
    const provider = createProvider({
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      apiKey: "test-groq-key",
    });
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect((provider as any).baseURL).toBe("https://api.groq.com/openai/v1");
  });

  it("creates OpenAIProvider when provider is deepseek with correct baseURL", () => {
    const provider = createProvider({
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "test-deepseek-key",
    });
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect((provider as any).baseURL).toBe("https://api.deepseek.com/v1");
  });
});
