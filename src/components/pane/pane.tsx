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

/** Where the open pane shows: inside the chat on wide screens, a window the user drags once detached, else a drawer. */
export function usePaneMode(): Mode | null {
  const pane = usePane();
  if (!pane.open) return null;
  if (pane.floating && pane.canFloat) return "float";
  return pane.docked ? "inline" : "drawer";
}

function Body({ title, mode, grab }: { title: React.ReactNode; mode: Mode; grab?: (e: React.PointerEvent) => void }) {
  const pane = usePane();
  return (
    <div className="flex min-h-full flex-col">
      <header
        onPointerDown={grab}
        className={clsx(
          "sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-bg/95 px-3 py-2 backdrop-blur",
          grab && "cursor-grab touch-none select-none active:cursor-grabbing",
        )}
      >
        {title}
        {grab && <GripVertical size={14} className="-mr-1 shrink-0 text-text-2/60" aria-hidden />}
        {/* Phones switch tools from the tab bar, so the header just names this one. */}
        <span className="px-1 text-sm font-semibold md:hidden">{TABS.find((t) => t.id === pane.tab)?.label}</span>
        <div role="tablist" className="flex gap-1 max-md:hidden">
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
        <div className="ml-auto flex items-center">
          {pane.canFloat && (
            <button
              type="button"
              onClick={() => pane.setFloating(mode !== "float")}
              className="rounded p-1.5 text-text-2 hover:bg-surface-2 hover:text-text"
              aria-label={mode === "float" ? "Dock the pane" : "Detach the pane"}
              title={mode === "float" ? "Dock it back into the chat" : "Detach into a window you can drag"}
            >
              {mode === "float" ? <PanelRight size={16} /> : <PictureInPicture2 size={16} />}
            </button>
          )}
          <button type="button" onClick={() => pane.dispatch({ t: "close" })} className="rounded p-1.5 text-text-2 hover:bg-surface-2 hover:text-text" aria-label="Close the side pane">
            <X size={18} />
          </button>
        </div>
      </header>
      {pane.tab === "check" ? <CheckTab /> : <SwapTab />}
    </div>
  );
}

/** The pane inside the chat, between the header and the chat box, beside the messages. */
export function PaneInline() {
  if (usePaneMode() !== "inline") return null;
  return (
    <aside className="mb-2 w-[440px] shrink-0 overflow-y-auto rounded-card border border-line bg-surface/30 2xl:w-[500px]" aria-label="Side pane">
      <Body title={null} mode="inline" />
    </aside>
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
      className="fixed z-30 resize overflow-y-auto rounded-card border border-line bg-bg shadow-2xl shadow-void/60"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, minWidth: MIN_W, minHeight: MIN_H }}
    >
      <Body title={null} mode="float" grab={grab} />
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
        <div className={clsx("fixed inset-x-0 top-15 z-40 bg-scrim", BOTTOM)} aria-hidden />
        <Dialog.Content
          onInteractOutside={(e) => {
            // The tab bar switches the drawer's tab itself.
            if ((e.detail.originalEvent.target as Element | null)?.closest("[data-tab-bar]")) e.preventDefault();
          }}
          className={clsx("fixed right-0 top-15 z-50 w-full overflow-y-auto rounded-t-card border-x border-t border-line bg-bg sm:w-[480px]", BOTTOM)}
        >
          <Dialog.Description className="sr-only">Token checks and swaps</Dialog.Description>
          <Body title={<Dialog.Title className="sr-only">Side pane</Dialog.Title>} mode="drawer" />
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

/** The buttons above the chat box that open the pane on a tool, or close it. Phones use the tab bar instead. */
export function PaneToggles() {
  const pane = usePane();
  return (
    <div className="mb-2 hidden gap-2 md:flex">
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
              on ? "border-accent-deep bg-accent/15 text-accent-deep" : "border-line bg-bg text-text-2 hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon size={13} /> {label}
          </button>
        );
      })}
    </div>
  );
}
