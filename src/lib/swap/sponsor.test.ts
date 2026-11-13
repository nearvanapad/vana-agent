import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nearToYocto, readConfig, sentFeeBps, setupFeeBps, totalFeeBps, withinTotal } from "./sponsor";

const NEAR = 10n ** 24n;
const REG = 1_250_000_000_000_000_000_000n; // 0.00125 NEAR

describe("amounts of NEAR", () => {
  it("reads decimals into yocto", () => {
    assert.equal(nearToYocto("1"), NEAR);
    assert.equal(nearToYocto("0.00125"), REG);
    assert.equal(nearToYocto(" 0.5 "), NEAR / 2n);
  });
  it("refuses anything else", () => {
    for (const bad of ["", "-1", "1e3", "0.", "abc", "1.0000000000000000000000001"]) assert.equal(nearToYocto(bad), null, bad);
    assert.equal(nearToYocto(undefined), null);
  });
});

describe("the fee 1Click charges", () => {
  it("with a key: half of ours plus its own 20 under 40, ours whole from 40", () => {
    assert.equal(totalFeeBps(20, true), 30);
    assert.equal(totalFeeBps(39, true), 40);
    assert.equal(totalFeeBps(40, true), 40);
    assert.equal(totalFeeBps(100, true), 100);
  });
  it("without a key: ours plus 25", () => {
    assert.equal(totalFeeBps(20, false), 45);
  });
  it("sends enough that we keep the extra after the split", () => {
    // keyed: 1Click keeps half of what we send, so asking for 5 more to keep takes 10 more sent
    assert.equal(sentFeeBps(20, 5, true), 30);
    assert.equal(Math.ceil(30 / 2) - Math.ceil(20 / 2), 5);
    assert.equal(sentFeeBps(20, 5, false), 25);
  });
  it("refuses a quote whose total would pass 1Click's 500", () => {
    assert.equal(withinTotal(475, true), true);
    assert.equal(withinTotal(501, true), false);
    assert.equal(withinTotal(480, false), false);
  });
});

describe("the setup fee", () => {
  const near = 3; // USD
  it("covers the deposit, gas and buffer: 0.00125 NEAR at $3 on a $100 swap is a few bps", () => {
    const bps = setupFeeBps({ deposit: REG, nearUsd: near, amountUsd: 100, maxBps: 100 });
    // (0.00125 + 0.001) NEAR × 1.5 × $3 = $0.0101 of $100 → 1.01 bps, rounded up
    assert.equal(bps, 2);
  });
  it("is at least 1 bp", () => {
    assert.equal(setupFeeBps({ deposit: REG, nearUsd: near, amountUsd: 1_000_000, maxBps: 100 }), 1);
  });
  it("grows as the swap shrinks, and gives up past the cap", () => {
    const at = (usd: number) => setupFeeBps({ deposit: REG, nearUsd: near, amountUsd: usd, maxBps: 100 });
    assert.ok(at(2)! > at(10)!);
    assert.equal(at(0.5), null);
  });
  it("gives up without a price", () => {
    assert.equal(setupFeeBps({ deposit: REG, nearUsd: null, amountUsd: 10, maxBps: 100 }), null);
    assert.equal(setupFeeBps({ deposit: REG, nearUsd: 3, amountUsd: null, maxBps: 100 }), null);
    assert.equal(setupFeeBps({ deposit: REG, nearUsd: 3, amountUsd: 0, maxBps: 100 }), null);
  });
  it("costs more of a swap when the token's registration costs more", () => {
    const a = setupFeeBps({ deposit: REG, nearUsd: near, amountUsd: 20, maxBps: 100 })!;
    const b = setupFeeBps({ deposit: 4n * REG, nearUsd: near, amountUsd: 20, maxBps: 100 })!;
    assert.ok(b > a);
  });
});

describe("the sponsor config", () => {
  const key = "ed25519:abc";
  it("is off without an account and a key", () => {
    assert.equal(readConfig({}), null);
    assert.equal(readConfig({ SPONSOR_ACCOUNT_ID: "s.near" }), null);
    assert.equal(readConfig({ SPONSOR_PRIVATE_KEY: key }), null);
  });
  it("has conservative defaults", () => {
    const c = readConfig({ SPONSOR_ACCOUNT_ID: "s.near", SPONSOR_PRIVATE_KEY: key })!;
    assert.equal(c.network, "mainnet");
    assert.equal(c.maxDeposit, nearToYocto("0.01"));
    assert.equal(c.dailyMax, NEAR);
    assert.equal(c.perAccountDaily, 3);
    assert.equal(c.maxFeeBps, 100);
    assert.equal(c.tokens, null);
  });
  it("reads an allowlist and the limits", () => {
    const c = readConfig({
      SPONSOR_ACCOUNT_ID: "s.near",
      SPONSOR_PRIVATE_KEY: key,
      SPONSOR_TOKENS: "wrap.near, usdt.tether-token.near",
      SPONSOR_DAILY_MAX_NEAR: "0.25",
      SPONSOR_ACCOUNT_DAILY_MAX: "1",
    })!;
    assert.deepEqual([...c.tokens!], ["wrap.near", "usdt.tether-token.near"]);
    assert.equal(c.dailyMax, nearToYocto("0.25"));
    assert.equal(c.perAccountDaily, 1);
  });
  it("is off, not wrong, when a setting is bad", () => {
    const bad = { SPONSOR_ACCOUNT_ID: "s.near", SPONSOR_PRIVATE_KEY: key };
    assert.equal(readConfig({ ...bad, SPONSOR_MAX_DEPOSIT_NEAR: "lots" }), null);
    assert.equal(readConfig({ ...bad, SPONSOR_MAX_FEE_BPS: "9999" }), null);
  });
});
