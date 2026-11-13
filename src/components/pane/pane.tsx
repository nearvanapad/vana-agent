"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { ArrowLeftRight, GripVertical, MessageSquare, PanelRight, PictureInPicture2, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CheckTab } from "./check-tab";
import { usePane, type Tab } from "./pane-context";
import { SwapTab } from "./swap-tab";

export const TABS: { id: Tab; label: string; icon: typeof ShieldCheck }[] = [
  { id: "check", label: "Check token", icon: ShieldCheck },
  { id: "swap", label: "Swap", icon: ArrowLeftRight },
];

type Mode = "inline" | "float" | "drawer";

/** Where the open pane shows: a column beside the chat on wide screens, a window the user drags once detached, else a drawer. */
export function usePaneMode(): Mode | null {
  const pane = usePane();
  if (!pane.open) return null;
  if (pane.floating && pane.canFloat) return "float";
  return pane.docked ? "inline" : "drawer";
}

/** A swap the chat prepared, still waiting for the wallet. */
function useWaitingSwap(): boolean {
  const pane = usePane();
  return pane.items.some((i) => i.kind === "proposal" && i.status === "done" && i.proposal && Date.parse(i.proposal.expires_at) > Date.now());
}

function Body({ mode, grab, title }: { mode: Mode; grab?: (e: React.PointerEvent) => void; title?: (text: string) => React.ReactNode }) {
  const pane = usePane();
  const text = TABS.find((t) => t.id === pane.tab)?.label ?? "";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        onPointerDown={grab}
        className={clsx(
          "flex h-15 shrink-0 items-center justify-between gap-2 border-b border-line pr-2 pl-[clamp(12px,3vw,20px)]",
          grab && "cursor-grab touch-none select-none active:cursor-grabbing",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {grab && <GripVertical size={14} className="-ml-1 shrink-0 text-text-2/60" aria-hidden />}
          {title ? title(text) : <span className="truncate font-display text-base tracking-[0.02em]">{text}</span>}
        </span>
        <div className="flex items-center gap-0.5">
          {pane.canFloat && (
            <button
              type="button"
              onClick={() => pane.setFloating(mode !== "float")}
              className="grid size-8 place-items-center rounded-lg text-text-2 hover:bg-surface-2 hover:text-text"
              aria-label={mode === "float" ? "Dock the pane" : "Detach the pane"}
              title={mode === "float" ? "Dock it back beside the chat" : "Detach into a window you can drag"}
            >
              {mode === "float" ? <PanelRight size={16} /> : <PictureInPicture2 size={16} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => pane.dispatch({ t: "close" })}
            className="grid size-8 place-items-center rounded-lg text-text-2 hover:bg-surface-2 hover:text-text"
            aria-label="Close the side pane"
          >
            <X size={17} />
          </button>
        </div>
      </header>
      {/* Keyed, so switching tools fades the new one in. */}
      <div key={pane.tab} className="m-rise flex min-h-0 flex-1 flex-col">
        {pane.tab === "check" ? <CheckTab /> : <SwapTab />}
      </div>
    </div>
  );
}

/** The pane as a column beside the chat, full height, on wide screens. */
export function PaneDocked() {
  if (usePaneMode() !== "inline") return null;
  return (
    <aside className="n-fade flex h-dvh w-[440px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface/30" aria-label="Side pane">
      <Body mode="inline" />
    </aside>
  );
}

/** The tools in the header, as one segmented switch: each opens the pane on it, or closes it. Phones use the tab bar. */
export function PaneTabs() {
  const pane = usePane();
  const waiting = useWaitingSwap();
  return (
    <div role="tablist" aria-label="Tools" className="hidden gap-0.5 rounded-full border border-line bg-surface p-[3px] md:flex">
      {TABS.map(({ id, label, icon: Icon }) => {
        const on = pane.open && pane.tab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => pane.toggle(id)}
            className={clsx("flex items-center gap-1.5 rounded-full px-3 py-[5px] text-[13px] whitespace-nowrap hover:text-text", on ? "bg-surface-2 text-text" : "text-text-2")}
          >
            <Icon size={14} /> {label}
            {id === "swap" && waiting && !on && <span className="size-[7px] rounded-full bg-accent-deep" aria-label="A swap is waiting for your approval" />}
          </button>
        );
      })}
    </div>
  );
}

type Box = { x: number; y: number; w: number; h: number };
const BOX_KEY = "vana:pane-box";
const MIN_W = 360;
const MIN_H = 320;

/** Keeps the window on screen and at least its minimum size. */
function fit(b: Box): Box {
  const w = Math.min(Math.max(b.w, MIN_W), innerWidth - 16);
  const h = Math.min(Math.max(b.h, MIN_H), innerHeight - 16);
  return { w, h, x: Math.min(Math.max(b.x, 8), innerWidth - w - 8), y: Math.min(Math.max(b.y, 8), innerHeight - h - 8) };
}

function savedBox(): Box {
  try {
    const b = JSON.parse(localStorage.getItem(BOX_KEY) ?? "null") as Box | null;
    if (b) return fit(b);
  } catch {}
  const w = 440;
  return fit({ w, h: Math.min(720, innerHeight - 120), x: innerWidth - w - 24, y: 72 });
}

/** The detached pane: a window over the page, dragged by its header and resized from its corner. */
function Floating() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>(savedBox);
  const boxRef = useRef(box);
  boxRef.current = box;
  const save = () => {
    try {
      localStorage.setItem(BOX_KEY, JSON.stringify(boxRef.current));
    } catch {}
  };

  // Keep it on screen when the browser window shrinks, and remember a size the user drags to.
  useEffect(() => {
    const onResize = () => setBox((b) => fit(b));
    addEventListener("resize", onResize);
    const el = ref.current;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      if (!el) return;
      const { offsetWidth: w, offsetHeight: h } = el;
      const b = boxRef.current;
      if (w === b.w && h === b.h) return;
      boxRef.current = { ...b, w, h };
      clearTimeout(t);
      t = setTimeout(() => {
        setBox(boxRef.current);
        save();
      }, 200);
    });
    if (el) ro.observe(el);
    return () => {
      removeEventListener("resize", onResize);
      ro.disconnect();
      clearTimeout(t);
    };
  }, []);

  const grab = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const start = { px: e.clientX, py: e.clientY, x: boxRef.current.x, y: boxRef.current.y };
    const header = e.currentTarget as HTMLElement;
    header.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => setBox(fit({ ...boxRef.current, x: start.x + m.clientX - start.px, y: start.y + m.clientY - start.py }));
    const up = () => {
      header.removeEventListener("pointermove", move);
      header.removeEventListener("pointerup", up);
      header.removeEventListener("pointercancel", up);
      save();
    };
    header.addEventListener("pointermove", move);
    header.addEventListener("pointerup", up);
    header.addEventListener("pointercancel", up);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Token checks and swaps"
      className="m-float fixed z-30 resize overflow-hidden rounded-card border border-line bg-bg shadow-2xl shadow-void/60"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, minWidth: MIN_W, minHeight: MIN_H }}
    >
      <Body mode="float" grab={grab} />
    </div>
  );
}

