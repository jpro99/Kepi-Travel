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
import type { TravelUpdateEvent } from "@/lib/travelAssistant/travelUpdateTypes";
import { runWithKvUserContext } from "@/lib/travelAssistant/kvUserContext";

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
    if (update.kind === "gate-change" && update.updatedLocation) {
      const newGate = update.updatedLocation.replace(/^Gate\s*/i, "").trim() || update.updatedLocation;
      const ok = await sendGateChangeAlert(userId, extractFlightNumber(update), newGate);
      if (ok) sent += 1;
    }
    if (update.kind === "delay" && typeof update.delayMinutes === "number" && update.delayMinutes > 0) {
      const ok = await sendDelayAlert(userId, extractFlightNumber(update), update.delayMinutes);
      if (ok) sent += 1;
    }
  }
  return sent;
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
        const backgroundRun = await runManagedTravelUpdateBackgroundPass({
          mode: parsed.data.mode,
          nowIso: parsed.data.nowIso,
          timeoutMs: parsed.data.timeoutMs,
        });
        const alertSweep = await runAlertSweepSafe(
          parsed.data.trigger ? `${parsed.data.trigger}-success` : "inngest-travel-update-success",
        );
        const pushAlertsSent = await dispatchPushAlerts(parsed.data.userId, backgroundRun.result.updates);
        return {
          status: "success" as const,
          userId: parsed.data.userId,
          backgroundRun,
          alertSweep,
          pushAlertsSent,
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
