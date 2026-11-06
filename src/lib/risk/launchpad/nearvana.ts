import { cached } from "../../db";
import { net } from "../../near/network";
import { tryView, view } from "../../near/rpc";
import { ref } from "../../sources/http";
import type { Launchpad } from "../types";

/**
 * nearvana (testnet.nearvana.trade): a testnet launchpad. Tokens are `<ticker>.nearvana2.nearvanapad.testnet`,
 * each launched into a Rhea DCL pool whose position the launchpad's locker holds. Buy and sell tax
 * are set per launch and split between the creator, holders, liquidity and buybacks.
 */

export const NEARVANA = "nearvana2.nearvanapad.testnet";
export const NEARVANA_LOCKER = `locker.${NEARVANA}`;
const APP = "https://testnet.nearvana.trade";
const PAGE = 100;

type RawLaunch = {
  launch_id: string;
  token: string;
  creator: string;
  quote: string;
  meta: { symbol?: string; name?: string };
  buy_tax_bps: number;
  sell_tax_bps: number;
  pool_id: string;
  start_point: number;
  token_is_x: boolean;
  lpt_id: string | null;
  listed: boolean;
  step: string;
  failed?: boolean;
  created_at: string;
};

export type NearvanaLaunch = {
  id: number;
  token: string;
  creator: string;
  /** Creator-written. */
  symbol: string;
  created_at_ms: number;
  pool_id: string;
  token_is_x: boolean;
  start_point: number;
  lpt_id: string | null;
  step: string;
  failed: boolean;
  quote: string;
  buy_tax_pct: number;
  sell_tax_pct: number;
};

const slim = (l: RawLaunch): NearvanaLaunch => ({
  id: Number(l.launch_id),
  token: l.token,
  creator: l.creator,
  symbol: String(l.meta?.symbol ?? "").slice(0, 24),
  created_at_ms: Number(BigInt(l.created_at) / 1_000_000n),
  pool_id: l.pool_id,
  token_is_x: l.token_is_x,
  start_point: l.start_point,
  lpt_id: l.lpt_id,
  step: l.step,
  failed: Boolean(l.failed),
  quote: l.quote,
  buy_tax_pct: l.buy_tax_bps / 100,
  sell_tax_pct: l.sell_tax_bps / 100,
});

export const isNearvana = (token: string) => token.endsWith(`.${NEARVANA}`);
export const coinUrl = (token: string) => `${APP}/coin/${token}`;
export const live = (l: NearvanaLaunch) => l.step === "completed" && !l.failed;

/** Accounts the launchpad runs: the factory, its locker, coin-side helpers and treasuries. */
export const isNearvanaInfra = (account: string) =>
  account === NEARVANA || account === NEARVANA_LOCKER || /^treasury\d*\.nearvanapad\.testnet$/.test(account);

export async function launchOf(token: string): Promise<NearvanaLaunch | null> {
  const l = await tryView<RawLaunch>(NEARVANA, "get_launch", { token });
  return l ? slim(l) : null;
}

/** Every launch, newest first, kept 5 minutes. */
export function allLaunches(): Promise<NearvanaLaunch[]> {
  return cached("nearvana:launches", 5 * 60_000, async () => {
    const out: RawLaunch[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await view<RawLaunch[]>(NEARVANA, "get_launches", { from: String(from), limit: PAGE, filter: {} });
      out.push(...page);
      if (page.length < PAGE) break;
    }
    return out.map(slim).sort((a, b) => b.created_at_ms - a.created_at_ms);
  });
}

export async function recentLaunches(n: number): Promise<NearvanaLaunch[]> {
  return (await allLaunches()).slice(0, n);
}

export async function launchesBy(creator: string): Promise<NearvanaLaunch[]> {
  return (await allLaunches()).filter((l) => l.creator === creator);
}

const STEPS: Record<string, string> = {
  started: "launching (started)",
  initialized: "launching (initialized)",
  pool_created: "launching (pool created)",
  liquidity_added: "launching (liquidity added)",
  first_buy_done: "launching (first buy done)",
  completed: "live; launch liquidity held by the launchpad locker",
};

export async function nearvanaInfo(token: string): Promise<Launchpad | null> {
  const l = await launchOf(token);
  if (!l) return null;
  return {
    platform: "nearvana",
    creator: l.creator,
    created_at: new Date(l.created_at_ms).toISOString(),
    buy_tax_pct: l.buy_tax_pct,
    sell_tax_pct: l.sell_tax_pct,
    lpt_id: l.lpt_id,
    pool_id: l.pool_id,
    // Coins have no upgrade method; the contract check still reads the token account's keys.
    platform_upgradeable: false,
    state: l.failed ? "launch failed" : (STEPS[l.step] ?? l.step),
    quote: l.quote,
    dev_buy: null,
    url: coinUrl(token),
    source: ref("NEAR RPC", `${net().explorer}/address/${NEARVANA}`),
  };
}

export type PoolNow = { quote_reserve: bigint; at_launch_price: boolean };

/** How much of the quote token sits in the launch pool, and whether the price is back at the start. */
export async function poolNow(l: NearvanaLaunch): Promise<PoolNow | null> {
  const p = await tryView<{ total_x: string; total_y: string; current_point: number }>(net().dcl, "get_pool", { pool_id: l.pool_id });
  if (!p) return null;
  const STEP = 200;
  const edge = l.token_is_x ? p.current_point - l.start_point < STEP : l.start_point - p.current_point < STEP;
  return { quote_reserve: BigInt(l.token_is_x ? p.total_y : p.total_x), at_launch_price: edge };
}
