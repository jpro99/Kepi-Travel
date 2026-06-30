export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "kepi-theme";
export const THEME_EVENT = "kepi-theme-change";
export const META_COLORS: Record<ThemeMode, string> = { dark: "#000000", light: "#f5f5f7" };

export function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return "light";
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  const meta = document.querySelector("meta[name='theme-color']");
  if (meta) meta.setAttribute("content", META_COLORS[theme]);
}

export function setTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  applyTheme(theme);
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

export function subscribeTheme(listener: (theme: ThemeMode) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent): void => {
    if (e.key === THEME_STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
      listener(e.newValue);
    }
  };
  const onCustom = (e: Event): void => {
    const detail = (e as CustomEvent<ThemeMode>).detail;
    if (detail === "light" || detail === "dark") listener(detail);
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onCustom);
  };
}
