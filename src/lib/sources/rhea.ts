import { cached } from "../db";
import { tryView, view } from "../near/rpc";
import { getJson, mapLimit, memo, sourced, type Sourced } from "./http";

/** Rhea (Ref) classic AMM: constant-product, stable and rated pools. */
export const CLASSIC = "v2.ref-finance.near";
/** Rhea concentrated-liquidity (DCL) pools. */
export const DCL = "dclv2.ref-labs.near";

const APP = "https://app.rhea.finance";
const PAGE = 1000;

export const classicPoolUrl = (id: number) => `${APP}/pool/${id}`;
export const dclPoolUrl = (id: string) => `${APP}/poolV2/${id.replaceAll("|", "@")}`;

type ClassicPoolRaw = {
  pool_kind: string;
  token_account_ids: string[];
  amounts: string[];
  total_fee: number;
  shares_total_supply: string;
};

type DclPoolRaw = {
  pool_id: string;
  token_x: string;
  token_y: string;
  fee: number;
  total_x: string;
  total_y: string;
  state: string;
  /** Pool-level tax, when the pool charges one. */
  tax?: unknown;
};

export type Pool = {
  kind: "classic" | "dcl";
  id: string;
  tokens: string[];
  /** Raw reserve per token, same order as `tokens`. */
  amounts: string[];
  /** Fee in bps of the trade. */
  fee_bps: number;
  state?: string;
  tax?: unknown;
  shares_total_supply?: string;
  url: string;
};

const classicPool = (id: number, p: ClassicPoolRaw): Pool => ({
  kind: "classic",
  id: String(id),
  tokens: p.token_account_ids,
  amounts: p.amounts,
  fee_bps: p.total_fee,
  shares_total_supply: p.shares_total_supply,
  url: classicPoolUrl(id),
});

const dclPool = (p: DclPoolRaw): Pool => ({
  kind: "dcl",
  id: p.pool_id,
  tokens: [p.token_x, p.token_y],
  amounts: [p.total_x, p.total_y],
  // DCL fee is in hundredths of a bp: 2000 = 0.2%
  fee_bps: p.fee / 100,
  state: p.state,
  tax: p.tax ?? null,
  url: dclPoolUrl(p.pool_id),
});

type PoolIndex = {
  built_at: string;
  pools: Pool[];
  /** token → positions in `pools` */
  by_token: Record<string, number[]>;
};

/** Every pool on both Rhea contracts with its reserves (~16 large views). Kept for 10 minutes. */
const INDEX_TTL = 10 * 60_000;
const poolIndex = memo(INDEX_TTL, () => cached("rhea:pool-index:v2", INDEX_TTL, buildPoolIndex));

async function buildPoolIndex(): Promise<PoolIndex> {
  const [classicCount, dclMeta] = await Promise.all([
    view<number>(CLASSIC, "get_number_of_pools"),
    view<{ pool_count: number }>(DCL, "get_metadata"),
  ]);
  const pages = [
    ...Array.from({ length: Math.ceil(classicCount / PAGE) }, (_, i) => ({ kind: "classic" as const, from: i * PAGE })),
    ...Array.from({ length: Math.ceil(dclMeta.pool_count / PAGE) }, (_, i) => ({ kind: "dcl" as const, from: i * PAGE })),
  ];
  const chunks = await mapLimit(pages, 2, async ({ kind, from }) =>
    kind === "classic"
      ? (await patient(() => view<ClassicPoolRaw[]>(CLASSIC, "get_pools", { from_index: from, limit: PAGE }))).map((p, i) =>
          classicPool(from + i, p),
        )
      : (await patient(() => view<DclPoolRaw[]>(DCL, "list_pools", { from_index: from, limit: PAGE }))).map(dclPool),
  );
  // empty pools can't be traded against; leaving them out keeps the cache small
  const pools = chunks.flat().filter((p) => p.amounts.some((a) => a !== "0"));
  const by_token: Record<string, number[]> = {};
  pools.forEach((p, i) => p.tokens.forEach((t) => (by_token[t] ??= []).push(i)));
  return { built_at: new Date().toISOString(), pools, by_token };
}

async function freshPool(p: { kind: Pool["kind"]; id: string }): Promise<Pool | null> {
  if (p.kind === "classic") {
    const raw = await tryView<ClassicPoolRaw>(CLASSIC, "get_pool", { pool_id: Number(p.id) });
    return raw ? classicPool(Number(p.id), raw) : null;
  }
  const raw = await tryView<DclPoolRaw>(DCL, "get_pool", { pool_id: p.id });
  return raw ? dclPool(raw) : null;
}

