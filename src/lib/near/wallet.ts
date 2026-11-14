"use client";

import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { NETWORK, RPC_URL } from "./config";
import { networkOf } from "./network";
import { oneActionEach, outcomesPerTx, PartlySent, REFUSED, stoppedAt, type WalletTx } from "./tx";

export { PartlySent };

export type { WalletTx };

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

/**
 * The wallet account still connected from an earlier visit, if it belongs to this network. A
 * named account from the other one (connected back when testnet was the default) is
 * disconnected, as the network badge does on a switch. Implicit and `0x` accounts exist on both.
 */
export async function restoreAccount(): Promise<string | null> {
  const c = await getConnector();
  try {
    const { accounts } = await c.getConnectedWallet();
    const id = accounts[0]?.accountId ?? null;
    if (id && id.includes(".") && networkOf(id).id !== NETWORK) {
      await c.disconnect().catch(() => {});
      return null;
    }
    return id;
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

export function failedOnChain(o: FinalExecutionOutcome): boolean {
  const s = o?.status as unknown;
  return typeof s === "object" && s !== null && "Failure" in s;
}

/** Wallets that take one action per transaction (NEP-518, an Ethereum key behind a NEAR account). */
const SINGLE_ACTION = ["ethereum-wallets"];

/**
 * Sign and send in order. Multi-action transactions are split for SINGLE_ACTION wallets, with
 * one outcome per original transaction still returned. Wallets that can't batch get one approval per transaction;
 * a transaction that fails on chain stops the rest (later ones depend on it).
 * Throws PartlySent when the wallet stops after something went through; any other error means nothing did.
 */
export async function sendTransactions(txs: WalletTx[]): Promise<FinalExecutionOutcome[]> {
  const w: NearWalletBase = await (await getConnector()).wallet();
  if (SINGLE_ACTION.includes(w.manifest.id)) {
    const { parts, owner } = oneActionEach(txs);
    try {
      return outcomesPerTx(owner, await w.signAndSendTransactions({ network: NETWORK, transactions: parts }), failedOnChain);
    } catch (e) {
      throw stoppedAt(e, parts.length);
    }
  }
  if (txs.length > 1 && w.manifest.features?.signAndSendTransactions === false) {
    const out: FinalExecutionOutcome[] = [];
    for (const [i, t] of txs.entries()) {
      try {
        out.push(await w.signAndSendTransaction({ network: NETWORK, ...t }));
      } catch (e) {
        if (i === 0) throw e;
        // The ones before went through; this one may have too unless the user turned it down.
        const msg = e instanceof Error ? e.message : String(e);
        throw new PartlySent(msg, i === txs.length - 1 && !REFUSED.test(msg));
      }
      if (failedOnChain(out[i]!)) break;
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
