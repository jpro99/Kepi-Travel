"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BillingPlanDefinition, BillingPlanId, PlanFeature } from "@/lib/billing/plans";
import { ReferralCard } from "@/components/referral/ReferralCard";
import { BILLING_PLANS, PLAN_FEATURE_LABELS, formatPlanPrice } from "@/lib/billing/plans";

type BillingStatusResponse = {
  plan: BillingPlanId;
  definition: BillingPlanDefinition;
  features: Array<{
    feature: PlanFeature;
    label: string;
    requiresPro: boolean;
    enabled: boolean;
  }>;
  usage: {
    tripCount: number;
    tripLimit: number | null;
    tripsRemaining: number | null;
  };
  stripeConfigured: boolean;
  stripePlansConfigured?: {
    pro: boolean;
    concierge: boolean;
  };
  subscription?: {
    plan: BillingPlanId;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    validUntil: string | null;
    lifetimePlan: boolean;
    trialExpiresAt: string | null;
  };
};

const FEATURE_ORDER: PlanFeature[] = ["gmail-import", "ai-suggestions", "push-notifications", "multi-trip"];

function normalizeRedeemCode(value: string): string {
  return value.trim();
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetPlan, setTargetPlan] = useState<"pro" | "concierge">("pro");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [referralBusy, setReferralBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const inviteCodeInputRef = useRef<HTMLInputElement | null>(null);
  const referralCodeInputRef = useRef<HTMLInputElement | null>(null);

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

  const prefilledCodes = useMemo(() => {
    const inviteFromQuery = searchParams.get("inviteCode") ?? searchParams.get("redeemCode") ?? "";
    const referralFromQuery = searchParams.get("referralCode") ?? "";
    return {
      inviteCode: normalizeRedeemCode(inviteFromQuery),
      referralCode: normalizeRedeemCode(referralFromQuery),
    };
  }, [searchParams]);

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
  const lifetimePlanActive = Boolean(status?.subscription?.lifetimePlan);
  const trialExpiresAt = status?.subscription?.trialExpiresAt ?? null;
  const trialPlanActive = activePlan === "pro" && !lifetimePlanActive && Boolean(trialExpiresAt);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (activePlan === "free") {
        setTargetPlan("pro");
        return;
      }
      if (activePlan === "pro") {
        setTargetPlan("concierge");
      }
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [activePlan]);

  const handleStartCheckout = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPlan,
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
  }, [busy, targetPlan]);

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

  const handleRedeemInviteCode = useCallback(async (): Promise<void> => {
    if (inviteBusy) return;
    const rawInputValue = inviteCodeInputRef.current?.value ?? "";
    const normalizedCode = normalizeRedeemCode(rawInputValue);
    // Temporary debugging log requested by user for Invite Code submissions.
    console.log("[billing][invite-code] submitted code:", normalizedCode);
    if (!normalizedCode) return;
    setInviteBusy(true);
    setInviteMessage(null);
    setInviteError(null);
    setReferralMessage(null);
    setReferralError(null);
    try {
      const inviteResponse = await fetch("/api/invite/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode }),
      });
      const invitePayload = (await inviteResponse.json()) as {
        error?: string;
        reason?: string;
        plan?: "lifetime" | "trial";
        trialExpiresAt?: string | null;
        awarded?: {
          newUserDays?: number;
        };
      };

      if (inviteResponse.ok) {
        if (inviteCodeInputRef.current) {
          inviteCodeInputRef.current.value = "";
        }
        setInviteMessage(
          invitePayload.plan === "lifetime"
            ? "Invite Code applied. Pro access activated."
            : `Invite Code applied. Your 30-day free trial is active, expires ${invitePayload.trialExpiresAt ? new Date(invitePayload.trialExpiresAt).toLocaleDateString() : "in 30 days"}.`,
        );
        await loadBillingStatus();
        return;
      }
      const mappedInviteError =
        invitePayload.reason === "code-revoked"
          ? "This Invite Code has been revoked."
          : invitePayload.reason === "already-redeemed" || invitePayload.reason === "code-used"
            ? "This Invite Code has already been used."
            : invitePayload.reason === "invalid-code"
              ? "This Invite Code is invalid."
              : invitePayload.error ?? `Invite Code redemption failed (${inviteResponse.status})`;
      throw new Error(mappedInviteError);
    } catch (redeemError) {
      setInviteError(redeemError instanceof Error ? redeemError.message : "Could not redeem Invite Code.");
    } finally {
      setInviteBusy(false);
    }
  }, [inviteBusy, loadBillingStatus]);

  const handleRedeemReferralCode = useCallback(async (): Promise<void> => {
    if (referralBusy) return;
    const rawInputValue = referralCodeInputRef.current?.value ?? "";
    const normalizedCode = normalizeRedeemCode(rawInputValue);
    // Temporary debugging log requested by user for Referral Code submissions.
    console.log("[billing][referral-code] submitted code:", normalizedCode);
    if (!normalizedCode) return;
    setReferralBusy(true);
    setReferralMessage(null);
    setReferralError(null);
    setInviteMessage(null);
    setInviteError(null);
    try {
      const response = await fetch("/api/referral/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode }),
      });
      const payload = (await response.json()) as {
        error?: string;
        reason?: string;
        awarded?: {
          newUserDays?: number;
        };
      };
      if (!response.ok) {
        const mappedError =
          payload.reason === "already-redeemed"
            ? "This Referral Code has already been used."
            : payload.reason === "invalid-code"
              ? "This Referral Code is invalid."
              : payload.error ?? `Referral Code redemption failed (${response.status})`;
        throw new Error(mappedError);
      }
      if (referralCodeInputRef.current) {
        referralCodeInputRef.current.value = "";
      }
      const awardedDays = payload.awarded?.newUserDays ?? 30;
      setReferralMessage(`Referral Code applied. Your ${awardedDays}-day free trial is active.`);
      await loadBillingStatus();
    } catch (redeemError) {
      setReferralError(redeemError instanceof Error ? redeemError.message : "Could not redeem Referral Code.");
    } finally {
      setReferralBusy(false);
    }
  }, [referralBusy, loadBillingStatus]);

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

      <section className="rounded-2xl border border-emerald-300 bg-emerald-50/80 p-5 shadow-sm dark:border-emerald-700/50 dark:bg-emerald-950/30">
        <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">Code redemption</h2>
        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">Use Invite Code or Referral Code below.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <form
            className="w-full space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRedeemInviteCode();
            }}
          >
            <label className="block text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">
              Invite Code
            </label>
            <input
              ref={inviteCodeInputRef}
              type="text"
              defaultValue={prefilledCodes.inviteCode}
              placeholder="KEPI-FRIEND-ABC123"
              className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm uppercase tracking-wide text-slate-900 dark:border-emerald-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={inviteBusy}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inviteBusy ? "Redeeming..." : "Redeem Invite Code"}
            </button>
          </form>
          <form
            className="w-full space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRedeemReferralCode();
            }}
          >
            <label className="block text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">
              Referral Code
            </label>
            <input
              ref={referralCodeInputRef}
              type="text"
              defaultValue={prefilledCodes.referralCode}
              placeholder="ABCD1234"
              className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm uppercase tracking-wide text-slate-900 dark:border-emerald-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={referralBusy}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {referralBusy ? "Redeeming..." : "Redeem Referral Code"}
            </button>
          </form>
        </div>
        {(prefilledCodes.inviteCode.length > 0 || prefilledCodes.referralCode.length > 0) ? (
          <p className="mt-2 text-xs text-emerald-900 dark:text-emerald-100">
            Code prefilled from onboarding. Tap the matching redeem button to activate.
          </p>
        ) : null}
        {inviteMessage ? <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">{inviteMessage}</p> : null}
        {inviteError ? <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{inviteError}</p> : null}
        {referralMessage ? <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">{referralMessage}</p> : null}
        {referralError ? <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{referralError}</p> : null}
      </section>

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
                {lifetimePlanActive ? (
                  <p className="mt-1 inline-flex rounded-full border border-cyan-400/60 bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                    Lifetime Pro (invite)
                  </p>
                ) : null}
                {trialPlanActive && trialExpiresAt ? (
                  <p className="mt-1 text-xs text-cyan-700 dark:text-cyan-300">
                    Trial Pro expires on {new Date(trialExpiresAt).toLocaleDateString()}.
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right dark:border-slate-700 dark:bg-slate-950/70">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Usage</p>
                <p className="text-sm font-semibold">{usageText}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {FEATURE_ORDER.map((feature) => {
                const enabled = status?.features.find((entry) => entry.feature === feature)?.enabled ?? false;
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

            <div className="grid gap-2 sm:grid-cols-3">
              {(["free", "pro", "concierge"] as const).map((planId) => {
                const plan = BILLING_PLANS[planId];
                const highlighted = activePlan === planId;
                return (
                  <article
                    key={plan.id}
                    className={`rounded-xl border p-3 text-sm ${
                      highlighted
                        ? "border-cyan-400 bg-cyan-500/10"
                        : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70"
                    }`}
                  >
                    <p className="font-semibold">{plan.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatPlanPrice(plan.monthlyPriceCents)}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{plan.tagline}</p>
                    {highlighted ? (
                      <p className="mt-2 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">Current plan</p>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {activePlan !== "concierge" && !lifetimePlanActive ? (
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Upgrade target</span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  value={targetPlan}
                  onChange={(event) => {
                    const next = event.target.value === "concierge" ? "concierge" : "pro";
                    setTargetPlan(next);
                  }}
                >
                  {activePlan === "free" ? <option value="pro">Pro — $9/month</option> : null}
                  <option value="concierge">Concierge — $29/month</option>
                </select>
              </label>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {activePlan !== "free" && !lifetimePlanActive ? (
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
              ) : null}
              {activePlan !== "concierge" && !lifetimePlanActive ? (
                <button
                  type="button"
                  disabled={
                    busy ||
                    !status?.stripeConfigured ||
                    (targetPlan === "pro" && !status?.stripePlansConfigured?.pro) ||
                    (targetPlan === "concierge" && !status?.stripePlansConfigured?.concierge)
                  }
                  onClick={() => {
                    void handleStartCheckout();
                  }}
                  className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy
                    ? "Starting checkout..."
                    : targetPlan === "concierge"
                      ? "Upgrade to Concierge — $29/month"
                      : "Upgrade to Pro — $9/month"}
                </button>
              ) : null}
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
            {!lifetimePlanActive ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Promo Code: enter your Promo Code in Stripe Checkout when redirected.
              </p>
            ) : null}
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
