import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * The chat model. OpenAI itself is reached through its Responses API, the one that allows a
 * reasoning effort together with tools on its newer models. Any other OpenAI-compatible endpoint
 * (NEAR AI Cloud, OpenRouter, a local server) goes through chat completions.
 */
const BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.LLM_MODEL || "gpt-6-luna";
const THINK_MODEL = process.env.LLM_THINK_MODEL || MODEL;
const API_KEY = process.env.LLM_API_KEY || undefined;

const isOpenAI = /^https:\/\/api\.openai\.com\//.test(BASE_URL);

const openai = createOpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
const compatible = createOpenAICompatible({ name: "llm", baseURL: BASE_URL, apiKey: API_KEY, includeUsage: true });

/** A key is needed unless the endpoint is local. */
export function llmConfigured(): boolean {
  return Boolean(API_KEY) || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE_URL);
}

/** The normal model, or the think model with more reasoning. */
export function chatModel(think: boolean) {
  const id = think ? THINK_MODEL : MODEL;
  return isOpenAI ? openai.responses(id) : compatible.chatModel(id);
}
