import { z } from "zod";
import { reportProgress } from "@/lib/agent/report-stream";
import { reportView } from "@/lib/agent/tools";
import { readSession } from "@/lib/auth/session";
import { allow } from "@/lib/chat/rate-limit";
import { access, denied } from "@/lib/gate/access";
import { normalizeToken } from "@/lib/risk/report";

/**
 * A risk check the user started from the side pane, without the chat. Streams NDJSON: one line
 * per check as it lands (`{pending:true, …}`), then the finished report, or `{error}`.
 */

const Body = z.object({ token: z.string().min(2).max(80), fresh: z.boolean().optional() });

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return Response.json({ error: "No session. Reload the page." }, { status: 401 });
  const a = await access(s.account);
  if (!a.ok) return denied(a);
  if (!allow(s.id)) return Response.json({ error: "Too many checks. Wait a minute and try again." }, { status: 429 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request." }, { status: 400 });
  let token: string;
  try {
    token = normalizeToken(body.data.token);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      const line = (v: unknown) => c.enqueue(enc.encode(`${JSON.stringify(v)}\n`));
      try {
        const run = reportProgress(token, { fresh: body.data.fresh });
        let step = await run.next();
        while (!step.done) {
          line(step.value);
          step = await run.next();
        }
        line(reportView(step.value));
      } catch (e) {
        line({ error: e instanceof Error ? e.message : String(e) });
      }
      c.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
