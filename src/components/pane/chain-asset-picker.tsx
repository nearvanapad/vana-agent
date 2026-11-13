"use client";

import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { WALLET } from "@/lib/near/network";
import type { CrossAsset, CrossAssets } from "@/lib/swap/cross-assets";

export type Located = CrossAsset & { chain: string; chainName: string };

/** The Cross-chain form's assets, grouped by chain, plus a lookup from asset id to its chain. */
export function useCrossAssets(enabled = true) {
  const q = useQuery({
    enabled,
    queryKey: ["cross-assets", WALLET.id],
    queryFn: async (): Promise<CrossAssets> => {
      const r = await fetch(`/api/swap/assets?network=${WALLET.id}`);
      if (!r.ok) throw new Error(`Asset list failed (${r.status})`);
      return (await r.json()) as CrossAssets;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const byId = useMemo(() => {
    const m = new Map<string, Located>();
    for (const c of q.data?.chains ?? []) for (const a of c.assets) m.set(a.id, { ...a, chain: c.chain, chainName: c.name });
    return m;
  }, [q.data]);
  return { data: q.data, byId, loading: q.isPending, error: q.error };
}

/** An asset on one of `side`'s chains: NEAR only, or every other chain. */
export function ChainAssetPicker({
  value,
  onChange,
  label,
  side,
  typing,
}: {
  value: string;
  onChange: (id: string) => void;
  label: string;
  side: "near" | "other";
  typing?: boolean;
}) {
  const { data, byId, loading, error } = useCrossAssets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chain, setChain] = useState<string | null>(null);

  const chains = useMemo(() => (data?.chains ?? []).filter((c) => (side === "near" ? c.chain === "near" : c.chain !== "near")), [data, side]);
  const picked = byId.get(value.trim());
  const q = query.trim().replace(/^\$/, "").toLowerCase();
  const rows = useMemo(() => {
    const all = chains
      .filter((c) => !chain || c.chain === chain)
      .flatMap((c) => c.assets.map((a) => ({ ...a, chain: c.chain, chainName: c.name })));
    if (!q) return all;
    return all.filter((a) => a.symbol.toLowerCase().includes(q) || a.chainName.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
  }, [chains, chain, q]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex w-full min-w-0 items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-2.5 pl-1.5 text-left hover:border-muted focus:border-muted focus:outline-none"
        >
          {typing || (!picked && value.trim()) ? (
            <span className="min-w-0 flex-1 truncate py-0.5 font-mono text-sm">{value || " "}</span>
          ) : picked ? (
            <>
              <Badge symbol={picked.symbol} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{picked.symbol}</span>
                <span className="block truncate text-[0.65rem] text-text-2">on {picked.chainName}</span>
              </span>
            </>
          ) : (
            <span className="flex-1 py-0.5 text-sm text-text-2/70">{side === "near" ? "Pick a NEAR token" : "Pick a chain and token"}</span>
          )}
          <ChevronDown size={14} className="shrink-0 text-text-2" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={{ top: 8, left: 8, right: 8, bottom: innerWidth < 768 ? 64 : 8 }}
          aria-label={label}
          className="m-pop z-[70] flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-[max(var(--radix-popover-trigger-width),320px)] max-w-[calc(100vw-16px)] flex-col rounded-card border border-line bg-bg shadow-2xl shadow-void/60"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
        >
          <div className="space-y-2 border-b border-line px-3 py-3">
            <label className="flex items-center gap-2 rounded-well border border-line bg-surface px-3 py-2 focus-within:border-muted">
              <Search size={14} className="text-text-2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (rows[0]) choose(rows[0].id);
                }}
                placeholder={side === "near" ? "Symbol" : "Symbol or chain"}
                aria-label="Search assets"
                spellCheck={false}
                autoCapitalize="none"
                className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-text-2/70 focus:outline-none"
              />
            </label>
            {chains.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {[null, ...chains.map((c) => c.chain)].map((c) => (
                  <button
                    key={c ?? "all"}
                    type="button"
                    onClick={() => setChain(c)}
                    aria-pressed={chain === c}
                    className={clsx(
                      "rounded-full border px-2.5 py-0.5 text-xs",
                      chain === c ? "border-accent-deep bg-accent/15 text-accent-deep" : "border-line text-text-2 hover:bg-surface-2",
                    )}
                  >
                    {c === null ? "All" : (chains.find((x) => x.chain === c)?.name ?? c)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-1" aria-label="Assets">
            {rows.slice(0, 150).map((a) => (
              <li key={`${a.chain}:${a.id}`} className="px-2">
                <button
                  type="button"
                  onClick={() => choose(a.id)}
                  className="flex w-full min-w-0 items-center gap-3 rounded-well px-2 py-2 text-left hover:bg-surface-2"
                >
                  <Badge symbol={a.symbol} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.symbol}</span>
                    <span className="block truncate text-xs text-text-2">{a.chainName}</span>
                  </span>
                  {a.price !== null && (
                    <span className="shrink-0 font-mono text-xs text-text-2">
                      ${a.price < 1 ? a.price.toPrecision(3) : a.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {loading && (
              <li className="flex items-center gap-2 px-4 py-3 text-sm text-text-2">
                <Loader2 size={14} className="animate-spin text-accent-deep" /> Loading assets…
              </li>
            )}
            {!loading && (error || data?.available === false) && (
              <li className="px-4 py-3 text-sm text-bad">{data?.reason ?? "The asset list didn't load. Try again in a minute."}</li>
            )}
            {!loading && data?.available && !rows.length && <li className="px-4 py-3 text-sm text-text-2">Nothing matches.</li>}
          </ul>
          <p className="border-t border-line px-3 py-2 text-[0.7rem] text-text-2">Assets {data?.provider ?? "NEAR Intents"} can swap.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Badge({ symbol, size = 22 }: { symbol: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[0.65rem] font-semibold text-text-2"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {(symbol || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}
