import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * One SQLite file holds everything the app keeps: cached risk reports and lookups now; sessions,
 * conversations and swaps later. Opened once per process; WAL so readers never wait on a write.
 */

const MIGRATIONS = [
  `CREATE TABLE reports (
     token TEXT PRIMARY KEY,
     level TEXT NOT NULL,
     json TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE kv (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     expires_at INTEGER
   )`,
];

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const path = resolve(process.env.DATABASE_PATH ?? "./data/vana.db");
  mkdirSync(dirname(path), { recursive: true });
  const d = new Database(path);
  d.pragma("journal_mode = WAL");
  d.pragma("busy_timeout = 5000");
  const version = d.pragma("user_version", { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    d.transaction(() => {
      d.exec(MIGRATIONS[v]!);
      d.pragma(`user_version = ${v + 1}`);
    })();
  }
  d.prepare("DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at < ?").run(Date.now());
  db = d;
  return d;
}

/** Small JSON cache. `ttlMs` null keeps the value forever. */
export const kv = {
  get<T>(key: string): T | null {
    const row = getDb().prepare("SELECT value, expires_at FROM kv WHERE key = ?").get(key) as
      | { value: string; expires_at: number | null }
      | undefined;
    if (!row || (row.expires_at !== null && row.expires_at < Date.now())) return null;
    return JSON.parse(row.value) as T;
  },
  set(key: string, value: unknown, ttlMs: number | null) {
    getDb()
      .prepare("INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)")
      .run(key, JSON.stringify(value), ttlMs === null ? null : Date.now() + ttlMs);
  },
};

/** Reads `key` from the cache, or loads it and keeps it for `ttlMs`. */
export async function cached<T>(key: string, ttlMs: number | null, load: () => Promise<T>): Promise<T> {
  const hit = kv.get<T>(key);
  if (hit !== null) return hit;
  const value = await load();
  kv.set(key, value, ttlMs);
  return value;
}
