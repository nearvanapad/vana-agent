/**
 * Shared fetch for the data sources: JSON, timeout, retry on rate limits and gateway errors.
 * Every source wraps its answer in `Sourced` so a number can always be cited.
 */

export type SourceRef = {
  /** Short source name, e.g. "NEAR RPC", "NearBlocks", "FastNEAR", "Rhea". */
  source: string;
  /** Where a person can check the number. */
  url: string;
  /** ISO time the data was read. */
  as_of: string;
};

export type Sourced<T> = SourceRef & { data: T };

export function ref(source: string, url: string, asOf = new Date()): SourceRef {
  return { source, url, as_of: asOf.toISOString() };
}

/** Just the citation of a sourced value, without its data. */
export const refOf = (s: SourceRef): SourceRef => ({ source: s.source, url: s.url, as_of: s.as_of });

export function sourced<T>(data: T, source: string, url: string, asOf = new Date()): Sourced<T> {
  return { data, source, url, as_of: asOf.toISOString() };
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; attempts?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(400 * 2 ** (i - 1) + Math.random() * 200);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: "application/json", ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
      });
    } catch (e) {
      last = e;
      continue;
    }
    if (RETRY_STATUS.has(res.status)) {
      last = new HttpError(`${res.status} from ${new URL(url).host}`, res.status, url);
      continue;
    }
    if (!res.ok) throw new HttpError(`${res.status} from ${new URL(url).host}`, res.status, url);
    return (await res.json()) as T;
  }
  throw last instanceof Error ? last : new Error(`fetch failed: ${url}`);
}

/**
 * POST JSON once (no retry: a quote or a submit must not be sent twice). A non-2xx answer throws
 * an HttpError carrying the body's `message` when it has one.
 */
export async function postJson<T>(url: string, body: unknown, opts: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", ...opts.headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  const json = (await res.json().catch(() => null)) as (T & { message?: unknown }) | null;
  if (!res.ok || json === null) {
    const msg = json && typeof json.message === "string" ? json.message : `${res.status} from ${new URL(url).host}`;
    throw new HttpError(msg, res.status, url);
  }
  return json;
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** In-process memo with a TTL; concurrent callers share one in-flight promise. */
export function memo<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let value: { at: number; p: Promise<T> } | null = null;
  return () => {
    if (value && Date.now() - value.at < ttlMs) return value.p;
    const p = load();
    value = { at: Date.now(), p };
    p.catch(() => {
      if (value?.p === p) value = null;
    });
    return p;
  };
}
