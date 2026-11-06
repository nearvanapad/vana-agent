import { netKey } from "../near/network";
import { explorer } from "../near/network";
import { kv } from "../db";
import { accountTxs, transactions } from "../sources/fastnear-tx";
import { mapLimit, ref, type SourceRef } from "../sources/http";
import * as nearblocks from "../sources/nearblocks";
import { infraLabel } from "./holders";
import { FRESH_MAX_AGE_DAYS, FRESH_RED_PCT, FRESH_YELLOW_PCT, fmtPct, HUB_MIN_TXS } from "./rules";
import type { Check, Level, Wallet } from "./types";

/**
 * Where a wallet came from: who created or first funded it, when, and whether that funder is a
 * hub (registrar, exchange, relayer) that funds everyone and so links no one.
 */

export type Origin = {
  account: string;
  /** Signer of the account's first transaction: its parent, creator or first funder. */
  funder: string | null;
  created_at: string | null;
  tx: string | null;
  /** Transactions the account has touched over its life. */
  txs: number;
};

/** Top-level registrars and big relayers: they create accounts for anyone. */
const HUB_NAMES = new Set(["near", "tg", "testnet", "sweat", "kaiching", "relay.tg", "intents.near", "system", "user.intear.near", "hot.tg"]);
const EXCHANGE = /^(binance|okx|okex|bybit|kucoin|gate|huobi|htx|mexc|bitget|coinbase|kraken|crypto|bitfinex|upbit|bithumb)[\w-]*\.near$/;

/** True for accounts that fund wallets for strangers, so sharing one says nothing. */
export function isHub(o: Pick<Origin, "account" | "txs">): boolean {
  const a = o.account;
  const topLevel = !a.includes(".") && !/^[0-9a-f]{64}$/.test(a) && !/^0x[0-9a-f]{40}$/.test(a);
  return HUB_NAMES.has(a) || topLevel || EXCHANGE.test(a) || infraLabel(a) !== null || o.txs >= HUB_MIN_TXS;
}

async function fromNearblocks(account: string): Promise<Origin> {
  const r = await nearblocks.accountOrigin(account);
  return { account, funder: r.data.creator !== account ? r.data.creator : null, created_at: r.data.created_at, tx: r.data.tx, txs: 0 };
}

const KEY = (a: string) => netKey(`origin2:${a}`);

/**
 * Origins for many accounts. Creation never changes, so each is kept for good; the tx count is
 * only used to spot hubs, so a stale one is fine. One first-tx lookup per new account, then one
 * batched read of those transactions for their signers. Failures come back null.
 */
export async function origins(accounts: string[]): Promise<Map<string, Origin | null>> {
  const unique = [...new Set(accounts)];
  const out = new Map<string, Origin | null>();
  const todo: string[] = [];
  for (const a of unique) {
    const hit = kv.get<Origin>(KEY(a));
    if (hit) out.set(a, hit);
    else todo.push(a);
  }
  if (!todo.length) return out;

  const firsts = await mapLimit(todo, 4, (a) => accountTxs(a, { limit: 1 }).catch(() => null));
  const hashes = firsts.flatMap((f) => (f?.txs[0] ? [f.txs[0].hash] : []));
  const txs = hashes.length ? await transactions(hashes).catch(() => null) : [];
  const signer = new Map((txs ?? []).map((t) => [t.transaction.hash, t.transaction.signer_id]));

  await mapLimit(todo, 2, async (a, i) => {
    const f = firsts[i];
    let o: Origin | null = null;
    if (f && txs) {
      const first = f.txs[0];
      const by = first ? (signer.get(first.hash) ?? null) : null;
      o = first
        ? { account: a, funder: by && by !== a ? by : null, created_at: new Date(first.at_ms).toISOString(), tx: first.hash, txs: f.total }
        : { account: a, funder: null, created_at: null, tx: null, txs: f.total };
    } else {
      o = await fromNearblocks(a).catch(() => null);
    }
    if (o && (o.created_at || f)) kv.set(KEY(a), o, null);
    out.set(a, o);
  });
  return out;
}

export async function origin(account: string): Promise<Origin | null> {
  return (await origins([account])).get(account) ?? null;
}

export function ageDays(o: Origin | null | undefined, now = Date.now()): number | null {
  return o?.created_at ? (now - Date.parse(o.created_at)) / 86_400_000 : null;
}

export const originSource = (o: Origin): SourceRef => ref("FastNEAR", o.tx ? explorer(`/txns/${o.tx}`) : explorer(`/address/${o.account}`));

/**
 * Share of the supply held by wallets younger than a week among the largest holders.
 * Fresh wallets stacking up early is how a dev hides a big position across many accounts.
 */
export async function freshCheck(holders: Wallet[], opts: { top?: number } = {}): Promise<Check> {
  const people = holders.filter((w) => !infraLabel(w.account) && w.label !== "token contract").slice(0, opts.top ?? 20);
  const found = await origins(people.map((w) => w.account));
  const fresh: Wallet[] = [];
  let unknown = 0;
  for (const w of people) {
    const age = ageDays(found.get(w.account));
    if (age === null) unknown++;
    else if (age < FRESH_MAX_AGE_DAYS) fresh.push({ ...w, label: `${Math.max(0, Math.floor(age))}d old` + (w.label ? `, ${w.label}` : "") });
  }
  const freshPct = Math.round(fresh.reduce((s, w) => s + (w.share_pct ?? 0), 0) * 100) / 100;
  const level: Level = freshPct >= FRESH_RED_PCT ? "red" : freshPct >= FRESH_YELLOW_PCT ? "yellow" : "green";
  const findings: Check["findings"] = [
    {
      level,
      text:
        `${fresh.length} of the top ${people.length} holders are wallets under ${FRESH_MAX_AGE_DAYS} days old, holding ${fmtPct(freshPct)} of the supply` +
        (level === "green" ? "." : ` (yellow at ${FRESH_YELLOW_PCT}%, red at ${FRESH_RED_PCT}%).`),
    },
  ];
  if (unknown) findings.push({ level: "not_checked", text: `Age unknown for ${unknown} wallet${unknown > 1 ? "s" : ""}.` });
  const sources = [...found.values()].filter((o): o is Origin => Boolean(o?.tx)).slice(0, 3).map(originSource);
  return {
    id: "fresh_wallets",
    title: "Fresh wallets",
    level,
    summary: people.length === 0 ? "No wallet holds it outside pools and lockers." : `Wallets under ${FRESH_MAX_AGE_DAYS} days old hold ${fmtPct(freshPct)} among the top ${people.length}.`,
    findings: people.length === 0 ? [{ level: "green", text: "No wallet holds the token outside pools, lockers and burns." }] : findings,
    numbers: { fresh_wallets: fresh.length, fresh_pct: freshPct, holders_checked: people.length, age_unknown: unknown, max_age_days: FRESH_MAX_AGE_DAYS },
    wallets: fresh.sort((a, b) => (b.share_pct ?? 0) - (a.share_pct ?? 0)).slice(0, 10),
    sources: sources.length ? sources : [ref("FastNEAR", explorer(""))],
  };
}
