import { inngest } from "@/inngest/client";
import { logger } from "@/lib/logger";
import { getSafeRedisClient, hasRedisEnvConfig } from "@/lib/redis";
import { parseDepartureUtcMs } from "@/lib/travelAssistant/checkInHandoff";
import { shouldPollFlightStatus } from "@/lib/travelAssistant/flightStatusCadence";
import { runWithKvUserContext } from "@/lib/travelAssistant/kvUserContext";
import { listTrips } from "@/lib/travelAssistant/tripStore";
import { canonicalFlightDepartureLocalTime } from "@/lib/travelAssistant/tripWindow";

function parseUserIdFromTripsKey(key: string): string | null {
  const match = key.match(/^kepi:([^:]+):trips$/u);
  return match?.[1] ?? null;
}

async function listUserIdsWithTrips(): Promise<string[]> {
  if (!hasRedisEnvConfig()) return [];
  const redis = getSafeRedisClient("inngest/flightStatusSweep");
  if (!redis) return [];
  const userIds = new Set<string>();
  try {
    const keys = await redis.keys("kepi:*:trips");
    for (const rawKey of keys) {
      const userId = parseUserIdFromTripsKey(String(rawKey));
      if (userId) userIds.add(userId);
      if (userIds.size >= 300) break;
    }
  } catch (error) {
    logger.warn("Failed to scan trip owners for flight status sweep.", {
      scope: "inngest/flightStatusSweep",
      error,
    });
  }
  return [...userIds];
}

function tripHasUrgentFlight(userId: string, nowMs: number): Promise<boolean> {
  return runWithKvUserContext(userId, async () => {
    const trips = await listTrips(userId);
    return trips.some((trip) =>
      trip.reservations.some((reservation) => {
        if (reservation.type !== "flight") return false;
        const local = canonicalFlightDepartureLocalTime(reservation);
        const depMs = parseDepartureUtcMs(local, reservation.timezone);
        return depMs !== null && shouldPollFlightStatus(depMs, nowMs);
      }),
    );
  });
}

export const flightStatusSweep = inngest.createFunction(
  {
    id: "flight-status-sweep",
    name: "Flight status proactive sweep",
    retries: 1,
    triggers: [{ cron: "*/2 * * * *" }],
  },
  async ({ step }) => {
    const userIds = await step.run("discover-trip-owners", listUserIdsWithTrips);
    if (userIds.length === 0) {
      return { usersScanned: 0, updatesTriggered: 0 };
    }

    let updatesTriggered = 0;
    const nowMs = Date.now();
    for (const userId of userIds) {
      const shouldRun = await step.run(`needs-flight-status-${userId}`, () => tripHasUrgentFlight(userId, nowMs));
      if (!shouldRun) continue;
      await step.run(`trigger-flight-status-${userId}`, async () => {
        await inngest.send({
          name: "travel/update.requested",
          data: {
            userId,
            mode: "auto",
            trigger: "flight-status-sweep",
          },
        });
      });
      updatesTriggered += 1;
    }

    logger.info("Completed flight status proactive sweep.", {
      scope: "inngest/flightStatusSweep",
      usersScanned: userIds.length,
      updatesTriggered,
    });
    return { usersScanned: userIds.length, updatesTriggered };
  },
);
