"use client";

import { useCallback, useEffect, useState } from "react";
import { ActiveUsersCard } from "@/components/admin/ActiveUsersCard";
import { ApiUsageCard } from "@/components/admin/ApiUsageCard";
import { BackgroundJobsCard } from "@/components/admin/BackgroundJobsCard";
import { RecentAlertsCard } from "@/components/admin/RecentAlertsCard";
import { SystemHealthCard } from "@/components/admin/SystemHealthCard";
import type { AdminHealthResponse, AdminStatsResponse } from "@/lib/admin/adminTypes";

export function AdminDashboardClient() {
  const [health, setHealth] = useState<AdminHealthResponse | null>(null);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
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
  );
}
