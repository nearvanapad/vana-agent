import { WALLET } from "./network";

/** The network the wallet signs on: the visitor's pick, else mainnet unless the build says testnet. */
export const NETWORK = WALLET.id;

export const RPC_URL = WALLET.rpc[0]!;

export const EXPLORER_TX = `${WALLET.explorer}/txns/`;
export const EXPLORER_ACCOUNT = `${WALLET.explorer}/address/`;

/** 1 NEAR in yocto. */
export const YOCTO = 10n ** 24n;
