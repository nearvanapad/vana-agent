/**
 * Theme: follows `prefers-color-scheme` until the user picks one, then the stored choice. THEME_SCRIPT runs inline
 * in <head> before first paint, so the page never flashes the wrong theme.
 */

export type Theme = "dark" | "light";

export const THEME_KEY = "vana:theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="dark"&&t!=="light"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Apply and remember. Storage can be blocked: the theme still applies for this visit. */
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}
