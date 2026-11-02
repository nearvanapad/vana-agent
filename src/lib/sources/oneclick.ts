import { getJson, memo, sourced, type Sourced } from "./http";

/** NEAR Intents 1Click: cross-chain swaps settled by solvers. */
export const ONECLICK_URL = (process.env.ONECLICK_URL ?? "https://1click.chaindefuser.com").replace(/\/$/, "");

export type SwapAsset = {
  /** e.g. "nep141:wrap.near" */
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  price: number | null;
  contractAddress?: string;
};

function headers(): Record<string, string> {
  const jwt = process.env.ONECLICK_JWT;
  return jwt ? { authorization: `Bearer ${jwt}` } : {};
}

/** Assets 1Click can swap between. Kept for 10 minutes. */
export const swapAssets = memo(10 * 60_000, async (): Promise<Sourced<SwapAsset[]>> => {
  const url = `${ONECLICK_URL}/v0/tokens`;
  const r = await getJson<
    { assetId: string; symbol: string; blockchain: string; decimals: number; price?: number | string; contractAddress?: string }[]
  >(url, { headers: headers(), timeoutMs: 10_000, attempts: 2 });
  return sourced(
    r.map((t) => ({
      assetId: t.assetId,
      symbol: t.symbol,
      blockchain: t.blockchain,
      decimals: t.decimals,
      price: t.price === undefined || t.price === null ? null : Number(t.price),
      contractAddress: t.contractAddress,
    })),
    "NEAR Intents 1Click",
    url,
  );
});
