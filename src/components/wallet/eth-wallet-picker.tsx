"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Wallet } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";
import { ethPicker } from "@/lib/near/eth-sign";

/** Asks which extension should sign, when several are installed and none has this site connected. */
export function EthWalletPicker() {
  const pick = useSyncExternalStore(ethPicker.subscribe, ethPicker.get, () => null);
  // The list stays while the dialog animates out, after the choice cleared it.
  const last = useRef(pick);
  if (pick) last.current = pick;
  const shown = last.current;
  return (
    <Dialog.Root open={!!pick} onOpenChange={(o) => !o && pick?.choose(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="n-fade fixed inset-0 z-[60] grid place-items-center bg-[rgb(10_22_18/0.72)] p-4 backdrop-blur-[4px]">
          <Dialog.Content className="n-pop flex w-full max-w-[360px] flex-col gap-4 rounded-[20px] border border-line bg-surface p-[clamp(20px,5vw,28px)] shadow-[0_30px_60px_rgb(0_0_0/0.45)]">
            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="font-display text-[clamp(20px,5vw,22px)] leading-[1.15] font-normal">Sign in with which wallet?</Dialog.Title>
              <Dialog.Description className="text-sm text-pretty text-text-2">Pick the extension that holds your Ethereum account.</Dialog.Description>
            </div>
            <ul className="flex flex-col gap-2">
              {shown?.wallets.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => pick?.choose(w)}
                    className="flex w-full items-center gap-3 rounded-well bg-surface-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2/70"
                  >
                    {w.icon ? <img src={w.icon} alt="" width={24} height={24} className="size-6 rounded-md" /> : <Wallet size={20} className="text-text-2" />}
                    <span>{w.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Dialog.Close className="text-sm text-text-2 hover:text-text">Cancel</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
