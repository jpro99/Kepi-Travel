import { kv } from "@vercel/kv";
import { inngest } from "@/inngest/client";
import {
  sendDocumentExpiryAlert,
  sendTripSummaryForUpcomingDeparture,
  sendWeeklyDigest,
} from "@/lib/email/emailService";
import { getExpiringDocuments } from "@/lib/travelAssistant/documentVault";

const USER_NAMESPACE_KEY_PATTERN = /^kepi:([^:]+):/u;
const DEFAULT_USER_SCAN_LIMIT = 1000;

function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
}

async function discoverUsersWithTrips(limit = DEFAULT_USER_SCAN_LIMIT): Promise<string[]> {
  if (!isKvConfigured()) {
    return [];
  }
  const userIds = new Set<string>();
  for await (const key of kv.scanIterator({ match: "kepi:*:trips" })) {
    const match = USER_NAMESPACE_KEY_PATTERN.exec(String(key));
    const userId = match?.[1];
    if (userId && !userId.startsWith("__")) {
      userIds.add(userId);
    }
    if (userIds.size >= limit) {
      break;
    }
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
