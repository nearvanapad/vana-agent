import { RPC_URL } from "./config";

/**
 * Minimal NEAR JSON-RPC client over fetch. Works on the server and in the browser.
 * Retries rate limits and gateway errors with backoff; anything else fails fast.
 */

export class RpcError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    /** RPC error name, e.g. UNKNOWN_ACCOUNT, NO_CONTRACT_CODE, MethodNotFound. */
    readonly kind?: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Finality = { finality: "final" | "optimistic" } | { block_id: number | string };

export async function rpc<T>(method: string, params: unknown, opts: { url?: string; attempts?: number } = {}): Promise<T> {
  const url = opts.url ?? RPC_URL;
  const attempts = opts.attempts ?? 4;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(250 * 2 ** (i - 1) + Math.random() * 150);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "vana", method, params }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      last = e;
      continue;
    }
    if (RETRY_STATUS.has(res.status)) {
      last = new RpcError(`RPC ${res.status}`);
      continue;
    }
    const body = (await res.json().catch(() => null)) as
      | { result?: T & { error?: string }; error?: { name?: string; cause?: { name?: string; info?: unknown }; data?: unknown; message?: string } }
      | null;
    if (!body) throw new RpcError(`RPC ${res.status}: bad JSON`);
    if (body.error) {
      const kind = body.error.cause?.name ?? body.error.name;
      throw new RpcError(String(body.error.data ?? body.error.message ?? kind), body.error, kind);
    }
    // query errors (e.g. a view that panics) come back inside result.error
    const result = body.result as T & { error?: string };
    if (result && typeof result === "object" && typeof result.error === "string") {
      throw new RpcError(result.error, result, classifyQueryError(result.error));
    }
    return result as T;
  }
  throw new RpcError(`RPC failed after ${attempts} attempts`, last);
}

function classifyQueryError(msg: string): string {
  if (msg.includes("MethodNotFound")) return "MethodNotFound";
  if (msg.includes("CodeDoesNotExist") || msg.includes("NO_CONTRACT_CODE")) return "NO_CONTRACT_CODE";
  if (msg.includes("does not exist")) return "UNKNOWN_ACCOUNT";
  return "FunctionCallError";
}

const FINAL: Finality = { finality: "final" };

function toBase64(s: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Call a view method and parse its JSON result. */
export async function view<T = unknown>(contract: string, method: string, args: object = {}, at: Finality = FINAL): Promise<T> {
  const r = await rpc<{ result: number[]; block_height: number }>("query", {
    request_type: "call_function",
    account_id: contract,
    method_name: method,
    args_base64: toBase64(JSON.stringify(args)),
    ...at,
  });
  const text = new TextDecoder().decode(Uint8Array.from(r.result));
  return (text ? JSON.parse(text) : null) as T;
}

/** Like view(), but returns null when the method is missing or panics. */
export async function tryView<T = unknown>(contract: string, method: string, args: object = {}): Promise<T | null> {
  try {
    return await view<T>(contract, method, args);
  } catch (e) {
    if (e instanceof RpcError && e.kind !== undefined && e.kind !== "UNKNOWN_ACCOUNT") return null;
    throw e;
  }
}

export type AccountView = {
  amount: string;
  locked: string;
  code_hash: string;
  /** Set when the account runs a shared (global) contract; code_hash is then empty. */
  global_contract_hash?: string;
  global_contract_account_id?: string;
  storage_usage: number;
  block_height: number;
  block_hash: string;
};

/** No contract deployed. */
export const EMPTY_CODE_HASH = "11111111111111111111111111111111";

/** The hash of the code the account runs, own or global; null when it has none. */
export function contractHash(a: AccountView): string | null {
  if (a.code_hash !== EMPTY_CODE_HASH) return a.code_hash;
  return a.global_contract_hash ?? a.global_contract_account_id ?? null;
}

export function viewAccount(account: string) {
  return rpc<AccountView>("query", { request_type: "view_account", account_id: account, ...FINAL });
}

export type AccessKey = {
  public_key: string;
  access_key: {
    nonce: number;
    permission: "FullAccess" | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } };
  };
};

export async function viewAccessKeys(account: string): Promise<AccessKey[]> {
  const r = await rpc<{ keys: AccessKey[] }>("query", { request_type: "view_access_key_list", account_id: account, ...FINAL });
  return r.keys;
}

/** Contract wasm, base64. Large: only fetch when needed. */
export async function viewCode(account: string): Promise<{ code_base64: string; hash: string }> {
  return rpc("query", { request_type: "view_code", account_id: account, ...FINAL });
}

export function txStatus(hash: string, sender: string) {
  return rpc<{ status: unknown; transaction: unknown; receipts_outcome: unknown[] }>("EXPERIMENTAL_tx_status", {
    tx_hash: hash,
    sender_account_id: sender,
    wait_until: "EXECUTED_OPTIMISTIC",
  });
}

export async function latestBlock() {
  return rpc<{ header: { height: number; timestamp_nanosec: string } }>("block", FINAL);
}
