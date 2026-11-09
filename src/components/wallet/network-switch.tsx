"use client";

import * as Popover from "@radix-ui/react-popover";
import { clsx } from "clsx";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { EYEBROW } from "@/components/ui/styles";
import { switchWallet, WALLET, type NetworkId } from "@/lib/near/network";
import { useWallet } from "./wallet-provider";

const OPTIONS: { id: NetworkId; label: string; about: string }[] = [
  { id: "mainnet", label: "Mainnet", about: "Real NEAR. Swaps through Rhea and NEAR Intents, other chains too." },
  { id: "testnet", label: "Testnet", about: "Test NEAR, no real value. Swap nearvana launches on Rhea's testnet pools." },
];

/**
 * The network badge in the header. It opens a choice of mainnet or testnet for the wallet and
 * swaps. Switching disconnects the wallet and reloads, so the wallet connects again on the new network.
 * Token checks read both networks whichever is picked.
 */
export function NetworkSwitch() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (id: NetworkId) => {
    if (id === WALLET.id) return setOpen(false);
    setBusy(true);
    // The connected account belongs to the old network.
    await wallet.disconnect().catch(() => {});
    switchWallet(id);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Network: ${WALLET.id}. Switch network`}
          className={clsx(
            "flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-px text-[11px] hover:bg-surface-2 hover:text-text",
            WALLET.id === "mainnet" ? "border-ok/50 text-ok" : "border-line text-text-2",
          )}
        >
          {WALLET.id}
          <ChevronDown size={11} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="z-[70] flex w-[300px] max-w-[calc(100vw-16px)] flex-col gap-1 rounded-card border border-line bg-bg p-1.5 shadow-2xl shadow-void/60"
        >
          <div className={clsx(EYEBROW, "px-2.5 pt-1.5 pb-1 text-text-2")}>Wallet and swaps on</div>
          {OPTIONS.map((o) => {
            const on = o.id === WALLET.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={busy}
                onClick={() => void pick(o.id)}
                aria-current={on}
                className={clsx("flex items-start gap-2.5 rounded-[10px] p-2.5 text-left hover:bg-surface-2 disabled:opacity-60", on && "bg-surface-2")}
              >
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center text-accent-deep">
                  {on ? <Check size={14} strokeWidth={3} /> : busy ? <Loader2 size={13} className="animate-spin text-text-2" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-pretty text-text-2">{o.about}</span>
                </span>
              </button>
            );
          })}
          <p className="border-t border-line px-2.5 pt-2 pb-1.5 text-xs text-pretty text-text-2">
            Token checks read mainnet and testnet either way. Switching disconnects your wallet; connect and sign in again on the other network.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
