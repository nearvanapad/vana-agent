"use client";

import { useEffect } from "react";

/** Registers the service worker (public/sw.js) that makes VANA installable. Best effort: the site works without it. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") return register();
    addEventListener("load", register, { once: true });
    return () => removeEventListener("load", register);
  }, []);
  return null;
}
