import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";

// A throwaway database, set before anything opens one.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "vana-test-")), "test.db");

const { addressOf, eip191Hash, verifyEthSignIn } = await import("./eth");
const { challenge, SignInError } = await import("./nep413");
const { ethSignInText } = await import("./sign-in-text");
const { MAINNET, TESTNET } = await import("../near/network");

const RECIPIENT = "vana.test";

/** Private key 1: a well-known test vector. */
const ONE = new Uint8Array(32);
ONE[31] = 1;
const ONE_ADDRESS = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";

/** Signs like a wallet's `personal_sign`: 0x + r ‖ s ‖ v, v = 27/28 (or 0/1 if asked). */
function personalSign(text: string, key: Uint8Array, vBase = 27): string {
  const rec = secp256k1.sign(eip191Hash(text), key, { prehash: false, format: "recovered" });
  const out = Buffer.alloc(65);
  out.set(rec.subarray(1), 0);
  out[64] = rec[0]! + vBase;
  return `0x${out.toString("hex")}`;
}

function signIn(opts: { key?: Uint8Array; account?: string; network?: "mainnet" | "testnet"; recipient?: string; vBase?: number } = {}) {
  const key = opts.key ?? ONE;
  const account = opts.account ?? addressOf(secp256k1.getPublicKey(key, false));
  const { nonce } = challenge(RECIPIENT);
  const text = ethSignInText({ account, network: opts.network ?? "testnet", recipient: opts.recipient ?? RECIPIENT, nonce });
  return { accountId: account, signature: personalSign(text, key, opts.vBase), nonce };
}

describe("Ethereum sign-in", () => {
  it("derives the right address", () => {
    assert.equal(addressOf(secp256k1.getPublicKey(ONE, false)), ONE_ADDRESS);
  });

  it("accepts the account's own signature", () => {
    assert.equal(verifyEthSignIn(signIn(), RECIPIENT, TESTNET), ONE_ADDRESS);
  });

  it("accepts v as 0/1 and a checksummed account", () => {
    const s = signIn({ vBase: 0 });
    assert.equal(verifyEthSignIn({ ...s, accountId: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" }, RECIPIENT, TESTNET), ONE_ADDRESS);
  });

  it("rejects another key's signature", () => {
    const other = secp256k1.utils.randomSecretKey();
    const s = signIn({ key: other, account: ONE_ADDRESS });
    assert.throws(() => verifyEthSignIn(s, RECIPIENT, TESTNET), /does not match this account/);
  });

  it("uses a nonce once", () => {
    const s = signIn();
    verifyEthSignIn(s, RECIPIENT, TESTNET);
    assert.throws(() => verifyEthSignIn(s, RECIPIENT, TESTNET), SignInError);
  });

  it("rejects a signature for another network", () => {
    assert.throws(() => verifyEthSignIn(signIn({ network: "mainnet" }), RECIPIENT, TESTNET), SignInError);
    assert.equal(verifyEthSignIn(signIn({ network: "mainnet" }), RECIPIENT, MAINNET), ONE_ADDRESS);
  });

  it("rejects a signature for another site", () => {
    assert.throws(() => verifyEthSignIn(signIn({ recipient: "evil.test" }), RECIPIENT, TESTNET), SignInError);
  });

  it("rejects malformed signatures and accounts", () => {
    const s = signIn();
    assert.throws(() => verifyEthSignIn({ ...s, signature: s.signature.slice(0, -2) }, RECIPIENT, TESTNET), /Bad signature/);
    assert.throws(() => verifyEthSignIn({ ...signIn(), signature: `${s.signature.slice(0, -2)}1d` }, RECIPIENT, TESTNET), /Bad signature/);
    assert.throws(() => verifyEthSignIn({ ...signIn(), accountId: "alice.near" }, RECIPIENT, TESTNET), /Not an Ethereum account/);
  });
});
