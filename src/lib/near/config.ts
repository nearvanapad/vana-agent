import { MAINNET } from "./network";

/** The wallet signs on mainnet only: NEAR Intents has no testnet. */
export const NETWORK = "mainnet" as const;

export const RPC_URL = MAINNET.rpc[0]!;

export const EXPLORER_TX = "https://nearblocks.io/txns/";
export const EXPLORER_ACCOUNT = "https://nearblocks.io/address/";

/** 1 NEAR in yocto. */
export const YOCTO = 10n ** 24n;
