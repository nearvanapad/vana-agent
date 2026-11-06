"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import type { PendingReport } from "@/lib/agent/report-stream";
import type { TokenMatch } from "@/lib/agent/search";
import type { ReportView } from "@/lib/agent/tools";
import type { Proposal, SwapQuote } from "@/lib/swap/service";
import { usePane, type PaneItem, type ScreenResult, type SwapIn } from "./pane-context";

type Part = { type: string; toolCallId?: string; state?: string; input?: unknown; output?: unknown; errorText?: string };

const PANE_TOOLS = new Set(["risk_report", "search_token", "find_tokens", "quote_swap", "propose_swap"]);

/** The pane item a chat tool call stands for, in its current state. */
export function itemOf(p: Part, at: number): PaneItem | null {
  const name = p.type.replace(/^tool-/, "");
  if (!PANE_TOOLS.has(name) || !p.toolCallId) return null;
  if (p.state !== "input-available" && p.state !== "output-available" && p.state !== "output-error") return null;
  const id = p.toolCallId;
  const input = (p.input ?? {}) as Record<string, unknown>;
  const out = p.output as Record<string, unknown> | undefined;
  const failed = p.state === "output-error";
  const running = p.state === "input-available" || Boolean(out && "pending" in out);
  const status = failed ? "error" : running ? "running" : "done";
  const base = { id, origin: "chat" as const, status, error: failed ? (p.errorText ?? "Failed") : undefined, at } as const;
  switch (name) {
    case "risk_report": {
      const pending = out && "pending" in out ? (out as PendingReport) : null;
      const report = out && !pending ? (out as ReportView) : undefined;
      const token = String(report?.token ?? pending?.token ?? input.token ?? "").toLowerCase();
      return { ...base, kind: "report", token, done: pending?.done ?? [], report };
    }
    case "search_token":
      return { ...base, kind: "search", query: String(input.query ?? ""), matches: (out as { matches?: TokenMatch[] } | undefined)?.matches };
    case "find_tokens":
      return { ...base, kind: "screen", platform: String(input.platform ?? "any"), result: out as ScreenResult | undefined };
    case "quote_swap":
      return { ...base, kind: "quote", input: input as SwapIn, quote: out as SwapQuote | undefined };
    case "propose_swap":
      return { ...base, kind: "proposal", input: input as SwapIn, proposal: out as Proposal | undefined };
  }
  return null;
}

const sig = (i: PaneItem) => `${i.status}:${i.kind === "report" ? i.done.length : ""}`;
const isSwap = (i: PaneItem) => i.kind === "quote" || i.kind === "proposal";

/**
 * Mirrors the chat's tool calls into the pane. Calls already in the thread when it opened are
 * listed quietly; a new call while the agent works brings the pane forward (when it won't cover the chat),
 * types its input in and shows the result as it arrives.
 */
export function useChatSync(messages: UIMessage[]) {
  const pane = usePane();
  const { dispatch, beside } = pane;
  const seen = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const first = seen.current === null;
    const known = (seen.current ??= new Map());
    const changed: PaneItem[] = [];
    const fresh: { item: PaneItem; reportsInMessage: string[] }[] = [];

    messages.forEach((m, mi) => {
      if (m.role !== "assistant") return;
      const tokens: string[] = [];
      m.parts.forEach((p, pi) => {
        const item = itemOf(p as Part, mi * 100 + pi);
        if (!item) return;
        if (item.kind === "report" && item.token && !tokens.includes(item.token)) tokens.push(item.token);
        const s = sig(item);
        const before = known.get(item.id);
        if (before === s) return;
        known.set(item.id, s);
        // Chat items sort by when they appeared; pane items use the clock. Keep the chat's in order with them.
        item.at = Date.now();
        changed.push(item);
        if (!first && before === undefined) fresh.push({ item, reportsInMessage: [...tokens] });
      });
    });
    if (!changed.length) return;
    if (first) {
      // Older items keep their order; the newest of each kind is in front.
      changed.forEach((c, i) => (c.at = i));
    }
    dispatch({ t: "upsert", items: changed });

    if (first) {
      // Both tabs get their newest item; the tab of the newest of all is in front.
      const lastCheck = changed.findLast((i) => !isSwap(i));
      const lastSwap = changed.findLast(isSwap);
      const swapLast = lastSwap && (!lastCheck || changed.indexOf(lastSwap) > changed.indexOf(lastCheck));
      if (lastSwap && !swapLast) dispatch({ t: "swapFocus", id: lastSwap.id });
      if (lastCheck) dispatch({ t: "focus", id: lastCheck.id });
      if (lastSwap && swapLast) dispatch({ t: "swapFocus", id: lastSwap.id });
      return;
    }

    for (const { item, reportsInMessage } of fresh) {
      if (isSwap(item)) {
        dispatch({ t: "fillSwap", input: item.input });
        dispatch({ t: "swapFocus", id: item.id });
        if (beside) dispatch({ t: "open", tab: "swap" });
        continue;
      }
      if (item.kind === "report") {
        dispatch({ t: "fillCheck", text: item.token });
        // Several tokens in one answer: show them side by side.
        if (reportsInMessage.length >= 2) dispatch({ t: "focus", id: "compare", compare: reportsInMessage });
        else dispatch({ t: "focus", id: item.id });
      } else {
        if (item.kind === "search") dispatch({ t: "fillCheck", text: item.query });
        dispatch({ t: "focus", id: item.id });
      }
      if (beside) dispatch({ t: "open", tab: "check" });
    }
  }, [messages, dispatch, beside]);
}
