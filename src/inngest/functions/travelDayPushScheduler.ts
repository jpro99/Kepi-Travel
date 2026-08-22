import { inngest } from "@/inngest/client";
import { getSafeRedisClient, hasRedisEnvConfig } from "@/lib/redis";
import {
  sendPackingReminderAlert,
  sendTravelDayMorningAlert,
  sendOnlineCheckInAlert,
  sendPreFlightAlert,
  sendHotelCheckoutAlert,
} from "@/lib/travelAssistant/pushNotificationService";
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
  const redis = getSafeRedisClient("inngest/travelDayPushScheduler");
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

/**
 * Time-sensitive travel-day push notifications (packing reminder, "leave by"
 * alerts, online check-in, hotel checkout) — split out of emailScheduler
 * (which is daily-cadence, appropriate for its actual email digests) because
 * these all check NARROW hours-until-departure windows (as tight as
 * 3.5-4.5h). A once-a-day check at a fixed UTC time only ever lands inside
 * a narrow window for flights whose departure time happens to align with
 * that one daily check — for most real departure times, across timezones,
 * the window was silently never hit at all. Running every 15 minutes
 * (matching reminderLadder's cadence) means every flight actually gets
 * checked while its window is open, regardless of what time it departs.
 */
export const travelDayPushScheduler = inngest.createFunction(
  {
    id: "travel-day-push-scheduler",
    name: "Travel-day push notification scheduler",
    retries: 3,
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step, logger }) => {
    if (!isKvConfigured()) {
      logger.info("Skipping travel-day push scheduler because KV is not configured.");
      return {
        status: "kv-unconfigured" as const,
        discoveredUsers: 0,
        packingReminderPushesSent: 0,
      };
    }

    const userIds = await step.run("discover-users-with-trips", async () => discoverUsersWithTrips());
    if (userIds.length === 0) {
      return { status: "idle" as const, discoveredUsers: 0, packingReminderPushesSent: 0 };
    }

    const now = new Date();

    const summary = await step.run("dispatch-travel-day-pushes", async () => {
      let packingReminderPushesSent = 0;

      for (const userId of userIds) {
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
          if (hoursUntilDeparture > 24 && hoursUntilDeparture <= 48) {
            const packingState = await getPackingList(trip.id, userId);
            const completionPercent = getPackingCompletionPercent(packingState);
            if (completionPercent < 50) {
              const dedupeKey = `packing-reminder/t-48h/${trip.id}`;
              const shouldSend = await kvStoreSetNx(dedupeKey, now.toISOString(), { userId });
              if (shouldSend) {
                const sent = await sendPackingReminderAlert(userId, trip.name, completionPercent);
                if (sent) {
                  packingReminderPushesSent += 1;
                }
              }
            }
          }

          // ── Smart travel-day notifications ──────────────────────────────
          const flightReservations = trip.reservations
            .filter((r) => r.type === "flight")
            .map((r) => ({
              ...r,
              departureMs: (() => {
                const t = (r.flightDepartureTime ?? r.localTime ?? "").replace(" ", "T");
                return Date.parse(t);
              })(),
            }))
            .filter((r) => !Number.isNaN(r.departureMs))
            .sort((a, b) => a.departureMs - b.departureMs);

          for (const flight of flightReservations) {
            const hoursUntilFlight = (flight.departureMs - now.getTime()) / 3_600_000;
            const flightNum = flight.flightNumber ?? flight.title ?? "your flight";
            const depDate = new Date(flight.departureMs).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const depTime = new Date(flight.departureMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            // Leave 3.5 hours before international flight
            const leaveByMs = flight.departureMs - 3.5 * 3_600_000;
            const leaveByTime = new Date(leaveByMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

            // Travel day morning alert (0–8 hrs before departure, send once)
            if (hoursUntilFlight > 0 && hoursUntilFlight <= 8) {
              const dedupeKey = `smart-push/travel-day-morning/${flight.id}/${depDate}`;
              const firstSend = await kvStoreSetNx(dedupeKey, now.toISOString(), { userId });
              if (firstSend) {
                await sendTravelDayMorningAlert(userId, trip.name, flightNum, depTime, leaveByTime);
              }
            }

            // 4-hour pre-flight alert
            if (hoursUntilFlight > 3.5 && hoursUntilFlight <= 4.5) {
              const dedupeKey = `smart-push/pre-flight-4h/${flight.id}/${depDate}`;
              const firstSend = await kvStoreSetNx(dedupeKey, now.toISOString(), { userId });
              if (firstSend) {
                await sendPreFlightAlert(userId, flightNum, 4, leaveByTime);
              }
            }

            // Online check-in opens ~24 hrs before
            if (hoursUntilFlight > 23 && hoursUntilFlight <= 25) {
              const dedupeKey = `smart-push/check-in-open/${flight.id}/${depDate}`;
              const firstSend = await kvStoreSetNx(dedupeKey, now.toISOString(), { userId });
              if (firstSend) {
                await sendOnlineCheckInAlert(userId, flightNum, depDate);
              }
            }
          }

          // Hotel checkout reminder — morning of checkout day
          const hotelReservations = trip.reservations.filter((r) => r.type === "hotel");
          for (const hotel of hotelReservations) {
            const checkoutDateStr = hotel.checkOutDate ?? "";
            if (!checkoutDateStr) continue;
            const checkoutMs = Date.parse(checkoutDateStr + "T11:00:00");
            if (Number.isNaN(checkoutMs)) continue;
            const hoursUntilCheckout = (checkoutMs - now.getTime()) / 3_600_000;
            if (hoursUntilCheckout > 0 && hoursUntilCheckout <= 8) {
              const dedupeKey = `smart-push/hotel-checkout/${hotel.id}/${checkoutDateStr}`;
              const firstSend = await kvStoreSetNx(dedupeKey, now.toISOString(), { userId });
              if (firstSend) {
                await sendHotelCheckoutAlert(userId, hotel.provider ?? "Hotel", "11:00 AM");
              }
            }
          }
        }
      }

      return { packingReminderPushesSent };
    });

    return {
      status: "dispatched" as const,
      discoveredUsers: userIds.length,
      packingReminderPushesSent: summary.packingReminderPushesSent,
    };
  },
);
