import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { Guard } from "@/lib/agent/guard";
import { chatModel, DEFAULT_TIER, llmConfigured, TIER_IDS, TIERS } from "@/lib/agent/model";
import { capturingFetch, markPending, VERIFY, verifyReply, type Call } from "@/lib/agent/verify";
import { instructions } from "@/lib/agent/prompt";
import { buildTools } from "@/lib/agent/tools";
import { ownerOf, readSession } from "@/lib/auth/session";
import { CONVERSATION_ID, ensureConversation, loadMessages, NotYours, saveMessages, titleFrom } from "@/lib/chat/store";
import { allow, allowToday, ipOf } from "@/lib/chat/rate-limit";
import { CHAT_PER_DAY, IP_CHAT_PER_DAY, IP_PARTNER_PER_DAY, PARTNER_PER_DAY, type Budget } from "@/lib/chat/limits";
import { access, denied } from "@/lib/gate/access";
import { crossSite } from "@/lib/http/same-site";
import { AccountNotFound } from "@/lib/agent/profile";
import { TokenNotFound } from "@/lib/risk/contract";
import { WebCapError } from "@/lib/risk/web";
import { SwapError } from "@/lib/swap/assets";

const Id = z.string().max(120).regex(/^[A-Za-z0-9._:-]+$/);
const Body = z.object({
  id: z.string().regex(CONVERSATION_ID),
  message: z.object({ id: z.string().max(64), role: z.literal("user"), parts: z.array(z.unknown()).min(1).max(20) }).passthrough(),
  think: z.boolean().optional(),
  /** On NEAR AI Cloud: how private the model is. */
  tier: z.enum(TIER_IDS as [string, ...string[]]).optional(),
  // What the side pane shows, so "this token" can be resolved. Ids only, never free text.
  pane: z
    .object({
      open: z.boolean(),
      tab: z.enum(["check", "swap"]),
      focus: Id.nullable(),
      shown: z.array(Id).max(12),
      checked: z.array(Id).max(10),
      swap: z.object({ from: Id.or(z.literal("")), to: Id.or(z.literal("")), amount: z.string().max(40).regex(/^[\d.]*$/), cross: z.boolean().optional() }).nullable(),
    })
    .optional(),
});

/** Longest user message accepted, in characters. */
const MAX_INPUT = 4000;
/** Earlier messages sent to the model; older ones stay stored but are left out. */
const HISTORY = 30;
/**
 * And at most this many characters of them (about 30k tokens), oldest dropped first: every step
 * of a reply sends the history again. The new message always goes.
 */
const HISTORY_CHARS = 120_000;
/** Output tokens per step, reasoning included. Far above what replies use; it stops a runaway. */
const MAX_OUTPUT = { normal: 8_192, think: 16_384 };

export async function POST(req: Request) {
  const refused = crossSite(req);
  if (refused) return refused;
  if (!llmConfigured()) return Response.json({ error: "The AI model is not configured on this server (LLM_API_KEY)." }, { status: 503 });
  const s = await readSession();
  if (!s) return Response.json({ error: "No session. Reload the page." }, { status: 401 });
  const a = await access(s.account);
  if (!a.ok) return denied(a);
  if (!allow(s.id)) return Response.json({ error: "Too many messages. Wait a minute and try again." }, { status: 429 });

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request." }, { status: 400 });
  // Checked before the daily count, so a refused message costs nothing.
  const message = body.data.message as unknown as UIMessage;
  const text = titleFrom(message);
  if (JSON.stringify(message.parts).length > MAX_INPUT * 2 || text.length === 0) {
    return Response.json({ error: "Message is empty or too long." }, { status: 400 });
  }
  // Chat is free for any signed-in wallet for now, so each wallet and each IP gets a daily budget,
  // and a smaller one for the Partner tier, whose model costs far more.
  const ip = `ip:${ipOf(req)}`;
  const partner = TIERS !== null && (body.data.tier ?? DEFAULT_TIER) === "partner";
  const { full, left } = allowToday([
    ...(s.account ? [{ key: `acct:${s.account}`, cap: CHAT_PER_DAY }] : []),
    { key: ip, cap: IP_CHAT_PER_DAY },
    ...(partner
      ? [...(s.account ? [{ key: `partner:acct:${s.account}`, cap: PARTNER_PER_DAY }] : []), { key: `partner:${ip}`, cap: IP_PARTNER_PER_DAY }]
      : []),
  ]);
  if (full) return Response.json({ error: LIMIT_REACHED[budgetOf(full)] }, { status: 429 });
  const { id, think, pane, tier } = body.data;

  try {
    ensureConversation(id, ownerOf(s), text);
  } catch (e) {
    if (e instanceof NotYours) return Response.json({ error: "Not found." }, { status: 404 });
    throw e;
  }

  const guard = new Guard();
  const tools = buildTools(guard, { account: s.account, conversationId: id, network: s.network });
  // A resent message (retry) replaces the stored copy and everything after it.
  const stored = loadMessages(id);
  const at = stored.findIndex((m) => m.id === message.id);
  const history = at >= 0 ? stored.slice(0, at) : stored;
  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: [...history, message], tools });
  } catch {
    // Stored messages from an older tool shape: keep going with just the new one.
    messages = [message];
  }
  // Saved now so the question survives a Stop or a dropped connection.
  saveMessages(id, messages);

  // A guest can price swaps but not propose one: proposals belong to a signed-in wallet.
  const names = (Object.keys(tools) as (keyof typeof tools)[]).filter((n) => s.account || n !== "propose_swap");
  // On NEAR AI every model call is captured byte for byte, to verify the reply once it's done.
  // Private replies come back whole, so the model's own TEE signs them.
  const calls: Call[] = [];
  const pick = tier as Parameters<typeof chatModel>[1];
  const whole = { current: false };
  const llm = chatModel(Boolean(think), pick, VERIFY ? { fetch: capturingFetch(calls, () => whole.current) } : {});
  whole.current = llm.tier === "private";
  const result = streamText({
    model: llm.model,
    instructions: instructions({ account: s.account, now: new Date(), canSwap: Boolean(s.account), pane, network: s.network.id }),
    messages: await convertToModelMessages(recent(messages), { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(8),
    maxOutputTokens: think ? MAX_OUTPUT.think : MAX_OUTPUT.normal,
    prepareStep: () => ({ activeTools: guard.active(names) }),
    // Normal mode answers from tool results and should be quick; Think mode takes its time.
    ...(llm.reasoning ? { reasoning: llm.reasoning } : {}),
    abortSignal: req.signal,
    timeout: { totalMs: 240_000, toolMs: 60_000 },
    maxRetries: 1,
    // One line per reply, so the real cost per message can be read from the logs. No account or text.
    onEnd: ({ stepNumber, finishReason, totalUsage }) => logUsage(llm, Boolean(think), stepNumber + 1, finishReason, [totalUsage]),
    // Stopped or timed out: the steps that finished were still paid for.
    onAbort: ({ steps }) => logUsage(llm, Boolean(think), steps.length, "aborted", steps.map((x) => x.usage)),
  });

  return createUIMessageStreamResponse({
    // What is left of the tightest budget, for the chat's "left today" hint.
    headers: left ? { "x-chat-left": `${left.n} ${budgetOf(left.key)}` } : undefined,
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      sendReasoning: true,
      onEnd: ({ messages: all }) => {
        saveMessages(id, all);
        const last = all.at(-1);
        if (VERIFY && last?.role === "assistant" && calls.length) {
          markPending(id, last.id);
          void verifyReply(id, last.id, calls, llm.tier);
        }
      },
      onError: (e) => {
        console.error("chat stream error", e);
        return friendly(e);
      },
    }),
  });
}

