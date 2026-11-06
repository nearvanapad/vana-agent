import { explorer } from "../near/network";
import { net } from "../near/network";
import { tryView } from "../near/rpc";
import { mapLimit, ref, type SourceRef } from "../sources/http";
import { prices } from "../sources/rhea";
import { hootUrl, roomsBy, tradesBy, type HootTrade, type Room } from "./launchpad/justhoot";
import { launchesBy, NEARLY, poolNow, type NearlyLaunch } from "./launchpad/nearly";
import { CREATOR_RED_BAD, DEAD_POOL_USD, units } from "./rules";
import type { Check, Level, TokenInfo, Wallet } from "./types";

/**
 * The creator's other launches on nearly and justhoot, and how each ended: still trading, dead
 * (sold back to the launch price or emptied), or sold off by the dev.
 */

const DAY = 86_400_000;
const MAX_PAST = 10;

export type Outcome = "alive" | "too_new" | "dead" | "dev_sold" | "failed";

export type PastLaunch = {
  token: string;
  platform: "nearly" | "justhoot";
  /** Creator-written. */
  symbol: string;
  created_at: string;
  outcome: Outcome;
  detail: string;
};

const LABEL: Record<Outcome, string> = {
  alive: "still trading",
  too_new: "under a day old",
  dead: "dead",
  dev_sold: "dev sold",
  failed: "launch failed",
};

async function judgeNearly(l: NearlyLaunch, dev: string, px: Map<string, { price: number; decimals: number }> | null): Promise<PastLaunch> {
  const base = { token: l.token, platform: "nearly" as const, symbol: l.symbol, created_at: new Date(l.created_at_ms).toISOString() };
  if (l.step === "Failed") return { ...base, outcome: "failed", detail: "The launch never completed." };
  const [pool, held] = await Promise.all([
    poolNow(l).catch(() => null),
    l.dev_buy_near > 0 ? tryView<string>(l.token, "ft_balance_of", { account_id: dev }).catch(() => null) : Promise.resolve(null),
  ]);
  if (l.dev_buy_near > 0 && held === "0") {
    return { ...base, outcome: "dev_sold", detail: `The dev bought with ${l.dev_buy_near} NEAR at launch and holds none now.` };
  }
  const q = px?.get(l.quote);
  const usd = pool && q ? units(pool.quote_reserve, q.decimals) * q.price : null;
  const old = Date.now() - l.created_at_ms > DAY;
  if (old && pool && (pool.at_launch_price || (usd !== null && usd < DEAD_POOL_USD))) {
    return {
      ...base,
      outcome: "dead",
      detail: pool.at_launch_price ? "Price is back at the launch price: buyers sold out." : `Only $${usd!.toFixed(0)} of buy-side money left in the pool.`,
    };
  }
  if (!old) return { ...base, outcome: "too_new", detail: "Launched less than a day ago." };
  return { ...base, outcome: "alive", detail: usd !== null ? `$${Math.round(usd).toLocaleString("en-US")} of buy-side money in the pool.` : "Still has a live pool." };
}

function judgeRoom(r: Room, devTrades: HootTrade[] | null): PastLaunch {
  const base = { token: r.token, platform: "justhoot" as const, symbol: r.symbol, created_at: r.created_at };
  const mine = devTrades?.filter((t) => t.token === r.token) ?? [];
  const bought = mine.filter((t) => t.side === "buy").reduce((s, t) => s + t.token_amount, 0);
  const sold = mine.filter((t) => t.side === "sell").reduce((s, t) => s + t.token_amount, 0);
  if (bought > 0 && sold >= bought * 0.5) {
    return { ...base, outcome: "dev_sold", detail: `The dev sold ${Math.round((sold / bought) * 100)}% of what it bought.` };
  }
  const age = Date.now() - Date.parse(r.created_at);
  if (age < DAY) return { ...base, outcome: "too_new", detail: "Launched less than a day ago." };
  const lastTrade = r.last_trade_at ? Date.parse(r.last_trade_at) : null;
  const fromAth = r.market_cap_usd !== null && r.ath_market_cap_usd ? r.market_cap_usd / r.ath_market_cap_usd : null;
  if (lastTrade === null || lastTrade - Date.parse(r.created_at) < DAY) {
    return { ...base, outcome: "dead", detail: "No trades after its first day." };
  }
  if (fromAth !== null && fromAth < 0.1) {
    return { ...base, outcome: "dead", detail: `Market cap is ${Math.round(fromAth * 100)}% of its peak ($${Math.round(r.market_cap_usd!).toLocaleString("en-US")}).` };
  }
  return { ...base, outcome: "alive", detail: r.market_cap_usd !== null ? `Market cap $${Math.round(r.market_cap_usd).toLocaleString("en-US")}.` : "Still trading." };
}

