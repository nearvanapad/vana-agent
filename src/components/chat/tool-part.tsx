"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type { ReportView } from "@/lib/agent/tools";
import type { Proposal, SwapQuote } from "@/lib/swap/service";
import type { SourceRef } from "@/lib/sources/http";
import { RiskCard } from "./risk-card";
import { Sources } from "./sources";
import { QuoteCard, SwapCard } from "./swap-card";

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
      return v("Screening the newest nearly and justhoot launches", "Screened the newest launches");
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

/** Asset ids can be long: keep the readable end. */
function short(v: unknown): string {
  const s = String(v ?? "").replace(/^nep141:/, "");
  return s.length > 28 ? `${s.slice(0, 12)}…${s.slice(-10)}` : s;
}

export type ToolPartLike = {
  type: string;
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
        <Loader2 size={14} className="animate-spin text-accent" />
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

  if (name === "risk_report") return <RiskCard report={part.output as ReportView} />;
  if (name === "quote_swap") return <QuoteCard quote={part.output as SwapQuote} />;
  if (name === "propose_swap") return <SwapCard proposal={part.output as Proposal} />;

  return (
    <details className="group text-sm text-text-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 hover:text-text">
        <Check size={14} className="text-accent" />
        {toolLabel(name, input, true)}
      </summary>
      <div className="mt-2 pl-6">
        <Sources sources={sourcesOf(part.output)} />
      </div>
    </details>
  );
}
