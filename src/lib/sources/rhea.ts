import { cached } from "../db";
import { MAINNET, net, netKey } from "../near/network";
import { tryView, view } from "../near/rpc";
import { getJson, mapLimit, memo, perNetwork, sourced, type Sourced } from "./http";

/** Rhea (Ref) classic AMM on the current network: constant-product, stable and rated pools. */
export const classic = () => net().classic;
/** Rhea concentrated-liquidity (DCL) pools on the current network. */
export const dcl = () => net().dcl;
/** Mainnet contracts, for the swap route (mainnet only). */
export const CLASSIC = MAINNET.classic;
export const DCL = MAINNET.dcl;

const APP = () => net().rheaApp;
const PAGE = 1000;

export const classicPoolUrl = (id: number) => `${APP()}/pool/${id}`;
export const dclPoolUrl = (id: string) => `${APP()}/poolV2/${id.replaceAll("|", "@")}`;

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
  /** Classic pools that existed when it was built: newer ones are read on top. */
  classic_count?: number;
};

/** Every pool on both Rhea contracts with its reserves (~16 large views). Kept for 10 minutes. */
const INDEX_TTL = 10 * 60_000;
const poolIndex = perNetwork(() => memo(INDEX_TTL, () => cached(netKey("rhea:pool-index:v3"), INDEX_TTL, buildPoolIndex)));

async function buildPoolIndex(): Promise<PoolIndex> {
  const [classicCount, dclMeta] = await Promise.all([
    view<number>(classic(), "get_number_of_pools"),
    view<{ pool_count: number }>(dcl(), "get_metadata"),
  ]);
  const pages = [
    ...Array.from({ length: Math.ceil(classicCount / PAGE) }, (_, i) => ({ kind: "classic" as const, from: i * PAGE })),
    ...Array.from({ length: Math.ceil(dclMeta.pool_count / PAGE) }, (_, i) => ({ kind: "dcl" as const, from: i * PAGE })),
  ];
  const chunks = await mapLimit(pages, 2, async ({ kind, from }) =>
    kind === "classic"
      ? (await patient(() => view<ClassicPoolRaw[]>(classic(), "get_pools", { from_index: from, limit: PAGE }))).map((p, i) =>
          classicPool(from + i, p),
        )
      : (await patient(() => view<DclPoolRaw[]>(dcl(), "list_pools", { from_index: from, limit: PAGE }))).map(dclPool),
  );
  // empty pools can't be traded against; leaving them out keeps the cache small
  const pools = chunks.flat().filter((p) => p.amounts.some((a) => a !== "0"));
  const by_token: Record<string, number[]> = {};
  pools.forEach((p, i) => p.tokens.forEach((t) => (by_token[t] ??= []).push(i)));
  return { built_at: new Date().toISOString(), pools, by_token, classic_count: classicCount };
}

