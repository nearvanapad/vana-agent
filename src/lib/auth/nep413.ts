import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { kv } from "../db";
import { viewAccessKeys } from "../near/rpc";

/**
 * Sign-in with a NEAR wallet (NEP-413). The server hands out a one-time nonce; the wallet signs
 * {message, nonce, recipient}; the server checks the ed25519 signature and that the key is a
 * full-access key of the account. Nothing is sent on chain.
 */

export const SIGN_IN_MESSAGE = "Sign in to VANA. This proves you own this account. It sends no transaction and costs nothing.";
const NONCE_TTL_MS = 5 * 60_000;
/** 2^31 + 413: prefix that keeps a signed message from ever being a valid transaction. */
const TAG = 2 ** 31 + 413;

export function challenge(recipient: string) {
  const nonce = randomBytes(32).toString("base64");
  kv.set(`nep413:${nonce}`, recipient, NONCE_TTL_MS);
  return { message: SIGN_IN_MESSAGE, recipient, nonce };
}

export type SignedMessage = {
  accountId: string;
  publicKey: string;
  signature: string;
  nonce: string;
};

export class SignInError extends Error {}

export async function verifySignIn(s: SignedMessage, recipient: string): Promise<string> {
  const stored = kv.get<string>(`nep413:${s.nonce}`);
  if (stored !== recipient) throw new SignInError("Sign-in request expired. Try again.");
  // One use only.
  kv.delete(`nep413:${s.nonce}`);

  const nonce = Buffer.from(s.nonce, "base64");
  if (nonce.length !== 32) throw new SignInError("Bad nonce.");
  const key = parseKey(s.publicKey);
  const sig = decodeSignature(s.signature);
  const hash = createHash("sha256").update(payload(SIGN_IN_MESSAGE, nonce, recipient)).digest();
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key]);
  const ok = verify(null, hash, createPublicKey({ key: spki, format: "der", type: "spki" }), sig);
  if (!ok) throw new SignInError("The signature does not match.");

  const account = s.accountId.trim().toLowerCase();
  const keys = await viewAccessKeys(account).catch(() => []);
  const full = keys.some((k) => k.public_key === s.publicKey && k.access_key.permission === "FullAccess");
  if (!full) throw new SignInError(`That key is not a full-access key of ${account}.`);
  return account;
}

/** Borsh: tag u32, message string, nonce [u8; 32], recipient string, callbackUrl Option<string> = None. */
function payload(message: string, nonce: Buffer, recipient: string): Buffer {
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(TAG);
  return Buffer.concat([tag, str(message), nonce, str(recipient), Buffer.from([0])]);
}

function str(s: string): Buffer {
  const b = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length);
  return Buffer.concat([len, b]);
}

function parseKey(k: string): Buffer {
  const [type, data] = k.split(":");
  if (type !== "ed25519" || !data) throw new SignInError("Only ed25519 keys can sign in.");
  const raw = base58(data);
  if (raw.length !== 32) throw new SignInError("Bad public key.");
  return raw;
}

/** Wallets return the signature in base64; a few use base58. */
function decodeSignature(s: string): Buffer {
  const b64 = Buffer.from(s, "base64");
  if (b64.length === 64) return b64;
  const b58 = base58(s.replace(/^ed25519:/, ""));
  if (b58.length === 64) return b58;
  throw new SignInError("Bad signature encoding.");
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(s: string): Buffer {
  let n = 0n;
  for (const c of s) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new SignInError("Bad base58.");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Buffer.from(bytes);
}
