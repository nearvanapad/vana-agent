import { net, netKey } from "../near/network";
import { explorer } from "../near/network";
import { getDb, kv } from "../db";
import { tryView } from "../near/rpc";
import { accountTxs, ftEvents, isPool, transactions } from "../sources/fastnear-tx";
import { mapLimit, ref, type SourceRef } from "../sources/http";
import type { Holder } from "../sources/nearblocks";
import { infraLabel } from "./holders";
import { recentRooms } from "./launchpad/justhoot";
import { recentLaunches } from "./launchpad/nearly";
import {
  BUNDLE_RED_PCT,
  BUNDLE_RED_WALLETS,
  EARLY_BUYERS,
  EARLY_WINDOW_S,
  fmtPct,
  pct,
  SNIPER_LAUNCHES,
} from "./rules";
import type { Check, Level, TokenInfo, Wallet } from "./types";
import { isHub, origins, type Origin } from "./wallets";

/**
 * Early buyers and bundles. The first wallets to buy from a new pool are read from the token's
 * own transfer events. A bundle is a set of early buyers that are secretly one party: funded by
 * the dev or by the same wallet, sub-accounts of the dev, or passing the coin between them.
 */

/** How many of the token's first transactions are read. */
const SCAN_TXS = 100;

export type EarlyBuy = { account: string; rank: number; at_ms: number; bought: string };

export type EarlyData = {
  token: string;
  /** When the first liquidity went into a pool. */
  opened_ms: number | null;
  buyers: EarlyBuy[];
  /** Token moves between wallets (not pools) in the scanned window: [from, to]. */
  transfers: [string, string][];
  scanned_txs: number;
  total_txs: number;
};

const skip = (a: string | null, token: string) => !a || a === token || isPool(a) || infraLabel(a) !== null;

async function loadEarly(token: string): Promise<EarlyData> {
  const { txs, total } = await accountTxs(token, { limit: SCAN_TXS });
  const full = await transactions(txs.map((t) => t.hash));
  const events = ftEvents(full, token);

  const opened = events.find((e) => e.kind === "transfer" && isPool(e.to));
  const opened_ms = opened?.at_ms ?? null;
  const seen = new Map<string, EarlyBuy>();
  const transfers: [string, string][] = [];
  for (const e of events) {
    if (e.kind !== "transfer") continue;
    if (isPool(e.from) && !skip(e.to, token)) {
      const b = seen.get(e.to!);
      if (b) b.bought = (BigInt(b.bought) + e.amount).toString();
      else seen.set(e.to!, { account: e.to!, rank: seen.size + 1, at_ms: e.at_ms, bought: e.amount.toString() });
    } else if (!skip(e.from, token) && !skip(e.to, token) && e.from !== e.to) {
      transfers.push([e.from!, e.to!]);
    }
  }
  const buyers = [...seen.values()].filter(
    (b) => b.rank <= EARLY_BUYERS || (opened_ms !== null && b.at_ms - opened_ms <= EARLY_WINDOW_S * 1000),
  );
  return { token, opened_ms, buyers, transfers, scanned_txs: txs.length, total_txs: total };
}

/**
 * The token's early buyers. Kept 10 minutes while the launch is under a day old, then for good.
 */
export async function earlyBuyers(token: string): Promise<EarlyData> {
  const key = netKey(`early:${token}`);
  const hit = kv.get<EarlyData>(key);
  if (hit) return hit;
  const d = await loadEarly(token);
  const young = d.opened_ms === null || Date.now() - d.opened_ms < 86_400_000;
  // Past the first day with more history than the scan read, the first buyers can no longer change.
  kv.set(key, d, young ? 10 * 60_000 : d.scanned_txs < d.total_txs ? null : 60 * 60_000);
  if (d.opened_ms !== null) {
    const db = getDb();
    const put = db.prepare("INSERT OR REPLACE INTO early_buys (token, account, rank, at_ms) VALUES (?, ?, ?, ?)");
    db.transaction(() => d.buyers.forEach((b) => put.run(token, b.account, b.rank, b.at_ms)))();
  }
  return d;
}

