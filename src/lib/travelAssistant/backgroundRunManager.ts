import { randomUUID } from "node:crypto";
import {
  previewTravelUpdateBackgroundPass,
  runTravelUpdateBackgroundPass,
} from "@/lib/travelAssistant/backgroundOrchestrator";
import {
  acquireTravelBackgroundRunLock,
  BackgroundRunInProgressError,
  clearTravelBackgroundRunActive,
  finalizeTravelBackgroundRun,
  markTravelBackgroundRunActive,
  releaseTravelBackgroundRunLock,
} from "@/lib/travelAssistant/backgroundRunStateStore";
import type { TravelUpdateCheckOptions, TravelUpdateMode } from "@/lib/travelAssistant/updateAdapters";

const DEFAULT_BACKGROUND_TIMEOUT_MS = 45_000;

export class BackgroundRunTimeoutError extends Error {
  readonly runId: string;
  readonly timeoutMs: number;

  constructor(runId: string, timeoutMs: number) {
    super(`Background run timed out after ${timeoutMs}ms`);
    this.name = "BackgroundRunTimeoutError";
    this.runId = runId;
    this.timeoutMs = timeoutMs;
  }
}

export async function runManagedTravelUpdateBackgroundPass({
  mode,
  nowIso,
  runtimeStatePath,
  auditPath,
  lockPath,
  statePath,
  checkOptions,
  timeoutMs = DEFAULT_BACKGROUND_TIMEOUT_MS,
  lockStaleMs,
  dryRun = false,
}: {
  mode?: TravelUpdateMode;
  nowIso?: string;
  runtimeStatePath?: string;
  auditPath?: string;
  lockPath?: string;
  statePath?: string;
  checkOptions?: TravelUpdateCheckOptions;
  timeoutMs?: number;
  lockStaleMs?: number;
  dryRun?: boolean;
}) {
  const runId = randomUUID();
  const startedAt = nowIso ?? new Date().toISOString();
  const effectiveTimeoutMs = Math.max(250, timeoutMs);

  if (dryRun) {
    const preview = await previewTravelUpdateBackgroundPass({
      mode,
      nowIso,
      runtimeStatePath,
      checkOptions,
    });
    const finishedAt = new Date().toISOString();
    return {
      runId,
      startedAt,
      finishedAt,
      status: "success" as const,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
      dryRun: true,
      ...preview,
    };
  }

  try {
    await acquireTravelBackgroundRunLock({
      runId,
      startedAt,
      lockPath,
      staleMs: lockStaleMs,
    });
  } catch (error) {
    if (error instanceof BackgroundRunInProgressError) {
      const finishedAt = new Date().toISOString();
      await finalizeTravelBackgroundRun({
        runId,
        startedAt,
        finishedAt,
        status: "skipped-overlap",
        error: error.message,
        runtimeReservationCount: 0,
        newUpdates: 0,
        duplicateUpdates: 0,
        auditRequestId: null,
        storagePath: statePath,
        clearActive: false,
      });
    }
    throw error;
  }

  await markTravelBackgroundRunActive({
    runId,
    startedAt,
    timeoutMs: effectiveTimeoutMs,
    storagePath: statePath,
  });

  const runPromise = runTravelUpdateBackgroundPass({
    mode,
    nowIso,
    runtimeStatePath,
    auditPath,
    checkOptions,
  });
  let timer: NodeJS.Timeout | null = null;

  try {
    const backgroundRun = await Promise.race([
      runPromise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new BackgroundRunTimeoutError(runId, effectiveTimeoutMs));
        }, effectiveTimeoutMs);
      }),
    ]);

    const finishedAt = new Date().toISOString();
    await finalizeTravelBackgroundRun({
      runId,
      startedAt,
      finishedAt,
      status: "success",
      error: null,
      runtimeReservationCount: backgroundRun.runtimeReservationCount,
      newUpdates: backgroundRun.result.audit?.newUpdates ?? backgroundRun.result.updates.length,
      duplicateUpdates: backgroundRun.result.audit?.duplicateUpdates ?? 0,
      auditRequestId: backgroundRun.result.audit?.requestId ?? null,
      storagePath: statePath,
    });
    await releaseTravelBackgroundRunLock(lockPath);

    return {
      runId,
      startedAt,
      finishedAt,
      status: "success" as const,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
      ...backgroundRun,
    };
  } catch (error) {
    if (error instanceof BackgroundRunTimeoutError) {
      const finishedAt = new Date().toISOString();
      await finalizeTravelBackgroundRun({
        runId,
        startedAt,
        finishedAt,
        status: "timeout",
        error: error.message,
        runtimeReservationCount: 0,
        newUpdates: 0,
        duplicateUpdates: 0,
        auditRequestId: null,
        storagePath: statePath,
        clearActive: false,
      });

      void runPromise
        .catch(() => undefined)
        .then(async () => {
          await clearTravelBackgroundRunActive({ runId, storagePath: statePath });
          await releaseTravelBackgroundRunLock(lockPath);
        });
      throw error;
    }

    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Background run failed";
    await finalizeTravelBackgroundRun({
      runId,
      startedAt,
      finishedAt,
      status: "failed",
      error: message,
      runtimeReservationCount: 0,
      newUpdates: 0,
      duplicateUpdates: 0,
      auditRequestId: null,
      storagePath: statePath,
    });
    await releaseTravelBackgroundRunLock(lockPath);
    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
