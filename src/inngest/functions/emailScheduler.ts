import { inngest } from "@/inngest/client";
import { getSafeRedisClient, hasRedisEnvConfig } from "@/lib/redis";
import {
  sendDocumentExpiryAlert,
  sendTripSummaryForUpcomingDeparture,
  sendWeeklyDigest,
} from "@/lib/email/emailService";
import { getExpiringDocuments } from "@/lib/travelAssistant/documentVault";
import { sendPackingReminderAlert } from "@/lib/travelAssistant/pushNotificationService";
import { getPackingCompletionPercent, getPackingList } from "@/lib/travelAssistant/packingStore";
import { kvStoreSetNx } from "@/lib/travelAssistant/kvStore";
import { listTrips } from "@/lib/travelAssistant/tripStore";

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
        packingReminderPushesSent: 0,
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
        packingReminderPushesSent: 0,
      };
    }

    const now = new Date();
    const isSunday = now.getUTCDay() === 0;

    const summary = await step.run("dispatch-transactional-emails", async () => {
      let tripSummariesSent = 0;
      let weeklyDigestsSent = 0;
      let documentExpiryAlertsSent = 0;
      let packingReminderPushesSent = 0;

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

        const trips = await listTrips(userId);
        for (const trip of trips) {
          const reservationDepartureCandidates = trip.reservations
            .filter((reservation) => reservation.type === "flight" || reservation.type === "train" || reservation.type === "ride")
            .map((reservation) => {
              const normalized = reservation.localTime.includes("T")
                ? reservation.localTime
                : reservation.localTime.replace(" ", "T");
              return Date.parse(normalized);
            })
            .filter((value) => !Number.isNaN(value))
            .sort((left, right) => left - right);
          const fallbackStartMs = Date.parse(`${trip.startDate}T09:00:00Z`);
          const departureMs = reservationDepartureCandidates[0] ?? fallbackStartMs;
          if (Number.isNaN(departureMs)) {
            continue;
          }
          const hoursUntilDeparture = (departureMs - now.getTime()) / (60 * 60 * 1000);
          if (hoursUntilDeparture <= 24 || hoursUntilDeparture > 48) {
            continue;
          }

          const packingState = await getPackingList(trip.id, userId);
          const completionPercent = getPackingCompletionPercent(packingState);
          if (completionPercent >= 50) {
            continue;
          }

          const dedupeKey = `packing-reminder/t-48h/${trip.id}`;
          const shouldSend = await kvStoreSetNx(dedupeKey, now.toISOString(), { userId });
          if (!shouldSend) {
            continue;
          }
          const sent = await sendPackingReminderAlert(userId, trip.name, completionPercent);
          if (sent) {
            packingReminderPushesSent += 1;
          }
        }
      }

      return { tripSummariesSent, weeklyDigestsSent, documentExpiryAlertsSent, packingReminderPushesSent };
    });

    return {
      status: "dispatched" as const,
      discoveredUsers: userIds.length,
      tripSummariesSent: summary.tripSummariesSent,
      weeklyDigestsSent: summary.weeklyDigestsSent,
      documentExpiryAlertsSent: summary.documentExpiryAlertsSent,
      packingReminderPushesSent: summary.packingReminderPushesSent,
      sundayDigestRun: isSunday,
    };
  },
);
