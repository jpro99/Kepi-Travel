"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { trackEvent } from "@/lib/analytics/trackEvent";
import type { PlanFeature } from "@/lib/billing/plans";

export interface UpgradeModalGateContext {
  feature: PlanFeature;
  detail?: string;
}

interface UpgradeModalProps {
  open: boolean;
  gate: UpgradeModalGateContext | null;
  onClose: () => void;
}

export function UpgradeModal({ open, gate, onClose }: UpgradeModalProps) {
  const t = useTranslations("UpgradeModal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featureLabel = useMemo(() => {
    if (!gate) {
      return t("defaultFeatureLabel");
    }
    if (gate.feature === "gmail-import") return t("featureGmailImport");
    if (gate.feature === "ai-suggestions") return t("featureAiSuggestions");
    if (gate.feature === "push-notifications") return t("featurePushNotifications");
    return t("featureMultiTrip");
  }, [gate, t]);

  if (!open || !gate) {
    return null;
  }

  const handleUpgrade = async (): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    void trackEvent({
      type: "upgrade_clicked",
      currentPlan: "free",
      featureGated: gate.feature,
    });
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          successPath: "/billing?checkout=success",
          cancelPath: "/billing?checkout=cancelled",
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        checkoutSessionId?: string;
        url?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `Checkout request failed (${response.status})`);
      }

      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }

      throw new Error(t("checkoutIncomplete"));
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : t("upgradeCheckoutFailed"));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 sm:items-center sm:justify-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="flex h-full w-full flex-col border border-slate-700 bg-white p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:h-auto sm:max-w-lg sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">{t("proBadge")}</p>
            <h2 id="upgrade-modal-title" className="text-xl font-semibold">
              {t("unlockTitle", { feature: featureLabel })}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t("subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            {t("close")}
          </button>
        </header>

        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/70">
          <p className="font-medium">{t("whatYouGetTitle")}</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
            <li>{t("benefitOne")}</li>
            <li>{t("benefitTwo")}</li>
            <li>{t("benefitThree")}</li>
          </ul>
          {gate.detail ? <p className="text-xs text-slate-600 dark:text-slate-400">{gate.detail}</p> : null}
        </div>

        {error ? <p className="mt-3 text-xs text-red-500 dark:text-red-300">{error}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void handleUpgrade();
            }}
            className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? t("startingCheckout") : t("upgradeButton")}
          </button>
          <Link
            href="/billing"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            {t("viewBillingDetails")}
          </Link>
        </div>
      </section>
    </div>
  );
}
