"use client";

import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { AlertTriangle, BadgeCheck, ExternalLink, Loader2 } from "lucide-react";
import type { Verification } from "@/lib/agent/verify";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function label(v: Verification): { text: string; tone: "ok" | "muted" | "warn"; proves: string } {
  if (v.status === "failed") return { text: "Not verified", tone: "warn", proves: v.reason ?? "The signature check failed." };
  if (v.kind === "model")
    return { text: "Verified · private", tone: "ok", proves: "This model wrote this reply inside verified secure hardware, and nobody changed it since, VANA included." };
  if (v.tier === "incognito")
    return { text: "Signed · not private", tone: "muted", proves: "Unchanged since NEAR AI got it from the provider. The provider could read this chat." };
  if (v.tier === "partner")
    return { text: "Signed · partner hardware", tone: "ok", proves: "Unchanged since it left NEAR AI's secure gateway. The partner's hardware is checked by NEAR AI." };
  return { text: "Signed by NEAR AI", tone: "ok", proves: "Unchanged since it left NEAR AI's secure gateway." };
}

/** Under a finished reply on NEAR AI Cloud: whether its signatures and attestations checked out. Nothing for replies without a record. */
export function VerifyBadge({ conversationId, messageId, latest }: { conversationId: string; messageId: string; latest?: boolean }) {
  const q = useQuery({
    queryKey: ["verify", conversationId, messageId],
    queryFn: async (): Promise<Verification | null> => {
      const res = await fetch(`/api/chat/verify?c=${encodeURIComponent(conversationId)}&m=${encodeURIComponent(messageId)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Verify failed (${res.status})`);
      return (await res.json()) as Verification;
    },
    // The check runs right after the reply: poll until it lands (about a minute at most).
    // The newest reply may ask before the server has noted it: it looks again a few times.
    refetchInterval: (s) =>
      (s.state.data?.status === "pending" && s.state.dataUpdateCount < 30) || (latest && s.state.data === null && s.state.dataUpdateCount < 4) ? 2000 : false,
    staleTime: Infinity,
    retry: 1,
  });
  const v = q.data;
  if (!v) return null;
  if (v.status === "pending")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-2" role="status">
        <Loader2 size={12} className="animate-spin" /> Verifying…
      </span>
    );
  const l = label(v);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
            l.tone === "ok" && "border-ok/40 text-ok hover:bg-ok/10",
            l.tone === "muted" && "border-line text-text-2 hover:bg-surface-2",
            l.tone === "warn" && "border-warn/40 text-warn hover:bg-warn/10",
          )}
        >
          {l.tone === "warn" ? <AlertTriangle size={12} /> : <BadgeCheck size={12} />} {l.text}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="m-pop z-[70] w-[300px] max-w-[calc(100vw-16px)] rounded-card border border-line bg-bg p-3 text-[13px] shadow-2xl shadow-void/60"
        >
          <p className="m-0 text-pretty">{l.proves}</p>
          {v.status === "verified" && (
            <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-text-2">Signed by</dt>
              <dd className="m-0">{v.kind === "model" ? "The model's secure hardware" : "NEAR AI's secure gateway"}</dd>
              <dt className="text-text-2">Hardware</dt>
              <dd className="m-0">
                Intel TDX {v.tcb === "UpToDate" ? "up to date" : (v.tcb ?? "checked")}
                {v.gpu === "verified" && " · NVIDIA GPU verified"}
              </dd>
              {v.signer && (
                <>
                  <dt className="text-text-2">Signer</dt>
                  <dd className="m-0 font-mono" title={v.signer}>
                    {short(v.signer)}
                  </dd>
                </>
              )}
              {v.model && (
                <>
                  <dt className="text-text-2">Model</dt>
                  <dd className="m-0 font-mono">{v.model.replace(/^[^/]+\//, "")}</dd>
                </>
              )}
              <dt className="text-text-2">Checked</dt>
              <dd className="m-0">
                {v.calls} model call{v.calls === 1 ? "" : "s"}, by VANA&apos;s server
              </dd>
            </dl>
          )}
          <a
            href="https://docs.near.ai/cloud/verification"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-flex items-center gap-1 text-xs text-accent-deep hover:underline"
          >
            How NEAR AI verification works <ExternalLink size={11} />
          </a>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
