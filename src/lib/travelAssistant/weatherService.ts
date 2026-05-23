import "server-only";

import { logger } from "@/lib/logger";
import { getSafeRedisClient, hasRedisEnvConfig } from "@/lib/redis";

const WEATHER_CACHE_TTL_SECONDS = 60 * 60 * 3;
const WEATHER_FALLBACK: WeatherForecast = {
  temp: "N/A",
  condition: "Unavailable",
  humidity: "N/A",
  wind: "N/A",
  forecast: [],
};

export interface WeatherForecastDay {
  date: string;
  minTempC: string;
  maxTempC: string;
  condition: string;
  humidity: string;
  wind: string;
}

export interface WeatherForecast {
  temp: string;
  condition: string;
  humidity: string;
  wind: string;
  forecast: WeatherForecastDay[];
}

type CacheEnvelope = {
  value: WeatherForecast;
  expiresAtMs: number;
};

const memoryCache = new Map<string, CacheEnvelope>();

function isKvConfigured(): boolean {
  return hasRedisEnvConfig();
}

function normalizeCity(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "");
}

function toDateKey(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function toCacheKey(city: string, nowMs = Date.now()): string {
  return `kepi:weather:${normalizeCity(city)}:${toDateKey(nowMs)}`;
}

function parseWeatherPayload(payload: unknown, days: number): WeatherForecast | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = payload as {
    current_condition?: Array<{
      temp_C?: string;
      weatherDesc?: Array<{ value?: string }>;
      humidity?: string;
      windspeedKmph?: string;
    }>;
    weather?: Array<{
      date?: string;
      mintempC?: string;
      maxtempC?: string;
      hourly?: Array<{
        weatherDesc?: Array<{ value?: string }>;
        humidity?: string;
        windspeedKmph?: string;
      }>;
    }>;
  };
  const current = candidate.current_condition?.[0];
  if (!current) {
    return null;
  }
  const weatherDays = (candidate.weather ?? []).slice(0, Math.max(1, days)).map((entry) => {
    const hourly = entry.hourly?.[0];
    return {
      date: entry.date?.trim() || "",
      minTempC: entry.mintempC?.trim() || "N/A",
      maxTempC: entry.maxtempC?.trim() || "N/A",
      condition: hourly?.weatherDesc?.[0]?.value?.trim() || "Unavailable",
      humidity: hourly?.humidity?.trim() || "N/A",
      wind: hourly?.windspeedKmph?.trim() ? `${hourly.windspeedKmph.trim()} km/h` : "N/A",
    };
  });

  return {
    temp: current.temp_C?.trim() ? `${current.temp_C.trim()}C` : "N/A",
    condition: current.weatherDesc?.[0]?.value?.trim() || "Unavailable",
    humidity: current.humidity?.trim() ? `${current.humidity.trim()}%` : "N/A",
    wind: current.windspeedKmph?.trim() ? `${current.windspeedKmph.trim()} km/h` : "N/A",
    forecast: weatherDays,
  };
}

async function getCachedWeather(cacheKey: string, nowMs = Date.now()): Promise<WeatherForecast | null> {
  const memoryValue = memoryCache.get(cacheKey);
  if (memoryValue && memoryValue.expiresAtMs > nowMs) {
    return memoryValue.value;
  }
  if (memoryValue) {
    memoryCache.delete(cacheKey);
  }

  if (!isKvConfigured()) {
    return null;
  }
  const redis = getSafeRedisClient("travelAssistant/weatherService");
  if (!redis) {
    return null;
  }

  try {
    return (await redis.get<WeatherForecast>(cacheKey)) ?? null;
  } catch (error) {
    logger.warn("Weather cache read failed; falling back to live fetch.", {
      scope: "travelAssistant/weatherService",
      cacheKey,
      error,
    });
    return null;
  }
}

async function setCachedWeather(cacheKey: string, value: WeatherForecast): Promise<void> {
  const expiresAtMs = Date.now() + WEATHER_CACHE_TTL_SECONDS * 1000;
  memoryCache.set(cacheKey, { value, expiresAtMs });
  if (!isKvConfigured()) {
    return;
  }
  const redis = getSafeRedisClient("travelAssistant/weatherService");
  if (!redis) {
    return;
  }
  try {
    await redis.set(cacheKey, value, { ex: WEATHER_CACHE_TTL_SECONDS });
  } catch (error) {
    logger.warn("Weather cache write failed.", {
      scope: "travelAssistant/weatherService",
      cacheKey,
      error,
    });
  }
}

export async function getWeatherForecast(city: string, days = 3): Promise<WeatherForecast> {
  const normalizedCity = city.trim();
  if (!normalizedCity) {
    return WEATHER_FALLBACK;
  }

  const safeDays = Math.max(1, Math.min(7, Math.round(days)));
  const cacheKey = toCacheKey(normalizedCity);
  const cached = await getCachedWeather(cacheKey);
  if (cached) {
    return {
      ...cached,
      forecast: cached.forecast.slice(0, safeDays),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`https://wttr.in/${encodeURIComponent(normalizedCity)}?format=j1`, {
      method: "GET",
      cache: "no-store",
      headers: { "User-Agent": "kepi-travel-assistant/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return WEATHER_FALLBACK;
    }
    const payload = (await response.json()) as unknown;
    const parsed = parseWeatherPayload(payload, safeDays);
    if (!parsed) {
      return WEATHER_FALLBACK;
    }
    await setCachedWeather(cacheKey, parsed);
    return parsed;
  } catch (error) {
    logger.warn("Weather provider request failed; using fallback.", {
      scope: "travelAssistant/weatherService",
      city: normalizedCity,
      error,
    });
    return WEATHER_FALLBACK;
  } finally {
    clearTimeout(timeout);
  }
}
