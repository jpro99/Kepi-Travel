"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  readStoredTheme,
  setTheme,
  subscribeTheme,
  type ThemeMode,
} from "@/lib/theme/kepiTheme";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    return subscribeTheme((next) => setThemeState(next));
  }, [theme]);

  const toggleTheme = (): void => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {theme === "light" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3c.38 0 .76.03 1.13.08A7 7 0 0 0 21 12.79Z" fill="currentColor" stroke="none"/>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}

export function ThemePicker() {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    return subscribeTheme((next) => setThemeState(next));
  }, [theme]);

  const pick = (next: ThemeMode): void => {
    setThemeState(next);
    setTheme(next);
  };

  return (
    <div className="flex gap-1.5 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
      {(["light", "dark"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => pick(mode)}
          className={`min-h-[48px] flex-1 rounded-xl text-[17px] font-bold capitalize transition ${
            theme === mode
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
              : "text-slate-600 dark:text-slate-400"
          }`}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
