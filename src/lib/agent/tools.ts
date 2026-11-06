import { tool, type InferUITools } from "ai";
import { z } from "zod";
import { riskReport } from "../risk/report";
import { units } from "../risk/rules";
import type { Check, RiskReport } from "../risk/types";
import { ref, refOf } from "../sources/http";
import { swapAssets } from "../sources/oneclick";
import { prices } from "../sources/rhea";
import { proposeSwap, quoteSwap, type Proposal, type SwapQuote } from "../swap/service";
import { stranger, type Guard } from "./guard";
import { walletProfile } from "./profile";
import { searchToken } from "./search";

/**
 * Read-only tools. None of them can sign, send or move anything. Every result carries the
 * sources (name, link, time read) behind its numbers so the answer can cite them.
 */

const tokenArg = z
  .string()
  .min(2)
  .max(80)
  .describe("Token contract account id, e.g. usdt.tether-token.near or token.sweat. Not a symbol: use search_token for symbols.");

const accountArg = z.string().min(2).max(64).describe("NEAR account id, e.g. alice.near or a 64-char implicit account.");

/** The report as the model and the risk card see it: creator text made safe, bulky raw numbers dropped. */
export function reportView(r: RiskReport) {
  return {
    token: r.token,
    name: stranger(r.name),
    symbol: stranger(r.symbol, 16),
    level: r.level,
    summary: r.summary,
    verified: r.verified,
    dev: r.dev,
    launchpad: r.launchpad && {
      platform: r.launchpad.platform,
      creator: r.launchpad.creator,
      created_at: r.launchpad.created_at,
      url: r.launchpad.url,
    },
    checks: r.checks.map(checkView),
    as_of: r.as_of,
    cached: r.cached,
  };
}
export type ReportView = ReturnType<typeof reportView>;

function checkView(c: Check) {
  return { ...c, wallets: c.wallets?.slice(0, 10) };
}

/** Marks the request as having read creator-written text unless the token is verified. */
function readStranger(guard: Guard, r: RiskReport) {
  if (!r.verified && (r.name || r.symbol)) guard.taint(`the creator-written name of ${r.token}`);
}

const swapArgs = z.object({
  from: z.string().min(2).max(120).describe('What the user pays with, on NEAR: "NEAR", or a token contract id (e.g. usdt.tether-token.near).'),
  to: z
    .string()
    .min(2)
    .max(120)
    .describe('What the user receives: "NEAR", a NEAR token contract id, or a NEAR Intents asset_id from list_swap_assets for assets on other chains.'),
  amount: z.string().min(1).max(40).describe('Amount of `from` in normal units, e.g. "10" or "0.5". Never raw units.'),
  slippage_pct: z.number().min(0.1).max(5).optional().describe("Max price slippage in percent. Default 1."),
  recipient: z.string().max(128).optional().describe("Only when `to` is on another chain: the user's address there. Never make one up."),
});

export type ToolContext = { account: string | null; conversationId: string | null };

