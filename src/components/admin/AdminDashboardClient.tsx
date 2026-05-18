"use client";

import { useCallback, useEffect, useState } from "react";
import { ActiveUsersCard } from "@/components/admin/ActiveUsersCard";
import { ApiUsageCard } from "@/components/admin/ApiUsageCard";
import { BackgroundJobsCard } from "@/components/admin/BackgroundJobsCard";
import { InsightsCard } from "@/components/admin/InsightsCard";
import { RecentAlertsCard } from "@/components/admin/RecentAlertsCard";
import { SystemHealthCard } from "@/components/admin/SystemHealthCard";
import { openSupportChat } from "@/components/support/SupportChat";
import type { AdminHealthResponse, AdminStatsResponse } from "@/lib/admin/adminTypes";

type AdminTab = "operations" | "insights";

export function AdminDashboardClient() {
  const [health, setHealth] = useState<AdminHealthResponse | null>(null);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("operations");
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadHealth = useCallback(async (): Promise<void> => {
    setLoadingHealth(true);
    try {
      const response = await fetch("/api/admin/health", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Health endpoint returned ${response.status}`);
      }
      const payload = (await response.json()) as AdminHealthResponse;
      setHealth(payload);
      setHealthError(null);
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : "Unknown admin health error.");
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const loadStats = useCallback(async (): Promise<void> => {
    setLoadingStats(true);
    try {
      const response = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Stats endpoint returned ${response.status}`);
      }
      const payload = (await response.json()) as AdminStatsResponse;
      setStats(payload);
      setStatsError(null);
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : "Unknown admin stats error.");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = window.setTimeout(() => {
      void loadHealth();
      void loadStats();
    }, 0);
    return () => window.clearTimeout(bootstrap);
  }, [loadHealth, loadStats]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadStats();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadStats]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1 text-xs dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setActiveTab("operations")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "operations"
                ? "bg-cyan-500 text-slate-950"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            Operations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("insights")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "insights"
                ? "bg-cyan-500 text-slate-950"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            Insights
          </button>
        </div>
        <button
          type="button"
          onClick={() => openSupportChat()}
          className="text-xs font-semibold text-cyan-700 underline decoration-cyan-400 underline-offset-2 hover:text-cyan-600 dark:text-cyan-300 dark:hover:text-cyan-200"
        >
          Talk to Support
        </button>
      </div>

      {activeTab === "operations" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SystemHealthCard
            data={health}
            loading={loadingHealth}
            error={healthError}
            onRefresh={() => {
              void loadHealth();
            }}
          />

          <ActiveUsersCard
            loading={loadingStats}
            activeSessionUsers={stats?.activeUsers.activeSessionUsers ?? 0}
            pushSubscriptionUsers={stats?.activeUsers.pushSubscriptionUsers ?? 0}
            calendarSyncUsers={stats?.activeUsers.calendarSyncUsers ?? 0}
          />

          <RecentAlertsCard alerts={stats?.recentAlerts ?? []} loading={loadingStats} />

          <BackgroundJobsCard
            runs={stats?.backgroundJobs.runs ?? []}
            dashboardUrl={stats?.backgroundJobs.dashboardUrl ?? "https://app.inngest.com/"}
            loading={loadingStats}
          />

          <div className="lg:col-span-2">
            <ApiUsageCard
              endpointRateLimitHits={stats?.apiUsage.endpointRateLimitHits ?? []}
              topActiveUsers={stats?.apiUsage.topActiveUsers ?? []}
              loading={loadingStats}
            />
            {statsError ? (
              <p className="mt-2 rounded-md border border-rose-400/40 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-700 dark:text-rose-200">
                {statsError}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <InsightsCard insights={stats?.insights ?? null} loading={loadingStats} />
      )}
    </div>
  );
}
