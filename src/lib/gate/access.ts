import { networkOf } from "../near/network";
import { onNetwork } from "../near/network-server";
import { tryView } from "../near/rpc";
import { GATE_MIN, GATE_SYMBOL, GATE_TOKEN, type Access } from "./config";

/** GATE_TOKEN and GATE_MIN override the defaults on the server; GATE_MIN=0 asks only for a signed-in wallet. */
const token = process.env.GATE_TOKEN || GATE_TOKEN;
const min = process.env.GATE_MIN !== undefined && process.env.GATE_MIN !== "" ? Number(process.env.GATE_MIN) : GATE_MIN;

const TTL = 30_000;
const seen = new Map<string, { at: number; balance: number }>();
let decimals: number | null = null;

async function balanceOf(account: string): Promise<number> {
  return onNetwork(networkOf(token), async () => {
    if (decimals === null) {
      const m = await tryView<{ decimals?: number }>(token, "ft_metadata");
      if (typeof m?.decimals !== "number") throw new Error("no ft_metadata");
      decimals = m.decimals;
    }
    const raw = (await tryView<string>(token, "ft_balance_of", { account_id: account })) ?? "0";
    // Two decimal places are plenty to show; the comparison only needs whole tokens.
    return Number(BigInt(raw) / 10n ** BigInt(Math.max(0, decimals - 2))) / 100;
  });
}

/** Whether a session's account may use the chat and token checks. `fresh` skips the 30s cache. */
export async function access(account: string | null, opts: { fresh?: boolean } = {}): Promise<Access> {
  const base = { min, token, symbol: GATE_SYMBOL };
  if (!account) return { ok: false, reason: "guest", balance: null, ...base };
  // No holding needed: any signed-in wallet may chat and check tokens.
  if (!(min > 0)) return { ok: true, reason: null, balance: null, ...base };
  const hit = seen.get(account);
  let balance: number;
  if (hit && !opts.fresh && Date.now() - hit.at < TTL) balance = hit.balance;
  else {
    try {
      balance = await balanceOf(account);
    } catch (e) {
      console.error("gate balance read failed", e);
      return { ok: false, reason: "unknown", balance: null, ...base };
    }
    seen.set(account, { at: Date.now(), balance });
    if (seen.size > 5_000) seen.clear();
  }
  const ok = balance >= min;
  return { ok, reason: ok ? null : "short", balance, ...base };
}

/** The 403 a gated route answers with, in the shape the browser shows. */
export function denied(a: Access): Response {
  const error =
    a.reason === "guest"
      ? a.min > 0
        ? `Connect your wallet and sign in to use VANA. It is for holders of ${a.min.toLocaleString("en-US")} ${a.symbol} or more.`
        : "Connect your wallet and sign in to use VANA."
      : a.reason === "unknown"
        ? `Couldn't read your ${a.symbol} balance. Try again in a moment.`
        : `VANA is for holders of ${a.min.toLocaleString("en-US")} ${a.symbol} or more. This wallet holds ${(a.balance ?? 0).toLocaleString("en-US")}.`;
  return Response.json({ error, access: a }, { status: 403 });
}
