"use client";

import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChatSync } from "@/components/pane/chat-sync";
import { PaneToggles } from "@/components/pane/pane";
import { usePane } from "@/components/pane/pane-context";
import { Composer } from "./composer";
import vana from "./vana.gif";
import { Message } from "./message";

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

/** A deliberately risky testnet token, deployed by `pnpm demo-token`, to show what a red report looks like. */
const DEMO_TOKEN = process.env.NEXT_PUBLIC_DEMO_TOKEN || "rug.vanarug4hgzsi.testnet";

export function ChatView(props: { id: string; initial: UIMessage[]; account: string | null; ready: boolean; onSend?: () => void }) {
  const { id, initial, account, ready } = props;
  const qc = useQueryClient();
  const [think, setThink] = useState(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
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
    void sendMessage({ text }, { body: { think, pane: pane.snapshot() } });
    props.onSend?.();
    // The conversation exists on the server once the request lands.
    setTimeout(() => void qc.invalidateQueries({ queryKey: ["conversations"] }), 800);
  };

  // The pane can write to the chat (a picked candidate, "ask about this"), but not over an answer in progress.
  const sendRef = useRef(send);
  sendRef.current = send;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const { bindAsk } = pane;
  useEffect(() => {
    bindAsk((text) => {
      if (!busyRef.current) sendRef.current(text);
    });
    return () => bindAsk(null);
  }, [bindAsk]);

  // Follow new output while the user is at the bottom.
  const bottom = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      pinned.current = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (pinned.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const last = messages[messages.length - 1];
  const waiting = status === "submitted" || (status === "streaming" && last?.role === "assistant" && last.parts.every((p) => p.type === "step-start"));

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-6 py-6">
        {messages.length === 0 ? (
          <Empty account={account} onPick={send} disabled={!ready} />
        ) : (
          messages.map((m) => <Message key={m.id} message={m} />)
        )}
        {waiting && (
          <div className="flex items-center gap-2 text-sm text-text-2" role="status">
            <Loader2 size={14} className="animate-spin text-accent" /> {think ? "Thinking…" : "Working…"}
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
            <button type="button" onClick={() => void regenerate({ body: { think, pane: pane.snapshot() } })} className="flex shrink-0 items-center gap-1 hover:underline">
              <RotateCcw size={13} /> Retry
            </button>
          </div>
        )}
        <div ref={bottom} />
      </div>
      <div className="sticky bottom-0 bg-bg pb-4 pt-2">
        <PaneToggles />
        <Composer busy={busy} disabled={!ready} think={think} onThink={setThink} onSend={send}
          onStop={() => {
            setStopped(true);
            void stop();
          }}
        />
        <p className="mt-2 text-center text-xs text-text-2/80">
          Read-only checks from public chain data. Not financial advice. Your wallet signs, never the AI.
        </p>
      </div>
    </div>
  );
}

function Empty({ account, onPick, disabled }: { account: string | null; onPick: (t: string) => void; disabled: boolean }) {
  const prompts = [
    "Is SWEAT safe?",
    `Is ${DEMO_TOKEN} safe?`,
    "Find clean new tokens on nearvana",
    account ? "What does my wallet hold?" : "Who is the dev behind xrpx.nearlytrade.near?",
  ];
  return (
    <div className="flex flex-col items-center gap-4 pt-[12vh] text-center">
      <Image src={vana} alt="Vana" width={96} height={96} unoptimized preload className="size-24" />
      <h2 className="font-display text-3xl">Is this NEAR token safe?</h2>
      <p className="max-w-md text-text-2">
        Ask about any NEP-141 token. VANA checks the contract, the holders, who bought first and whether they are the dev in disguise, the
        liquidity, taxes and the creator&apos;s earlier launches, and cites every number.
      </p>
      <div className="mt-2 grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onPick(p)}
            className="rounded-well border border-line bg-surface px-3 py-2 text-left text-sm hover:border-muted hover:bg-surface-2 disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
