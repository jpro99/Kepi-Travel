import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

interface OpsAlertStateData {
  version: 1;
  lastSentByKey: Record<string, string>;
}

const DEFAULT_OPS_ALERT_STATE_KEY = "travel/ops-alert-state/default";
let writeQueue: Promise<void> = Promise.resolve();

function resolveAlertStateKey(customPath?: string): string {
  return customPath ?? process.env.TRAVEL_UPDATE_ALERT_STATE_PATH ?? DEFAULT_OPS_ALERT_STATE_KEY;
}

function createEmptyStore(): OpsAlertStateData {
  return {
    version: 1,
    lastSentByKey: {},
  };
}

async function loadStore(stateKey: string): Promise<OpsAlertStateData> {
  try {
    const parsed = await kvStoreGet<Partial<OpsAlertStateData>>(stateKey);
    if (!parsed) {
      return createEmptyStore();
    }
    if (parsed.version !== 1 || !parsed.lastSentByKey || typeof parsed.lastSentByKey !== "object") {
      return createEmptyStore();
    }
    return {
      version: 1,
      lastSentByKey: parsed.lastSentByKey,
    };
  } catch (error) {
    console.warn("[travelAssistant/opsAlertStateStore] Failed to read alert state from KV:", error);
    return createEmptyStore();
  }
}

async function saveStore(stateKey: string, state: OpsAlertStateData): Promise<void> {
  await kvStoreSet(stateKey, state);
}

export async function checkTravelOpsAlertEligibility({
  alertKey,
  nowIso,
  cooldownMs,
  storagePath,
}: {
  alertKey: string;
  nowIso: string;
  cooldownMs: number;
  storagePath?: string;
}): Promise<{ eligible: boolean; lastSentAt: string | null }> {
  const stateKey = resolveAlertStateKey(storagePath);
  const state = await loadStore(stateKey);
  const lastSentAt = state.lastSentByKey[alertKey] ?? null;
  if (!lastSentAt) {
    return { eligible: true, lastSentAt: null };
  }
  const nowMs = Date.parse(nowIso);
  const lastMs = Date.parse(lastSentAt);
  if (Number.isNaN(nowMs) || Number.isNaN(lastMs)) {
    return { eligible: true, lastSentAt };
  }
  return { eligible: nowMs - lastMs >= Math.max(1_000, cooldownMs), lastSentAt };
}

export async function markTravelOpsAlertSent({
  alertKey,
  sentAt,
  storagePath,
}: {
  alertKey: string;
  sentAt: string;
  storagePath?: string;
}): Promise<void> {
  const stateKey = resolveAlertStateKey(storagePath);
  const run = async (): Promise<void> => {
    const state = await loadStore(stateKey);
    state.lastSentByKey[alertKey] = sentAt;
    await saveStore(stateKey, state);
  };
  const task = writeQueue.then(run, run);
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  await task;
}
