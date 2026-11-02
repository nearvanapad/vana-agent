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
