import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Any OpenAI-compatible chat endpoint: OpenAI, NEAR AI Cloud, OpenRouter, a local server. */
const BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.LLM_MODEL || "gpt-5-mini";
const THINK_MODEL = process.env.LLM_THINK_MODEL || MODEL;

const provider = createOpenAICompatible({
  name: "llm",
  baseURL: BASE_URL,
  apiKey: process.env.LLM_API_KEY || undefined,
  includeUsage: true,
});

/** A key is needed unless the endpoint is local. */
export function llmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY) || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE_URL);
}

/** The normal model, or the think model with more reasoning. */
export function chatModel(think: boolean) {
  return provider.chatModel(think ? THINK_MODEL : MODEL);
}
