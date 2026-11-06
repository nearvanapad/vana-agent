import type { Level } from "./types";

/**
 * Every threshold of the risk check in one place. Shares are percent of the total supply.
 */

/** The ten largest holders, without pools, lockers and burn addresses. */
export const TOP10_YELLOW_PCT = 25;
export const TOP10_RED_PCT = 50;

/** The dev and the wallets tied to it. Above 5% is more than a fair first buy. */
export const DEV_YELLOW_PCT = 5;
export const DEV_RED_PCT = 15;

/** A single holder (not infra) above this is called out. */
export const WHALE_PCT = 10;

/** Pool depth (the other side of the pool, in dollars) under this is thin: one sell moves the price a lot. */
export const LIQUIDITY_THIN_USD = 500;
/** The dev owning this share of a pool's LP can pull it. */
export const DEV_LP_RED_PCT = 50;

/** Buy or sell tax at or above this is yellow; at or above the red mark, selling barely pays. */
export const TAX_YELLOW_PCT = 3;
export const TAX_RED_PCT = 10;

/** A wallet younger than this is fresh. */
export const FRESH_MAX_AGE_DAYS = 7;
/** Supply held by fresh wallets among the top holders. */
export const FRESH_YELLOW_PCT = 3;
export const FRESH_RED_PCT = 10;

/** A funder with this many transactions funds strangers (exchange, relayer): sharing it links no one. */
export const HUB_MIN_TXS = 20_000;

/** Early buyers: the first N wallets to buy from a pool, plus any that bought this soon after it opened. */
export const EARLY_BUYERS = 20;
export const EARLY_WINDOW_S = 10;
/** Early buyers tied to the dev or each other: red at this many, or at this share of supply between them. */
export const BUNDLE_RED_WALLETS = 3;
export const BUNDLE_RED_PCT = 5;
/** An early buyer in this many launches is a sniper bot. */
export const SNIPER_LAUNCHES = 3;

/** Creator history: a past launch that sold off or emptied counts against the creator. */
export const DEAD_POOL_USD = 50;
export const CREATOR_RED_BAD = 2;

/** How long a report is kept before it is computed again. */
export const REPORT_TTL_MS = 5 * 60_000;

const RANK: Record<Level, number> = { not_checked: 0, green: 1, yellow: 2, red: 3 };

export const rank = (l: Level) => RANK[l];

/** Sorts worst first. */
export const byLevel = (a: { level: Level }, b: { level: Level }) => RANK[b.level] - RANK[a.level];

/** The worst level among those that were checked; green when none were. */
export function worst(levels: Level[]): Level {
  let out: Level = "green";
  for (const l of levels) if (l !== "not_checked" && RANK[l] > RANK[out]) out = l;
  return out;
}

export function concentration(top10Pct: number, devPct: number): Level {
  if (top10Pct >= TOP10_RED_PCT || devPct >= DEV_RED_PCT) return "red";
  if (top10Pct >= TOP10_YELLOW_PCT || devPct > DEV_YELLOW_PCT) return "yellow";
  return "green";
}

export function tax(pct: number): Level {
  if (pct >= TAX_RED_PCT) return "red";
  if (pct >= TAX_YELLOW_PCT) return "yellow";
  return "green";
}

/** `part` as percent of `whole`, to 2 decimals. */
export function pct(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number((part * 1_000_000n) / whole) / 10_000;
}

/** Raw token amount as a decimal number (loses precision past ~15 digits; fine for display and dollars). */
export function units(raw: string | bigint, decimals: number): number {
  const v = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  return Number(v / base) + Number(v % base) / Number(base);
}

export const fmtPct = (n: number) => `${n >= 10 ? n.toFixed(1) : n.toFixed(2)}%`;
export const fmtUsd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}k` : `$${n.toFixed(2)}`;
