/**
 * Probe the NEAR Intents upstreams: what a user pays on each, and whether every cross-chain pair
 * quotes with the stand-in addresses used for guest quotes.
 *   pnpm probe:intents
 * Reads ONECLICK_JWT, INTENTS_FEE_RECIPIENT and AURORA_INTENTS_KEY from the env when set; a variant
 * whose key is missing is skipped. Only dry quotes: no deposit address is opened.
 */
import { chainName, dryAddress, SWAP_CHAINS } from "../src/lib/swap/chains";

const ONECLICK = (process.env.ONECLICK_URL ?? "https://1click.chaindefuser.com").replace(/\/$/, "");
const AURORA = (process.env.AURORA_INTENTS_URL ?? "https://intents-api.aurora.dev").replace(/\/$/, "");
const JWT = process.env.ONECLICK_JWT;
const AURORA_KEY = process.env.AURORA_INTENTS_KEY;
const FEE_TO = process.env.INTENTS_FEE_RECIPIENT || "intents.near";

type Quote = { quote: { amountInUsd?: string; amountOutUsd?: string; amountOutFormatted: string }; quoteRequest: { appFees?: { fee: number }[] } };

const body = (origin: string, dest: string, amount: string, refundTo: string, recipient: string, extra: object = {}) => ({
  dry: true,
  swapType: "EXACT_INPUT",
  slippageTolerance: 100,
  originAsset: origin,
  depositType: "ORIGIN_CHAIN",
  depositMode: "SIMPLE",
  destinationAsset: dest,
  amount,
  refundTo,
  refundType: "ORIGIN_CHAIN",
  recipient,
  recipientType: "DESTINATION_CHAIN",
  deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
  ...extra,
});

async function quote(url: string, b: object, headers: Record<string, string> = {}): Promise<{ status: number; json: Quote | { message?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(b) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Quote };
}

function line(label: string, r: { status: number; json: Quote | { message?: string } }) {
  if (!("quote" in r.json)) return console.log(`  ${label.padEnd(34)} ${r.status} ${(r.json as { message?: string }).message ?? ""}`);
  const q = r.json;
  const usdIn = Number(q.quote.amountInUsd);
  const usdOut = Number(q.quote.amountOutUsd);
  const cost = usdIn ? ((1 - usdOut / usdIn) * 100).toFixed(3) : "?";
  const fees = (q.quoteRequest.appFees ?? []).map((f) => `${f.fee} bps`).join(" + ") || "none";
  console.log(`  ${label.padEnd(34)} ${r.status} out ${q.quote.amountOutFormatted.padEnd(12)} cost ${cost}%  appFees: ${fees}`);
}

// ─── What the user pays, per upstream and fee setting ──────────────────────
const USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const pair = body("nep141:wrap.near", USDC_NEAR, (100n * 10n ** 24n).toString(), "intents.near", "intents.near");
const fee20 = { appFees: [{ recipient: FEE_TO, fee: 20 }] };

console.log("\n=== 100 NEAR → USDC (cost = 1 − USD out / USD in, includes the solver spread)");
line("1Click, no key", await quote(`${ONECLICK}/v0/quote`, pair));
line("1Click, no key, appFees 20", await quote(`${ONECLICK}/v0/quote`, { ...pair, ...fee20 }));
if (JWT) {
  const auth = { authorization: `Bearer ${JWT}` };
  line("1Click, JWT", await quote(`${ONECLICK}/v0/quote`, pair, auth));
  line("1Click, JWT, appFees 20", await quote(`${ONECLICK}/v0/quote`, { ...pair, ...fee20 }, auth));
} else console.log("  (ONECLICK_JWT not set: JWT variants skipped)");
if (AURORA_KEY) {
  line("Aurora (fee from its portal)", await quote(`${AURORA}/api/quote/${encodeURIComponent(AURORA_KEY)}`, pair));
  const tokens = await fetch(`${AURORA}/api/tokens/${encodeURIComponent(AURORA_KEY)}`).then((r) => r.json() as Promise<{ tokens?: { blockchain: string }[] }>);
  const chains = [...new Set((tokens.tokens ?? []).map((t) => t.blockchain))].sort();
  console.log(`  Aurora tokens: ${tokens.tokens?.length ?? 0} on ${chains.join(", ")}`);
} else console.log("  (AURORA_INTENTS_KEY not set: Aurora skipped)");

// ─── Cross-chain pairs with the guest stand-in addresses ───────────────────
console.log("\n=== Cross-chain dry quotes (about $25 each way, stand-in addresses)");
const list = (await fetch(`${ONECLICK}/v0/tokens`).then((r) => r.json())) as { assetId: string; blockchain: string; symbol: string; decimals: number; price: number }[];
for (const chain of SWAP_CHAINS.filter((c) => c !== "near")) {
  const a = list.find((t) => t.blockchain === chain && /^USDC$/i.test(t.symbol)) ?? list.find((t) => t.blockchain === chain && t.price > 0);
  const addr = dryAddress(chain);
  if (!a || !addr) {
    console.log(`  ${chainName(chain).padEnd(10)} no asset or stand-in`);
    continue;
  }
  const raw = BigInt(Math.round((25 / a.price) * 10 ** Math.min(a.decimals, 12))) * 10n ** BigInt(Math.max(0, a.decimals - 12));
  const inn = await quote(`${ONECLICK}/v0/quote`, body(a.assetId, "nep141:wrap.near", raw.toString(), addr, "intents.near"));
  const out = await quote(`${ONECLICK}/v0/quote`, body("nep141:wrap.near", a.assetId, (10n * 10n ** 24n).toString(), "intents.near", addr));
  const word = (r: { status: number; json: object }) => ("quote" in r.json ? "ok" : `${r.status} ${(r.json as { message?: string }).message ?? ""}`);
  console.log(`  ${chainName(chain).padEnd(10)} ${a.symbol.padEnd(5)} in: ${word(inn).padEnd(30)} out: ${word(out)}`);
}
