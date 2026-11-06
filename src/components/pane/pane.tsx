"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { ArrowLeftRight, ShieldCheck, X } from "lucide-react";
import { CheckTab } from "./check-tab";
import { usePane, type Tab } from "./pane-context";
import { SwapTab } from "./swap-tab";

export const TABS: { id: Tab; label: string; icon: typeof ShieldCheck }[] = [
  { id: "check", label: "Check token", icon: ShieldCheck },
  { id: "swap", label: "Swap", icon: ArrowLeftRight },
];

function Body({ title }: { title: React.ReactNode }) {
  const pane = usePane();
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-bg/95 px-3 py-2 backdrop-blur">
        {title}
        <div role="tablist" className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pane.tab === id}
              onClick={() => pane.dispatch({ t: "open", tab: id })}
              className={clsx(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
                pane.tab === id ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface-2/60 hover:text-text",
              )}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => pane.dispatch({ t: "close" })} className="ml-auto rounded p-1.5 text-text-2 hover:bg-surface-2" aria-label="Close the side pane">
          <X size={18} />
        </button>
      </header>
      {pane.tab === "check" ? <CheckTab /> : <SwapTab />}
    </div>
  );
}

/** Docked next to the chat on wide screens; a drawer over it on narrower ones. */
export function PaneDock() {
  const pane = usePane();
  if (pane.docked) {
    if (!pane.open) return null;
    return (
      <aside className="sticky top-0 h-dvh w-[440px] shrink-0 overflow-y-auto border-l border-line bg-surface/30 2xl:w-[500px]" aria-label="Side pane">
        <Body title={null} />
      </aside>
    );
  }
  return (
    <Dialog.Root open={pane.open} onOpenChange={(o) => pane.dispatch(o ? { t: "open" } : { t: "close" })}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-void/70" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l border-line bg-bg sm:w-[480px]">
          <Dialog.Description className="sr-only">Token checks and swaps</Dialog.Description>
          <Body title={<Dialog.Title className="sr-only">Side pane</Dialog.Title>} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The buttons above the chat box that open the pane on a tool, or close it. */
export function PaneToggles() {
  const pane = usePane();
  return (
    <div className="mb-2 flex gap-2">
      {TABS.map(({ id, label, icon: Icon }) => {
        const on = pane.open && pane.tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => pane.toggle(id)}
            aria-pressed={on}
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
              on ? "border-accent bg-accent/15 text-accent" : "border-line bg-bg text-text-2 hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon size={13} /> {label}
          </button>
        );
      })}
    </div>
  );
}