export function buildTools(guard: Guard, ctx: ToolContext) {
  return {
    quote_swap: tool({
      description:
        "Price a swap without committing to anything: route (NEAR Intents or a Rhea pool), amount out, minimum after slippage, fees. Read-only; works for guests.",
      inputSchema: swapArgs,
      execute: async (args): Promise<SwapQuote> => quoteSwap(args, ctx.account),
    }),

    propose_swap: tool({
      description:
        "Show the user a swap approval card for their wallet. Runs the risk check on the token bought and re-checks the balance. The user approves and signs in their wallet; you never sign. Only after the user clearly asked to swap these exact assets and amount.",
      inputSchema: swapArgs,
      execute: async (args): Promise<Proposal> => {
        guard.assertAction("propose_swap");
        if (!ctx.account) throw new Error("The user must connect and sign in with their wallet before a swap can be proposed.");
        return proposeSwap(args, ctx.account, ctx.conversationId);
      },
    }),

    risk_report: tool({
      description:
        "Full risk check of a NEAR token: contract powers and keys, holder concentration and dev share, Rhea liquidity and who can pull it, and taxes. Each check is green, yellow, red or not_checked, with numbers and sources. The UI shows it as a card. Use this for any 'is X safe' question.",
      inputSchema: z.object({
        token: tokenArg,
        fresh: z.boolean().optional().describe("Skip the 5-minute cache. Only when the user asks for fresh data."),
      }),
      execute: async ({ token, fresh }) => {
        const r = await riskReport(token, { fresh });
        readStranger(guard, r);
        return reportView(r);
      },
    }),

    token_overview: tool({
      description: "Basic facts about a token: name, symbol, supply, price, market cap, verified status, launchpad, dev, and the overall risk level.",
      inputSchema: z.object({ token: tokenArg }),
      execute: async ({ token }) => {
        const r = await riskReport(token);
        readStranger(guard, r);
        const px = await prices().catch(() => null);
        const price = px?.data.get(r.token)?.price ?? null;
        const supply = units(r.total_supply, r.decimals);
        const liq = r.checks.find((c) => c.id === "liquidity");
        const hold = r.checks.find((c) => c.id === "holders");
        return {
          token: r.token,
          name: stranger(r.name),
          symbol: stranger(r.symbol, 16),
          decimals: r.decimals,
          total_supply: supply,
          price_usd: price,
          market_cap_usd: price === null ? null : Math.round(supply * price),
          verified: r.verified,
          launchpad: r.launchpad && { platform: r.launchpad.platform, creator: r.launchpad.creator, created_at: r.launchpad.created_at, url: r.launchpad.url },
          dev: r.dev,
          risk_level: r.level,
          risk_summary: r.summary,
          liquidity_usd: liq?.numbers.depth_usd ?? null,
          top10_pct: hold?.numbers.top10_pct ?? null,
          holder_count: hold?.numbers.holder_count ?? null,
          sources: [
            ref("NEAR RPC", `https://nearblocks.io/token/${r.token}`, new Date(r.as_of)),
            ...(px && price !== null ? [refOf(px)] : []),
          ],
          as_of: r.as_of,
        };
      },
    }),

    holders: tool({
      description: "Who holds a token: top-10 share without pools, lockers and burns, the dev's share, single whales, and the top wallets.",
      inputSchema: z.object({ token: tokenArg }),
      execute: async ({ token }) => {
        const r = await riskReport(token);
        return { token: r.token, symbol: stranger(r.symbol, 16), dev: r.dev, ...checkView(r.checks.find((c) => c.id === "holders")!) };
      },
    }),

    liquidity: tool({
      description: "Where a token trades on Rhea: pools, dollar depth, the deepest pools, and whether the dev or a keyed account can pull the liquidity.",
      inputSchema: z.object({ token: tokenArg }),
      execute: async ({ token }) => {
        const r = await riskReport(token);
        return { token: r.token, symbol: stranger(r.symbol, 16), ...checkView(r.checks.find((c) => c.id === "liquidity")!) };
      },
    }),

    dev_profile: tool({
      description:
        "Who is behind a token: finds its dev (launchpad creator, contract owner or account creator) and profiles that account: age, who created it, keys, NEAR balance, holdings, and how much of the token it holds.",
      inputSchema: z.object({ token: tokenArg }),
      execute: async ({ token }) => {
        const r = await riskReport(token);
        readStranger(guard, r);
        if (!r.dev) return { token: r.token, dev: null, note: "No dev found: no launchpad record, no owner view, and the account creator is unknown." };
        const p = await walletProfile(r.dev.account);
        if (p.holdings.length) guard.taint("token symbols in a wallet");
        const hold = r.checks.find((c) => c.id === "holders");
        return { token: r.token, symbol: stranger(r.symbol, 16), dev: r.dev, dev_share_pct: hold?.numbers.dev_pct ?? null, profile: p };
      },
    }),

    wallet_profile: tool({
      description: "Profile any NEAR account: age, who created it, fresh-wallet flag, keys, contract or not, NEAR balance and its largest token holdings in dollars.",
      inputSchema: z.object({ account: accountArg }),
      execute: async ({ account }) => {
        const p = await walletProfile(account.trim().toLowerCase());
        if (p.holdings.length) guard.taint("token symbols in a wallet");
        return p;
      },
    }),

    search_token: tool({
      description:
        "Find token contracts by symbol or name (e.g. 'USDC', 'sweat', 'xrpx'). Many tokens share a symbol, so it returns every candidate with price, verified flag, pool count and whether NEAR Intents can swap it. Show the user the candidates when more than one fits.",
      inputSchema: z.object({ query: z.string().min(1).max(64) }),
      execute: async ({ query }) => {
        const r = await searchToken(query);
        if (r.matches.some((m) => !m.verified)) guard.taint("creator-written token symbols");
        return r;
      },
    }),

    list_swap_assets: tool({
      description: "Assets NEAR Intents (1Click) can swap, optionally filtered by chain (near, eth, sol, btc, …) or symbol.",
      inputSchema: z.object({
        chain: z.string().max(20).optional(),
        symbol: z.string().max(20).optional(),
      }),
      execute: async ({ chain, symbol }) => {
        const r = await swapAssets().catch((e: unknown) => e as Error);
        if (r instanceof Error) {
          return { available: false, reason: `NEAR Intents is unreachable right now (${r.message}).`, assets: [] };
        }
        const list = r.data.filter(
          (a) => (!chain || a.blockchain.toLowerCase() === chain.toLowerCase()) && (!symbol || a.symbol.toLowerCase() === symbol.toLowerCase()),
        );
        return {
          available: true,
          total: list.length,
          assets: list.slice(0, 60).map((a) => ({ symbol: a.symbol, chain: a.blockchain, asset_id: a.assetId, price_usd: a.price })),
          source: refOf(r),
        };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof buildTools>;
export type AgentUITools = InferUITools<AgentTools>;
