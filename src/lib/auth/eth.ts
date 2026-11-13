import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { Network } from "../near/network";
import { SignInError, takeNonce } from "./nep413";
import { ethSignInText, isEthAccount } from "./sign-in-text";

/**
 * Sign-in with an Ethereum wallet (EIP-191 `personal_sign`), for NEAR accounts controlled by an
 * Ethereum key (`0x…`, NEP-518). Those accounts have no ed25519 key, so NEP-413 can't work. The
 * wallet signs a text naming the account, network, site and a one-time nonce; the server recovers
 * the signer's address and checks it is the account. Whoever holds that key controls the account,
 * so nothing is read on chain. Plain keys (EOAs) only: contract wallets (EIP-1271) can't sign in.
 */

export type EthSignedMessage = {
  /** `0x` + 40 hex. */
  accountId: string;
  /** `0x` + r ‖ s ‖ v, 65 bytes. */
  signature: string;
  nonce: string;
};

const utf8 = new TextEncoder();

/** keccak256("\x19Ethereum Signed Message:\n" + byte length + text), as wallets hash for `personal_sign`. */
export function eip191Hash(text: string): Uint8Array {
  const body = utf8.encode(text);
  const prefix = utf8.encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const all = new Uint8Array(prefix.length + body.length);
  all.set(prefix);
  all.set(body, prefix.length);
  return keccak_256(all);
}

/** The Ethereum address of an uncompressed secp256k1 public key (65 bytes, 0x04 first). */
export function addressOf(publicKey: Uint8Array): string {
  return `0x${Buffer.from(keccak_256(publicKey.subarray(1)).subarray(12)).toString("hex")}`;
}

/** The address that signed `hash`, from a 65-byte `r ‖ s ‖ v` signature (v is 27/28 or 0/1). */
export function recoverAddress(hash: Uint8Array, signature: string): string {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new SignInError("Bad signature encoding.");
  const raw = Buffer.from(signature.slice(2), "hex");
  const v = raw[64]!;
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) throw new SignInError("Bad signature encoding.");
  // noble's "recovered" format puts the recovery byte first.
  const rec = new Uint8Array(65);
  rec[0] = recovery;
  rec.set(raw.subarray(0, 64), 1);
  let point;
  try {
    point = secp256k1.Signature.fromBytes(rec, "recovered").recoverPublicKey(hash);
  } catch {
    throw new SignInError("The signature does not match.");
  }
  return addressOf(point.toBytes(false));
}

export function verifyEthSignIn(s: EthSignedMessage, recipient: string, network: Network): string {
  takeNonce(s.nonce, recipient);
  const account = s.accountId.trim().toLowerCase();
  if (!isEthAccount(account)) throw new SignInError("Not an Ethereum account.");
  const text = ethSignInText({ account, network: network.id, recipient, nonce: s.nonce });
  if (recoverAddress(eip191Hash(text), s.signature) !== account) throw new SignInError("The signature does not match this account, site or network.");
  return account;
}
