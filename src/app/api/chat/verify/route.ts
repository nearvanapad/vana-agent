import type { NextRequest } from "next/server";
import { storedVerification } from "@/lib/agent/verify";
import { ownerOf, readSession } from "@/lib/auth/session";
import { ownsConversation } from "@/lib/chat/store";

/** How one reply checked out against NEAR AI's signatures and attestations: `?c=<conversation>&m=<message>`. */
export async function GET(req: NextRequest) {
  const s = await readSession();
  if (!s) return Response.json({ error: "No session." }, { status: 401 });
  const c = req.nextUrl.searchParams.get("c") ?? "";
  const m = req.nextUrl.searchParams.get("m") ?? "";
  if (!c || !m || m.length > 80 || !ownsConversation(c, ownerOf(s))) return Response.json({ error: "Not found." }, { status: 404 });
  const v = storedVerification(c, m);
  if (!v) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(v, { headers: { "cache-control": "no-store" } });
}
