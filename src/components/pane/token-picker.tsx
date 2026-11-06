"use client";

import * as Popover from "@radix-ui/react-popover";
import { clsx } from "clsx";
import { BadgeCheck, ChevronDown, Loader2, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { WALLET } from "@/lib/near/network";
import { useUnlocked } from "../gate/gate-card";
import { usePane } from "./pane-context";
import { useSwapTokens, type SwapToken } from "./use-swap-tokens";

const SHOWN = 100;
const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const looksLikeContract = (q: string) => q.length <= 64 && ACCOUNT.test(q) && (q.includes(".") || /^[0-9a-f]{64}$/.test(q));

type Filter = "all" | "launchpads" | "verified" | SwapToken["launchpad"];
const FILTERS: { id: NonNullable<Filter>; label: string }[] = [
  { id: "all", label: "All" },
  { id: "launchpads", label: "Launchpads" },
  ...(WALLET.id === "testnet"
    ? [{ id: "nearvana" as const, label: "nearvana" }]
    : [
        { id: "nearly" as const, label: "nearly" },
        { id: "justhoot" as const, label: "justhoot" },
      ]),
  { id: "verified", label: "Verified" },
];

const isNear = (v: string) => /^w?near$/i.test(v.trim());
const short = (id: string) => (id.length > 26 ? `${id.slice(0, 12)}…${id.slice(-10)}` : id);
const fmtDepth = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2));

