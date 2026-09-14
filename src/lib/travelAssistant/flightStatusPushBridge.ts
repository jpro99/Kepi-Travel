import { isFeatureEnabled, getUserPlan } from "@/lib/billing/planGate";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { logger } from "@/lib/logger";
import {
  hasPushSubscription,
  mergeDisruptionFocusMetadata,
  sendDelayAlert,
  sendGateChangeAlert,
  sendPushNotification,
} from "@/lib/travelAssistant/pushNotificationService";
import type { FlightFactProvenance } from "@/lib/travelAssistant/dayOfDoorProvenance";
import {
  tagDisruptionCharge,
  type TaggedDisruptionCharge,
} from "@/lib/travelAssistant/travelFocusHonestyFilter";

const SNAPSHOT_KEY_PREFIX = "flight-status-push-snapshot:";

export interface FlightStatusSnapshot {
  flightNumber: string;
  flightDate: string;
  departureGate: string;
  delayMinutes: number | null;
  flightStatus: string;
  updatedAt: string;
}

function snapshotKey(flightNumber: string, flightDate: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${flightNumber.replace(/\s+/gu, "").toUpperCase()}:${flightDate}`;
}

function normalizeGate(gate: string | undefined | null): string {
  return (gate ?? "").trim().toUpperCase();
}

function normalizeStatus(status: string | undefined | null): string {
  return (status ?? "unknown").trim().toLowerCase();
}

function resolvePushProvenance(flightStatus: string): FlightFactProvenance {
  const status = normalizeStatus(flightStatus);
  if (status.includes("cancel") || status.includes("divert") || status.includes("gate")) {
    return "ALERT_PUSH_STRING";
  }
  if (status.includes("delay")) {
    return "AIRPORT_FIDS_TEXT";
  }
  return "UNVERIFIED";
}

function buildGateChangeCharge(
  flightNumber: string,
  flightDate: string,
  provenance: FlightFactProvenance,
): TaggedDisruptionCharge {
  return tagDisruptionCharge({
    kind: "official-gate-change",
    provenance,
    flightNumber,
    flightDate,
  });
}

function buildCancelCharge(
  flightNumber: string,
  flightDate: string,
  provenance: FlightFactProvenance,
): TaggedDisruptionCharge {
  return tagDisruptionCharge({
    kind: "cancel",
    provenance,
    flightNumber,
    flightDate,
  });
}

function buildSoftDelayCharge(flightNumber: string, flightDate: string): TaggedDisruptionCharge {
  return tagDisruptionCharge({
    kind: "soft-status",
    provenance: "UNVERIFIED",
    flightNumber,
    flightDate,
  });
}

export async function maybeSendFlightStatusPushAlerts(
  userId: string,
  input: {
    flightNumber: string;
    flightDate: string;
    departureGate?: string;
    delayMinutes?: number | null;
    flightStatus?: string;
  },
): Promise<{ sent: number; skippedReason?: string }> {
  const plan = await getUserPlan(userId);
  if (!isFeatureEnabled(plan, "push-notifications")) {
    return { sent: 0, skippedReason: "plan" };
  }
  if (!(await hasPushSubscription(userId))) {
    return { sent: 0, skippedReason: "no-subscription" };
  }

  const flightNumber = input.flightNumber.replace(/\s+/gu, "").toUpperCase();
  const flightDate = input.flightDate.trim();
  const next: FlightStatusSnapshot = {
    flightNumber,
    flightDate,
    departureGate: normalizeGate(input.departureGate),
    delayMinutes:
      typeof input.delayMinutes === "number" && Number.isFinite(input.delayMinutes)
        ? Math.max(0, Math.round(input.delayMinutes))
        : null,
    flightStatus: normalizeStatus(input.flightStatus),
    updatedAt: new Date().toISOString(),
  };

  const key = snapshotKey(flightNumber, flightDate);
  const previous = await kvStoreGet<FlightStatusSnapshot>(key, { userId });

  await kvStoreSet(key, next, { userId });

  if (!previous) {
    return { sent: 0, skippedReason: "baseline" };
  }

  let sent = 0;

  if (
    previous.departureGate &&
    next.departureGate &&
    previous.departureGate !== next.departureGate
  ) {
    const gateCharge = buildGateChangeCharge(
      flightNumber,
      flightDate,
      resolvePushProvenance("gate-change"),
    );
    const ok = await sendGateChangeAlert(userId, flightNumber, next.departureGate, gateCharge);
    if (ok) sent += 1;
  }

  const prevDelay = previous.delayMinutes ?? 0;
  const nextDelay = next.delayMinutes ?? 0;
  const delayIncreased = nextDelay - prevDelay >= 10;
  const becameDelayed =
    next.flightStatus.includes("delay") &&
    !previous.flightStatus.includes("delay") &&
    nextDelay >= 10;

  if (delayIncreased || becameDelayed) {
    const delayCharge = buildSoftDelayCharge(flightNumber, flightDate);
    const ok = await sendDelayAlert(userId, flightNumber, Math.max(nextDelay, 10), delayCharge);
    if (ok) sent += 1;
  }

  const cancelledNow =
    (next.flightStatus.includes("cancel") || next.flightStatus.includes("divert")) &&
    !(previous.flightStatus.includes("cancel") || previous.flightStatus.includes("divert"));

  if (cancelledNow) {
    const cancelCharge = buildCancelCharge(
      flightNumber,
      flightDate,
      resolvePushProvenance(next.flightStatus),
    );
    const ok = await sendPushNotification(
      userId,
      mergeDisruptionFocusMetadata(
        {
          title: `${flightNumber} update`,
          body:
            next.flightStatus.includes("cancel")
              ? `${flightNumber} appears cancelled. Open Kepi for next steps.`
              : `${flightNumber} was diverted. Check your airline for updates.`,
          url: "/travel-assistant?tab=book&bookView=flights",
        },
        cancelCharge,
      ),
    );
    if (ok) sent += 1;
  }

  if (sent > 0) {
    logger.info("Flight status push alerts dispatched.", {
      scope: "travelAssistant/flightStatusPushBridge",
      userId,
      flightNumber,
      flightDate,
      sent,
    });
  }

  return { sent };
}
