"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Loader2, Send, Undo2, Wallet, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { failedOnChain, sendTransactions, type WalletTx } from "@/lib/near/wallet";
import { chainName } from "@/lib/swap/chains";
import { swapRisk, type SwapRisk } from "@/lib/swap/risk";
import type { Proposal, SwapQuote, SwapView } from "@/lib/swap/service";
import { useUnlocked } from "../gate/gate-card";
import { usePane } from "../pane/pane-context";
import { useSession } from "../session/use-session";
import { QUIET, STICKER } from "../ui/styles";
import { useWallet } from "../wallet/wallet-provider";
import { Dot, LevelPill } from "./level";
import { shortAccount } from "./risk-card";
import { Sources, time } from "./sources";

const routeLabel = (q: SwapQuote) => (q.route === "rhea" ? "Rhea pool" : q.provider === "aurora" ? "Aurora Intents" : "NEAR Intents");

const usd = (n: number | null) => (n === null ? null : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-text-2">{label}</dt>
      <dd className="m-0 min-w-0 text-right">{children}</dd>
    </div>
  );
}

function Side({ label, amount, symbol, value }: { label: string; amount: string; symbol: string; value: number | null }) {
  return (
    <div className="rounded-well bg-surface-2 px-3 py-2.5">
      <div className="text-xs text-text-2">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-lg font-semibold">
          {amount} {symbol}
        </span>
        {value !== null && <span className="shrink-0 text-xs text-text-2">{usd(value)}</span>}
      </div>
    </div>
  );
}

function Amounts({ q, minOut }: { q: SwapQuote; minOut?: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3.5">
      <Side label={q.from.chain === "near" ? "You pay" : `You send on ${chainName(q.from.chain)}`} amount={q.from.amount} symbol={q.from.symbol} value={q.from.usd} />
      <Side label="You get about" amount={q.to.amount} symbol={q.to.symbol} value={q.to.usd} />
      <dl className="mt-1.5 flex flex-col gap-1 text-[13px]">
        <Row label="At least">
          <span className="font-mono">
            {minOut ?? q.min_out} {q.to.symbol}
          </span>{" "}
          <span className="text-xs text-text-2">{q.slippage_pct}% slippage</span>
        </Row>
        <Row label="To">
          <span className="font-mono" title={q.recipient}>
            {shortAccount(q.recipient)}
            {q.to.chain !== "near" && <span className="ml-1 font-sans text-text-2">on {chainName(q.to.chain)}</span>}
          </span>
        </Row>
        {q.refund_to && (
          <Row label="Refund to">
            <span className="font-mono" title={q.refund_to}>
              {shortAccount(q.refund_to)}
              <span className="ml-1 font-sans text-text-2">on {chainName(q.from.chain)}</span>
            </span>
          </Row>
        )}
        {q.fees.length > 0 && (
          <Row label="Fees">
            <span className="text-text-2">{q.fees.join(" · ")}</span>
          </Row>
        )}
      </dl>
    </div>
  );
}

