import "server-only";

import { buildIncidentAutopilotPlan } from "@/lib/travelAssistant/incidentAutopilot";
import { logger } from "@/lib/logger";
import { getUserPlan } from "@/lib/billing/planGate";
import { sendDisruptionAlert } from "@/lib/email/emailService";
import { kvStoreGet, kvStoreList, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { sendPushNotification } from "@/lib/travelAssistant/pushNotificationService";
import { getTrip, updateTrip, type TravelTrip } from "@/lib/travelAssistant/tripStore";
import { runTravelUpdateCheck, type UpdatableReservation } from "@/lib/travelAssistant/updateAdapters";
import type { TravelUpdateEvent } from "@/lib/travelAssistant/travelUpdateTypes";

const MONITORING_KEY_PREFIX = "concierge-monitoring";

export interface ProactiveMonitoringState {
  tripId: string;
  active: boolean;
  autoRebook: boolean;
  intervalMinutes: number;
  startedAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
  lastAlertAt: string | null;
  status: "active" | "inactive";
}

function monitoringKey(tripId: string): string {
  return `${MONITORING_KEY_PREFIX}/${tripId}`;
}

function sanitizeState(raw: unknown): ProactiveMonitoringState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<ProactiveMonitoringState>;
  if (
    typeof candidate.tripId !== "string" ||
    typeof candidate.active !== "boolean" ||
    typeof candidate.autoRebook !== "boolean" ||
    typeof candidate.intervalMinutes !== "number" ||
    typeof candidate.startedAt !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    (typeof candidate.lastCheckedAt !== "string" && candidate.lastCheckedAt !== null) ||
    (typeof candidate.lastAlertAt !== "string" && candidate.lastAlertAt !== null)
  ) {
    return null;
  }
  return {
    tripId: candidate.tripId,
    active: candidate.active,
    autoRebook: candidate.autoRebook,
    intervalMinutes: Math.max(1, Math.round(candidate.intervalMinutes)),
    startedAt: candidate.startedAt,
    updatedAt: candidate.updatedAt,
    lastCheckedAt: candidate.lastCheckedAt ?? null,
    lastAlertAt: candidate.lastAlertAt ?? null,
    status: candidate.active ? "active" : "inactive",
  };
}

function resolveMonitoringIntervalMinutes(plan: "free" | "pro" | "concierge"): number {
  if (plan === "concierge") {
    return 5;
  }
  if (plan === "pro") {
    return 15;
  }
  return 60;
}

function mapTripReservations(trip: TravelTrip): UpdatableReservation[] {
  return trip.reservations
    .filter((reservation) => reservation.type === "flight" || reservation.type === "train" || reservation.type === "ride")
    .map((reservation) => ({
      id: reservation.id,
      type: reservation.type,
      title: reservation.title,
      confirmationCode: reservation.confirmationCode,
      localTime: reservation.localTime,
      location: reservation.location,
      timezone: reservation.timezone,
    }));
}

function chooseDelayUpdate(updates: readonly TravelUpdateEvent[]): TravelUpdateEvent | null {
  return (
    updates.find((update) => update.kind === "delay" && (update.delayMinutes ?? 0) > 30) ??
    updates.find((update) => update.kind === "cancellation") ??
    null
  );
}

function deriveScenario(update: TravelUpdateEvent): "none" | "missed-flight" | "train-delay" | "ride-no-show" {
  if (update.target.reservationType === "flight") {
    return "missed-flight";
  }
  if (update.target.reservationType === "train") {
    return "train-delay";
  }
  if (update.target.reservationType === "ride") {
    return "ride-no-show";
  }
  return "none";
}

async function persistState(userId: string, state: ProactiveMonitoringState): Promise<void> {
  await kvStoreSet(monitoringKey(state.tripId), state, { userId });
}

export async function getProactiveMonitoringState(
  userId: string,
  tripId: string,
): Promise<ProactiveMonitoringState | null> {
  const stored = await kvStoreGet<unknown>(monitoringKey(tripId), { userId });
  return sanitizeState(stored);
}

