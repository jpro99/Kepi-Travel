"use client";

import type { AdminEndpointHitStat, AdminTopUserStat } from "@/lib/admin/adminTypes";

interface ApiUsageCardProps {
  endpointRateLimitHits: AdminEndpointHitStat[];
  topActiveUsers: AdminTopUserStat[];
  loading: boolean;
}

function truncateUserId(userId: string): string {
  if (userId.length <= 10) return userId;
  return `${userId.slice(0, 4)}…${userId.slice(-4)}`;
}

export function ApiUsageCard({ endpointRateLimitHits, topActiveUsers, loading }: ApiUsageCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <h2 className="text-lg font-semibold">API usage</h2>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Rate-limit hit counts per endpoint and top active users by call volume.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Loading API usage metrics…</p>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-sm font-semibold">Rate-limit hits by endpoint</p>
            <ul className="mt-2 space-y-1 text-xs">
              {endpointRateLimitHits.slice(0, 8).map((entry) => (
                <li key={entry.endpoint} className="flex items-center justify-between gap-2">
                  <span className="truncate">{entry.endpoint}</span>
                  <span className="font-semibold">{entry.hits}</span>
                </li>
              ))}
              {endpointRateLimitHits.length === 0 ? (
                <li className="text-slate-600 dark:text-slate-400">No rate-limit hits recorded yet.</li>
              ) : null}
            </ul>
          </article>

          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-sm font-semibold">Top active users</p>
            <ul className="mt-2 space-y-1 text-xs">
              {topActiveUsers.map((entry) => (
                <li key={entry.userId} className="flex items-center justify-between gap-2">
                  <span>{truncateUserId(entry.userId)}</span>
                  <span className="font-semibold">{entry.calls}</span>
                </li>
              ))}
              {topActiveUsers.length === 0 ? (
                <li className="text-slate-600 dark:text-slate-400">No API call volume recorded yet.</li>
              ) : null}
            </ul>
          </article>
        </div>
      )}
    </section>
  );
}
