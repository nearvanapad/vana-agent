"use client";

import { BadgeCheck, ChevronDown, Rocket } from "lucide-react";
import { useState } from "react";
import type { ReportView } from "@/lib/agent/tools";
import { Dot, LevelPill } from "./level";
import { Sources, time } from "./sources";

/** Implicit (64-hex) accounts are unreadable in full: keep both ends. */
export const shortAccount = (a: string) => (a.length > 24 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

/** The risk report: overall level, then each check with its findings and sources. */
export function RiskCard({ report }: { report: ReportView }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface" aria-label={`Risk report for ${report.token}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold">{report.symbol || "?"}</span>
            {report.verified && (
              <span className="inline-flex items-center gap-1 text-xs text-accent" title="Rhea lists this token as verified">
                <BadgeCheck size={13} /> verified
              </span>
            )}
          </div>
          <a
            href={`https://nearblocks.io/token/${report.token}`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="block truncate font-mono text-xs text-text-2 hover:text-accent"
          >
            {report.token}
          </a>
        </div>
        <LevelPill level={report.level} />
      </header>

      <ul className="divide-y divide-line">
        {report.checks.map((c) => {
          const isOpen = open === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : c.id)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
              >
                <Dot level={c.level} className="mt-1.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{c.title}</span>
                  <span className="block text-sm text-text-2">{c.summary}</span>
                </span>
                <ChevronDown size={16} className={`mt-1 shrink-0 text-text-2 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="space-y-3 px-4 pb-4 pl-9">
                  <ul className="space-y-1.5">
                    {c.findings.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <Dot level={f.level} className="mt-1.5 size-2" />
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                  {c.wallets && c.wallets.length > 0 && (
                    <ul className="text-xs">
                      {c.wallets.map((w) => (
                        <li key={w.account} className="border-t border-line/60 py-1">
                          <div className="flex items-baseline gap-2">
                            <a
                              href={`https://nearblocks.io/address/${w.account}`}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="min-w-0 flex-1 truncate font-mono hover:text-accent"
                              title={w.account}
                            >
                              {w.account}
                            </a>
                            {w.share_pct !== undefined && <span className="shrink-0 font-mono">{w.share_pct.toFixed(2)}%</span>}
                          </div>
                          {w.label && <div className="text-text-2">{w.label}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
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
          <a href={report.launchpad.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-accent">
            <Rocket size={12} /> {report.launchpad.platform}
          </a>
        )}
      </footer>
    </section>
  );
}
