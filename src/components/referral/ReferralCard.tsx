"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ReferralResponse = {
  code: string;
  referralLink: string;
  stats: {
    totalUses: number;
    successfulConversions: number;
    totalDaysEarned: number;
  };
};

export function ReferralCard() {
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReferral = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/referral", { method: "GET", cache: "no-store" });
      const payload = (await response.json()) as ReferralResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to load referrals (${response.status})`);
      }
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load referral details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadReferral();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadReferral]);

  const referralLink = data?.referralLink ?? "";

  const handleCopy = useCallback(async (value: string, successMessage: string): Promise<void> => {
    if (!value) return;
    setBusy(true);
    setMessage(null);
    try {
      await navigator.clipboard.writeText(value);
      setMessage(successMessage);
    } catch {
      setMessage("Clipboard unavailable in this browser.");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleNativeShare = useCallback(async (): Promise<void> => {
    if (!referralLink) return;
    if (typeof navigator === "undefined" || !("share" in navigator)) {
      setMessage("Native sharing is unavailable on this device.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await navigator.share({
        title: "Join me on Kepi Travel Assistant",
        text: "Use my referral link to get free Kepi Pro days.",
        url: referralLink,
      });
      setMessage("Share sheet opened.");
    } catch {
      setMessage("Share cancelled.");
    } finally {
      setBusy(false);
    }
  }, [referralLink]);

  const totalFriendsLabel = useMemo(() => {
    const count = data?.stats.successfulConversions ?? 0;
    return `${count} friend${count === 1 ? "" : "s"} referred`;
  }, [data?.stats.successfulConversions]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">Referrals</p>
          <h2 className="mt-1 text-xl font-semibold">Invite friends, earn Pro days</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Each friend who signs up gives them 30 free Pro days and gives you 30 free Pro days.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            void loadReferral();
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Loading referral program...</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/70">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Your Referral Code</p>
            <p className="mt-1 text-2xl font-semibold tracking-[0.16em]">{data?.code ?? "--------"}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/70">
              <p className="text-xs text-slate-500 dark:text-slate-400">Friends referred</p>
              <p className="font-semibold">{totalFriendsLabel}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/70">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total uses</p>
              <p className="font-semibold">{data?.stats.totalUses ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/70">
              <p className="text-xs text-slate-500 dark:text-slate-400">Days earned</p>
              <p className="font-semibold">{data?.stats.totalDaysEarned ?? 0} days</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !data?.code}
              onClick={() => {
                void handleCopy(data?.code ?? "", "Referral Code copied.");
              }}
              className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Copy code
            </button>
            <button
              type="button"
              disabled={busy || !referralLink}
              onClick={() => {
                void handleCopy(referralLink, "Referral link copied.");
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Copy referral link
            </button>
            <button
              type="button"
              disabled={busy || !referralLink}
              onClick={() => {
                void handleNativeShare();
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Share
            </button>
          </div>
          {message ? <p className="text-xs text-cyan-700 dark:text-cyan-300">{message}</p> : null}
          {error ? <p className="text-xs text-red-600 dark:text-red-300">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
