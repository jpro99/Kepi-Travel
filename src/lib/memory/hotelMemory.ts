import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { generateId } from "@/lib/utils/generateId";

const HOTEL_MEMORY_KEY = "hotel-stay-memory";
const MAX_EVENTS = 40;

export type HotelMemoryAction = "saved" | "booked" | "liked" | "dismissed" | "searched";

export interface HotelMemoryEvent {
  id: string;
  action: HotelMemoryAction;
  at: string;
  hotelId?: string;
  hotelName?: string;
  chainName?: string;
  city: string;
  nightlyUsd?: number;
  stars?: number;
  amenities?: string[];
}

/** Long-term hotel preferences learned from searches, saves, and feedback. */
export interface HotelStayMemory {
  userId: string;
  updatedAt: string;
  preferredChains: Array<{ name: string; weight: number }>;
  avoidedChains: string[];
  /** Rolling comfort zone for nightly cash rates the user actually picks. */
  typicalNightlyUsd?: number;
  prefersNearTransit: boolean;
  prefersCentralArea: boolean;
  valueVsQualityBias: number;
  events: HotelMemoryEvent[];
}

export function createEmptyHotelMemory(userId: string): HotelStayMemory {
  return {
    userId,
    updatedAt: new Date().toISOString(),
    preferredChains: [],
    avoidedChains: [],
    prefersNearTransit: false,
    prefersCentralArea: true,
    valueVsQualityBias: 0,
    events: [],
  };
}

export async function getHotelStayMemory(userId?: string): Promise<HotelStayMemory> {
  const namespace = userId?.trim() || "anonymous";
  try {
    const existing = await Promise.race([
      kvStoreGet<HotelStayMemory>(HOTEL_MEMORY_KEY, { userId: namespace }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    if (existing) return existing;
  } catch {
    // degrade to empty memory
  }
  const seeded = createEmptyHotelMemory(namespace);
  kvStoreSet(HOTEL_MEMORY_KEY, seeded, { userId: namespace }).catch(() => {});
  return seeded;
}

export async function saveHotelStayMemory(memory: HotelStayMemory, userId?: string): Promise<HotelStayMemory> {
  const updated: HotelStayMemory = {
    ...memory,
    updatedAt: new Date().toISOString(),
    events: memory.events.slice(0, MAX_EVENTS),
  };
  await kvStoreSet(HOTEL_MEMORY_KEY, updated, { userId: userId ?? memory.userId });
  return updated;
}

function bumpChainWeight(
  chains: Array<{ name: string; weight: number }>,
  chainName: string,
  delta: number,
): Array<{ name: string; weight: number }> {
  const normalized = chainName.trim();
  if (!normalized) return chains;
  const existing = chains.find((entry) => entry.name.toLowerCase() === normalized.toLowerCase());
  if (existing) {
    return chains
      .map((entry) =>
        entry.name.toLowerCase() === normalized.toLowerCase()
          ? { ...entry, weight: Math.min(100, entry.weight + delta) }
          : entry,
      )
      .sort((a, b) => b.weight - a.weight);
  }
  return [{ name: normalized, weight: Math.max(1, delta) }, ...chains].slice(0, 8);
}

function hasTransitSignal(amenities: string[] | undefined): boolean {
  const haystack = (amenities ?? []).join(" ").toLowerCase();
  return /metro|subway|train|transit|rail|bus|public transport|city center|downtown|central/.test(haystack);
}

export function learnFromHotelEvent(
  memory: HotelStayMemory,
  event: Omit<HotelMemoryEvent, "id" | "at">,
): HotelStayMemory {
  const record: HotelMemoryEvent = {
    id: generateId(),
    at: new Date().toISOString(),
    ...event,
  };

  let preferredChains = memory.preferredChains;
  let avoidedChains = memory.avoidedChains;
  let typicalNightlyUsd = memory.typicalNightlyUsd;
  let prefersNearTransit = memory.prefersNearTransit;
  let prefersCentralArea = memory.prefersCentralArea;
  let valueVsQualityBias = memory.valueVsQualityBias;

  if (event.chainName && (event.action === "saved" || event.action === "booked" || event.action === "liked")) {
    preferredChains = bumpChainWeight(preferredChains, event.chainName, event.action === "booked" ? 18 : 12);
  }
  if (event.chainName && event.action === "dismissed") {
    avoidedChains = [...new Set([...avoidedChains, event.chainName.trim()])].slice(0, 8);
    preferredChains = preferredChains
      .map((entry) =>
        entry.name.toLowerCase() === event.chainName!.toLowerCase()
          ? { ...entry, weight: Math.max(0, entry.weight - 8) }
          : entry,
      )
      .filter((entry) => entry.weight > 0);
  }

  if (event.nightlyUsd && event.nightlyUsd > 0 && (event.action === "saved" || event.action === "booked")) {
    typicalNightlyUsd =
      typicalNightlyUsd === undefined
        ? event.nightlyUsd
        : Math.round(typicalNightlyUsd * 0.7 + event.nightlyUsd * 0.3);
  }

  if (hasTransitSignal(event.amenities) && (event.action === "saved" || event.action === "liked")) {
    prefersNearTransit = true;
    prefersCentralArea = true;
  }

  if (event.stars !== undefined && event.stars >= 4 && event.action === "saved") {
    valueVsQualityBias = Math.min(1, valueVsQualityBias + 0.08);
  }
  if (event.nightlyUsd !== undefined && typicalNightlyUsd !== undefined && event.nightlyUsd < typicalNightlyUsd * 0.85) {
    valueVsQualityBias = Math.max(-1, valueVsQualityBias - 0.05);
  }

  return {
    ...memory,
    preferredChains,
    avoidedChains,
    typicalNightlyUsd,
    prefersNearTransit,
    prefersCentralArea,
    valueVsQualityBias,
    events: [record, ...memory.events].slice(0, MAX_EVENTS),
    updatedAt: new Date().toISOString(),
  };
}

export function summarizeHotelMemory(memory: HotelStayMemory): string | null {
  const parts: string[] = [];
  const topChains = memory.preferredChains.filter((entry) => entry.weight >= 8).slice(0, 2);
  if (topChains.length > 0) {
    parts.push(`you often pick ${topChains.map((entry) => entry.name).join(" and ")}`);
  }
  if (memory.prefersNearTransit) {
    parts.push("you like stays near metro or transit");
  }
  if (memory.typicalNightlyUsd) {
    parts.push(`your sweet spot is about $${memory.typicalNightlyUsd}/night`);
  }
  if (memory.valueVsQualityBias <= -0.2) {
    parts.push("you lean value-first");
  } else if (memory.valueVsQualityBias >= 0.2) {
    parts.push("you lean quality-first");
  }
  if (parts.length === 0) return null;
  return `Kepi remembers ${parts.join(", ")}.`;
}
