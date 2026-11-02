import type { UIMessage } from "ai";
import { getDb } from "../db";

/** Conversations and their messages, stored as the UI messages the chat renders. */

export type ConversationRow = { id: string; title: string; updated_at: number };

export class NotYours extends Error {}

export const CONVERSATION_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function listConversations(owner: string, limit = 50): ConversationRow[] {
  return getDb()
    .prepare("SELECT id, title, updated_at FROM conversations WHERE owner = ? ORDER BY updated_at DESC LIMIT ?")
    .all(owner, limit) as ConversationRow[];
}

/** Creates the conversation on first use. Throws when it belongs to someone else. */
export function ensureConversation(id: string, owner: string, title: string) {
  const db = getDb();
  const row = db.prepare("SELECT owner FROM conversations WHERE id = ?").get(id) as { owner: string } | undefined;
  if (row && row.owner !== owner) throw new NotYours();
  if (!row) {
    const now = Date.now();
    db.prepare("INSERT INTO conversations (id, owner, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      owner,
      title.slice(0, 80) || "New chat",
      now,
      now,
    );
  }
}

export function ownsConversation(id: string, owner: string): boolean {
  const row = getDb().prepare("SELECT owner FROM conversations WHERE id = ?").get(id) as { owner: string } | undefined;
  return row?.owner === owner;
}

export function loadMessages(id: string): UIMessage[] {
  const rows = getDb().prepare("SELECT json FROM messages WHERE conversation_id = ? ORDER BY seq").all(id) as { json: string }[];
  return rows.map((r) => JSON.parse(r.json) as UIMessage);
}

/** Replaces the stored thread with `messages` (the full list, in order). */
export function saveMessages(id: string, messages: UIMessage[]) {
  const db = getDb();
  const now = Date.now();
  db.transaction(() => {
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
    const insert = db.prepare("INSERT INTO messages (id, conversation_id, seq, role, json, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    messages.forEach((m, i) => insert.run(m.id, id, i, m.role, JSON.stringify(m), now));
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now, id);
  })();
}

export function deleteConversation(id: string, owner: string): boolean {
  return getDb().prepare("DELETE FROM conversations WHERE id = ? AND owner = ?").run(id, owner).changes > 0;
}

/** First line of the user's first message, as the conversation title. */
export function titleFrom(m: UIMessage): string {
  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}
