import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * The chat model. OpenAI itself is reached through its Responses API, the one that allows a
 * reasoning effort together with tools on its newer models. Any other OpenAI-compatible endpoint
 * (NEAR AI Cloud, OpenRouter, a local server) goes through chat completions.
 *
 * On NEAR AI Cloud the user picks how private the model is:
 * - private: open models on NEAR AI's own TEE GPUs, attested and verifiable;
 * - partner: open models in a partner's TEE (Tinfoil, Chutes), attested by that partner;
 * - incognito: OpenAI / Anthropic models, reached through NEAR AI's TEE gateway without the
 *   user's identity, but run by the provider outside a TEE.
 * Each tier has a normal and a Think model, overridable as LLM_<TIER>_MODELS="normal,think".
 * The defaults were checked on this agent's own tasks (risk check, quote, cross-chain quote).
 */
const BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.LLM_MODEL || "gpt-6-luna";
const THINK_MODEL = process.env.LLM_THINK_MODEL || MODEL;
const API_KEY = process.env.LLM_API_KEY || undefined;

const isOpenAI = /^https:\/\/api\.openai\.com\//.test(BASE_URL);
const isNearAI = /^https:\/\/cloud-api\.near\.ai\//.test(BASE_URL);

const openai = createOpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
const compatible = createOpenAICompatible({ name: "llm", baseURL: BASE_URL, apiKey: API_KEY, includeUsage: true });

export type Tier = "private" | "partner" | "incognito";
export const TIER_IDS: Tier[] = ["private", "partner", "incognito"];

export type TierInfo = {
  id: Tier;
  label: string;
  /** One short sentence: who runs the model and who can read the chat. */
  hint: string;
  model: string;
  think: string;
};

/**
 * One model per tier; Think asks it to reason more. Picked by running this agent's own tasks on
 * them (risk check, quote, cross-chain quote with a refund address): every pair answered all three.
 */
const DEFAULTS: Record<Tier, Omit<TierInfo, "id">> = {
  private: {
    label: "Private",
    hint: "NEAR AI's secure hardware. No one can read your chat.",
    model: "z-ai/glm-5.3-flash",
    think: "z-ai/glm-5.3-flash",
  },
  partner: {
    label: "Partner",
    hint: "Bigger model on a partner's secure hardware. Costs more.",
    model: "z-ai/glm-5.3",
    think: "z-ai/glm-5.3",
  },
  incognito: {
    label: "Incognito",
    hint: "OpenAI through NEAR AI. Anonymous, but not private.",
    model: "openai/gpt-6-luna",
    think: "openai/gpt-6-luna",
  },
};

function tier(id: Tier): TierInfo {
  const [model, think] = (process.env[`LLM_${id.toUpperCase()}_MODELS`] ?? "").split(",").map((s) => s.trim());
  const d = DEFAULTS[id];
  return { id, label: d.label, hint: d.hint, model: model || d.model, think: think || model || d.think };
}

/** The chat runs on NEAR AI Cloud, so its extras (web search) are there too. */
export const NEAR_AI = isNearAI && Boolean(API_KEY);
export const NEAR_AI_BASE = BASE_URL.replace(/\/$/, "");
export const NEAR_AI_KEY = isNearAI ? API_KEY : undefined;

/** The tiers the user can pick from: only on NEAR AI Cloud. */
export const TIERS: TierInfo[] | null = isNearAI ? TIER_IDS.map(tier) : null;

const envTier = process.env.LLM_DEFAULT_TIER as Tier | undefined;
export const DEFAULT_TIER: Tier = envTier && TIER_IDS.includes(envTier) ? envTier : "private";

/** A key is needed unless the endpoint is local. */
export function llmConfigured(): boolean {
  return Boolean(API_KEY) || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE_URL);
}

/**
 * The reasoning effort to ask for, or none:
 * - Anthropic models behind NEAR AI refuse a reasoning effort.
 * - GLM-5.3 Flash thinks fully by default, and any effort it is sent cuts that to a minimum: so
 *   "low" for a quick reply, and nothing for Think.
 */
function effort(id: string, think: boolean): "low" | "high" | undefined {
  if (id.startsWith("anthropic/")) return undefined;
  if (id === "z-ai/glm-5.3-flash") return think ? undefined : "low";
  return think ? "high" : "low";
}

/** The model for a reply, and the reasoning effort to ask for. */
export function chatModel(think: boolean, pick?: Tier) {
  const t = TIERS?.find((x) => x.id === (pick ?? DEFAULT_TIER));
  const id = t ? (think ? t.think : t.model) : think ? THINK_MODEL : MODEL;
  const model = isOpenAI ? openai.responses(id) : compatible.chatModel(id);
  return { id, model, reasoning: effort(id, think) };
}
