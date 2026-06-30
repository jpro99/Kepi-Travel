"use client";

import Link from "next/link";
import { ThemePicker } from "@/components/ThemeToggle";
import { LanguageSettingsCard } from "@/components/LanguageSettingsCard";

interface MobileSettingsViewProps {
  emailForwardAddress: string | null;
  onCopyForwardAddress: () => void;
  pushSubscribed: boolean;
  pushBusy: boolean;
  pushMessage: string | null;
  onEnablePush: () => void;
  billingLoading: boolean;
  isLifetime: boolean;
  isTrial: boolean;
  trialDaysRemaining: number;
  trialExpiresAt: string | null;
  hasProAccess: boolean;
  emailForwardSetupMessage?: string | null;
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
  onSignOut,
}: MobileSettingsViewProps) {
  return (
    <section className="space-y-3 pb-4">
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10">
        <h2 className="font-semibold text-emerald-900 dark:text-emerald-100">Forward email address</h2>
        {emailForwardAddress ? (
          <>
            <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-100">{emailForwardAddress}</p>
            <button
              type="button"
              onClick={onCopyForwardAddress}
              className="mt-3 w-full rounded-lg bg-emerald-500 px-3 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              Copy forward address
            </button>
            <p className="mt-2 text-xs text-emerald-900/90 dark:text-emerald-100/90">
              Forward any flight, hotel, or booking confirmation from any email app to this address.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-100">Assigning your forwarding address...</p>
        )}
      </article>

      <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Flight alerts</h2>
          {pushSubscribed ? (
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              Active
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Get push alerts for gate changes, delays, and departure reminders — even when the app isn&apos;t open.
        </p>
        {!pushSubscribed ? (
          <button
            type="button"
            onClick={onEnablePush}
            disabled={pushBusy}
            className="mt-3 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {pushBusy ? "Enabling..." : "Enable flight alerts"}
          </button>
        ) : (
          <p className="mt-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400">Alerts are on</p>
        )}
        {pushMessage ? (
          <p
            className={`mt-2 text-xs ${
              pushMessage.startsWith("✅")
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {pushMessage}
          </p>
        ) : null}
      </article>

      <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Plan status</h2>
          <span className="rounded-full bg-[var(--text-primary)] px-2 py-1 text-xs font-semibold text-[var(--bg-base)]">
            {isLifetime ? "Pro" : isTrial ? `Trial — ${trialDaysRemaining}d` : hasProAccess ? "Pro" : "Free"}
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
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

      <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Appearance</h2>
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          Light is easier to read on your phone. Dark is available when you want it.
        </p>
        <ThemePicker />
      </section>

      <LanguageSettingsCard />

      <Link
        href="/support"
        className="block rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 font-semibold shadow-sm transition hover:opacity-90"
      >
        Support
      </Link>

      {emailForwardSetupMessage ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">{emailForwardSetupMessage}</p>
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
        className="w-full rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 text-left font-semibold text-[var(--text-primary)] shadow-sm transition hover:opacity-90"
      >
        Clear cache &amp; refresh
        <p className="mt-0.5 text-xs font-normal text-[var(--text-muted)]">
          Fixes map issues, outdated screens, or loading problems
        </p>
      </button>

      <button
        type="button"
        onClick={onSignOut}
        className="w-full rounded-2xl border border-red-200 bg-[var(--bg-card)] p-4 text-left font-semibold text-red-600 shadow-sm dark:border-red-500/30 dark:text-red-300"
      >
        Sign out
      </button>
    </section>
  );
}
