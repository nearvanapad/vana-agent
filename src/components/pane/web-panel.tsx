"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { ExternalLink, Globe, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { WebCheck } from "@/lib/risk/web";
import { useModels } from "../chat/use-tier";

const KEY = "vana:web-search";

/** The Check tab's web search switch: off by default, remembered in this browser, only where the server offers it. */
export function useWebSearch() {
  const models = useModels();
  const available = Boolean(models.data?.webSearch);
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(localStorage.getItem(KEY) === "1");
    } catch {
      /* storage blocked: stays off */
    }
  }, []);
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* holds for this visit */
    }
  };
  return { available, on: available && on, set };
}

const TONE = {
  warning: { label: "Warnings found", cls: "border-bad/45 bg-bad/10 text-bad" },
  mixed: { label: "Some concerns", cls: "border-warn/40 bg-warn/10 text-warn" },
  clear: { label: "Nothing alarming", cls: "border-ok/40 bg-ok/10 text-ok" },
  nothing: { label: "Nothing found", cls: "border-line bg-surface-2 text-text-2" },
} as const;

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** "On the web": one search about the token, summarized with its sources. Pages are other people's writing. */
export function WebPanel({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ["web-check", token],
    queryFn: async (): Promise<WebCheck> => {
      const res = await fetch("/api/pane/web", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const j = (await res.json().catch(() => ({}))) as WebCheck & { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Web search failed (${res.status})`);
      return j;
    },
    staleTime: Infinity,
    retry: false,
  });

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface" aria-label="On the web">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Globe size={14} className="text-text-2" /> On the web
        </span>
        {q.data && <span className={clsx("rounded-full border px-2 py-0.5 text-xs", TONE[q.data.tone].cls)}>{TONE[q.data.tone].label}</span>}
      </header>
      <div className="px-4 py-3 text-[13px]">
        {q.isPending ? (
          <p className="flex items-center gap-2 text-text-2" role="status">
            <Loader2 size={13} className="animate-spin text-accent-deep" /> Searching the web…
          </p>
        ) : q.error ? (
          <div className="flex items-center justify-between gap-2 text-bad">
            <span>{q.error.message}</span>
            <button type="button" onClick={() => void q.refetch()} className="flex shrink-0 items-center gap-1 text-xs text-text-2 hover:text-text">
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {q.data.summary && <p className="m-0 text-pretty">{q.data.summary}</p>}
            {q.data.points.length > 0 && (
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-text-2">
                {q.data.points.map((p) => (
                  <li key={p.text} className="text-pretty">
                    {p.text}{" "}
                    {p.sources.map((n) => {
                      const s = q.data.sources.find((x) => x.n === n);
                      return s ? (
                        <a key={n} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-deep hover:underline">
                          [{n}]
                        </a>
                      ) : null;
                    })}
                  </li>
                ))}
              </ul>
            )}
            {q.data.sources.length > 0 && (
              <ol className="m-0 flex list-none flex-col gap-0.5 border-t border-line pt-2 pl-0 text-xs">
                {q.data.sources.map((s) => (
                  <li key={s.n} className="flex min-w-0 gap-1.5">
                    <span className="shrink-0 text-text-2">[{s.n}]</span>
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 truncate text-text-2 hover:text-accent-deep" title={s.url}>
                      {s.title} <span className="text-text-2/70">· {host(s.url)}</span>
                    </a>
                    <ExternalLink size={10} className="mt-1 shrink-0 text-text-2/60" />
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
      {q.data && (
        <footer className="border-t border-line px-4 py-2 text-[11px] text-text-2">
          AI summary of web pages written by others; not part of the report&apos;s level. {q.data.cached ? "Kept from an earlier search" : "Searched"}{" "}
          {new Date(q.data.as_of).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
        </footer>
      )}
    </section>
  );
}
