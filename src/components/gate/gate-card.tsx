"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { ArrowLeftRight, Check, Loader2, Lock, PenLine, RefreshCw, Wallet } from "lucide-react";
import { usePane } from "@/components/pane/pane-context";
import { useSession } from "@/components/session/use-session";
import { QUIET, STICKER } from "@/components/ui/styles";
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

  const get = swappable && (
    <button type="button" onClick={getTokens} className={signedIn ? PRIMARY : SECONDARY}>
      <ArrowLeftRight size={15} /> Get {symbol}
    </button>
  );
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
      <button type="button" onClick={() => void session.recheck()} disabled={session.rechecking} className={SECONDARY}>
        {session.rechecking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Check my balance again
      </button>
    );
  // The first step not done yet is the one to take now.
  const now = steps.findIndex((s) => !s.done);

  return (
    <div className={clsx("mx-auto flex w-full max-w-[440px] flex-col items-center gap-[18px] text-center", compact ? "px-4 py-8" : "mt-[8vh]")}>
      <span className="grid size-[52px] place-items-center rounded-full bg-accent/15 text-accent-deep">
        <Lock size={22} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className={clsx("font-display leading-[1.15]", compact ? "text-xl" : "text-[clamp(22px,4.2vw,30px)]")}>VANA is for {symbol} holders</h2>
        <p className="text-sm text-pretty text-text-2">
          Chatting with VANA and checking tokens need a signed-in wallet holding {fmt(min)} {symbol} or more. Swaps are open to everyone.
        </p>
      </div>
      <ol className="flex w-full flex-col rounded-card border border-line bg-surface p-1.5 text-left text-sm">
        {steps.map((s, i) => (
          <li key={s.label} className={clsx("flex items-center gap-3 rounded-[10px] p-2.5", i === now && "bg-surface-2")}>
            <span
              className={clsx(
                "grid size-[22px] shrink-0 place-items-center rounded-full text-xs font-semibold",
                s.done ? "bg-ok/20 text-ok" : i === now ? "bg-accent text-accent-ink" : "bg-surface-2 text-text-2",
              )}
            >
              {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={clsx(s.done ? "text-text-2 line-through decoration-text-2/50" : i === now ? "font-medium" : "text-text-2")}>{s.label}</span>
              {s.note && <span className="block text-xs text-text-2">{s.note}</span>}
            </span>
            {i === now && <span className="shrink-0 text-xs text-accent-deep">Now</span>}
          </li>
        ))}
      </ol>
      {a?.reason === "unknown" && signedIn && <p className="text-xs text-warn">Couldn&apos;t read the balance just now. Try again.</p>}
      <div className="flex flex-wrap justify-center gap-2.5">
        {signedIn ? (
          <>
            {get}
            {action}
          </>
        ) : (
          <>
            {action}
            {get}
          </>
        )}
      </div>
      {swappable && signedIn && <p className="font-mono text-[0.7rem] break-all text-text-2/80">{token}</p>}
      {!compact && (
        <Link href="/" className="text-xs text-text-2 underline-offset-2 hover:text-accent-deep hover:underline">
          See how VANA works
        </Link>
      )}
    </div>
  );
}

const PRIMARY = clsx(STICKER, "rounded-full px-[18px] py-[9px] text-sm");
const SECONDARY = clsx(QUIET, "rounded-full px-[18px] py-[9px] text-sm");
