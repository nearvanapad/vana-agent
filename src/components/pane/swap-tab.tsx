"use client";

import { clsx } from "clsx";
import { AlertTriangle, ArrowDownUp, Loader2, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { networkOf, WALLET } from "@/lib/near/network";
import { addressError, addressHint, chainName } from "@/lib/swap/chains";
import { useSession } from "../session/use-session";
import { EYEBROW, QUIET, STICKER } from "../ui/styles";
import { QuoteCard, SwapCard } from "../chat/swap-card";
import { ChainAssetPicker, useCrossAssets } from "./chain-asset-picker";
import { offNear, usePane, type ProposalItem, type QuoteItem, type SwapForm, type SwapIn, type SwapMode } from "./pane-context";
import { TokenPicker } from "./token-picker";

const SLIPPAGE = [0.5, 1, 2];
/** Cross-chain swaps go through NEAR Intents, which runs on mainnet only. */
const CROSS = WALLET.id === "mainnet";
const USDC_BASE = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
const MODES: { id: SwapMode; label: string }[] = [
  { id: "swap", label: "Swap" },
  { id: "cross", label: "Cross-chain" },
];
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

  const cross = form.mode === "cross";
  const assets = useCrossAssets(CROSS && cross);
  const inward = cross && form.dir === "in";
  // The side on another chain, and that chain: where the user's address belongs.
  const otherId = (inward ? form.from : form.to).trim();
  const otherChain = cross ? (assets.byId.get(otherId)?.chain ?? null) : null;
  const address = form.address.trim();
  const addressErr = otherChain ? addressError(otherChain, address) : null;

  const amountOk = /^\d*\.?\d+$/.test(form.amount) && Number(form.amount) > 0;
  const ready = form.from.trim().length >= 2 && form.to.trim().length >= 2 && amountOk && !addressErr;
  // Swaps run on the wallet's network; a token from the other one can only be checked.
  const off = cross ? undefined : [form.from, form.to].map((t) => t.trim()).find((t) => t.includes(".") && !t.includes(":") && networkOf(t).id !== WALLET.id);
  const input: SwapIn = {
    from: form.from.trim(),
    to: form.to.trim(),
    amount: form.amount.trim(),
    slippage_pct: form.slippage,
    ...(cross && address ? (inward ? { refund_to: address } : { recipient: address }) : {}),
  };
  const signedIn = Boolean(session.account);
  // A cross-chain swap can't be proposed without the user's address on the other chain.
  const canPropose = ready && !off && signedIn && (!cross || Boolean(address));

  const switchMode = (mode: SwapMode) => {
    if (mode === form.mode) return;
    const usdc = assets.data?.chains.find((c) => c.chain === "base")?.assets.find((a) => a.symbol === "USDC")?.id ?? USDC_BASE;
    const back = form.other ?? (mode === "cross" ? { from: usdc, to: "NEAR" } : { from: "NEAR", to: "" });
    set({
      mode,
      from: back.from,
      to: back.to,
      dir: mode === "cross" ? (offNear(back.from) ? "in" : "out") : form.dir,
      other: { from: form.from, to: form.to },
    });
  };
  const flip = () => set({ from: form.to, to: form.from, ...(cross ? { dir: inward ? "out" : "in" } : {}) });

  const picker = (which: "from" | "to", label: string) => {
    const nearSide = which === "from" ? !inward : inward;
    if (!cross) return <TokenPicker label={label} value={v(which)} typing={Boolean(typed)} onChange={(id) => set({ [which]: id })} />;
    return <ChainAssetPicker side={nearSide ? "near" : "other"} label={label} value={v(which)} typing={Boolean(typed)} onChange={(id) => set({ [which]: id })} />;
  };

  const waiting = focused?.kind === "proposal" && focused.status === "done";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-3.5 pb-4">
      {focused && (
        <div className="flex flex-col gap-2">
          <div className={clsx(EYEBROW, waiting ? "text-accent-deep" : "text-text-2")}>
            {focused.kind === "quote" ? "Quote" : waiting ? "Waiting for your approval" : "Swap"}
          </div>
          <Result item={focused} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className={clsx(EYEBROW, "text-text-2")}>{focused ? "Or set up another swap" : "New swap"}</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) pane.quote(input);
          }}
          className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-3"
        >
          <div role="group" aria-label="Swap mode" className="mb-1.5 grid grid-cols-2 gap-1 rounded-full border border-line bg-bg p-0.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => switchMode(m.id)}
                aria-pressed={form.mode === m.id}
                disabled={m.id === "cross" && !CROSS}
                title={m.id === "cross" && !CROSS ? "Cross-chain swaps run on mainnet" : undefined}
                className={clsx(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  form.mode === m.id ? "bg-accent/15 text-accent-deep" : "text-text-2 hover:bg-surface-2 hover:text-text",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Field label="You pay" hint={!cross ? "Pick a token or paste a contract" : inward ? "Sent from any wallet or exchange" : "From your NEAR wallet"}>
            <input
              value={v("amount")}
              onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, "") })}
              inputMode="decimal"
              placeholder="0.0"
              aria-label="Amount"
              className="w-full min-w-0 flex-1 bg-transparent font-mono text-xl font-semibold placeholder:text-text-2/50 focus:outline-none"
            />
            <div className="w-[min(55%,200px)] shrink-0">{picker("from", "Pay with")}</div>
          </Field>
          <div className="relative z-[1] -my-3.5 flex justify-center">
            <button
              type="button"
              onClick={flip}
              aria-label={cross ? (inward ? "Switch to out of NEAR" : "Switch to into NEAR") : "Swap sides"}
              className="grid size-8 place-items-center rounded-full border border-line bg-surface text-text-2 hover:bg-surface-2 hover:text-text"
            >
              <ArrowDownUp size={14} />
            </button>
          </div>
          <Field
            label="You get"
            hint={cross ? (inward ? "In your NEAR wallet" : "At your address below") : WALLET.id === "testnet" ? "Testnet tokens, nearvana ones first" : "Tokens with a Rhea pool"}
          >
            <div className="min-w-0 flex-1">{picker("to", "Receive")}</div>
          </Field>
          {cross && (
            <label className="mt-1 flex flex-col gap-1 rounded-well border border-line bg-bg px-3 py-2.5">
              <span className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-text-2">
                  {inward ? "Refund to" : "Receive at"} your {otherChain ? chainName(otherChain) : "other chain"} address
                </span>
                <span className="truncate text-text-2/75">{inward ? "If the swap can't complete" : "Where the output is sent"}</span>
              </span>
              <input
                value={form.address}
                onChange={(e) => set({ address: e.target.value })}
                placeholder={otherChain ? addressHint(otherChain) : "Pick the asset first"}
                aria-label={inward ? "Refund address" : "Receiving address"}
                aria-invalid={Boolean(addressErr)}
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                className="w-full min-w-0 bg-transparent font-mono text-sm placeholder:text-text-2/50 focus:outline-none"
              />
              {addressErr && <span className="text-xs text-bad">{addressErr}</span>}
            </label>
          )}
          <div className="flex items-center justify-between gap-2 pt-2">
            <span className="text-xs text-text-2">Max slippage</span>
            <div className="flex gap-1">
              {SLIPPAGE.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set({ slippage: p })}
                  aria-pressed={form.slippage === p}
                  className={clsx(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    form.slippage === p ? "border-accent-deep bg-accent/15 text-accent-deep" : "border-line text-text-2 hover:bg-surface-2",
                  )}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
          {off && (
            <p className="flex items-start gap-2 text-xs text-warn">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Swaps run on NEAR {WALLET.id} here. {off} is a {networkOf(off).id} token: it can be checked, not swapped. Switch to {networkOf(off).id} with the badge up top to swap it.
            </p>
          )}
          {cross && inward && (
            <p className="text-xs text-text-2">No wallet signature: after you approve, you get a deposit address and send the exact amount from any wallet or exchange.</p>
          )}
          {!cross && !off && WALLET.id === "testnet" && <p className="text-xs text-text-2">Testnet swap through Rhea&apos;s testnet pools, signed by your testnet wallet.</p>}
          <div className="grid grid-cols-2 gap-2 pt-1.5">
            <button type="submit" disabled={!ready || Boolean(off)} className={clsx(QUIET, "rounded-well px-3 py-[9px] text-sm text-text")}>
              Get quote
            </button>
            <button
              type="button"
              disabled={!canPropose}
              onClick={() => pane.propose(input)}
              title={
                !signedIn
                  ? "Sign in with your wallet to swap"
                  : cross && !address
                    ? `Enter your ${otherChain ? chainName(otherChain) : ""} address first`
                    : "Checks the token bought, then shows the approval card"
              }
              className={clsx(STICKER, "rounded-well px-3 py-[9px] text-sm")}
            >
              <Wallet size={14} /> Review swap
            </button>
          </div>
          {!signedIn && <p className="text-center text-xs text-text-2">Quotes work for anyone. To swap, connect your wallet and sign in under the chat list.</p>}
        </form>
      </div>

      {earlier.length > 0 && (
        <div className="space-y-1">
          <p className={clsx(EYEBROW, "text-text-2")}>Earlier in this chat</p>
          {earlier.map((i) => {
            const q = i.kind === "quote" ? i.quote : i.proposal;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => pane.dispatch({ t: "swapFocus", id: i.id })}
                className="block w-full truncate rounded-well px-2 py-1 text-left text-xs text-text-2 hover:bg-surface-2 hover:text-text"
              >
                {i.kind === "quote" ? "Quote" : "Swap"}: {q ? `${q.from.amount} ${q.from.symbol} → ${q.to.amount} ${q.to.symbol}` : `${i.input.amount} ${i.input.from} → ${i.input.to}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-well border border-line bg-bg px-3 py-2.5">
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-text-2">{label}</span>
        <span className="truncate text-text-2/75">{hint}</span>
      </span>
      <div className="mt-1 flex items-center gap-2">{children}</div>
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
