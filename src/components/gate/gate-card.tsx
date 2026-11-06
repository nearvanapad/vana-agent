"use client";

import { clsx } from "clsx";
import { ArrowLeftRight, Check, Loader2, Lock, PenLine, RefreshCw, Wallet } from "lucide-react";
import { usePane } from "@/components/pane/pane-context";
import { useSession } from "@/components/session/use-session";
import { useWallet } from "@/components/wallet/wallet-provider";
import { GATE_MIN, GATE_SYMBOL, GATE_TOKEN } from "@/lib/gate/config";
import { networkOf, WALLET } from "@/lib/near/network";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Whether this browser may use the chat and the token checks; null until the session has loaded. */
export function useUnlocked(): boolean | null {
  const session = useSession();
  if (!session.ready || !session.access) return null;
  return session.access.ok;
}

/**
 * Stands in for the chat and the token checks until the wallet is connected, signed in and holds
 * enough NVANA. Walks through the three steps, and offers the swap to get the tokens.
 */
export function GateCard({ compact }: { compact?: boolean }) {
  const wallet = useWallet();
  const session = useSession();
  const pane = usePane();
  const a = session.access;
  const min = a?.min ?? GATE_MIN;
  const symbol = a?.symbol ?? GATE_SYMBOL;
  const token = a?.token ?? GATE_TOKEN;
  const connected = Boolean(wallet.account);
  const signedIn = Boolean(session.account && session.account === wallet.account);
  const swappable = networkOf(token).id === WALLET.id;

  const getTokens = () => {
    pane.dispatch({ t: "form", form: { from: "NEAR", to: token } });
    pane.dispatch({ t: "open", tab: "swap" });
  };

  const steps = [
    { done: connected, label: "Connect your wallet" },
    { done: signedIn, label: "Sign in with it (a signature, no transaction)" },
    {
      done: Boolean(a?.ok),
      label: `Hold ${fmt(min)} ${symbol}${networkOf(token).id === "testnet" ? " (testnet)" : ""}`,
      note: signedIn && a?.balance !== null && a?.balance !== undefined ? `This wallet holds ${fmt(a.balance)}.` : null,
    },
  ];

  let action: React.ReactNode;
  if (!connected)
    action = (
      <button type="button" onClick={() => void wallet.connect()} disabled={!wallet.ready || wallet.connecting} className={PRIMARY}>
        <Wallet size={15} /> {wallet.connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  else if (!signedIn)
    action = (
      <button type="button" onClick={() => session.signIn.mutate()} disabled={session.signIn.isPending} className={PRIMARY}>
        <PenLine size={15} /> {session.signIn.isPending ? "Check your wallet…" : "Sign in"}
      </button>
    );
  else
    action = (
      <div className="flex flex-wrap justify-center gap-2">
        {swappable && (
          <button type="button" onClick={getTokens} className={PRIMARY}>
            <ArrowLeftRight size={15} /> Get {symbol}
          </button>
        )}
        <button type="button" onClick={() => void session.recheck()} disabled={session.rechecking} className={SECONDARY}>
          {session.rechecking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Check my balance again
        </button>
      </div>
    );

  return (
    <div className={clsx("mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center", compact ? "px-4 py-8" : "pt-[10vh]")}>
      <span className="grid size-12 place-items-center rounded-full bg-accent/15 text-accent">
        <Lock size={22} />
      </span>
      <div className="space-y-1.5">
        <h2 className={clsx("font-display", compact ? "text-xl" : "text-3xl")}>VANA is for {symbol} holders</h2>
        <p className="text-sm text-text-2">
          Chatting with VANA and checking tokens need a signed-in wallet holding {fmt(min)} {symbol} or more. Swaps are open to everyone.
        </p>
      </div>
      <ol className="w-full space-y-2 rounded-card border border-line bg-surface p-3 text-left text-sm">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-start gap-2.5">
            <span
              className={clsx(
                "mt-px grid size-5 shrink-0 place-items-center rounded-full text-[0.7rem] font-semibold",
                s.done ? "bg-ok/20 text-ok" : "bg-surface-2 text-text-2",
              )}
            >
              {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span>
              <span className={clsx(s.done && "text-text-2 line-through decoration-text-2/50")}>{s.label}</span>
              {s.note && <span className="block text-xs text-text-2">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
      {a?.reason === "unknown" && signedIn && <p className="text-xs text-warn">Couldn&apos;t read the balance just now. Try again.</p>}
      {action}
      {swappable && signedIn && <p className="break-all font-mono text-[0.7rem] text-text-2/80">{token}</p>}
    </div>
  );
}

const PRIMARY =
  "flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hi disabled:opacity-60";
const SECONDARY = "flex items-center justify-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-60";
