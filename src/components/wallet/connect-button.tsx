"use client";

import { BadgeCheck, LogOut, PenLine, Wallet } from "lucide-react";
import { useEffect } from "react";
import { useSession } from "@/components/session/use-session";
import { useWallet } from "./wallet-provider";

/** Connect the wallet, then sign in with it (NEP-413) so chats are kept under the account. */
export function ConnectButton() {
  const { account, ready, connecting, error, connect, disconnect } = useWallet();
  const session = useSession();
  const signedIn = Boolean(account && session.account === account);

  // A different wallet, or none, means the server session no longer matches.
  const { mutate: signOut } = session.signOut;
  useEffect(() => {
    if (ready && session.account && session.account !== account) signOut();
  }, [ready, account, session.account, signOut]);

  if (account) {
    const signInError = session.signIn.error?.message;
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {!signedIn && (
            <button
              type="button"
              onClick={() => session.signIn.mutate()}
              disabled={session.signIn.isPending}
              className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-hi disabled:opacity-60"
              title="Sign a message (no transaction) to keep your chats under this account"
            >
              <PenLine size={14} />
              {session.signIn.isPending ? "Check wallet…" : "Sign in"}
            </button>
          )}
          <span
            className="flex max-w-44 items-center gap-1.5 truncate rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-sm"
            title={signedIn ? `Signed in as ${account}` : account}
          >
            {signedIn && <BadgeCheck size={14} className="shrink-0 text-accent" />}
            <span className="truncate">{account}</span>
          </span>
          <button
            type="button"
            onClick={() => void disconnect()}
            className="rounded-full border border-line p-2 text-text-2 hover:bg-surface-2"
            aria-label="Disconnect wallet"
          >
            <LogOut size={16} />
          </button>
        </div>
        {signInError && !/reject|cancel|closed/i.test(signInError) && <span className="text-xs text-bad">{signInError}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void connect()}
        disabled={!ready || connecting}
        className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hi disabled:opacity-60"
      >
        <Wallet size={16} />
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}
