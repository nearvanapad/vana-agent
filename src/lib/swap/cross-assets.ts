import { WALLET } from "../near/network";
import { PROVIDER, PROVIDER_LABEL, swapAssets } from "../sources/intents";
import { chainName, isNearAccount, isSwapChain, SWAP_CHAINS } from "./chains";

/**
 * What the Cross-chain swap form offers: the intents upstream's asset list, grouped by chain. NEAR
 * assets are named by their contract ("NEAR" for native NEAR) like the rest of the swap form; the
 * other chains by their intents asset id.
 */

export type CrossAsset = { id: string; symbol: string; decimals: number; price: number | null; contract: string | null };
export type CrossChain = { chain: string; name: string; assets: CrossAsset[] };
export type CrossAssets = { available: boolean; provider: string; chains: CrossChain[]; reason?: string };

/** Chains offered: the known ones, narrowed by INTENTS_SWAP_CHAINS when it is set. */
function offered(): string[] {
  const env = process.env.INTENTS_SWAP_CHAINS?.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
  const want = env?.length ? env : SWAP_CHAINS;
  return SWAP_CHAINS.filter((c) => c === "near" || want.includes(c));
}

/** Plain bridged tokens first, then multi-token ones, then the rest: when a coin is listed twice the first wins. */
const rank = (id: string) => (id.startsWith("nep141:") ? 0 : id.startsWith("nep245:") ? 1 : 2);
const FIRST = ["NEAR", "ETH", "SOL", "BTC", "ZEC", "TRX", "BNB", "AVAX", "POL", "XDAI", "USDC", "USDT"];
const order = (s: string) => {
  const i = FIRST.indexOf(s.toUpperCase());
  return i < 0 ? FIRST.length : i;
};

export async function crossAssets(): Promise<CrossAssets> {
  const provider = PROVIDER_LABEL[PROVIDER];
  if (WALLET.id !== "mainnet") return { available: false, provider, chains: [], reason: "Cross-chain swaps run on mainnet." };
  const list = await swapAssets()
    .then((r) => r.data)
    .catch(() => null);
  if (!list) return { available: false, provider, chains: [], reason: `${provider} is unreachable right now.` };

  const chains = offered();
  const by = new Map<string, Map<string, CrossAsset & { rank: number }>>();
  for (const a of list) {
    if (!chains.includes(a.blockchain) || !isSwapChain(a.blockchain)) continue;
    let id = a.assetId;
    if (a.blockchain === "near") {
      // NEAR assets are paid or received by the wallet as plain tokens.
      if (!id.startsWith("nep141:") || !isNearAccount(id.slice(7))) continue;
      id = id.slice(7) === WALLET.wrap ? "NEAR" : id.slice(7);
    }
    const group = by.get(a.blockchain) ?? new Map();
    by.set(a.blockchain, group);
    const key = a.symbol.toUpperCase();
    const have = group.get(key);
    const next = {
      id,
      symbol: id === "NEAR" ? "NEAR" : a.symbol,
      decimals: a.decimals,
      price: a.price,
      contract: a.contractAddress ?? null,
      rank: rank(a.assetId),
    };
    if (!have || next.rank < have.rank) group.set(key, next);
  }
  return {
    available: true,
    provider,
    chains: chains
      .filter((c) => by.has(c))
      .map((c) => ({
        chain: c,
        name: chainName(c),
        assets: [...by.get(c)!.values()]
          .sort((x, y) => order(x.symbol) - order(y.symbol) || x.symbol.localeCompare(y.symbol))
          .map(({ rank: _rank, ...a }) => a),
      })),
  };
}
