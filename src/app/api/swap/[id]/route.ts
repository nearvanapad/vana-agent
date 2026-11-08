import type { NextRequest } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { SwapError } from "@/lib/swap/assets";
import { approveSwap, refreshSwap, rejectSwap, sentSwap, submitSwap, unwrappedSwap, unwrapSwap } from "@/lib/swap/service";

/**
 * One proposed swap, for the signed-in wallet that it was proposed to.
 * GET: its state (asks 1Click or the chain while it settles).
 * POST approve: real quote + the transactions to sign (none for a deposit swap, which gets its deposit address).
 * POST submitted / rejected / failed: what the wallet did. POST sent: the user sent a deposit swap's transfer.
 * POST unwrap: the transaction that turns the wNEAR a finished swap paid out into NEAR; unwrapped: it was signed.
 */

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("submitted"), txHash: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,64}$/).nullable() }),
  z.object({ action: z.literal("sent"), txHash: z.string().max(128).nullable().optional() }),
  z.object({ action: z.literal("unwrap") }),
  z.object({ action: z.literal("unwrapped"), txHash: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,64}$/).nullable() }),
  z.object({ action: z.literal("rejected") }),
  z.object({ action: z.literal("failed"), txHash: z.string().max(64).optional(), reason: z.string().max(300) }),
]);

async function account() {
  const s = await readSession();
  return s?.account ?? null;
}

function fail(e: unknown) {
  if (e instanceof SwapError) return Response.json({ error: e.message }, { status: 409 });
  console.error("swap error", e);
  return Response.json({ error: "Something went wrong with the swap. Try again." }, { status: 500 });
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/swap/[id]">) {
  const { id } = await ctx.params;
  const who = await account();
  if (!who) return Response.json({ error: "Sign in with your wallet to see this swap." }, { status: 401 });
  try {
    return Response.json(await refreshSwap(id, who));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/swap/[id]">) {
  const { id } = await ctx.params;
  const who = await account();
  if (!who) return Response.json({ error: "Sign in with your wallet to approve swaps." }, { status: 401 });
  const body = Action.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request." }, { status: 400 });
  try {
    const a = body.data;
    switch (a.action) {
      case "approve":
        return Response.json(await approveSwap(id, who));
      case "submitted":
        return Response.json({ swap: await submitSwap(id, who, a.txHash) });
      case "sent":
        return Response.json({ swap: await sentSwap(id, who, a.txHash ?? null) });
      case "unwrap":
        return Response.json(await unwrapSwap(id, who));
      case "unwrapped":
        return Response.json({ swap: unwrappedSwap(id, who, a.txHash) });
      case "rejected":
        return Response.json({ swap: rejectSwap(id, who) });
      case "failed":
        return Response.json({ swap: rejectSwap(id, who, { txHash: a.txHash, reason: a.reason }) });
    }
  } catch (e) {
    return fail(e);
  }
}
