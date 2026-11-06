"use client";

import { BadgeCheck, ChevronDown, FlaskConical, Rocket } from "lucide-react";
import { useState } from "react";
import type { ReportView } from "@/lib/agent/tools";
import type { Check, Level } from "@/lib/risk/types";
import { Dot, LEVEL, LevelPill, Mark } from "./level";
import { Sources, time } from "./sources";

/** Implicit (64-hex) accounts are unreadable in full: keep both ends. */
export const shortAccount = (a: string) => (a.length > 24 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

/** The explorer for the network an account lives on. */
export const explorerFor = (account: string) => (/\.testnet$/.test(account) ? "https://testnet.nearblocks.io" : "https://nearblocks.io");

type CheckId = Check["id"];

/** What each check looks at, in one line. */
const ABOUT: Record<CheckId, string> = {
  contract: "Who can change the token: keys on its account, an owner, and methods that mint, upgrade, pause or set fees.",
  holders: "How much the largest holders have, leaving out pools, lockers and burns, and how much sits with the dev.",
  early_buyers:
    "The first wallets to buy after the pool opened, and whether they are tied to the dev or each other: the same funder, sub-accounts, coins passed between them.",
  fresh_wallets: "Large holders whose wallet was created less than a week ago.",
  liquidity: "How deep the Rhea pools are in dollars, and whether whoever added the liquidity can pull it.",
  taxes: "Buy and sell tax set by the token, its pool or its launchpad.",
  creator: "Other tokens the creator launched on nearly and justhoot (mainnet) or nearvana (testnet), and how each ended.",
};

type Row = [label: string, value: string];
const pctOf = (v: unknown) => (typeof v === "number" ? `${v >= 10 ? v.toFixed(1) : v.toFixed(2)}%` : null);
const numOf = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US") : null);
const usdOf = (v: unknown) =>
  typeof v === "number" ? (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(v < 10 ? 2 : 0)}`) : null;

/** A check's headline numbers. Missing ones are left out, never shown as zero. */
export function rows(c: ReportView["checks"][number]): Row[] {
  const n = c.numbers as Record<string, unknown>;
  const pick = (list: [string, string | null][]) => list.filter((r): r is Row => r[1] !== null);
  switch (c.id) {
    case "contract":
      return pick([
        ["Full-access keys", numOf(n.full_access_keys)],
        ["Owner", typeof n.owner === "string" ? shortAccount(n.owner) : null],
      ]);
    case "holders":
      return pick([
        ["Top 10 hold", pctOf(n.top10_pct)],
        ["Dev holds", pctOf(n.dev_pct)],
        ["Holders", numOf(n.holder_count)],
      ]);
    case "early_buyers":
      return pick([
        ["Early buyers", numOf(n.early_buyers)],
        ["Linked", numOf(n.linked_buyers)],
        ["Linked hold", pctOf(n.linked_hold_pct)],
        ["Snipers", numOf(n.snipers)],
      ]);
    case "fresh_wallets":
      return pick([
        ["Fresh wallets", numOf(n.fresh_wallets)],
        ["They hold", pctOf(n.fresh_pct)],
      ]);
    case "liquidity":
      return pick([
        ["Pools", numOf(n.pools)],
        ["Depth", usdOf(n.depth_usd)],
      ]);
    case "taxes":
      return pick([
        ["Buy tax", pctOf(n.buy_tax_pct)],
        ["Sell tax", pctOf(n.sell_tax_pct)],
      ]);
    case "creator":
      return pick([
        ["Other launches", numOf(n.other_launches)],
        ["Dead", numOf(n.dead)],
        ["Dev sold", numOf(n.dev_sold)],
      ]);
  }
}

const RANK: Record<Level, number> = { not_checked: 0, green: 1, yellow: 2, red: 3 };
const listed = (w: string[]) => (w.length <= 1 ? w.join("") : `${w.slice(0, -1).join(", ")} and ${w.at(-1)}`);

/** "2 red flags: contract and early buyers. 1 to watch: liquidity." Never calls a token safe. */
export function verdict(checks: { level: Level; title: string }[]): string {
  const at = (l: Level) => checks.filter((c) => c.level === l).map((c) => c.title.toLowerCase());
  const red = at("red");
  const watch = at("yellow");
  const parts: string[] = [];
  if (red.length) parts.push(`${red.length === 1 ? "A red flag" : `${red.length} red flags`}: ${listed(red)}.`);
  if (watch.length) parts.push(`${watch.length === 1 ? "One thing" : `${watch.length} things`} to watch: ${listed(watch)}.`);
  if (!parts.length) parts.push(checks.some((c) => RANK[c.level] > 0) ? "No red flags found." : "No check could run.");
  return parts.join(" ");
}

const SHOWN = 6;

function Wallets({ wallets, net }: { wallets: NonNullable<ReportView["checks"][number]["wallets"]>; net: string }) {
  const [all, setAll] = useState(false);
  const list = all ? wallets : wallets.slice(0, SHOWN);
  return (
    <div>
      <ul className="text-xs">
        {list.map((w) => (
          <li key={w.account} className="border-t border-line/60 py-1.5">
            <div className="flex items-baseline gap-2">
              <a
                href={`${net}/address/${w.account}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="min-w-0 flex-1 truncate font-mono hover:text-accent-deep"
                title={w.account}
              >
                {w.account}
              </a>
              {w.share_pct !== undefined && <span className="shrink-0 font-mono font-semibold">{w.share_pct.toFixed(2)}%</span>}
            </div>
            {w.label && <div className="leading-snug text-text-2">{w.label}</div>}
          </li>
        ))}
      </ul>
      {wallets.length > SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 text-xs text-accent-deep hover:underline">
          {all ? "Show fewer" : `Show all ${wallets.length}`}
        </button>
      )}
    </div>
  );
}

