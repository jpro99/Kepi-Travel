import { randomUUID } from "node:crypto";
import type {
  TravelOpsAction,
  TravelOpsActionAuditEntry,
  TravelOpsActionAuditSnapshot,
  TravelOpsActionResult,
} from "@/lib/travelAssistant/travelUpdateTypes";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { logger } from "@/lib/logger";

interface StoredOpsActionAuditEntry extends TravelOpsActionAuditEntry {
  statusCode: number;
  responsePayload: unknown;
}

interface OpsActionAuditStoreData {
  version: 1;
  entries: StoredOpsActionAuditEntry[];
}

const DEFAULT_OPS_AUDIT_KEY = "travel/ops-audit/default";
const MAX_OPS_AUDIT_ENTRIES = 500;
let writeQueue: Promise<void> = Promise.resolve();

function resolveOpsAuditKey(customPath?: string): string {
  return customPath ?? process.env.TRAVEL_UPDATE_OPS_AUDIT_PATH ?? DEFAULT_OPS_AUDIT_KEY;
}

function createEmptyStore(): OpsActionAuditStoreData {
  return {
    version: 1,
    entries: [],
  };
}

async function loadStore(auditKey: string): Promise<OpsActionAuditStoreData> {
  try {
    const parsed = await kvStoreGet<Partial<OpsActionAuditStoreData>>(auditKey);
    if (!parsed) {
      return createEmptyStore();
    }
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return createEmptyStore();
    }
    return {
      version: 1,
      entries: parsed.entries.filter((entry) => {
        const candidate = entry as Partial<StoredOpsActionAuditEntry>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.action === "string" &&
          typeof candidate.requestedAt === "string" &&
          typeof candidate.completedAt === "string" &&
          typeof candidate.actor === "string" &&
          typeof candidate.result === "string" &&
          typeof candidate.requestSummary === "string" &&
          typeof candidate.responseSummary === "string" &&
          (typeof candidate.idempotencyKey === "string" || candidate.idempotencyKey === null) &&
          typeof candidate.replayed === "boolean" &&
          typeof candidate.statusCode === "number"
        );
      }) as StoredOpsActionAuditEntry[],
    };
  } catch (error) {
    logger.warn("Failed to read ops audit store from KV.", {
      scope: "travelAssistant/opsActionAuditStore",
      error,
    });
    return createEmptyStore();
  }
}

async function saveStore(auditKey: string, store: OpsActionAuditStoreData): Promise<void> {
  await kvStoreSet(auditKey, store);
}

export async function readTravelOpsActionAuditSnapshot({
  storagePath,
  limit = 20,
}: {
  storagePath?: string;
  limit?: number;
} = {}): Promise<TravelOpsActionAuditSnapshot> {
  const auditKey = resolveOpsAuditKey(storagePath);
  const store = await loadStore(auditKey);
  return {
    recentActions: store.entries.slice(0, Math.max(1, limit)),
  };
}

export async function findTravelOpsActionReplay({
  action,
  idempotencyKey,
  storagePath,
}: {
  action: TravelOpsAction;
  idempotencyKey: string;
  storagePath?: string;
}): Promise<StoredOpsActionAuditEntry | null> {
  const auditKey = resolveOpsAuditKey(storagePath);
  const store = await loadStore(auditKey);
  return (
    store.entries.find((entry) => entry.action === action && entry.idempotencyKey === idempotencyKey) ?? null
  );
}

export async function appendTravelOpsActionAuditEntry({
  action,
  actor,
  result,
  requestSummary,
  responseSummary,
  responsePayload,
  statusCode,
  idempotencyKey,
  replayed,
  requestedAt,
  completedAt,
  storagePath,
}: {
  action: TravelOpsAction;
  actor: string;
  result: TravelOpsActionResult;
  requestSummary: string;
  responseSummary: string;
  responsePayload: unknown;
  statusCode: number;
  idempotencyKey: string | null;
  replayed: boolean;
  requestedAt?: string;
  completedAt?: string;
  storagePath?: string;
}): Promise<StoredOpsActionAuditEntry> {
  const auditKey = resolveOpsAuditKey(storagePath);
  const entry: StoredOpsActionAuditEntry = {
    id: randomUUID(),
    action,
    actor,
    result,
    requestSummary,
    responseSummary,
    idempotencyKey,
    replayed,
    requestedAt: requestedAt ?? new Date().toISOString(),
    completedAt: completedAt ?? new Date().toISOString(),
    statusCode,
    responsePayload,
  };

  const run = async (): Promise<StoredOpsActionAuditEntry> => {
    const store = await loadStore(auditKey);
    store.entries.unshift(entry);
    if (store.entries.length > MAX_OPS_AUDIT_ENTRIES) {
      store.entries.length = MAX_OPS_AUDIT_ENTRIES;
    }
    await saveStore(auditKey, store);
    return entry;
  };

  const task = writeQueue.then(run, run);
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
