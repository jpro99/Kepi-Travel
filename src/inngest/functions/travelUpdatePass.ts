import { z } from "zod";
import { inngest } from "@/inngest/client";
import {
  BackgroundRunTimeoutError,
  runManagedTravelUpdateBackgroundPass,
} from "@/lib/travelAssistant/backgroundRunManager";
import { BackgroundRunInProgressError } from "@/lib/travelAssistant/backgroundRunStateStore";
import { RuntimeStateUnavailableError } from "@/lib/travelAssistant/backgroundOrchestrator";
import { runTravelOpsAlertSweep } from "@/lib/travelAssistant/opsAlertingOrchestrator";
import {
  sendDelayAlert,
  sendGateChangeAlert,
} from "@/lib/travelAssistant/pushNotificationService";
import { sendDisruptionAlert } from "@/lib/email/emailService";
import type { TravelUpdateEvent } from "@/lib/travelAssistant/travelUpdateTypes";
import { runWithKvUserContext } from "@/lib/travelAssistant/kvUserContext";
import { hasLiveFlightStatusCredentials } from "@/lib/travelAssistant/flightStatusCredentials";
import { maybeSendFlightStatusPushAlerts } from "@/lib/travelAssistant/flightStatusPushBridge";
import { resolvePushFlightDate } from "@/lib/travelAssistant/resolvePushFlightDate";
import { trackEvent } from "@/lib/analytics/trackEvent";

const TravelUpdateRequestedEventSchema = z.object({
  userId: z.string().min(1),
  mode: z.enum(["off", "mock", "auto"]).optional(),
  nowIso: z.string().datetime().optional(),
  timeoutMs: z.number().int().min(250).max(120000).optional(),
  trigger: z.string().min(1).optional(),
});

async function runAlertSweepSafe(trigger: string) {
  try {
    return await runTravelOpsAlertSweep({ trigger });
  } catch {
    return null;
  }
}

