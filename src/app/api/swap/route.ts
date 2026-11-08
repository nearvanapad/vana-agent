import { z } from "zod";
import { ownerOf, readSession } from "@/lib/auth/session";
import { allow } from "@/lib/chat/rate-limit";
import { CONVERSATION_ID, ownsConversation } from "@/lib/chat/store";
import { SwapError } from "@/lib/swap/assets";
import { proposeSwap } from "@/lib/swap/service";

/**
 * A swap the user filled in by hand in the side pane: the same approval card the chat makes,
 * with the last token check of the token bought, if any. The user typed it, so no prompt-injection guard applies.
 */

const Body = z.object({
  from: z.string().min(2).max(120),
  to: z.string().min(2).max(120),
  amount: z.string().min(1).max(40),
  slippage_pct: z.number().min(0.1).max(5).optional(),
  recipient: z.string().max(128).optional(),
  refund_to: z.string().max(128).optional(),
  conversationId: z.string().regex(CONVERSATION_ID).optional(),
});

export async function POST(req: Request) {
  const s = await readSession();
  if (!s?.account) return Response.json({ error: "Sign in with your wallet to swap." }, { status: 401 });
  if (!allow(s.id)) return Response.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { conversationId, ...input } = body.data;
  const conv = conversationId && ownsConversation(conversationId, ownerOf(s)) ? conversationId : null;
  try {
    return Response.json(await proposeSwap(input, s.account, conv));
  } catch (e) {
    if (e instanceof SwapError || e instanceof Error) return Response.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
