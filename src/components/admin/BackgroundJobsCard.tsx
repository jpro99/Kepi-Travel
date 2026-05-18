"use client";

import type { AdminBackgroundJobRun } from "@/lib/admin/adminTypes";

interface BackgroundJobsCardProps {
  runs: AdminBackgroundJobRun[];
  dashboardUrl: string;
  loading: boolean;
}

export function BackgroundJobsCard({ runs, dashboardUrl, loading }: BackgroundJobsCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Background jobs</h2>
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
        >
          Open Inngest dashboard
        </a>
      </div>
      {loading ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Loading jobs…</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="text-slate-600 dark:text-slate-400">
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Duration</th>
                <th className="px-2 py-1">Triggered</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-2 py-1">{run.name}</td>
                  <td className="px-2 py-1">{run.status}</td>
                  <td className="px-2 py-1">{Math.round(run.durationMs / 1000)}s</td>
                  <td className="px-2 py-1">{new Date(run.triggeredAt).toLocaleString()}</td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-slate-600 dark:text-slate-400" colSpan={4}>
                    No recent background job runs recorded.
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
