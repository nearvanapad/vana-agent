import { DEFAULT_WALLET, networkById } from "@/lib/near/network";
import { crossAssets } from "@/lib/swap/cross-assets";

/** What the Cross-chain swap form offers on `?network=`, grouped by chain. Public listing data; browsers keep it 5 minutes. */
export async function GET(req: Request) {
  const n = networkById(new URL(req.url).searchParams.get("network")) ?? DEFAULT_WALLET;
  const r = await crossAssets(n);
  return Response.json(r, { headers: { "cache-control": r.available ? "public, max-age=300" : "no-store" } });
}
