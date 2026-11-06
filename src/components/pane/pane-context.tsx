"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { CheckDone, PendingReport } from "@/lib/agent/report-stream";
import type { TokenMatch } from "@/lib/agent/search";
import type { ReportView } from "@/lib/agent/tools";
import type { PaneState } from "@/lib/agent/prompt";
import type { findTokens } from "@/lib/risk/screen";
import type { Proposal, SwapQuote } from "@/lib/swap/service";

/**
 * The side pane: a workspace next to the chat that shows what the tools return (risk reports,
 * comparisons, search candidates, launch screens, swap quotes and approvals). The chat fills it as
 * the agent works, and the user can run checks and swaps in it by hand. Both sides see the same items.
 */

export type ScreenResult = Awaited<ReturnType<typeof findTokens>>;
export type Origin = "chat" | "pane";
type Status = "idle" | "running" | "done" | "error";
type Base = { id: string; origin: Origin; status: Status; error?: string; at: number };

export type ReportItem = Base & { kind: "report"; token: string; done: CheckDone[]; report?: ReportView };
export type SearchItem = Base & { kind: "search"; query: string; matches?: TokenMatch[] };
export type ScreenItem = Base & { kind: "screen"; platform: string; result?: ScreenResult };
export type SwapIn = { from: string; to: string; amount: string; slippage_pct?: number };
export type QuoteItem = Base & { kind: "quote"; input: SwapIn; quote?: SwapQuote };
export type ProposalItem = Base & { kind: "proposal"; input: SwapIn; proposal?: Proposal };
export type PaneItem = ReportItem | SearchItem | ScreenItem | QuoteItem | ProposalItem;

export type Tab = "check" | "swap";
export type SwapForm = { from: string; to: string; amount: string; slippage: number };

type State = {
  open: boolean;
  tab: Tab;
  /** The item in front on the Check tab, or "compare". */
  focus: string | null;
  /** The item in front on the Swap tab. */
  swapFocus: string | null;
  /** Tokens in the comparison; null means the latest reports. */
  compare: string[] | null;
  items: PaneItem[];
  form: SwapForm;
  /** Text the chat is typing into the inputs; `n` changes each time. */
  fill: { check: string; n: number; swap: SwapIn | null; sn: number };
};

type Action =
  | { t: "upsert"; items: Partial<PaneItem>[] }
  | { t: "open"; tab?: Tab }
  | { t: "close" }
  | { t: "focus"; id: string | null; compare?: string[] | null }
  | { t: "swapFocus"; id: string | null }
  | { t: "form"; form: Partial<SwapForm> }
  | { t: "fillCheck"; text: string }
  | { t: "fillSwap"; input: SwapIn };

const EMPTY_FORM: SwapForm = { from: "NEAR", to: "", amount: "", slippage: 1 };

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "upsert": {
      const items = [...s.items];
      for (const it of a.items) {
        const i = items.findIndex((x) => x.id === it.id);
        if (i >= 0) items[i] = { ...items[i], ...it } as PaneItem;
        else items.push(it as PaneItem);
      }
      return { ...s, items };
    }
    case "open":
      return { ...s, open: true, tab: a.tab ?? s.tab };
    case "close":
      return { ...s, open: false };
    case "focus":
      return { ...s, focus: a.id, compare: a.compare === undefined ? s.compare : a.compare, tab: "check" };
    case "swapFocus":
      return { ...s, swapFocus: a.id, tab: "swap" };
    case "form":
      return { ...s, form: { ...s.form, ...a.form } };
    case "fillCheck":
      return { ...s, fill: { ...s.fill, check: a.text, n: s.fill.n + 1 } };
    case "fillSwap":
      return {
        ...s,
        form: { from: a.input.from, to: a.input.to, amount: a.input.amount, slippage: a.input.slippage_pct ?? s.form.slippage },
        fill: { ...s.fill, swap: a.input, sn: s.fill.sn + 1 },
      };
  }
}

/** Wide screens dock the pane next to the chat; narrower ones show it as a drawer over the chat. */
export function useDocked(): boolean {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1280px)");
    const on = () => setDocked(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return docked;
}

const OPEN_KEY = "vana:pane-open";
const itemsKey = (c: string) => `vana:pane:${c}`;
const store = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

/** What the user checked by hand in a chat, kept in this browser so a reload brings it back. */
type Saved = { kind: "report"; token: string } | { kind: "search"; query: string };

const looksLikeAccount = (q: string) => /^[a-z0-9_.-]+$/i.test(q) && (q.includes(".") || /^[0-9a-f]{64}$/i.test(q));

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

