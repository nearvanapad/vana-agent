import { keccak_256 } from "@noble/hashes/sha3.js";

/**
 * What a wallet signs to sign in. Shared by the browser and the server, so nothing here may
 * import Node modules.
 */

export const SIGN_IN_MESSAGE = "Sign in to VANA. This proves you own this account. It sends no transaction and costs nothing.";

/**
 * A NEAR account controlled by an Ethereum key (NEP-518): `0x` and the 20-byte address, lowercase.
 * The protocol keeps this shape for those accounts, so no named account can take it.
 */
export const isEthAccount = (account: string | null | undefined): account is string => !!account && /^0x[0-9a-f]{40}$/.test(account);

/** NEAR's chain IDs for Ethereum wallets (NEP-518), as the Ethereum Wallets signing page uses them. */
export const ETH_CHAIN_ID = { mainnet: 397, testnet: 398 } as const;

/** EIP-55: the address with checksum capitals, as Sign-In with Ethereum requires. */
export function checksumAddress(address: string): string {
  const hex = address.toLowerCase().replace(/^0x/, "");
  const hash = keccak_256(new TextEncoder().encode(hex));
  let out = "0x";
  for (let i = 0; i < hex.length; i++) {
    const nibble = (hash[i >> 1]! >> (i % 2 ? 0 : 4)) & 0xf;
    out += nibble >= 8 ? hex[i]!.toUpperCase() : hex[i];
  }
  return out;
}

const toHex = (b64: string) => Array.from(atob(b64), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");

/**
 * The Sign-In with Ethereum message (EIP-4361) an Ethereum wallet signs with `personal_sign`.
 * Wallets read its domain and warn or refuse when it isn't the page asking, so another site can't
 * get it signed for VANA. The chain ID and statement name the network, the nonce is one-time, so
 * the signature can't be replayed on the other network (`0x` accounts exist on both) or twice.
 * `domain` is the site's host, `uri` its origin; the nonce is the challenge's, as hex.
 */
export function ethSignInText(p: {
  account: string;
  network: "mainnet" | "testnet";
  domain: string;
  uri: string;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    `${p.domain} wants you to sign in with your Ethereum account:`,
    checksumAddress(p.account),
    "",
    `Sign in to VANA on NEAR ${p.network}. This proves you own this account. It sends no transaction and costs nothing.`,
    "",
    `URI: ${p.uri}`,
    "Version: 1",
    `Chain ID: ${ETH_CHAIN_ID[p.network]}`,
    `Nonce: ${toHex(p.nonce)}`,
    `Issued At: ${p.issuedAt}`,
  ].join("\n");
}
