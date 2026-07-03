"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

type ToggleLocale = "en" | "es";

const AVAILABLE_LOCALES: ToggleLocale[] = ["en", "es"];

export function LanguageSettingsCard() {
  const t = useTranslations("LanguageSettings");
  const tToggle = useTranslations("LanguageToggle");
  const locale = useLocale() as ToggleLocale;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleLocaleChange = async (nextLocale: ToggleLocale): Promise<void> => {
    if (busy || nextLocale === locale) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ locale: nextLocale }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; locale?: string };
      if (!response.ok) {
        setMessage(payload.error ?? t("saveFailed"));
        return;
      }
      setMessage(nextLocale === "es" ? t("savedSpanish") : t("savedEnglish"));
      window.location.reload();
    } catch {
      setMessage(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("subtitle")}</p>
      <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-800/80">
        {AVAILABLE_LOCALES.map((entry) => {
          const active = entry === locale;
          return (
            <button
              key={entry}
              type="button"
              aria-label={entry === "en" ? tToggle("english") : tToggle("spanish")}
              disabled={busy}
              onClick={() => {
                void handleLocaleChange(entry);
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                active
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-700 hover:bg-slate-200 dark:text-slate-100 dark:hover:bg-slate-700"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {entry === "en" ? tToggle("english") : tToggle("spanish")}
            </button>
          );
        })}
      </div>
      {message ? (
        <p
          className={`mt-2 text-xs ${
            message.includes("Failed") || message.includes("falló") || message.includes("No se")
              ? "text-rose-600 dark:text-rose-400"
              : "text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {message}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {locale === "es" ? t("activeSpanish") : t("activeEnglish")}
      </p>
    </section>
  );
}
