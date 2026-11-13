import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { call, oneActionEach, outcomesPerTx, type WalletTx } from "./tx";

const reg = call("storage_deposit", {}, 10, "1");
const wrap = call("near_deposit", {}, 10, "5");
const pay = call("ft_transfer_call", {}, 180, "1");

// register on the token received, then wrap + transfer on wrap.near
const txs: WalletTx[] = [
  { receiverId: "token.testnet", actions: [reg] },
  { receiverId: "wrap.testnet", actions: [reg, wrap, pay] },
];

type O = { id: string; ok: boolean };
const failed = (o: O) => !o.ok;

describe("one action per transaction", () => {
  it("splits in order, keeping receivers", () => {
    const { parts, owner } = oneActionEach(txs);
    assert.deepEqual(
      parts.map((p) => [p.receiverId, p.actions.length, p.actions[0]!.params.methodName]),
      [
        ["token.testnet", 1, "storage_deposit"],
        ["wrap.testnet", 1, "storage_deposit"],
        ["wrap.testnet", 1, "near_deposit"],
        ["wrap.testnet", 1, "ft_transfer_call"],
      ],
    );
    assert.deepEqual(owner, [0, 1, 1, 1]);
  });

  it("maps all-good outcomes back to one per transaction", () => {
    const { owner } = oneActionEach(txs);
    const outs = ["a", "b", "c", "d"].map((id) => ({ id, ok: true }));
    assert.deepEqual(
      outcomesPerTx(owner, outs, failed).map((o) => o.id),
      ["a", "d"],
    );
  });

  it("stops at a failed part and reports it as that transaction's outcome", () => {
    const { owner } = oneActionEach(txs);
    const outs = [
      { id: "a", ok: true },
      { id: "b", ok: true },
      { id: "c", ok: false },
    ];
    const r = outcomesPerTx(owner, outs, failed);
    assert.deepEqual(
      r.map((o) => o.id),
      ["a", "c"],
    );
    assert.equal(failed(r[r.length - 1]!), true);
  });

  it("leaves out a transaction whose parts did not all run", () => {
    const { owner } = oneActionEach(txs);
    const outs = [
      { id: "a", ok: true },
      { id: "b", ok: true },
    ];
    assert.equal(outcomesPerTx(owner, outs, failed).length, 1);
  });
});
