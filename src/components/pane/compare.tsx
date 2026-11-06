"use client";

import type { ReportView } from "@/lib/agent/tools";
import { LEVEL, Mark } from "../chat/level";
import { rows } from "../chat/risk-card";
import { CHECKS } from "./check-tab";
import { usePane } from "./pane-context";

const MAX = 4;

/** The headline number of a check, with what it measures, if it has one. */
function headline(r: ReportView, id: string): [label: string, value: string] | null {
  const c = r.checks.find((x) => x.id === id);
  return c ? (rows(c)[0] ?? null) : null;
}

/** Reports side by side: one column per token, one row per check. */
export function Compare({ tokens }: { tokens: string[] | null }) {
  const pane = usePane();
  const done = pane.reports.filter((r) => r.status === "done" && r.report);
  const picked = tokens ? tokens.map((t) => pane.reports.find((r) => r.token === t)).filter((r) => r !== undefined) : done.slice(-MAX);
  const waiting = picked.some((r) => !r.report);
  const list = picked.filter((r) => r.report).slice(-MAX);

  if (!list.length) return <p className="text-sm text-text-2">Checking the tokens to compare…</p>;
  return (
    <section className="space-y-2" aria-label="Comparison">
      {waiting && <p className="text-xs text-text-2">More reports are still running; they join the table when done.</p>}
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-max border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 bg-surface px-3 py-2 font-normal text-text-2">Check</th>
              {list.map((it) => (
                <th key={it.token} className="px-3 py-2 align-bottom">
                  <button type="button" onClick={() => pane.dispatch({ t: "focus", id: it.id })} className="text-left hover:text-accent" title={it.token}>
                    <span className="block font-mono text-sm font-semibold">{it.report!.symbol || "?"}</span>
                    <span className="block max-w-[7rem] truncate font-mono font-normal text-text-2">{it.token}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <td className="sticky left-0 bg-surface px-3 py-2 font-semibold">Overall</td>
              {list.map((it) => (
                <td key={it.token} className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <Mark level={it.report!.level} /> {LEVEL[it.report!.level].word}
                  </span>
                </td>
              ))}
            </tr>
            {CHECKS.map(([id, title]) => (
              <tr key={id}>
                <td className="sticky left-0 bg-surface px-3 py-2 text-text-2">{title}</td>
                {list.map((it) => {
                  const c = it.report!.checks.find((x) => x.id === id);
                  const h = headline(it.report!, id);
                  return (
                    <td key={it.token} className="px-3 py-2" title={c?.summary}>
                      {c ? (
                        <span className="flex items-center gap-1.5">
                          <Mark level={c.level} />
                          <span>
                            <span className="block font-mono">{h ? h[1] : LEVEL[c.level].word}</span>
                            {h && <span className="block text-[0.65rem] text-text-2">{h[0].toLowerCase()}</span>}
                          </span>
                        </span>
                      ) : (
                        <span className="text-text-2">n/a</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-2">Hover a cell for the finding; open a token for its full report.</p>
    </section>
  );
}
