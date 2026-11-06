"use client";

import { ChevronRight, Columns3, Loader2, Rocket, Search, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import type { PendingReport } from "@/lib/agent/report-stream";
import type { TokenMatch } from "@/lib/agent/search";
import type { ReportView } from "@/lib/agent/tools";
import type { Proposal, SwapQuote } from "@/lib/swap/service";
import { CHECKS } from "../pane/check-tab";
import { usePane, type ScreenResult } from "../pane/pane-context";
import { LevelPill } from "./level";
import { verdict } from "./risk-card";

/**
 * What the chat shows for a tool result: a small card that brings the full result up in the
 * side pane. The pane is where the details, the comparison and the swap approval live.
 */
function Chip({ id, swap, label, children, strong }: { id: string; swap?: boolean; label: string; children: ReactNode; strong?: boolean }) {
  const pane = usePane();
  const open = () => {
    pane.dispatch(swap ? { t: "swapFocus", id } : { t: "focus", id });
    pane.dispatch({ t: "open", tab: swap ? "swap" : "check" });
  };
  return (
    <button
      type="button"
      onClick={open}
      aria-label={label}
      className={`flex w-full items-center gap-3 rounded-card border bg-surface px-3 py-2.5 text-left hover:bg-surface-2/60 ${strong ? "border-accent/60" : "border-line"}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <span className="flex shrink-0 items-center gap-0.5 text-xs text-text-2">
        {strong ? "Approve" : "Open"} <ChevronRight size={14} />
      </span>
    </button>
  );
}

export function ReportChip({ id, out }: { id: string; out: PendingReport | ReportView }) {
  const pane = usePane();
  if ("pending" in out) {
    return (
      <Chip id={id} label={`Checking ${out.token}, open in the side pane`}>
        <span className="flex items-center gap-2 text-sm">
          <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
          <span className="truncate font-mono">{out.token}</span>
        </span>
        <span className="block text-xs text-text-2">
          {out.done.length} of {CHECKS.length} checks in
        </span>
      </Chip>
    );
  }
  // Several reports in a row read best side by side.
  const several = pane.reports.filter((r) => r.status === "done").length >= 2;
  return (
    <div className="space-y-1.5">
      <Chip id={id} label={`Risk report for ${out.token}, open in the side pane`}>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{out.symbol || "?"}</span>
          <LevelPill level={out.level} />
        </span>
        <span className="block truncate font-mono text-xs text-text-2">{out.token}</span>
        <span className="mt-0.5 block text-xs text-text-2">{verdict(out.checks)}</span>
      </Chip>
      {several && (
        <button
          type="button"
          onClick={() => {
            pane.dispatch({ t: "focus", id: "compare", compare: null });
            pane.dispatch({ t: "open", tab: "check" });
          }}
          className="flex items-center gap-1.5 text-xs text-text-2 hover:text-accent"
        >
          <Columns3 size={12} /> Compare side by side
        </button>
      )}
    </div>
  );
}

export function SearchChip({ id, out, query }: { id: string; out: { matches: TokenMatch[] }; query: string }) {
  const n = out.matches.length;
  if (n <= 1) return null;
  return (
    <Chip id={id} label={`${n} tokens match ${query}, open in the side pane`}>
      <span className="flex items-center gap-2 text-sm">
        <Search size={14} className="shrink-0 text-text-2" /> {n} tokens match “{query}”
      </span>
      <span className="block truncate text-xs text-text-2">{out.matches.map((m) => m.symbol || m.token).slice(0, 5).join(", ")}</span>
    </Chip>
  );
}

export function ScreenChip({ id, out }: { id: string; out: ScreenResult }) {
  return (
    <Chip id={id} label="Screen results, open in the side pane">
      <span className="flex items-center gap-2 text-sm">
        <Rocket size={14} className="shrink-0 text-text-2" /> {out.matches.length} of {out.checked} new launches pass
      </span>
      <span className="block truncate text-xs text-text-2">{out.matches.map((m) => m.symbol || m.token).slice(0, 5).join(", ") || "None passed the filters"}</span>
    </Chip>
  );
}

export function QuoteChip({ id, out }: { id: string; out: SwapQuote }) {
  return (
    <Chip id={id} swap label="Swap quote, open in the side pane">
      <span className="block truncate font-mono text-sm">
        {out.from.amount} {out.from.symbol} → {out.to.amount} {out.to.symbol}
      </span>
      <span className="block text-xs text-text-2">Quote only · at least {out.min_out} {out.to.symbol}</span>
    </Chip>
  );
}

export function ProposalChip({ id, out }: { id: string; out: Proposal }) {
  return (
    <Chip id={id} swap strong label="Swap ready to approve in the side pane">
      <span className="flex flex-wrap items-center gap-2">
        <Wallet size={14} className="shrink-0 text-accent" />
        <span className="truncate font-mono text-sm">
          {out.from.amount} {out.from.symbol} → {out.to.amount} {out.to.symbol}
        </span>
        {out.risk && <LevelPill level={out.risk.level} />}
      </span>
      <span className="block text-xs text-text-2">Ready for your approval in the side pane. Your wallet signs, never the AI.</span>
    </Chip>
  );
}
