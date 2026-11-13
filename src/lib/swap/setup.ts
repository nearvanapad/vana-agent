import type { AccountView } from "../near/rpc";
import { fromRaw } from "./assets";

/**
 * Whether a NEAR account can pay to be registered on the token a deposit swap delivers. The
 * user's wallet pays that registration before the deposit address is shown, so a new account
 * with no NEAR (or one not on chain yet) is refused up front instead of failing in the wallet.
 */

/** Storage staking per byte, in yoctoNEAR (10^19, i.e. 1 NEAR per 100 kB). */
const STORAGE_BYTE = 10n ** 19n;

/** NEAR for the registration's gas: 10 Tgas prepaid at the 100 Mgas price, i.e. 0.001 NEAR. */
export const SETUP_GAS = 10n ** 21n;

/** NEAR the account can spend: its balance less what its storage keeps staked beyond `locked`. */
export function freeNear(v: Pick<AccountView, "amount" | "locked" | "storage_usage">): bigint {
  const staked = BigInt(v.storage_usage) * STORAGE_BYTE - BigInt(v.locked);
  const free = BigInt(v.amount) - (staked > 0n ? staked : 0n);
  return free > 0n ? free : 0n;
}

/**
 * Why `account` can't pay a registration costing `deposit` (plus gas) to receive `symbol`, or null
 * when it can. `have` is its spendable NEAR, null when the account doesn't exist on chain.
 */
export function shortfallMessage(have: bigint | null, deposit: bigint, account: string, symbol: string): string | null {
  const need = deposit + SETUP_GAS;
  if (have !== null && have >= need) return null;
  const n = fromRaw(need, 24);
  const setup = `Receiving ${symbol} needs a one-time setup on ${account} that your NEAR wallet pays (about ${n} NEAR), before the deposit address is shown.`;
  return have === null
    ? `${account} doesn't exist on NEAR yet. ${setup} Send at least ${n} NEAR to ${account} first, then ask again.`
    : `${account} has ${fromRaw(have, 24)} NEAR available. ${setup} Add NEAR to ${account} first, then ask again.`;
}
