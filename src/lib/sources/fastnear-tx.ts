import { CLASSIC, DCL } from "./rhea";
import { mapLimit, postJson } from "./http";

/**
 * FastNEAR transactions API: every transaction that touched an account (full history), and the
 * full transactions with their receipts and logs. Token events (NEP-141 `ft_mint`, `ft_transfer`)
 * come from those logs, which is how early buyers and wallet origins are read.
 */

const API = "https://tx.main.fastnear.com/v0";
const BATCH = 20;

function headers(): Record<string, string> {
  const key = process.env.FASTNEAR_API_KEY;
  return key ? { authorization: `Bearer ${key}` } : {};
}

const post = <T>(path: string, body: unknown) => postJson<T>(`${API}${path}`, body, { headers: headers(), attempts: 4, timeoutMs: 20_000 });

export type AccountTx = { hash: string; at_ms: number; is_signer: boolean };

/** Transactions that touched `account`, oldest first unless `desc`. */
export async function accountTxs(account: string, opts: { limit?: number; desc?: boolean } = {}): Promise<{ txs: AccountTx[]; total: number }> {
  const r = await post<{
    account_txs: { transaction_hash: string; tx_block_timestamp: string; is_signer: boolean }[];
    txs_count?: number;
  }>("/account", { account_id: account, desc: Boolean(opts.desc), limit: opts.limit ?? 50 });
  return {
    txs: r.account_txs.map((t) => ({ hash: t.transaction_hash, at_ms: Number(BigInt(t.tx_block_timestamp) / 1_000_000n), is_signer: t.is_signer })),
    total: r.txs_count ?? r.account_txs.length,
  };
}

type RawOutcome = { executor_id: string; logs: string[]; status: Record<string, unknown> };

export type RawTx = {
  transaction: { hash: string; signer_id: string; receiver_id: string; actions: unknown[] };
  execution_outcome: { block_timestamp: number; outcome: RawOutcome };
  receipts: { execution_outcome: { block_timestamp: number; outcome: RawOutcome }; receipt: { receipt_index?: number } }[];
};

/** Full transactions for `hashes`, in batches. Missing hashes are skipped. */
export async function transactions(hashes: string[]): Promise<RawTx[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < hashes.length; i += BATCH) chunks.push(hashes.slice(i, i + BATCH));
  const out = await mapLimit(chunks, 2, (c) => post<{ transactions: (RawTx | null)[] }>("/transactions", { tx_hashes: c }));
  return out.flatMap((r) => r.transactions.filter((t): t is RawTx => Boolean(t)));
}

export type FtEvent = {
  kind: "mint" | "transfer" | "burn";
  from: string | null;
  to: string | null;
  amount: bigint;
  at_ms: number;
  tx: string;
  /** Who signed the transaction behind it. */
  signer: string;
  /** Order inside the transaction. */
  seq: number;
};

/** The NEP-141 events `token` logged in `txs`, oldest first. */
export function ftEvents(txs: RawTx[], token: string): FtEvent[] {
  const out: FtEvent[] = [];
  for (const t of txs) {
    let seq = 0;
    for (const r of t.receipts) {
      const o = r.execution_outcome.outcome;
      if (o.executor_id !== token || "Failure" in (o.status ?? {})) continue;
      for (const log of o.logs) {
        if (!log.startsWith("EVENT_JSON:")) continue;
        let e: { standard?: string; event?: string; data?: Record<string, string>[] };
        try {
          e = JSON.parse(log.slice(11));
        } catch {
          continue;
        }
        if (e.standard !== "nep141" || !Array.isArray(e.data)) continue;
        for (const d of e.data) {
          let amount: bigint;
          try {
            amount = BigInt(d.amount ?? "0");
          } catch {
            continue;
          }
          const base = { amount, at_ms: Math.floor(r.execution_outcome.block_timestamp / 1e6), tx: t.transaction.hash, signer: t.transaction.signer_id, seq: seq++ };
          if (e.event === "ft_transfer") out.push({ kind: "transfer", from: d.old_owner_id ?? null, to: d.new_owner_id ?? null, ...base });
          else if (e.event === "ft_mint") out.push({ kind: "mint", from: null, to: d.owner_id ?? null, ...base });
          else if (e.event === "ft_burn") out.push({ kind: "burn", from: d.owner_id ?? null, to: null, ...base });
        }
      }
    }
  }
  return out.sort((a, b) => a.at_ms - b.at_ms || (a.tx === b.tx ? a.seq - b.seq : 0));
}

export const isPool = (account: string | null) => account === DCL || account === CLASSIC;
