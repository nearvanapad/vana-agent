/** Mainnet only: NEAR Intents has no testnet. */
export const NETWORK = "mainnet" as const;

export const RPC_URL =
  process.env.NEAR_RPC_URL?.split(",")[0] ?? process.env.NEXT_PUBLIC_NEAR_RPC_URL ?? "https://rpc.mainnet.fastnear.com";

/** Tried in order when one rate-limits or fails. NEAR_RPC_URL may list several, comma-separated. */
export const RPC_URLS = [
  ...new Set([
    ...(process.env.NEAR_RPC_URL?.split(",").map((u) => u.trim()).filter(Boolean) ?? [RPC_URL]),
    "https://rpc.mainnet.fastnear.com",
    "https://near.drpc.org",
    "https://rpc.mainnet.near.org",
  ]),
];

export const EXPLORER_TX = "https://nearblocks.io/txns/";
export const EXPLORER_ACCOUNT = "https://nearblocks.io/address/";

/** 1 NEAR in yocto. */
export const YOCTO = 10n ** 24n;
