import { getJson, memo, postJson, sourced, type Sourced } from "./http";

/**
 * NEAR Intents: cross-chain swaps settled by solvers, reached through one upstream picked on the
 * server. `oneclick` calls 1Click directly; `aurora` goes through Aurora's Swap API, which fronts
 * the same 1Click solver network with its own key and fee split. The request and response shapes
 * are the same; only where they go, how the key travels and who sets the fee differ.
 */

export type Provider = "oneclick" | "aurora";

/** The upstream new swaps use. A swap remembers its own, so a change here never strands one in flight. */
export const PROVIDER: Provider = process.env.INTENTS_PROVIDER?.trim().toLowerCase() === "aurora" ? "aurora" : "oneclick";

export const PROVIDER_LABEL: Record<Provider, string> = { oneclick: "NEAR Intents", aurora: "Aurora Intents" };

const ONECLICK_URL = (process.env.ONECLICK_URL ?? "https://1click.chaindefuser.com").replace(/\/$/, "");
const AURORA_URL = (process.env.AURORA_INTENTS_URL ?? "https://intents-api.aurora.dev").replace(/\/$/, "");

type Op = "tokens" | "quote" | "deposit/submit" | "status";

function auroraKey(): string {
  const key = process.env.AURORA_INTENTS_KEY?.trim();
  if (!key) throw new Error("INTENTS_PROVIDER is aurora but AURORA_INTENTS_KEY is not set.");
  return key;
}

/** Where to call. Aurora's key sits in the path, so this URL is never shown or cited: see `shown`. */
function endpoint(p: Provider, op: Op): string {
  return p === "aurora" ? `${AURORA_URL}/api/${op}/${encodeURIComponent(auroraKey())}` : `${ONECLICK_URL}/v0/${op}`;
}

/** The same endpoint without the key, for citations. */
function shown(p: Provider, op: Op): string {
  return p === "aurora" ? `${AURORA_URL}/api/${op}` : `${ONECLICK_URL}/v0/${op}`;
}

function headers(p: Provider): Record<string, string> {
  const jwt = process.env.ONECLICK_JWT;
  return p === "oneclick" && jwt ? { authorization: `Bearer ${jwt}` } : {};
}

/** Our fee on 1Click quotes, from the env. Aurora's is set per key in its portal instead. */
function appFees(): { recipient: string; fee: number }[] | undefined {
  const bps = process.env.INTENTS_FEE_BPS?.trim();
  const recipient = process.env.INTENTS_FEE_RECIPIENT?.trim();
  if (!bps && !recipient) return undefined;
  if (!bps || !recipient) throw new Error("Set both INTENTS_FEE_BPS and INTENTS_FEE_RECIPIENT, or neither.");
  const fee = Number(bps);
  if (!Number.isInteger(fee) || fee < 0 || fee > 500) throw new Error("INTENTS_FEE_BPS must be a whole number from 0 to 500.");
  return fee === 0 ? undefined : [{ recipient, fee }];
}

export type SwapAsset = {
  /** e.g. "nep141:wrap.near" */
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  price: number | null;
  contractAddress?: string;
};

type RawAsset = { assetId: string; symbol: string; blockchain: string; decimals: number; price?: number | string | null; contractAddress?: string };

/** Assets the swap upstream lists. Kept for 10 minutes. */
export const swapAssets = memo(10 * 60_000, async (): Promise<Sourced<SwapAsset[]>> => {
  const p = PROVIDER;
  // 1Click answers a bare list; Aurora wraps it as `{tokens, asset_stats}`.
  const r = await getJson<RawAsset[] | { tokens: RawAsset[] }>(endpoint(p, "tokens"), { headers: headers(p), timeoutMs: 10_000, attempts: 2 });
  const list = Array.isArray(r) ? r : r.tokens;
  return sourced(
    list.map((t) => ({
      assetId: t.assetId,
      symbol: t.symbol,
      blockchain: t.blockchain,
      decimals: t.decimals,
      price: t.price === undefined || t.price === null ? null : Number(t.price),
      contractAddress: t.contractAddress,
    })),
    PROVIDER_LABEL[p],
    shown(p, "tokens"),
  );
});

export type QuoteRequest = {
  dry: boolean;
  originAsset: string;
  destinationAsset: string;
  /** Raw units of the origin asset. */
  amount: string;
  slippageBps: number;
  /** Where the output goes: a NEAR account, or an address on the destination chain. */
  recipient: string;
  /** Where a failed swap is refunded: an account or address on the origin chain. */
  refundTo: string;
  deadline: Date;
};

export type Quote = {
  amountIn: string;
  amountInFormatted: string;
  amountInUsd?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd?: string;
  minAmountOut: string;
  timeEstimate: number;
  /** Only on a real (not dry) quote: where to send the deposit. */
  depositAddress?: string;
  /** Sent with the deposit on chains that need one. */
  depositMemo?: string;
  deadline?: string;
  timeWhenInactive?: string;
};

export type QuoteResponse = {
  quote: Quote;
  quoteRequest: { appFees?: { recipient: string; fee: number }[] } & Record<string, unknown>;
  timestamp: string;
};

/**
 * A price (dry) or a real quote with a deposit address. Never retried: each real quote opens a new
 * deposit address. Returns the provider it used, which the swap keeps.
 */
export async function quote(r: QuoteRequest): Promise<Sourced<QuoteResponse> & { provider: Provider }> {
  const p = PROVIDER;
  const fees = p === "oneclick" ? appFees() : undefined;
  const res = await postJson<QuoteResponse>(
    endpoint(p, "quote"),
    {
      dry: r.dry,
      swapType: "EXACT_INPUT",
      slippageTolerance: r.slippageBps,
      originAsset: r.originAsset,
      depositType: "ORIGIN_CHAIN",
      depositMode: "SIMPLE",
      destinationAsset: r.destinationAsset,
      amount: r.amount,
      refundTo: r.refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient: r.recipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: r.deadline.toISOString(),
      ...(p === "oneclick" ? { referral: "vana-agent" } : {}),
      ...(fees ? { appFees: fees } : {}),
    },
    { headers: headers(p), timeoutMs: 25_000 },
  );
  return { ...sourced(res, PROVIDER_LABEL[p], shown(p, "quote")), provider: p };
}

/** Tells the upstream about a deposit so it is picked up sooner. Best effort. */
export async function submitDeposit(p: Provider, txHash: string, depositAddress: string, nearSender?: string): Promise<void> {
  await postJson(
    endpoint(p, "deposit/submit"),
    { txHash, depositAddress, ...(nearSender ? { nearSenderAccount: nearSender } : {}) },
    { headers: headers(p), timeoutMs: 15_000 },
  ).catch(() => {});
}

export type SwapStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export type StatusResponse = {
  status: SwapStatus;
  updatedAt: string;
  swapDetails?: {
    amountOut: string | null;
    amountOutFormatted: string | null;
    depositedAmountFormatted?: string | null;
    refundedAmount: string | null;
    refundedAmountFormatted: string | null;
    refundReason: string | null;
    nearTxHashes: string[];
    originChainTxHashes?: { hash: string; explorerUrl: string }[];
    destinationChainTxHashes: { hash: string; explorerUrl: string }[];
  };
};

export async function status(p: Provider, depositAddress: string, depositMemo?: string | null): Promise<StatusResponse> {
  const q = new URLSearchParams({ depositAddress });
  if (depositMemo) q.set("depositMemo", depositMemo);
  return getJson<StatusResponse>(`${endpoint(p, "status")}?${q}`, { headers: headers(p), timeoutMs: 15_000, attempts: 2 });
}