/** The risk report: a verdict line, then every check with its level, finding, numbers and the wallets behind it. */
export function RiskCard({ report }: { report: ReportView }) {
  const [open, setOpen] = useState<string | null>(null);
  const net = explorerFor(report.token);
  const testnet = report.token.endsWith(".testnet");
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface" aria-label={`Risk report for ${report.token}`}>
      <header className="space-y-2 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-semibold">{report.symbol || "?"}</span>
              {report.verified && (
                <span className="inline-flex items-center gap-1 text-xs text-accent-deep" title="Rhea lists this token as verified">
                  <BadgeCheck size={13} /> verified
                </span>
              )}
              {testnet && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 text-[0.65rem] text-text-2" title="Read from NEAR testnet">
                  <FlaskConical size={11} /> testnet
                </span>
              )}
            </div>
            <a
              href={`${net}/token/${report.token}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="block truncate font-mono text-xs text-text-2 hover:text-accent-deep"
            >
              {report.token}
            </a>
          </div>
          <LevelPill level={report.level} />
        </div>
        <p className="text-sm font-medium">{verdict(report.checks)}</p>
        <p className="text-xs leading-snug text-text-2">
          {report.checks.length} fixed checks on public chain data, the same for every token, as of {time(report.as_of)}. They show patterns, not intent,
          and promise nothing.
        </p>
      </header>

      <ul className="divide-y divide-line">
        {report.checks.map((c) => {
          const isOpen = open === c.id;
          const nums = rows(c);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : c.id)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
              >
                <Mark level={c.level} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="text-sm font-semibold">{c.title}</span>
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-text-2">{LEVEL[c.level].word}</span>
                  </span>
                  <span className="block text-sm text-text-2">{c.summary}</span>
                </span>
                <ChevronDown size={16} className={`mt-1 shrink-0 text-text-2 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="space-y-3 px-4 pb-4 pl-12">
                  <p className="text-xs leading-snug text-text-2">{ABOUT[c.id]}</p>
                  {nums.length > 0 && (
                    <dl className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-x-4 gap-y-2">
                      {nums.map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-[0.65rem] uppercase tracking-wider text-text-2">{label}</dt>
                          <dd className="truncate font-mono text-sm font-semibold">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <ul className="space-y-1.5">
                    {c.findings.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <Dot level={f.level} className="mt-1.5" />
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                  {c.wallets && c.wallets.length > 0 && <Wallets wallets={c.wallets} net={net} />}
                  <Sources sources={c.sources} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-text-2">
        <span className="min-w-0">
          Checked {time(report.as_of)}
          {report.cached ? " (cached)" : ""}
          {report.dev ? (
            <>
              {" · dev "}
              <span className="font-mono" title={report.dev.account}>
                {shortAccount(report.dev.account)}
              </span>
            </>
          ) : null}
        </span>
        {report.launchpad && (
          <a
            href={report.launchpad.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 hover:text-accent-deep"
            title={report.launchpad.state ?? undefined}
          >
            <Rocket size={12} /> {report.launchpad.platform}
            {report.launchpad.state ? ` · ${report.launchpad.state}` : ""}
          </a>
        )}
      </footer>
    </section>
  );
}
