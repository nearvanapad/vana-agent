"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { Eye, Info, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { useUnlocked } from "@/components/gate/gate-card";
import { STICKER } from "@/components/ui/styles";
import { Mascot } from "@/components/vana/mascot";

const SEEN = "vana:notice-seen";

const POINTS = [
  { icon: Eye, text: "Read-only checks from public chain data." },
  { icon: Info, text: "Not financial advice." },
  { icon: WalletCards, text: "Your wallet signs, never the AI." },
];

/** Once per browser, when the chat first opens up: what VANA does and doesn't do. */
export function Notice() {
  const unlocked = useUnlocked();
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    try {
      setSeen(localStorage.getItem(SEEN) === "1");
    } catch {
      setSeen(false);
    }
  }, []);
  const dismiss = () => {
    try {
      localStorage.setItem(SEEN, "1");
    } catch {}
    setSeen(true);
  };

  return (
    <Dialog.Root open={unlocked === true && !seen} onOpenChange={(o) => !o && dismiss()}>
      <Dialog.Portal>
        <Dialog.Overlay className="n-fade fixed inset-0 z-[60] bg-[rgb(10_22_18/0.72)] backdrop-blur-[4px]" />
        <Dialog.Content className="n-pop fixed top-1/2 left-1/2 z-[61] flex w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 rounded-[20px] border border-line bg-surface p-[clamp(20px,5vw,28px)] text-center shadow-[0_30px_60px_rgb(0_0_0/0.45)]">
          <Mascot mood="happy" size={72} />
          <div className="flex flex-col gap-1.5">
            <Dialog.Title className="font-display text-[clamp(20px,5vw,24px)] leading-tight">Before we start</Dialog.Title>
            <Dialog.Description className="text-sm text-pretty text-text-2">A few things to know about how I work.</Dialog.Description>
          </div>
          <ul className="flex w-full flex-col gap-2 text-left text-sm">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 rounded-well bg-surface-2 px-3 py-2.5">
                <Icon size={18} className="shrink-0 text-accent-deep" aria-hidden />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <Dialog.Close className={clsx(STICKER, "w-full rounded-full px-4 py-2.5 text-[15px]")}>Got it</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
