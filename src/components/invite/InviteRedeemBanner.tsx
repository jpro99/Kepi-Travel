"use client";

import { useEffect, useState } from "react";
import {
  clearLastInviteRedeemResult,
  INVITE_REDEEM_RESULT_EVENT,
  readLastInviteRedeemResult,
  successMessageForPlan,
  type InviteRedeemResultDetail,
} from "@/lib/invite/pendingInviteCode";
import { requestInviteRedeemRetry } from "@/hooks/useAutoRedeemInviteFromUrl";

export function InviteRedeemBanner() {
  const [detail, setDetail] = useState<InviteRedeemResultDetail | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const existing = readLastInviteRedeemResult();
    if (existing) {
      setDetail(existing);
      setDismissed(false);
    }
    const onResult = (event: Event) => {
      const custom = event as CustomEvent<InviteRedeemResultDetail>;
      if (!custom.detail) {
        return;
      }
      setDetail(custom.detail);
      setDismissed(false);
      setRetrying(false);
    };
    window.addEventListener(INVITE_REDEEM_RESULT_EVENT, onResult);
    return () => window.removeEventListener(INVITE_REDEEM_RESULT_EVENT, onResult);
  }, []);

  if (!detail || dismissed) {
    return null;
  }

  if (detail.status === "success") {
    return (
      <div
        role="status"
        className="mx-auto w-full max-w-3xl px-3 pt-3 sm:px-4"
      >
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-50">
          <div>
            <p className="text-base font-semibold sm:text-lg">
              {successMessageForPlan(detail.plan)}
            </p>
            <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">
              Your invite is active on this account. Forward bookings anytime to keep the trip current.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              clearLastInviteRedeemResult();
              setDismissed(true);
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:text-emerald-100 dark:hover:bg-emerald-900"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div role="alert" className="mx-auto w-full max-w-3xl px-3 pt-3 sm:px-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50">
        <p className="text-base font-semibold sm:text-lg">Invite not activated yet</p>
        <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">{detail.error}</p>
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
          Code <span className="font-mono font-semibold">{detail.code}</span>
          {" — "}
          use the same email the invite was sent to, then tap Retry.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              requestInviteRedeemRetry(detail.code);
            }}
            className="min-h-11 rounded-xl bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60 dark:bg-amber-600"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
          <a
            href="/billing"
            className="inline-flex min-h-11 items-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
          >
            Enter code on Billing
          </a>
          <button
            type="button"
            onClick={() => {
              clearLastInviteRedeemResult();
              setDismissed(true);
            }}
            className="min-h-11 rounded-xl px-3 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
