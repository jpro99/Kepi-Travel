import { randomUUID } from "node:crypto";
import type {
  TravelOpsAlertAuditEntry,
  TravelOpsAlertAuditSnapshot,
  TravelOpsAlertEvent,
} from "@/lib/travelAssistant/travelUpdateTypes";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

interface OpsAlertAuditStoreData {
  version: 1;
  sweeps: TravelOpsAlertAuditEntry[];
}

const DEFAULT_OPS_ALERT_AUDIT_KEY = "travel/ops-alert-audit/default";
const MAX_SWEEPS = 500;
let writeQueue: Promise<void> = Promise.resolve();

function resolveOpsAlertAuditKey(customPath?: string): string {
  return customPath ?? process.env.TRAVEL_UPDATE_ALERT_AUDIT_PATH ?? DEFAULT_OPS_ALERT_AUDIT_KEY;
}

function createEmptyStore(): OpsAlertAuditStoreData {
  return {
    version: 1,
    sweeps: [],
  };
}

async function loadStore(auditKey: string): Promise<OpsAlertAuditStoreData> {
  try {
    const parsed = await kvStoreGet<Partial<OpsAlertAuditStoreData>>(auditKey);
    if (!parsed) {
      return createEmptyStore();
    }
    if (parsed.version !== 1 || !Array.isArray(parsed.sweeps)) {
      return createEmptyStore();
    }
    return {
      version: 1,
      sweeps: parsed.sweeps.filter((sweep) => {
        const candidate = sweep as Partial<TravelOpsAlertAuditEntry>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.evaluatedAt === "string" &&
          typeof candidate.trigger === "string" &&
          typeof candidate.totalAlerts === "number" &&
          typeof candidate.sentAlerts === "number" &&
          typeof candidate.suppressedAlerts === "number" &&
          typeof candidate.deliveryErrors === "number" &&
          Array.isArray(candidate.alerts)
        );
      }) as TravelOpsAlertAuditEntry[],
    };
  } catch (error) {
    console.warn("[travelAssistant/opsAlertAuditStore] Failed to read alert audit store from KV:", error);
    return createEmptyStore();
  }
}

async function saveStore(auditKey: string, store: OpsAlertAuditStoreData): Promise<void> {
  await kvStoreSet(auditKey, store);
}

export async function appendTravelOpsAlertAuditEntry({
  evaluatedAt,
  trigger,
  totalAlerts,
  sentAlerts,
  suppressedAlerts,
  deliveryErrors,
  alerts,
  storagePath,
}: {
  evaluatedAt: string;
  trigger: string;
  totalAlerts: number;
  sentAlerts: number;
  suppressedAlerts: number;
  deliveryErrors: number;
  alerts: TravelOpsAlertEvent[];
  storagePath?: string;
}): Promise<TravelOpsAlertAuditEntry> {
  const auditKey = resolveOpsAlertAuditKey(storagePath);
  const entry: TravelOpsAlertAuditEntry = {
    id: randomUUID(),
    evaluatedAt,
    trigger,
    totalAlerts,
    sentAlerts,
    suppressedAlerts,
    deliveryErrors,
    alerts,
  };

  const run = async (): Promise<TravelOpsAlertAuditEntry> => {
    const store = await loadStore(auditKey);
    store.sweeps.unshift(entry);
    if (store.sweeps.length > MAX_SWEEPS) {
      store.sweeps.length = MAX_SWEEPS;
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

export async function readTravelOpsAlertAuditSnapshot({
  storagePath,
  limit = 20,
}: {
  storagePath?: string;
  limit?: number;
} = {}): Promise<TravelOpsAlertAuditSnapshot> {
  const auditKey = resolveOpsAlertAuditKey(storagePath);
  const store = await loadStore(auditKey);
  return {
    recentSweeps: store.sweeps.slice(0, Math.max(1, limit)),
  };
}
