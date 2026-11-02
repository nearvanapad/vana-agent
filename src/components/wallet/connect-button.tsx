"use client";

import { LogOut, Wallet } from "lucide-react";
import { useWallet } from "./wallet-provider";

export function ConnectButton() {
  const { account, ready, connecting, error, connect, disconnect } = useWallet();

  if (account) {
    return (
      <div className="flex items-center gap-2">
        <span className="max-w-44 truncate rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-sm" title={account}>
          {account}
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
