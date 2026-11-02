import { cached, getDb } from "../db";
import { view } from "../near/rpc";
import * as nearblocks from "../sources/nearblocks";
import { poolsFor, whitelist } from "../sources/rhea";
import { contractCheck, loadContract, type ContractFacts } from "./contract";
import { holdersCheck } from "./holders";
import { detectLaunchpad } from "./launchpad";
import { liquidityCheck } from "./liquidity";
import { byLevel, REPORT_TTL_MS, worst } from "./rules";
import { taxesCheck } from "./taxes";
import type { Check, RiskReport, TokenInfo } from "./types";

/**
 * The risk report: four fixed checks (contract, holders, liquidity, taxes), each green, yellow,
 * red or not_checked, with the numbers and sources behind it. Same input, same rules, every time.
 * Kept in SQLite for `REPORT_TTL_MS`.
 */

const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function normalizeToken(input: string): string {
  const t = input.trim().toLowerCase().replace(/^nep141:/, "");
  if (t.length < 2 || t.length > 64 || !NEAR_ACCOUNT.test(t)) throw new Error(`"${input}" is not a NEAR account id`);
  return t;
}

type FtMetadata = { name: string; symbol: string; decimals: number };

async function tokenInfo(token: string, facts: ContractFacts): Promise<TokenInfo> {
  const [meta, supply, launchpad, verified] = await Promise.all([
    view<FtMetadata>(token, "ft_metadata"),
    view<string>(token, "ft_total_supply"),
    detectLaunchpad(token),
    whitelist().then((w) => w.has(token)),
  ]);

  let dev: TokenInfo["dev"] = null;
  if (launchpad) dev = { account: launchpad.creator, via: "launchpad" };
  else if (facts.owner) dev = { account: facts.owner.account, via: "owner" };
  else {
    // Who created the token account. Never changes, so it is kept for good.
    const origin = await cached(`origin:${token}`, null, () => nearblocks.accountOrigin(token).then((r) => r.data)).catch(() => null);
    if (origin?.creator && origin.creator !== token) dev = { account: origin.creator, via: "creator" };
  }

  return {
    token,
    name: String(meta.name ?? ""),
    symbol: String(meta.symbol ?? ""),
    decimals: Number(meta.decimals ?? 0),
    total_supply: String(supply),
    dev,
    launchpad,
    verified,
  };
}

function failed(id: Check["id"], title: string, e: unknown): Check {
  const why = e instanceof Error ? e.message : String(e);
  return {
    id,
    title,
    level: "not_checked",
    summary: `Not checked: ${why}.`,
    findings: [{ level: "not_checked", text: `The data source failed: ${why}.` }],
    numbers: {},
    sources: [],
  };
}

function overallSummary(r: Pick<RiskReport, "level" | "checks" | "symbol" | "token">): string {
  const name = r.symbol ? `${r.symbol} (${r.token})` : r.token;
  const flagged = r.checks.filter((c) => c.level === "red" || c.level === "yellow");
  const skipped = r.checks.filter((c) => c.level === "not_checked").map((c) => c.title.toLowerCase());
  const head =
    r.level === "red" ? `${name}: red flags.` : r.level === "yellow" ? `${name}: some caution flags.` : `${name}: no red or yellow flags.`;
  const body = flagged
    .sort(byLevel)
    .map((c) => `${c.title} (${c.level}): ${c.summary}`)
    .join(" ");
  const tail = skipped.length ? ` Not checked: ${skipped.join(", ")}.` : "";
  return `${head} ${body}${tail}`.trim();
}

export async function buildReport(token: string): Promise<RiskReport> {
  const started = Date.now();
  const facts = await loadContract(token);
  const info = await tokenInfo(token, facts);
  const pools = poolsFor(token, info.launchpad?.pool_id ? [info.launchpad.pool_id] : []).catch(() => null);

  const [holders, liquidity, taxes] = await Promise.all([
    holdersCheck(info).catch((e) => failed("holders", "Holders", e)),
    pools
      .then((p) => (p ? liquidityCheck(info, p) : failed("liquidity", "Liquidity", "Rhea pools unavailable")))
      .catch((e) => failed("liquidity", "Liquidity", e)),
    pools.then((p) => taxesCheck(info, facts, p?.data ?? [])).catch((e) => failed("taxes", "Taxes", e)),
  ]);
  const checks = [contractCheck(facts, { verified: info.verified, launchpad: info.launchpad }), holders, liquidity, taxes];
  // Verified issuer tokens (stablecoins, project tokens) keep most supply in treasuries by design.
  const holdersCheck0 = checks[1]!;
  if (info.verified && holdersCheck0.level === "red") {
    holdersCheck0.level = "yellow";
    holdersCheck0.findings.push({ level: "green", text: "Rhea lists it as verified: issuer treasuries often hold most of the supply." });
  }
  const level = worst(checks.map((c) => c.level));
  const report: RiskReport = {
    ...info,
    level,
    summary: "",
    checks,
    as_of: new Date().toISOString(),
    took_ms: Date.now() - started,
    cached: false,
  };
  report.summary = overallSummary(report);
  return report;
}

/** The report for `input`, from the cache when fresh. `fresh` forces a new one. */
export async function riskReport(input: string, opts: { fresh?: boolean } = {}): Promise<RiskReport> {
  const token = normalizeToken(input);
  const db = getDb();
  if (!opts.fresh) {
    const row = db.prepare("SELECT json, created_at FROM reports WHERE token = ?").get(token) as
      | { json: string; created_at: number }
      | undefined;
    if (row && Date.now() - row.created_at < REPORT_TTL_MS) return { ...(JSON.parse(row.json) as RiskReport), cached: true };
  }
  const report = await buildReport(token);
  db.prepare("INSERT OR REPLACE INTO reports (token, level, json, created_at) VALUES (?, ?, ?, ?)").run(
    token,
    report.level,
    JSON.stringify(report),
    Date.now(),
  );
  return report;
}
