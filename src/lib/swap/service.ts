import { randomBytes } from "node:crypto";
import { getDb } from "../db";
import { EXPLORER_TX, YOCTO } from "../near/config";
import { WALLET } from "../near/network";
import { onNetwork } from "../near/network-server";
import { tryView, txStatus, viewAccount } from "../near/rpc";
import { ftTransfer, ftTransferCall, nearDeposit, storageDeposit, type FunctionCallAction, type WalletTx } from "../near/tx";
import { access } from "../gate/access";
import { storedReport } from "../risk/report";
import { HttpError, ref, type SourceRef } from "../sources/http";
import * as intents from "../sources/intents";
import { dcl, dclPoolUrl } from "../sources/rhea";
import { fromRaw, resolveAsset, SwapError, toRaw, WNEAR, type Asset } from "./assets";
import { bestRoute, quotePath, swapMsg } from "./rhea-route";
import { swapRisk, type SwapRisk } from "./risk";

/**
 * Swaps the agent can price and propose, and the user approves. The flow:
 *   quote (dry, anyone) → propose (signed-in, stored with what the user saw)
 *   → approve (real quote, re-checked against what the user saw; returns the transactions)
 *   → the wallet signs → submitted → tracked until it settles.
 * Nothing here signs. The transactions are built from the stored proposal, never from model output.
 */

export type Route = "intents" | "rhea";

export type SwapInput = {
  from: string;
  to: string;
  /** Decimal amount of `from`, e.g. "10" or "0.5". */
  amount: string;
  slippage_pct?: number;
  /** Address on the destination chain; only for assets off NEAR. */
  recipient?: string;
};

type Side = { symbol: string; asset: string; chain: string; token: string | null; amount: string; raw: string; usd: number | null };

export type SwapQuote = {
  route: Route;
  /** The intents upstream that priced it; null on the Rhea route. */
  provider?: intents.Provider | null;
  from: Side;
  to: Side;
  /** The least the user receives, or the swap is refunded. */
  min_out: string;
  min_out_raw: string;
  slippage_pct: number;
  /** Who receives the output: the signer on NEAR, or an address on another chain. */
  recipient: string;
  fees: string[];
  pool_ids: string[] | null;
  time_estimate_s: number | null;
  sources: SourceRef[];
  as_of: string;
};

export type Proposal = SwapQuote & {
  id: string;
  account: string;
  /** The last token check of the token bought, when there is one and the account may see checks. A swap never runs one. */
  risk: SwapRisk | null;
  /** The token bought is one a token check covers (a NEAR token other than NEAR itself). */
  checkable?: boolean;
  warnings: string[];
  expires_at: string;
};

export type SwapStatus = "proposed" | "signing" | "submitted" | "processing" | "success" | "refunded" | "failed" | "expired";

export type SwapView = {
  id: string;
  account: string;
  status: SwapStatus;
  proposal: Proposal;
  /** The real quote's minimum, once approved. */
  min_out: string | null;
  tx_hash: string | null;
  tx_url: string | null;
  result: { amount_out?: string | null; refunded?: string | null; reason?: string | null; upstream?: string; dest_tx_url?: string | null } | null;
  updated_at: string;
};

/** A proposal can be approved for this long. */
const PROPOSAL_TTL_MS = 10 * 60_000;
/** NEAR kept back for gas and storage when paying with native NEAR. */
const NEAR_RESERVE = YOCTO / 20n;
const DEFAULT_SLIPPAGE_PCT = 1;
const MAX_SLIPPAGE_PCT = 5;
/** Recipient and refund account for dry quotes from a guest: the price doesn't depend on them. */
const DRY_ACCOUNT = "intents.near";

function slippageBps(pct: number | undefined): number {
  const p = pct ?? DEFAULT_SLIPPAGE_PCT;
  if (!Number.isFinite(p) || p < 0.1) return 10;
  if (p > MAX_SLIPPAGE_PCT) throw new SwapError(`Slippage above ${MAX_SLIPPAGE_PCT}% isn't allowed.`);
  return Math.round(p * 100);
}

