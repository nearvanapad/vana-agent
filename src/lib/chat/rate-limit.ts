import { getDb } from "../db";

/** Messages a session may send per minute. In memory: one server process. */
const PER_MINUTE = 12;
const recent = new Map<string, number[]>();

export function allow(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= PER_MINUTE) return false;
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 10_000) for (const [k, v] of recent) if (v.every((t) => now - t >= 60_000)) recent.delete(k);
  return true;
}


/**
 * The visitor's IP. The only way in is Cloudflare (Caddy refuses anything else), which sets
 * cf-connecting-ip; x-forwarded-for is the fallback for a direct run.
 */
export function ipOf(req: Request): string {
  const h = req.headers;
  return h.get("cf-connecting-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

const today = () => new Date().toISOString().slice(0, 10);
let pruned = "";

/**
 * Counts one chat message against each key (an IP, a wallet) for today, unless one of them has
 * used up its daily cap already; then nothing is counted and that key is returned. Null means the
 * message was counted. Kept in SQLite, so a restart doesn't hand out a fresh day.
 */
export function allowToday(limits: { key: string; cap: number }[]): string | null {
  const db = getDb();
  const day = today();
  if (pruned !== day) {
    db.prepare("DELETE FROM usage WHERE day < ?").run(day);
    pruned = day;
  }
  const get = db.prepare("SELECT n FROM usage WHERE key = ? AND day = ?");
  const bump = db.prepare("INSERT INTO usage (key, day, n) VALUES (?, ?, 1) ON CONFLICT (key, day) DO UPDATE SET n = n + 1");
  return db.transaction(() => {
    const full = limits.find(({ key, cap }) => ((get.get(key, day) as { n: number } | undefined)?.n ?? 0) >= cap);
    if (full) return full.key;
    for (const { key } of limits) bump.run(key, day);
    return null;
  })();
}
