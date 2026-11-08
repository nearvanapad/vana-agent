import { DEFAULT_TIER, TIERS } from "@/lib/agent/model";
import { WEB_SEARCH } from "@/lib/risk/web";

/** The model tiers the chat offers (NEAR AI Cloud only; null elsewhere), the default one, and whether checks can search the web. */
export function GET() {
  return Response.json({ tiers: TIERS, default: DEFAULT_TIER, webSearch: WEB_SEARCH }, { headers: { "cache-control": "public, max-age=300" } });
}
