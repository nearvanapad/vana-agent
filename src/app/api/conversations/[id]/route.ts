import type { NextRequest } from "next/server";
import { readSession, ownerOf } from "@/lib/auth/session";
import { deleteConversation, loadMessages, ownsConversation } from "@/lib/chat/store";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const s = await readSession();
  if (!s || !ownsConversation(id, ownerOf(s))) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ id, messages: loadMessages(id) });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const s = await readSession();
  if (!s || !deleteConversation(id, ownerOf(s))) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true });
}
