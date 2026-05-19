import { kv } from "@vercel/kv";
import { inngest } from "@/inngest/client";
import { logger } from "@/lib/logger";
import { runProactiveMonitoringPass } from "@/lib/travelAssistant/proactiveAlertService";

function parseUserIdFromKey(key: string): string | null {
  const match = key.match(/^kepi:([^:]+):concierge-monitoring\//u);
  return match?.[1] ?? null;
}

async function listUserIdsWithMonitoring(): Promise<string[]> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return [];
  }
  const userIds = new Set<string>();
  for await (const rawKey of kv.scanIterator({ match: "kepi:*:concierge-monitoring/*" })) {
    const key = String(rawKey);
    const userId = parseUserIdFromKey(key);
    if (userId) {
      userIds.add(userId);
    }
    if (userIds.size >= 500) {
      break;
    }
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
