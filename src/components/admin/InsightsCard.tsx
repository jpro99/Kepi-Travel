"use client";

import type { AdminInsightsStats } from "@/lib/admin/adminTypes";

interface InsightsCardProps {
  insights: AdminInsightsStats | null;
  loading: boolean;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function InsightsCard({ insights, loading }: InsightsCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <h2 className="text-lg font-semibold">User insights</h2>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Product health metrics across adoption, conversion, and itinerary quality.
      </p>

      {loading || !insights ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Loading insight metrics...</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
              <p className="text-xs text-slate-600 dark:text-slate-400">Total users</p>
              <p className="text-2xl font-semibold">{insights.totalUsers}</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
              <p className="text-xs text-slate-600 dark:text-slate-400">Active users (7d)</p>
              <p className="text-2xl font-semibold">{insights.activeUsersLast7Days}</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
              <p className="text-xs text-slate-600 dark:text-slate-400">Pro subscribers</p>
              <p className="text-2xl font-semibold">{insights.proSubscribers}</p>
            </article>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
              <p className="text-xs text-slate-600 dark:text-slate-400">Conversion (free to pro)</p>
              <p className="text-2xl font-semibold">{formatPercent(insights.conversionRateFreeToPro)}</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
              <p className="text-xs text-slate-600 dark:text-slate-400">Total trips</p>
              <p className="text-2xl font-semibold">{insights.totalTrips}</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
              <p className="text-xs text-slate-600 dark:text-slate-400">Avg reservations per trip</p>
              <p className="text-2xl font-semibold">{insights.averageReservationsPerTrip.toFixed(2)}</p>
            </article>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
              <p className="text-sm font-semibold">Top destinations</p>
              <ul className="mt-2 space-y-1 text-xs">
                {insights.topDestinations.map((entry) => (
                  <li key={entry.label} className="flex items-center justify-between gap-2">
                    <span>{entry.label}</span>
                    <span className="font-semibold">{entry.count}</span>
                  </li>
                ))}
                {insights.topDestinations.length === 0 ? (
                  <li className="text-slate-600 dark:text-slate-400">No destination data yet.</li>
                ) : null}
              </ul>
            </article>

            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
              <p className="text-sm font-semibold">Most common disruption types</p>
              <ul className="mt-2 space-y-1 text-xs">
                {insights.commonDisruptions.map((entry) => (
                  <li key={entry.label} className="flex items-center justify-between gap-2">
                    <span>{entry.label}</span>
                    <span className="font-semibold">{entry.count}</span>
                  </li>
                ))}
                {insights.commonDisruptions.length === 0 ? (
                  <li className="text-slate-600 dark:text-slate-400">No disruption events recorded yet.</li>
                ) : null}
              </ul>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