async function freshPool(p: { kind: Pool["kind"]; id: string }): Promise<Pool | null> {
  if (p.kind === "classic") {
    const raw = await tryView<ClassicPoolRaw>(classic(), "get_pool", { pool_id: Number(p.id) });
    return raw ? classicPool(Number(p.id), raw) : null;
  }
  const raw = await tryView<DclPoolRaw>(dcl(), "get_pool", { pool_id: p.id });
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
const DCL_QUOTES = () =>
  net().id === "mainnet" ? ["wrap.near", "usdt.tether-token.near", "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"] : [net().wrap];
const DCL_FEES = [100, 400, 2000, 10000];

/** Without the index: the token's DCL pools against the common quotes, found by their predictable ids. */
async function likelyDclPools(token: string, extra: string[]): Promise<string[]> {
  const ids = new Set(extra);
  for (const q of DCL_QUOTES()) {
    if (q === token) continue;
    const [x, y] = [token, q].sort();
    for (const fee of DCL_FEES) ids.add(`${x}|${y}|${fee}`);
  }
  const found = await mapLimit([...ids], 4, async (id) => ((await tryView<DclPoolRaw>(dcl(), "get_pool", { pool_id: id })) ? id : null));
  return found.filter((id): id is string => id !== null);
}

/**
 * Every Rhea pool that holds `token`. `knownDcl` adds pools found elsewhere (a launchpad's pool),
 * which may be newer than the index. When the index can't be built, falls back to DCL pools
 * against the common quotes, and says so in `partial`.
 */
/**
 * Classic pools created since `after` that hold `token`: a fresh launch's first pool. Without an
 * index it reads the newest page of pools, which is where a new token's pool sits.
 */
async function newClassicPools(idx: PoolIndex | null, token: string): Promise<Pool[]> {
  if (idx && idx.classic_count === undefined) return [];
  const now = await tryView<number>(classic(), "get_number_of_pools").catch(() => null);
  const after = idx?.classic_count ?? 0;
  if (!now || now <= after) return [];
  const from = Math.max(after, now - PAGE);
  const raw = await tryView<ClassicPoolRaw[]>(classic(), "get_pools", { from_index: from, limit: now - from }).catch(() => null);
  return (raw ?? []).map((p, i) => classicPool(from + i, p)).filter((p) => p.tokens.includes(token) && p.amounts.some((a) => a !== "0"));
}

/** Builds the pool index ahead of the first question (on server start, then before it expires). */
export const warmPools = () => poolIndex().then(() => undefined);

/** Every live pool on the current network, from the index (at most 10 minutes old). */
export async function allPools(): Promise<{ built_at: string; pools: Pool[] }> {
  const idx = await poolIndex();
  return { built_at: idx.built_at, pools: idx.pools };
}

export async function poolsFor(token: string, knownDcl: string[] = []): Promise<Sourced<Pool[]> & { partial: boolean }> {
  const idx = await poolIndex().catch(() => null);
  let refs: { kind: Pool["kind"]; id: string }[];
  let indexed: Pool[] = [];
  if (idx) {
    indexed = [...(idx.by_token[token] ?? []).map((i) => idx.pools[i]!), ...(await newClassicPools(idx, token))];
    const extra = knownDcl.filter((id) => !indexed.some((p) => p.id === id));
    refs = [...indexed, ...extra.map((id) => ({ kind: "dcl" as const, id }))];
  } else {
    const [dclIds, recent] = await Promise.all([likelyDclPools(token, knownDcl), newClassicPools(null, token)]);
    indexed = recent;
    refs = [...recent, ...dclIds.map((id) => ({ kind: "dcl" as const, id }))];
  }

  if (idx && refs.length > FRESH_POOLS) {
    const extra = await mapLimit(refs.slice(indexed.length), 4, freshPool);
    const all = [...indexed, ...extra.filter((p): p is Pool => p !== null)];
    return { ...sourced(all, "Rhea", `${APP()}/pools`, new Date(idx.built_at)), partial: false };
  }
  const fresh = (await mapLimit(refs, 4, freshPool)).filter((p): p is Pool => p !== null);
  return { ...sourced(fresh, "Rhea", `${APP()}/pools`), partial: !idx };
}

/** How many live Rhea pools hold `token`, from the index; null when the index can't be built. */
export async function poolCount(token: string): Promise<number | null> {
  const idx = await poolIndex().catch(() => null);
  return idx ? (idx.by_token[token]?.length ?? 0) : null;
}

export type Price = { price: number; symbol: string; decimals: number };

const mainnetPrices = memo(5 * 60_000, async (): Promise<Sourced<Map<string, Price>>> => {
  const url = "https://api.ref.finance/list-token-price";
  const r = await getJson<Record<string, { price: string; symbol: string; decimal: number }>>(url, { timeoutMs: 20_000 });
  const map = new Map<string, Price>();
  for (const [token, p] of Object.entries(r)) {
    const price = Number(p.price);
    if (Number.isFinite(price)) map.set(token, { price, symbol: p.symbol, decimals: p.decimal });
  }
  return sourced(map, "Rhea", url);
});

/**
 * USD price of every token Rhea lists, kept 5 minutes. Testnet tokens have no market: testnet
 * wNEAR is valued at the NEAR price so pool depth still reads in dollars, and nothing else is priced.
 */
export async function prices(): Promise<Sourced<Map<string, Price>>> {
  const p = await mainnetPrices();
  if (net().id === "mainnet") return p;
  const map = new Map<string, Price>();
  const w = p.data.get(MAINNET.wrap);
  if (w) map.set(net().wrap, { ...w, symbol: "wNEAR" });
  return { ...p, data: map };
}

/** Tokens Rhea marks as verified. Kept for an hour. */
export const whitelist = perNetwork(() => memo(60 * 60_000, async () => new Set(await view<string[]>(classic(), "get_whitelisted_tokens"))));

/** LP shares `account` holds in a classic pool, raw. */
export async function poolShares(poolId: number, account: string): Promise<string> {
  return (await tryView<string>(classic(), "get_pool_shares", { pool_id: poolId, account_id: account })) ?? "0";
}

/** Owner of a DCL liquidity position. */
export async function positionOwner(lptId: string): Promise<string | null> {
  const r = await tryView<{ owner_id: string }>(dcl(), "get_liquidity", { lpt_id: lptId });
  return r?.owner_id ?? null;
}
