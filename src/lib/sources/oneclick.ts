import { getJson, memo, postJson, sourced, type Sourced } from "./http";

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

export type QuoteRequest = {
  dry: boolean;
  originAsset: string;
  destinationAsset: string;
  /** Raw units of the origin asset. */
  amount: string;
  slippageBps: number;
  /** Where the output goes: a NEAR account, or an address on the destination chain. */
  recipient: string;
  /** NEAR account a failed swap is refunded to. */
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
  depositMemo?: string;
  deadline?: string;
};

export type QuoteResponse = {
  quote: Quote;
  quoteRequest: { appFees?: { recipient: string; fee: number }[] } & Record<string, unknown>;
  timestamp: string;
};

/** A price (dry) or a real quote with a deposit address. Never retried: each real quote opens a new deposit address. */
export async function quote(r: QuoteRequest): Promise<Sourced<QuoteResponse>> {
  const url = `${ONECLICK_URL}/v0/quote`;
  const res = await postJson<QuoteResponse>(
    url,
    {
      dry: r.dry,
      swapType: "EXACT_INPUT",
      slippageTolerance: r.slippageBps,
      originAsset: r.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: r.destinationAsset,
      amount: r.amount,
      refundTo: r.refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient: r.recipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: r.deadline.toISOString(),
      referral: "vana-agent",
    },
    { headers: headers(), timeoutMs: 25_000 },
  );
  return sourced(res, "NEAR Intents 1Click", url);
}

/** Tells 1Click about a deposit so it is picked up sooner. Best effort. */
export async function submitDeposit(txHash: string, depositAddress: string): Promise<void> {
  await postJson(`${ONECLICK_URL}/v0/deposit/submit`, { txHash, depositAddress }, { headers: headers(), timeoutMs: 15_000 }).catch(() => {});
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
    refundedAmount: string | null;
    refundedAmountFormatted: string | null;
    refundReason: string | null;
    nearTxHashes: string[];
    destinationChainTxHashes: { hash: string; explorerUrl: string }[];
  };
};

export async function status(depositAddress: string): Promise<StatusResponse> {
  const url = `${ONECLICK_URL}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`;
  return getJson<StatusResponse>(url, { headers: headers(), timeoutMs: 15_000, attempts: 2 });
}