function extractFlightNumber(update: TravelUpdateEvent): string {
  if (update.target.titleHint) {
    const match = update.target.titleHint.match(/\b([A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?)\b/i);
    if (match?.[1]) {
      return match[1].replaceAll(/\s+/g, "").toUpperCase();
    }
  }
  if (update.target.confirmationCode) {
    return update.target.confirmationCode.toUpperCase();
  }
  return "your flight";
}

async function dispatchPushAlerts(userId: string, updates: readonly TravelUpdateEvent[]): Promise<number> {
  let sent = 0;
  for (const update of updates) {
    if (update.target.reservationType !== "flight") {
      continue;
    }
    const flightNumber = extractFlightNumber(update);
    const gateMatch = update.updatedLocation?.match(/\bGate\s+([A-Z0-9]+)\b/iu);
    const gate =
      gateMatch?.[1] ??
      (update.kind === "gate-change"
        ? update.updatedLocation?.replace(/^Gate\s*/iu, "").trim()
        : "");
    // Diff-based gate/delay pushes via shared bridge (F12/F13) — key by reservation flightDate, not "today".
    const bridge = await maybeSendFlightStatusPushAlerts(userId, {
      flightNumber,
      flightDate: resolvePushFlightDate(update),
      departureGate: gate || undefined,
      delayMinutes: update.delayMinutes ?? null,
      flightStatus:
        update.kind === "delay"
          ? "delayed"
          : update.kind === "cancellation"
            ? "cancelled"
            : update.kind === "gate-change"
              ? "gate-change"
              : "scheduled",
    });
    sent += bridge.sent;
    if (bridge.sent > 0) {
      void trackEvent({
        type: "flight_status_push_sent",
        userId,
        flightNumber,
        flightDate: resolvePushFlightDate(update),
        count: bridge.sent,
      });
    }

    if (update.kind === "gate-change" && update.updatedLocation && bridge.sent === 0) {
      const newGate = update.updatedLocation.replace(/^Gate\s*/i, "").trim() || update.updatedLocation;
      const ok = await sendGateChangeAlert(userId, flightNumber, newGate);
      if (ok) sent += 1;
    }
    if (
      update.kind === "delay" &&
      typeof update.delayMinutes === "number" &&
      update.delayMinutes > 0 &&
      bridge.sent === 0
    ) {
      const ok = await sendDelayAlert(userId, flightNumber, update.delayMinutes);
      if (ok) sent += 1;
    }
  }
  return sent;
}

function pickDisruptionUpdate(updates: readonly TravelUpdateEvent[]): TravelUpdateEvent | null {
  return (
    updates.find((update) => update.kind === "cancellation" || update.severity === "critical") ??
    updates.find((update) => update.kind === "delay" && (update.delayMinutes ?? 0) >= 20) ??
    null
  );
}

function resolveEffectiveUpdateMode(requestedMode: "off" | "mock" | "auto" | undefined): {
  mode: "off" | "mock" | "auto" | undefined;
  usedMockFallback: boolean;
  reason?: string;
} {
  if (requestedMode !== "auto") {
    return { mode: requestedMode, usedMockFallback: false };
  }
  if (hasLiveFlightStatusCredentials()) {
    return { mode: requestedMode, usedMockFallback: false };
  }
  return {
    mode: "mock",
    usedMockFallback: true,
    reason: "No live flight status key (FLIGHTAWARE_AEROAPI_KEY or AERODATABOX_API_KEY); background updates forced to mock mode.",
  };
}

export const travelUpdatePass = inngest.createFunction(
  {
    id: "travel-update-pass",
    name: "Travel update pass",
    retries: 3,
    triggers: [{ event: "travel/update.requested" }],
  },
  async ({ event, logger }) => {
    const parsed = TravelUpdateRequestedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn("Skipping invalid travel/update.requested event payload", {
        errors: parsed.error.flatten(),
      });
      return {
        status: "invalid-event" as const,
        errors: parsed.error.flatten(),
      };
    }

    return runWithKvUserContext(parsed.data.userId, async () => {
      try {
        const modeResolution = resolveEffectiveUpdateMode(parsed.data.mode);
        if (modeResolution.usedMockFallback) {
          logger.info("Switching travel update pass to mock mode due to missing live flight status keys.", {
            userId: parsed.data.userId,
            requestedMode: parsed.data.mode,
          });
        }
        const backgroundRun = await runManagedTravelUpdateBackgroundPass({
          mode: modeResolution.mode,
          nowIso: parsed.data.nowIso,
          timeoutMs: parsed.data.timeoutMs,
        });
        const alertSweep = await runAlertSweepSafe(
          parsed.data.trigger ? `${parsed.data.trigger}-success` : "inngest-travel-update-success",
        );
        const pushAlertsSent = await dispatchPushAlerts(parsed.data.userId, backgroundRun.result.updates);
        const disruptionUpdate = pickDisruptionUpdate(backgroundRun.result.updates);
        const disruptionAlertResult = disruptionUpdate
          ? await sendDisruptionAlert(parsed.data.userId, {
              affectedReservationTitle:
                disruptionUpdate.target.titleHint ?? disruptionUpdate.target.confirmationCode ?? "Affected reservation",
              disruptionType: disruptionUpdate.kind,
              severity: disruptionUpdate.severity,
              detail: disruptionUpdate.detail,
            })
          : null;
        return {
          status: "success" as const,
          userId: parsed.data.userId,
          requestedMode: parsed.data.mode ?? null,
          effectiveMode: modeResolution.mode ?? parsed.data.mode ?? null,
          modeFallbackReason: modeResolution.reason ?? null,
          backgroundRun,
          alertSweep,
          pushAlertsSent,
          disruptionAlertResult,
        };
      } catch (error) {
        if (error instanceof BackgroundRunInProgressError) {
          const alertSweep = await runAlertSweepSafe("inngest-travel-update-overlap");
          return {
            status: "skipped-overlap" as const,
            userId: parsed.data.userId,
            error: error.message,
            activeRunId: error.activeRunId,
            activeStartedAt: error.startedAt,
            alertSweep,
          };
        }
        if (error instanceof RuntimeStateUnavailableError) {
          const alertSweep = await runAlertSweepSafe("inngest-travel-update-runtime-missing");
          return {
            status: "runtime-missing" as const,
            userId: parsed.data.userId,
            error: error.message,
            alertSweep,
          };
        }
        if (error instanceof BackgroundRunTimeoutError) {
          const alertSweep = await runAlertSweepSafe("inngest-travel-update-timeout");
          return {
            status: "timeout" as const,
            userId: parsed.data.userId,
            error: error.message,
            runId: error.runId,
            timeoutMs: error.timeoutMs,
            alertSweep,
          };
        }
        throw error;
      }
    });
  },
);
