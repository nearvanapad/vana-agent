import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";

// A throwaway database, set before anything opens one.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "vana-test-")), "test.db");

const { addressOf, eip191Hash, verifyEthSignIn } = await import("./eth");
const { challenge, SignInError } = await import("./nep413");
const { checksumAddress, ethSignInText } = await import("./sign-in-text");
const { MAINNET, TESTNET } = await import("../near/network");

const SITE = { domain: "vana.test", uri: "https://vana.test" };

/** Private key 1: a well-known test vector. */
const ONE = new Uint8Array(32);
ONE[31] = 1;
const ONE_ADDRESS = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";

/** How the RPC answers view_access_key_list: no such account yet, these keys, or down. */
let chain: "unknown" | "down" | { permission: unknown }[] = "unknown";

before(() => {
  globalThis.fetch = (async () => {
    if (chain === "down") return new Response("bad gateway", { status: 502 });
    if (chain === "unknown") return Response.json({ jsonrpc: "2.0", id: "vana", error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT" }, message: "no account" } });
    const keys = chain.map((k, i) => ({ public_key: `ed25519:${i}`, access_key: { nonce: 0, permission: k.permission } }));
    return Response.json({ jsonrpc: "2.0", id: "vana", result: { keys, block_height: 1, block_hash: "x" } });
  }) as typeof fetch;
});
beforeEach(() => {
  chain = "unknown";
});

/** Signs like a wallet's `personal_sign`: 0x + r ‖ s ‖ v, v = 27/28 (or 0/1 if asked). */
function personalSign(text: string, key: Uint8Array, vBase = 27): string {
  const rec = secp256k1.sign(eip191Hash(text), key, { prehash: false, format: "recovered" });
  const out = Buffer.alloc(65);
  out.set(rec.subarray(1), 0);
  out[64] = rec[0]! + vBase;
  return `0x${out.toString("hex")}`;
}

function signIn(opts: { key?: Uint8Array; account?: string; network?: "mainnet" | "testnet"; domain?: string; vBase?: number; issuedAt?: string } = {}) {
  const key = opts.key ?? ONE;
  const account = opts.account ?? addressOf(secp256k1.getPublicKey(key, false));
  const { nonce } = challenge(SITE.domain);
  const issuedAt = opts.issuedAt ?? new Date().toISOString();
  const domain = opts.domain ?? SITE.domain;
  const text = ethSignInText({ account, network: opts.network ?? "testnet", domain, uri: `https://${domain}`, nonce, issuedAt });
  return { accountId: account, signature: personalSign(text, key, opts.vBase), nonce, issuedAt };
}

describe("Sign-In with Ethereum message", () => {
  it("checksums addresses (EIP-55)", () => {
    assert.equal(checksumAddress(ONE_ADDRESS), "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf");
    assert.equal(checksumAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"), "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  });

  it("follows the EIP-4361 layout", () => {
    const nonce = Buffer.alloc(32, 0xab).toString("base64");
    const text = ethSignInText({ account: ONE_ADDRESS, network: "mainnet", domain: "vana.test", uri: "https://vana.test", nonce, issuedAt: "2026-11-13T00:00:00.000Z" });
    assert.equal(
      text,
      [
        "vana.test wants you to sign in with your Ethereum account:",
        "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
        "",
        "Sign in to VANA on NEAR mainnet. This proves you own this account. It sends no transaction and costs nothing.",
        "",
        "URI: https://vana.test",
        "Version: 1",
        "Chain ID: 397",
        `Nonce: ${"ab".repeat(32)}`,
        "Issued At: 2026-11-13T00:00:00.000Z",
      ].join("\n"),
    );
  });
});

describe("Ethereum sign-in", () => {
  it("derives the right address", () => {
    assert.equal(addressOf(secp256k1.getPublicKey(ONE, false)), ONE_ADDRESS);
  });

  it("accepts the account's own signature", async () => {
    assert.equal(await verifyEthSignIn(signIn(), SITE, TESTNET), ONE_ADDRESS);
  });

  it("accepts an account whose only keys are function-call keys", async () => {
    chain = [{ permission: { FunctionCall: { allowance: null, receiver_id: ONE_ADDRESS, method_names: ["rlp_execute"] } } }];
    assert.equal(await verifyEthSignIn(signIn(), SITE, TESTNET), ONE_ADDRESS);
  });

  it("refuses an account a NEAR full-access key controls", async () => {
    chain = [{ permission: "FullAccess" }];
    await assert.rejects(verifyEthSignIn(signIn(), SITE, TESTNET), /controlled by a NEAR key/);
  });

  it("refuses when the account can't be read", async () => {
    chain = "down";
    await assert.rejects(verifyEthSignIn(signIn(), SITE, TESTNET), /Couldn't read the account/);
  });

  it("accepts v as 0/1 and a checksummed account", async () => {
    const s = signIn({ vBase: 0 });
    assert.equal(await verifyEthSignIn({ ...s, accountId: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" }, SITE, TESTNET), ONE_ADDRESS);
  });

  it("rejects another key's signature", async () => {
    const s = signIn({ key: secp256k1.utils.randomSecretKey(), account: ONE_ADDRESS });
    await assert.rejects(verifyEthSignIn(s, SITE, TESTNET), /does not match this account/);
  });

  it("uses a nonce once", async () => {
    const s = signIn();
    await verifyEthSignIn(s, SITE, TESTNET);
    await assert.rejects(verifyEthSignIn(s, SITE, TESTNET), SignInError);
  });

  it("rejects a signature for another network", async () => {
    await assert.rejects(verifyEthSignIn(signIn({ network: "mainnet" }), SITE, TESTNET), SignInError);
    assert.equal(await verifyEthSignIn(signIn({ network: "mainnet" }), SITE, MAINNET), ONE_ADDRESS);
  });

  it("rejects a signature for another site", async () => {
    await assert.rejects(verifyEthSignIn(signIn({ domain: "evil.test" }), SITE, TESTNET), SignInError);
  });

  it("rejects an old or future issue time", async () => {
    await assert.rejects(verifyEthSignIn(signIn({ issuedAt: new Date(Date.now() - 3_600_000).toISOString() }), SITE, TESTNET), /clock/);
    await assert.rejects(verifyEthSignIn(signIn({ issuedAt: new Date(Date.now() + 3_600_000).toISOString() }), SITE, TESTNET), /clock/);
  });

  it("rejects malformed signatures and accounts", async () => {
    const s = signIn();
    await assert.rejects(verifyEthSignIn({ ...s, signature: s.signature.slice(0, -2) }, SITE, TESTNET), /Bad signature/);
    await assert.rejects(verifyEthSignIn({ ...signIn(), signature: `${s.signature.slice(0, -2)}1d` }, SITE, TESTNET), /Bad signature/);
    await assert.rejects(verifyEthSignIn({ ...signIn(), accountId: "alice.near" }, SITE, TESTNET), /Not an Ethereum account/);
  });
});
