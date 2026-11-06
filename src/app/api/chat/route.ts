import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { Guard } from "@/lib/agent/guard";
import { chatModel, llmConfigured } from "@/lib/agent/model";
import { instructions } from "@/lib/agent/prompt";
import { buildTools } from "@/lib/agent/tools";
import { ownerOf, readSession } from "@/lib/auth/session";
import { CONVERSATION_ID, ensureConversation, loadMessages, NotYours, saveMessages, titleFrom } from "@/lib/chat/store";
import { allow } from "@/lib/chat/rate-limit";
import { access, denied } from "@/lib/gate/access";

const Id = z.string().max(120).regex(/^[A-Za-z0-9._:-]+$/);
const Body = z.object({
  id: z.string().regex(CONVERSATION_ID),
  message: z.object({ id: z.string().max(64), role: z.literal("user"), parts: z.array(z.unknown()).min(1).max(20) }).passthrough(),
  think: z.boolean().optional(),
  // What the side pane shows, so "this token" can be resolved. Ids only, never free text.
  pane: z
    .object({
      open: z.boolean(),
      tab: z.enum(["check", "swap"]),
      focus: Id.nullable(),
      shown: z.array(Id).max(12),
      checked: z.array(Id).max(10),
      swap: z.object({ from: Id.or(z.literal("")), to: Id.or(z.literal("")), amount: z.string().max(40).regex(/^[\d.]*$/) }).nullable(),
    })
    .optional(),
});

/** Longest user message accepted, in characters. */
const MAX_INPUT = 4000;
/** Earlier messages sent to the model; older ones stay stored but are left out. */
const HISTORY = 30;

export async function POST(req: Request) {
  if (!llmConfigured()) return Response.json({ error: "The AI model is not configured on this server (LLM_API_KEY)." }, { status: 503 });
  const s = await readSession();
  if (!s) return Response.json({ error: "No session. Reload the page." }, { status: 401 });
  const a = await access(s.account);
  if (!a.ok) return denied(a);
  if (!allow(s.id)) return Response.json({ error: "Too many messages. Wait a minute and try again." }, { status: 429 });

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { id, think, pane } = body.data;
  const message = body.data.message as unknown as UIMessage;
  const text = titleFrom(message);
  if (JSON.stringify(message.parts).length > MAX_INPUT * 2 || text.length === 0) {
    return Response.json({ error: "Message is empty or too long." }, { status: 400 });
  }

  try {
    ensureConversation(id, ownerOf(s), text);
  } catch (e) {
    if (e instanceof NotYours) return Response.json({ error: "Not found." }, { status: 404 });
    throw e;
  }

  const guard = new Guard();
  const tools = buildTools(guard, { account: s.account, conversationId: id });
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
  const result = streamText({
    model: chatModel(Boolean(think)),
    instructions: instructions({ account: s.account, now: new Date(), canSwap: Boolean(s.account), pane }),
    messages: await convertToModelMessages(messages.slice(-HISTORY), { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(8),
    prepareStep: () => ({ activeTools: guard.active(names) }),
    // Normal mode answers from tool results and should be quick; Think mode takes its time.
    reasoning: think ? "high" : "low",
    abortSignal: req.signal,
    timeout: { totalMs: 240_000, toolMs: 60_000 },
    maxRetries: 1,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      sendReasoning: true,
      onEnd: ({ messages: all }) => saveMessages(id, all),
      onError: (e) => {
        console.error("chat stream error", e);
        return friendly(e);
      },
    }),
  });
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/401|unauthor|api key/i.test(msg)) return "The AI model rejected the server's API key.";
  if (/429|rate/i.test(msg)) return "The AI model is rate-limited right now. Try again in a minute.";
  if (/timeout|timed out|abort/i.test(msg)) return "That took too long and was stopped. Try again.";
  return "Something went wrong while answering. Try again.";
}
