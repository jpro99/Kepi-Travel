export type AdminServiceStatus = "green" | "yellow" | "red";

export interface AdminSystemServiceHealth {
  status: AdminServiceStatus;
  detail: string;
  latencyMs?: number | null;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  quotaRemaining?: number | null;
  errorRate24h?: number | null;
}

export interface AdminHealthResponse {
  generatedAt: string;
  services: {
    kv: AdminSystemServiceHealth;
    inngest: AdminSystemServiceHealth;
    aviationStack: AdminSystemServiceHealth;
    sentry: AdminSystemServiceHealth;
    duffel: AdminSystemServiceHealth;
    seatsAero: AdminSystemServiceHealth;
  };
}

export interface AdminRecentAlertEntry {
  id: string;
  timestamp: string;
  userId: string;
  alertType: string;
  status: "warning" | "critical";
}

export interface AdminBackgroundJobRun {
  id: string;
  userId: string;
  name: string;
  status: string;
  durationMs: number;
  triggeredAt: string;
}

export interface AdminEndpointHitStat {
  endpoint: string;
  hits: number;
}

export interface AdminTopUserStat {
  userId: string;
  calls: number;
}

export interface AdminCountBreakdown {
  label: string;
  count: number;
}

export interface AdminInsightsStats {
  totalUsers: number;
  activeUsersLast7Days: number;
  proSubscribers: number;
  totalTrips: number;
  averageReservationsPerTrip: number;
  conversionRateFreeToPro: number;
  topDestinations: AdminCountBreakdown[];
  commonDisruptions: AdminCountBreakdown[];
}

export interface AdminStatsResponse {
  generatedAt: string;
  activeUsers: {
    activeSessionUsers: number;
    pushSubscriptionUsers: number;
    calendarSyncUsers: number;
  };
  recentAlerts: AdminRecentAlertEntry[];
  backgroundJobs: {
    runs: AdminBackgroundJobRun[];
    dashboardUrl: string;
  };
  apiUsage: {
    endpointRateLimitHits: AdminEndpointHitStat[];
    topActiveUsers: AdminTopUserStat[];
  };
  insights: AdminInsightsStats;
}
