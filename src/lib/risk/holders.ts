import * as fastnear from "../sources/fastnear";
import { refOf, type SourceRef, type Sourced } from "../sources/http";
import * as nearblocks from "../sources/nearblocks";
import { CLASSIC, DCL } from "../sources/rhea";
import { isLaunchpadInfra } from "./launchpad";
import { concentration, DEV_RED_PCT, DEV_YELLOW_PCT, fmtPct, pct, TOP10_RED_PCT, TOP10_YELLOW_PCT, WHALE_PCT } from "./rules";
import type { Check, Level, TokenInfo, Wallet } from "./types";

/** Accounts that hold tokens for others or for no one: left out of the top 10. */
export function infraLabel(account: string): string | null {
  if (account === CLASSIC || account === DCL) return "Rhea pool";
  if (isLaunchpadInfra(account)) return "launchpad / locker";
  if (/^0{64}$/.test(account) || account === "system" || /(^|\.)burn(\.|$)/.test(account)) return "burned";
  if (account === "intents.near") return "NEAR Intents (held for its users)";
  return null;
}

function devLabel(account: string, dev: string | null): string | null {
  if (!dev) return null;
  if (account === dev) return "dev";
  if (account.endsWith(`.${dev}`)) return "dev sub-account";
  return null;
}

export type HolderList = { list: nearblocks.Holder[]; count: Sourced<number> | null; sources: SourceRef[] };

/** The largest holders (FastNEAR, NearBlocks as fallback) and the holder count. */
export async function loadHolders(token: string): Promise<HolderList> {
  let list: nearblocks.Holder[];
  const sources: SourceRef[] = [];
  try {
    const r = await fastnear.topHolders(token);
    list = r.data;
    sources.push(refOf(r));
  } catch {
    const r = await nearblocks.holders(token, 25);
    list = r.data;
    sources.push(refOf(r));
  }
  // NearBlocks reports 0 for tokens it has not indexed yet: treat that as unknown
  const count = await nearblocks
    .holderCount(token)
    .then((c) => (c.data > 0 ? c : null))
    .catch(() => null);
  if (count) sources.push(refOf(count));
  return { list, count, sources };
}

/** Holders that are people (not pools, lockers, burns), with their share and dev label. */
export function people(info: TokenInfo, list: nearblocks.Holder[]): Wallet[] {
  const supply = BigInt(info.total_supply);
  const dev = info.dev?.account ?? null;
  return list
    .filter((h) => !infraLabel(h.account))
    .map((h) => ({
      account: h.account,
      share_pct: pct(BigInt(h.amount), supply),
      label: devLabel(h.account, dev) ?? (h.account === info.token ? "token contract" : undefined),
    }));
}

export async function holdersCheck(info: TokenInfo, loaded: HolderList): Promise<Check> {
  const { list, count } = loaded;
  const sources = [...loaded.sources];
  const supply = BigInt(info.total_supply);
  const dev = info.dev?.account ?? null;
  const share = (amount: string) => pct(BigInt(amount), supply);

  const infra: Wallet[] = [];
  const people: Wallet[] = [];
  for (const h of list) {
    const label = infraLabel(h.account);
    const w: Wallet = { account: h.account, share_pct: share(h.amount) };
    if (label) infra.push({ ...w, label });
    else people.push({ ...w, label: devLabel(h.account, dev) ?? (h.account === info.token ? "token contract" : undefined) });
  }

  const top10 = people.slice(0, 10);
  const top10Pct = round(top10.reduce((s, w) => s + (w.share_pct ?? 0), 0));
  const devWallets = people.filter((w) => w.label === "dev" || w.label === "dev sub-account");
  const devPct = round(devWallets.reduce((s, w) => s + (w.share_pct ?? 0), 0));
  const whales = people.filter((w) => (w.share_pct ?? 0) >= WHALE_PCT);
  const infraPct = round(infra.reduce((s, w) => s + (w.share_pct ?? 0), 0));

  const findings: Check["findings"] = [];
  const add = (level: Level, text: string) => findings.push({ level, text });

  const topLevel = concentration(top10Pct, 0);
  add(
    topLevel,
    `Top 10 holders (not counting pools, lockers and burns) hold ${fmtPct(top10Pct)} of the supply` +
      (topLevel === "green" ? "." : ` (yellow at ${TOP10_YELLOW_PCT}%, red at ${TOP10_RED_PCT}%).`),
  );
  if (!dev) {
    add("not_checked", "Dev wallet unknown, so the dev's share was not measured.");
  } else {
    const devLevel = concentration(0, devPct);
    add(
      devLevel,
      devPct > 0
        ? `The dev (${dev}) and its sub-accounts hold ${fmtPct(devPct)}` +
            (devLevel === "green" ? "." : ` (yellow above ${DEV_YELLOW_PCT}%, red at ${DEV_RED_PCT}%).`)
        : `The dev (${dev}) holds none of the top ${list.length} positions.`,
    );
  }
  for (const w of whales.filter((w) => !w.label?.startsWith("dev"))) {
    add("yellow", `${w.account} alone holds ${fmtPct(w.share_pct ?? 0)}.`);
  }
  if (infraPct > 0) {
    add("green", `${fmtPct(infraPct)} sits in pools, lockers or burn addresses: ${infra.slice(0, 4).map((w) => `${w.account} (${w.label})`).join(", ")}.`);
  }

  const level = concentration(top10Pct, devPct) === "red" ? "red" : findings.some((f) => f.level === "yellow") ? "yellow" : "green";
  const summary =
    `Top 10 hold ${fmtPct(top10Pct)}` +
    (dev ? `, dev holds ${fmtPct(devPct)}` : "") +
    (count ? ` across ${count.data.toLocaleString("en-US")} holders.` : ".");

  const wallets = [...top10, ...devWallets.filter((d) => !top10.includes(d))];
  return {
    id: "holders",
    title: "Holders",
    level,
    summary,
    findings,
    numbers: {
      top10_pct: top10Pct,
      dev_pct: dev ? devPct : null,
      dev,
      holder_count: count?.data ?? null,
      in_pools_lockers_burned_pct: infraPct,
      holders_seen: list.length,
    },
    wallets: [...wallets, ...infra.slice(0, 5)],
    sources,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