function Header({ q, right }: { q: SwapQuote; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">Swap</span>
        <span className="rounded-full border border-line px-2 py-0.5 text-xs text-text-2">via {routeLabel(q)}</span>
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
  if (!active || !Number.isFinite(left)) return null;
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor(left / 60_000) % 60;
  const sec = String(Math.floor(left / 1000) % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
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
  // Paid on another chain: approving gives a deposit address instead of a wallet prompt.
  const byDeposit = proposal.pay === "deposit";
  // The user's wallet registers them on the token received, unless the setup is sponsored.
  const ownRegistration = Boolean(proposal.register) && !proposal.sponsored;
  const [ack, setAck] = useState(false);
  const { risk, checking } = useSwapRisk(proposal);

  const live = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/swap/${proposal.id}`);
      const j = (await res.json()) as SwapView & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't load the swap.");
      return j;
    },
    enabled: mine,
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      return st === "awaiting_deposit" ? 8000 : st === "submitted" || st === "processing" ? 4000 : false;
    },
  });
  const swap = live.data;
  const status = swap?.status ?? "proposed";
  // A finished swap may have bought the NVANA that unlocks the chat: read the balance again.
  const { recheck } = session;
  useEffect(() => {
    if (status === "success" && mine) void recheck();
  }, [status, mine, recheck]);

  const approve = useMutation({
    mutationFn: async () => {
      const { swap: s, txs } = await post<{ swap: SwapView; txs: WalletTx[] }>(proposal.id, { action: "approve" });
      qc.setQueryData(key, s);
      // A deposit swap only signs when the account must first be registered on the token it receives.
      if (byDeposit && !txs.length) return;
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

  const red = risk?.level === "red";
  const countdown = useCountdown(proposal.expires_at, status === "proposed");
  const expired = status === "expired" || (status === "proposed" && Date.parse(proposal.expires_at) < Date.now());

  let action: ReactNode;
  if (!mine) {
    action = <Note>This swap was prepared for {shortAccount(owner)}. Sign in with that wallet to approve it.</Note>;
  } else if ((!byDeposit || ownRegistration) && wallet.account !== owner) {
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
          className={clsx(STICKER, "w-full gap-2 rounded-well px-4 py-[11px]")}
        >
          {approve.isPending ? <Loader2 size={16} className="animate-spin" /> : byDeposit ? <Send size={16} /> : <Wallet size={16} />}
          {approve.isPending ? "Getting the final quote…" : byDeposit ? (ownRegistration ? "Register, then get the deposit address" : "Approve and get the deposit address") : "Approve in wallet"}
        </button>
        <p className="text-center text-xs text-text-2">
          {byDeposit
            ? `${ownRegistration ? `Your wallet first registers you on ${proposal.to.symbol} (about 0.00125 NEAR), so it can be delivered. ` : proposal.register ? `We register you on ${proposal.to.symbol} first, so it can be delivered; no NEAR needed. ` : ""}Next you send ${proposal.from.amount} ${proposal.from.symbol} on ${chainName(proposal.from.chain)} yourself. Nothing is sent before that.`
            : "Your wallet shows the exact transaction before anything is sent."}
          {countdown && (
            <>
              {" "}
              Quote valid <span className="font-mono text-text">{countdown}</span>.
            </>
          )}
        </p>
      </div>
    );
  } else if (status === "awaiting_deposit" && swap?.deposit) {
    action = <DepositPanel swap={swap} onUpdate={(s) => qc.setQueryData(key, s)} />;
  } else {
    action = <Progress swap={swap!} proposal={proposal} />;
  }

  return (
    <section
      className={clsx("overflow-hidden rounded-card border bg-surface", status === "proposed" && !expired ? "border-[color-mix(in_srgb,var(--accent-deep)_50%,var(--line))]" : "border-line")}
      aria-label="Swap approval"
    >
      <Header q={proposal} right={risk && <LevelPill level={risk.level} />} />
      <Amounts q={proposal} minOut={swap?.min_out} />
      <RiskBox proposal={proposal} risk={risk} checking={checking} />
      {proposal.warnings.length > 0 && (
        <ul className="mx-4 mb-3.5 space-y-1 rounded-well border border-warn/40 bg-warn/10 px-3 py-[9px] text-[13px]">
          {proposal.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-warn">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line px-4 py-3.5">
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

/**
 * The newest token check of the token bought: the one the proposal came with, or one run in the pane
 * since. A swap never runs the checks; they stay behind the NVANA gate in the token checker.
 */
function useSwapRisk(proposal: Proposal): { risk: SwapRisk | null; checking: boolean } {
  const pane = usePane();
  const token = proposal.to.token;
  const item = token ? pane.reports.find((r) => (r.report?.token ?? r.token) === token) : undefined;
  const fromPane = item?.report ? swapRisk(item.report) : null;
  // Proposals stored before flags were added carry only a level and a summary.
  const own = proposal.risk && Array.isArray(proposal.risk.flags) ? proposal.risk : null;
  const risk = [own, fromPane].filter((r): r is SwapRisk => r !== null).sort((a, b) => Date.parse(b.as_of) - Date.parse(a.as_of))[0] ?? null;
  return { risk, checking: !risk && item?.status === "running" };
}

const ago = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
};

const TONE = { red: "border-bad/45 bg-bad/10", yellow: "border-warn/40 bg-warn/10", green: "border-line bg-surface-2", not_checked: "border-line bg-surface-2" } as const;

/** What the token check found on the token bought, one bullet per flag; or how to get one. */
function RiskBox({ proposal, risk, checking }: { proposal: Proposal; risk: SwapRisk | null; checking: boolean }) {
  const pane = usePane();
  const unlocked = useUnlocked();
  const token = proposal.to.token;
  const symbol = proposal.to.symbol;
  if (!token || (!risk && !proposal.checkable)) return null;

  if (risk) {
    return (
      <div className={clsx("mx-4 mb-3.5 rounded-well border px-3 py-2.5 text-[13px]", TONE[risk.level])}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">Token check</span>
          <span className="text-xs text-text-2">{ago(risk.as_of)}</span>
        </div>
        {risk.flags.length > 0 ? (
          <ul className="mt-1.5 space-y-1.5">
            {risk.flags.map((f) => (
              <li key={f.title} className="flex gap-2">
                <Dot level={f.level} className="mt-[5px]" />
                <span className="text-pretty">
                  <span className="font-medium">{f.title}:</span> <span className="text-text-2">{f.summary}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-text-2">No red flags or things to watch.</p>
        )}
        <button type="button" onClick={() => pane.check(token)} className="mt-2 text-xs font-medium text-accent-deep hover:underline">
          Open full report
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3.5 flex flex-wrap items-center justify-between gap-2 rounded-well border border-line bg-surface-2 px-3 py-2.5 text-[13px] text-text-2">
      {checking ? (
        <span className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Checking {symbol}…
        </span>
      ) : unlocked ? (
        <>
          <span>Not checked yet.</span>
          <button type="button" onClick={() => pane.check(token)} className={clsx(QUIET, "rounded-full px-3 py-1 text-xs text-text")}>
            Check {symbol}
          </button>
        </>
      ) : (
        <span>Not checked. Token checks are for NVANA holders.</span>
      )}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-2">{children}</p>;
}

function TxLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-text-2 hover:text-accent-deep">
      {children} <ExternalLink size={11} />
    </a>
  );
}

function Copyable({ label, value, copy }: { label: string; value: string; copy?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="rounded-well bg-surface-2 px-3 py-2">
      <div className="text-xs text-text-2">{label}</div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 font-mono text-sm [overflow-wrap:anywhere]">{value}</span>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard
              .writeText(copy ?? value)
              .then(() => {
                setDone(true);
                setTimeout(() => setDone(false), 1500);
              })
              .catch(() => {})
          }
          aria-label={`Copy ${label.toLowerCase()}`}
          className="grid size-7 shrink-0 place-items-center rounded-full text-text-2 hover:bg-surface hover:text-text"
        >
          {done ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

/** A deposit swap after approval: what to send where, until the transfer is seen. */
function DepositPanel({ swap, onUpdate }: { swap: SwapView; onUpdate: (s: SwapView) => void }) {
  const d = swap.deposit!;
  const [hash, setHash] = useState("");
  const left = useCountdown(d.deadline ?? "", Boolean(d.deadline));
  const sent = useMutation({
    mutationFn: async () => {
      const r = await post<{ swap: SwapView }>(swap.id, { action: "sent", txHash: hash.trim() || null });
      onUpdate(r.swap);
    },
  });
  const chain = chainName(d.chain);
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <p className="m-0 leading-snug">
        Send exactly{" "}
        <strong className="font-mono">
          {d.amount} {d.symbol}
        </strong>{" "}
        on <strong>{chain}</strong> to this address, from any wallet or exchange.
        {left && (
          <>
            {" "}
            Time left: <span className="font-mono">{left}</span>.
          </>
        )}
      </p>
      <Copyable label="Deposit address" value={d.address} />
      {d.memo && <Copyable label="Memo (required)" value={d.memo} />}
      <Copyable label="Amount" value={`${d.amount} ${d.symbol}`} copy={d.amount.replaceAll(",", "")} />
      <p className="m-0 text-xs leading-snug text-text-2">
        Use this address once, and only on {chain}. Less than the amount, or a transfer after the time runs out, is refunded to{" "}
        <span className="font-mono [overflow-wrap:anywhere]">{d.refund_to}</span>, minus network fees.
      </p>
      <label className="mt-1 flex flex-col gap-1">
        <span className="text-xs text-text-2">Sent it? The transaction hash speeds things up (optional).</span>
        <input
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder="Transaction hash"
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          className="rounded-well border border-line bg-bg px-3 py-2 font-mono text-sm placeholder:text-text-2/50 focus:border-muted focus:outline-none"
        />
      </label>
      <button type="button" disabled={sent.isPending} onClick={() => sent.mutate()} className={clsx(QUIET, "rounded-well px-3 py-[9px] text-sm text-text")}>
        {sent.isPending ? <Loader2 size={14} className="animate-spin" /> : null} I sent it
      </button>
      <p className="m-0 flex items-center gap-2 text-xs text-text-2" role="status">
        <Loader2 size={12} className="animate-spin" /> Watching the address: the swap starts by itself once your transfer arrives.
      </p>
      {sent.error && <p className="m-0 text-sm text-bad">{sent.error.message}</p>}
    </div>
  );
}

/** NEAR Intents paid NEAR out as wNEAR: one transaction turns it into native NEAR. */
function Unwrap({ swap }: { swap: SwapView }) {
  const qc = useQueryClient();
  const wallet = useWallet();
  const run = useMutation({
    mutationFn: async () => {
      const { txs } = await post<{ swap: SwapView; txs: WalletTx[] }>(swap.id, { action: "unwrap" });
      let outcomes: Outcome[];
      try {
        outcomes = (await sendTransactions(txs)) as Outcome[];
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(/reject|cancel|closed|denied/i.test(msg) ? "You closed the wallet. Your wNEAR is still there." : `The wallet said: ${msg}`);
      }
      const last = outcomes[outcomes.length - 1];
      if (last && failedOnChain(last as never)) throw new Error("The unwrap failed on chain. Your wNEAR is still there.");
      const r = await post<{ swap: SwapView }>(swap.id, { action: "unwrapped", txHash: hashOf(last) });
      qc.setQueryData(["swap", swap.id], r.swap);
    },
  });
  if (wallet.account !== swap.account) {
    return <p className="mt-1.5 text-xs text-text-2">Connect {shortAccount(swap.account)} to unwrap it into NEAR.</p>;
  }
  return (
    <div className="mt-2">
      <button type="button" disabled={run.isPending} onClick={() => run.mutate()} className={clsx(QUIET, "gap-2 rounded-well px-3 py-[7px] text-sm text-text")}>
        {run.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />} Unwrap {swap.unwrap} to NEAR
      </button>
      {run.error && <p className="mt-1.5 text-sm text-bad">{run.error.message}</p>}
    </div>
  );
}

function Progress({ swap, proposal }: { swap: SwapView; proposal: Proposal }) {
  const r = swap.result;
  const byDeposit = proposal.pay === "deposit";
  const links = (
    <div className="mt-1 flex flex-wrap gap-3">
      {swap.tx_url && <TxLink href={swap.tx_url}>{byDeposit ? "Your deposit" : "Your transaction"}</TxLink>}
      {r?.dest_tx_url && <TxLink href={r.dest_tx_url}>Payout on {chainName(proposal.to.chain)}</TxLink>}
    </div>
  );
  if (IN_FLIGHT.has(swap.status)) {
    const text =
      swap.status === "signing"
        ? "Confirm in your wallet…"
        : r?.upstream === "INCOMPLETE_DEPOSIT"
          ? (r.reason ?? "Less than the quoted amount arrived.")
          : r?.upstream === "KNOWN_DEPOSIT_TX"
            ? "Deposit seen, waiting for it to confirm…"
            : r?.upstream === "PENDING_DEPOSIT" || (byDeposit && !r?.upstream)
              ? byDeposit
                ? `Waiting for your ${proposal.from.symbol} to arrive on ${chainName(proposal.from.chain)}…`
                : "Waiting for the deposit to land…"
              : "Swapping…";
    return (
      <div>
        <p className="flex items-center gap-2 text-sm" role="status">
          <Loader2 size={15} className="animate-spin text-accent-deep" /> {text}
        </p>
        {links}
      </div>
    );
  }
  if (swap.status === "success") {
    const got = r?.amount_out ?? swap.min_out ?? proposal.min_out;
    return (
      <div>
        <p className="flex items-center gap-2 text-sm text-ok">
          <CheckCircle2 size={15} /> Done.{" "}
          {r?.amount_out ? `You received ${got} ${proposal.to.symbol}` : `At least ${got} ${proposal.to.symbol} sent`}
          {swap.unwrap ? " as wNEAR." : r?.unwrapped ? ", unwrapped to NEAR." : "."}
        </p>
        {swap.unwrap && <Unwrap swap={swap} />}
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
        <XCircle size={15} />{" "}
        {swap.status !== "expired"
          ? `Failed. ${r?.reason ?? ""}`
          : swap.deposit
            ? `No deposit arrived in time. Anything sent later is refunded to ${swap.deposit.refund_to ?? "your refund address"}.`
            : "This quote expired. Ask for a new one."}
      </p>
      {links}
    </div>
  );
}
