import { getDb } from "../db";
import { net } from "../near/network";
import { viewAccount } from "../near/rpc";
import { SwapError } from "./assets";

/**
 * Sponsored account setup. A deposit swap paid from another chain delivers to a NEAR token the
 * account may not be registered on (NEP-145), and the user, who may hold no NEAR at all, can't
 * pay for it. When a sponsor account is configured, the server registers the account itself, before
 * the deposit address is shown, and the quote carries a small fee on top of ours that covers it.
 *
 * What bounds the spend: only registrations the token's own bounds price at or under
 * SPONSOR_MAX_DEPOSIT_NEAR, a daily total, a daily count per account, an optional token allowlist,
 * a balance floor, and the fee itself, which is only charged when the registration is.
 * Without a sponsor account, or without a fee of ours to collect it through, nothing here is on.
 */

const YOCTO = 10n ** 24n;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The gas attached to the registration. What it burns is a fraction of that; the fee covers all of it. */
const GAS_TGAS = 10n;
const GAS_COST_YOCTO = 10n ** 21n; // 0.001 NEAR
/** Covers the price moving between the quote and the fill. */
const PRICE_BUFFER_PCT = 150n;

/** "0.0125" → yoctoNEAR. Null when it isn't a plain non-negative decimal. */
export function nearToYocto(s: string | undefined): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec((s ?? "").trim());
  if (!m) return null;
  return BigInt(m[1]!) * YOCTO + BigInt((m[2] ?? "").padEnd(24, "0"));
}

export type SponsorConfig = {
  accountId: string;
  privateKey: string;
  network: "mainnet" | "testnet";
  maxDeposit: bigint;
  dailyMax: bigint;
  perAccountDaily: number;
  /** The most the setup may add to the quote's fee, in bps. A swap too small for it pays its own. */
  maxFeeBps: number;
  /** Stops sponsoring when the sponsor account holds less. */
  minBalance: bigint;
  /** When set, only these tokens. */
  tokens: Set<string> | null;
};

