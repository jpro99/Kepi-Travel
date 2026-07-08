"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

type ToggleLocale = "en" | "es";

const AVAILABLE_LOCALES: ToggleLocale[] = ["en", "es"];

export function LanguageToggle() {
  const t = useTranslations("LanguageToggle");
  const tSettings = useTranslations("LanguageSettings");
  const locale = useLocale() as ToggleLocale;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLocaleChange = async (nextLocale: ToggleLocale): Promise<void> => {
    if (busy || nextLocale === locale) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ locale: nextLocale }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? tSettings("saveFailed"));
        return;
      }
      window.location.reload();
    } catch {
      setError(tSettings("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <div className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-800/80">
      {AVAILABLE_LOCALES.map((entry) => {
        const active = entry === locale;
        return (
          <button
            key={entry}
            type="button"
            aria-label={entry === "en" ? t("english") : t("spanish")}
            disabled={busy}
            onClick={() => {
              void handleLocaleChange(entry);
            }}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
              active
                ? "bg-cyan-500 text-slate-950"
                : "text-slate-700 hover:bg-slate-200 dark:text-slate-100 dark:hover:bg-slate-700"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {entry.toUpperCase()}
          </button>
        );
      })}
      </div>
      {error ? <p className="text-[10px] text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