/** Launches the sniper index needs before it says anything. */
const INDEX_MIN = 10;
let warming: Promise<void> | null = null;

/** Fills a cold sniper index with the early buyers of the newest launches on both launchpads. */
export function warmIndex(): Promise<void> {
  // The launchpads are on mainnet; a testnet token has nothing to warm from.
  if (net().id !== "mainnet") return Promise.resolve();
  const have = (getDb().prepare("SELECT COUNT(DISTINCT token) AS n FROM early_buys").get() as { n: number }).n;
  if (have >= INDEX_MIN) return Promise.resolve();
  warming ??= (async () => {
    const [nearly, hoot] = await Promise.all([recentLaunches(8).catch(() => []), recentRooms(5).catch(() => [])]);
    const tokens = [...nearly.filter((l) => l.step === "Done").map((l) => l.token), ...hoot.map((r) => r.token)];
    await mapLimit(tokens, 4, (t) => earlyBuyers(t).catch(() => null));
  })().finally(() => {
    warming = null;
  });
  return warming;
}

/** Other launches each account was an early buyer in, among those this app has looked at. */
function otherLaunches(accounts: string[], token: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!accounts.length) return out;
  const rows = getDb()
    .prepare(`SELECT account, token FROM early_buys WHERE token != ? AND account IN (${accounts.map(() => "?").join(",")})`)
    .all(token, ...accounts) as { account: string; token: string }[];
  for (const r of rows) out.set(r.account, [...(out.get(r.account) ?? []), r.token]);
  return out;
}

