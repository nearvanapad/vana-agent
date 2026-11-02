/** Mainnet only: NEAR Intents has no testnet. */
export const NETWORK = "mainnet" as const;

export const RPC_URL =
  process.env.NEAR_RPC_URL ?? process.env.NEXT_PUBLIC_NEAR_RPC_URL ?? "https://rpc.mainnet.fastnear.com";

export const EXPLORER_TX = "https://nearblocks.io/txns/";
export const EXPLORER_ACCOUNT = "https://nearblocks.io/address/";

/** 1 NEAR in yocto. */
export const YOCTO = 10n ** 24n;