function Avatar({ icon, symbol, size = 28 }: { icon: string | null; symbol: string; size?: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (icon && broken !== icon)
    return <img src={icon} alt="" width={size} height={size} onError={() => setBroken(icon)} className="shrink-0 rounded-full bg-surface-2 object-cover" style={{ width: size, height: size }} />;
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[0.65rem] font-semibold text-text-2" style={{ width: size, height: size }} aria-hidden>
      {(symbol || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * A token field: shows the chosen token, and opens, under the field, a searchable list of every token with a Rhea
 * pool on the swap network, filterable by launchpad. A contract not in the list can be pasted.
 */
export function TokenPicker({ value, onChange, label, typing }: { value: string; onChange: (v: string) => void; label: string; typing?: boolean }) {
  const pane = usePane();
  const unlocked = useUnlocked();
  const { tokens, byId, loading, error } = useSwapTokens();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NonNullable<Filter>>("all");

  const v = value.trim();
  const picked = isNear(v) ? null : byId.get(v.toLowerCase());
  const symbol = isNear(v) ? "NEAR" : (picked?.symbol ?? "");

  const q = query.trim().replace(/^\$/, "").toLowerCase();
  const matches = useMemo(() => {
    const byFilter = tokens.filter((t) =>
      filter === "all" ? true : filter === "launchpads" ? t.launchpad !== null : filter === "verified" ? t.verified : t.launchpad === filter,
    );
    if (!q) return byFilter;
    const rank = (t: SwapToken) => {
      const s = t.symbol.toLowerCase();
      return t.token === q ? 0 : s === q ? 1 : s.startsWith(q) ? 2 : t.token.startsWith(q) ? 3 : s.includes(q) || t.token.includes(q) ? 4 : 9;
    };
    return byFilter
      .map((t) => [t, rank(t)] as const)
      .filter(([, r]) => r < 9)
      .sort((a, b) => a[1] - b[1])
      .map(([t]) => t);
  }, [tokens, filter, q]);
  // Matches the filter hides, to offer when it hides all of them.
  const hidden = q && filter !== "all" && !matches.length ? tokens.filter((t) => t.symbol.toLowerCase().includes(q) || t.token.includes(q)).length : 0;
  const showNear = filter === "all" && (!q || "near".startsWith(q) || "wnear".startsWith(q));
  const pasted = looksLikeContract(q) && !byId.has(q) && !isNear(q) ? q : null;

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
          className="flex w-full min-w-0 items-center gap-2 rounded-well border border-line bg-bg px-2.5 py-1.5 text-left hover:border-muted focus:border-muted focus:outline-none"
        >
          {typing || (!symbol && v) ? (
            <span className="min-w-0 flex-1 truncate py-0.5 font-mono text-sm">{v || " "}</span>
          ) : v ? (
            <>
              <Avatar icon={picked?.icon ?? null} symbol={symbol} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{symbol}</span>
                {!isNear(v) && <span className="block truncate font-mono text-[0.65rem] text-text-2">{short(v)}</span>}
              </span>
            </>
          ) : (
            <span className="flex-1 py-0.5 text-sm text-text-2/70">Pick a token</span>
          )}
          <ChevronDown size={14} className="shrink-0 text-text-2" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        {/* As wide as the field, at least 320px; as tall as the room under (or over) it allows. */}
        <Popover.Content
          align="end"
          sideOffset={6}
          // Phones have a tab bar at the foot of the screen: stay above it.
          collisionPadding={{ top: 8, left: 8, right: 8, bottom: innerWidth < 768 ? 64 : 8 }}
          aria-label={label}
          className="z-[70] flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-[max(var(--radix-popover-trigger-width),320px)] max-w-[calc(100vw-16px)] flex-col rounded-card border border-line bg-bg shadow-2xl shadow-void/60"
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
                  if (pasted) choose(pasted);
                  else if (matches[0]) choose(matches[0].token);
                  else if (showNear) choose("NEAR");
                }}
                placeholder="Symbol or contract id"
                aria-label="Search tokens"
                spellCheck={false}
                autoCapitalize="none"
                className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-text-2/70 focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={clsx(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    filter === f.id ? "border-accent-deep bg-accent/15 text-accent-deep" : "border-line text-text-2 hover:bg-surface-2",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto py-1" aria-label="Tokens">
            {pasted && (
              <Row onPick={() => choose(pasted)}>
                <Avatar icon={null} symbol="?" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">Use this contract</span>
                  <span className="block truncate font-mono text-xs text-text-2">{pasted}</span>
                </span>
              </Row>
            )}
            {showNear && (
              <Row onPick={() => choose("NEAR")}>
                <Avatar icon={null} symbol="N" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">NEAR</span>
                  <span className="block text-xs text-text-2">Native NEAR, wrapped on the way in</span>
                </span>
              </Row>
            )}
            {matches.slice(0, SHOWN).map((t) => (
              <Row
                key={t.token}
                onPick={() => choose(t.token)}
                aside={
                  <button
                    type="button"
                    title={`Check ${t.symbol} before swapping`}
                    onClick={() => {
                      setOpen(false);
                      // Locked, the Check tab shows how to unlock it instead.
                      if (unlocked) pane.lookup(t.token);
                      pane.dispatch({ t: "open", tab: "check" });
                    }}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-text-2 hover:bg-surface-2 hover:text-text"
                  >
                    <ShieldCheck size={12} /> Check
                  </button>
                }
              >
                <Avatar icon={t.icon} symbol={t.symbol} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm">
                    <span className="truncate font-semibold">{t.symbol}</span>
                    {t.verified && <BadgeCheck size={13} className="shrink-0 text-ok" aria-label="Verified on Rhea" />}
                    {t.launchpad && <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[0.65rem] text-accent-deep">{t.launchpad}</span>}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-text-2">
                    <span className="truncate font-mono">{short(t.token)}</span>
                    <span className="shrink-0">· {fmtDepth(t.depth_near)} NEAR pool</span>
                  </span>
                </span>
              </Row>
            ))}
            {loading && (
              <li className="flex items-center gap-2 px-4 py-3 text-sm text-text-2">
                <Loader2 size={14} className="animate-spin text-accent-deep" /> Loading the token list…
              </li>
            )}
            {error && !tokens.length && <li className="px-4 py-3 text-sm text-bad">The token list didn&apos;t load. Paste a contract id instead.</li>}
            {!loading && !matches.length && !pasted && !showNear && (
              <li className="px-4 py-3 text-sm text-text-2">
                {hidden ? (
                  <>
                    No {FILTERS.find((f) => f.id === filter)?.label} token matches.{" "}
                    <button type="button" onClick={() => setFilter("all")} className="text-accent-deep hover:underline">
                      Show all {hidden}
                    </button>
                  </>
                ) : (
                  "No token matches. Paste its contract id to use it anyway."
                )}
              </li>
            )}
            {matches.length > SHOWN && <li className="px-4 py-2 text-center text-xs text-text-2">{matches.length - SHOWN} more: type to narrow</li>}
          </ul>
          <p className="border-t border-line px-3 py-2 text-[0.7rem] text-text-2">
            {tokens.length ? `${tokens.length} tokens` : "Tokens"} with a Rhea pool against NEAR on {WALLET.id}. Anyone can make a token: check it before you buy.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Row({ onPick, aside, children }: { onPick: () => void; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1 px-2">
      <button type="button" onClick={onPick} className="flex min-w-0 flex-1 items-center gap-3 rounded-well px-2 py-2 text-left hover:bg-surface-2">
        {children}
      </button>
      {aside}
    </li>
  );
}