/** Union-find over account ids. */
class Groups {
  private parent = new Map<string, string>();
  find(a: string): string {
    const p = this.parent.get(a);
    if (!p || p === a) return a;
    const root = this.find(p);
    this.parent.set(a, root);
    return root;
  }
  join(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const DEV = "\u0000dev";

export async function bundleCheck(info: TokenInfo, holders: Holder[]): Promise<Check> {
  const early = await earlyBuyers(info.token);
  const source = ref("FastNEAR", explorer(`/token/${info.token}`));
  const dev = info.dev?.account ?? null;
  const buyers = early.buyers.filter((b) => b.account !== dev);

  if (!early.buyers.length) {
    return {
      id: "early_buyers",
      title: "Early buyers",
      level: "not_checked",
      summary: `No pool buys in the token's first ${early.scanned_txs} transactions.`,
      findings: [{ level: "not_checked", text: `No buys from a Rhea pool in the token's first ${early.scanned_txs} transactions, so early buyers were not checked.` }],
      numbers: { scanned_txs: early.scanned_txs },
      sources: [source],
    };
  }

  // What they hold now: the top-holder list first, the chain for the rest.
  const supply = BigInt(info.total_supply);
  const known = new Map(holders.map((h) => [h.account, BigInt(h.amount)]));
  const balances = await mapLimit(buyers, 6, async (b) =>
    known.get(b.account) ?? (await tryView<string>(info.token, "ft_balance_of", { account_id: b.account }).then((v) => (v ? BigInt(v) : 0n)).catch(() => null)),
  );

  // Who funded them, and who funded the funders.
  const hop1 = await origins(buyers.map((b) => b.account));
  const funders = [...new Set([...hop1.values()].map((o) => o?.funder).filter((f): f is string => Boolean(f)))];
  const funderOrigins = await origins(funders.filter((f) => f !== dev && !hop1.has(f)));
  const originOf = (a: string): Origin | null => hop1.get(a) ?? funderOrigins.get(a) ?? null;
  const hub = (a: string) => {
    const o = originOf(a);
    return isHub(o ?? { account: a, txs: 0 });
  };

  const groups = new Groups();
  const why = new Map<string, Set<string>>();
  const note = (a: string, reason: string) => why.set(a, (why.get(a) ?? new Set()).add(reason));
  const isBuyer = new Set(buyers.map((b) => b.account));
  const byFunder = new Map<string, string[]>();
  const short = (a: string) => (a.length > 24 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

  for (const b of buyers) {
    const a = b.account;
    const f = hop1.get(a)?.funder ?? null;
    const g = f ? (originOf(f)?.funder ?? null) : null;
    if (dev && (a.endsWith(`.${dev}`) || dev.endsWith(`.${a}`))) {
      groups.join(a, DEV);
      note(a, "sub-account of the dev");
    }
    if (f && f === dev) {
      groups.join(a, DEV);
      note(a, "funded by the dev");
    } else if (f && isBuyer.has(f)) {
      groups.join(a, f);
      note(a, `funded by early buyer ${short(f)}`);
    } else if (g && g === dev) {
      groups.join(a, DEV);
      note(a, `funded by ${short(f!)}, which the dev funded`);
    }
    if (f && f !== dev && !hub(f)) byFunder.set(f, [...(byFunder.get(f) ?? []), a]);
    if (g && f && !hub(g) && !hub(f) && g !== dev) byFunder.set(`2:${g}`, [...(byFunder.get(`2:${g}`) ?? []), a]);
  }
  for (const [f, list] of byFunder) {
    const uniq = [...new Set(list)];
    if (uniq.length < 2) continue;
    // Two hops only says something new when the buyers' own funders differ.
    if (f.startsWith("2:") && new Set(uniq.map((a) => hop1.get(a)?.funder)).size < 2) continue;
    const name = f.startsWith("2:") ? `funders that share the funder ${short(f.slice(2))}` : `the same funder ${short(f)}`;
    for (const a of uniq) {
      groups.join(a, uniq[0]!);
      note(a, `${name} as ${uniq.length - 1} other early buyer${uniq.length > 2 ? "s" : ""}`);
    }
  }
  for (const [from, to] of early.transfers) {
    if (!isBuyer.has(to)) continue;
    if (from === dev) {
      groups.join(to, DEV);
      note(to, "got the coin from the dev");
    } else if (isBuyer.has(from)) {
      groups.join(to, from);
      note(to, `got the coin from early buyer ${short(from)}`);
    }
  }

  // A cold index gets a head start, but the report doesn't wait long for it.
  await Promise.race([warmIndex(), new Promise((r) => setTimeout(r, 20_000))]);
  const others = otherLaunches(buyers.map((b) => b.account), info.token);
  const snipers = buyers.filter((b) => (others.get(b.account)?.length ?? 0) + 1 >= SNIPER_LAUNCHES);

  // A group not tied to the dev whose members all snipe launches is a bot farm, not this dev's bundle.
  const members = new Map<string, EarlyBuy[]>();
  for (const b of buyers) members.set(groups.find(b.account), [...(members.get(groups.find(b.account)) ?? []), b]);
  const devRoot = groups.find(DEV);
  const farms: EarlyBuy[] = [];
  const linked = buyers.filter((b) => {
    const r = groups.find(b.account);
    if (r === devRoot) return true;
    const group = members.get(r)!;
    if (group.length < 2) return false;
    if (group.every((m) => snipers.includes(m))) {
      farms.push(b);
      return false;
    }
    return true;
  });
  const toDev = linked.filter((b) => groups.find(b.account) === devRoot).length;

  const holdPct = (i: number) => (balances[i] === null ? null : pct(balances[i]!, supply));
  const sharesBy = new Map(buyers.map((b, i) => [b.account, holdPct(i)]));
  const linkedPct = round(linked.reduce((s, b) => s + (sharesBy.get(b.account) ?? 0), 0));
  const linkedBoughtPct = round(linked.reduce((s, b) => s + pct(BigInt(b.bought), supply), 0));
  const earlyPct = round(buyers.reduce((s, b) => s + (sharesBy.get(b.account) ?? 0), 0));

  const sniperPct = round(snipers.reduce((s, b) => s + (sharesBy.get(b.account) ?? 0), 0));
  const fast = buyers.filter((b) => early.opened_ms !== null && b.at_ms - early.opened_ms <= EARLY_WINDOW_S * 1000);

  const level: Level =
    linked.length >= BUNDLE_RED_WALLETS || linkedPct >= BUNDLE_RED_PCT ? "red" : linked.length >= 2 || sniperPct >= BUNDLE_RED_PCT ? "yellow" : "green";

  const findings: Check["findings"] = [];
  if (linked.length) {
    findings.push({
      level: linked.length >= BUNDLE_RED_WALLETS || linkedPct >= BUNDLE_RED_PCT ? "red" : "yellow",
      text:
        `${linked.length} of the first ${buyers.length} buyers are linked` +
        (toDev ? ` (${toDev} to the dev)` : "") +
        `: they bought ${fmtPct(linkedBoughtPct)} of the supply and hold ${fmtPct(linkedPct)} now (red at ${BUNDLE_RED_WALLETS} wallets or ${BUNDLE_RED_PCT}%).`,
    });
  } else {
    findings.push({ level: "green", text: `None of the first ${buyers.length} buyers share a funder with each other or the dev.` });
  }
  if (fast.length) {
    findings.push({ level: "green", text: `${fast.length} bought within ${EARLY_WINDOW_S} seconds of the pool opening, which takes a bot.` });
  }
  if (farms.length) {
    findings.push({
      level: "green",
      text: `${farms.length} early buyers share a funder but snipe launches in general, so they are counted as a bot group, not as the dev's.`,
    });
  }
  if (snipers.length) {
    findings.push({
      level: sniperPct >= BUNDLE_RED_PCT ? "yellow" : "green",
      text: `${snipers.length} early buyer${snipers.length > 1 ? "s are" : " is a"} sniper${snipers.length > 1 ? "s" : ""}, early in ${SNIPER_LAUNCHES}+ launches this app has checked; they hold ${fmtPct(sniperPct)}.`,
    });
  }
  findings.push({ level: "green", text: `The first ${buyers.length} buyers hold ${fmtPct(earlyPct)} of the supply between them now.` });
  const unknown = buyers.filter((b) => !hop1.get(b.account)).length;
  if (unknown) findings.push({ level: "not_checked", text: `Funder unknown for ${unknown} early buyer${unknown > 1 ? "s" : ""}.` });

  const wallets: Wallet[] = [...linked, ...buyers.filter((b) => !linked.includes(b))].slice(0, 12).map((b) => {
    const tags = [...(why.get(b.account) ?? [])];
    if (farms.includes(b)) tags.push("sniper group");
    else if (snipers.includes(b)) tags.push("sniper");
    if (early.opened_ms !== null) tags.unshift(`#${b.rank}, ${Math.max(0, Math.round((b.at_ms - early.opened_ms) / 1000))}s after open`);
    return { account: b.account, share_pct: sharesBy.get(b.account) ?? undefined, label: tags.join("; ") };
  });

  const sources: SourceRef[] = [source, ...[...hop1.values()].filter((o): o is Origin => Boolean(o?.tx)).slice(0, 2).map((o) => ref("FastNEAR", explorer(`/txns/${o.tx}`)))];
  return {
    id: "early_buyers",
    title: "Early buyers",
    level,
    summary: linked.length
      ? `${linked.length} linked early buyers hold ${fmtPct(linkedPct)}.`
      : `No links found among the first ${buyers.length} buyers; they hold ${fmtPct(earlyPct)}.`,
    findings,
    numbers: {
      early_buyers: buyers.length,
      linked_buyers: linked.length,
      linked_to_dev: toDev,
      linked_hold_pct: linkedPct,
      linked_bought_pct: linkedBoughtPct,
      early_hold_pct: earlyPct,
      snipers: snipers.length,
      bought_within_10s: fast.length,
      pool_opened_at: early.opened_ms ? new Date(early.opened_ms).toISOString() : null,
      scanned_txs: early.scanned_txs,
    },
    wallets,
    sources,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
