import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  TravelOpsAlertAuditEntry,
  TravelOpsAlertAuditSnapshot,
  TravelOpsAlertEvent,
} from "@/lib/travelAssistant/travelUpdateTypes";

interface OpsAlertAuditStoreData {
  version: 1;
  sweeps: TravelOpsAlertAuditEntry[];
}

const DEFAULT_OPS_ALERT_AUDIT_PATH = "/tmp/kepi-travel-alert-audit.json";
const MAX_SWEEPS = 500;
let writeQueue: Promise<void> = Promise.resolve();

function resolveOpsAlertAuditPath(customPath?: string): string {
  return customPath ?? process.env.TRAVEL_UPDATE_ALERT_AUDIT_PATH ?? DEFAULT_OPS_ALERT_AUDIT_PATH;
}

function createEmptyStore(): OpsAlertAuditStoreData {
  return {
    version: 1,
    sweeps: [],
  };
}

async function loadStore(filePath: string): Promise<OpsAlertAuditStoreData> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<OpsAlertAuditStoreData>;
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
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyStore();
    }
    throw error;
  }
}

async function saveStore(filePath: string, store: OpsAlertAuditStoreData): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
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
  const filePath = resolveOpsAlertAuditPath(storagePath);
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
    const store = await loadStore(filePath);
    store.sweeps.unshift(entry);
    if (store.sweeps.length > MAX_SWEEPS) {
      store.sweeps.length = MAX_SWEEPS;
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

export async function readTravelOpsAlertAuditSnapshot({
  storagePath,
  limit = 20,
}: {
  storagePath?: string;
  limit?: number;
} = {}): Promise<TravelOpsAlertAuditSnapshot> {
  const filePath = resolveOpsAlertAuditPath(storagePath);
  const store = await loadStore(filePath);
  return {
    recentSweeps: store.sweeps.slice(0, Math.max(1, limit)),
  };
}