/** The budget a usage key counts. */
const budgetOf = (key: string): Budget =>
  key.startsWith("partner:") ? (key.startsWith("partner:ip:") ? "partner-network" : "partner") : key.startsWith("ip:") ? "network" : "wallet";

const SWITCH = "Switch to Private or Incognito to keep going; Partner resets at 00:00 UTC.";
const LIMIT_REACHED: Record<Budget, string> = {
  wallet: `You've reached today's limit of ${CHAT_PER_DAY} messages. It resets at 00:00 UTC.`,
  network: `This network has used today's ${IP_CHAT_PER_DAY} messages (shared by everyone on it, such as the same wifi). It resets at 00:00 UTC.`,
  partner: `You've used today's ${PARTNER_PER_DAY} Partner messages. ${SWITCH}`,
  "partner-network": `This network has used today's ${IP_PARTNER_PER_DAY} Partner messages (shared by everyone on it). ${SWITCH}`,
};

/** One "chat usage" log line per reply: tokens summed over its steps. No account, IP or text. */
function logUsage(llm: { tier?: string; id: string }, think: boolean, steps: number, finish: string, usage: LanguageModelUsage[]) {
  const sum = (f: (u: LanguageModelUsage) => number | undefined) => usage.reduce((n, u) => n + (f(u) ?? 0), 0);
  console.log(
    "chat usage",
    JSON.stringify({
      tier: llm.tier ?? null,
      model: llm.id,
      think,
      steps,
      finish,
      in: sum((u) => u.inputTokens),
      cached: sum((u) => u.inputTokenDetails?.cacheReadTokens),
      out: sum((u) => u.outputTokens),
      reasoning: sum((u) => u.outputTokenDetails?.reasoningTokens),
    }),
  );
}

/** The last HISTORY messages, then the oldest dropped until they fit HISTORY_CHARS. The newest always stays. */
function recent(messages: UIMessage[]): UIMessage[] {
  const kept = messages.slice(-HISTORY);
  let size = kept.reduce((n, m) => n + JSON.stringify(m.parts).length, 0);
  while (kept.length > 1 && size > HISTORY_CHARS) size -= JSON.stringify(kept.shift()!.parts).length;
  return kept;
}

/** Errors written for the user (a made-up contract, an expired quote): their text is shown as is. */
const FOR_USER = [SwapError, TokenNotFound, AccountNotFound, WebCapError];

function friendly(e: unknown): string {
  if (FOR_USER.some((C) => e instanceof C)) return (e as Error).message;
  const msg = e instanceof Error ? e.message : String(e);
  if (/401|unauthor|api key/i.test(msg)) return "The AI model rejected the server's API key.";
  if (/429|rate/i.test(msg)) return "The AI model is rate-limited right now. Try again in a minute.";
  if (/timeout|timed out|abort/i.test(msg)) return "That took too long and was stopped. Try again.";
  return "Something went wrong while answering. Try again.";
}
