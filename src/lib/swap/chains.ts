/**
 * Chains cross-chain swaps offer, and what an address on each looks like. Shared by the server
 * (which checks every address before quoting) and the swap form (which checks as you type). The
 * intents upstream checks every address again.
 */

const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const EVM = /^0x[0-9a-fA-F]{40}$/;
const NAMED_NEAR = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** A NEAR account: named (alice.near), implicit (64 hex), or a lowercase Ethereum-style implicit. */
export function isNearAccount(a: string): boolean {
  if (/^[0-9a-f]{64}$/.test(a) || /^0x[0-9a-f]{40}$/.test(a)) return true;
  return a.length >= 2 && a.length <= 64 && NAMED_NEAR.test(a);
}

type Chain = {
  name: string;
  /** What to type, for the field's placeholder. */
  hint: string;
  valid: (address: string) => boolean;
  /**
   * A well-formed, real address used only to price a dry quote for a guest: the price doesn't
   * depend on it, and nothing is ever sent there. The upstream refuses burn and system addresses.
   */
  dry: string;
};

const DRY_EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const evm = (name: string): Chain => ({ name, hint: "0x…", valid: (a) => EVM.test(a), dry: DRY_EVM });

const CHAINS: Record<string, Chain> = {
  near: { name: "NEAR", hint: "you.near", valid: isNearAccount, dry: "intents.near" },
  eth: evm("Ethereum"),
  base: evm("Base"),
  arb: evm("Arbitrum"),
  op: evm("Optimism"),
  pol: evm("Polygon"),
  bsc: evm("BNB Chain"),
  avax: evm("Avalanche"),
  gnosis: evm("Gnosis"),
  sol: {
    name: "Solana",
    hint: "Solana address",
    valid: (a) => new RegExp(`^${BASE58}{32,44}$`).test(a),
    dry: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  },
  btc: {
    name: "Bitcoin",
    hint: "bc1… or 1… or 3…",
    valid: (a) => /^bc1[02-9ac-hj-np-z]{11,71}$/.test(a) || new RegExp(`^[13]${BASE58}{25,34}$`).test(a),
    dry: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
  },
  zec: {
    name: "Zcash",
    hint: "t1… or t3…",
    valid: (a) => new RegExp(`^t[13]${BASE58}{33}$`).test(a),
    dry: "t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs",
  },
  tron: {
    name: "Tron",
    hint: "T…",
    valid: (a) => new RegExp(`^T${BASE58}{33}$`).test(a),
    dry: "TNaRAoLUyYEV2uF7GUrzSjRQTU8v5ZJ5VR",
  },
};

/** Chains the swap form offers, in this order. NEAR is always one side of a swap. */
export const SWAP_CHAINS = Object.keys(CHAINS);

export const isSwapChain = (chain: string) => chain in CHAINS;

/** The chain's name as people say it. */
export const chainName = (chain: string): string => CHAINS[chain]?.name ?? chain.toUpperCase();

export const addressHint = (chain: string): string => CHAINS[chain]?.hint ?? "Address";

/** A stand-in address on `chain` for pricing a dry quote, or null when there is none. */
export const dryAddress = (chain: string): string | null => CHAINS[chain]?.dry ?? null;

/** Why `address` can't be one on `chain`, or null when it can. Blank is not an error here. */
export function addressError(chain: string, address: string): string | null {
  const a = address.trim();
  if (a === "") return null;
  if (a.length > 128 || /\s/.test(a)) return "That doesn't look like an address.";
  const c = CHAINS[chain];
  if (!c) return null;
  return c.valid(a) ? null : `That isn't a ${c.name} address.`;
}
