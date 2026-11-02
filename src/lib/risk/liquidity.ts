import { EXPLORER_ACCOUNT } from "../near/config";
import { viewAccessKeys } from "../near/rpc";
import { ref, refOf, type SourceRef, type Sourced } from "../sources/http";
import { poolShares, positionOwner, prices, type Pool } from "../sources/rhea";
import { isLaunchpadInfra } from "./launchpad";
import { byLevel, DEV_LP_RED_PCT, fmtPct, fmtUsd, LIQUIDITY_THIN_USD, pct, units, worst } from "./rules";
import type { Check, Level, TokenInfo } from "./types";

export type PoolDepth = {
  pool: string;
  kind: Pool["kind"];
  url: string;
  pair: string[];
  /** Dollar value of the side you sell into (every token in the pool but this one). */
  other_side_usd: number | null;
  /** Dollar value of this token's side, when it has a price. */
  token_side_usd: number | null;
  fee_pct: number;
  state?: string;
};

export async function poolDepths(token: string, symbol: string, pools: Pool[]): Promise<{ depths: PoolDepth[]; priced: SourceRef }> {
  const px = await prices();
  const depths = pools.map((p): PoolDepth => {
    let other = 0;
    let otherPriced = false;
    let mine: number | null = null;
    for (let i = 0; i < p.tokens.length; i++) {
      const t = p.tokens[i]!;
      const price = px.data.get(t);
      const value = price ? units(p.amounts[i] ?? "0", price.decimals) * price.price : null;
      if (t === token) mine = value;
      else if (value !== null) {
        other += value;
        otherPriced = true;
      }
    }
    return {
      pool: p.id,
      kind: p.kind,
      url: p.url,
      pair: p.tokens.map((t) => (t === token ? symbol || "this token" : (px.data.get(t)?.symbol ?? t))),
      other_side_usd: otherPriced ? round(other) : null,
      token_side_usd: mine === null ? null : round(mine),
      fee_pct: p.fee_bps / 100,
      state: p.state,
    };
  });
  depths.sort((a, b) => (b.other_side_usd ?? -1) - (a.other_side_usd ?? -1));
  return { depths, priced: px };
}

export async function liquidityCheck(info: TokenInfo, pools: Sourced<Pool[]> & { partial?: boolean }): Promise<Check> {
  const findings: Check["findings"] = [];
  const add = (level: Level, text: string) => findings.push({ level, text });
  const sources: SourceRef[] = [ref(pools.source, pools.url, new Date(pools.as_of))];

  const live = pools.data.filter((p) => p.amounts.some((a) => BigInt(a) > 0n));
  const partialNote = "Only DCL pools against wNEAR, USDT and USDC were checked: the full Rhea pool list could not be loaded.";
  if (live.length === 0 && pools.partial) {
    return {
      id: "liquidity",
      title: "Liquidity",
      level: "not_checked",
      summary: `Not checked: ${partialNote}`,
      findings: [{ level: "not_checked", text: partialNote }],
      numbers: { pools: 0, depth_usd: null },
      sources,
    };
  }
  if (live.length === 0) {
    return {
      id: "liquidity",
      title: "Liquidity",
      level: "red",
      summary: "No Rhea pool holds this token, so there may be no way to sell it.",
      findings: [{ level: "red", text: "No Rhea pool holds this token, so there may be no way to sell it." }],
      numbers: { pools: 0, depth_usd: 0 },
      sources,
    };
  }

  const { depths, priced } = await poolDepths(info.token, info.symbol, live);
  sources.push(refOf(priced));
  const knownDepth = depths.filter((d) => d.other_side_usd !== null);
  const total = round(knownDepth.reduce((s, d) => s + (d.other_side_usd ?? 0), 0));
  const best = depths[0]!;

  if (knownDepth.length === 0) {
    add("not_checked", "No dollar price for the other side of any pool, so depth was not measured.");
  } else if (total < LIQUIDITY_THIN_USD) {
    add("yellow", `Thin: ${fmtUsd(total)} on the other side across ${live.length} pool${live.length > 1 ? "s" : ""}; one sell moves the price a lot.`);
  } else {
    add("green", `${fmtUsd(total)} on the other side across ${live.length} pool${live.length > 1 ? "s" : ""}; deepest is ${best.pair.join("/")} with ${fmtUsd(best.other_side_usd ?? 0)}.`);
  }
  for (const d of depths) {
    if (d.state && d.state !== "Running") add("yellow", `Pool ${d.pool} is ${d.state}: trading there is stopped.`);
  }

  if (pools.partial) add("not_checked", partialNote);

  // Who can pull the liquidity
  const lp = await lpControl(info, live);
  findings.push(...lp.findings);
  sources.push(...lp.sources);

  findings.sort(byLevel);
  const level = worst(findings.map((f) => f.level));
  const summary = findings.filter((f) => f.level === level).map((f) => f.text).join(" ") || findings[0]!.text;
  return {
    id: "liquidity",
    title: "Liquidity",
    level: findings.every((f) => f.level === "not_checked") ? "not_checked" : level,
    summary,
    findings,
    numbers: {
      pools: live.length,
      depth_usd: knownDepth.length ? total : null,
      thin_below_usd: LIQUIDITY_THIN_USD,
      top_pools: depths.slice(0, 5),
      ...lp.numbers,
    },
    sources,
  };
}

