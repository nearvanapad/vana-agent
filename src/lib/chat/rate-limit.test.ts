import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

// A throwaway database, set before anything opens one.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "vana-test-")), "test.db");

const { allowToday } = await import("./rate-limit");

describe("allowToday", () => {
  it("counts every key until one is full, then counts nothing", () => {
    const limits = [
      { key: "ip:a", cap: 3 },
      { key: "partner:ip:a", cap: 2 },
    ];
    assert.deepEqual(allowToday(limits), { full: null, left: { key: "partner:ip:a", n: 1 } });
    assert.deepEqual(allowToday(limits), { full: null, left: { key: "partner:ip:a", n: 0 } });
    assert.deepEqual(allowToday(limits), { full: "partner:ip:a", left: null });
    // The refused message wasn't counted: the shared key still has room.
    assert.deepEqual(allowToday([{ key: "ip:a", cap: 3 }]), { full: null, left: { key: "ip:a", n: 0 } });
    assert.equal(allowToday([{ key: "ip:a", cap: 3 }]).full, "ip:a");
  });

  it("keeps keys apart and reports the tightest", () => {
    assert.equal(allowToday([{ key: "ip:b", cap: 1 }]).full, null);
    assert.equal(allowToday([{ key: "ip:b", cap: 1 }]).full, "ip:b");
    assert.deepEqual(allowToday([{ key: "acct:b.near", cap: 5 }, { key: "ip:c", cap: 2 }]).left, { key: "ip:c", n: 1 });
  });
});