const side = (a: Asset, raw: bigint): Side => {
  const amount = fromRaw(raw, a.decimals);
  return {
    symbol: a.symbol,
    asset: a.id,
    chain: a.chain,
    token: a.native ? null : a.token,
    amount,
    raw: raw.toString(),
    usd: a.price_usd === null ? null : Math.round(Number(amount.replaceAll(",", "")) * a.price_usd * 100) / 100,
  };
};

const minus = (raw: bigint, bps: number) => (raw * BigInt(10_000 - bps)) / 10_000n;

type Resolved = { from: Asset; to: Asset; raw: bigint; bps: number; recipient: string | null };

async function resolve(input: SwapInput, account: string | null): Promise<Resolved> {
  const [from, to] = await Promise.all([resolveAsset(input.from), resolveAsset(input.to)]);
  if (from.chain !== "near" || !from.token) {
    throw new SwapError(`Swaps are paid from a NEAR wallet, so the asset you pay with must be on NEAR (${from.symbol} is on ${from.chain}).`);
  }
  if (from.id === to.id && from.native === to.native) throw new SwapError("That's the same asset on both sides.");
  const raw = toRaw(input.amount, from.decimals);
  if (raw <= 0n) throw new SwapError("The amount must be more than zero.");
  let recipient: string | null;
  if (to.chain === "near") {
    // Output on NEAR always goes to the wallet that signs, so text in a token name can't redirect it.
    recipient = account;
  } else {
    recipient = input.recipient?.trim() || null;
    if (!recipient) throw new SwapError(`${to.symbol} is on ${to.chain}: give the ${to.chain} address that should receive it.`);
    if (recipient.length > 128 || /\s/.test(recipient)) throw new SwapError("That recipient address doesn't look valid.");
  }
  return { from, to, raw, bps: slippageBps(input.slippage_pct), recipient };
}

async function intentsQuote(r: Resolved, account: string | null, dry: boolean) {
  return intents.quote({
    dry,
    originAsset: r.from.id,
    destinationAsset: r.to.id,
    amount: r.raw.toString(),
    slippageBps: r.bps,
    recipient: r.recipient ?? account ?? DRY_ACCOUNT,
    refundTo: account ?? DRY_ACCOUNT,
    deadline: new Date(Date.now() + (dry ? 10 : 30) * 60_000),
  });
}

function intentsError(e: unknown): SwapError {
  const msg = e instanceof Error ? e.message : String(e);
  const code = e instanceof HttpError ? e.status : null;
  if (code === 429) return new SwapError("NEAR Intents is rate limiting quotes right now. Try again in a minute.");
  if (code === 404 && intents.PROVIDER === "aurora") return new SwapError("The swap service isn't set up right (the Aurora API key isn't assigned).");
  if (/liquidity/i.test(msg)) return new SwapError("NEAR Intents has no solver quoting this pair and amount right now.");
  if (/amount.*(low|small)|too small|minimum/i.test(msg)) return new SwapError(`NEAR Intents says the amount is too small: ${msg}`);
  if (/recipient|address/i.test(msg)) return new SwapError(`NEAR Intents rejected the recipient: ${msg}`);
  return new SwapError(`NEAR Intents couldn't quote this swap (${msg}).`);
}

/** A price for the swap. Nothing is stored and nothing can be signed from it. */
export function quoteSwap(input: SwapInput, account: string | null): Promise<SwapQuote> {
  // Swaps run on the wallet's network.
  return onNetwork(WALLET, () => quoteSwapOn(input, account));
}

async function quoteSwapOn(input: SwapInput, account: string | null): Promise<SwapQuote> {
  return priced(await resolve(input, account), account);
}

