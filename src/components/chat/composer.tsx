"use client";

import { clsx } from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUp, Brain, Check, EyeOff, ShieldCheck, Square, X } from "lucide-react";
import type { Tier, TierInfo } from "@/lib/agent/model";
import { STICKER } from "@/components/ui/styles";
import { useEffect, useRef, useState } from "react";

const short = (id: string) => id.replace(/^[^/]+\//, "");

/**
 * Which NEAR AI model tier answers: a pill showing the current one, opening a small dialog that
 * explains each and lets the user switch.
 */
function TierPicker({ tiers, tier, onTier }: { tiers: TierInfo[]; tier: Tier; onTier: (t: Tier) => void }) {
  const [open, setOpen] = useState(false);
  const cur = tiers.find((t) => t.id === tier) ?? tiers[0]!;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={`NEAR AI: ${cur.label}. ${cur.hint}`}
          className={clsx(
            "flex min-w-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:bg-surface-2",
            tier === "incognito" ? "border-line text-text-2" : "border-ok/40 text-ok",
          )}
        >
          {tier === "incognito" ? <EyeOff size={13} className="shrink-0" /> : <ShieldCheck size={13} className="shrink-0" />}
          <span className="hidden sm:inline">NEAR AI:</span>
          <span className="font-medium">{cur.label}</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="n-fade fixed inset-0 z-[60] grid place-items-center bg-[rgb(10_22_18/0.72)] p-4 backdrop-blur-[4px]">
          <Dialog.Content className="n-pop flex w-full max-w-[360px] flex-col gap-3 rounded-[20px] border border-line bg-surface p-[clamp(16px,4vw,20px)] shadow-[0_30px_60px_rgb(0_0_0/0.45)]">
            <div className="flex items-center justify-between gap-3">
              <Dialog.Title className="text-base font-semibold">Who runs the AI</Dialog.Title>
              <Dialog.Description className="sr-only">Pick how private your chat with VANA is.</Dialog.Description>
              <Dialog.Close aria-label="Close" className="grid size-7 shrink-0 place-items-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text">
                <X size={15} />
              </Dialog.Close>
            </div>
            <div role="radiogroup" aria-label="NEAR AI mode" className="flex flex-col gap-2">
              {tiers.map((t) => {
                const on = t.id === tier;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      onTier(t.id);
                      setOpen(false);
                    }}
                    className={clsx(
                      "flex gap-3 rounded-well border px-3 py-2.5 text-left",
                      on ? "border-accent-deep bg-accent/10" : "border-line hover:bg-surface-2",
                    )}
                  >
                    <span className={clsx("mt-0.5 shrink-0", t.id === "incognito" ? "text-text-2" : "text-ok")}>
                      {t.id === "incognito" ? <EyeOff size={16} /> : <ShieldCheck size={16} />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {t.label}
                        {on && <Check size={14} className="text-accent-deep" />}
                        <span className="ml-auto font-mono text-[11px] font-normal text-text-2/70">{short(t.model)}</span>
                      </span>
                      <span className="text-[13px] leading-snug text-text-2">{t.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Composer(props: {
  busy: boolean;
  disabled?: boolean;
  think: boolean;
  onThink: (v: boolean) => void;
  /** NEAR AI Cloud model tiers, when the server offers them. */
  tiers?: TierInfo[] | null;
  tier?: Tier;
  onTier?: (t: Tier) => void;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const send = () => {
    const t = text.trim();
    if (!t || props.busy || props.disabled) return;
    props.onSend(t);
    setText("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="rounded-card border border-line bg-surface p-2 focus-within:border-muted"
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        rows={2}
        maxLength={4000}
        placeholder="Ask about a NEAR token, e.g. “is SWEAT safe?”"
        aria-label="Message"
        className="block max-h-[200px] w-full resize-none bg-transparent px-2 py-1.5 text-[15px] text-text placeholder:text-text-2/70 focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => props.onThink(!props.think)}
            aria-pressed={props.think}
            title="Think mode: slower, reasons more before answering"
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
              props.think ? "border-accent-deep bg-accent/15 text-accent-deep" : "border-line text-text-2 hover:bg-surface-2",
            )}
          >
            <Brain size={13} /> Think
          </button>
          {props.tiers && props.tier && props.onTier && <TierPicker tiers={props.tiers} tier={props.tier} onTier={props.onTier} />}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="hidden text-xs whitespace-nowrap text-text-2/80 lg:inline">Enter to send · Shift+Enter for a new line</span>
          {props.busy ? (
            <button type="button" onClick={props.onStop} aria-label="Stop" className="grid size-9 place-items-center rounded-full border border-line bg-surface-2 text-text hover:bg-line">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" disabled={!text.trim() || props.disabled} aria-label="Send" className={clsx(STICKER, "size-9 rounded-full")}>
              <ArrowUp size={16} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
