"use client";

import { clsx } from "clsx";
import { AlertTriangle, ArrowDownUp, Loader2, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { networkOf, WALLET } from "@/lib/near/network";
import { useSession } from "../session/use-session";
import { QuoteCard, SwapCard } from "../chat/swap-card";
import { usePane, type ProposalItem, type QuoteItem, type SwapForm } from "./pane-context";
import { TokenPicker } from "./token-picker";

const SLIPPAGE = [0.5, 1, 2];
const FIELDS = ["from", "to", "amount"] as const;

/** Types the chat's swap into the form, field by field, each time it fills it. */
function useTypedForm(n: number, target: SwapForm): Partial<SwapForm> | null {
  const [shown, setShown] = useState<Partial<SwapForm> | null>(null);
  const last = useRef(n);
  const want = useRef(target);
  want.current = target;
  useEffect(() => {
    if (n === last.current) return;
    last.current = n;
    const t = want.current;
    let f = 0;
    let i = 0;
    const out: Partial<SwapForm> = {};
    const tick = setInterval(() => {
      const key = FIELDS[f];
      if (!key) {
        clearInterval(tick);
        setShown(null);
        return;
      }
      const full = String(t[key]);
      i += 1;
      out[key] = full.slice(0, i) as never;
      setShown({ ...out });
      if (i >= full.length) {
        f += 1;
        i = 0;
      }
    }, 18);
    return () => clearInterval(tick);
  }, [n]);
  return shown;
}

export function SwapTab() {
  const pane = usePane();
  const session = useSession();
  const { form } = pane;
  const typed = useTypedForm(pane.fill.sn, form);
  const set = useCallback((f: Partial<SwapForm>) => pane.dispatch({ t: "form", form: f }), [pane]);
  const v = (k: (typeof FIELDS)[number]) => (typed ? (typed[k] ?? "") : form[k]);

  const swaps = pane.items.filter((i): i is QuoteItem | ProposalItem => i.kind === "quote" || i.kind === "proposal");
  const focused = swaps.find((i) => i.id === pane.swapFocus) ?? swaps.at(-1);
  const earlier = swaps.filter((i) => i !== focused && i.status === "done").reverse();

  const amountOk = /^\d*\.?\d+$/.test(form.amount) && Number(form.amount) > 0;
  const ready = form.from.trim().length >= 2 && form.to.trim().length >= 2 && amountOk;
  // Swaps run on the wallet's network; a token from the other one can only be checked.
  const off = [form.from, form.to].map((t) => t.trim()).find((t) => t.includes(".") && networkOf(t).id !== WALLET.id);
  const input = { from: form.from.trim(), to: form.to.trim(), amount: form.amount.trim(), slippage_pct: form.slippage };
  const signedIn = Boolean(session.account);

  return (
    <div className="space-y-3 px-4 py-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) pane.quote(input);
        }}
        className="space-y-2 rounded-card border border-line bg-surface p-3"
      >
        <Field label="You pay" hint="Pick a token or paste a contract">
          <div className="flex gap-2">
            <input value={v("amount")} onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="0.0" aria-label="Amount" className={clsx(INPUT, "w-28 shrink-0")} />
            <div className="min-w-0 flex-1">
              <TokenPicker label="Pay with" value={v("from")} typing={Boolean(typed)} onChange={(from) => set({ from })} />
            </div>
          </div>
        </Field>
        <div className="flex justify-center">
          <button type="button" onClick={() => set({ from: form.to, to: form.from })} aria-label="Swap sides" className="rounded-full border border-line p-1.5 text-text-2 hover:bg-surface-2 hover:text-text">
            <ArrowDownUp size={14} />
          </button>
        </div>
        <Field label="You get" hint={WALLET.id === "testnet" ? "Testnet tokens, nearvana ones first" : "Tokens with a Rhea pool"}>
          <TokenPicker label="Receive" value={v("to")} typing={Boolean(typed)} onChange={(to) => set({ to })} />
        </Field>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-text-2">Max slippage</span>
          <div className="flex gap-1">
            {SLIPPAGE.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set({ slippage: p })}
                aria-pressed={form.slippage === p}
                className={clsx("rounded-full border px-2.5 py-0.5 text-xs", form.slippage === p ? "border-accent-deep bg-accent/15 text-accent-deep" : "border-line text-text-2 hover:bg-surface-2")}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
        {off && (
          <p className="flex items-start gap-2 text-xs text-warn">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Swaps run on NEAR {WALLET.id} here. {off} is a {networkOf(off).id} token: it can be checked, not swapped.
          </p>
        )}
        {!off && WALLET.id === "testnet" && <p className="text-xs text-text-2">Testnet swap through Rhea&apos;s testnet pools, signed by your testnet wallet.</p>}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="submit" disabled={!ready || Boolean(off)} className="rounded-well border border-line px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-40">
            Get quote
          </button>
          <button
            type="button"
            disabled={!ready || Boolean(off) || !signedIn}
            onClick={() => pane.propose(input)}
            title={signedIn ? "Checks the token bought, then shows the approval card" : "Sign in with your wallet to swap"}
            className="flex items-center justify-center gap-1.5 rounded-well bg-accent px-3 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hi disabled:opacity-40 border-2 border-edge shadow-sticker active:translate-x-(--sh) active:translate-y-(--sh) active:shadow-none disabled:shadow-none"
          >
            <Wallet size={14} /> Review swap
          </button>
        </div>
        {!signedIn && <p className="text-center text-xs text-text-2">Quotes work for anyone. To swap, connect your wallet and sign in at the top.</p>}
      </form>

      {focused && <Result item={focused} />}

      {earlier.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-text-2">Earlier in this chat</p>
          {earlier.map((i) => {
            const q = i.kind === "quote" ? i.quote : i.proposal;
            return (
              <button key={i.id} type="button" onClick={() => pane.dispatch({ t: "swapFocus", id: i.id })} className="block w-full truncate rounded-well px-2 py-1 text-left text-xs text-text-2 hover:bg-surface-2 hover:text-text">
                {i.kind === "quote" ? "Quote" : "Swap"}: {q ? `${q.from.amount} ${q.from.symbol} → ${q.to.amount} ${q.to.symbol}` : `${i.input.amount} ${i.input.from} → ${i.input.to}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const INPUT = "rounded-well border border-line bg-bg px-3 py-2 font-mono text-sm placeholder:font-sans placeholder:text-text-2/70 focus:border-muted focus:outline-none";

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="block space-y-1">
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-text-2">{label}</span>
        <span className="truncate text-text-2/70">{hint}</span>
      </span>
      {children}
    </div>
  );
}

function Result({ item }: { item: QuoteItem | ProposalItem }) {
  if (item.status === "error")
    return (
      <p className="flex items-start gap-2 rounded-well border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {item.error}
      </p>
    );
  if (item.kind === "quote" && item.quote) return <QuoteCard quote={item.quote} />;
  if (item.kind === "proposal" && item.proposal) return <SwapCard proposal={item.proposal} />;
  return (
    <p className="flex items-center gap-2 text-sm text-text-2" role="status">
      <Loader2 size={14} className="animate-spin text-accent-deep" />
      {item.kind === "quote" ? "Pricing the swap…" : "Checking the token and preparing the approval card…"}
    </p>
  );
}