async function priced(r: Resolved, account: string | null): Promise<SwapQuote> {
  const { from, to, raw, bps } = r;
  const now = new Date();
  const canRhea = to.chain === "near" && Boolean(to.token) && Boolean(from.token);
  let intentsFailure: SwapError | null = null;

  if (from.intents && to.intents) {
    try {
      const q = await intentsQuote(r, account, true);
      const fee = (q.data.quoteRequest.appFees ?? []).reduce((s, f) => s + f.fee, 0);
      return {
        route: "intents",
        provider: q.provider,
        from: side(from, raw),
        to: side(to, BigInt(q.data.quote.amountOut)),
        min_out: fromRaw(q.data.quote.minAmountOut, to.decimals),
        min_out_raw: q.data.quote.minAmountOut,
        slippage_pct: bps / 100,
        recipient: r.recipient ?? account ?? "(your wallet)",
        fees: [
          ...(fee ? [`${intents.PROVIDER_LABEL[q.provider]} fee ${fee / 100}%, included in the quote.`] : []),
          "Plus NEAR gas and, if needed, token registration (under 0.01 NEAR).",
        ],
        pool_ids: null,
        time_estimate_s: q.data.quote.timeEstimate ?? null,
        sources: [ref(q.source, q.url, now)],
        as_of: now.toISOString(),
      };
    } catch (e) {
      intentsFailure = intentsError(e);
      if (!canRhea) throw intentsFailure;
    }
  }

  if (!canRhea) {
    throw new SwapError(
      to.chain === "near"
        ? `No route: NEAR Intents doesn't list ${!from.intents ? from.symbol : to.symbol}.`
        : `NEAR Intents doesn't list ${from.symbol}, and other chains can only be reached through it.`,
    );
  }
  const route = await bestRoute(from.token!, to.token!, raw);
  if (!route) throw intentsFailure ?? new SwapError(`No Rhea pool path from ${from.symbol} to ${to.symbol} can fill this amount.`);
  const min = minus(route.amount_out, bps);
  return {
    route: "rhea",
    provider: null,
    from: side(from, raw),
    to: side(to, route.amount_out),
    min_out: fromRaw(min, to.decimals),
    min_out_raw: min.toString(),
    slippage_pct: bps / 100,
    recipient: account ?? "(your wallet)",
    fees: ["Rhea pool fees are included in the quote.", "Plus NEAR gas and, if needed, token registration (under 0.01 NEAR)."],
    pool_ids: route.pool_ids,
    time_estimate_s: 5,
    sources: route.pool_ids.map((id) => ref("Rhea DCL quote", dclPoolUrl(id), now)),
    as_of: now.toISOString(),
  };
}

// ─── Propose ────────────────────────────────────────────────────────────────

async function spendable(a: Asset, account: string): Promise<bigint> {
  if (a.native) {
    const [acc, wrapped] = await Promise.all([viewAccount(account), ftBalance(WNEAR, account)]);
    const free = BigInt(acc.amount) - NEAR_RESERVE;
    return (free > 0n ? free : 0n) + wrapped;
  }
  return ftBalance(a.token!, account);
}

async function ftBalance(token: string, account: string): Promise<bigint> {
  const b = await tryView<string>(token, "ft_balance_of", { account_id: account });
  return BigInt(b ?? "0");
}

/**
 * Prices the swap for the signed-in `account`, attaches the last token check of what they'd buy
 * (for NVANA holders; it never runs one), and stores the proposal so approval uses exactly what
 * the card showed.
 */
export function proposeSwap(input: SwapInput, account: string, conversationId: string | null): Promise<Proposal> {
  // Swaps run on the wallet's network.
  return onNetwork(WALLET, () => proposeSwapOn(input, account, conversationId));
}

async function proposeSwapOn(input: SwapInput, account: string, conversationId: string | null): Promise<Proposal> {
  const r = await resolve(input, account);
  const have = await spendable(r.from, account);
  if (have < r.raw) {
    throw new SwapError(
      `${account} has ${fromRaw(have, r.from.decimals)} ${r.from.symbol} available${r.from.native ? " (after keeping 0.05 NEAR for gas)" : ""}, less than ${input.amount}.`,
    );
  }
  const q = await priced(r, account);

  const warnings: string[] = [];
  let risk: Proposal["risk"] = null;
  const checkable = r.to.chain === "near" && Boolean(r.to.token) && !r.to.native;
  // Token checks are for NVANA holders, so a swap only shows one a holder could see anyway.
  const rep = checkable && (await access(account)).ok ? storedReport(r.to.token!) : null;
  if (rep) {
    risk = swapRisk(rep);
    const tax = rep.checks.find((c) => c.id === "taxes")?.numbers;
    const buy = typeof tax?.buy_tax_pct === "number" ? tax.buy_tax_pct : null;
    const sell = typeof tax?.sell_tax_pct === "number" ? tax.sell_tax_pct : null;
    if (buy) warnings.push(`${q.to.symbol} takes a ${buy}% buy tax, so you receive about ${buy}% less than quoted.`);
    if (sell) warnings.push(`Selling ${q.to.symbol} later costs a ${sell}% tax.`);
  }
  if (r.to.chain !== "near") warnings.push(`The output goes to ${q.recipient} on ${r.to.chain}. Check the address: a wrong one can't be undone.`);

  const id = `swp_${randomBytes(9).toString("base64url")}`;
  const now = Date.now();
  const proposal: Proposal = { ...q, id, account, risk, checkable, warnings, expires_at: new Date(now + PROPOSAL_TTL_MS).toISOString() };
  getDb()
    .prepare(
      `INSERT INTO swaps (id, account, conversation_id, route, status, proposal, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'proposed', ?, ?, ?)`,
    )
    .run(id, account, conversationId, q.route, JSON.stringify({ proposal, input }), now, now);
  return proposal;
}

