"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Download, Ellipsis, EllipsisVertical, ExternalLink, Menu, MonitorDown, Share, SquarePlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { currentGuide, installStore, type Guide } from "@/lib/pwa/install";

/**
 * "Install app": puts VANA on the home screen or desktop as its own app. Opens the browser's
 * install dialog where there is one (Chrome, Edge, Android); elsewhere shows the steps for this
 * browser, or how to leave an app's built-in browser first. Hidden once the app is installed.
 */
export function InstallButton() {
  const { installed } = useSyncExternalStore(installStore.subscribe, installStore.get, installStore.getServer);
  const [guide, setGuide] = useState<Guide | null>(null);
  // The server can't know whether it's installed: show the button only once in the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || installed) return null;

  const install = () => {
    const g = currentGuide();
    // Built-in browsers can't install, even when they offer a prompt: send them to a real browser.
    if (g.kind === "in-app") return setGuide(g);
    void installStore.prompt().then((shown) => !shown && setGuide(g));
  };
  return (
    <>
      <button
        type="button"
        onClick={install}
        className="flex items-center justify-center gap-2 rounded-full border border-line px-3.5 py-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
      >
        <Download size={15} /> Install app
      </button>
      <Dialog.Root open={!!guide} onOpenChange={(o) => !o && setGuide(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="n-fade fixed inset-0 z-[60] grid place-items-center bg-[rgb(10_22_18/0.72)] p-4 backdrop-blur-[4px]">
            {/* Scrolls on short screens; clear of the notch and home bar. */}
            <Dialog.Content className="n-pop flex max-h-[calc(100dvh-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-[400px] flex-col gap-4 overflow-y-auto overscroll-contain rounded-[20px] border border-line bg-surface p-[clamp(18px,5vw,28px)] shadow-[0_30px_60px_rgb(0_0_0/0.45)]">
              {guide && <Sheet guide={guide} />}
              <Dialog.Close className="shrink-0 self-center rounded-full border border-line px-5 py-2 text-sm hover:bg-surface-2">Got it</Dialog.Close>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function Sheet({ guide }: { guide: Guide }) {
  const g = guide;
  const phone = g.kind === "ios-safari" || g.kind === "ios-browser" || g.kind === "android" || (g.kind === "in-app" && g.os !== "other");
  if (g.kind === "in-app") {
    return (
      <>
        <Head title="Open VANA in your browser">
          You&apos;re in an app&apos;s built-in browser, which can&apos;t add apps to your home screen. Open this page in {g.os === "ios" ? "Safari" : g.os === "android" ? "Chrome" : "your browser"} first.
        </Head>
        <ol className="flex flex-col gap-2.5 text-sm">
          <Step icon={<Ellipsis size={16} />}>
            Tap the <b>⋯</b> menu or the share icon, then <b>{g.os === "ios" ? "Open in Safari" : "Open in browser"}</b>. No such option? Copy the link and paste it there.
          </Step>
          <Step icon={<Download size={16} />}>
            There, open VANA&apos;s menu and tap <b>Install app</b> again.
          </Step>
        </ol>
        <div className="flex flex-wrap justify-center gap-2">
          {g.os === "android" && (
            <a
              href={`intent://${location.host}/app#Intent;scheme=https;end`}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
            >
              <ExternalLink size={14} /> Open in browser
            </a>
          )}
          <CopyLink />
        </div>
      </>
    );
  }
  if (g.kind === "desktop-firefox") {
    return (
      <>
        <Head title="Install VANA">Firefox on a computer can&apos;t install apps. Open this page in Chrome, Edge or Safari and click Install app there.</Head>
        <div className="flex justify-center">
          <CopyLink />
        </div>
      </>
    );
  }
  return (
    <>
      <Head title="Install VANA">
        {phone ? "Add it to your home screen. It opens full screen, like any other app." : "Add it to your computer. It opens in its own window, like any other app."}
      </Head>
      <ol className="flex flex-col gap-2.5 text-sm">
        <Steps guide={g} />
      </ol>
    </>
  );
}

function Steps({ guide: g }: { guide: Guide }) {
  switch (g.kind) {
    case "ios-safari":
      return (
        <>
          <Step icon={<Share size={16} />}>
            Tap <b>Share</b> (the square with an arrow), in the bar at the bottom, or at the top on iPad. Don&apos;t see it? Tap <b>⋯</b> first.
          </Step>
          <Step icon={<SquarePlus size={16} />}>
            Scroll down and tap <b>Add to Home Screen</b>.
          </Step>
          <Step icon={<Download size={16} />}>
            Leave <b>Open as Web App</b> on if you see it, then tap <b>Add</b>.
          </Step>
        </>
      );
    case "ios-browser":
      return (
        <>
          <Step icon={<Share size={16} />}>
            {g.name === "Chrome" ? (
              <>
                Tap <b>Share</b> at the right end of the address bar.
              </>
            ) : (
              <>
                Open the {g.name} menu (<b>⋯</b> or <b>≡</b>) and tap <b>Share</b>.
              </>
            )}
          </Step>
          <Step icon={<SquarePlus size={16} />}>
            Tap <b>Add to Home Screen</b> (scroll down if you don&apos;t see it), then <b>Add</b>.
          </Step>
          <Step icon={<Download size={16} />}>Not there? Open this page in Safari and add it from there.</Step>
        </>
      );
    case "android":
      if (g.browser === "edge") {
        return (
          <>
            <Step icon={<Menu size={16} />}>
              Tap the menu <b>≡</b> at the bottom.
            </Step>
            <Step icon={<SquarePlus size={16} />}>
              Tap <b>Add to phone</b> (or <b>Install app</b>), then <b>Install</b>.
            </Step>
          </>
        );
      }
      if (g.browser === "samsung") {
        return (
          <>
            <Step icon={<Menu size={16} />}>
              Tap the menu <b>≡</b> at the bottom right.
            </Step>
            <Step icon={<SquarePlus size={16} />}>
              Tap <b>Add page to</b>, then <b>Home screen</b>, then <b>Add</b>.
            </Step>
          </>
        );
      }
      return (
        <>
          <Step icon={<EllipsisVertical size={16} />}>
            Tap the menu <b>⋮</b> {g.browser === "firefox" ? "next to the address bar" : "at the top right"}.
          </Step>
          <Step icon={<SquarePlus size={16} />}>
            {g.browser === "firefox" ? (
              <>
                Tap <b>Add app to Home screen</b> (or <b>Add to Home screen</b>), then <b>Add</b>.
              </>
            ) : (
              <>
                Tap <b>Install app</b> or <b>Add to home screen</b>, then <b>Install</b>.
              </>
            )}
          </Step>
        </>
      );
    case "mac-safari":
      return (
        <>
          <Step icon={<SquarePlus size={16} />}>
            Choose <b>File → Add to Dock</b>, or click <b>Share</b> → <b>Add to Dock</b> (macOS Sonoma or later).
          </Step>
          <Step icon={<Download size={16} />}>
            Click <b>Add</b>. VANA opens from the Dock in its own window.
          </Step>
        </>
      );
    case "desktop":
      return (
        <>
          <Step icon={<MonitorDown size={16} />}>Click the install icon at the right end of the address bar.</Step>
          <Step icon={<EllipsisVertical size={16} />}>
            {g.browser === "edge" ? (
              <>
                No icon? Open <b>⋯</b> → <b>Apps</b> → <b>Install this site as an app</b>.
              </>
            ) : (
              <>
                No icon? Open <b>⋮</b> → <b>Cast, save and share</b> → <b>Install page as app</b>.
              </>
            )}
          </Step>
          <Step icon={<Download size={16} />}>
            Click <b>Install</b>.
          </Step>
        </>
      );
    default:
      return null;
  }
}

function Head({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink">
        <Download size={20} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <Dialog.Title className="font-display text-[clamp(20px,5vw,22px)] leading-[1.15] font-normal">{title}</Dialog.Title>
        <Dialog.Description className="text-sm text-pretty text-text-2">{children}</Dialog.Description>
      </div>
    </div>
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

/** Copies the app's link, to paste into a real browser. */
function CopyLink() {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard
      ?.writeText(`${location.origin}/app`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm hover:bg-surface-2">
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Link copied" : "Copy link"}
    </button>
  );
}
