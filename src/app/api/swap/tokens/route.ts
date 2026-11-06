import { swapTokens } from "@/lib/swap/tokens";

/** The tokens the swap form offers. Public chain data, so no session; browsers keep it 5 minutes. */
export async function GET() {
  try {
    return Response.json(await swapTokens(), { headers: { "cache-control": "public, max-age=300" } });
  } catch {
    return Response.json({ error: "The token list can't be built right now." }, { status: 503 });
  }
}
