import type { Launchpad } from "../types";
import { JUSTHOOT, justhootInfo } from "./justhoot";
import { isNearly, NEARLY, nearlyInfo } from "./nearly";
import { isNearvana, isNearvanaInfra, NEARVANA, nearvanaInfo } from "./nearvana";

/**
 * Recognises tokens minted by the NEAR launchpads and reads what the launchpad knows about them:
 * creator, launch time, state, tax and the liquidity position.
 */

export { JUSTHOOT, NEARLY, NEARVANA };

export async function detectLaunchpad(token: string): Promise<Launchpad | null> {
  if (isNearly(token)) return nearlyInfo(token);
  if (isNearvana(token)) return nearvanaInfo(token);
  // justhoot is mainnet only.
  if (token.endsWith(".testnet")) return null;
  return justhootInfo(token);
}

/** Accounts that hold supply for a launchpad, not for a person. */
export function isLaunchpadInfra(account: string): boolean {
  return (
    account === NEARLY ||
    /^lock(_\d+)?\.nearlytrade\.near$/.test(account) ||
    NEARLY_WALLETS.has(account) ||
    isNearvanaInfra(account) ||
    // Direct children of justhoot.near are the platform's own accounts (factories, pool creator); tokens sit one level deeper.
    /^[a-z\d_-]+\.justhoot\.near$/.test(account)
  );
}

/** Fee and treasury wallets the nearly launchpad pays out to. */
const NEARLY_WALLETS = new Set(["feeswap.near", "protocolfee.near", "protocolfee2.near", "holderspot.near", "referralpot.near"]);
