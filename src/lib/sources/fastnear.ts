import { getJson, sourced, type Sourced } from "./http";
import type { Holder } from "./nearblocks";

const API = "https://api.fastnear.com/v1";

function headers(): Record<string, string> {
  const key = process.env.FASTNEAR_API_KEY;
  return key ? { authorization: `Bearer ${key}` } : {};
}

/** Top 100 holders of a token, raw amounts, largest first. */
export async function topHolders(token: string): Promise<Sourced<Holder[]>> {
  const url = `${API}/ft/${encodeURIComponent(token)}/top`;
  const r = await getJson<{ accounts: { account_id: string; balance: string }[] }>(url, { headers: headers() });
  const list = r.accounts
    .map((a) => ({ account: a.account_id, amount: a.balance }))
    .filter((h) => BigInt(h.amount) > 0n)
    .sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1));
  return sourced(list, "FastNEAR", `https://nearblocks.io/token/${token}?tab=holders`);
}
