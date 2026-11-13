/**
 * Installing VANA as an app (PWA). Chromium (Android, desktop Chrome and Edge) fires
 * `beforeinstallprompt` once, moments after load and long before React hydrates, so INSTALL_SCRIPT
 * runs inline in <head> to keep the event for the Install button to use later. Safari (iOS and
 * macOS) and Firefox never fire it: there the button explains how to add the app by hand.
 */

/** Inline in <head>, before any bundle: keeps the install prompt and says when the app got installed. */
export const INSTALL_SCRIPT = `(function(){window.__vanaInstall=null;addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__vanaInstall=e;dispatchEvent(new Event("vana:installprompt"))});addEventListener("appinstalled",function(){window.__vanaInstall=null;dispatchEvent(new Event("vana:installed"))})})()`;

/** Chromium's install prompt (not in lib.dom). */
export type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __vanaInstall?: InstallPromptEvent | null;
  }
}

export type InstallState = {
  /** The native prompt, when the browser offered one. */
  canPrompt: boolean;
  /** This page is the installed app, or Chromium says the app is installed. */
  installed: boolean;
};

const SERVER: InstallState = { canPrompt: false, installed: false };

/** Running as the installed app: its own window or home-screen launch. */
function standalone(): boolean {
  return (
    ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some((m) => matchMedia(`(display-mode: ${m})`).matches) ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function createStore() {
  let state = SERVER;
  let event: InstallPromptEvent | null = null;
  const subs = new Set<() => void>();
  const set = (next: Partial<InstallState>) => {
    const s = { ...state, ...next };
    if (s.canPrompt === state.canPrompt && s.installed === state.installed) return;
    state = s;
    subs.forEach((fn) => fn());
  };

  if (typeof window !== "undefined") {
    event = window.__vanaInstall ?? null;
    state = { canPrompt: !!event, installed: standalone() };
    const onPrompt = (e: Event) => {
      e.preventDefault();
      event = window.__vanaInstall ?? (e as InstallPromptEvent);
      set({ canPrompt: true });
    };
    addEventListener("vana:installprompt", onPrompt);
    addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => {
      event = null;
      set({ canPrompt: false, installed: true });
    };
    addEventListener("vana:installed", onInstalled);
    addEventListener("appinstalled", onInstalled);
    // From a browser tab, Chromium can tell the app is already installed (the manifest lists
    // itself under related_applications). Nothing else can, so elsewhere the button stays.
    const nav = navigator as { getInstalledRelatedApps?: () => Promise<{ platform?: string }[]> };
    void nav
      .getInstalledRelatedApps?.()
      .then((apps) => apps.some((a) => a.platform === "webapp") && set({ installed: true }))
      .catch(() => {});
  }

  return {
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    get: () => state,
    getServer: () => SERVER,
    /** Opens the native install dialog. False when there is none to open (Safari, Firefox). */
    async prompt(): Promise<boolean> {
      const e = event;
      if (!e) return false;
      // One use per event: Chromium offers a fresh one on a later visit if this is dismissed.
      event = null;
      window.__vanaInstall = null;
      set({ canPrompt: false });
      try {
        await e.prompt();
        if ((await e.userChoice).outcome === "accepted") set({ installed: true });
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const installStore = createStore();

/** iPhone and iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
