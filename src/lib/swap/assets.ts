import { net, networkOf } from "../near/network";
import { tryView } from "../near/rpc";
import { swapAssets, type SwapAsset } from "../sources/intents";
import { prices } from "../sources/rhea";
import { stranger } from "../agent/guard";

/** A message meant for the user: why a swap can't be quoted or approved. */
export class SwapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwapError";
  }
}

/** Wrapped NEAR on the network the swap runs on (called inside `onNetwork`). */
export const wnear = () => net().wrap;

/** NEAR Intents (1Click) runs on mainnet only. */
const intentsOn = () => net().id === "mainnet";

export type Asset = {
  /** 1Click asset id, or `nep141:<token>` for a NEAR token it doesn't list. */
  id: string;
  /** "near", or the chain the asset lives on (eth, sol, btc, …). */
  chain: string;
  symbol: string;
  decimals: number;
  /** The NEAR token contract; wrap.near for native NEAR. Null off NEAR. */
  token: string | null;
  /** Native NEAR: wrapped to wNEAR on the way in. */
  native: boolean;
  /** NEAR Intents (1Click) can swap it. */
  intents: boolean;
  price_usd: number | null;
};

const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

async function listed(): Promise<SwapAsset[] | null> {
  if (!intentsOn()) return null;
  return swapAssets()
    .then((r) => r.data)
    .catch(() => null);
}

async function rheaPrice(token: string): Promise<number | null> {
  const px = await prices().catch(() => null);
  return px?.data.get(token)?.price ?? null;
}

/**
 * Turns what the user or the model named into an asset: "NEAR", a NEAR token contract
 * (usdt.tether-token.near), or a 1Click asset id (nep141:…omft.near) for other chains.
 */
export async function resolveAsset(input: string): Promise<Asset> {
  const q = input.trim();
  if (q.includes(".") && !q.includes(":") && networkOf(q).id !== net().id) {
    throw new SwapError(
      `Swaps run on NEAR ${net().id} here, and ${stranger(q, 64)} is a ${networkOf(q).id} token. It can be checked, not swapped.`,
    );
  }
  const list = await listed();

  if (/^w?near$/i.test(q)) {
    const w = list?.find((a) => a.assetId === `nep141:${wnear()}`);
    return {
      id: `nep141:${wnear()}`,
      chain: "near",
      symbol: /^near$/i.test(q) ? "NEAR" : "wNEAR",
      decimals: 24,
      token: wnear(),
      native: /^near$/i.test(q),
      intents: Boolean(w),
      price_usd: w?.price ?? (await rheaPrice(wnear())),
    };
  }

  if (q.includes(":")) {
    if (!intentsOn()) throw new SwapError(`Assets on other chains go through NEAR Intents, which is mainnet only; swaps here run on NEAR ${net().id}. Switch to mainnet to swap them.`);
    if (!list) throw new SwapError("NEAR Intents is unreachable right now, so assets on other chains can't be swapped.");
    const a = list.find((x) => x.assetId === q);
    if (!a) throw new SwapError(`${q} is not an asset NEAR Intents lists. Use list_swap_assets to find its asset_id.`);
    const token = a.blockchain === "near" && a.assetId.startsWith("nep141:") ? a.assetId.slice(7) : null;
    return { id: a.assetId, chain: a.blockchain, symbol: a.symbol, decimals: a.decimals, token, native: false, intents: true, price_usd: a.price };
  }

  const id = q.toLowerCase();
  if (!NEAR_ACCOUNT.test(id) || id.length > 64 || (!id.includes(".") && !/^[0-9a-f]{64}$/.test(id))) {
    throw new SwapError(`"${stranger(q, 32)}" is not a token contract. Search for the symbol first, then use its contract id.`);
  }
  const a = list?.find((x) => x.assetId === `nep141:${id}`);
  if (a) return { id: a.assetId, chain: "near", symbol: a.symbol, decimals: a.decimals, token: id, native: false, intents: true, price_usd: a.price };

  const meta = await tryView<{ symbol?: string; decimals?: number }>(id, "ft_metadata").catch(() => null);
  if (!meta || typeof meta.decimals !== "number") throw new SwapError(`${id} is not a NEAR token (no ft_metadata).`);
  return {
    id: `nep141:${id}`,
    chain: "near",
    symbol: stranger(meta.symbol, 16) || id,
    decimals: meta.decimals,
    token: id,
    native: false,
    intents: false,
    price_usd: await rheaPrice(id),
  };
}

/** "1.5" → raw units. Extra decimals past the token's are cut, never rounded up. */
export function toRaw(amount: string, decimals: number): bigint {
  const m = amount.trim().replace(/[,_\s]/g, "").match(/^(\d*)(?:\.(\d*))?$/);
  if (!m || (!m[1] && !m[2])) throw new SwapError(`"${stranger(amount, 24)}" is not an amount.`);
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  return BigInt(m[1] || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

/** Raw units → a short decimal string with at most `digits` significant fraction digits. */
export function fromRaw(raw: bigint | string, decimals: number, digits = 6): string {
  const v = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  if (whole > 0n) frac = frac.slice(0, digits);
  else {
    const lead = frac.match(/^0*/)![0].length;
    frac = frac.slice(0, lead + digits);
  }
  frac = frac.replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}
