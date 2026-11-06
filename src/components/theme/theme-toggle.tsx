"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { currentTheme, setTheme, type Theme } from "@/lib/theme";

/** data-theme on <html> is the source of truth; the head script sets it before paint. */
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => "dark");
}

/** The sun in the dark theme and the moon in the light one: the icon is where a press takes you. */
export function ThemeToggle() {
  const light = useTheme() === "light";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label="Light theme"
      title={light ? "Switch to the dark theme" : "Switch to the light theme"}
      onClick={() => setTheme(light ? "dark" : "light")}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-bg text-text-2 hover:bg-surface-2 hover:text-text"
    >
      {light ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
