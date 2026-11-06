"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { AlertTriangle, ArrowDown, CheckCircle2, ExternalLink, Loader2, Undo2, Wallet, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { failedOnChain, sendTransactions, type WalletTx } from "@/lib/near/wallet";
import type { Proposal, SwapQuote, SwapView } from "@/lib/swap/service";
import { useSession } from "../session/use-session";
import { useWallet } from "../wallet/wallet-provider";
import { LevelPill } from "./level";
import { shortAccount } from "./risk-card";
import { Sources, time } from "./sources";

const ROUTE_LABEL = { intents: "NEAR Intents", rhea: "Rhea pool" } as const;

const usd = (n: number | null) => (n === null ? null : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="shrink-0 text-sm text-text-2">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function Amounts({ q, minOut }: { q: SwapQuote; minOut?: string | null }) {
  return (
    <div className="px-4 py-3">
      <Row label="You pay">
        <span className="font-mono">
          {q.from.amount} {q.from.symbol}
        </span>
        {q.from.usd !== null && <span className="ml-2 text-xs text-text-2">{usd(q.from.usd)}</span>}
      </Row>
      <div className="flex justify-center text-text-2">
        <ArrowDown size={14} />
      </div>
      <Row label="You get about">
        <span className="font-mono">
          {q.to.amount} {q.to.symbol}
        </span>
        {q.to.usd !== null && <span className="ml-2 text-xs text-text-2">{usd(q.to.usd)}</span>}
      </Row>
      <Row label="At least">
        <span className="font-mono text-sm">
          {minOut ?? q.min_out} {q.to.symbol}
        </span>
        <span className="ml-2 text-xs text-text-2">{q.slippage_pct}% slippage</span>
      </Row>
      <Row label="To">
        <span className="font-mono text-sm" title={q.recipient}>
          {shortAccount(q.recipient)}
          {q.to.chain !== "near" && <span className="ml-1 text-text-2">on {q.to.chain}</span>}
        </span>
      </Row>
      <ul className="mt-2 space-y-0.5 text-xs text-text-2">
        {q.fees.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}

function Header({ q, right }: { q: SwapQuote; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">Swap</span>
        <span className="rounded-full border border-line px-2 py-0.5 text-xs text-text-2">via {ROUTE_LABEL[q.route]}</span>
      </div>
      {right}
    </header>
  );
}

/** A price only: nothing to approve. */
export function QuoteCard({ quote }: { quote: SwapQuote }) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface" aria-label="Swap quote">
      <Header q={quote} right={<span className="text-xs text-text-2">Quote only</span>} />
      <Amounts q={quote} />
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2">
        <Sources sources={quote.sources} />
        <span className="text-xs text-text-2">Priced {time(quote.as_of)}</span>
      </footer>
    </section>
  );
}

async function post<T>(id: string, body: object): Promise<T> {
  const res = await fetch(`/api/swap/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

type Outcome = { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | null | undefined;
const hashOf = (o: Outcome) => o?.transaction?.hash ?? o?.transaction_outcome?.id ?? null;

const IN_FLIGHT = new Set(["signing", "submitted", "processing"]);

function useCountdown(until: string, active: boolean): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  const left = Math.max(0, Date.parse(until) - now);
  if (!active) return null;
  return `${Math.floor(left / 60_000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`;
}

/**
 * The approval card. Approve takes a real quote on the server (checked against the minimum shown
 * here), then the wallet signs. After that the card follows the swap until it settles.
 */
export function SwapCard({ proposal }: { proposal: Proposal }) {
  const qc = useQueryClient();
  const wallet = useWallet();
  const session = useSession();
  const owner = proposal.account;
  const mine = session.account === owner;
  const key = ["swap", proposal.id];
  const [ack, setAck] = useState(false);

  const live = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/swap/${proposal.id}`);
      const j = (await res.json()) as SwapView & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't load the swap.");
      return j;
    },
    enabled: mine,
    refetchInterval: (q) => (q.state.data && ["submitted", "processing"].includes(q.state.data.status) ? 4000 : false),
  });
  const swap = live.data;
  const status = swap?.status ?? "proposed";

  const approve = useMutation({
    mutationFn: async () => {
      const { swap: s, txs } = await post<{ swap: SwapView; txs: WalletTx[] }>(proposal.id, { action: "approve" });
      qc.setQueryData(key, s);
      let outcomes: Outcome[];
      try {
        outcomes = (await sendTransactions(txs)) as Outcome[];
      } catch (e) {
        const r = await post<{ swap: SwapView }>(proposal.id, { action: "rejected" }).catch(() => null);
        if (r) qc.setQueryData(key, r.swap);
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(/reject|cancel|closed|denied/i.test(msg) ? "You closed the wallet. Nothing was sent." : `The wallet said: ${msg}`);
      }
      const last = outcomes[outcomes.length - 1];
      const hash = hashOf(last);
      if (outcomes.length < txs.length || (last && failedOnChain(last as never))) {
        const r = await post<{ swap: SwapView }>(proposal.id, { action: "failed", txHash: hash ?? undefined, reason: "A transaction failed on chain." });
        qc.setQueryData(key, r.swap);
        return;
      }
      const r = await post<{ swap: SwapView }>(proposal.id, { action: "submitted", txHash: hash });
      qc.setQueryData(key, r.swap);
    },
  });

  const red = proposal.risk?.level === "red";
  const countdown = useCountdown(proposal.expires_at, status === "proposed");
  const expired = status === "expired" || (status === "proposed" && Date.parse(proposal.expires_at) < Date.now());

  let action: ReactNode;
  if (!mine) {
    action = <Note>This swap was prepared for {shortAccount(owner)}. Sign in with that wallet to approve it.</Note>;
  } else if (wallet.account !== owner) {
    action = (
      <Note>
        Connect <span className="font-mono">{shortAccount(owner)}</span> in your wallet to approve.
      </Note>
    );
  } else if (expired) {
    action = <Note>This quote expired. Ask for a new one.</Note>;
  } else if (status === "proposed") {
    action = (
      <div className="space-y-2">
        {red && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 accent-[var(--color-bad)]" />
            <span>I read the red flags and still want to swap.</span>
          </label>
        )}
        <button
          type="button"
          disabled={approve.isPending || (red && !ack)}
          onClick={() => approve.mutate()}
          className="flex w-full items-center justify-center gap-2 rounded-well bg-accent px-4 py-2.5 font-medium text-bg hover:brightness-110 disabled:opacity-50"
        >
          {approve.isPending ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
          {approve.isPending ? "Getting the final quote…" : "Approve in wallet"}
        </button>
        <p className="text-center text-xs text-text-2">
          Your wallet shows the exact transaction before anything is sent.{countdown && ` Quote valid ${countdown}.`}
        </p>
      </div>
    );
  } else {
    action = <Progress swap={swap!} proposal={proposal} />;
  }

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface" aria-label="Swap approval">
      <Header q={proposal} right={proposal.risk && <LevelPill level={proposal.risk.level} />} />
      <Amounts q={proposal} minOut={swap?.min_out} />
      {proposal.warnings.length > 0 && (
        <ul className="mx-4 mb-3 space-y-1 rounded-well border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          {proposal.warnings.map((w) => (
            <li key={w} className={clsx("flex gap-2", w.includes(" is red") ? "text-bad" : "text-warn")}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line px-4 py-3">
        {action}
        {approve.error && (
          <p className="mt-2 flex items-start gap-2 text-sm text-bad" role="alert">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {approve.error.message}
          </p>
        )}
        {live.error && !approve.error && <p className="mt-2 text-sm text-bad">{live.error.message}</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2">
        <Sources sources={proposal.sources} />
        <span className="text-xs text-text-2">Priced {time(proposal.as_of)}</span>
      </footer>
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-2">{children}</p>;
}

function TxLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-text-2 hover:text-accent">
      {children} <ExternalLink size={11} />
    </a>
  );
}

function Progress({ swap, proposal }: { swap: SwapView; proposal: Proposal }) {
  const r = swap.result;
  const links = (
    <div className="mt-1 flex flex-wrap gap-3">
      {swap.tx_url && <TxLink href={swap.tx_url}>Your transaction</TxLink>}
      {r?.dest_tx_url && <TxLink href={r.dest_tx_url}>Payout on {proposal.to.chain}</TxLink>}
    </div>
  );
  if (IN_FLIGHT.has(swap.status)) {
    const text =
      swap.status === "signing"
        ? "Confirm in your wallet…"
        : r?.upstream === "PENDING_DEPOSIT" || r?.upstream === "KNOWN_DEPOSIT_TX"
          ? "Waiting for the deposit to land…"
          : "Swapping…";
    return (
      <div>
        <p className="flex items-center gap-2 text-sm" role="status">
          <Loader2 size={15} className="animate-spin text-accent" /> {text}
        </p>
        {links}
      </div>
    );
  }
  if (swap.status === "success") {
    return (
      <div>
        <p className="flex items-center gap-2 text-sm text-ok">
          <CheckCircle2 size={15} /> Done. {r?.amount_out ? `You received ${r.amount_out} ${proposal.to.symbol}.` : `At least ${swap.min_out ?? proposal.min_out} ${proposal.to.symbol} sent.`}
        </p>
        {links}
      </div>
    );
  }
  if (swap.status === "refunded") {
    return (
      <div>
        <p className="flex items-center gap-2 text-sm text-warn">
          <Undo2 size={15} /> Refunded{r?.refunded ? ` ${r.refunded} ${proposal.from.symbol}` : ""}. {r?.reason ?? ""}
        </p>
        {links}
      </div>
    );
  }
  return (
    <div>
      <p className="flex items-center gap-2 text-sm text-bad">
        <XCircle size={15} /> {swap.status === "expired" ? "This quote expired. Ask for a new one." : `Failed. ${r?.reason ?? ""}`}
      </p>
      {links}
    </div>
  );
}
