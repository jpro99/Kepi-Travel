"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useBilling } from "@/lib/billing/BillingContext";
import { redeemInviteCodeClient } from "@/lib/invite/redeemInviteCodeClient";
import { appleBtnPrimary, appleCaption, appleCard, appleCardTitle, appleMetadata } from "@/lib/ui/appleDesign";

function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase();
}

interface PlanRedeemCardProps {
  className?: string;
  compact?: boolean;
}

/** Invite / lifetime code entry for More tab and settings surfaces. */
export function PlanRedeemCard({ className = "", compact = false }: PlanRedeemCardProps) {
  const { isLifetime, hasProAccess, loading: billingLoading, refresh } = useBilling();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showRedeem = !billingLoading && !isLifetime && !hasProAccess;

  const handleRedeem = useCallback(async (): Promise<void> => {
    if (busy) return;
    const code = normalizeInviteCode(inputRef.current?.value ?? "");
    if (!code) {
      setError("Enter your invite code.");
      setMessage(null);
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await redeemInviteCodeClient(code);

      if (result.ok) {
        if (inputRef.current) inputRef.current.value = "";
        setMessage(
          result.restored
            ? result.plan === "lifetime"
              ? "Lifetime Pro access restored on your account."
              : "Trial access restored on your account."
            : result.plan === "lifetime"
              ? "Lifetime Pro activated. Enjoy unlimited access."
              : `30-day trial active${result.trialExpiresAt ? ` through ${new Date(result.trialExpiresAt).toLocaleDateString()}` : ""}.`,
        );
        await refresh();
        return;
      }

      const mappedError =
        result.reason === "code-revoked"
          ? "This invite code has been revoked."
          : result.reason === "already-redeemed" || result.reason === "code-used"
            ? "This code was already used. If it was yours, contact support to restore access."
            : result.error ?? "Invite code is invalid.";
      setError(mappedError);
    } catch (redeemError) {
      setError(redeemError instanceof Error ? redeemError.message : "Could not redeem invite code.");
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  if (!showRedeem) {
    return null;
  }

  const cardClass = compact ? `${appleCard} p-4 ${className}` : `rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`;

  return (
    <article className={cardClass}>
      <h2 className={compact ? appleCardTitle : "font-semibold"}>Have a lifetime invite?</h2>
      <p className={compact ? `${appleMetadata} mt-1` : "mt-1 text-sm text-slate-600 dark:text-slate-300"}>
        Enter the code from your invite email. If you already redeemed it but still see Free, enter the same code again to restore access.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="KEPI-FRIEND-XXXXXX"
          className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] font-mono uppercase tracking-wide text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleRedeem();
          }}
        />
        <button
          type="button"
          onClick={() => void handleRedeem()}
          disabled={busy}
          className={`min-h-[44px] shrink-0 px-5 ${compact ? appleBtnPrimary : "rounded-xl bg-[#007AFF] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0066d6] disabled:opacity-60"}`}
        >
          {busy ? "Applying…" : "Redeem code"}
        </button>
      </div>
      {message ? (
        <p className={`mt-2 text-[13px] font-medium text-emerald-600 dark:text-emerald-400`}>{message}</p>
      ) : null}
      {error ? (
        <p className={`mt-2 text-[13px] font-medium text-rose-600 dark:text-rose-400`}>{error}</p>
      ) : null}
      <p className={compact ? `${appleCaption} mt-2` : "mt-2 text-xs text-slate-500 dark:text-slate-400"}>
        Need billing or referral codes?{" "}
        <Link href="/billing" className="font-semibold text-[#007AFF] hover:underline">
          Open billing settings
        </Link>
      </p>
    </article>
  );
}
