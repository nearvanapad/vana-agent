"use client";

import { clsx } from "clsx";
import { ArrowUp, Brain, Square } from "lucide-react";
import { STICKER } from "@/components/ui/styles";
import { useEffect, useRef, useState } from "react";

export function Composer(props: {
  busy: boolean;
  disabled?: boolean;
  think: boolean;
  onThink: (v: boolean) => void;
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
