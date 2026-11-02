import { tryView } from "../near/rpc";
import { normalizeToken } from "../risk/report";
import { ref, type SourceRef } from "../sources/http";
import { swapAssets } from "../sources/oneclick";
import { poolCount, prices, whitelist } from "../sources/rhea";
import { stranger } from "./guard";

export type TokenMatch = {
  token: string;
  /** Creator-written. */
  symbol: string;
  price_usd: number | null;
  /** Rhea lists it as verified. */
  verified: boolean;
  /** Live Rhea pools holding it. */
  pools: number | null;
  /** NEAR Intents can swap it. */
  intents: boolean;
};

/** Account ids a short name is often deployed under. */
const GUESSES = (q: string) => [q, `${q}.near`, `${q}.tkn.near`, `${q}.nearlytrade.near`];

/**
 * Token contracts matching a symbol, name or account id. Many tokens share a symbol, so all
 * candidates are returned, verified and well-pooled ones first, for the user to pick from.
 */
export async function searchToken(query: string): Promise<{ query: string; matches: TokenMatch[]; sources: SourceRef[] }> {
  const q = query.trim().replace(/^\$/, "").toLowerCase();
  const [px, verified, assets] = await Promise.all([
    prices().catch(() => null),
    whitelist().catch(() => new Set<string>()),
    swapAssets().catch(() => null),
  ]);
  const sources: SourceRef[] = [];
  if (px) sources.push(ref(px.source, px.url, new Date(px.as_of)));
  if (assets) sources.push(ref(assets.source, assets.url, new Date(assets.as_of)));

  const nearAssets = new Set(
    (assets?.data ?? []).filter((a) => a.assetId.startsWith("nep141:")).map((a) => a.assetId.slice("nep141:".length)),
  );

  const scored = new Map<string, { score: number; symbol: string; price: number | null }>();
  const consider = (token: string, symbol: string, price: number | null, score: number) => {
    const prev = scored.get(token);
    if (!prev || prev.score < score) scored.set(token, { score, symbol, price });
  };

  for (const [token, p] of px?.data ?? []) {
    const sym = p.symbol.toLowerCase();
    if (token === q) consider(token, p.symbol, p.price, 5);
    else if (sym === q) consider(token, p.symbol, p.price, 4);
    else if (q.length >= 2 && sym.startsWith(q)) consider(token, p.symbol, p.price, 2);
    else if (q.length >= 3 && (sym.includes(q) || token.split(".")[0] === q)) consider(token, p.symbol, p.price, 1);
  }
  for (const a of assets?.data ?? []) {
    if (!a.assetId.startsWith("nep141:")) continue;
    const token = a.assetId.slice("nep141:".length);
    if (a.symbol.toLowerCase() === q) consider(token, a.symbol, a.price, 4);
  }

  // Unlisted tokens (fresh launches) don't appear in any list: try the account ids it may live at.
  let ids: string[] = [];
  try {
    ids = GUESSES(normalizeToken(q));
  } catch {
    /* not an account-shaped query */
  }
  const found = await Promise.all(
    ids.filter((id) => !scored.has(id)).map(async (id) => {
      const m = await tryView<{ symbol: string }>(id, "ft_metadata").catch(() => null);
      return m ? { id, symbol: String(m.symbol ?? "") } : null;
    }),
  );
  for (const f of found) if (f) consider(f.id, f.symbol, null, f.id === q ? 5 : 3);

  const top = [...scored.entries()]
    .sort(([a, x], [b, y]) => y.score - x.score || Number(verified.has(b)) - Number(verified.has(a)) || (y.price ?? 0) - (x.price ?? 0))
    .slice(0, 12);
  const withPools = await Promise.all(top.map(async ([token, m]) => ({ token, m, pools: await poolCount(token) })));
  const matches = withPools
    .map(({ token, m, pools }) => ({
      token,
      symbol: stranger(m.symbol, 16),
      price_usd: m.price,
      verified: verified.has(token),
      pools,
      intents: nearAssets.has(token),
      score: m.score,
    }))
    .sort((a, b) => b.score - a.score || Number(b.verified) - Number(a.verified) || (b.pools ?? 0) - (a.pools ?? 0))
    .slice(0, 8)
    .map(({ score: _score, ...m }) => m);
  return { query, matches, sources };
}