export async function listProactiveMonitoringStates(userId: string): Promise<ProactiveMonitoringState[]> {
  const rows = await kvStoreList<unknown>(`${MONITORING_KEY_PREFIX}/`, {
    userId,
    limit: 200,
  });
  return rows
    .map((row) => sanitizeState(row.value))
    .filter((row): row is ProactiveMonitoringState => row !== null);
}

export async function startProactiveMonitoring(
  userId: string,
  tripId: string,
  options?: { autoRebook?: boolean },
): Promise<ProactiveMonitoringState> {
  const plan = await getUserPlan(userId);
  if (plan === "free") {
    throw new Error("Proactive monitoring requires a paid plan.");
  }
  const trip = await getTrip(tripId, userId);
  if (!trip) {
    throw new Error("Trip not found.");
  }
  const existing = await getProactiveMonitoringState(userId, tripId);
  const nowIso = new Date().toISOString();
  const nextState: ProactiveMonitoringState = {
    tripId,
    active: true,
    autoRebook: options?.autoRebook ?? existing?.autoRebook ?? false,
    intervalMinutes: resolveMonitoringIntervalMinutes(plan),
    startedAt: existing?.startedAt ?? nowIso,
    updatedAt: nowIso,
    lastCheckedAt: existing?.lastCheckedAt ?? null,
    lastAlertAt: existing?.lastAlertAt ?? null,
    status: "active",
  };
  await persistState(userId, nextState);
  return nextState;
}

export async function stopProactiveMonitoring(userId: string, tripId: string): Promise<ProactiveMonitoringState> {
  const existing = await getProactiveMonitoringState(userId, tripId);
  const nowIso = new Date().toISOString();
  const nextState: ProactiveMonitoringState = {
    tripId,
    active: false,
    autoRebook: existing?.autoRebook ?? false,
    intervalMinutes: existing?.intervalMinutes ?? 15,
    startedAt: existing?.startedAt ?? nowIso,
    updatedAt: nowIso,
    lastCheckedAt: existing?.lastCheckedAt ?? null,
    lastAlertAt: existing?.lastAlertAt ?? null,
    status: "inactive",
  };
  await persistState(userId, nextState);
  return nextState;
}

export async function setProactiveAutoRebook(
  userId: string,
  tripId: string,
  enabled: boolean,
): Promise<ProactiveMonitoringState> {
  const existing = await getProactiveMonitoringState(userId, tripId);
  if (!existing) {
    return startProactiveMonitoring(userId, tripId, { autoRebook: enabled });
  }
  const nextState: ProactiveMonitoringState = {
    ...existing,
    autoRebook: enabled,
    updatedAt: new Date().toISOString(),
  };
  await persistState(userId, nextState);
  return nextState;
}

function shouldRunCheck(state: ProactiveMonitoringState, nowMs: number): boolean {
  if (!state.active) {
    return false;
  }
  if (!state.lastCheckedAt) {
    return true;
  }
  const lastCheckedMs = Date.parse(state.lastCheckedAt);
  if (Number.isNaN(lastCheckedMs)) {
    return true;
  }
  return nowMs - lastCheckedMs >= state.intervalMinutes * 60 * 1000;
}

function buildSuggestionText(trip: TravelTrip, scenario: "none" | "missed-flight" | "train-delay" | "ride-no-show"): string {
  const recommendations = buildIncidentAutopilotPlan({
    tripStage: trip.stage,
    tripStatus: trip.tripStatus ?? "yellow",
    activeScenario: scenario,
    unresolvedReviewCount: trip.reviewQueue?.length ?? 0,
    blockingIssueCount: 1,
    dueReminderCount: 1,
    pendingSyncCount: 0,
    canSyncItineraryNow: true,
    providerCircuitOpen: false,
    opsHealth: null,
    workerHealth: null,
  });
  return recommendations
    .slice(0, 2)
    .map((recommendation) => recommendation.title)
    .join(" • ");
}

