"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Download, EllipsisVertical, Share, SquarePlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { installStore, isIos } from "@/lib/pwa/install";

/**
 * "Install app": puts VANA on the home screen or desktop as its own app. Opens the browser's
 * install dialog where there is one (Chrome, Edge, Android); elsewhere (iPhone, iPad, Safari,
 * Firefox) shows how to add it by hand. Hidden once the app is installed.
 */
export function InstallButton() {
  const { installed } = useSyncExternalStore(installStore.subscribe, installStore.get, installStore.getServer);
  const [help, setHelp] = useState(false);
  // The server can't know whether it's installed: show the button only once in the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || installed) return null;

  const install = () => void installStore.prompt().then((shown) => !shown && setHelp(true));
  const ios = isIos();
  return (
    <>
      <button
        type="button"
        onClick={install}
        className="flex items-center justify-center gap-2 rounded-full border border-line px-3.5 py-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
      >
        <Download size={15} /> Install app
      </button>
      <Dialog.Root open={help} onOpenChange={setHelp}>
        <Dialog.Portal>
          <Dialog.Overlay className="n-fade fixed inset-0 z-[60] grid place-items-center bg-[rgb(10_22_18/0.72)] p-4 backdrop-blur-[4px]">
            <Dialog.Content className="n-pop flex w-full max-w-[380px] flex-col gap-4 rounded-[20px] border border-line bg-surface p-[clamp(20px,5vw,28px)] shadow-[0_30px_60px_rgb(0_0_0/0.45)]">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink">
                  <Download size={20} />
                </span>
                <div className="flex flex-col gap-1">
                  <Dialog.Title className="font-display text-[clamp(20px,5vw,22px)] leading-[1.15] font-normal">Install VANA</Dialog.Title>
                  <Dialog.Description className="text-sm text-pretty text-text-2">
                    Open it from your {ios ? "home screen" : "home screen or desktop"} in its own window, like any other app.
                  </Dialog.Description>
                </div>
              </div>
              <ol className="flex flex-col gap-2.5 text-sm">
                {ios ? (
                  <>
                    <Step icon={<Share size={16} />}>
                      Tap <b>Share</b> in the browser bar.
                    </Step>
                    <Step icon={<SquarePlus size={16} />}>
                      Choose <b>Add to Home Screen</b> (scroll down if you don&apos;t see it).
                    </Step>
                    <Step icon={<Download size={16} />}>
                      Tap <b>Add</b>.
                    </Step>
                  </>
                ) : (
                  <>
                    <Step icon={<EllipsisVertical size={16} />}>
                      Open the browser menu, or the install icon at the end of the address bar.
                    </Step>
                    <Step icon={<SquarePlus size={16} />}>
                      Choose <b>Install app</b> or <b>Add to Home screen</b> (on a Mac in Safari: <b>File → Add to Dock</b>).
                    </Step>
                    <Step icon={<Download size={16} />}>No such option? Open this page in Chrome, Edge or Safari: Firefox can&apos;t install apps.</Step>
                  </>
                )}
              </ol>
              <Dialog.Close className="self-center rounded-full border border-line px-5 py-2 text-sm hover:bg-surface-2">Got it</Dialog.Close>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function Step({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-well bg-surface-2 px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-accent-deep">{icon}</span>
      <span className="text-pretty">{children}</span>
    </li>
  );
}
