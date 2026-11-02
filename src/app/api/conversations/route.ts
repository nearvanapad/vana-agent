import { ensureSession, ownerOf } from "@/lib/auth/session";
import { listConversations } from "@/lib/chat/store";

export async function GET() {
  const s = await ensureSession();
  return Response.json({ conversations: listConversations(ownerOf(s)) });
}
