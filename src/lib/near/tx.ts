/**
 * Transactions as plain data. The server builds them from a quote the user approved; the
 * browser hands them to the wallet, which is the only thing that signs.
 */

export type FunctionCallAction = {
  type: "FunctionCall";
  params: { methodName: string; args: object; gas: string; deposit: string };
};

export type WalletTx = {
  receiverId: string;
  actions: FunctionCallAction[];
};

const TGAS = 10n ** 12n;
export const ONE_YOCTO = "1";

/** Attached gas per call, in Tgas. Unused gas is refunded, so these err high. */
export const GAS = { storage: 10, wrap: 10, transfer: 15, swap: 180 } as const;

export function call(methodName: string, args: object, gasTgas: number, deposit = "0"): FunctionCallAction {
  return { type: "FunctionCall", params: { methodName, args, gas: (BigInt(gasTgas) * TGAS).toString(), deposit } };
}

/** NEP-145: registers `account` on the token so it can receive it. Paid by the signer. */
export const storageDeposit = (account: string, deposit: string) =>
  call("storage_deposit", { account_id: account, registration_only: true }, GAS.storage, deposit);

/** Wraps native NEAR into wNEAR (`wrap.near`). */
export const nearDeposit = (amount: string) => call("near_deposit", {}, GAS.wrap, amount);

/** Unwraps wNEAR back into native NEAR. */
export const nearWithdraw = (amount: string) => call("near_withdraw", { amount }, GAS.wrap, ONE_YOCTO);

export const ftTransfer = (receiver: string, amount: string) =>
  call("ft_transfer", { receiver_id: receiver, amount, memo: null }, GAS.transfer, ONE_YOCTO);

export const ftTransferCall = (receiver: string, amount: string, msg: string, gasTgas: number = GAS.swap) =>
  call("ft_transfer_call", { receiver_id: receiver, amount, memo: null, msg }, gasTgas, ONE_YOCTO);

/**
 * Wallets that sign through an Ethereum key (NEP-518) take one action per transaction. Splits each
 * transaction into one per action, same receiver, in order; `owner[i]` is the index in `txs` that
 * part `i` came from. The parts are no longer atomic: they run in order and stop at the first failure.
 */
export function oneActionEach(txs: WalletTx[]): { parts: WalletTx[]; owner: number[] } {
  const parts: WalletTx[] = [];
  const owner: number[] = [];
  txs.forEach((t, i) =>
    t.actions.forEach((a) => {
      parts.push({ receiverId: t.receiverId, actions: [a] });
      owner.push(i);
    }),
  );
  return { parts, owner };
}

/**
 * The outcomes of split parts, back as one per original transaction: its last part's outcome, or
 * the part that failed (and nothing after it). A transaction whose parts did not all run is left
 * out, so callers still see fewer outcomes than transactions.
 */
export function outcomesPerTx<T>(owner: number[], outcomes: T[], failed: (o: T) => boolean): T[] {
  const out: T[] = [];
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i]!;
    const tx = owner[i]!;
    if (failed(o)) {
      out[tx] = o;
      return out.filter((x) => x !== undefined);
    }
    // Only the transaction's last part completes it.
    if (owner[i + 1] !== tx) out[tx] = o;
  }
  return out.filter((x) => x !== undefined);
}
