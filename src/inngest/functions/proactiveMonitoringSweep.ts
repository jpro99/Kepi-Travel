import { inngest } from "@/inngest/client";
import { logger } from "@/lib/logger";
import { getSafeRedisClient, hasRedisEnvConfig } from "@/lib/redis";
import { runProactiveMonitoringPass } from "@/lib/travelAssistant/proactiveAlertService";

function parseUserIdFromKey(key: string): string | null {
  const match = key.match(/^kepi:([^:]+):concierge-monitoring\//u);
  return match?.[1] ?? null;
}

async function listUserIdsWithMonitoring(): Promise<string[]> {
  if (!hasRedisEnvConfig()) {
    return [];
  }
  const redis = getSafeRedisClient("inngest/proactiveMonitoringSweep");
  if (!redis) {
    return [];
  }
  const userIds = new Set<string>();
  try {
    const keys = await redis.keys("kepi:*:concierge-monitoring/*");
    for (const rawKey of keys) {
      const key = String(rawKey);
      const userId = parseUserIdFromKey(key);
      if (userId) {
        userIds.add(userId);
      }
      if (userIds.size >= 500) {
        break;
      }
    }
  } catch (error) {
    logger.warn("Failed to scan monitored users; running sweep with empty user list.", {
      scope: "inngest/proactiveMonitoringSweep",
      error,
    });
  }
  return [...userIds];
}

export const proactiveMonitoringSweep = inngest.createFunction(
  {
    id: "concierge-proactive-monitoring-sweep",
    name: "Concierge proactive monitoring sweep",
    retries: 2,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const userIds = await step.run("discover-monitored-users", async () => {
      return listUserIdsWithMonitoring();
    });
    if (userIds.length === 0) {
      return {
        monitoredUsers: 0,
        checksRun: 0,
        incidentsDetected: 0,
      };
    }

    let checksRun = 0;
    let incidentsDetected = 0;
    for (const userId of userIds) {
      const passResult = await step.run(`monitor-user-${userId}`, async () => {
        return runProactiveMonitoringPass(userId);
      });
      checksRun += passResult.checksRun;
      incidentsDetected += passResult.incidentsDetected;
    }
    logger.info("Completed concierge proactive monitoring sweep.", {
      scope: "inngest/proactiveMonitoringSweep",
      monitoredUsers: userIds.length,
      checksRun,
      incidentsDetected,
    });
    return {
      monitoredUsers: userIds.length,
      checksRun,
      incidentsDetected,
    };
  },
);
