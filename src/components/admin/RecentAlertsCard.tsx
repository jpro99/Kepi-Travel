"use client";

import { useMemo, useState } from "react";
import type { AdminRecentAlertEntry } from "@/lib/admin/adminTypes";

interface RecentAlertsCardProps {
  alerts: AdminRecentAlertEntry[];
  loading: boolean;
}

function truncateUserId(userId: string): string {
  if (userId.length <= 10) return userId;
  return `${userId.slice(0, 4)}…${userId.slice(-4)}`;
}

export function RecentAlertsCard({ alerts, loading }: RecentAlertsCardProps) {
  const [filter, setFilter] = useState<"all" | "warning" | "critical">("all");

  const filteredAlerts = useMemo(
    () => (filter === "all" ? alerts : alerts.filter((alert) => alert.status === filter)),
    [alerts, filter],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Recent alerts</h2>
        <label className="text-xs text-slate-600 dark:text-slate-400">
          Alert type
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as "all" | "warning" | "critical")}
            className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="all">All</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Loading alerts…</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="text-slate-600 dark:text-slate-400">
                <th className="px-2 py-1">Timestamp</th>
                <th className="px-2 py-1">User</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map((alert) => (
                <tr key={alert.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-2 py-1">{new Date(alert.timestamp).toLocaleString()}</td>
                  <td className="px-2 py-1">{truncateUserId(alert.userId)}</td>
                  <td className="px-2 py-1">{alert.alertType}</td>
                  <td className="px-2 py-1">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        alert.status === "critical"
                          ? "bg-rose-500/20 text-rose-700 dark:text-rose-200"
                          : "bg-amber-500/20 text-amber-700 dark:text-amber-200"
                      }`}
                    >
                      {alert.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-slate-600 dark:text-slate-400" colSpan={4}>
                    No alerts match this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
