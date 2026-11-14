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
    assert.equal(allowToday(limits), null);
    assert.equal(allowToday(limits), null);
    assert.equal(allowToday(limits), "partner:ip:a");
    // The refused message wasn't counted: the shared key still has room.
    assert.equal(allowToday([{ key: "ip:a", cap: 3 }]), null);
    assert.equal(allowToday([{ key: "ip:a", cap: 3 }]), "ip:a");
  });

  it("keeps keys apart", () => {
    assert.equal(allowToday([{ key: "ip:b", cap: 1 }]), null);
    assert.equal(allowToday([{ key: "ip:b", cap: 1 }]), "ip:b");
    assert.equal(allowToday([{ key: "acct:b.near", cap: 1 }]), null);
  });
});
