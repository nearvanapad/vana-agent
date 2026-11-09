import { DEFAULT_WALLET, networkById } from "@/lib/near/network";
import { swapTokens } from "@/lib/swap/tokens";

/**
 * The tokens the swap form offers on `?network=` (mainnet or testnet). Public chain data, so no
 * session; the network is in the URL so browsers keep each list apart, for 5 minutes.
 */
export async function GET(req: Request) {
  const n = networkById(new URL(req.url).searchParams.get("network")) ?? DEFAULT_WALLET;
  try {
    return Response.json(await swapTokens(n), { headers: { "cache-control": "public, max-age=300" } });
  } catch {
    return Response.json({ error: "The token list can't be built right now." }, { status: 503 });
  }
}
