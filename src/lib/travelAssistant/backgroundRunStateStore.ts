import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  TravelBackgroundLastRun,
  TravelBackgroundRunHeartbeat,
  TravelBackgroundRunStateSnapshot,
  TravelBackgroundRunStatus,
} from "@/lib/travelAssistant/travelUpdateTypes";

interface TravelBackgroundRunStateData extends TravelBackgroundRunStateSnapshot {
  version: 1;
}

interface BackgroundRunLockData {
  runId: string;
  startedAt: string;
}

const DEFAULT_BACKGROUND_STATE_PATH = "/tmp/kepi-travel-background-state.json";
const DEFAULT_BACKGROUND_LOCK_PATH = "/tmp/kepi-travel-background.lock";
const DEFAULT_BACKGROUND_LOCK_STALE_MS = 15 * 60_000;
let writeQueue: Promise<void> = Promise.resolve();

export class BackgroundRunInProgressError extends Error {
  readonly activeRunId: string | null;
  readonly startedAt: string | null;

  constructor(message: string, activeRunId: string | null, startedAt: string | null) {
    super(message);
    this.name = "BackgroundRunInProgressError";
    this.activeRunId = activeRunId;
    this.startedAt = startedAt;
  }
}

function resolveBackgroundStatePath(customPath?: string): string {
  return customPath ?? process.env.TRAVEL_UPDATE_BACKGROUND_STATE_PATH ?? DEFAULT_BACKGROUND_STATE_PATH;
}

function resolveBackgroundLockPath(customPath?: string): string {
  return customPath ?? process.env.TRAVEL_UPDATE_BACKGROUND_LOCK_PATH ?? DEFAULT_BACKGROUND_LOCK_PATH;
}

function createEmptyState(): TravelBackgroundRunStateData {
  return {
    version: 1,
    activeRun: null,
    lastRun: null,
    heartbeat: {
      lastSuccessfulRunAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      totalRuns: 0,
    },
  };
}

async function loadState(filePath: string): Promise<TravelBackgroundRunStateData> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<TravelBackgroundRunStateData>;
    if (parsed.version !== 1) {
      return createEmptyState();
    }
    return {
      version: 1,
      activeRun:
        parsed.activeRun &&
        typeof parsed.activeRun.runId === "string" &&
        typeof parsed.activeRun.startedAt === "string" &&
        typeof parsed.activeRun.timeoutMs === "number"
          ? parsed.activeRun
          : null,
      lastRun: normalizeLastRun(parsed.lastRun),
      heartbeat: normalizeHeartbeat(parsed.heartbeat),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyState();
    }
    throw error;
  }
}

function normalizeLastRun(value: unknown): TravelBackgroundLastRun | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<TravelBackgroundLastRun>;
  if (
    typeof parsed.runId !== "string" ||
    typeof parsed.startedAt !== "string" ||
    typeof parsed.finishedAt !== "string" ||
    typeof parsed.durationMs !== "number" ||
    typeof parsed.runtimeReservationCount !== "number" ||
    typeof parsed.newUpdates !== "number" ||
    typeof parsed.duplicateUpdates !== "number"
  ) {
    return null;
  }
  return {
    runId: parsed.runId,
    startedAt: parsed.startedAt,
    finishedAt: parsed.finishedAt,
    status:
      parsed.status === "success" ||
      parsed.status === "failed" ||
      parsed.status === "timeout" ||
      parsed.status === "skipped-overlap"
        ? parsed.status
        : "failed",
    durationMs: parsed.durationMs,
    error: typeof parsed.error === "string" || parsed.error === null ? parsed.error : null,
    runtimeReservationCount: parsed.runtimeReservationCount,
    newUpdates: parsed.newUpdates,
    duplicateUpdates: parsed.duplicateUpdates,
    auditRequestId:
      typeof parsed.auditRequestId === "string" || parsed.auditRequestId === null ? parsed.auditRequestId : null,
  };
}

function normalizeHeartbeat(value: unknown): TravelBackgroundRunHeartbeat {
  if (!value || typeof value !== "object") {
    return createEmptyState().heartbeat;
  }
  const parsed = value as Partial<TravelBackgroundRunHeartbeat>;
  return {
    lastSuccessfulRunAt:
      typeof parsed.lastSuccessfulRunAt === "string" || parsed.lastSuccessfulRunAt === null
        ? parsed.lastSuccessfulRunAt
        : null,
    lastFailureAt:
      typeof parsed.lastFailureAt === "string" || parsed.lastFailureAt === null ? parsed.lastFailureAt : null,
    consecutiveFailures: typeof parsed.consecutiveFailures === "number" ? Math.max(0, parsed.consecutiveFailures) : 0,
    totalRuns: typeof parsed.totalRuns === "number" ? Math.max(0, parsed.totalRuns) : 0,
  };
}

async function saveState(filePath: string, state: TravelBackgroundRunStateData): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}

async function mutateState(
  storagePath: string | undefined,
  mutator: (state: TravelBackgroundRunStateData) => void,
): Promise<void> {
  const statePath = resolveBackgroundStatePath(storagePath);
  const run = async (): Promise<void> => {
    const state = await loadState(statePath);
    mutator(state);
    await saveState(statePath, state);
  };
  const task = writeQueue.then(run, run);
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  await task;
}

