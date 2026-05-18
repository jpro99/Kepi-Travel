import { kv } from "@vercel/kv";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";
import type {
  AdminBackgroundJobRun,
  AdminEndpointHitStat,
  AdminHealthResponse,
  AdminRecentAlertEntry,
  AdminServiceStatus,
  AdminStatsResponse,
  AdminTopUserStat,
} from "@/lib/admin/adminTypes";

interface BackgroundStateRecord {
  lastRun?: {
    runId?: string;
    startedAt?: string;
    finishedAt?: string;
    status?: string;
    durationMs?: number;
  } | null;
}

interface AlertAuditRecord {
  sweeps?: Array<{
    id?: string;
    evaluatedAt?: string;
    alerts?: Array<{
      key?: string;
      title?: string;
      severity?: "warning" | "critical";
      createdAt?: string;
    }>;
  }>;
}

const KV_CONFIGURED = Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
const USAGE_REDIS_CONFIGURED = Boolean(
  process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
);
const usageRedis = USAGE_REDIS_CONFIGURED ? Redis.fromEnv() : null;

function extractUserIdFromKepiKey(key: string): string | null {
  const parts = key.split(":");
  if (parts.length < 3 || parts[0] !== "kepi") {
    return null;
  }
  return parts[1] || null;
}

async function scanKvKeys(match: string, limit = 5000): Promise<string[]> {
  if (!KV_CONFIGURED) {
    return [];
  }
  const keys: string[] = [];
  try {
    for await (const key of kv.scanIterator({ match })) {
      keys.push(String(key));
      if (keys.length >= limit) {
        break;
      }
    }
  } catch (error) {
    logger.warn("Failed to scan KV keys for admin metrics.", {
      scope: "admin/adminMetrics",
      match,
      error,
    });
  }
  return keys;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function collectBackgroundRuns(limit = 10): Promise<AdminBackgroundJobRun[]> {
  const stateKeys = await scanKvKeys("kepi:*:travel/background-state/default");
  const runs: AdminBackgroundJobRun[] = [];
  for (const key of stateKeys) {
    try {
      const value = (await kv.get<BackgroundStateRecord>(key)) ?? null;
      const lastRun = value?.lastRun;
      if (!lastRun?.runId || !lastRun.startedAt) {
        continue;
      }
      const userId = extractUserIdFromKepiKey(key);
      if (!userId) continue;
      runs.push({
        id: lastRun.runId,
        userId,
        name: "travelUpdatePass",
        status: lastRun.status ?? "unknown",
        durationMs: typeof lastRun.durationMs === "number" ? Math.max(0, lastRun.durationMs) : 0,
        triggeredAt: lastRun.finishedAt ?? lastRun.startedAt,
      });
    } catch (error) {
      logger.warn("Failed to load background run state for admin metrics.", {
        scope: "admin/adminMetrics",
        key,
        error,
      });
    }
  }
  return runs
    .sort((left, right) => Date.parse(right.triggeredAt) - Date.parse(left.triggeredAt))
    .slice(0, limit);
}

async function measureKvHealth(): Promise<AdminHealthResponse["services"]["kv"]> {
  if (!KV_CONFIGURED) {
    return {
      status: "yellow",
      latencyMs: null,
      detail: "KV is not configured in this environment.",
    };
  }

  const pingKey = `kepi:admin:health-ping:${Date.now()}`;
  const startedAtMs = Date.now();
  try {
    await kv.set(pingKey, "ok");
    await kv.get(pingKey);
    await kv.del(pingKey);
    const latencyMs = Math.max(1, Date.now() - startedAtMs);
    const status: AdminServiceStatus = latencyMs < 250 ? "green" : latencyMs < 1000 ? "yellow" : "red";
    return {
      status,
      latencyMs,
      detail: `KV round-trip latency ${latencyMs}ms.`,
    };
  } catch (error) {
    return {
      status: "red",
      latencyMs: null,
      detail: `KV ping failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

function evaluateInngestHealthFromRuns(runs: readonly AdminBackgroundJobRun[]): AdminHealthResponse["services"]["inngest"] {
  const latest = runs[0];
  if (!latest) {
    return {
      status: "yellow",
      lastRunAt: null,
      lastRunStatus: null,
      detail: "No recent durable background runs recorded.",
    };
  }
  const ageMinutes = Math.max(0, Math.round((Date.now() - Date.parse(latest.triggeredAt)) / 60000));
  let status: AdminServiceStatus = "green";
  if (latest.status !== "success") {
    status = latest.status === "failed" || latest.status === "timeout" ? "red" : "yellow";
  } else if (ageMinutes > 120) {
    status = "yellow";
  }
  return {
    status,
    lastRunAt: latest.triggeredAt,
    lastRunStatus: latest.status,
    detail:
      latest.status === "success"
        ? `Latest run succeeded ${ageMinutes}m ago.`
        : `Latest run status ${latest.status} ${ageMinutes}m ago.`,
  };
}

async function measureAviationStackHealth(): Promise<AdminHealthResponse["services"]["aviationStack"]> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "yellow",
      quotaRemaining: null,
      detail: "AviationStack API key is not configured.",
    };
  }

  try {
    const response = await fetchWithTimeout(
      `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(apiKey)}&limit=1`,
      { method: "GET", cache: "no-store" },
      5000,
    );
    const quotaHeader =
      response.headers.get("x-ratelimit-remaining") ??
      response.headers.get("x-rate-limit-remaining") ??
      response.headers.get("x-aviationstack-ratelimit-remaining");
    const quotaRemaining = quotaHeader ? Number.parseInt(quotaHeader, 10) : Number.NaN;
    const normalizedQuota = Number.isNaN(quotaRemaining) ? null : Math.max(0, quotaRemaining);
    let status: AdminServiceStatus = response.ok ? "green" : "red";
    if (response.ok && normalizedQuota === null) {
      status = "yellow";
    } else if (response.ok && normalizedQuota !== null && normalizedQuota < 50) {
      status = normalizedQuota === 0 ? "red" : "yellow";
    }
    return {
      status,
      quotaRemaining: normalizedQuota,
      detail: response.ok
        ? normalizedQuota === null
          ? "Quota header unavailable; API reachable."
          : `Approximate remaining quota: ${normalizedQuota}.`
        : `AviationStack health check failed (${response.status}).`,
    };
  } catch (error) {
    return {
      status: "red",
      quotaRemaining: null,
      detail: `AviationStack request failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

async function measureSentryHealth(): Promise<AdminHealthResponse["services"]["sentry"]> {
  const org = process.env.SENTRY_ORG?.trim();
  const project = process.env.SENTRY_PROJECT?.trim();
  const authToken = process.env.SENTRY_AUTH_TOKEN?.trim();
  if (!org || !project || !authToken) {
    return {
      status: "yellow",
      errorRate24h: null,
      detail: "Sentry token/org/project missing; error rate unavailable.",
    };
  }

  const endpoint = `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/events/?statsPeriod=24h&per_page=100`;
  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
      5000,
    );
    if (!response.ok) {
      return {
        status: "red",
        errorRate24h: null,
        detail: `Sentry query failed (${response.status}).`,
      };
    }
    const events = (await response.json()) as unknown[];
    const errorRate24h = Array.isArray(events) ? events.length : 0;
    const status: AdminServiceStatus = errorRate24h > 100 ? "red" : errorRate24h > 20 ? "yellow" : "green";
    return {
      status,
      errorRate24h,
      detail: `${errorRate24h} captured events in the last 24h.`,
    };
  } catch (error) {
    return {
      status: "red",
      errorRate24h: null,
      detail: `Sentry query failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

async function collectActiveUserStats(): Promise<AdminStatsResponse["activeUsers"]> {
  const [sessionKeys, pushKeys, calendarKeys] = await Promise.all([
    scanKvKeys("kepi:*:session*"),
    scanKvKeys("kepi:*:push-sub"),
    scanKvKeys("kepi:*:travel/calendar-sync/events/*"),
  ]);
  const sessionUsers = new Set(sessionKeys.map(extractUserIdFromKepiKey).filter((id): id is string => Boolean(id)));
  const pushUsers = new Set(pushKeys.map(extractUserIdFromKepiKey).filter((id): id is string => Boolean(id)));
  const calendarUsers = new Set(calendarKeys.map(extractUserIdFromKepiKey).filter((id): id is string => Boolean(id)));
  return {
    activeSessionUsers: sessionUsers.size,
    pushSubscriptionUsers: pushUsers.size,
    calendarSyncUsers: calendarUsers.size,
  };
}

async function collectRecentAlerts(limit = 20): Promise<AdminRecentAlertEntry[]> {
  const alertAuditKeys = await scanKvKeys("kepi:*:travel/ops-alert-audit/default");
  const entries: AdminRecentAlertEntry[] = [];
  for (const key of alertAuditKeys) {
    const userId = extractUserIdFromKepiKey(key);
    if (!userId) continue;
    try {
      const value = (await kv.get<AlertAuditRecord>(key)) ?? null;
      const sweeps = value?.sweeps ?? [];
      for (const sweep of sweeps) {
        const alerts = sweep.alerts ?? [];
        for (const alert of alerts) {
          entries.push({
            id: `${sweep.id ?? "sweep"}:${alert.key ?? alert.title ?? "alert"}`,
            timestamp: alert.createdAt ?? sweep.evaluatedAt ?? new Date(0).toISOString(),
            userId,
            alertType: alert.key ?? alert.title ?? "unknown-alert",
            status: alert.severity ?? "warning",
          });
        }
      }
    } catch (error) {
      logger.warn("Failed to read alert audit entry for admin metrics.", {
        scope: "admin/adminMetrics",
        key,
        error,
      });
    }
  }

  return entries
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, limit);
}

async function collectApiUsageStats(): Promise<AdminStatsResponse["apiUsage"]> {
  if (!usageRedis) {
    return {
      endpointRateLimitHits: [],
      topActiveUsers: [],
    };
  }

  const [endpointKeys, userKeys] = await Promise.all([
    usageRedis.keys("kepi:api-usage:rate-limit-hit:*"),
    usageRedis.keys("kepi:api-usage:user:*"),
  ]);

  const endpointStats: AdminEndpointHitStat[] = [];
  for (const key of endpointKeys) {
    const rawValue = await usageRedis.get<string | number>(key);
    const hits = typeof rawValue === "number" ? rawValue : Number.parseInt(String(rawValue ?? "0"), 10);
    const encodedEndpoint = key.replace("kepi:api-usage:rate-limit-hit:", "");
    endpointStats.push({
      endpoint: decodeURIComponent(encodedEndpoint),
      hits: Number.isNaN(hits) ? 0 : hits,
    });
  }

  const topUsers: AdminTopUserStat[] = [];
  for (const key of userKeys) {
    const rawValue = await usageRedis.get<string | number>(key);
    const calls = typeof rawValue === "number" ? rawValue : Number.parseInt(String(rawValue ?? "0"), 10);
    const encodedUser = key.replace("kepi:api-usage:user:", "");
    topUsers.push({
      userId: decodeURIComponent(encodedUser),
      calls: Number.isNaN(calls) ? 0 : calls,
    });
  }

  return {
    endpointRateLimitHits: endpointStats.sort((a, b) => b.hits - a.hits),
    topActiveUsers: topUsers.sort((a, b) => b.calls - a.calls).slice(0, 5),
  };
}

export async function buildAdminHealthSnapshot(): Promise<AdminHealthResponse> {
  const [kvHealth, backgroundRuns, aviationStackHealth, sentryHealth] = await Promise.all([
    measureKvHealth(),
    collectBackgroundRuns(1),
    measureAviationStackHealth(),
    measureSentryHealth(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    services: {
      kv: kvHealth,
      inngest: evaluateInngestHealthFromRuns(backgroundRuns),
      aviationStack: aviationStackHealth,
      sentry: sentryHealth,
    },
  };
}

export async function buildAdminStatsSnapshot(): Promise<AdminStatsResponse> {
  const [activeUsers, recentAlerts, backgroundRuns, apiUsage] = await Promise.all([
    collectActiveUserStats(),
    collectRecentAlerts(20),
    collectBackgroundRuns(10),
    collectApiUsageStats(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    activeUsers,
    recentAlerts,
    backgroundJobs: {
      runs: backgroundRuns,
      dashboardUrl: process.env.INNGEST_DASHBOARD_URL?.trim() || "https://app.inngest.com/",
    },
    apiUsage,
  };
}
