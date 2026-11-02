"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { connectWallet, disconnectWallet, onWalletChange, restoreAccount } from "@/lib/near/wallet";

type WalletState = {
  account: string | null;
  ready: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    void restoreAccount().then((a) => {
      if (dead) return;
      setAccount(a);
      setReady(true);
    });
    void onWalletChange(setAccount).then((fn) => (dead ? fn() : (off = fn)));
    return () => {
      dead = true;
      off?.();
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      setAccount(await connectWallet());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Closing the picker is not an error worth showing.
      if (!/reject|cancel|closed/i.test(msg)) setError(msg);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setAccount(null);
  }, []);

  return <Ctx value={{ account, ready, connecting, error, connect, disconnect }}>{children}</Ctx>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