async function handleDelayIncident(args: {
  userId: string;
  state: ProactiveMonitoringState;
  trip: TravelTrip;
  update: TravelUpdateEvent;
}): Promise<void> {
  const { userId, state, trip, update } = args;
  const scenario = deriveScenario(update);
  const suggestionSummary = buildSuggestionText(trip, scenario);
  const delayMinutes = update.delayMinutes ?? 0;
  const incidentTitle =
    update.target.titleHint ?? update.target.confirmationCode ?? `${update.target.reservationType} segment`;

  await sendPushNotification(userId, {
    title: `Proactive delay detected: ${incidentTitle}`,
    body:
      delayMinutes > 0
        ? `${delayMinutes} minute delay detected. Suggested next steps: ${suggestionSummary || "Open recovery mode."}`
        : `Service disruption detected. Suggested next steps: ${suggestionSummary || "Open recovery mode."}`,
    url: `/travel-assistant?tripId=${encodeURIComponent(trip.id)}&mode=recovery`,
  });

  await sendDisruptionAlert(userId, {
    tripId: trip.id,
    tripName: trip.name,
    destination: trip.destination,
    affectedReservationTitle: incidentTitle,
    disruptionType: update.kind,
    severity: update.severity,
    detail: update.detail,
    scenario,
    recommendations: suggestionSummary ? suggestionSummary.split(" • ") : undefined,
  });

  const nextFeed = [
    {
      id: `proactive-${Date.now()}`,
      reservationId: update.target.confirmationCode ?? trip.reservations[0]?.id ?? "unknown",
      kind: update.kind,
      severity: update.severity,
      summary: `Concierge proactive alert: ${update.summary}`,
      detail: update.detail,
      provider: update.provider,
      appliedAt: new Date().toISOString(),
    },
    ...(trip.updateFeed ?? []),
  ].slice(0, 80);

  if (state.autoRebook) {
    await updateTrip(
      trip.id,
      {
        stage: "recovery",
        tripStatus: "red",
        activeScenario: scenario,
        updateFeed: nextFeed,
      },
      userId,
    );
  }
}

export async function runProactiveMonitoringPass(userId: string, nowMs = Date.now()): Promise<{
  monitoredTrips: number;
  checksRun: number;
  incidentsDetected: number;
}> {
  const plan = await getUserPlan(userId);
  if (plan === "free") {
    return { monitoredTrips: 0, checksRun: 0, incidentsDetected: 0 };
  }

  const monitoringStates = await listProactiveMonitoringStates(userId);
  const activeStates = monitoringStates.filter((state) => state.active);
  let checksRun = 0;
  let incidentsDetected = 0;

  for (const state of activeStates) {
    const intervalMinutes = resolveMonitoringIntervalMinutes(plan);
    const stateToUse: ProactiveMonitoringState = {
      ...state,
      intervalMinutes,
    };
    if (!shouldRunCheck(stateToUse, nowMs)) {
      continue;
    }
    checksRun += 1;
    const trip = await getTrip(state.tripId, userId);
    if (!trip) {
      await stopProactiveMonitoring(userId, state.tripId);
      continue;
    }
    const reservations = mapTripReservations(trip);
    if (reservations.length === 0) {
      await persistState(userId, {
        ...stateToUse,
        updatedAt: new Date(nowMs).toISOString(),
        lastCheckedAt: new Date(nowMs).toISOString(),
      });
      continue;
    }

    try {
      const result = await runTravelUpdateCheck({
        mode: "auto",
        reservations,
        nowIso: new Date(nowMs).toISOString(),
      });
      const delayIncident = chooseDelayUpdate(result.updates);
      if (delayIncident) {
        incidentsDetected += 1;
        await handleDelayIncident({
          userId,
          state: stateToUse,
          trip,
          update: delayIncident,
        });
      }
      await persistState(userId, {
        ...stateToUse,
        lastCheckedAt: new Date(nowMs).toISOString(),
        lastAlertAt: delayIncident ? new Date(nowMs).toISOString() : stateToUse.lastAlertAt,
        updatedAt: new Date(nowMs).toISOString(),
      });
    } catch (error) {
      logger.warn("Proactive monitoring pass failed for trip.", {
        scope: "travelAssistant/proactiveAlertService",
        userId,
        tripId: state.tripId,
        error,
      });
      await persistState(userId, {
        ...stateToUse,
        lastCheckedAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
      });
    }
  }

  return {
    monitoredTrips: activeStates.length,
    checksRun,
    incidentsDetected,
  };
}