/** The pane when it is not inside the chat: a floating window once detached, else a drawer under the header. */
export function PaneOverlay() {
  const pane = usePane();
  const mode = usePaneMode();
  if (mode === "float") return <Floating />;
  if (pane.docked) return null;
  return (
    // Not modal, so the header and the tab bar stay usable while it is open.
    <Dialog.Root modal={false} open={mode === "drawer"} onOpenChange={(o) => pane.dispatch(o ? { t: "open" } : { t: "close" })}>
      <Dialog.Portal>
        {/* Between the header and the tab bar, so both stay in view. */}
        <div data-state={mode === "drawer" ? "open" : "closed"} className={clsx("m-scrim fixed inset-x-0 top-15 z-40 bg-scrim", BOTTOM)} aria-hidden />
        <Dialog.Content
          // Focus stays where the user pressed; Tab moves into the drawer.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // The tab bar switches the drawer's tab itself.
            if ((e.detail.originalEvent.target as Element | null)?.closest("[data-tab-bar]")) e.preventDefault();
          }}
          className={clsx("m-drawer-right fixed right-0 top-15 z-50 w-full overflow-hidden border-l border-line bg-bg shadow-[-12px_0_32px_rgb(0_0_0/0.35)] sm:w-[440px]", BOTTOM)}
        >
          <Dialog.Description className="sr-only">Token checks and swaps</Dialog.Description>
          <Body mode="drawer" title={(text) => <Dialog.Title className="truncate font-display text-base tracking-[0.02em]">{text}</Dialog.Title>} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Clears the tab bar on phones; reaches the bottom where there is none. */
const BOTTOM = "bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0";

/** On phones, a tab bar at the foot of the screen: the chat, or the pane on one of its tools. */
export function PaneTabBar() {
  const pane = usePane();
  const items = [{ id: "chat" as const, label: "Chat", icon: MessageSquare }, ...TABS];
  return (
    <nav data-tab-bar aria-label="Sections" className="grid shrink-0 grid-cols-3 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ id, label, icon: Icon }) => {
        const on = id === "chat" ? !pane.open : pane.open && pane.tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => pane.dispatch(id === "chat" ? { t: "close" } : { t: "open", tab: id })}
            aria-current={on ? "page" : undefined}
            className={clsx("flex h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem]", on ? "text-accent-deep" : "text-text-2")}
          >
            <Icon size={20} strokeWidth={on ? 2.25 : 1.75} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
