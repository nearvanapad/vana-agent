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

/**
 * The EIP-191 text an Ethereum wallet signs. It names the account, network, site and nonce, so
 * the signature can't be replayed on another site or network (`0x` accounts exist on both).
 */
export function ethSignInText(p: { account: string; network: "mainnet" | "testnet"; recipient: string; nonce: string }): string {
  return [SIGN_IN_MESSAGE, "", `Account: ${p.account}`, `Network: NEAR ${p.network}`, `Site: ${p.recipient}`, `Nonce: ${p.nonce}`].join("\n");
}
