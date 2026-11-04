export const THEME_STORAGE_KEY = "investiq_theme";

export type Theme = "dark" | "light";

/** Keeps <html> in sync: data-theme drives the tokens, .dark drives Tailwind variants. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
}

export function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage disabled — the switch still works for this session
  }
}

/**
 * Runs before paint: a stored choice wins, otherwise the OS preference decides.
 * Kept as a string so it can be inlined into the document head in __root.tsx.
 */
export const themeInitScript = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var t=s==="light"||s==="dark"?s:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;
