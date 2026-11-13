import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import { KeyPair } from "near-api-js";

// A throwaway database, set before anything opens one.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "vana-test-")), "test.db");

const { challenge, verifySignIn, SignInError } = await import("./nep413");
const { TESTNET } = await import("../near/network");

const RECIPIENT = "vana.test";
const ACCOUNT = "alice.testnet";

/** NEP-413 payload, written out again here so the test does not trust the code it checks. */
function payload(message: string, nonce: Buffer, recipient: string): Buffer {
  const str = (s: string) => {
    const b = Buffer.from(s, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32LE(b.length);
    return Buffer.concat([len, b]);
  };
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(2 ** 31 + 413);
  return Buffer.concat([tag, str(message), nonce, str(recipient), Buffer.from([0])]);
}

/** The RPC answers view_access_key_list with these keys. */
let keys: { public_key: string; access_key: { nonce: number; permission: unknown } }[] = [];

before(() => {
  globalThis.fetch = (async () => Response.json({ jsonrpc: "2.0", id: "vana", result: { keys, block_height: 1, block_hash: "x" } })) as typeof fetch;
});

function signed(recipient = RECIPIENT, key = KeyPair.fromRandom("ed25519")) {
  const c = challenge(RECIPIENT);
  const hash = createHash("sha256").update(payload(c.message, Buffer.from(c.nonce, "base64"), recipient)).digest();
  const { signature } = key.sign(hash);
  return { key, msg: { accountId: ACCOUNT, publicKey: key.getPublicKey().toString(), signature: Buffer.from(signature).toString("base64"), nonce: c.nonce } };
}

describe("NEP-413 sign-in", () => {
  beforeEach(() => {
    keys = [];
  });

  it("accepts a full-access key's signature", async () => {
    const { msg } = signed();
    keys = [{ public_key: msg.publicKey, access_key: { nonce: 0, permission: "FullAccess" } }];
    assert.equal(await verifySignIn(msg, RECIPIENT, TESTNET), ACCOUNT);
  });

  it("uses a nonce once", async () => {
    const { msg } = signed();
    keys = [{ public_key: msg.publicKey, access_key: { nonce: 0, permission: "FullAccess" } }];
    await verifySignIn(msg, RECIPIENT, TESTNET);
    await assert.rejects(verifySignIn(msg, RECIPIENT, TESTNET), SignInError);
  });

  it("rejects a nonce issued for another site", async () => {
    const { msg } = signed();
    keys = [{ public_key: msg.publicKey, access_key: { nonce: 0, permission: "FullAccess" } }];
    await assert.rejects(verifySignIn(msg, "evil.test", TESTNET), SignInError);
  });

  it("rejects a signature over another recipient", async () => {
    const { msg } = signed("evil.test");
    keys = [{ public_key: msg.publicKey, access_key: { nonce: 0, permission: "FullAccess" } }];
    await assert.rejects(verifySignIn(msg, RECIPIENT, TESTNET), /does not match/);
  });

  it("rejects a key that is not full-access", async () => {
    const { msg } = signed();
    keys = [{ public_key: msg.publicKey, access_key: { nonce: 0, permission: { FunctionCall: {} } } }];
    await assert.rejects(verifySignIn(msg, RECIPIENT, TESTNET), /not a full-access key/);
  });
});
