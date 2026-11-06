import { cached } from "../../db";
import { tryView, view } from "../../near/rpc";
import { mapLimit, ref } from "../../sources/http";
import { DCL } from "../../sources/rhea";
import type { Launchpad } from "../types";

/**
 * nearly (nearlytrade.near): tokens are `<slug>.nearlytrade.near`, each launched into a Rhea DCL
 * pool whose position a keyless locker holds. The factory lists every launch, newest first.
 */

export const NEARLY = "nearlytrade.near";
const PAGE = 200;

type RawLaunch = {
  id: number;
  token: string;
  creator: string;
  name: string;
  symbol: string;
  created_at_ms: number;
  pool_id: string | null;
  token_is_x: boolean;
  left_point: number;
  right_point: number;
  lpt_id: string | null;
  step: string;
  dev_buy_near: string;
  quote?: string;
};

export type NearlyLaunch = {
  id: number;
  token: string;
  creator: string;
  /** Creator-written. */
  symbol: string;
  created_at_ms: number;
  pool_id: string | null;
  token_is_x: boolean;
  /** The launch position's price range, in DCL points. */
  range: [number, number];
  lpt_id: string | null;
  step: string;
  /** NEAR the creator put into the first buy. */
  dev_buy_near: number;
  quote: string;
};

const slim = (l: RawLaunch): NearlyLaunch => ({
  id: l.id,
  token: l.token,
  creator: l.creator,
  symbol: String(l.symbol ?? "").slice(0, 24),
  created_at_ms: l.created_at_ms,
  pool_id: l.pool_id,
  token_is_x: l.token_is_x,
  range: [l.left_point, l.right_point],
  lpt_id: l.lpt_id,
  step: l.step,
  dev_buy_near: Number(BigInt(l.dev_buy_near ?? "0") / 10n ** 20n) / 10_000,
  quote: l.quote ?? "wrap.near",
});

export const isNearly = (token: string) => token.endsWith(`.${NEARLY}`);

export async function launchOf(token: string): Promise<NearlyLaunch | null> {
  const l = await tryView<RawLaunch>(NEARLY, "get_launch_by_token", { token });
  return l ? slim(l) : null;
}

/** The newest `n` launches. */
export async function recentLaunches(n: number): Promise<NearlyLaunch[]> {
  const list = await view<RawLaunch[]>(NEARLY, "get_launches", { from_index: 0, limit: Math.min(n, PAGE) });
  return list.map(slim);
}

/** Every launch, newest first. Built from the factory in pages and kept 15 minutes. */
export function allLaunches(): Promise<NearlyLaunch[]> {
  return cached("nearly:launches", 15 * 60_000, async () => {
    const total = await view<number>(NEARLY, "get_num_launches");
    const pages = Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => i * PAGE);
    const out = await mapLimit(pages, 4, (from) => view<RawLaunch[]>(NEARLY, "get_launches", { from_index: from, limit: PAGE }));
    return out.flat().map(slim);
  });
}

export async function launchesBy(creator: string): Promise<NearlyLaunch[]> {
  return (await allLaunches()).filter((l) => l.creator === creator);
}

type Tax = { buy_bps: number; sell_bps: number };

function stateOf(step: string): string {
  if (step === "Done") return "live; launch liquidity locked by the launchpad";
  if (step === "Failed") return "launch failed";
  return `launching (${step})`;
}

export async function nearlyInfo(token: string): Promise<Launchpad | null> {
  const launch = await launchOf(token);
  if (!launch) return null;
  const tax = await tryView<Tax>(NEARLY, "get_tax", { launch_id: String(launch.id) });
  return {
    platform: "nearly",
    creator: launch.creator,
    created_at: new Date(launch.created_at_ms).toISOString(),
    buy_tax_pct: tax ? tax.buy_bps / 100 : null,
    sell_tax_pct: tax ? tax.sell_bps / 100 : null,
    lpt_id: launch.lpt_id,
    pool_id: launch.pool_id,
    platform_upgradeable: false,
    state: stateOf(launch.step),
    quote: launch.quote,
    dev_buy: launch.dev_buy_near,
    url: `https://nearblocks.io/token/${token}`,
    source: ref("NEAR RPC", `https://nearblocks.io/address/${NEARLY}`),
  };
}

export type PoolNow = { quote_reserve: bigint; at_launch_price: boolean };

/** How much of the quote token sits in the launch pool, and whether the price is back at the start. */
export async function poolNow(l: NearlyLaunch): Promise<PoolNow | null> {
  if (!l.pool_id) return null;
  const p = await tryView<{ total_x: string; total_y: string; current_point: number }>(DCL, "get_pool", { pool_id: l.pool_id });
  if (!p) return null;
  // The launch position starts at one edge of its range; a price back at that edge means every buy was sold back.
  const STEP = 200;
  const edge = l.token_is_x ? p.current_point - l.range[0] < STEP : l.range[1] - p.current_point < STEP;
  return { quote_reserve: BigInt(l.token_is_x ? p.total_y : p.total_x), at_launch_price: edge };
}
