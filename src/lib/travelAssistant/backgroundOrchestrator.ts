import { persistTravelUpdateAudit } from "@/lib/travelAssistant/updateAuditStore";
import {
  runTravelUpdateCheck,
  type TravelUpdateCheckOptions,
} from "@/lib/travelAssistant/updateAdapters";
import { readTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";
import type {
  TravelUpdateCheckResult,
  TravelUpdateMode,
} from "@/lib/travelAssistant/travelUpdateTypes";

export class RuntimeStateUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeStateUnavailableError";
  }
}

export async function runTravelUpdateBackgroundPass({
  mode,
  nowIso,
  runtimeStatePath,
  auditPath,
  checkOptions,
}: {
  mode?: TravelUpdateMode;
  nowIso?: string;
  runtimeStatePath?: string;
  auditPath?: string;
  checkOptions?: TravelUpdateCheckOptions;
}): Promise<{
  result: TravelUpdateCheckResult;
  runtimeStateUpdatedAt: string;
  runtimeReservationCount: number;
}> {
  const effectiveNowIso = nowIso ?? new Date().toISOString();
  const runtimeState = await readTravelRuntimeState(runtimeStatePath);
  if (runtimeState.reservations.length === 0) {
    throw new RuntimeStateUnavailableError("No runtime reservations available for background pass.");
  }

  const result = await runTravelUpdateCheck({
    mode: mode ?? runtimeState.mode,
    reservations: runtimeState.reservations,
    nowIso: effectiveNowIso,
    options: checkOptions,
  });

  const audit = await persistTravelUpdateAudit({
    result,
    checkedAt: effectiveNowIso,
    storagePath: auditPath,
    source: "background",
  });

  return {
    result: {
      ...result,
      updates: audit.freshUpdates,
      audit: audit.summary,
    },
    runtimeStateUpdatedAt: runtimeState.updatedAt,
    runtimeReservationCount: runtimeState.reservations.length,
  };
}

export async function previewTravelUpdateBackgroundPass({
  mode,
  nowIso,
  runtimeStatePath,
  checkOptions,
}: {
  mode?: TravelUpdateMode;
  nowIso?: string;
  runtimeStatePath?: string;
  checkOptions?: TravelUpdateCheckOptions;
}): Promise<{
  result: TravelUpdateCheckResult;
  runtimeStateUpdatedAt: string;
  runtimeReservationCount: number;
}> {
  const effectiveNowIso = nowIso ?? new Date().toISOString();
  const runtimeState = await readTravelRuntimeState(runtimeStatePath);
  if (runtimeState.reservations.length === 0) {
    throw new RuntimeStateUnavailableError("No runtime reservations available for background pass.");
  }

  const result = await runTravelUpdateCheck({
    mode: mode ?? runtimeState.mode,
    reservations: runtimeState.reservations,
    nowIso: effectiveNowIso,
    options: checkOptions,
  });

  return {
    result,
    runtimeStateUpdatedAt: runtimeState.updatedAt,
    runtimeReservationCount: runtimeState.reservations.length,
  };
}