// ─── Approve, submit, track ─────────────────────────────────────────────────

type Row = {
  id: string;
  account: string;
  route: Route;
  status: SwapStatus;
  proposal: string;
  quote: string | null;
  deposit_address: string | null;
  tx_hash: string | null;
  result: string | null;
  updated_at: number;
};

function load(id: string, account: string): Row {
  const row = getDb().prepare("SELECT * FROM swaps WHERE id = ?").get(id) as Row | undefined;
  if (!row || row.account !== account) throw new SwapError("Swap not found for this wallet.");
  return row;
}

const stored = (row: Row) => JSON.parse(row.proposal) as { proposal: Proposal; input: SwapInput };

type StoredQuote = { provider?: intents.Provider; depositMemo?: string; min_out?: string };
const storedQuote = (row: Row): StoredQuote | null => (row.quote ? (JSON.parse(row.quote) as StoredQuote) : null);

/** The upstream that issued the swap's deposit address. Swaps from before providers were pinned used 1Click. */
const providerOf = (row: Row): intents.Provider => storedQuote(row)?.provider ?? stored(row).proposal.provider ?? "oneclick";
const depositMemoOf = (row: Row): string | null => storedQuote(row)?.depositMemo ?? null;

function update(id: string, fields: Partial<Omit<Row, "id" | "account" | "route" | "proposal">>) {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  getDb()
    .prepare(`UPDATE swaps SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => fields[k] ?? null), Date.now(), id);
}

function view(row: Row): SwapView {
  const { proposal } = stored(row);
  const quote = row.quote ? (JSON.parse(row.quote) as { min_out?: string }) : null;
  return {
    id: row.id,
    account: row.account,
    status: row.status,
    proposal,
    min_out: quote?.min_out ?? null,
    tx_hash: row.tx_hash,
    tx_url: row.tx_hash ? `${EXPLORER_TX}${row.tx_hash}` : null,
    result: row.result ? JSON.parse(row.result) : null,
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

/** Registration of `account` on `token`, when it has none. */
async function registration(token: string, account: string): Promise<FunctionCallAction | null> {
  const has = await tryView<unknown>(token, "storage_balance_of", { account_id: account });
  if (has) return null;
  const bounds = await tryView<{ min: string }>(token, "storage_balance_bounds");
  // A token without NEP-145 storage needs no registration.
  return bounds ? storageDeposit(account, bounds.min) : null;
}

/**
 * The deposit (NEAR Intents) or the pool swap (Rhea) as wallet transactions. Registrations come
 * first; the payment is the last action of the last transaction, so its outcome is the swap's.
 */
async function buildTxs(row: Row, r: Resolved, payTo: { depositAddress: string } | { pool_ids: string[]; minOut: bigint }): Promise<WalletTx[]> {
  const account = row.account;
  const txs: WalletTx[] = [];
  const pay = r.from.token!;
  if (r.to.chain === "near" && r.to.token && r.to.token !== pay) {
    const reg = await registration(r.to.token, account);
    if (reg) txs.push({ receiverId: r.to.token, actions: [reg] });
  }
  const actions: FunctionCallAction[] = [];
  if (r.from.native) {
    const reg = await registration(WNEAR, account);
    if (reg) actions.push(reg);
    const wrapped = reg ? 0n : await ftBalance(WNEAR, account);
    if (r.raw > wrapped) actions.push(nearDeposit((r.raw - wrapped).toString()));
  }
  if ("depositAddress" in payTo) {
    const reg = await registration(pay, payTo.depositAddress);
    if (reg) actions.push(reg);
    actions.push(ftTransfer(payTo.depositAddress, r.raw.toString()));
  } else {
    actions.push(ftTransferCall(dcl(), r.raw.toString(), swapMsg(payTo.pool_ids, r.to.token!, payTo.minOut)));
  }
  txs.push({ receiverId: pay, actions });
  return txs;
}

/**
 * The user pressed Approve: takes a real quote, checks it still gives at least the minimum the
 * card showed, and returns the transactions for the wallet.
 */
export function approveSwap(id: string, account: string): Promise<{ swap: SwapView; txs: WalletTx[] }> {
  // Swaps run on the wallet's network.
  return onNetwork(WALLET, () => approveSwapOn(id, account));
}

async function approveSwapOn(id: string, account: string): Promise<{ swap: SwapView; txs: WalletTx[] }> {
  const row = load(id, account);
  if (row.status !== "proposed") throw new SwapError(`This swap is already ${row.status}.`);
  const { proposal, input } = stored(row);
  if (Date.now() > Date.parse(proposal.expires_at)) {
    update(id, { status: "expired" });
    throw new SwapError("This quote expired. Ask for a new one.");
  }
  const r = await resolve(input, account);
  const floor = BigInt(proposal.min_out_raw);
  let txs: WalletTx[];

  if (row.route === "intents") {
    const q = await intentsQuote(r, account, false).catch((e: unknown) => {
      throw intentsError(e);
    });
    const qq = q.data.quote;
    if (!qq.depositAddress) throw new SwapError("NEAR Intents returned no deposit address. Try again.");
    if (BigInt(qq.amountIn) !== r.raw) throw new SwapError("NEAR Intents quoted a different amount than you approved. Try again.");
    if (BigInt(qq.amountOut) < floor) {
      throw new SwapError(`The price moved: you'd now get ${fromRaw(qq.amountOut, r.to.decimals)} ${r.to.symbol}, below the ${proposal.min_out} minimum you saw. Ask for a new quote.`);
    }
    txs = await buildTxs(row, r, { depositAddress: qq.depositAddress });
    update(id, {
      status: "signing",
      quote: JSON.stringify({ ...qq, provider: q.provider, min_out: fromRaw(qq.minAmountOut, r.to.decimals) }),
      deposit_address: qq.depositAddress,
    });
  } else {
    const pools = proposal.pool_ids!;
    const out = await quotePath(pools, r.from.token!, r.to.token!, r.raw);
    if (out === null || out < floor) {
      throw new SwapError(
        `The price moved: the pool now gives ${out === null ? "nothing" : `${fromRaw(out, r.to.decimals)} ${r.to.symbol}`}, below the ${proposal.min_out} minimum you saw. Ask for a new quote.`,
      );
    }
    txs = await buildTxs(row, r, { pool_ids: pools, minOut: floor });
    update(id, { status: "signing", quote: JSON.stringify({ amount_out: out.toString(), min_out: proposal.min_out }) });
  }
  return { swap: view(load(id, account)), txs };
}