export function readConfig(env: Record<string, string | undefined> = process.env): SponsorConfig | null {
  const accountId = env.SPONSOR_ACCOUNT_ID?.trim();
  const privateKey = env.SPONSOR_PRIVATE_KEY?.trim();
  if (!accountId && !privateKey) return null;
  if (!accountId || !privateKey) {
    console.error("[sponsor] Set both SPONSOR_ACCOUNT_ID and SPONSOR_PRIVATE_KEY, or neither. Sponsoring is off.");
    return null;
  }
  const money = (k: string, dflt: string) => {
    const v = nearToYocto(env[k]?.trim() || dflt);
    if (v === null) throw new Error(`${k} must be an amount of NEAR like 0.01.`);
    return v;
  };
  const whole = (k: string, dflt: number, max: number) => {
    const raw = env[k]?.trim();
    const n = raw ? Number(raw) : dflt;
    if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${k} must be a whole number from 0 to ${max}.`);
    return n;
  };
  try {
    const tokens = (env.SPONSOR_TOKENS ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    return {
      accountId,
      privateKey,
      network: env.SPONSOR_NETWORK?.trim() === "testnet" ? "testnet" : "mainnet",
      maxDeposit: money("SPONSOR_MAX_DEPOSIT_NEAR", "0.01"),
      dailyMax: money("SPONSOR_DAILY_MAX_NEAR", "1"),
      perAccountDaily: whole("SPONSOR_ACCOUNT_DAILY_MAX", 3, 100),
      maxFeeBps: whole("SPONSOR_MAX_FEE_BPS", 100, 400),
      minBalance: money("SPONSOR_MIN_BALANCE_NEAR", "0.2"),
      tokens: tokens.length ? new Set(tokens) : null,
    };
  } catch (e) {
    console.error(`[sponsor] ${(e as Error).message} Sponsoring is off.`);
    return null;
  }
}

let cached: { config: SponsorConfig | null } | null = null;
/** Read once, like the fee. */
export const config = (): SponsorConfig | null => (cached ??= { config: readConfig() }).config;

/** What 1Click charges in all for a fee of `sent` bps from us (docs.near-intents.org, Fee Configuration). */
export function totalFeeBps(sent: number, keyed: boolean): number {
  if (!keyed) return sent + 25;
  return sent >= 40 ? sent : Math.ceil(sent / 2) + 20;
}

/**
 * The fee to send so that, after 1Click's split, we keep `extra` bps more than with `base`. With
 * a key 1Click takes half of what we send; without one it keeps nothing of it.
 */
export const sentFeeBps = (base: number, extra: number, keyed: boolean) => base + (keyed ? 2 * extra : extra);

/** The 1Click total, in bps, above which a quote is refused (its own limit is 500). */
const MAX_TOTAL_BPS = 500;

/**
 * The bps of the swap's input that pay for one registration of `deposit`: the deposit, the gas and
 * a buffer, in dollars, over the swap's value. Null when the swap is too small for the setup to
 * fit under `maxBps`, or a price is missing.
 */
export function setupFeeBps(p: { deposit: bigint; nearUsd: number | null; amountUsd: number | null; maxBps: number }): number | null {
  if (!p.nearUsd || !p.amountUsd || !(p.nearUsd > 0) || !(p.amountUsd > 0)) return null;
  const cost = ((p.deposit + GAS_COST_YOCTO) * PRICE_BUFFER_PCT) / 100n;
  const costUsd = (Number(cost) / Number(YOCTO)) * p.nearUsd;
  const bps = Math.max(1, Math.ceil((costUsd / p.amountUsd) * 10_000));
  return bps <= p.maxBps ? bps : null;
}

export const withinTotal = (sent: number, keyed: boolean) => totalFeeBps(sent, keyed) <= MAX_TOTAL_BPS;

// ─── Ledger ─────────────────────────────────────────────────────────────────

type Spend = { n: number; yocto: bigint };

function spent(since: number, account?: string): Spend {
  const rows = (
    account
      ? getDb().prepare("SELECT yocto FROM sponsor_spend WHERE at_ms > ? AND account = ?").all(since, account)
      : getDb().prepare("SELECT yocto FROM sponsor_spend WHERE at_ms > ?").all(since)
  ) as { yocto: string }[];
  return { n: rows.length, yocto: rows.reduce((s, r) => s + BigInt(r.yocto), 0n) };
}

/** Whether another registration for `account` fits the daily limits. */
function fits(c: SponsorConfig, account: string, deposit: bigint, now: number): boolean {
  const since = now - DAY_MS;
  return spent(since, account).n < c.perAccountDaily && spent(since).yocto + deposit + GAS_COST_YOCTO <= c.dailyMax;
}

/** Counts a registration before it is sent, so two at once can't both slip under a limit. */
function reserve(c: SponsorConfig, account: string, token: string, deposit: bigint, now = Date.now()): number {
  return getDb().transaction(() => {
    if (!fits(c, account, deposit, now)) throw new SwapError("Account setup is at its limit for now. Try again later.");
    const r = getDb()
      .prepare("INSERT INTO sponsor_spend (at_ms, account, token, yocto) VALUES (?, ?, ?, ?)")
      .run(now, account, token, (deposit + GAS_COST_YOCTO).toString());
    return Number(r.lastInsertRowid);
  }).immediate();
}

// ─── Availability and the registration ──────────────────────────────────────

let balance: { at: number; yocto: bigint } | null = null;
async function sponsorBalance(c: SponsorConfig): Promise<bigint> {
  if (balance && Date.now() - balance.at < 60_000) return balance.yocto;
  const yocto = BigInt((await viewAccount(c.accountId)).amount);
  balance = { at: Date.now(), yocto };
  return yocto;
}

/**
 * Whether this account's registration on `token`, costing `deposit`, can be sponsored right now.
 * Never throws: any doubt is a no, and the user registers themselves as before.
 */
export async function canSponsor(token: string, account: string, deposit: bigint): Promise<boolean> {
  const c = config();
  if (!c || net().id !== c.network) return false;
  if (c.tokens && !c.tokens.has(token)) return false;
  if (deposit > c.maxDeposit) return false;
  try {
    if (!fits(c, account, deposit, Date.now())) return false;
    return (await sponsorBalance(c)) >= c.minBalance + deposit + GAS_COST_YOCTO;
  } catch {
    return false;
  }
}

/**
 * Registers `account` on `token` from the sponsor account: `storage_deposit` with
 * `registration_only`, which refunds the sponsor if the account is registered by then. The limits
 * are checked again here, and the spend counted before anything is sent. The caller checks the
 * registration landed before it shows a deposit address.
 */
export async function sponsorRegistration(token: string, account: string, deposit: bigint): Promise<string> {
  const c = config();
  if (!c || net().id !== c.network || (c.tokens && !c.tokens.has(token)) || deposit > c.maxDeposit) {
    throw new SwapError("Account setup isn't available for this swap. Ask for a new quote.");
  }
  reserve(c, account, token, deposit);
  balance = null;
  try {
    const { Account, actions, JsonRpcProvider } = await import("near-api-js");
    const sponsor = new Account(c.accountId, new JsonRpcProvider({ url: net().rpc[0]! }), c.privateKey as `ed25519:${string}`);
    const out = await sponsor.signAndSendTransaction({
      receiverId: token,
      actions: [actions.functionCall("storage_deposit", { account_id: account, registration_only: true }, GAS_TGAS * 10n ** 12n, deposit)],
    });
    if (typeof out.status === "object" && out.status !== null && "Failure" in out.status) throw new Error("the transaction failed");
    return out.transaction.hash as string;
  } catch (e) {
    // The message may carry request details; the key is never in it, but keep it short anyway.
    console.error(`[sponsor] Registering ${account} on ${token} failed: ${String((e as Error).message ?? e).slice(0, 200)}`);
    throw new SwapError("Couldn't set up your account on the token. Nothing was sent. Ask for a new quote.");
  }
}
