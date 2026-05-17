import type {
  TravelUpdateMode,
  UpdatableReservation,
} from "@/lib/travelAssistant/travelUpdateTypes";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

interface RuntimeStateData {
  version: 1;
  mode: TravelUpdateMode;
  updatedAt: string;
  reservations: UpdatableReservation[];
}

const DEFAULT_RUNTIME_STATE_KEY = "travel/runtime-state/default";
let writeQueue: Promise<void> = Promise.resolve();

function resolveRuntimeStateKey(customPath?: string): string {
  return customPath ?? process.env.TRAVEL_UPDATE_RUNTIME_STATE_PATH ?? DEFAULT_RUNTIME_STATE_KEY;
}

function createEmptyState(): RuntimeStateData {
  return {
    version: 1,
    mode: "auto",
    updatedAt: new Date(0).toISOString(),
    reservations: [],
  };
}

async function loadState(stateKey: string): Promise<RuntimeStateData> {
  try {
    const parsed = await kvStoreGet<Partial<RuntimeStateData>>(stateKey);
    if (!parsed) {
      return createEmptyState();
    }
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.reservations) ||
      typeof parsed.mode !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return createEmptyState();
    }
    return {
      version: 1,
      mode: parsed.mode,
      updatedAt: parsed.updatedAt,
      reservations: parsed.reservations,
    };
  } catch (error) {
    console.warn("[travelAssistant/updateRuntimeStateStore] Failed to read runtime state from KV:", error);
    return createEmptyState();
  }
}

async function saveState(stateKey: string, data: RuntimeStateData): Promise<void> {
  await kvStoreSet(stateKey, data);
}

export async function persistTravelRuntimeState({
  reservations,
  mode,
  updatedAt,
  storagePath,
}: {
  reservations: readonly UpdatableReservation[];
  mode: TravelUpdateMode;
  updatedAt?: string;
  storagePath?: string;
}): Promise<void> {
  const stateKey = resolveRuntimeStateKey(storagePath);
  const effectiveUpdatedAt = updatedAt ?? new Date().toISOString();

  const run = async (): Promise<void> => {
    const nextState: RuntimeStateData = {
      version: 1,
      mode,
      updatedAt: effectiveUpdatedAt,
      reservations: [...reservations],
    };
    await saveState(stateKey, nextState);
  };

  const task = writeQueue.then(run, run);
  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export async function readTravelRuntimeState(storagePath?: string): Promise<{
  mode: TravelUpdateMode;
  updatedAt: string;
  reservations: UpdatableReservation[];
}> {
  const stateKey = resolveRuntimeStateKey(storagePath);
  const state = await loadState(stateKey);
  return {
    mode: state.mode,
    updatedAt: state.updatedAt,
    reservations: state.reservations,
  };
}
