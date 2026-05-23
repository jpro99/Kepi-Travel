import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import { getSafeRedisClient, hasRedisEnvConfig } from "@/lib/redis";

const LOCAL_INTEL_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
const MODEL = "claude-sonnet-4-20250514";
const LOCAL_INTEL_SYSTEM_PROMPT = [
  "You are a destination operations advisor for a premium adaptive travel app.",
  "Provide concise, practical local logistics guidance.",
  "Never mention travel insurance, policy products, claims, reimbursements, or related advice.",
  "Output strict JSON only with arrays of short bullet strings for each requested section.",
].join(" ");

const INSURANCE_PATTERN = /travel\s+insurance|insurance/giu;

export interface LocalTips {
  bestAreasToStay: string[];
  localTransportTips: string[];
  currencyAndTippingCustoms: string[];
  safetyNotes: string[];
  packingSuggestions: string[];
}

const LOCAL_TIPS_FALLBACK: LocalTips = {
  bestAreasToStay: ["Stay near your arrival hub for faster first-night transfers."],
  localTransportTips: ["Pre-book your airport/station transfer and keep one backup app option ready."],
  currencyAndTippingCustoms: ["Use card-first payment where possible and keep a small amount of local cash."],
  safetyNotes: ["Use well-lit pickup points and share your live ETA with companions."],
  packingSuggestions: ["Pack layered clothing and one compact rain layer for schedule resilience."],
};

type CacheEnvelope = {
  value: LocalTips;
  expiresAtMs: number;
};

const memoryCache = new Map<string, CacheEnvelope>();

function isKvConfigured(): boolean {
  return hasRedisEnvConfig();
}

function normalizeDestination(destination: string): string {
  return destination
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "");
}

function monthKey(tripDates?: { startDate?: string; endDate?: string }): string {
  const seed = tripDates?.startDate || tripDates?.endDate || new Date().toISOString();
  const parsed = Date.parse(seed.includes("T") ? seed : `${seed}T00:00:00Z`);
  const date = Number.isNaN(parsed) ? new Date() : new Date(parsed);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function cacheKey(destination: string, tripDates?: { startDate?: string; endDate?: string }): string {
  return `kepi:local:${normalizeDestination(destination)}:${monthKey(tripDates)}`;
}

function sanitizeTipText(value: string): string {
  return value.replace(INSURANCE_PATTERN, "coverage planning");
}

function sanitizeTips(value: LocalTips): LocalTips {
  const sanitizeArray = (items: string[]): string[] => items.map((item) => sanitizeTipText(item));
  return {
    bestAreasToStay: sanitizeArray(value.bestAreasToStay),
    localTransportTips: sanitizeArray(value.localTransportTips),
    currencyAndTippingCustoms: sanitizeArray(value.currencyAndTippingCustoms),
    safetyNotes: sanitizeArray(value.safetyNotes),
    packingSuggestions: sanitizeArray(value.packingSuggestions),
  };
}

function coerceTips(payload: unknown): LocalTips | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = payload as Partial<LocalTips>;
  const toArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];

  const tips: LocalTips = {
    bestAreasToStay: toArray(candidate.bestAreasToStay),
    localTransportTips: toArray(candidate.localTransportTips),
    currencyAndTippingCustoms: toArray(candidate.currencyAndTippingCustoms),
    safetyNotes: toArray(candidate.safetyNotes),
    packingSuggestions: toArray(candidate.packingSuggestions),
  };

  const hasAnyContent = Object.values(tips).some((items) => items.length > 0);
  return hasAnyContent ? sanitizeTips(tips) : null;
}

async function readCache(key: string, nowMs = Date.now()): Promise<LocalTips | null> {
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry && memoryEntry.expiresAtMs > nowMs) {
    return memoryEntry.value;
  }
  if (memoryEntry) {
    memoryCache.delete(key);
  }
  if (!isKvConfigured()) {
    return null;
  }
  const redis = getSafeRedisClient("travelAssistant/localIntelligenceService");
  if (!redis) {
    return null;
  }
  try {
    return (await redis.get<LocalTips>(key)) ?? null;
  } catch (error) {
    logger.warn("Local intelligence cache read failed.", {
      scope: "travelAssistant/localIntelligenceService",
      key,
      error,
    });
    return null;
  }
}

async function writeCache(key: string, value: LocalTips): Promise<void> {
  memoryCache.set(key, {
    value,
    expiresAtMs: Date.now() + LOCAL_INTEL_CACHE_TTL_SECONDS * 1000,
  });
  if (!isKvConfigured()) {
    return;
  }
  const redis = getSafeRedisClient("travelAssistant/localIntelligenceService");
  if (!redis) {
    return;
  }
  try {
    await redis.set(key, value, { ex: LOCAL_INTEL_CACHE_TTL_SECONDS });
  } catch (error) {
    logger.warn("Local intelligence cache write failed.", {
      scope: "travelAssistant/localIntelligenceService",
      key,
      error,
    });
  }
}

async function generateLocalTipsWithClaude(
  destination: string,
  tripDates?: { startDate?: string; endDate?: string },
): Promise<LocalTips | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      temperature: 0.2,
      system: LOCAL_INTEL_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Destination: ${destination}`,
            `Trip dates: ${tripDates?.startDate ?? "unknown"} to ${tripDates?.endDate ?? "unknown"}`,
            "Return JSON with exactly these keys:",
            "bestAreasToStay",
            "localTransportTips",
            "currencyAndTippingCustoms",
            "safetyNotes",
            "packingSuggestions",
            "Each key must contain 2-4 concise strings focused on execution logistics.",
          ].join("\n"),
        },
      ],
    });

    const text = message.content
      .filter((block): block is Extract<(typeof message.content)[number], { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (!text) {
      return null;
    }
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < jsonStart) {
      return null;
    }
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as unknown;
    return coerceTips(parsed);
  } catch (error) {
    logger.warn("Claude local intelligence generation failed.", {
      scope: "travelAssistant/localIntelligenceService",
      destination,
      error,
    });
    return null;
  }
}

export async function getLocalTips(
  destination: string,
  tripDates?: { startDate?: string; endDate?: string },
): Promise<LocalTips> {
  const normalizedDestination = destination.trim();
  if (!normalizedDestination) {
    return LOCAL_TIPS_FALLBACK;
  }
  const key = cacheKey(normalizedDestination, tripDates);
  const cached = await readCache(key);
  if (cached) {
    return cached;
  }

  const generated = await generateLocalTipsWithClaude(normalizedDestination, tripDates);
  const nextValue = generated ?? LOCAL_TIPS_FALLBACK;
  await writeCache(key, nextValue);
  return nextValue;
}
