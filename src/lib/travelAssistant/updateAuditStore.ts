import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  TravelUpdateAuditSummary,
  TravelUpdateCheckResult,
  TravelUpdateEvent,
} from "@/lib/travelAssistant/travelUpdateTypes";

interface StoredUpdateRecord {
  idempotencyKey: string;
  provider: string;
  kind: TravelUpdateEvent["kind"];
  summary: string;
  targetConfirmationCode: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
}

interface AuditTrailEntry {
  requestId: string;
  checkedAt: string;
  mode: TravelUpdateCheckResult["mode"];
  provider: string | null;
  incomingUpdates: number;
  newUpdates: number;
  duplicateUpdates: number;
  providerError: string | null;
  circuitOpen: boolean;
}

interface UpdateAuditStoreData {
  version: 1;
  eventsByKey: Record<string, StoredUpdateRecord>;
  auditTrail: AuditTrailEntry[];
}

const DEFAULT_AUDIT_PATH = "/tmp/kepi-travel-update-audit.json";
const MAX_AUDIT_TRAIL_ENTRIES = 1000;
let writeQueue: Promise<void> = Promise.resolve();

function resolveAuditPath(customPath?: string): string {
  return customPath ?? process.env.TRAVEL_UPDATE_AUDIT_PATH ?? DEFAULT_AUDIT_PATH;
}

function createEmptyStore(): UpdateAuditStoreData {
  return {
    version: 1,
    eventsByKey: {},
    auditTrail: [],
  };
}

async function loadStore(filePath: string): Promise<UpdateAuditStoreData> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<UpdateAuditStoreData>;
    if (parsed.version !== 1 || !parsed.eventsByKey || !Array.isArray(parsed.auditTrail)) {
      return createEmptyStore();
    }
    return {
      version: 1,
      eventsByKey: parsed.eventsByKey,
      auditTrail: parsed.auditTrail,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyStore();
    }
    throw error;
  }
}

async function saveStore(filePath: string, data: UpdateAuditStoreData): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function buildUpdateIdempotencyKey(update: TravelUpdateEvent): string {
  return [
    update.provider,
    update.kind,
    update.target.reservationType,
    update.target.confirmationCode ?? "",
    update.target.titleHint ?? "",
    update.delayMinutes ?? "",
    update.updatedLocation ?? "",
    update.summary,
  ].join("|");
}

export async function persistTravelUpdateAudit({
  result,
  checkedAt,
  storagePath,
}: {
  result: TravelUpdateCheckResult;
  checkedAt?: string;
  storagePath?: string;
}): Promise<{
  freshUpdates: TravelUpdateEvent[];
  duplicateUpdates: number;
  summary: TravelUpdateAuditSummary;
}> {
  const effectiveCheckedAt = checkedAt ?? new Date().toISOString();
  const requestId = randomUUID();
  const filePath = resolveAuditPath(storagePath);

  const run = async (): Promise<{
    freshUpdates: TravelUpdateEvent[];
    duplicateUpdates: number;
    summary: TravelUpdateAuditSummary;
  }> => {
    const store = await loadStore(filePath);
    const freshUpdates: TravelUpdateEvent[] = [];
    let duplicateUpdates = 0;

    result.updates.forEach((update) => {
      const key = buildUpdateIdempotencyKey(update);
      const existing = store.eventsByKey[key];
      if (existing) {
        duplicateUpdates += 1;
        existing.lastSeenAt = effectiveCheckedAt;
        existing.seenCount += 1;
        return;
      }
      store.eventsByKey[key] = {
        idempotencyKey: key,
        provider: update.provider,
        kind: update.kind,
        summary: update.summary,
        targetConfirmationCode: update.target.confirmationCode ?? null,
        firstSeenAt: effectiveCheckedAt,
        lastSeenAt: effectiveCheckedAt,
        seenCount: 1,
      };
      freshUpdates.push(update);
    });

    const summary: TravelUpdateAuditSummary = {
      requestId,
      checkedAt: effectiveCheckedAt,
      mode: result.mode,
      provider: result.provider,
      incomingUpdates: result.updates.length,
      newUpdates: freshUpdates.length,
      duplicateUpdates,
      totalKnownEvents: Object.keys(store.eventsByKey).length,
    };

    store.auditTrail.unshift({
      requestId,
      checkedAt: effectiveCheckedAt,
      mode: result.mode,
      provider: result.provider,
      incomingUpdates: result.updates.length,
      newUpdates: freshUpdates.length,
      duplicateUpdates,
      providerError: result.error,
      circuitOpen: result.circuitOpen,
    });
    if (store.auditTrail.length > MAX_AUDIT_TRAIL_ENTRIES) {
      store.auditTrail.length = MAX_AUDIT_TRAIL_ENTRIES;
    }

    await saveStore(filePath, store);
    return { freshUpdates, duplicateUpdates, summary };
  };

  const task = writeQueue.then(run, run);
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
