/**
 * Chat with VANA and token checks need a signed-in wallet, holding at least `min` of `token` when
 * `min` is above 0 (GATE_MIN on the server; 0 for now, so no NVANA is needed). Swaps stay open to
 * everyone. Shared by the server and the browser.
 */
export const GATE_TOKEN = "nvana.nearvana2.nearvanapad.testnet";
export const GATE_SYMBOL = "NVANA";
/** No NVANA needed for now: a signed-in wallet is enough. */
export const GATE_MIN = 0;
/** What holders will need once the gate is back on (GATE_MIN=500000 on the server). */
export const GATE_LATER = 500_000;

export type Access = {
  ok: boolean;
  /** Why not: no signed-in wallet, too little NVANA, or the balance could not be read. */
  reason: "guest" | "short" | "unknown" | null;
  /** Whole tokens the account holds; null when unknown. */
  balance: number | null;
  min: number;
  token: string;
  symbol: string;
};
