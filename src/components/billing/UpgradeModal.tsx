"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import type { PlanFeature } from "@/lib/billing/plans";
import { PLAN_FEATURE_LABELS } from "@/lib/billing/plans";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featureLabel = useMemo(() => {
    if (!gate) {
      return "Pro features";
    }
    return PLAN_FEATURE_LABELS[gate.feature];
  }, [gate]);

  if (!open || !gate) {
    return null;
  }

  const handleUpgrade = async (): Promise<void> => {
    if (busy) {
      return;
    }
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
      const payload = (await response.json()) as {
        error?: string;
        checkoutSessionId?: string;
        url?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `Checkout request failed (${response.status})`);
      }

      if (payload.checkoutSessionId && stripePromise) {
        const stripe = await stripePromise;
        if (!stripe) {
          throw new Error("Stripe client could not be initialized.");
        }
        const result = await stripe.redirectToCheckout({
          sessionId: payload.checkoutSessionId,
        });
        if (result.error) {
          throw new Error(result.error.message);
        }
        return;
      }

      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }

      throw new Error("Checkout session response was incomplete.");
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Upgrade checkout failed.");
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
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">Kepi Pro</p>
            <h2 id="upgrade-modal-title" className="text-xl font-semibold">
              Unlock {featureLabel}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              This workflow is part of Pro so advanced logistics tools stay available when you need them most.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            Close
          </button>
        </header>

        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/70">
          <p className="font-medium">What you get on Pro</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
            <li>Unlimited trips for multi-destination planning</li>
            <li>Gmail import and proactive AI itinerary guidance</li>
            <li>Push alerts for critical gate and delay updates</li>
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
            {busy ? "Starting checkout..." : "Upgrade to Pro — $9/month"}
          </button>
          <Link
            href="/billing"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            View billing details
          </Link>
        </div>
      </section>
    </div>
  );
}
