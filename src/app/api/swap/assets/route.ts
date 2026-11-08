import { crossAssets } from "@/lib/swap/cross-assets";

/** What the Cross-chain swap form offers, grouped by chain. Public listing data; browsers keep it 5 minutes. */
export async function GET() {
  const r = await crossAssets();
  return Response.json(r, { headers: { "cache-control": r.available ? "public, max-age=300" : "no-store" } });
}
