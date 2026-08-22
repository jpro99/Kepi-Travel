import { inngest } from "@/inngest/client";
import { getSafeRedisClient, hasRedisEnvConfig } from "@/lib/redis";
import {
  sendDocumentExpiryAlert,
  sendTripSummaryForUpcomingDeparture,
  sendWeeklyDigest,
} from "@/lib/email/emailService";
import { getExpiringDocuments } from "@/lib/travelAssistant/documentVault";

// Time-sensitive travel-day push notifications (packing reminder, "leave by"
// alerts, online check-in, hotel checkout) moved to travelDayPushScheduler.ts,
// which runs every 15 minutes. Those checks use narrow hours-until-departure
// windows (some as tight as 3.5-4.5h) — running them only once a day at a
// fixed UTC time meant they almost never actually landed inside the window
// for a given flight's real departure time. This file keeps only the
// genuinely daily-appropriate email digests below.

const USER_NAMESPACE_KEY_PATTERN = /^kepi:([^:]+):/u;
const DEFAULT_USER_SCAN_LIMIT = 1000;

function isKvConfigured(): boolean {
  return hasRedisEnvConfig();
}

async function discoverUsersWithTrips(limit = DEFAULT_USER_SCAN_LIMIT): Promise<string[]> {
  if (!isKvConfigured()) {
    return [];
  }
  const redis = getSafeRedisClient("inngest/emailScheduler");
  if (!redis) {
    return [];
  }
  const userIds = new Set<string>();
  try {
    const keys = await redis.keys("kepi:*:trips");
    for (const key of keys) {
      const match = USER_NAMESPACE_KEY_PATTERN.exec(String(key));
      const userId = match?.[1];
      if (userId && !userId.startsWith("__")) {
        userIds.add(userId);
      }
      if (userIds.size >= limit) {
        break;
      }
    }
  } catch {
    return [];
  }
  return [...userIds];
}

export const emailScheduler = inngest.createFunction(
  {
    id: "transactional-email-scheduler",
    name: "Transactional email scheduler",
    retries: 2,
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step, logger }) => {
    if (!isKvConfigured()) {
      logger.info("Skipping transactional email scheduler because KV is not configured.");
      return {
        status: "kv-unconfigured" as const,
        discoveredUsers: 0,
        tripSummariesSent: 0,
        weeklyDigestsSent: 0,
        documentExpiryAlertsSent: 0,
      };
    }

    const userIds = await step.run("discover-users-with-trips", async () => discoverUsersWithTrips());
    if (userIds.length === 0) {
      return {
        status: "idle" as const,
        discoveredUsers: 0,
        tripSummariesSent: 0,
        weeklyDigestsSent: 0,
        documentExpiryAlertsSent: 0,
      };
    }

    const now = new Date();
    const isSunday = now.getUTCDay() === 0;

    const summary = await step.run("dispatch-transactional-emails", async () => {
      let tripSummariesSent = 0;
      let weeklyDigestsSent = 0;
      let documentExpiryAlertsSent = 0;

      for (const userId of userIds) {
        const tripSummaryResults = await sendTripSummaryForUpcomingDeparture(userId, now.getTime());
        tripSummariesSent += tripSummaryResults.filter((result) => result.status === "sent").length;

        if (isSunday) {
          const digestResult = await sendWeeklyDigest(userId);
          if (digestResult.status === "sent") {
            weeklyDigestsSent += 1;
          }
        }

        const expiringDocuments = await getExpiringDocuments(userId, 14, now.getTime());
        if (expiringDocuments.length > 0) {
          const documentAlertResult = await sendDocumentExpiryAlert(userId, expiringDocuments);
          if (documentAlertResult.status === "sent") {
            documentExpiryAlertsSent += 1;
          }
        }
      }

      return { tripSummariesSent, weeklyDigestsSent, documentExpiryAlertsSent };
    });

    return {
      status: "dispatched" as const,
      discoveredUsers: userIds.length,
      tripSummariesSent: summary.tripSummariesSent,
      weeklyDigestsSent: summary.weeklyDigestsSent,
      documentExpiryAlertsSent: summary.documentExpiryAlertsSent,
      sundayDigestRun: isSunday,
    };
  },
);