/** The wallet signed and sent the payment. */
export function submitSwap(id: string, account: string, txHash: string | null): Promise<SwapView> {
  // Swaps run on the wallet's network.
  return onNetwork(WALLET, () => submitSwapOn(id, account, txHash));
}

async function submitSwapOn(id: string, account: string, txHash: string | null): Promise<SwapView> {
  const row = load(id, account);
  if (row.status !== "signing") throw new SwapError(`This swap is ${row.status}, not waiting for a signature.`);
  update(id, { status: "submitted", tx_hash: txHash });
  // Some wallets don't return the hash; 1Click still finds the deposit by its address.
  if (txHash && row.route === "intents" && row.deposit_address) {
    await intents.submitDeposit(providerOf(row), txHash, row.deposit_address, account);
  }
  return refreshSwap(id, account);
}

/** The wallet was closed or refused: the proposal can be approved again until it expires. */
export function rejectSwap(id: string, account: string, failed?: { txHash?: string; reason: string }): SwapView {
  const row = load(id, account);
  if (row.status === "signing") {
    if (failed) update(id, { status: "failed", tx_hash: failed.txHash ?? null, result: JSON.stringify({ reason: failed.reason }) });
    else update(id, { status: "proposed", quote: null, deposit_address: null });
  }
  return view(load(id, account));
}

