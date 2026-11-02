"use client";

import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { NETWORK, RPC_URL } from "./config";

/** A transaction for the wallet to sign. The app builds these; the AI never does. */
export type WalletTx = {
  receiverId: string;
  actions: Array<{
    type: "FunctionCall";
    params: { methodName: string; args: object; gas: string; deposit: string };
  } | { type: "Transfer"; params: { deposit: string } }>;
};

/** MyNearWallet shuts down 31 Oct 2026; NEAR CLI is a developer tool. */
const EXCLUDED = ["mynearwallet", "near-cli"];

/** What the wallet returns per signed transaction (the RPC final outcome). */
export type FinalExecutionOutcome = Awaited<ReturnType<NearWalletBase["signAndSendTransaction"]>>;

let connector: Promise<NearConnector> | null = null;

/** near-connect touches window, so it is loaded on first use in the browser only. */
export function getConnector(): Promise<NearConnector> {
  return (connector ??= import("@hot-labs/near-connect").then(
    ({ NearConnector }) =>
      new NearConnector({
        network: NETWORK,
        providers: { [NETWORK]: [RPC_URL] },
        excludedWallets: EXCLUDED,
        footerBranding: null,
      }),
  ));
}

export async function restoreAccount(): Promise<string | null> {
  const c = await getConnector();
  try {
    const { accounts } = await c.getConnectedWallet();
    return accounts[0]?.accountId ?? null;
  } catch {
    return null;
  }
}

/** Opens near-connect's wallet picker. */
export async function connectWallet(): Promise<string> {
  const c = await getConnector();
  const wallet = await c.connect();
  const [account] = await wallet.getAccounts({ network: NETWORK });
  if (!account) throw new Error("The wallet returned no account.");
  return account.accountId;
}

export async function disconnectWallet(): Promise<void> {
  const c = await getConnector();
  await c.disconnect().catch(() => {});
}

function failedOnChain(o: FinalExecutionOutcome): boolean {
  const s = o?.status as unknown;
  return typeof s === "object" && s !== null && "Failure" in s;
}

/**
 * Sign and send in order. Wallets that can't batch get one approval per transaction;
 * a transaction that fails on chain stops the rest (later ones depend on it).
 */
export async function sendTransactions(txs: WalletTx[]): Promise<FinalExecutionOutcome[]> {
  const w: NearWalletBase = await (await getConnector()).wallet();
  if (txs.length > 1 && w.manifest.features?.signAndSendTransactions === false) {
    const out: FinalExecutionOutcome[] = [];
    for (const t of txs) {
      const o = await w.signAndSendTransaction({ network: NETWORK, ...t });
      out.push(o);
      if (failedOnChain(o)) break;
    }
    return out;
  }
  return w.signAndSendTransactions({ network: NETWORK, transactions: txs });
}

/** NEP-413 message signing, used for sign-in. */
export async function signMessage(message: string, recipient: string, nonce: Uint8Array) {
  const w = await (await getConnector()).wallet();
  if (!w.manifest.features?.signMessage) throw new Error(`${w.manifest.name} can't sign messages.`);
  return w.signMessage({ message, recipient, nonce, network: NETWORK });
}

export async function onWalletChange(cb: (account: string | null) => void): Promise<() => void> {
  const c = await getConnector();
  const onIn = (e: { accounts: { accountId: string }[] }) => cb(e.accounts[0]?.accountId ?? null);
  const onOut = () => cb(null);
  c.on("wallet:signIn", onIn);
  c.on("wallet:signOut", onOut);
  return () => {
    c.off("wallet:signIn", onIn);
    c.off("wallet:signOut", onOut);
  };
}
