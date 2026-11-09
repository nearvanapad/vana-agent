"use client";

import { clsx } from "clsx";
import { BadgeCheck, LogOut, PenLine, Wallet } from "lucide-react";
import { useEffect } from "react";
import { useSession } from "@/components/session/use-session";
import { NearvanaLink } from "@/components/nearvana/nearvana";
import { EYEBROW, STICKER } from "@/components/ui/styles";
import { useWallet } from "./wallet-provider";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * The wallet at the foot of the sidebar: connect it, sign in with it (NEP-413) so chats are kept
 * under the account, and see whether it unlocks the chat (free for now; NVANA when the gate asks). The launchpad link sits on top.
 */
export function WalletPanel() {
  const { account, ready, connecting, error, connect, disconnect } = useWallet();
  const session = useSession();
  const signedIn = Boolean(account && session.account === account);

  // A different wallet, or none, means the server session no longer matches.
  const { mutate: signOut } = session.signOut;
  useEffect(() => {
    if (ready && session.account && session.account !== account) signOut();
  }, [ready, account, session.account, signOut]);

  if (!account) {
    return (
      <div className="flex flex-col gap-2.5">
        <NearvanaLink />
        <button type="button" onClick={() => void connect()} disabled={!ready || connecting} className={clsx(STICKER, "gap-2 rounded-full px-3.5 py-2 text-sm")}>
          <Wallet size={16} />
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
        {error && <span className="text-xs text-bad">{error}</span>}
      </div>
    );
  }

  const signInError = session.signIn.error?.message;
  const a = signedIn ? session.access : null;
  return (
    <div className="flex flex-col gap-2.5">
      <NearvanaLink />
      {a && (
        <div className="flex items-center justify-between gap-2 rounded-well border border-line bg-surface px-3 py-2.5">
          <div className="min-w-0">
            <div className={clsx(EYEBROW, "font-normal text-text-2")}>Access</div>
            {a.min > 0 ? (
              <div className="truncate font-mono text-[13px] font-semibold">
                {a.balance === null ? "—" : fmt(a.balance)} {a.symbol}
              </div>
            ) : (
              <div className="text-[13px] font-semibold">
                Free for now <span className="font-normal text-text-2">· no {a.symbol} needed</span>
              </div>
            )}
          </div>
          {a.ok ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ok/60 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ok">✓ Unlocked</span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warn/60 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warn">
              ! {a.reason === "unknown" ? "Unknown" : "Locked"}
            </span>
          )}
        </div>
      )}
      {!signedIn && (
        <button
          type="button"
          onClick={() => session.signIn.mutate()}
          disabled={session.signIn.isPending}
          title="Sign a message (no transaction) to keep your chats under this account"
          className={clsx(STICKER, "gap-2 rounded-full px-3.5 py-2 text-sm")}
        >
          <PenLine size={15} />
          {session.signIn.isPending ? "Check your wallet…" : "Sign in"}
        </button>
      )}
      <div className="flex items-center gap-2">
        <div
          title={signedIn ? `Signed in as ${account}` : account}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-[13px]"
        >
          {signedIn && <BadgeCheck size={14} className="shrink-0 text-accent-deep" />}
          <span className="truncate">{account}</span>
        </div>
        <button
          type="button"
          onClick={() => void disconnect()}
          aria-label="Disconnect wallet"
          className="grid size-[34px] shrink-0 place-items-center rounded-full border border-line text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <LogOut size={15} />
        </button>
      </div>
      {signInError && !/reject|cancel|closed/i.test(signInError) && <span className="text-xs text-bad">{signInError}</span>}
    </div>
  );
}
