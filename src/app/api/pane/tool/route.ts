import { z } from "zod";
import { Guard } from "@/lib/agent/guard";
import { runTool } from "@/lib/agent/run-tool";
import { buildTools } from "@/lib/agent/tools";
import { readSession } from "@/lib/auth/session";
import { allow } from "@/lib/chat/rate-limit";
import { access, denied } from "@/lib/gate/access";
import { crossSite } from "@/lib/http/same-site";

/** Read-only tools the side pane runs directly: token search, swap quotes and the launch screen. Quotes are open to all; the rest are for holders. */

const PANE_TOOLS = ["search_token", "quote_swap", "find_tokens"] as const;
const Body = z.object({ name: z.enum(PANE_TOOLS), args: z.record(z.string(), z.unknown()) });

export async function POST(req: Request) {
  const refused = crossSite(req);
  if (refused) return refused;
  const s = await readSession();
  if (!s) return Response.json({ error: "No session. Reload the page." }, { status: 401 });
  if (!allow(s.id)) return Response.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request." }, { status: 400 });
  if (body.data.name !== "quote_swap") {
    const a = await access(s.account);
    if (!a.ok) return denied(a);
  }
  const tools = buildTools(new Guard(), { account: s.account, conversationId: null, network: s.network });
  const r = await runTool(tools[body.data.name] as never, body.data.args);
  if (!r.ok) return Response.json({ error: r.error }, { status: 422 });
  return Response.json(r.output);
}
