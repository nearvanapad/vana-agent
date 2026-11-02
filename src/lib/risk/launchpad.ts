import { tryView } from "../near/rpc";
import { ref } from "../sources/http";
import type { Launchpad } from "./types";

/**
 * Recognises tokens minted by the NEAR launchpads and reads what the launchpad knows about them:
 * creator, launch time, tax and the liquidity position.
 */

export const NEARLY = "nearlytrade.near";
export const JUSTHOOT = ["v2-launchpad.justhoot.near", "launchpad.justhoot.near"] as const;

type NearlyLaunch = {
  id: number;
  token: string;
  creator: string;
  created_at_ms: number;
  pool_id: string | null;
  lpt_id: string | null;
  step: string;
};

type NearlyTax = { buy_bps: number; sell_bps: number };

type HootFeeState = { dev_id: string; pool_id: string | null; transfer_fee_pips: number };

const isSub = (account: string, parent: string) => account.endsWith(`.${parent}`);

async function nearly(token: string): Promise<Launchpad | null> {
  const launch = await tryView<NearlyLaunch>(NEARLY, "get_launch_by_token", { token });
  if (!launch) return null;
  const tax = await tryView<NearlyTax>(NEARLY, "get_tax", { launch_id: String(launch.id) });
  return {
    platform: "nearly",
    creator: launch.creator,
    created_at: new Date(launch.created_at_ms).toISOString(),
    buy_tax_pct: tax ? tax.buy_bps / 100 : null,
    sell_tax_pct: tax ? tax.sell_bps / 100 : null,
    lpt_id: launch.lpt_id,
    pool_id: launch.pool_id,
    platform_upgradeable: false,
    url: `https://nearblocks.io/token/${token}`,
    source: ref("NEAR RPC", `https://nearblocks.io/address/${NEARLY}`),
  };
}

async function justhoot(token: string, factory: string): Promise<Launchpad | null> {
  const fee = await tryView<HootFeeState>(factory, "get_token_fee_state", { token_id: token });
  if (!fee) return null;
  // transfer_fee_pips: millionths, 30000 = 3%
  const taxPct = fee.transfer_fee_pips / 10_000;
  return {
    platform: "justhoot",
    creator: fee.dev_id,
    created_at: null,
    buy_tax_pct: taxPct,
    sell_tax_pct: taxPct,
    lpt_id: null,
    pool_id: fee.pool_id,
    platform_upgradeable: true,
    url: `https://justhoot.fun/token/${token}`,
    source: ref("NEAR RPC", `https://nearblocks.io/address/${factory}`),
  };
}

export async function detectLaunchpad(token: string): Promise<Launchpad | null> {
  if (isSub(token, NEARLY)) return nearly(token);
  for (const f of JUSTHOOT) if (isSub(token, f)) return justhoot(token, f);
  return null;
}

/** Accounts that hold supply for a launchpad, not for a person. */
export function isLaunchpadInfra(account: string): boolean {
  return (
    account === NEARLY ||
    /^lock(_\d+)?\.nearlytrade\.near$/.test(account) ||
    (JUSTHOOT as readonly string[]).includes(account)
  );
}
