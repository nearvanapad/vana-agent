"use client";

import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { clsx } from "clsx";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GateCard, useUnlocked } from "@/components/gate/gate-card";
import { useChatSync } from "@/components/pane/chat-sync";
import { usePane } from "@/components/pane/pane-context";
import { EYEBROW } from "@/components/ui/styles";
import { Mascot, type Mood } from "@/components/vana/mascot";
import { Composer } from "./composer";
import { useTier } from "./use-tier";
import { Message } from "./message";
import { WARN_AT, type Budget } from "@/lib/chat/limits";

/** Server errors arrive as the response body: show its `error` text when it is JSON. */
function errorText(e: Error): string {
  try {
    const j = JSON.parse(e.message) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* plain text */
  }
  return e.message || "Something went wrong.";
}

/** What the server's `x-chat-left` header says is left today: "<n> <budget>". */
type Left = { n: number; budget: Budget };
function parseLeft(h: string | null): Left | null {
  const [n, budget] = (h ?? "").split(" ");
  const k = Number(n);
  return Number.isInteger(k) && k >= 0 && budget && budget in WARN_AT ? { n: k, budget: budget as Budget } : null;
}

/** The hint once few messages remain, else null. */
function leftText(l: Left | null, tier: string | undefined): string | null {
  if (!l || l.n > WARN_AT[l.budget]) return null;
  // A Partner count says nothing about the other tiers.
  if (l.budget.startsWith("partner") && tier !== "partner") return null;
  const msgs = `${l.n} ${l.budget.startsWith("partner") ? "Partner " : ""}message${l.n === 1 ? "" : "s"} left today`;
  return l.budget.endsWith("network") ? `${msgs} on this network (shared by everyone on it). Resets at 00:00 UTC.` : `${msgs}. Resets at 00:00 UTC.`;
}

/** A deliberately risky testnet token, deployed by `pnpm demo-token`, to show what a red report looks like. */
const DEMO_TOKEN = process.env.NEXT_PUBLIC_DEMO_TOKEN || "rug.vanarug4hgzsi.testnet";

