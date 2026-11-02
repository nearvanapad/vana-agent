import { EXPLORER_ACCOUNT } from "../near/config";
import { tryView } from "../near/rpc";
import { ref, refOf, type SourceRef } from "../sources/http";
import type { Pool } from "../sources/rhea";
import { powers, type ContractFacts } from "./contract";
import { byLevel, fmtPct, tax, TAX_RED_PCT, TAX_YELLOW_PCT, worst } from "./rules";
import type { Check, Level, TokenInfo } from "./types";

type TaxView = { buy_bps?: number; sell_bps?: number; tax?: { buy_bps?: number; sell_bps?: number } };

/** Buy and sell tax in percent, read from the token itself when it exposes `get_tax`. */
async function tokenTax(f: ContractFacts): Promise<{ buy: number; sell: number } | null> {
  if (!f.methods.includes("get_tax")) return null;
  const v = await tryView<TaxView>(f.token, "get_tax");
  const t = v?.tax ?? v;
  if (!t || (t.buy_bps === undefined && t.sell_bps === undefined)) return null;
  return { buy: (t.buy_bps ?? 0) / 100, sell: (t.sell_bps ?? 0) / 100 };
}

export async function taxesCheck(info: TokenInfo, f: ContractFacts, pools: Pool[]): Promise<Check> {
  const findings: Check["findings"] = [];
  const add = (level: Level, text: string) => findings.push({ level, text });
  const sources: SourceRef[] = [];

  let rate: { buy: number; sell: number; from: string } | null = null;
  const lp = info.launchpad;
  if (lp && lp.buy_tax_pct !== null && lp.sell_tax_pct !== null) {
    rate = { buy: lp.buy_tax_pct, sell: lp.sell_tax_pct, from: `${lp.platform} launchpad` };
    sources.push(refOf(lp.source));
  } else {
    const t = await tokenTax(f);
    if (t) {
      rate = { ...t, from: "token contract" };
      sources.push(ref("NEAR RPC", `${EXPLORER_ACCOUNT}${f.token}`));
    }
  }

  if (rate) {
    const high = Math.max(rate.buy, rate.sell);
    const level = tax(high);
    const same = rate.buy === rate.sell;
    add(
      level,
      (same ? `${fmtPct(rate.buy)} tax on every buy and sell` : `Buy tax ${fmtPct(rate.buy)}, sell tax ${fmtPct(rate.sell)}`) +
        ` (set by the ${rate.from})` +
        (level === "green" ? "." : `; yellow at ${TAX_YELLOW_PCT}%, red at ${TAX_RED_PCT}%.`),
    );
  }

  const taxedPools = pools.filter((p) => p.tax !== null && p.tax !== undefined);
  for (const p of taxedPools) {
    add("yellow", `Pool ${p.id} charges its own tax: ${JSON.stringify(p.tax)}.`);
    sources.push(ref("Rhea", p.url));
  }

  const fee = powers(f.methods).fee;
  if (fee && !lp) add("yellow", `The contract can change its fee later (${fee.join(", ")}).`);

  const taxLike = f.methods.filter((m) => /tax|transfer_fee/i.test(m));
  if (!rate && !taxedPools.length) {
    if (taxLike.length) add("not_checked", `Has tax methods (${taxLike.slice(0, 3).join(", ")}) but the rate could not be read.`);
    else add("green", "No tax: the contract has no tax or transfer-fee methods.");
  }

  findings.sort(byLevel);
  const checked = findings.filter((x) => x.level !== "not_checked");
  const level = checked.length ? worst(findings.map((x) => x.level)) : "not_checked";
  return {
    id: "taxes",
    title: "Taxes",
    level,
    summary: findings[0]!.text,
    findings,
    numbers: {
      buy_tax_pct: rate?.buy ?? null,
      sell_tax_pct: rate?.sell ?? null,
      set_by: rate?.from ?? null,
      pool_taxes: taxedPools.map((p) => ({ pool: p.id, tax: p.tax })),
    },
    sources: sources.length ? sources : [ref("NEAR RPC", `${EXPLORER_ACCOUNT}${f.token}`)],
  };
}
