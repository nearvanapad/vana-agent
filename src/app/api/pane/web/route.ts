import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { allow } from "@/lib/chat/rate-limit";
import { access, denied } from "@/lib/gate/access";
import { normalizeToken, storedReport } from "@/lib/risk/report";
import { WebCapError, webCheck, WEB_SEARCH } from "@/lib/risk/web";
import { crossSite } from "@/lib/http/same-site";

/** "On the web" for a token already checked in the side pane. Only when the user turned web search on. */

const Body = z.object({ token: z.string().min(2).max(80) });

export async function POST(req: Request) {
  const refused = crossSite(req);
  if (refused) return refused;
  if (!WEB_SEARCH) return Response.json({ error: "Web search isn't available on this server." }, { status: 503 });
  const s = await readSession();
  if (!s) return Response.json({ error: "No session. Reload the page." }, { status: 401 });
  const a = await access(s.account);
  if (!a.ok) return denied(a);
  if (!allow(s.id)) return Response.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request." }, { status: 400 });
  let token: string;
  try {
    token = normalizeToken(body.data.token);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  // Only tokens just checked: the search uses the report's name and symbol.
  const report = storedReport(token);
  if (!report) return Response.json({ error: "Check the token first." }, { status: 409 });
  try {
    return Response.json(await webCheck(report, s.account ?? s.id));
  } catch (e) {
    if (e instanceof WebCapError) return Response.json({ error: e.message }, { status: 429 });
    console.error("web check", e);
    return Response.json({ error: (e as Error).message || "Web search failed." }, { status: 502 });
  }
}
