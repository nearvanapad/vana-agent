"use client";

import { clsx } from "clsx";
import { ChevronRight, Columns3, Rocket, Search, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import type { PendingReport } from "@/lib/agent/report-stream";
import type { TokenMatch } from "@/lib/agent/search";
import type { ReportView } from "@/lib/agent/tools";
import type { Proposal, SwapQuote } from "@/lib/swap/service";
import { CHECKS } from "../pane/check-tab";
import { usePane, type ScreenResult } from "../pane/pane-context";
import { Mascot } from "../vana/mascot";
import { BAR, LevelPill } from "./level";
import { verdict } from "./risk-card";

/**
 * What the chat shows for a tool result: a small card that brings the full result up in the
 * side pane. The pane is where the details, the comparison and the swap approval live.
 */
function Chip({ id, swap, label, children }: { id: string; swap?: boolean; label: string; children: ReactNode }) {
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
      className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left hover:bg-surface-2"
    >
      <span className="min-w-0 flex-1">{children}</span>
      <span className="flex shrink-0 items-center gap-0.5 text-xs text-accent-deep">
        Open <ChevronRight size={14} />
      </span>
    </button>
  );
}

/** What each check is doing while it runs, in the order the report lists them. */
const DOING: Record<(typeof CHECKS)[number][0], string> = {
  contract: "Reading the contract",
  holders: "Counting holders",
  early_buyers: "Tracing early buyers",
  fresh_wallets: "Looking for fresh wallets",
  liquidity: "Measuring liquidity",
  taxes: "Checking taxes",
  creator: "Looking up creator history",
};

/** A report on its way: Vana thinking, one bar per check, and what it is reading now. */
export function ReportProgress({ token, done }: { token: string; done: { id: string }[] }) {
  const got = new Set(done.map((d) => d.id));
  const next = CHECKS.find(([id]) => !got.has(id));
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3.5">
      <Mascot mood="thinking" size={56} />
      <div className="flex min-w-0 max-w-[380px] flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="min-w-0 truncate text-sm font-medium">
            Checking <span className="font-mono text-[13px]">{token}</span>
          </span>
          <span className="font-mono text-xs whitespace-nowrap text-text-2">
            {got.size} of {CHECKS.length}
          </span>
        </div>
        <div className="flex items-center gap-1" aria-hidden>
          {CHECKS.map(([id]) => (
            <span
              key={id}
              className={clsx(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                got.has(id) ? "bg-accent-deep" : id === next?.[0] ? "bg-[color-mix(in_srgb,var(--accent)_40%,var(--line))]" : "bg-line",
              )}
            />
          ))}
        </div>
        <span className="text-[13px] text-text-2">{next ? `${DOING[next[0]]}…` : "Writing the answer…"}</span>
      </div>
    </div>
  );
}

export function ReportChip({ id, out }: { id: string; out: PendingReport | ReportView }) {
  const pane = usePane();
  if ("pending" in out) return <ReportProgress token={out.token} done={out.done} />;
  // Several reports in a row read best side by side.
  const several = pane.reports.filter((r) => r.status === "done").length >= 2;
  const showing = pane.open && pane.tab === "check" && pane.focus === id;
  const level = new Map(out.checks.map((c) => [c.id, c.level]));
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => {
          pane.dispatch({ t: "focus", id });
          pane.dispatch({ t: "open", tab: "check" });
        }}
        aria-label={`Risk report for ${out.token}, open in the side pane`}
        className={clsx("flex w-full flex-col gap-2.5 rounded-card border bg-surface px-4 py-3.5 text-left hover:bg-surface-2", showing ? "border-accent-deep" : "border-line")}
      >
        <span className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="font-mono text-[15px] font-semibold">{out.symbol || "?"}</span>
          <span className="min-w-0 truncate font-mono text-xs text-text-2">{out.token}</span>
          <span className="ml-auto">
            <LevelPill level={out.level} />
          </span>
        </span>
        <span className="flex w-full items-center gap-1" aria-hidden>
          {CHECKS.map(([cid, title]) => {
            const l = level.get(cid) ?? "not_checked";
            return <span key={cid} title={title} className={clsx("h-1.5 flex-1 rounded-full", BAR[l])} />;
          })}
        </span>
        <span className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="text-[13px] text-text-2">{verdict(out.checks)}</span>
          <span className="flex items-center gap-0.5 text-xs whitespace-nowrap text-accent-deep">
            {showing ? "Showing in pane" : "Open report"} <ChevronRight size={14} />
          </span>
        </span>
      </button>
      {several && (
        <button
          type="button"
          onClick={() => {
            pane.dispatch({ t: "focus", id: "compare", compare: null });
            pane.dispatch({ t: "open", tab: "check" });
          }}
          className="flex items-center gap-1.5 self-start text-xs text-text-2 hover:text-accent-deep"
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
  const pane = usePane();
  return (
    <button
      type="button"
      onClick={() => {
        pane.dispatch({ t: "swapFocus", id });
        pane.dispatch({ t: "open", tab: "swap" });
      }}
      aria-label="Swap ready to approve in the side pane"
      className="flex w-full items-center gap-3.5 rounded-card border border-accent-deep/60 bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] px-4 py-3.5 text-left hover:bg-surface-2"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/18 text-accent-deep">
        <Wallet size={17} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm font-semibold">
            {out.from.amount} {out.from.symbol} → {out.to.amount} {out.to.symbol}
          </span>
          {out.risk && out.risk.level !== "green" && <LevelPill level={out.risk.level} />}
        </span>
        <span className="text-[13px] text-text-2">Ready for your approval. Your wallet signs, never the AI.</span>
      </span>
      <span className="shrink-0 rounded-full border-2 border-edge bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-ink shadow-sticker">Review</span>
    </button>
  );
}