/** Whether the dev, or anyone with a key, can withdraw the liquidity. */
async function lpControl(info: TokenInfo, pools: Pool[]) {
  const findings: Check["findings"] = [];
  const sources: SourceRef[] = [];
  const numbers: Record<string, unknown> = {};
  const dev = info.dev?.account ?? null;

  const lpt = info.launchpad?.lpt_id;
  if (lpt) {
    const owner = await positionOwner(lpt);
    numbers.launch_position_owner = owner;
    if (owner) sources.push(ref("NEAR RPC", `${EXPLORER_ACCOUNT}${owner}`));
    if (!owner) {
      findings.push({ level: "not_checked", text: "Could not read who owns the launch liquidity position." });
    } else if (owner === dev) {
      findings.push({ level: "red", text: `The dev (${dev}) owns the launch liquidity and can withdraw it.` });
    } else {
      const keys = await viewAccessKeys(owner).catch(() => null);
      const full = keys?.filter((k) => k.access_key.permission === "FullAccess").length ?? null;
      numbers.launch_position_owner_keys = full;
      if (full === 0 && isLaunchpadInfra(owner)) {
        findings.push({ level: "green", text: `Launch liquidity is locked in ${owner}, a launchpad locker with no keys.` });
      } else if (full === 0) {
        findings.push({ level: "green", text: `Launch liquidity is held by ${owner}, a contract with no keys.` });
      } else {
        findings.push({ level: "red", text: `Launch liquidity is held by ${owner}, which has ${full ?? "unknown"} full-access key(s) and can withdraw it.` });
      }
    }
  }

  // Classic pools: LP shares are fungible, so the dev's share is readable.
  const classic = pools.filter((p) => p.kind === "classic" && p.shares_total_supply && BigInt(p.shares_total_supply) > 0n).slice(0, 5);
  if (dev && classic.length) {
    const owned = await Promise.all(
      classic.map(async (p) => ({ pool: p, share: pct(BigInt(await poolShares(Number(p.id), dev)), BigInt(p.shares_total_supply!)) })),
    );
    const held = owned.filter((o) => o.share > 0).sort((a, b) => b.share - a.share);
    numbers.dev_lp = held.map((o) => ({ pool: o.pool.id, share_pct: o.share }));
    for (const o of held) {
      findings.push({
        level: o.share >= DEV_LP_RED_PCT ? "red" : "yellow",
        text: `The dev owns ${fmtPct(o.share)} of pool ${o.pool.id}'s liquidity and can withdraw it.`,
      });
      sources.push(ref("Rhea", o.pool.url));
    }
    if (!held.length) findings.push({ level: "green", text: `The dev holds no LP shares in the ${classic.length} largest classic pool(s).` });
  }

  if (!lpt && pools.some((p) => p.kind === "dcl")) {
    findings.push({ level: "not_checked", text: "Owners of concentrated-liquidity positions were not checked." });
  }
  return { findings, sources, numbers };
}

const round = (n: number) => Math.round(n * 100) / 100;
