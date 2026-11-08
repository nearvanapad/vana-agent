import { DEFAULT_TIER, TIERS } from "@/lib/agent/model";

/** The model tiers the chat offers (NEAR AI Cloud only; null elsewhere) and the default one. */
export function GET() {
  return Response.json({ tiers: TIERS, default: DEFAULT_TIER }, { headers: { "cache-control": "public, max-age=300" } });
}
