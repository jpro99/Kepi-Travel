"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BillingPlanDefinition, BillingPlanId, PlanFeature } from "@/lib/billing/plans";
import { ReferralCard } from "@/components/referral/ReferralCard";
import { BILLING_PLANS, PLAN_FEATURE_LABELS, formatPlanPrice } from "@/lib/billing/plans";

type BillingStatusResponse = {
  plan: BillingPlanId;
  definition: BillingPlanDefinition;
  usage: {
    tripCount: number;
    tripLimit: number | null;
    tripsRemaining: number | null;
  };
  stripeConfigured: boolean;
};

const FEATURE_ORDER: PlanFeature[] = ["gmail-import", "ai-suggestions", "push-notifications", "multi-trip"];

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBillingStatus = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/status", { method: "GET", cache: "no-store" });
      const payload = (await response.json()) as BillingStatusResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Billing status failed (${response.status})`);
      }
      setStatus(payload);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Could not load billing status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadBillingStatus();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadBillingStatus]);

  const checkoutMessage = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const checkoutFlag = new URLSearchParams(window.location.search).get("checkout");
    if (checkoutFlag === "success") {
      return "Checkout complete. Plan details may take a moment to refresh.";
    }
    if (checkoutFlag === "cancelled") {
      return "Checkout was cancelled. You can continue on Free or retry later.";
    }
    return null;
  }, []);

  const activePlan = status?.plan ?? "free";
  const planDefinition = status?.definition ?? BILLING_PLANS.free;

  const handleStartCheckout = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          successPath: "/billing?checkout=success",
          cancelPath: "/billing?checkout=cancelled",
        }),
      });
      const payload = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? `Checkout failed (${response.status})`);
      }
      window.location.assign(payload.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Could not start checkout.");
      setBusy(false);
    }
  }, [busy]);

  const handleManageSubscription = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const payload = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? `Portal request failed (${response.status})`);
      }
      window.location.assign(payload.url);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Could not open billing portal.");
      setBusy(false);
    }
  }, [busy]);

  const usageText = useMemo(() => {
    if (!status) {
      return "Loading usage…";
    }
    if (status.usage.tripLimit === null) {
      return `${status.usage.tripCount} trips created • unlimited`;
    }
    return `${status.usage.tripCount}/${status.usage.tripLimit} trips used`;
  }, [status]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl space-y-6 px-4 py-8 text-slate-900 dark:text-slate-100">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">Billing</p>
        <h1 className="text-3xl font-semibold">Plan and subscription</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Manage your Kepi plan and unlock advanced travel automation features when needed.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading billing status...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Current plan</p>
                <p className="text-2xl font-semibold">{planDefinition.name}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {formatPlanPrice(planDefinition.monthlyPriceCents)} • {planDefinition.tagline}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right dark:border-slate-700 dark:bg-slate-950/70">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Usage</p>
                <p className="text-sm font-semibold">{usageText}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {FEATURE_ORDER.map((feature) => {
                const enabled = activePlan === "pro";
                return (
                  <div
                    key={feature}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      enabled
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                        : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300"
                    }`}
                  >
                    {PLAN_FEATURE_LABELS[feature]}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {activePlan === "pro" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void handleManageSubscription();
                  }}
                  className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Opening portal..." : "Manage subscription"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !status?.stripeConfigured}
                  onClick={() => {
                    void handleStartCheckout();
                  }}
                  className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Starting checkout..." : "Upgrade to Pro — $9/month"}
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  void loadBillingStatus();
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                Refresh status
              </button>
            </div>
          </div>
        )}
      </section>

      <ReferralCard />

      {checkoutMessage ? (
        <p className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{checkoutMessage}</p>
      ) : null}
      {error ? <p className="rounded-lg border border-red-400/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
    </main>
  );
}
