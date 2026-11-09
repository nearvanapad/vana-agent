/**
 * The two NEAR networks the risk check can read. Accounts ending in `.testnet` are read from
 * testnet, everything else from mainnet. The wallet signs, and swaps run, on the network the visitor
 * picked: `WALLET` in the browser, `Session.network` on the server.
 *
 * Server code runs a request inside one network (see `network-server.ts`); code that runs in
 * the browser, or outside such a request, gets mainnet.
 */

export type NetworkId = "mainnet" | "testnet";

export type Network = {
  id: NetworkId;
  rpc: string[];
  fastnearApi: string;
  fastnearTx: string;
  nearblocksApi: string;
  /** Block explorer, without a trailing slash. */
  explorer: string;
  /** Rhea classic AMM and concentrated-liquidity (DCL) contracts. */
  classic: string;
  dcl: string;
  wrap: string;
  /** Rhea's web app, for pool links. */
  rheaApp: string;
};

const list = (env: string | undefined, fallbacks: string[]) => [
  ...new Set([...(env?.split(",").map((u) => u.trim()).filter(Boolean) ?? []), ...fallbacks]),
];

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

export const MAINNET: Network = {
  id: "mainnet",
  // Written out in full so Next can inline the public one into the browser bundle.
  rpc: list(typeof process !== "undefined" ? (process.env.NEAR_RPC_URL ?? process.env.NEXT_PUBLIC_NEAR_RPC_URL) : undefined, [
    "https://rpc.mainnet.fastnear.com",
    "https://near.drpc.org",
    "https://rpc.mainnet.near.org",
  ]),
  fastnearApi: "https://api.fastnear.com/v1",
  fastnearTx: "https://tx.main.fastnear.com/v0",
  nearblocksApi: "https://api.nearblocks.io/v1",
  explorer: "https://nearblocks.io",
  classic: "v2.ref-finance.near",
  dcl: "dclv2.ref-labs.near",
  wrap: "wrap.near",
  rheaApp: "https://app.rhea.finance",
};

export const TESTNET: Network = {
  id: "testnet",
  rpc: list(env("NEAR_TESTNET_RPC_URL"), ["https://rpc.testnet.fastnear.com", "https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"]),
  fastnearApi: "https://test.api.fastnear.com/v1",
  fastnearTx: "https://tx.test.fastnear.com/v0",
  nearblocksApi: "https://api-testnet.nearblocks.io/v1",
  explorer: "https://testnet.nearblocks.io",
  classic: "ref-finance-101.testnet",
  dcl: "dclv2.ref-dev.testnet",
  wrap: "wrap.testnet",
  rheaApp: "https://testnet.rhea.finance",
};

/**
 * The network the wallet signs on until the visitor picks one, set at build time with
 * NEXT_PUBLIC_NEAR_NETWORK. Testnet by default: swaps there go through Rhea's testnet pools
 * (NEAR Intents is mainnet only).
 */
export const DEFAULT_WALLET: Network = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? MAINNET : TESTNET;

/** The visitor's pick, in a cookie the server reads too. Switching reloads the app. */
export const NET_COOKIE = "vana_net";

/** A network by id; anything else is null. */
export const networkById = (id: string | null | undefined): Network | null => (id === "mainnet" ? MAINNET : id === "testnet" ? TESTNET : null);

function pickedInBrowser(): Network | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${NET_COOKIE}=([^;]*)`));
  return networkById(m?.[1]);
}

/**
 * The network the wallet signs on and swaps run on, in the browser: the visitor's pick, else the
 * default. The app renders only in the browser, and switching reloads it, so this holds for a page
 * load. Server code takes the network from the session instead (`Session.network`).
 */
export const WALLET: Network = pickedInBrowser() ?? DEFAULT_WALLET;

/** Saves the pick and reloads, so every module starts again on the new network. */
export function switchWallet(id: Network["id"]) {
  document.cookie = `${NET_COOKIE}=${id}; path=/; max-age=${365 * 24 * 3600}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  location.reload();
}

/** The network an account lives on, from its name. */
export const networkOf = (account: string): Network => (/\.testnet$/.test(account.trim().toLowerCase()) ? TESTNET : MAINNET);

let current: () => Network | undefined = () => undefined;

/** Lets the server plug in its per-request network. */
export function setNetworkSource(get: () => Network | undefined) {
  current = get;
}

/** The network the current request reads. */
export const net = (): Network => current() ?? MAINNET;

/** A link on the current network's explorer: `explorer("/address/x")`. */
export const explorer = (path: string) => `${net().explorer}${path}`;

/** A cache key that keeps the networks apart (implicit accounts exist on both). */
export const netKey = (key: string) => (net().id === "mainnet" ? key : `${net().id}:${key}`);
