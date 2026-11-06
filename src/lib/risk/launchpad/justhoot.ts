import { tryView } from "../../near/rpc";
import { getJson, ref } from "../../sources/http";
import type { Launchpad } from "../types";

/**
 * justhoot.fun: tokens are `<slug>.v2-launchpad.justhoot.near` (v1: `<slug>-<hex>.launchpad.justhoot.near`).
 * The factory knows the dev and the transfer fee; justhoot's public API has launch time, trades and
 * market data.
 */

export const JUSTHOOT = ["v2-launchpad.justhoot.near", "launchpad.justhoot.near"] as const;
const API = "https://api.justhoot.fun/api";
export const hootUrl = (token: string) => `https://justhoot.fun/token/${token}`;

type FeeState = { dev_id: string; pool_id: string | null; transfer_fee_pips: number };

export type Room = {
  token: string;
  /** Creator-written. */
  symbol: string;
  creator: string;
  created_at: string;
  market_cap_usd: number | null;
  ath_market_cap_usd: number | null;
  holder_count: number | null;
  trade_count: number | null;
  last_trade_at: string | null;
  graduated: boolean;
};

type RawRoom = {
  token: { id: string; symbol: string };
  creator_id: string;
  created_at: string;
  market_cap_usd: string | null;
  ath_market_cap_usd: string | null;
  holder_count: number | null;
  trade_count: number | null;
  last_trade_at: string | null;
  graduated: boolean;
};

const num = (v: string | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

const room = (r: RawRoom): Room => ({
  token: r.token.id,
  symbol: String(r.token.symbol ?? "").slice(0, 24),
  creator: r.creator_id,
  created_at: r.created_at,
  market_cap_usd: num(r.market_cap_usd),
  ath_market_cap_usd: num(r.ath_market_cap_usd),
  holder_count: r.holder_count,
  trade_count: r.trade_count,
  last_trade_at: r.last_trade_at,
  graduated: Boolean(r.graduated),
});

export const factoryOf = (token: string) => JUSTHOOT.find((f) => token.endsWith(`.${f}`)) ?? null;

async function rooms(params: Record<string, string>): Promise<Room[]> {
  const q = new URLSearchParams({ sort: "new", offset: "0", limit: "50", ...params });
  const r = await getJson<{ rooms: RawRoom[] }>(`${API}/rooms?${q}`, { timeoutMs: 10_000 });
  return r.rooms.map(room);
}

export const recentRooms = (n: number) => rooms({ limit: String(Math.min(n, 50)) });
export const roomsBy = (creator: string) => rooms({ creator });

export type HootTrade = { token: string; side: "buy" | "sell"; token_amount: number; at: string };

/** An account's latest trades on justhoot (up to 200). */
export async function tradesBy(account: string): Promise<HootTrade[]> {
  const r = await getJson<{ trades: { token: { id: string }; side: string; token_amount: string; timestamp: string }[] }>(
    `${API}/accounts/${encodeURIComponent(account)}/trades?limit=200`,
    { timeoutMs: 10_000 },
  );
  return r.trades.map((t) => ({ token: t.token.id, side: t.side === "sell" ? "sell" : "buy", token_amount: Number(t.token_amount) || 0, at: t.timestamp }));
}

type TokenApi = { first_trade_at: string | null; graduated: boolean };

export async function justhootInfo(token: string): Promise<Launchpad | null> {
  const factory = factoryOf(token);
  if (!factory) return null;
  const fee = await tryView<FeeState>(factory, "get_token_fee_state", { token_id: token });
  if (!fee) return null;
  const api = await getJson<TokenApi>(`${API}/tokens/${encodeURIComponent(token)}`, { timeoutMs: 8_000, attempts: 1 }).catch(() => null);
  // transfer_fee_pips: millionths, 30000 = 3%
  const taxPct = fee.transfer_fee_pips / 10_000;
  return {
    platform: "justhoot",
    creator: fee.dev_id,
    created_at: api?.first_trade_at ?? null,
    buy_tax_pct: taxPct,
    sell_tax_pct: taxPct,
    lpt_id: null,
    pool_id: fee.pool_id,
    platform_upgradeable: true,
    state: api ? (api.graduated ? "graduated" : "on the launch curve, not graduated yet") : null,
    quote: fee.pool_id?.split("|").find((t) => t !== token) ?? null,
    dev_buy: null,
    url: hootUrl(token),
    source: ref("NEAR RPC", `https://nearblocks.io/address/${factory}`),
  };
}
