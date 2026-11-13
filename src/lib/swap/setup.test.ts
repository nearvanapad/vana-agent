import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freeNear, SETUP_GAS, shortfallMessage } from "./setup";

const NEAR = 10n ** 24n;
const MIN = 1_250_000_000_000_000_000_000n; // 0.00125 NEAR, a common storage_balance_bounds.min

describe("freeNear", () => {
  it("is the balance less the storage stake", () => {
    // 182 bytes stake 0.00182 NEAR
    assert.equal(freeNear({ amount: NEAR.toString(), locked: "0", storage_usage: 182 }), NEAR - 182n * 10n ** 19n);
  });
  it("lets a locked (staked) amount cover storage", () => {
    assert.equal(freeNear({ amount: "5", locked: (10n ** 22n).toString(), storage_usage: 182 }), 5n);
  });
  it("never goes below zero", () => {
    assert.equal(freeNear({ amount: "1", locked: "0", storage_usage: 1000 }), 0n);
  });
});

describe("shortfallMessage", () => {
  it("passes an account that can pay the deposit and gas", () => {
    assert.equal(shortfallMessage(MIN + SETUP_GAS, MIN, "alice.near", "USDC"), null);
  });
  it("refuses an account just short of it", () => {
    const m = shortfallMessage(MIN + SETUP_GAS - 1n, MIN, "alice.near", "USDC");
    assert.match(m ?? "", /alice\.near has .* NEAR available/);
    assert.match(m ?? "", /about 0\.00225 NEAR/);
  });
  it("refuses an account that isn't on chain", () => {
    const m = shortfallMessage(null, MIN, "0xabc", "USDC");
    assert.match(m ?? "", /0xabc doesn't exist on NEAR yet/);
    assert.match(m ?? "", /Send at least 0\.00225 NEAR to 0xabc/);
  });
});
