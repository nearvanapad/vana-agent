import { tryView } from "../near/rpc";
import { mapLimit } from "../sources/http";
import { dcl, poolsFor, type Pool } from "../sources/rhea";
import { WNEAR } from "./assets";

/**
 * Swaps on Rhea's concentrated-liquidity (DCL) pools, for NEAR tokens NEAR Intents doesn't list
 * (fresh launches and memecoins). One pool, or two through wNEAR; the DCL's own `quote` view
 * prices each path, fees included.
 */

export type RheaRoute = { pool_ids: string[]; amount_out: bigint };

const running = (p: Pool) => p.kind === "dcl" && (!p.state || p.state === "Running");

async function dclPools(token: string): Promise<Pool[]> {
  const r = await poolsFor(token).catch(() => null);
  return (r?.data ?? []).filter(running);
}

/** Output of `amount` through `pool_ids`, or null when the path can't fill it. */
export async function quotePath(pool_ids: string[], input: string, output: string, amount: bigint): Promise<bigint | null> {
  const r = await tryView<{ amount: string }>(dcl(), "quote", {
    pool_ids,
    input_token: input,
    output_token: output,
    input_amount: amount.toString(),
    tag: null,
  }).catch(() => null);
  const out = r ? BigInt(r.amount) : 0n;
  return out > 0n ? out : null;
}

/** The path that gives the most `output` for `amount` of `input`, or null when there is none. */
export async function bestRoute(input: string, output: string, amount: bigint): Promise<RheaRoute | null> {
  const [ins, outs] = await Promise.all([dclPools(input), dclPools(output)]);
  const paths: string[][] = ins.filter((p) => p.tokens.includes(output)).map((p) => [p.id]);
  if (input !== WNEAR && output !== WNEAR) {
    const first = ins.filter((p) => p.tokens.includes(WNEAR)).slice(0, 4);
    const second = outs.filter((p) => p.tokens.includes(WNEAR)).slice(0, 4);
    for (const a of first) for (const b of second) paths.push([a.id, b.id]);
  }
  if (!paths.length) return null;
  const quoted = await mapLimit(paths.slice(0, 12), 4, async (pool_ids) => ({ pool_ids, out: await quotePath(pool_ids, input, output, amount) }));
  const best = quoted.filter((q) => q.out !== null).sort((a, b) => (b.out! > a.out! ? 1 : b.out! < a.out! ? -1 : 0))[0];
  return best ? { pool_ids: best.pool_ids, amount_out: best.out! } : null;
}

/** The DCL swap message carried by `ft_transfer_call`. */
export const swapMsg = (pool_ids: string[], output: string, minOut: bigint) =>
  JSON.stringify({ Swap: { pool_ids, output_token: output, min_output_amount: minOut.toString() } });
