// Theme preference: "system" (follow the device), "light" or "dark". Stored in the browser only; the page works without storage.
const KEY = "panel-theme";
export const THEMES = ["system", "light", "dark"];

export function readTheme() {
  try { const stored = window.localStorage.getItem(KEY); return THEMES.includes(stored) ? stored : "system"; } catch { return "system"; }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme); else root.removeAttribute("data-theme");
  try { window.localStorage.setItem(KEY, theme); } catch { /* storage can be blocked */ }
}
