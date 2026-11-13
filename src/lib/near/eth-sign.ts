"use client";

/**
 * Ethereum sign-in on this page. NEAR accounts controlled by an Ethereum key (`0x…`) connect
 * through near-connect's "Ethereum Wallets", which can send transactions but can't sign
 * messages. To sign in, VANA asks the browser's Ethereum extension directly to sign a Sign-In with
 * Ethereum message (`personal_sign`), and the server recovers the address (lib/auth/eth.ts).
 */

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

export type EthWallet = { id: string; name: string; icon: string; provider: Eip1193 };

type Announce = { info?: { uuid?: string; rdns?: string; name?: string; icon?: string }; provider?: Eip1193 };

/** The installed extensions (EIP-6963), or the single `window.ethereum` of older ones. */
async function discover(): Promise<EthWallet[]> {
  const found = new Map<string, EthWallet>();
  const on = (e: Event) => {
    const { info, provider } = ((e as CustomEvent<Announce>).detail ?? {}) as Announce;
    if (!provider || typeof provider.request !== "function") return;
    const id = info?.rdns || info?.uuid || `wallet-${found.size}`;
    found.set(id, { id, name: info?.name || "Browser wallet", icon: info?.icon ?? "", provider });
  };
  window.addEventListener("eip6963:announceProvider", on);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // Extensions answer synchronously or within a tick; give slow ones a moment.
  await new Promise((r) => setTimeout(r, 300));
  window.removeEventListener("eip6963:announceProvider", on);
  const list = [...found.values()];
  const legacy = (window as { ethereum?: Eip1193 }).ethereum;
  if (!list.length && legacy && typeof legacy.request === "function") list.push({ id: "injected", name: "Browser wallet", icon: "", provider: legacy });
  return list;
}

/* The picker, for when several extensions are installed and none has this site connected yet. */

export type EthPick = { wallets: EthWallet[]; choose: (w: EthWallet | null) => void };

let pick: EthPick | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export const ethPicker = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  get: () => pick,
};

function askWhich(wallets: EthWallet[]): Promise<EthWallet | null> {
  pick?.choose(null);
  return new Promise((resolve) => {
    pick = {
      wallets,
      choose: (w) => {
        pick = null;
        emit();
        resolve(w);
      },
    };
    emit();
  });
}

const lower = (a: unknown): string[] => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase()) : []);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function holds(w: EthWallet, address: string): Promise<boolean> {
  try {
    return lower(await w.provider.request({ method: "eth_accounts" })).includes(address);
  } catch {
    return false;
  }
}

/** Signs `text` with `personal_sign` from the extension that holds `address` (lowercase `0x…`). */
export async function ethPersonalSign(address: string, text: string): Promise<string> {
  const wallets = await discover();
  // Ethereum Wallets can connect through WalletConnect, but only an extension (or a wallet's own
  // browser) can sign the sign-in message here.
  if (!wallets.length) {
    throw new Error(
      "Signing in with an Ethereum account needs a wallet in this browser: an extension such as MetaMask or Rabby on desktop, or the browser inside the MetaMask or Rabby app on a phone. WalletConnect can't sign in yet.",
    );
  }

  // An extension that already has this site and account connected signs without another prompt.
  const ready = await Promise.all(wallets.map((w) => holds(w, address)));
  const w = wallets[ready.indexOf(true)] ?? (wallets.length === 1 ? wallets[0]! : await askWhich(wallets));
  if (!w) throw new Error("Wallet selection cancelled");

  const accounts = lower(await w.provider.request({ method: "eth_requestAccounts" }));
  if (!accounts.includes(address)) throw new Error(`${w.name} isn't on ${short(address)}. Switch to that account in ${w.name} and try again.`);

  const hex = `0x${Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const sig = await w.provider.request({ method: "personal_sign", params: [hex, address] });
  if (typeof sig !== "string") throw new Error(`${w.name} returned no signature.`);
  return sig;
}
