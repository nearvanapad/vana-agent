"use client";

import { clsx } from "clsx";
import { ArrowUp, Brain, Square } from "lucide-react";
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
        rows={1}
        maxLength={4000}
        placeholder="Ask about a NEAR token, e.g. “is SWEAT safe?”"
        aria-label="Message"
        className="block max-h-[200px] w-full resize-none bg-transparent px-2 py-1.5 text-text placeholder:text-text-2/70 focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-between">
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
        {props.busy ? (
          <button type="button" onClick={props.onStop} aria-label="Stop" className="rounded-full bg-surface-2 p-2 text-text hover:bg-line">
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim() || props.disabled}
            aria-label="Send"
            className="rounded-full bg-accent p-2 text-accent-ink hover:bg-accent-hi disabled:opacity-40 border-2 border-edge shadow-sticker active:translate-x-(--sh) active:translate-y-(--sh) active:shadow-none disabled:shadow-none"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </form>
  );
}