let seq = 0;
const newId = () => `pane-${Date.now().toString(36)}-${++seq}`;

type Pane = State & {
  docked: boolean;
  dispatch: (a: Action) => void;
  toggle: (tab: Tab) => void;
  /** Checks a token, or searches when the input isn't an account id. */
  lookup: (input: string) => void;
  search: (query: string, reuse?: string) => void;
  check: (token: string, opts?: { fresh?: boolean; id?: string }) => void;
  screen: (platform: "nearvana" | "any") => void;
  quote: (input: SwapIn) => void;
  propose: (input: SwapIn) => void;
  /** Sends a message to the chat, as the user. */
  ask: (text: string) => void;
  bindAsk: (fn: ((text: string) => void) | null) => void;
  /** The latest report item per token, oldest first. */
  reports: ReportItem[];
  /** What the chat should know about the pane. */
  snapshot: () => PaneState;
};

const Ctx = createContext<Pane | null>(null);

export function usePane(): Pane {
  const p = useContext(Ctx);
  if (!p) throw new Error("usePane outside PaneProvider");
  return p;
}

export function PaneProvider({ conversationId, children }: { conversationId: string | null; children: ReactNode }) {
  const docked = useDocked();
  const [s, dispatch] = useReducer(reducer, null, (): State => {
    const saved = conversationId ? (store.get<Saved[]>(itemsKey(conversationId)) ?? []) : [];
    const items: PaneItem[] = saved.map((v, i) =>
      v.kind === "report"
        ? { kind: "report", id: `saved-${i}`, origin: "pane", status: "idle", token: v.token, done: [], at: i }
        : { kind: "search", id: `saved-${i}`, origin: "pane", status: "idle", query: v.query, at: i },
    );
    return { open: false, tab: "check", focus: null, swapFocus: null, compare: null, items, form: EMPTY_FORM, fill: { check: "", n: 0, swap: null, sn: 0 } };
  });

  // Wide screens reopen the pane if it was open last time.
  useEffect(() => {
    if (docked && store.get<boolean>(OPEN_KEY)) dispatch({ t: "open" });
  }, [docked]);
  useEffect(() => {
    if (docked) store.set(OPEN_KEY, s.open);
  }, [docked, s.open]);

  // Keep the hand-made items for this chat.
  const items = s.items;
  useEffect(() => {
    if (!conversationId) return;
    const saved: Saved[] = items
      .filter((i) => i.origin === "pane" && (i.kind === "report" || i.kind === "search"))
      .map((i) => (i.kind === "report" ? { kind: "report" as const, token: i.token } : { kind: "search" as const, query: (i as SearchItem).query }))
      .filter((v, i, all) => all.findIndex((w) => JSON.stringify(w) === JSON.stringify(v)) === i)
      .slice(-10);
    store.set(itemsKey(conversationId), saved);
  }, [conversationId, items]);

  const askRef = useRef<((text: string) => void) | null>(null);
  const stateRef = useRef(s);
  stateRef.current = s;

  const check = useCallback((token: string, opts: { fresh?: boolean; id?: string } = {}) => {
    const id = opts.id ?? newId();
    dispatch({ t: "upsert", items: [{ kind: "report", id, origin: "pane", status: "running", token, done: [], report: undefined, error: undefined, at: Date.now() }] });
    dispatch({ t: "focus", id });
    void (async () => {
      try {
        const res = await fetch("/api/pane/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, fresh: opts.fresh }),
        });
        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Request failed (${res.status})`);
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const v = JSON.parse(line) as PendingReport | ReportView | { error: string };
            if ("error" in v) throw new Error(v.error);
            if ("pending" in v) dispatch({ t: "upsert", items: [{ id, token: v.token, done: v.done }] });
            else dispatch({ t: "upsert", items: [{ id, token: v.token, status: "done", report: v }] });
          }
        }
      } catch (e) {
        dispatch({ t: "upsert", items: [{ id, status: "error", error: e instanceof Error ? e.message : String(e) }] });
      }
    })();
  }, []);

  const search = useCallback((query: string, reuse?: string) => {
    const id = reuse ?? newId();
    dispatch({ t: "upsert", items: [{ kind: "search", id, origin: "pane", status: "running", query, matches: undefined, error: undefined, at: Date.now() }] });
    dispatch({ t: "focus", id });
    postJson<{ matches: TokenMatch[] }>("/api/pane/tool", { name: "search_token", args: { query } })
      .then((r) => dispatch({ t: "upsert", items: [{ id, status: "done", matches: r.matches }] }))
      .catch((e: Error) => dispatch({ t: "upsert", items: [{ id, status: "error", error: e.message }] }));
  }, []);

  const lookup = useCallback(
    (input: string) => {
      const q = input.trim().replace(/^\$/, "");
      if (!q) return;
      if (!looksLikeAccount(q)) return search(q);
      const t = q.toLowerCase();
      // A fresh report on this token is already here: show it instead of running it again.
      const have = stateRef.current.items.findLast((i): i is ReportItem => i.kind === "report" && i.token === t && i.status !== "error" && i.status !== "idle");
      if (have && Date.now() - have.at < 5 * 60_000) dispatch({ t: "focus", id: have.id });
      else check(t);
    },
    [check, search],
  );

  const screen = useCallback((platform: "nearvana" | "any") => {
    const id = newId();
    dispatch({ t: "upsert", items: [{ kind: "screen", id, origin: "pane", status: "running", platform, at: Date.now() }] });
    dispatch({ t: "focus", id });
    postJson<ScreenResult>("/api/pane/tool", { name: "find_tokens", args: { platform } })
      .then((result) => dispatch({ t: "upsert", items: [{ id, status: "done", result }] }))
      .catch((e: Error) => dispatch({ t: "upsert", items: [{ id, status: "error", error: e.message }] }));
  }, []);

  const quote = useCallback((input: SwapIn) => {
    const id = newId();
    dispatch({ t: "upsert", items: [{ kind: "quote", id, origin: "pane", status: "running", input, at: Date.now() }] });
    dispatch({ t: "swapFocus", id });
    postJson<SwapQuote>("/api/pane/tool", { name: "quote_swap", args: input })
      .then((q) => dispatch({ t: "upsert", items: [{ id, status: "done", quote: q }] }))
      .catch((e: Error) => dispatch({ t: "upsert", items: [{ id, status: "error", error: e.message }] }));
  }, []);

  const propose = useCallback(
    (input: SwapIn) => {
      const id = newId();
      dispatch({ t: "upsert", items: [{ kind: "proposal", id, origin: "pane", status: "running", input, at: Date.now() }] });
      dispatch({ t: "swapFocus", id });
      postJson<Proposal>("/api/swap", { ...input, conversationId: conversationId ?? undefined })
        .then((p) => dispatch({ t: "upsert", items: [{ id, status: "done", proposal: p }] }))
        .catch((e: Error) => dispatch({ t: "upsert", items: [{ id, status: "error", error: e.message }] }));
    },
    [conversationId],
  );

  const toggle = useCallback((tab: Tab) => {
    const cur = stateRef.current;
    if (cur.open && cur.tab === tab) dispatch({ t: "close" });
    else dispatch({ t: "open", tab });
  }, []);

  const reports = useMemo(() => {
    const latest = new Map<string, ReportItem>();
    for (const i of s.items) if (i.kind === "report") latest.set(i.token, i);
    return [...latest.values()].sort((a, b) => a.at - b.at);
  }, [s.items]);

  const ask = useCallback((text: string) => askRef.current?.(text), []);
  const bindAsk = useCallback((fn: ((text: string) => void) | null) => {
    askRef.current = fn;
  }, []);

  const snapshot = useCallback((): PaneState => {
    const cur = stateRef.current;
    const latest = new Map<string, ReportItem>();
    for (const i of cur.items) if (i.kind === "report") latest.set(i.token, i);
    const focused = cur.items.find((i) => i.id === cur.focus);
    return {
      open: cur.open,
      tab: cur.tab,
      focus: cur.focus === "compare" ? "compare" : focused?.kind === "report" ? focused.token : null,
      shown: [...latest.keys()].slice(-12),
      checked: [...latest.values()].filter((i) => i.origin === "pane").map((i) => i.token).slice(-10),
      swap: cur.form.to || cur.form.amount ? { from: cur.form.from, to: cur.form.to, amount: cur.form.amount.replace(/[^\d.]/g, "") } : null,
    };
  }, []);

  const value: Pane = {
    ...s,
    docked,
    dispatch,
    toggle,
    lookup,
    search,
    check,
    screen,
    quote,
    propose,
    ask,
    bindAsk,
    reports,
    snapshot,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Reruns a saved item when it comes to the front for the first time after a reload. */
export function useWake(item: PaneItem | undefined) {
  const { check, search } = usePane();
  useEffect(() => {
    if (!item || item.status !== "idle") return;
    if (item.kind === "report") check(item.token, { id: item.id });
    else if (item.kind === "search") search(item.query, item.id);
  }, [item, check, search]);
}
