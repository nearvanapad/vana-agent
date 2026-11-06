import { getDb } from "../db";
import { EXPLORER_ACCOUNT, YOCTO } from "../near/config";
import { contractHash, RpcError, viewAccessKeys, viewAccount } from "../near/rpc";
import { infraLabel } from "../risk/holders";
import { ageDays, origin, originSource } from "../risk/wallets";
import { FRESH_MAX_AGE_DAYS, SNIPER_LAUNCHES, units } from "../risk/rules";
import * as fastnear from "../sources/fastnear";
import { ref, type SourceRef } from "../sources/http";
import { prices } from "../sources/rhea";
import { stranger } from "./guard";

export class AccountNotFound extends Error {
  constructor(readonly account: string) {
    super(`${account} does not exist on NEAR mainnet`);
    this.name = "AccountNotFound";
  }
}

export type WalletProfile = {
  account: string;
  label: string | null;
  near_balance: number;
  is_contract: boolean;
  full_access_keys: number;
  limited_keys: number;
  created_by: string | null;
  created_at: string | null;
  age_days: number | null;
  /** Younger than the fresh-wallet limit. */
  fresh: boolean | null;
  /** Tokens it holds with a Rhea price, largest dollar value first (top 10). */
  holdings: { token: string; symbol: string; amount: number; usd: number }[];
  holdings_usd: number;
  /** Tokens it holds that Rhea has no price for. */
  unpriced_tokens: number;
  /** Launches this app has seen it buy among the first wallets, and whether that makes it a sniper. */
  early_buyer_in: number;
  sniper: boolean;
  sources: SourceRef[];
};

/** Who an account is: balance, keys, age, who created it and what it holds. */
export async function walletProfile(account: string): Promise<WalletProfile> {
  const acc = await viewAccount(account).catch((e) => {
    if (e instanceof RpcError && e.kind === "UNKNOWN_ACCOUNT") throw new AccountNotFound(account);
    throw e;
  });
  const [keys, o, tokens, px] = await Promise.all([
    viewAccessKeys(account),
    origin(account).catch(() => null),
    fastnear.accountTokens(account).catch(() => null),
    prices().catch(() => null),
  ]);

  const early = (
    getDb().prepare("SELECT COUNT(*) AS n FROM early_buys WHERE account = ?").get(account) as { n: number }
  ).n;
  const full = keys.filter((k) => k.access_key.permission === "FullAccess").length;
  const age = ageDays(o);

  const holdings: WalletProfile["holdings"] = [];
  let unpriced = 0;
  for (const t of tokens?.data ?? []) {
    const p = px?.data.get(t.token);
    if (!p) {
      unpriced++;
      continue;
    }
    const amount = units(t.amount, p.decimals);
    holdings.push({ token: t.token, symbol: stranger(p.symbol, 16), amount: round(amount), usd: round(amount * p.price) });
  }
  holdings.sort((a, b) => b.usd - a.usd);

  const sources: SourceRef[] = [ref("NEAR RPC", `${EXPLORER_ACCOUNT}${account}`)];
  if (o?.tx) sources.push(originSource(o));
  if (tokens) sources.push(ref(tokens.source, tokens.url, new Date(tokens.as_of)));
  if (px && holdings.length) sources.push(ref(px.source, px.url, new Date(px.as_of)));

  return {
    account,
    label: infraLabel(account),
    near_balance: round(Number(BigInt(acc.amount) * 10_000n / YOCTO) / 10_000),
    is_contract: contractHash(acc) !== null,
    full_access_keys: full,
    limited_keys: keys.length - full,
    created_by: o?.funder ?? null,
    created_at: o?.created_at ?? null,
    age_days: age === null ? null : Math.floor(age),
    fresh: age === null ? null : age < FRESH_MAX_AGE_DAYS,
    holdings: holdings.slice(0, 10),
    holdings_usd: round(holdings.reduce((s, h) => s + h.usd, 0)),
    unpriced_tokens: unpriced,
    early_buyer_in: early,
    sniper: early >= SNIPER_LAUNCHES,
    sources,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
