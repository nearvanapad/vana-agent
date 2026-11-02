import { getJson, sourced, type Sourced } from "./http";

const API = "https://api.nearblocks.io/v1";
const SITE = "https://nearblocks.io";

function headers(): Record<string, string> {
  const key = process.env.NEARBLOCKS_API_KEY;
  return key ? { authorization: `Bearer ${key}` } : {};
}

const get = <T>(path: string) => getJson<T>(`${API}${path}`, { headers: headers() });

export type Holder = { account: string; amount: string };

/** Largest holders, raw amounts. Up to 25 per page. */
export async function holders(token: string, perPage = 25): Promise<Sourced<Holder[]>> {
  const r = await get<{ holders: { account: string; amount: string }[] }>(
    `/fts/${encodeURIComponent(token)}/holders?page=1&per_page=${perPage}`,
  );
  return sourced(
    r.holders.map((h) => ({ account: h.account, amount: String(h.amount) })),
    "NearBlocks",
    `${SITE}/token/${token}?tab=holders`,
  );
}

export async function holderCount(token: string): Promise<Sourced<number>> {
  const r = await get<{ holders: { count: string }[] }>(`/fts/${encodeURIComponent(token)}/holders/count`);
  return sourced(Number(r.holders[0]?.count ?? 0), "NearBlocks", `${SITE}/token/${token}?tab=holders`);
}

export type AccountOrigin = {
  /** Who signed the transaction that created the account: its parent or funder. */
  creator: string | null;
  created_at: string | null;
  tx: string | null;
};

/** Who created an account and when, from its first transaction. */
export async function accountOrigin(account: string): Promise<Sourced<AccountOrigin>> {
  const r = await get<{
    txns: { signer_account_id: string; transaction_hash: string; block_timestamp: string }[];
  }>(`/account/${encodeURIComponent(account)}/txns-only?per_page=1&order=asc`);
  const t = r.txns[0];
  return sourced(
    {
      creator: t?.signer_account_id ?? null,
      created_at: t ? new Date(Number(BigInt(t.block_timestamp) / 1_000_000n)).toISOString() : null,
      tx: t?.transaction_hash ?? null,
    },
    "NearBlocks",
    t ? `${SITE}/txns/${t.transaction_hash}` : `${SITE}/address/${account}`,
  );
}
