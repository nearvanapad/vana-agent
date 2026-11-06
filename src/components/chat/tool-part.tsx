"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type { PendingReport } from "@/lib/agent/report-stream";
import type { TokenMatch } from "@/lib/agent/search";
import type { ReportView } from "@/lib/agent/tools";
import type { Proposal, SwapQuote } from "@/lib/swap/service";
import type { SourceRef } from "@/lib/sources/http";
import type { ScreenResult } from "../pane/pane-context";
import { ProposalChip, QuoteChip, ReportChip, ScreenChip, SearchChip } from "./chips";
import { Sources } from "./sources";

type Input = Record<string, unknown> | undefined;

/** What the agent is doing, in words, for the status line. */
export function toolLabel(name: string, input: Input, done = false): string {
  const t = String(input?.token ?? input?.account ?? input?.query ?? "").slice(0, 64);
  const pair = input?.from ? `${String(input.amount ?? "")} ${short(input.from)} → ${short(input.to)}` : "the swap";
  const v = (doing: string, did: string) => (done ? did : doing);
  switch (name) {
    case "risk_report":
      return v(`Checking ${t || "the token"}: contract, holders, early buyers, liquidity, taxes, creator`, `Checked ${t}`);
    case "token_overview":
      return v(`Looking up ${t}`, `Looked up ${t}`);
    case "holders":
      return v(`Reading the holders of ${t}`, `Read the holders of ${t}`);
    case "liquidity":
      return v(`Reading Rhea pools for ${t}`, `Read Rhea pools for ${t}`);
    case "early_buyers":
      return v(`Tracing the early buyers of ${t}`, `Traced the early buyers of ${t}`);
    case "creator_history":
      return v(`Looking up the creator's other launches for ${t}`, `Looked up the creator's other launches for ${t}`);
    case "find_tokens":
      return v(`Screening the newest ${pads(input)} launches`, `Screened the newest ${pads(input)} launches`);
    case "dev_profile":
      return v(`Looking into the dev of ${t}`, `Looked into the dev of ${t}`);
    case "wallet_profile":
      return v(`Profiling ${t}`, `Profiled ${t}`);
    case "search_token":
      return v(`Searching tokens for “${t}”`, `Searched tokens for “${t}”`);
    case "quote_swap":
      return v(`Pricing ${pair}`, `Priced ${pair}`);
    case "propose_swap":
      return v(`Preparing ${pair} for your approval`, `Prepared ${pair}`);
    case "list_swap_assets":
      return v("Listing NEAR Intents assets", "Listed NEAR Intents assets");
    default:
      return v(`Running ${name}`, `Ran ${name}`);
  }
}

/** Which launchpads a screen covers: the one asked for, or the mainnet ones by default. */
function pads(input: Input): string {
  const p = input?.platform;
  return p === "nearly" || p === "justhoot" || p === "nearvana" ? p : "nearly and justhoot";
}

/** Asset ids can be long: keep the readable end. */
function short(v: unknown): string {
  const s = String(v ?? "").replace(/^nep141:/, "");
  return s.length > 28 ? `${s.slice(0, 12)}…${s.slice(-10)}` : s;
}

export type ToolPartLike = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function sourcesOf(output: unknown): SourceRef[] {
  if (!output || typeof output !== "object") return [];
  const o = output as { sources?: SourceRef[]; source?: SourceRef; profile?: { sources?: SourceRef[] } };
  return [...(o.sources ?? []), ...(o.source ? [o.source] : []), ...(o.profile?.sources ?? [])];
}

export function ToolPart({ part }: { part: ToolPartLike }) {
  const name = part.type.replace(/^tool-/, "");
  const input = part.input as Input;

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="flex items-center gap-2 text-sm text-text-2" role="status">
        <Loader2 size={14} className="animate-spin text-accent-deep" />
        <span>{toolLabel(name, input)}…</span>
      </div>
    );
  }
  if (part.state === "output-error") {
    return (
      <div className="flex items-start gap-2 text-sm text-bad">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>
          {toolLabel(name, input)} failed: {part.errorText}
        </span>
      </div>
    );
  }
  if (part.state !== "output-available") return null;

  // The full results live in the side pane; the chat links to them.
  const id = part.toolCallId;
  if (name === "risk_report") return <ReportChip id={id} out={part.output as PendingReport | ReportView} />;
  if (name === "quote_swap") return <QuoteChip id={id} out={part.output as SwapQuote} />;
  if (name === "propose_swap") return <ProposalChip id={id} out={part.output as Proposal} />;
  if (name === "find_tokens") return <ScreenChip id={id} out={part.output as ScreenResult} />;
  const chip = name === "search_token" ? <SearchChip id={id} out={part.output as { matches: TokenMatch[] }} query={String(input?.query ?? "")} /> : null;

  return (
    <>
      {chip}
      <details className="group text-sm text-text-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 hover:text-text">
          <Check size={14} className="text-accent-deep" />
          {toolLabel(name, input, true)}
        </summary>
        <div className="mt-2 pl-6">
          <Sources sources={sourcesOf(part.output)} />
        </div>
      </details>
    </>
  );
}
