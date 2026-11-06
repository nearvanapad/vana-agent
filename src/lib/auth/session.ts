import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getDb } from "../db";

/**
 * A browser session lives in an httpOnly cookie. It starts as a guest (read-only: chat and risk
 * checks) and becomes tied to a wallet account after NEP-413 sign-in. Only a hash of the cookie
 * is stored.
 */

const COOKIE = "vana_session";
const MAX_AGE_S = 30 * 24 * 3600;

export type Session = { id: string; account: string | null };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Conversations belong to the account once signed in, else to the guest session. */
export const ownerOf = (s: Session) => s.account ?? `guest:${s.id}`;

export async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const id = hash(token);
  const row = getDb().prepare("SELECT account, last_seen FROM sessions WHERE id = ?").get(id) as
    | { account: string | null; last_seen: number }
    | undefined;
  if (!row || Date.now() - row.last_seen > MAX_AGE_S * 1000) return null;
  if (Date.now() - row.last_seen > 3600_000) {
    getDb().prepare("UPDATE sessions SET last_seen = ? WHERE id = ?").run(Date.now(), id);
  }
  return { id, account: row.account };
}

/**
 * Whether the browser reached us over https. Behind the proxy that is `x-forwarded-proto`; a
 * direct http visit (http://127.0.0.1:3000) gets a cookie without `Secure`, or the browser would
 * drop it and every request would start a new guest with no chats.
 */
async function overHttps(): Promise<boolean> {
  const proto = (await headers()).get("x-forwarded-proto");
  return proto?.split(",")[0]?.trim() === "https";
}

/** The current session, starting a guest one (and setting the cookie) when there is none. */
export async function ensureSession(): Promise<Session> {
  const s = await readSession();
  if (s) return s;
  const token = randomBytes(32).toString("base64url");
  const id = hash(token);
  const now = Date.now();
  getDb().prepare("INSERT INTO sessions (id, account, created_at, last_seen) VALUES (?, NULL, ?, ?)").run(id, now, now);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await overHttps(),
    path: "/",
    maxAge: MAX_AGE_S,
  });
  return { id, account: null };
}

/** Ties the session to `account` and hands it the conversations started as a guest. */
export function signIn(s: Session, account: string): Session {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE sessions SET account = ?, last_seen = ? WHERE id = ?").run(account, Date.now(), s.id);
    db.prepare("UPDATE conversations SET owner = ? WHERE owner = ?").run(account, `guest:${s.id}`);
  })();
  return { ...s, account };
}

export function signOut(s: Session): Session {
  getDb().prepare("UPDATE sessions SET account = NULL WHERE id = ?").run(s.id);
  return { ...s, account: null };
}
