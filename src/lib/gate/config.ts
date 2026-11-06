/**
 * Chat with VANA and token checks are for NVANA holders: a signed-in wallet holding at least
 * `min` of `token`. Swaps stay open to everyone. Shared by the server and the browser.
 */
export const GATE_TOKEN = "nvana.nearvana2.nearvanapad.testnet";
export const GATE_SYMBOL = "NVANA";
export const GATE_MIN = 500_000;

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
