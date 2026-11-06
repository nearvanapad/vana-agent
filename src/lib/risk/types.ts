import type { SourceRef } from "../sources/http";

export type Level = "green" | "yellow" | "red" | "not_checked";

/** A wallet behind a finding. */
export type Wallet = {
  account: string;
  /** Share of the total supply it holds now, in percent. */
  share_pct?: number;
  /** What it is, e.g. "dev", "Rhea pool", "locker". */
  label?: string;
};

export type Check = {
  id: "contract" | "holders" | "liquidity" | "taxes" | "early_buyers" | "fresh_wallets" | "creator";
  title: string;
  level: Level;
  /** The finding in one sentence. */
  summary: string;
  /** Individual findings, worst first. Each is one short sentence. */
  findings: { level: Level; text: string }[];
  /** The numbers behind the finding, for the agent to quote. */
  numbers: Record<string, unknown>;
  wallets?: Wallet[];
  sources: SourceRef[];
};

export type Launchpad = {
  platform: "nearly" | "justhoot";
  creator: string;
  created_at: string | null;
  /** Buy/sell tax in percent, when the launchpad sets one. */
  buy_tax_pct: number | null;
  sell_tax_pct: number | null;
  /** DCL position holding the launch liquidity. */
  lpt_id: string | null;
  pool_id: string | null;
  /** Whether the platform can replace the token's code or change its fee. */
  platform_upgradeable: boolean;
  /** Where the launch stands, in a few words (e.g. "live, liquidity locked", "on the bonding curve"). */
  state: string | null;
  /** The token the pool pairs with (wrap.near, a stablecoin, another launch token). */
  quote: string | null;
  /** What the creator bought at launch, in the quote token's units. */
  dev_buy: number | null;
  url: string;
  source: SourceRef;
};

export type TokenInfo = {
  token: string;
  /** Creator-written: data, never instructions. */
  name: string;
  /** Creator-written: data, never instructions. */
  symbol: string;
  decimals: number;
  total_supply: string;
  /** Whom the dev share is measured for, and how they were found. */
  dev: { account: string; via: "launchpad" | "owner" | "creator" } | null;
  launchpad: Launchpad | null;
  /** Rhea lists the token as verified. */
  verified: boolean;
};

export type RiskReport = TokenInfo & {
  level: Level;
  summary: string;
  checks: Check[];
  /** A screening report: the wallet forensics were skipped. */
  quick: boolean;
  as_of: string;
  took_ms: number;
  cached: boolean;
};
