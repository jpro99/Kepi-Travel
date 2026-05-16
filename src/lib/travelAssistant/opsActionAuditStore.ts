import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  TravelOpsAction,
  TravelOpsActionAuditEntry,
  TravelOpsActionAuditSnapshot,
  TravelOpsActionResult,
} from "@/lib/travelAssistant/travelUpdateTypes";

interface StoredOpsActionAuditEntry extends TravelOpsActionAuditEntry {
  statusCode: number;
  responsePayload: unknown;
}

interface OpsActionAuditStoreData {
  version: 1;
  entries: StoredOpsActionAuditEntry[];
}

const DEFAULT_OPS_AUDIT_PATH = "/tmp/kepi-travel-ops-audit.json";
const MAX_OPS_AUDIT_ENTRIES = 500;
let writeQueue: Promise<void> = Promise.resolve();

function resolveOpsAuditPath(customPath?: string): string {
  return customPath ?? process.env.TRAVEL_UPDATE_OPS_AUDIT_PATH ?? DEFAULT_OPS_AUDIT_PATH;
}

function createEmptyStore(): OpsActionAuditStoreData {
  return {
    version: 1,
    entries: [],
  };
}

async function loadStore(filePath: string): Promise<OpsActionAuditStoreData> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<OpsActionAuditStoreData>;
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
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyStore();
    }
    throw error;
  }
}

async function saveStore(filePath: string, store: OpsActionAuditStoreData): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

export async function readTravelOpsActionAuditSnapshot({
  storagePath,
  limit = 20,
}: {
  storagePath?: string;
  limit?: number;
} = {}): Promise<TravelOpsActionAuditSnapshot> {
  const filePath = resolveOpsAuditPath(storagePath);
  const store = await loadStore(filePath);
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
  const filePath = resolveOpsAuditPath(storagePath);
  const store = await loadStore(filePath);
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
  const filePath = resolveOpsAuditPath(storagePath);
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
    const store = await loadStore(filePath);
    store.entries.unshift(entry);
    if (store.entries.length > MAX_OPS_AUDIT_ENTRIES) {
      store.entries.length = MAX_OPS_AUDIT_ENTRIES;
    }
    await saveStore(filePath, store);
    return entry;
  };

  const task = writeQueue.then(run, run);
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
