import { randomUUID } from "node:crypto";
import type {
  TravelAuditReadSnapshot,
  TravelAuditTrailEntry,
  TravelUpdateAuditSummary,
  TravelUpdateCheckResult,
  TravelUpdateEvent,
} from "@/lib/travelAssistant/travelUpdateTypes";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { logger } from "@/lib/logger";

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

interface UpdateAuditStoreData {
  version: 1;
  eventsByKey: Record<string, StoredUpdateRecord>;
  auditTrail: TravelAuditTrailEntry[];
}

const DEFAULT_AUDIT_KEY = "travel/update-audit/default";
const MAX_AUDIT_TRAIL_ENTRIES = 1000;
let writeQueue: Promise<void> = Promise.resolve();

function resolveAuditKey(customPath?: string): string {
  return customPath ?? process.env.TRAVEL_UPDATE_AUDIT_PATH ?? DEFAULT_AUDIT_KEY;
}

function createEmptyStore(): UpdateAuditStoreData {
  return {
    version: 1,
    eventsByKey: {},
    auditTrail: [],
  };
}

async function loadStore(auditKey: string): Promise<UpdateAuditStoreData> {
  try {
    const parsed = await kvStoreGet<Partial<UpdateAuditStoreData>>(auditKey);
    if (!parsed) {
      return createEmptyStore();
    }
    if (parsed.version !== 1 || !parsed.eventsByKey || !Array.isArray(parsed.auditTrail)) {
      return createEmptyStore();
    }
    const normalizedAuditTrail = parsed.auditTrail.map((entry) => {
      const raw = entry as Partial<TravelAuditTrailEntry>;
      return {
        source: raw.source === "background" ? "background" : "interactive",
        requestId: typeof raw.requestId === "string" ? raw.requestId : randomUUID(),
        checkedAt: typeof raw.checkedAt === "string" ? raw.checkedAt : new Date(0).toISOString(),
        mode: raw.mode ?? "auto",
        provider: typeof raw.provider === "string" || raw.provider === null ? raw.provider : null,
        incomingUpdates: typeof raw.incomingUpdates === "number" ? raw.incomingUpdates : 0,
        newUpdates: typeof raw.newUpdates === "number" ? raw.newUpdates : 0,
        duplicateUpdates: typeof raw.duplicateUpdates === "number" ? raw.duplicateUpdates : 0,
        providerError: typeof raw.providerError === "string" || raw.providerError === null ? raw.providerError : null,
        circuitOpen: typeof raw.circuitOpen === "boolean" ? raw.circuitOpen : false,
        conflictAccepted: typeof raw.conflictAccepted === "number" ? raw.conflictAccepted : 0,
        conflictSuppressed: typeof raw.conflictSuppressed === "number" ? raw.conflictSuppressed : 0,
        providerReports: Array.isArray(raw.providerReports) ? raw.providerReports : [],
      } satisfies TravelAuditTrailEntry;
    });
    return {
      version: 1,
      eventsByKey: parsed.eventsByKey,
      auditTrail: normalizedAuditTrail,
    };
  } catch (error) {
    logger.warn("Failed to read audit store from KV.", {
      scope: "travelAssistant/updateAuditStore",
      error,
    });
    return createEmptyStore();
  }
}

async function saveStore(auditKey: string, data: UpdateAuditStoreData): Promise<void> {
  await kvStoreSet(auditKey, data);
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
  source = "interactive",
}: {
  result: TravelUpdateCheckResult;
  checkedAt?: string;
  storagePath?: string;
  source?: "interactive" | "background";
}): Promise<{
  freshUpdates: TravelUpdateEvent[];
  duplicateUpdates: number;
  summary: TravelUpdateAuditSummary;
}> {
  const effectiveCheckedAt = checkedAt ?? new Date().toISOString();
  const requestId = randomUUID();
  const auditKey = resolveAuditKey(storagePath);

  const run = async (): Promise<{
    freshUpdates: TravelUpdateEvent[];
    duplicateUpdates: number;
    summary: TravelUpdateAuditSummary;
  }> => {
    const store = await loadStore(auditKey);
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
      source,
      requestId,
      checkedAt: effectiveCheckedAt,
      mode: result.mode,
      provider: result.provider,
      incomingUpdates: result.updates.length,
      newUpdates: freshUpdates.length,
      duplicateUpdates,
      providerError: result.error,
      circuitOpen: result.circuitOpen,
      conflictAccepted: result.conflictResolution?.acceptedUpdates ?? result.updates.length,
      conflictSuppressed: result.conflictResolution?.suppressedUpdates ?? 0,
      providerReports: result.providerReports,
    });
    if (store.auditTrail.length > MAX_AUDIT_TRAIL_ENTRIES) {
      store.auditTrail.length = MAX_AUDIT_TRAIL_ENTRIES;
    }

    await saveStore(auditKey, store);
    return { freshUpdates, duplicateUpdates, summary };
  };

  const task = writeQueue.then(run, run);
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export async function readTravelUpdateAuditSnapshot({
  storagePath,
  limit = 20,
}: {
  storagePath?: string;
  limit?: number;
} = {}): Promise<TravelAuditReadSnapshot> {
  const auditKey = resolveAuditKey(storagePath);
  const store = await loadStore(auditKey);
  return {
    totalKnownEvents: Object.keys(store.eventsByKey).length,
    recentAuditTrail: store.auditTrail.slice(0, Math.max(1, limit)),
  };
}
