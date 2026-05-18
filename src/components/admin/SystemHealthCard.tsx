"use client";

import { useEffect } from "react";
import type { AdminHealthResponse, AdminServiceStatus } from "@/lib/admin/adminTypes";

interface SystemHealthCardProps {
  data: AdminHealthResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function statusBadgeClass(status: AdminServiceStatus): string {
  if (status === "green") return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200 border-emerald-500/40";
  if (status === "yellow") return "bg-amber-500/20 text-amber-700 dark:text-amber-200 border-amber-500/40";
  return "bg-rose-500/20 text-rose-700 dark:text-rose-200 border-rose-500/40";
}

export function SystemHealthCard({ data, loading, error, onRefresh }: SystemHealthCardProps) {
  useEffect(() => {
    const interval = window.setInterval(() => onRefresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [onRefresh]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">System health</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Auto-refreshes every 30 seconds.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md bg-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-rose-400/40 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-700 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Loading system health…</p>
      ) : null}

      {data ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">KV store</p>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(data.services.kv.status)}`}>
                {data.services.kv.status.toUpperCase()}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{data.services.kv.detail}</p>
          </article>

          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Inngest</p>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(data.services.inngest.status)}`}>
                {data.services.inngest.status.toUpperCase()}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{data.services.inngest.detail}</p>
          </article>

          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">AviationStack</p>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(data.services.aviationStack.status)}`}
              >
                {data.services.aviationStack.status.toUpperCase()}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {data.services.aviationStack.detail}
            </p>
          </article>

          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Sentry</p>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(data.services.sentry.status)}`}>
                {data.services.sentry.status.toUpperCase()}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{data.services.sentry.detail}</p>
          </article>
        </div>
      ) : null}
    </section>
  );
}
