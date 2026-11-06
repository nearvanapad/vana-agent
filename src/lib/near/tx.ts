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

export const ftTransfer = (receiver: string, amount: string) =>
  call("ft_transfer", { receiver_id: receiver, amount, memo: null }, GAS.transfer, ONE_YOCTO);

export const ftTransferCall = (receiver: string, amount: string, msg: string, gasTgas: number = GAS.swap) =>
  call("ft_transfer_call", { receiver_id: receiver, amount, memo: null, msg }, gasTgas, ONE_YOCTO);
