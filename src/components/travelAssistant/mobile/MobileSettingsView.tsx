"use client";

import { useLocale, useTranslations } from "next-intl";
import { openBugReport, openSupportChat } from "@/components/support/SupportChat";
import { ThemePicker } from "@/components/ThemeToggle";
import { LanguageSettingsCard } from "@/components/LanguageSettingsCard";
import { OfflineTravelKitSettingsCard } from "@/components/travelAssistant/OfflineTravelKitSettingsCard";
import { PlanRedeemCard } from "@/components/billing/PlanRedeemCard";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";
import { ConsumerSectionIcon } from "@/components/travelAssistant/ConsumerSectionIcon";
import { appleBtnPrimary, appleCard, appleCaption, appleCardTitle, appleMetadata } from "@/lib/ui/appleDesign";

interface MobileSettingsViewProps {
  emailForwardAddress: string | null;
  onCopyForwardAddress: () => void;
  pushSubscribed: boolean;
  pushBusy: boolean;
  pushMessage: string | null;
  onEnablePush: () => void | Promise<void>;
  billingLoading: boolean;
  isLifetime: boolean;
  isTrial: boolean;
  trialDaysRemaining: number;
  trialExpiresAt: string | null;
  hasProAccess: boolean;
  emailForwardSetupMessage?: string | null;
  offlineKitSavedAtLabel?: string | null;
  offlineKitReservationCount?: number;
  offlineKitSyncing?: boolean;
  onRefreshOfflineKit?: () => void;
  onOpenPhotos?: () => void;
  onSignOut: () => void;
}

