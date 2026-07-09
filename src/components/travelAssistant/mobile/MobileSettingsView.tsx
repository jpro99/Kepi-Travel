"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { openSupportChat } from "@/components/support/SupportChat";
import { ThemePicker } from "@/components/ThemeToggle";
import { LanguageSettingsCard } from "@/components/LanguageSettingsCard";
import { OfflineTravelKitSettingsCard } from "@/components/travelAssistant/OfflineTravelKitSettingsCard";
import { PlanRedeemCard } from "@/components/billing/PlanRedeemCard";
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
  onSignOut,
}: MobileSettingsViewProps) {
  const tNav = useTranslations("ConsumerNav");
  const tSupport = useTranslations("SupportPage");
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
        <h2 className={appleCardTitle}>Forward email address</h2>
        {emailForwardAddress ? (
          <>
            <p className={`${appleMetadata} mt-1`}>{emailForwardAddress}</p>
            <button
              type="button"
              onClick={onCopyForwardAddress}
              className={`mt-3 w-full min-h-[44px] ${appleBtnPrimary}`}
            >
              Copy forward address
            </button>
            <p className={`${appleCaption} mt-2`}>
              Forward any flight, hotel, or booking confirmation from any email app to this address.
            </p>
          </>
        ) : (
          <p className={`${appleMetadata} mt-1`}>Assigning your forwarding address...</p>
        )}
      </article>

      <article className={`${appleCard} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={appleCardTitle}>Flight alerts</h2>
          {pushSubscribed ? (
            <span className="text-[13px] font-medium text-[var(--success)]">Active</span>
          ) : null}
        </div>
        <p className={`${appleMetadata} mt-1`}>
          Get push alerts for gate changes, delays, and departure reminders — even when the app isn&apos;t open.
        </p>
        {!pushSubscribed ? (
          <button
            type="button"
            onClick={() => {
              void onEnablePush();
            }}
            disabled={pushBusy}
            className={`mt-3 w-full min-h-[44px] ${appleBtnPrimary} disabled:opacity-60`}
          >
            {pushBusy ? "Enabling..." : "Enable flight alerts"}
          </button>
        ) : (
          <p className="mt-3 text-[15px] font-medium text-[var(--success)]">Alerts are on</p>
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
          <h2 className={appleCardTitle}>Plan status</h2>
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">
            {isLifetime ? "Pro" : isTrial ? `Trial — ${trialDaysRemaining}d` : hasProAccess ? "Pro" : "Free"}
          </span>
        </div>
        <p className={`${appleMetadata} mt-2`}>
          {billingLoading
            ? "Loading your plan..."
            : isLifetime
              ? "You have lifetime Pro access."
              : isTrial
                ? `Trial ends ${trialExpiresAt ? new Date(trialExpiresAt).toLocaleDateString() : "soon"}.`
                : hasProAccess
                  ? "Your Pro plan is active."
                  : "You are on the free plan."}
        </p>
      </article>

      <PlanRedeemCard compact />

      <section className={`${appleCard} p-4`}>
        <h2 className={appleCardTitle}>Appearance</h2>
        <p className={`${appleMetadata} mb-3 mt-1`}>
          Light is easier to read on your phone. Dark is available when you want it.
        </p>
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
        <span className={appleCardTitle}>Clear cache &amp; refresh</span>
        <p className={`${appleCaption} mt-0.5`}>
          Fixes map issues, outdated screens, or loading problems
        </p>
      </button>

      <button
        type="button"
        onClick={onSignOut}
        className={`w-full p-4 text-left font-semibold text-[var(--destructive)] ${appleCard}`}
      >
        Sign out
      </button>
    </section>
  );
}