export async function readTravelBackgroundRunState(
  storagePath?: string,
): Promise<TravelBackgroundRunStateSnapshot> {
  const statePath = resolveBackgroundStatePath(storagePath);
  const state = await loadState(statePath);
  return {
    activeRun: state.activeRun,
    lastRun: state.lastRun,
    heartbeat: state.heartbeat,
  };
}

export async function markTravelBackgroundRunActive({
  runId,
  startedAt,
  timeoutMs,
  storagePath,
}: {
  runId?: string;
  startedAt?: string;
  timeoutMs: number;
  storagePath?: string;
}): Promise<{ runId: string; startedAt: string }> {
  const effectiveRunId = runId ?? randomUUID();
  const effectiveStartedAt = startedAt ?? new Date().toISOString();
  await mutateState(storagePath, (state) => {
    state.activeRun = {
      runId: effectiveRunId,
      startedAt: effectiveStartedAt,
      timeoutMs,
    };
  });
  return { runId: effectiveRunId, startedAt: effectiveStartedAt };
}

export async function finalizeTravelBackgroundRun({
  runId,
  startedAt,
  finishedAt,
  status,
  error,
  runtimeReservationCount,
  newUpdates,
  duplicateUpdates,
  auditRequestId,
  storagePath,
  clearActive = true,
}: {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: Exclude<TravelBackgroundRunStatus, "in-progress">;
  error: string | null;
  runtimeReservationCount: number;
  newUpdates: number;
  duplicateUpdates: number;
  auditRequestId: string | null;
  storagePath?: string;
  clearActive?: boolean;
}): Promise<void> {
  const effectiveFinishedAt = finishedAt ?? new Date().toISOString();
  const durationMs = Math.max(0, Date.parse(effectiveFinishedAt) - Date.parse(startedAt));
  await mutateState(storagePath, (state) => {
    if (clearActive && state.activeRun?.runId === runId) {
      state.activeRun = null;
    }
    state.heartbeat.totalRuns += 1;
    if (status === "success") {
      state.heartbeat.lastSuccessfulRunAt = effectiveFinishedAt;
      state.heartbeat.consecutiveFailures = 0;
    } else if (status === "failed" || status === "timeout") {
      state.heartbeat.lastFailureAt = effectiveFinishedAt;
      state.heartbeat.consecutiveFailures += 1;
    }
    state.lastRun = {
      runId,
      startedAt,
      finishedAt: effectiveFinishedAt,
      status,
      durationMs,
      error,
      runtimeReservationCount,
      newUpdates,
      duplicateUpdates,
      auditRequestId,
    };
  });
}

export async function clearTravelBackgroundRunActive({
  runId,
  storagePath,
}: {
  runId: string;
  storagePath?: string;
}): Promise<void> {
  await mutateState(storagePath, (state) => {
    if (state.activeRun?.runId === runId) {
      state.activeRun = null;
    }
  });
}

async function writeLock(lockPath: string, payload: BackgroundRunLockData): Promise<void> {
  await mkdir(dirname(lockPath), { recursive: true });
  const handle = await open(lockPath, "wx");
  try {
    await handle.writeFile(JSON.stringify(payload), "utf8");
  } finally {
    await handle.close();
  }
}

async function readLock(lockPath: string): Promise<BackgroundRunLockData | null> {
  try {
    const raw = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<BackgroundRunLockData>;
    if (typeof parsed.runId !== "string" || typeof parsed.startedAt !== "string") {
      return null;
    }
    return { runId: parsed.runId, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

export async function acquireTravelBackgroundRunLock({
  runId,
  startedAt,
  lockPath,
  staleMs = DEFAULT_BACKGROUND_LOCK_STALE_MS,
}: {
  runId: string;
  startedAt: string;
  lockPath?: string;
  staleMs?: number;
}): Promise<void> {
  const resolvedLockPath = resolveBackgroundLockPath(lockPath);
  try {
    await writeLock(resolvedLockPath, { runId, startedAt });
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }

  const existingLock = await readLock(resolvedLockPath);
  const existingStartedAtMs = existingLock ? Date.parse(existingLock.startedAt) : Number.NaN;
  const stale =
    Number.isNaN(existingStartedAtMs) ||
    Date.now() - existingStartedAtMs > Math.max(30_000, staleMs);

  if (stale) {
    await unlink(resolvedLockPath).catch(() => undefined);
    await writeLock(resolvedLockPath, { runId, startedAt });
    return;
  }

  throw new BackgroundRunInProgressError(
    `Background run already in progress since ${existingLock?.startedAt ?? "unknown"}.`,
    existingLock?.runId ?? null,
    existingLock?.startedAt ?? null,
  );
}

export async function releaseTravelBackgroundRunLock(lockPath?: string): Promise<void> {
  const resolvedLockPath = resolveBackgroundLockPath(lockPath);
  await unlink(resolvedLockPath).catch(() => undefined);
}