const FINAL: SwapStatus[] = ["success", "refunded", "failed", "expired"];
/** Upstream is asked at most this often per swap. */
const REFRESH_MS = 3000;

/** The swap as it stands, asking 1Click or the chain when it's in flight. */
export function refreshSwap(id: string, account: string): Promise<SwapView> {
  // Swaps run on the wallet's network.
  return onNetwork(WALLET, () => refreshSwapOn(id, account));
}

async function refreshSwapOn(id: string, account: string): Promise<SwapView> {
  const row = load(id, account);
  if (row.status === "proposed" && Date.now() > Date.parse(stored(row).proposal.expires_at)) {
    update(id, { status: "expired" });
    return view(load(id, account));
  }
  if (FINAL.includes(row.status) || !["submitted", "processing"].includes(row.status)) return view(row);
  if (!row.tx_hash && row.route === "rhea") return view(row);
  if (row.status === "processing" && Date.now() - row.updated_at < REFRESH_MS) return view(row);

  try {
    if (row.route === "intents" && row.deposit_address) {
      const s = await intents.status(providerOf(row), row.deposit_address, depositMemoOf(row));
      const d = s.swapDetails;
      const status: SwapStatus =
        s.status === "SUCCESS" ? "success" : s.status === "REFUNDED" ? "refunded" : s.status === "FAILED" ? "failed" : "processing";
      update(id, {
        status,
        result: JSON.stringify({
          upstream: s.status,
          amount_out: d?.amountOutFormatted ?? null,
          refunded: d?.refundedAmount && d.refundedAmount !== "0" ? d.refundedAmountFormatted : null,
          reason: d?.refundReason ?? null,
          dest_tx_url: d?.destinationChainTxHashes?.[0]?.explorerUrl ?? null,
        }),
      });
    } else if (row.route === "rhea") {
      const outcome = await rheaOutcome(row);
      if (outcome) update(id, outcome);
      else update(id, { status: "processing" });
    }
  } catch {
    update(id, { status: "processing" });
  }
  return view(load(id, account));
}

type TxOutcome = {
  status: { SuccessValue?: string; Failure?: unknown };
  receipts_outcome: { outcome: { executor_id: string; logs: string[] } }[];
};

/** Reads the swap transaction: how much reached the user, or whether the input came back. */
async function rheaOutcome(row: Row): Promise<Partial<Row> | null> {
  const { proposal } = stored(row);
  const tx = (await txStatus(row.tx_hash!, row.account).catch(() => null)) as TxOutcome | null;
  if (!tx?.status) return null;
  if ("Failure" in tx.status) return { status: "failed", result: JSON.stringify({ reason: "The transaction failed on chain." }) };
  if (tx.status.SuccessValue === undefined) return null;

  // ft_transfer_call returns how much of the input was used: "0" means the swap didn't fill and it all came back.
  const used = (() => {
    try {
      return JSON.parse(Buffer.from(tx.status.SuccessValue!, "base64").toString()) as string;
    } catch {
      return null;
    }
  })();
  const outToken = proposal.to.token;
  let received: bigint | null = null;
  for (const r of tx.receipts_outcome) {
    if (r.outcome.executor_id !== outToken) continue;
    for (const log of r.outcome.logs) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        const ev = JSON.parse(log.slice(11)) as { event: string; data: { new_owner_id: string; amount: string }[] };
        if (ev.event !== "ft_transfer") continue;
        for (const d of ev.data) if (d.new_owner_id === row.account) received = (received ?? 0n) + BigInt(d.amount);
      } catch {
        /* not ours */
      }
    }
  }
  const decimals = (await resolveAsset(proposal.to.token ?? proposal.to.asset).catch(() => null))?.decimals;
  if (used === "0") return { status: "refunded", result: JSON.stringify({ reason: "The pool price moved past your minimum; nothing was swapped." }) };
  return {
    status: "success",
    result: JSON.stringify({ amount_out: received !== null && decimals !== undefined ? fromRaw(received, decimals) : null }),
  };
}

export function getSwap(id: string, account: string): SwapView {
  return view(load(id, account));
}
