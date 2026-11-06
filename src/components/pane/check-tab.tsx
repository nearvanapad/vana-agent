"use client";

import { clsx } from "clsx";
import { AlertTriangle, ArrowLeftRight, BadgeCheck, Columns3, Loader2, MessageSquare, RefreshCw, Rocket, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { networkOf, WALLET } from "@/lib/near/network";
import { Dot, LevelPill, Mark } from "../chat/level";
import { RiskCard, shortAccount } from "../chat/risk-card";
import { GateCard, useUnlocked } from "../gate/gate-card";
import { Compare } from "./compare";
import { usePane, useWake, type PaneItem, type ReportItem, type ScreenItem, type SearchItem } from "./pane-context";

/** Every check a full report runs, in the order the card lists them. */
export const CHECKS = [
  ["contract", "Contract"],
  ["holders", "Holders"],
  ["early_buyers", "Early buyers"],
  ["fresh_wallets", "Fresh wallets"],
  ["liquidity", "Liquidity"],
  ["taxes", "Taxes"],
  ["creator", "Creator history"],
] as const;

/** Types `target` into a field one character at a time, each time `n` changes. */
export function useTyped(target: string, n: number, set: (v: string) => void) {
  const last = useRef(n);
  useEffect(() => {
    if (n === last.current) return;
    last.current = n;
    let i = 0;
    set("");
    const t = setInterval(() => {
      i += 1;
      set(target.slice(0, i));
      if (i >= target.length) clearInterval(t);
    }, 18);
    return () => clearInterval(t);
  }, [n, target, set]);
}

export function CheckTab() {
  const pane = usePane();
  const [q, setQ] = useState(pane.fill.check);
  useTyped(pane.fill.check, pane.fill.n, setQ);

  const focused = pane.focus === "compare" ? undefined : pane.items.find((i) => i.id === pane.focus);
  useWake(focused);
  const chips = strip(pane.items);
  const doneReports = pane.reports.filter((r) => r.status === "done");
  const unlocked = useUnlocked();

  if (unlocked === false) return <GateCard compact />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pane.lookup(q);
        }}
        className="flex shrink-0 gap-2 px-4 pt-3"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Symbol or contract, e.g. sweat or token.sweat"
          aria-label="Token to check"
          maxLength={80}
          spellCheck={false}
          autoCapitalize="none"
          className="min-w-0 flex-1 rounded-well border border-line bg-surface px-3 py-2 font-mono text-sm placeholder:font-sans placeholder:text-text-2/70 focus:border-muted focus:outline-none"
        />
        <button type="submit" disabled={!q.trim()} className="flex items-center gap-1.5 rounded-well bg-accent px-3 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hi disabled:opacity-40">
          <Search size={14} /> Check
        </button>
      </form>

      {chips.length > 0 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:thin]">
          {doneReports.length >= 2 && (
            <Chip active={pane.focus === "compare"} onClick={() => pane.dispatch({ t: "focus", id: "compare", compare: null })}>
              <Columns3 size={12} /> Compare {doneReports.length}
            </Chip>
          )}
          {chips.map((c) => (
            <Chip key={c.id} active={pane.focus === c.id} onClick={() => pane.dispatch({ t: "focus", id: c.id })}>
              {c.kind === "report" ? (
                c.status === "running" ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : c.report ? (
                  <Dot level={c.report.level} />
                ) : (
                  <Dot level="not_checked" />
                )
              ) : c.kind === "search" ? (
                <Search size={11} />
              ) : (
                <Sparkles size={11} />
              )}
              <span className="max-w-[9rem] truncate">{label(c)}</span>
            </Chip>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-3 px-4 py-3">
        {pane.focus === "compare" ? (
          <Compare tokens={pane.compare} />
        ) : !focused ? (
          <Start />
        ) : focused.kind === "report" ? (
          <ReportBody item={focused} />
        ) : focused.kind === "search" ? (
          <SearchBody item={focused} />
        ) : focused.kind === "screen" ? (
          <ScreenBody item={focused} />
        ) : null}
      </div>
    </div>
  );
}

type StripItem = ReportItem | SearchItem | ScreenItem;

/** One chip per token (its latest report), plus searches and screens, newest last. */
function strip(items: PaneItem[]): StripItem[] {
  const out = new Map<string, StripItem>();
  for (const i of items) {
    if (i.kind === "report") out.set(`r:${i.token}`, i);
    else if (i.kind === "search") out.set(`s:${i.query.toLowerCase()}`, i);
    else if (i.kind === "screen") out.set(`x:${i.id}`, i);
  }
  return [...out.values()].sort((a, b) => a.at - b.at);
}

function label(i: StripItem): string {
  if (i.kind === "report") return i.report?.symbol || i.token.split(".")[0] || i.token;
  if (i.kind === "search") return `“${i.query}”`;
  return i.platform === "nearvana" ? "New on nearvana" : "New launches";
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        active ? "border-accent bg-accent/15 text-accent" : "border-line text-text-2 hover:bg-surface-2 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function Start() {
  const pane = usePane();
  return (
    <div className="space-y-4 pt-4 text-sm text-text-2">
      <p>
        Type a symbol or a contract id to run the full check here. Ask in the chat and VANA fills this pane for you, then explains what it found.
      </p>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider">Screen the newest launches</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => pane.screen("nearvana")} className="flex items-center gap-1.5 rounded-well border border-line px-3 py-1.5 hover:bg-surface-2 hover:text-text">
            <Rocket size={13} /> nearvana (testnet)
          </button>
          <button type="button" onClick={() => pane.screen("any")} className="flex items-center gap-1.5 rounded-well border border-line px-3 py-1.5 hover:bg-surface-2 hover:text-text">
            <Rocket size={13} /> nearly and justhoot
          </button>
        </div>
      </div>
    </div>
  );
}

function Failed({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-well border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">
      <span className="flex items-start gap-2">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {text}
      </span>
      {retry && (
        <button type="button" onClick={retry} className="shrink-0 hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}

function ReportBody({ item }: { item: ReportItem }) {
  const pane = usePane();
  if (item.status === "error") return <Failed text={item.error ?? "The check failed."} retry={() => pane.check(item.token, { id: item.id })} />;
  if (!item.report) return <Progress item={item} />;
  const r = item.report;
  return (
    <>
      <RiskCard report={r} />
      <div className="flex flex-wrap gap-2">
        <Action onClick={() => pane.ask(`Explain the report for \`${r.token}\``)}>
          <MessageSquare size={13} /> Ask VANA about it
        </Action>
        {networkOf(r.token).id === WALLET.id && (
          <Action
            onClick={() => {
              pane.dispatch({ t: "form", form: { to: r.token } });
              pane.dispatch({ t: "open", tab: "swap" });
            }}
          >
            <ArrowLeftRight size={13} /> Swap to {r.symbol || "it"}
          </Action>
        )}
        <Action onClick={() => pane.check(r.token, { fresh: true })}>
          <RefreshCw size={13} /> Check again
        </Action>
      </div>
    </>
  );
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1.5 rounded-well border border-line px-3 py-1.5 text-xs text-text-2 hover:bg-surface-2 hover:text-text">
      {children}
    </button>
  );
}

/** The checks as they land: each row waits with a spinner until its result is in. */
function Progress({ item }: { item: ReportItem }) {
  const got = new Map(item.done.map((d) => [d.id, d]));
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface" aria-label={`Checking ${item.token}`} aria-busy>
      <header className="border-b border-line px-4 py-3">
        <div className="truncate font-mono text-sm font-semibold">{item.token}</div>
        <p className="mt-1 flex items-center gap-2 text-xs text-text-2" role="status">
          <Loader2 size={12} className="animate-spin text-accent" />
          {item.done.length ? `${item.done.length} of ${CHECKS.length} checks in` : "Reading the contract…"}
        </p>
      </header>
      <ul className="divide-y divide-line">
        {CHECKS.map(([id, title]) => {
          const d = got.get(id);
          return (
            <li key={id} className="flex items-start gap-3 px-4 py-2.5">
              {d ? <Mark level={d.level} className="mt-0.5" /> : <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-text-2/60" />}
              <span className="min-w-0 flex-1">
                <span className={clsx("block text-sm font-semibold", !d && "text-text-2")}>{title}</span>
                {d ? <span className="block text-sm text-text-2">{d.summary}</span> : <span className="mt-1.5 block h-2.5 w-2/3 animate-pulse rounded bg-surface-2" />}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SearchBody({ item }: { item: SearchItem }) {
  const pane = usePane();
  if (item.status === "error") return <Failed text={item.error ?? "The search failed."} retry={() => pane.search(item.query, item.id)} />;
  if (!item.matches)
    return (
      <p className="flex items-center gap-2 text-sm text-text-2" role="status">
        <Loader2 size={14} className="animate-spin text-accent" /> Searching tokens for “{item.query}”…
      </p>
    );
  if (!item.matches.length) return <p className="text-sm text-text-2">No token matches “{item.query}”. Try its contract id.</p>;
  const fromChat = item.origin === "chat";
  return (
    <section className="space-y-2">
      <p className="text-xs text-text-2">
        {item.matches.length} token{item.matches.length > 1 ? "s" : ""} match “{item.query}”. Symbols are not unique on NEAR: pick by contract.
        {fromChat && " Picking one tells VANA in the chat."}
      </p>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {item.matches.map((m) => (
          <li key={m.token} className="border-t border-line first:border-t-0">
            <button
              type="button"
              onClick={() => (fromChat ? pane.ask(`I mean \`${m.token}\``) : pane.check(m.token))}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2/60"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="font-mono">{m.symbol || "?"}</span>
                  {m.verified && <BadgeCheck size={13} className="text-accent" aria-label="verified" />}
                  {m.launchpad && <span className="rounded-full border border-line px-1.5 text-[0.65rem] font-normal text-text-2">{m.launchpad}</span>}
                  {m.network === "testnet" && <span className="rounded-full border border-line px-1.5 text-[0.65rem] font-normal text-text-2">testnet</span>}
                </span>
                <span className="block truncate font-mono text-xs text-text-2" title={m.token}>
                  {m.token}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs text-text-2">
                {m.price_usd !== null && <span className="block font-mono text-text">${m.price_usd < 0.01 ? m.price_usd.toPrecision(2) : m.price_usd.toFixed(2)}</span>}
                {m.pools !== null && `${m.pools} pool${m.pools === 1 ? "" : "s"}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScreenBody({ item }: { item: ScreenItem }) {
  const pane = usePane();
  const where = item.platform === "nearvana" ? "nearvana" : item.platform === "any" ? "nearly and justhoot" : item.platform;
  if (item.status === "error") return <Failed text={item.error ?? "The screen failed."} retry={() => pane.screen(item.platform === "nearvana" ? "nearvana" : "any")} />;
  if (!item.result)
    return (
      <p className="flex items-center gap-2 text-sm text-text-2" role="status">
        <Loader2 size={14} className="animate-spin text-accent" /> Screening the newest {where} launches… (up to 40 s)
      </p>
    );
  const r = item.result;
  return (
    <section className="space-y-2">
      <p className="text-xs text-text-2">
        {r.matches.length} of {r.checked} new {where} launches pass (worst level {r.filters.max_level}). Quick screen: open one for the full check.
      </p>
      {r.matches.length > 0 && (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {r.matches.map((m) => (
            <li key={m.token} className="border-t border-line first:border-t-0">
              <button type="button" onClick={() => pane.check(m.token)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-2/60">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-semibold">{m.symbol || "?"}</span>
                  <span className="block truncate font-mono text-xs text-text-2" title={m.token}>
                    {shortAccount(m.token)}
                  </span>
                  {m.flags[0] && <span className="mt-0.5 block text-xs text-text-2">{m.flags[0]}</span>}
                </span>
                <LevelPill level={m.level} text={m.level === "green" ? "No flags" : m.level === "yellow" ? "Watch" : "Red"} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
