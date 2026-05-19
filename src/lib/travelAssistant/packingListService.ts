import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import type { PackingListCategories } from "@/lib/travelAssistant/packingStore";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { getWeatherForecast } from "@/lib/travelAssistant/weatherService";

const PACKING_CACHE_KEY_PREFIX = "packing";
const AI_MODEL = "claude-sonnet-4-20250514";
const INSURANCE_PATTERN = /travel\s+insurance|insurance/giu;

export interface PackingListGenerationInput {
  userId: string;
  tripId: string;
  destination: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  reservationTypes: string[];
  tripStage: string;
  activities: string[];
  forceRefresh?: boolean;
}

interface PackingCacheEntry {
  generatedAt: string;
  categories: PackingListCategories;
}

const EMPTY_CATEGORIES: PackingListCategories = {
  essentials: [],
  clothing: [],
  toiletries: [],
  electronics: [],
  documents: [],
  optional: [],
};

const SYSTEM_PROMPT = [
  "You are a premium travel operations assistant that generates practical packing lists.",
  "Always return strict JSON only.",
  "Never mention travel insurance, policy products, claims, reimbursements, or insurance paperwork.",
  "Return concise, actionable packing items with no duplicates.",
  "Use exactly these keys: essentials, clothing, toiletries, electronics, documents, optional.",
].join(" ");

function cacheKey(tripId: string): string {
  return `${PACKING_CACHE_KEY_PREFIX}:${tripId}`;
}

function sanitizeText(value: string): string {
  return value.replace(INSURANCE_PATTERN, "coverage planning");
}

function sanitizeCategories(categories: PackingListCategories): PackingListCategories {
  const sanitizeList = (items: string[]): string[] =>
    items
      .map((item) => sanitizeText(item.trim()))
      .filter((item) => item.length > 0);
  return {
    essentials: sanitizeList(categories.essentials),
    clothing: sanitizeList(categories.clothing),
    toiletries: sanitizeList(categories.toiletries),
    electronics: sanitizeList(categories.electronics),
    documents: sanitizeList(categories.documents),
    optional: sanitizeList(categories.optional),
  };
}

function dedupeCategories(categories: PackingListCategories): PackingListCategories {
  const dedupe = (items: string[]): string[] => {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const item of items) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(item);
    }
    return output;
  };
  return {
    essentials: dedupe(categories.essentials),
    clothing: dedupe(categories.clothing),
    toiletries: dedupe(categories.toiletries),
    electronics: dedupe(categories.electronics),
    documents: dedupe(categories.documents),
    optional: dedupe(categories.optional),
  };
}

function parseCategories(payload: unknown): PackingListCategories | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = payload as Partial<Record<keyof PackingListCategories, unknown>>;
  const toArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];

  const categories: PackingListCategories = {
    essentials: toArray(candidate.essentials),
    clothing: toArray(candidate.clothing),
    toiletries: toArray(candidate.toiletries),
    electronics: toArray(candidate.electronics),
    documents: toArray(candidate.documents),
    optional: toArray(candidate.optional),
  };
  const hasAny = Object.values(categories).some((items) => items.length > 0);
  if (!hasAny) {
    return null;
  }
  return dedupeCategories(sanitizeCategories(categories));
}

function fallbackPackingList(input: PackingListGenerationInput, weatherSummary: string): PackingListCategories {
  const includesBeach = input.reservationTypes.some((type) => /beach/iu.test(type)) || /beach|coast/iu.test(input.destination);
  const includesBusiness = input.reservationTypes.some((type) => /business|hotel/iu.test(type));
  const includesCamping = input.reservationTypes.some((type) => /camp/iu.test(type));
  return dedupeCategories(
    sanitizeCategories({
      essentials: [
        "Government ID or passport",
        "Primary payment card",
        "Medication and prescriptions",
        "Trip confirmations saved offline",
      ],
      clothing: [
        includesBeach ? "Swimwear and quick-dry cover-up" : "Comfortable day outfits",
        includesBusiness ? "Business-ready outfit and shoes" : "One versatile evening outfit",
        includesCamping ? "Outdoor layer and weatherproof pants" : "Light jacket for variable conditions",
      ],
      toiletries: ["Toothbrush and toothpaste", "Travel-size toiletries kit", "Sunscreen (if daytime outdoor plans)"],
      electronics: ["Phone + charger", "Portable battery pack", "Power adapter if required"],
      documents: [
        "Boarding passes / rail tickets",
        "Hotel reservation confirmations",
        "Ground transfer booking references",
      ],
      optional: [
        `Weather note: ${weatherSummary}`,
        "Reusable water bottle",
        "Compact laundry bag",
      ],
    }),
  );
}

async function generateWithClaude(
  input: PackingListGenerationInput,
  weather: { temp: string; condition: string; forecast: Array<{ date: string; condition: string; minTempC: string; maxTempC: string }> },
): Promise<PackingListCategories | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1000,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Destination: ${input.destination}`,
            `Trip dates: ${input.startDate} to ${input.endDate}`,
            `Duration (days): ${input.durationDays}`,
            `Trip stage: ${input.tripStage}`,
            `Reservation profile: ${input.reservationTypes.join(", ") || "unknown"}`,
            `Planned activities: ${input.activities.join(", ") || "none supplied"}`,
            `Current weather: ${weather.condition}, ${weather.temp}`,
            `3-day forecast: ${JSON.stringify(weather.forecast)}`,
            "Generate a practical packing list grouped by category.",
            "Return strict JSON only with keys: essentials, clothing, toiletries, electronics, documents, optional.",
            "Each category should contain 3-8 short items where relevant.",
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
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) {
      return null;
    }
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    return parseCategories(parsed);
  } catch (error) {
    logger.warn("AI packing list generation failed; using fallback.", {
      scope: "travelAssistant/packingListService",
      tripId: input.tripId,
      userId: input.userId,
      error,
    });
    return null;
  }
}

export async function generateSmartPackingList(input: PackingListGenerationInput): Promise<PackingListCategories> {
  if (!input.forceRefresh) {
    const cached = await kvStoreGet<PackingCacheEntry>(cacheKey(input.tripId), { userId: input.userId });
    if (cached?.categories) {
      const parsed = parseCategories(cached.categories);
      if (parsed) {
        return parsed;
      }
    }
  }

  const weather = await getWeatherForecast(input.destination, 3);
  const generated = await generateWithClaude(input, {
    temp: weather.temp,
    condition: weather.condition,
    forecast: weather.forecast.slice(0, 3).map((day) => ({
      date: day.date,
      condition: day.condition,
      minTempC: day.minTempC,
      maxTempC: day.maxTempC,
    })),
  });
  const fallback = fallbackPackingList(
    input,
    weather.condition === "Unavailable" ? "Weather unavailable, pack layered options." : `${weather.condition}, ${weather.temp}`,
  );
  const categories = generated ?? fallback;

  await kvStoreSet<PackingCacheEntry>(
    cacheKey(input.tripId),
    {
      generatedAt: new Date().toISOString(),
      categories: categories ?? EMPTY_CATEGORIES,
    },
    { userId: input.userId },
  );

  return categories;
}
