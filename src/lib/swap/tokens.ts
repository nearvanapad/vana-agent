import { kv } from "../db";
import { stranger } from "../agent/guard";
import { netKey, WALLET } from "../near/network";
import { onNetwork } from "../near/network-server";
import { tryView } from "../near/rpc";
import { factoryOf as hootFactory } from "../risk/launchpad/justhoot";
import { isNearly } from "../risk/launchpad/nearly";
import { isNearvana } from "../risk/launchpad/nearvana";
import type { LaunchpadName } from "../risk/types";
import { mapLimit } from "../sources/http";
import { swapAssets } from "../sources/oneclick";
import { allPools, prices, whitelist } from "../sources/rhea";

/**
 * Tokens the swap form offers: every token with a live Rhea DCL pool against wNEAR on the
 * network swaps run on, since that is what the Rhea route can trade. Ranked so launchpad and
 * verified tokens come first, then by how much NEAR sits in their deepest pool.
 */

export type SwapToken = {
  token: string;
  /** Creator-written. */
  symbol: string;
  decimals: number;
  /** An http URL or a small data URI; null when the token has none or it is too large to list. */
  icon: string | null;
  launchpad: LaunchpadName | null;
  verified: boolean;
  /** wNEAR in the token's deepest wNEAR pool. */
  depth_near: number;
  price_usd: number | null;
};

export type SwapTokenList = { network: string; built_at: string; tokens: SwapToken[] };

type Meta = { symbol: string; decimals: number; icon: string | null } | { bad: true };

/** Pools with less NEAR than this are dust. Mainnet has thousands more tokens, so its floor is higher. */
const FLOOR = WALLET.id === "mainnet" ? 1 : 0.01;
const ICON_MAX = 6_000;

const smallIcon = (icon: unknown): string | null => {
  if (typeof icon !== "string") return null;
  if (/^https:\/\//.test(icon) && icon.length < 400) return icon;
  if (/^data:image\/(svg\+xml|png|jpeg|webp|gif)[;,]/.test(icon) && icon.length <= ICON_MAX) return icon;
  return null;
};

/** A token's ft_metadata, kept forever; a contract without one is retried after a day. */
async function meta(token: string): Promise<Meta> {
  const key = netKey(`ft-meta:${token}`);
  const hit = kv.get<Meta>(key);
  if (hit) return hit;
  const m = await tryView<{ symbol?: string; decimals?: number; icon?: string }>(token, "ft_metadata").catch(() => null);
  const out: Meta =
    m && typeof m.decimals === "number" ? { symbol: stranger(m.symbol, 16) || token, decimals: m.decimals, icon: smallIcon(m.icon) } : { bad: true };
  kv.set(key, out, "bad" in out ? 24 * 60 * 60_000 : null);
  return out;
}

const launchpadOf = (token: string): LaunchpadName | null =>
  isNearvana(token) ? "nearvana" : isNearly(token) ? "nearly" : hootFactory(token) ? "justhoot" : null;

async function build(): Promise<SwapTokenList> {
  const wrap = WALLET.wrap;
  const [{ built_at, pools }, verified, px, assets] = await Promise.all([
    allPools(),
    whitelist().catch(() => new Set<string>()),
    prices().catch(() => null),
    WALLET.id === "mainnet" ? swapAssets().catch(() => null) : Promise.resolve(null),
  ]);

  const depth = new Map<string, number>();
  for (const p of pools) {
    if (p.kind !== "dcl" || (p.state && p.state !== "Running")) continue;
    const w = p.tokens.indexOf(wrap);
    if (w < 0) continue;
    const other = p.tokens[1 - w]!;
    const near = Number(BigInt(p.amounts[w] ?? "0") / 10n ** 18n) / 1e6;
    if (near > (depth.get(other) ?? 0)) depth.set(other, near);
  }

  // Lists that already carry symbol and decimals save an RPC call per token.
  const known = new Map<string, { symbol: string; decimals: number }>();
  for (const [t, p] of px?.data ?? []) known.set(t, { symbol: p.symbol, decimals: p.decimals });
  for (const a of assets?.data ?? []) if (a.assetId.startsWith("nep141:")) known.set(a.assetId.slice(7), { symbol: a.symbol, decimals: a.decimals });

  const listed = [...depth.entries()].filter(([t, d]) => d >= FLOOR || launchpadOf(t));
  const rows = await mapLimit(listed, 6, async ([token, depth_near]): Promise<SwapToken | null> => {
    const k = known.get(token);
    const m = await meta(token);
    if ("bad" in m && !k) return null;
    return {
      token,
      symbol: "bad" in m ? stranger(k!.symbol, 16) : m.symbol,
      decimals: "bad" in m ? k!.decimals : m.decimals,
      icon: "bad" in m ? null : m.icon,
      launchpad: launchpadOf(token),
      verified: verified.has(token),
      depth_near,
      price_usd: px?.data.get(token)?.price ?? null,
    };
  });

  const tokens = rows
    .filter((r): r is SwapToken => r !== null)
    .sort(
      (a, b) =>
        Number(Boolean(b.launchpad)) - Number(Boolean(a.launchpad)) || Number(b.verified) - Number(a.verified) || b.depth_near - a.depth_near,
    );
  return { network: WALLET.id, built_at, tokens };
}

const TTL = 10 * 60_000;
const KEY = `${WALLET.id}:swap:tokens:v2`;
type Saved = { at: number; list: SwapTokenList };

let last: Saved | null = null;
let building: Promise<SwapTokenList> | null = null;

function rebuild(): Promise<SwapTokenList> {
  building ??= onNetwork(WALLET, build)
    .then((list) => {
      last = { at: Date.now(), list };
      kv.set(KEY, last, null);
      return list;
    })
    .finally(() => (building = null));
  return building;
}

/**
 * The swap form's token list. The last one is served at once, even when old; a list older than
 * 10 minutes is rebuilt in the background, since a rebuild can take minutes when the RPC throttles.
 */
export async function swapTokens(): Promise<SwapTokenList> {
  last ??= kv.get<Saved>(KEY);
  if (!last) return rebuild();
  if (Date.now() - last.at > TTL) rebuild().catch(() => {});
  return last.list;
}