export async function creatorCheck(info: TokenInfo): Promise<Check> {
  const dev = info.dev?.account ?? null;
  if (!dev) {
    return {
      id: "creator",
      title: "Creator history",
      level: "not_checked",
      summary: "Not checked: the dev is unknown.",
      findings: [{ level: "not_checked", text: "No dev found, so the creator's other launches were not looked up." }],
      numbers: {},
      sources: [],
    };
  }

  if (net().id !== "mainnet") {
    return {
      id: "creator",
      title: "Creator history",
      level: "not_checked",
      summary: "Not checked: nearly and justhoot run on mainnet only.",
      findings: [{ level: "not_checked", text: "The launchpads this check reads (nearly, justhoot) run on mainnet only, so there is no launch history on testnet." }],
      numbers: { creator: dev },
      sources: [],
    };
  }

  const [nearly, rooms, px] = await Promise.all([
    launchesBy(dev).catch(() => null),
    roomsBy(dev).catch(() => null),
    prices()
      .then((p) => p.data)
      .catch(() => null),
  ]);
  const sources: SourceRef[] = [];
  if (nearly) sources.push(ref("NEAR RPC", explorer(`/address/${NEARLY}`)));
  if (rooms) sources.push(ref("justhoot", `https://justhoot.fun`));
  if (!nearly && !rooms) throw new Error("both launchpads unreachable");

  const otherNearly = (nearly ?? []).filter((l) => l.token !== info.token);
  const otherRooms = (rooms ?? []).filter((r) => r.token !== info.token);
  const total = otherNearly.length + otherRooms.length;
  const devTrades = otherRooms.length ? await tradesBy(dev).catch(() => null) : null;

  const recent = [
    ...otherNearly.map((l) => ({ at: l.created_at_ms, run: () => judgeNearly(l, dev, px) })),
    ...otherRooms.map((r) => ({ at: Date.parse(r.created_at), run: async () => judgeRoom(r, devTrades) })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_PAST);
  const past = await mapLimit(recent, 4, (x) => x.run());

  const count = (o: Outcome) => past.filter((p) => p.outcome === o).length;
  const dead = count("dead");
  const sold = count("dev_sold");
  const judged = past.filter((p) => p.outcome !== "too_new").length;
  const bad = dead + sold;

  let level: Level = "green";
  if (bad >= CREATOR_RED_BAD && bad * 2 >= judged) level = "red";
  else if (bad > 0) level = "yellow";

  const findings: Check["findings"] = [];
  const where = info.launchpad ? "" : " (only nearly and justhoot launches are known)";
  if (!total) {
    findings.push({
      level: "green",
      text: info.launchpad ? `This is the first launch by ${dev} on nearly or justhoot.` : `${dev} has no launches on nearly or justhoot.`,
    });
  } else {
    findings.push({
      level,
      text:
        `${dev} launched ${total} other token${total > 1 ? "s" : ""}${where}. Of the last ${past.length}: ` +
        (["alive", "dead", "dev_sold", "failed", "too_new"] as Outcome[])
          .filter((o) => count(o))
          .map((o) => `${count(o)} ${LABEL[o]}`)
          .join(", ") +
        ".",
    });
    if (sold) findings.push({ level: sold >= CREATOR_RED_BAD ? "red" : "yellow", text: `The dev sold out of ${sold} earlier launch${sold > 1 ? "es" : ""}.` });
    if (dead) findings.push({ level: dead >= CREATOR_RED_BAD ? "red" : "yellow", text: `${dead} earlier launch${dead > 1 ? "es are" : " is"} dead.` });
  }

  const wallets: Wallet[] = past.map((p) => ({ account: p.token, label: `${p.platform}, ${LABEL[p.outcome]}: ${p.detail}` }));
  return {
    id: "creator",
    title: "Creator history",
    level,
    summary: total
      ? `${total} other launch${total > 1 ? "es" : ""}; ${dead} dead, ${sold} sold by the dev, of the last ${past.length}.`
      : info.launchpad
        ? "First launch by this creator."
        : "No nearly or justhoot launches by this dev.",
    findings,
    numbers: {
      creator: dev,
      other_launches: total,
      checked: past.length,
      dead,
      dev_sold: sold,
      alive: count("alive"),
      past: past.map((p) => ({ token: p.token, platform: p.platform, created_at: p.created_at, outcome: p.outcome, detail: p.detail, url: p.platform === "justhoot" ? hootUrl(p.token) : explorer(`/token/${p.token}`) })),
    },
    wallets,
    sources,
  };
}
