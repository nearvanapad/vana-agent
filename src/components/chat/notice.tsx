"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "@/components/session/use-session";
import { NEARVANA_INTRO, NearvanaLink } from "@/components/nearvana/nearvana";
import { EYEBROW, STICKER } from "@/components/ui/styles";
import { Mascot } from "@/components/vana/mascot";

const SEEN = "vana:notice-seen";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="var(--accent-deep)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const POINTS: { icon: ReactNode; text: string }[] = [
  {
    icon: (
      <Icon>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </Icon>
    ),
    text: "Read-only checks from public chain data.",
  },
  {
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </Icon>
    ),
    text: "Not financial advice.",
  },
  {
    icon: (
      <Icon>
        <rect x="2" y="5" width="20" height="15" rx="2" />
        <path d="M2 10h20" />
        <path d="M16 15h2" />
      </Icon>
    ),
    text: "Your wallet signs, never the AI.",
  },
];

/** The first time this browser opens the app: what VANA does and doesn't do. Closed by "Got it" or Escape. */
export function Notice() {
  const session = useSession();
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
    // Waits for the session so it opens over the screen the visitor will actually see.
    <Dialog.Root open={session.ready && !seen} onOpenChange={(o) => !o && dismiss()}>
      <Dialog.Portal>
        {/* The scrim centres the card, so the card's pop-in transform has nothing to fight. */}
        <Dialog.Overlay className="n-fade fixed inset-0 z-[60] grid place-items-center bg-[rgb(10_22_18/0.72)] p-4 backdrop-blur-[4px]">
          <Dialog.Content
            // Only "Got it" or Escape close it.
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            className="n-pop flex w-full max-w-[400px] flex-col items-center gap-4 rounded-[20px] border border-line bg-surface p-[clamp(20px,5vw,28px)] text-center shadow-[0_30px_60px_rgb(0_0_0/0.45)]"
          >
            <Mascot mood="happy" size={72} />
            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="font-display text-[clamp(20px,5vw,24px)] leading-[1.15] font-normal">Before we start</Dialog.Title>
              <Dialog.Description className="text-sm text-pretty text-text-2">A few things to know about how I work.</Dialog.Description>
            </div>
            <ul className="flex w-full flex-col gap-2 text-left text-sm">
              {POINTS.map(({ icon, text }) => (
                <li key={text} className="flex items-center gap-3 rounded-well bg-surface-2 px-3 py-2.5">
                  {icon}
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <div className="flex w-full flex-col gap-2 text-left">
              <span className={clsx(EYEBROW, "text-text-2")}>New here? Try our launchpad</span>
              <NearvanaLink blurb={NEARVANA_INTRO} />
            </div>
            <Dialog.Close className={clsx(STICKER, "w-full rounded-full px-4 py-[11px] text-[15px]")}>Got it</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