export function MobileSettingsView({
  emailForwardAddress,
  onCopyForwardAddress,
  pushSubscribed,
  pushBusy,
  pushMessage,
  onEnablePush,
  billingLoading,
  isLifetime,
  isTrial,
  trialDaysRemaining,
  trialExpiresAt,
  hasProAccess,
  emailForwardSetupMessage,
  offlineKitSavedAtLabel = null,
  offlineKitReservationCount = 0,
  offlineKitSyncing = false,
  onRefreshOfflineKit,
  onOpenPhotos,
  onSignOut,
}: MobileSettingsViewProps) {
  const locale = useLocale();
  const tNav = useTranslations("ConsumerNav");
  const tSupport = useTranslations("SupportPage");
  const t = useTranslations("MoreSettings");
  const dateTag = locale === "es" ? "es-ES" : "en-US";
  return (
    <section className="space-y-4 pb-4">
      <OfflineTravelKitSettingsCard
        savedAtLabel={offlineKitSavedAtLabel}
        reservationCount={offlineKitReservationCount}
        syncing={offlineKitSyncing}
        onRefresh={() => {
          onRefreshOfflineKit?.();
        }}
      />

      <article className={`${appleCard} p-4`}>
        <h2 className={appleCardTitle}>{t("forwardEmailTitle")}</h2>
        {emailForwardAddress ? (
          <>
            <p className={`${appleMetadata} mt-1`}>{emailForwardAddress}</p>
            <button
              type="button"
              onClick={onCopyForwardAddress}
              className={`mt-3 w-full min-h-[44px] ${appleBtnPrimary}`}
            >
              {t("forwardEmailCopy")}
            </button>
            <p className={`${appleCaption} mt-2`}>{t("forwardEmailHint")}</p>
          </>
        ) : (
          <p className={`${appleMetadata} mt-1`}>{t("forwardEmailAssigning")}</p>
        )}
      </article>

      <article className={`${appleCard} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={appleCardTitle}>{t("flightAlertsTitle")}</h2>
          {pushSubscribed ? (
            <span className="text-[13px] font-medium text-[var(--success)]">{t("flightAlertsActive")}</span>
          ) : null}
        </div>
        <p className={`${appleMetadata} mt-1`}>{t("flightAlertsBody")}</p>
        {!pushSubscribed ? (
          <button
            type="button"
            onClick={() => {
              void onEnablePush();
            }}
            disabled={pushBusy}
            className={`mt-3 w-full min-h-[44px] ${appleBtnPrimary} disabled:opacity-60`}
          >
            {pushBusy ? t("flightAlertsEnabling") : t("flightAlertsEnable")}
          </button>
        ) : (
          <p className="mt-3 text-[15px] font-medium text-[var(--success)]">{t("flightAlertsOn")}</p>
        )}
        {pushMessage ? (
          <p
            className={`mt-2 text-[13px] ${
              pushMessage.startsWith("✅") ? "text-[var(--success)]" : "text-[var(--destructive)]"
            }`}
          >
            {pushMessage}
          </p>
        ) : null}
      </article>

      <article className={`${appleCard} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={appleCardTitle}>{t("planStatusTitle")}</h2>
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">
            {isLifetime
              ? t("planPro")
              : isTrial
                ? t("planTrial", { days: trialDaysRemaining })
                : hasProAccess
                  ? t("planPro")
                  : t("planFree")}
          </span>
        </div>
        <p className={`${appleMetadata} mt-2`}>
          {billingLoading
            ? t("planLoading")
            : isLifetime
              ? t("planLifetime")
              : isTrial
                ? trialExpiresAt
                  ? t("planTrialEnds", {
                      date: new Date(trialExpiresAt).toLocaleDateString(dateTag),
                    })
                  : t("planTrialSoon")
                : hasProAccess
                  ? t("planProActive")
                  : t("planFreeBody")}
        </p>
      </article>

      {onOpenPhotos ? (
        <button
          type="button"
          onClick={onOpenPhotos}
          className={`block w-full p-4 text-left font-semibold text-[var(--text-primary)] ${appleCard}`}
        >
          <span className="flex items-center gap-3">
            <ConsumerSectionIcon section="photos" className="h-5 w-5" />
            Photos
          </span>
          <p className={`${appleCaption} mt-0.5 font-normal`}>Trip memories and keepsake collage</p>
        </button>
      ) : null}

      <PlanRedeemCard compact />

      <section className={`${appleCard} p-4`}>
        <h2 className={appleCardTitle}>{t("appearanceTitle")}</h2>
        <p className={`${appleMetadata} mb-3 mt-1`}>{t("appearanceBody")}</p>
        <ThemePicker />
      </section>

      <LanguageSettingsCard />

      <button
        type="button"
        onClick={() => openSupportChat()}
        className={`block w-full p-4 text-left font-semibold text-[var(--text-primary)] ${appleCard}`}
      >
        {tNav("support")}
        <p className={`${appleCaption} mt-0.5 font-normal`}>{tSupport("subtitle")}</p>
      </button>

      <button
        type="button"
        onClick={() => openBugReport()}
        className={`block w-full p-4 text-left font-semibold text-[var(--text-primary)] ${appleCard}`}
      >
        <span className="flex items-center gap-3">
          <ConsumerSectionIcon section="bug" className="h-5 w-5" />
          Report a bug or crash
        </span>
        <p className={`${appleCaption} mt-0.5 font-normal`}>
          AI reviews your report and texts Jeff if it&apos;s a real code issue.
        </p>
      </button>

      {emailForwardSetupMessage ? (
        <p className="text-[13px] text-[var(--text-secondary)]">{emailForwardSetupMessage}</p>
      ) : null}

      <button
        type="button"
        onClick={() => {
          const doReload = () => {
            setTimeout(() => window.location.reload(), 800);
          };
          if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage("CLEAR_ALL_CACHES");
            navigator.serviceWorker.onmessage = doReload;
            setTimeout(doReload, 1500);
          } else {
            void window.caches?.keys().then((keys) => Promise.all(keys.map((k) => window.caches.delete(k)))).then(doReload).catch(doReload);
          }
        }}
        className={`w-full p-4 text-left ${appleCard}`}
      >
        <span className={appleCardTitle}>{t("cacheTitle")}</span>
        <p className={`${appleCaption} mt-0.5`}>{t("cacheBody")}</p>
      </button>

      <DeleteAccountSection />

      <button
        type="button"
        onClick={onSignOut}
        className={`w-full p-4 text-left font-semibold text-[var(--destructive)] ${appleCard}`}
      >
        {t("signOut")}
      </button>
    </section>
  );
}
