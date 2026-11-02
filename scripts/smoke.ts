/**
 * Prints the risk report for each token given, or for a default set: a large verified token, a
 * plain token, a nearly launch and a justhoot launch.
 *   pnpm smoke [token...] [--fresh] [--json]
 */
import { riskReport } from "../src/lib/risk/report";
import type { Level, RiskReport } from "../src/lib/risk/types";

const DEFAULTS = ["token.sweat", "usdt.tether-token.near", "xrpx.nearlytrade.near", "mns-11.v2-launchpad.justhoot.near"];

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const json = args.includes("--json");
const tokens = args.filter((a) => !a.startsWith("--"));

const DOT: Record<Level, string> = { green: "\x1b[32m●\x1b[0m", yellow: "\x1b[33m●\x1b[0m", red: "\x1b[31m●\x1b[0m", not_checked: "\x1b[90m○\x1b[0m" };

function print(r: RiskReport) {
  console.log(`\n${DOT[r.level]} ${r.symbol} ${r.token}  [${r.level}]  ${r.took_ms}ms${r.cached ? " (cached)" : ""}`);
  console.log(`  dev: ${r.dev ? `${r.dev.account} (via ${r.dev.via})` : "unknown"}${r.launchpad ? `  launchpad: ${r.launchpad.platform}` : ""}${r.verified ? "  verified" : ""}`);
  console.log(`  ${r.summary}`);
  for (const c of r.checks) {
    console.log(`  ${DOT[c.level]} ${c.title}: ${c.summary}`);
    for (const f of c.findings) console.log(`      ${DOT[f.level]} ${f.text}`);
    console.log(`      sources: ${c.sources.map((s) => `${s.source} ${s.url}`).join(" | ") || "-"}`);
  }
}

let failures = 0;
for (const t of tokens.length ? tokens : DEFAULTS) {
  try {
    const r = await riskReport(t, { fresh });
    if (json) console.log(JSON.stringify(r, null, 2));
    else print(r);
  } catch (e) {
    failures++;
    console.error(`\n✗ ${t}: ${e instanceof Error ? e.stack : e}`);
  }
}
process.exit(failures ? 1 : 0);
