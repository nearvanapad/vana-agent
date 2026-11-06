import { explorer } from "../near/network";
import { mapLimit, ref, type SourceRef } from "../sources/http";
import { recentRooms } from "./launchpad/justhoot";
import { NEARLY, recentLaunches } from "./launchpad/nearly";
import * as nearvana from "./launchpad/nearvana";
import { TESTNET } from "../near/network";
import { onNetwork } from "../near/network-server";
import { warmIndex } from "./bundle";
import { riskReport } from "./report";
import { rank } from "./rules";
import type { Check, Level } from "./types";

/**
 * Screens the newest nearly and justhoot launches (mainnet), or nearvana launches (testnet), with a quick risk report each (contract,
 * holders, liquidity, taxes, creator history) and keeps those that pass the filters.
 */

export type ScreenInput = {
  /** "any" means the mainnet launchpads; nearvana is testnet and only screened when asked for. */
  platform?: "nearly" | "justhoot" | "nearvana" | "any";
  /** Worst overall level allowed. */
  max_level?: Exclude<Level, "not_checked">;
  /** Checks that must be green. */
  clean_checks?: Check["id"][];
  /** How many recent launches to look at (max 20). */
  scan?: number;
  /** How many matches to return (max 10). */
  limit?: number;
};

type Candidate = { token: string; platform: "nearly" | "justhoot" | "nearvana"; created_at: string };

async function candidates(platform: ScreenInput["platform"], n: number): Promise<{ list: Candidate[]; sources: SourceRef[] }> {
  if (platform === "nearvana") {
    const launches = await onNetwork(TESTNET, () => nearvana.recentLaunches(n * 2)).catch(() => null);
    if (!launches) throw new Error("The nearvana launchpad did not answer. Try again in a minute.");
    return {
      list: launches
        .filter(nearvana.live)
        .slice(0, n)
        .map((l) => ({ token: l.token, platform: "nearvana" as const, created_at: new Date(l.created_at_ms).toISOString() })),
      sources: [ref("NEAR RPC", `${TESTNET.explorer}/address/${nearvana.NEARVANA}`)],
    };
  }
  const [nearly, hoot] = await Promise.all([
    platform === "justhoot" ? null : recentLaunches(n * 2).catch(() => null),
    platform === "nearly" ? null : recentRooms(n).catch(() => null),
  ]);
  const list: Candidate[] = [
    ...(nearly ?? []).filter((l) => l.step === "Done").map((l) => ({ token: l.token, platform: "nearly" as const, created_at: new Date(l.created_at_ms).toISOString() })),
    ...(hoot ?? []).map((r) => ({ token: r.token, platform: "justhoot" as const, created_at: r.created_at })),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const sources: SourceRef[] = [];
  if (nearly) sources.push(ref("NEAR RPC", explorer(`/address/${NEARLY}`)));
  if (hoot) sources.push(ref("justhoot", "https://justhoot.fun"));
  if (!nearly && !hoot) throw new Error("Neither launchpad answered. Try again in a minute.");
  return { list: list.slice(0, n), sources };
}

export async function findTokens(input: ScreenInput) {
  const scan = Math.min(Math.max(input.scan ?? 12, 1), 20);
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const max = input.max_level ?? "yellow";
  const clean = input.clean_checks ?? [];
  const { list, sources } = await candidates(input.platform ?? "any", scan);
  // Fill the sniper index in the background so the next full report can name snipers.
  if (input.platform !== "nearvana") void warmIndex().catch(() => {});

  const reports = await mapLimit(list, 4, (c) => riskReport(c.token, { quick: true }).catch(() => null));
  const checked = reports.filter((r) => r !== null).length;
  const matches = list
    .map((c, i) => ({ c, r: reports[i] }))
    .filter(({ r }) => r && rank(r.level) <= rank(max) && clean.every((id) => r.checks.find((x) => x.id === id)?.level === "green"))
    .slice(0, limit)
    .map(({ c, r }) => ({
      token: c.token,
      symbol: r!.symbol,
      platform: c.platform,
      launched_at: c.created_at,
      level: r!.level,
      checks: Object.fromEntries(r!.checks.map((x) => [x.id, x.level])),
      flags: r!.checks
        .filter((x) => x.level === "red" || x.level === "yellow")
        .map((x) => `${x.title}: ${x.summary}`),
    }));

  return {
    scanned: list.length,
    checked,
    filters: { platform: input.platform ?? "any", max_level: max, clean_checks: clean },
    matches,
    note: "Quick screen: early buyers and fresh wallets are not checked here. Run risk_report on a token for the full check.",
    sources,
    as_of: new Date().toISOString(),
  };
}