export function ChatView(props: { id: string; initial: UIMessage[]; account: string | null; ready: boolean; onSend?: () => void }) {
  const { id, initial, account, ready } = props;
  const qc = useQueryClient();
  const [think, setThink] = useState(false);
  const { tiers, tier, setTier } = useTier();
  const [left, setLeft] = useState<Left | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // Reads the "left today" count off the reply; the body is passed on untouched.
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          if (res.ok) setLeft(parseLeft(res.headers.get("x-chat-left")));
          return res;
        },
        // The server keeps the thread: send only the new message.
        prepareSendMessagesRequest: ({ id, messages, body }) => ({ body: { ...body, id, message: messages[messages.length - 1] } }),
      }),
    [],
  );
  const [stopped, setStopped] = useState(false);
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    id,
    messages: initial,
    transport,
    onFinish: () => void qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
  const busy = status === "submitted" || status === "streaming";
  const pane = usePane();
  useChatSync(messages);

  const send = (text: string) => {
    setStopped(false);
    void sendMessage({ text }, { body: { think, tier, pane: pane.snapshot() } });
    props.onSend?.();
    // The conversation exists on the server once the request lands.
    setTimeout(() => void qc.invalidateQueries({ queryKey: ["conversations"] }), 800);
  };

  // The pane can write to the chat (a picked candidate, "ask about this"). Over an answer in
  // progress, the question waits for it to finish.
  const sendRef = useRef(send);
  sendRef.current = send;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const [queued, setQueued] = useState<string | null>(null);
  const { bindAsk } = pane;
  useEffect(() => {
    bindAsk((text) => {
      if (busyRef.current) setQueued(text);
      else sendRef.current(text);
    });
    return () => bindAsk(null);
  }, [bindAsk]);
  useEffect(() => {
    if (busy || !queued) return;
    setQueued(null);
    sendRef.current(queued);
  }, [busy, queued]);

  const last = messages[messages.length - 1];
  const waiting = status === "submitted" || (status === "streaming" && last?.role === "assistant" && last.parts.every((p) => p.type === "step-start"));

  // Follow new output while the user is at the bottom.
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
  };
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, waiting]);
  // Until the wallet holds enough NVANA, the chat shows the way in instead.
  const locked = useUnlocked() === false;

  return (
    <div className="m-rise flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-[clamp(12px,3vw,24px)]">
        <div className="mx-auto flex max-w-[720px] flex-col gap-[clamp(16px,3vw,22px)] pt-[clamp(16px,4vw,28px)] pb-6">
          {locked ? (
            <GateCard />
          ) : messages.length === 0 ? (
            <Empty account={account} onPick={send} disabled={!ready} />
          ) : (
            messages.map((m, i) => <Message key={m.id} message={m} conversationId={id} done={!(busy && i === messages.length - 1)} latest={i === messages.length - 1} />)
          )}
          {waiting && (
            <div className="flex items-center gap-3.5" role="status" aria-live="polite">
              <Mascot mood="thinking" size={56} />
              <span className="text-sm text-text-2">{think ? "Thinking it through…" : "Working…"}</span>
            </div>
          )}
          {stopped && !busy && !error && (
            <p className="text-xs text-text-2" role="status">
              Stopped. What was written so far is kept in this chat.
            </p>
          )}
          {error && (
            <div className="flex items-start justify-between gap-3 rounded-well border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">
              <span className="flex items-start gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {errorText(error)}
              </span>
              <button type="button" onClick={() => void regenerate({ body: { think, tier, pane: pane.snapshot() } })} className="flex shrink-0 items-center gap-1 hover:underline">
                <RotateCcw size={13} /> Retry
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 px-[clamp(10px,3vw,24px)] pt-2 pb-[clamp(10px,2vw,14px)]">
        <div className="mx-auto max-w-[720px]">
          <Composer busy={busy} disabled={!ready || locked} think={think} onThink={setThink} tiers={tiers} tier={tier} onTier={setTier} onSend={send}
            onStop={() => {
              setStopped(true);
              void stop();
            }}
          />
          {!error && leftText(left, tier) && (
            <p className="mt-1.5 text-center text-xs text-text-2" role="status">
              {leftText(left, tier)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ account, onPick, disabled }: { account: string | null; onPick: (t: string) => void; disabled: boolean }) {
  const [mood, setMood] = useState<Mood>("idle");
  const prompts: [kind: string, text: string][] = [
    ["Check", "Is SWEAT safe?"],
    ["Demo · red report", `Is ${DEMO_TOKEN} safe?`],
    ["Screen", "Find clean new tokens on nearvana"],
    account ? ["Wallet", "What does my wallet hold?"] : ["Dev", "Who is the dev behind xrpx.nearlytrade.near?"],
  ];
  return (
    <div className="flex flex-col items-center gap-4 pt-[7vh] text-center">
      <Mascot mood={mood} size={96} track label="Vana" />
      <h2 className="font-display text-[clamp(22px,4.5vw,32px)] leading-tight">Is this NEAR token safe?</h2>
      <p className="max-w-[480px] text-[clamp(13.5px,calc(0.6vw+11.5px),15px)] text-pretty text-text-2">
        Ask me about any NEP-141 token. I check the contract, the holders, who bought first and whether they are the dev in disguise, the liquidity,
        taxes and the creator&apos;s earlier launches, and I cite every number.
      </p>
      <div className="mt-2.5 grid w-full max-w-[560px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
        {prompts.map(([kind, text]) => (
          <button
            key={text}
            type="button"
            disabled={disabled}
            onClick={() => onPick(text)}
            onPointerEnter={() => setMood("happy")}
            onPointerLeave={() => setMood("idle")}
            onFocus={() => setMood("happy")}
            onBlur={() => setMood("idle")}
            className="flex flex-col gap-0.5 rounded-well border border-line bg-surface px-3.5 py-3 text-left hover:border-muted hover:bg-surface-2 disabled:opacity-50"
          >
            <span className={clsx(EYEBROW, "text-accent-deep")}>{kind}</span>
            <span className="text-sm [overflow-wrap:anywhere]">{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