/** Up to this many pools are re-read live; tokens with more use the index's reserves (at most 10 minutes old). */
const FRESH_POOLS = 10;

/** Retries a large view a few times with a pause: free RPCs throttle bursts of big responses. */
async function patient<T>(load: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await load();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

/** Quote assets and fee tiers DCL pools are usually opened with. */
const DCL_QUOTES = ["wrap.near", "usdt.tether-token.near", "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"];
const DCL_FEES = [100, 400, 2000, 10000];

/** Without the index: the token's DCL pools against the common quotes, found by their predictable ids. */
async function likelyDclPools(token: string, extra: string[]): Promise<string[]> {
  const ids = new Set(extra);
  for (const q of DCL_QUOTES) {
    if (q === token) continue;
    const [x, y] = [token, q].sort();
    for (const fee of DCL_FEES) ids.add(`${x}|${y}|${fee}`);
  }
  const found = await mapLimit([...ids], 4, async (id) => ((await tryView<DclPoolRaw>(DCL, "get_pool", { pool_id: id })) ? id : null));
  return found.filter((id): id is string => id !== null);
}

/**
 * Every Rhea pool that holds `token`. `knownDcl` adds pools found elsewhere (a launchpad's pool),
 * which may be newer than the index. When the index can't be built, falls back to DCL pools
 * against the common quotes, and says so in `partial`.
 */
export async function poolsFor(token: string, knownDcl: string[] = []): Promise<Sourced<Pool[]> & { partial: boolean }> {
  const idx = await poolIndex().catch(() => null);
  let refs: { kind: Pool["kind"]; id: string }[];
  let indexed: Pool[] = [];
  if (idx) {
    indexed = (idx.by_token[token] ?? []).map((i) => idx.pools[i]!);
    const extra = knownDcl.filter((id) => !indexed.some((p) => p.id === id));
    refs = [...indexed, ...extra.map((id) => ({ kind: "dcl" as const, id }))];
  } else {
    refs = (await likelyDclPools(token, knownDcl)).map((id) => ({ kind: "dcl" as const, id }));
  }

  if (idx && refs.length > FRESH_POOLS) {
    const extra = await mapLimit(refs.slice(indexed.length), 4, freshPool);
    const all = [...indexed, ...extra.filter((p): p is Pool => p !== null)];
    return { ...sourced(all, "Rhea", `${APP}/pools`, new Date(idx.built_at)), partial: false };
  }
  const fresh = (await mapLimit(refs, 4, freshPool)).filter((p): p is Pool => p !== null);
  return { ...sourced(fresh, "Rhea", `${APP}/pools`), partial: !idx };
}

/** How many live Rhea pools hold `token`, from the index; null when the index can't be built. */
export async function poolCount(token: string): Promise<number | null> {
  const idx = await poolIndex().catch(() => null);
  return idx ? (idx.by_token[token]?.length ?? 0) : null;
}

export type Price = { price: number; symbol: string; decimals: number };

/** USD price of every token Rhea lists. Kept for 5 minutes. */
export const prices = memo(5 * 60_000, async (): Promise<Sourced<Map<string, Price>>> => {
  const url = "https://api.ref.finance/list-token-price";
  const r = await getJson<Record<string, { price: string; symbol: string; decimal: number }>>(url, { timeoutMs: 20_000 });
  const map = new Map<string, Price>();
  for (const [token, p] of Object.entries(r)) {
    const price = Number(p.price);
    if (Number.isFinite(price)) map.set(token, { price, symbol: p.symbol, decimals: p.decimal });
  }
  return sourced(map, "Rhea", url);
});

/** Tokens Rhea marks as verified. Kept for an hour. */
export const whitelist = memo(60 * 60_000, async () => new Set(await view<string[]>(CLASSIC, "get_whitelisted_tokens")));

/** LP shares `account` holds in a classic pool, raw. */
export async function poolShares(poolId: number, account: string): Promise<string> {
  return (await tryView<string>(CLASSIC, "get_pool_shares", { pool_id: poolId, account_id: account })) ?? "0";
}

/** Owner of a DCL liquidity position. */
export async function positionOwner(lptId: string): Promise<string | null> {
  const r = await tryView<{ owner_id: string }>(DCL, "get_liquidity", { lpt_id: lptId });
  return r?.owner_id ?? null;
}
