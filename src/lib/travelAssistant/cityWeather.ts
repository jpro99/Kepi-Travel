export interface CityWeatherSnapshot {
  icon: string;
  highTemp: string;
  line: string;
  description?: string;
}

export interface DailyWeather {
  icon: string;
  highTemp: string;
  description: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const snapshotCache = new Map<string, { data: CityWeatherSnapshot; fetchedAt: number }>();
const forecastCache = new Map<string, { data: Map<string, DailyWeather>; fetchedAt: number }>();

function cacheKey(city: string, dateKey: string): string {
  return `${city.trim().toLowerCase()}|${dateKey}`;
}

function weatherCodeToEmoji(code: string | number | undefined): string {
  const n = Number(code);
  if (Number.isNaN(n)) return "🌤";
  if ([113].includes(n)) return "☀️";
  if ([116, 119].includes(n)) return "⛅";
  if ([122, 143, 248, 260].includes(n)) return "☁️";
  if ([176, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314, 353, 356, 359, 362, 365].includes(n)) {
    return "🌧";
  }
  if ([179, 182, 185, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377].includes(n)) {
    return "🌨";
  }
  if ([200, 386, 389, 392, 395].includes(n)) return "⛈";
  return "🌤";
}

function pickDailyIndex(dateKey: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const diff = Math.round(
    (Date.parse(`${dateKey}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000,
  );
  if (diff <= 0) return 0;
  return Math.min(diff, 2);
}

type WttrDay = {
  date?: string;
  maxtempF?: string;
  mintempF?: string;
  hourly?: Array<{ weatherCode?: string; tempF?: string; weatherDesc?: Array<{ value?: string }> }>;
};

function parseForecastDay(day: WttrDay, fallbackDate: string): DailyWeather {
  const hourly = day.hourly ?? [];
  const noon = hourly[Math.min(4, hourly.length - 1)] ?? hourly[0];
  const icon = weatherCodeToEmoji(noon?.weatherCode);
  const highFromHourly = hourly.reduce((max, h) => {
    const t = Number(h.tempF);
    return !Number.isNaN(t) && t > max ? t : max;
  }, Number.NEGATIVE_INFINITY);
  const highRaw = day.maxtempF ? Number(day.maxtempF) : highFromHourly;
  const highTemp =
    highRaw !== null && !Number.isNaN(highRaw) && highRaw !== Number.NEGATIVE_INFINITY
      ? `${Math.round(highRaw)}°F`
      : "--";
  const description =
    noon?.weatherDesc?.[0]?.value ??
    hourly[0]?.weatherDesc?.[0]?.value ??
    "Forecast";
  void fallbackDate;
  return { icon, highTemp, description };
}

export async function fetchCityWeatherForecast(city: string): Promise<Map<string, DailyWeather>> {
  const cityKey = city.trim().toLowerCase();
  const hit = forecastCache.get(cityKey);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  const empty = new Map<string, DailyWeather>();
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      cache: "force-cache",
    });
    if (!res.ok) return empty;
    const json = (await res.json()) as { weather?: WttrDay[] };
    const map = new Map<string, DailyWeather>();
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < (json.weather?.length ?? 0); i += 1) {
      const day = json.weather![i]!;
      const dateKey =
        day.date?.slice(0, 10) ??
        new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
      map.set(dateKey, parseForecastDay(day, dateKey));
    }
    forecastCache.set(cityKey, { data: map, fetchedAt: Date.now() });
    return map;
  } catch {
    return empty;
  }
}

export async function fetchCityWeather(city: string, dateKey: string): Promise<CityWeatherSnapshot> {
  const key = cacheKey(city, dateKey);
  const hit = snapshotCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  const forecast = await fetchCityWeatherForecast(city);
  const day = forecast.get(dateKey);
  if (day) {
    const data: CityWeatherSnapshot = {
      icon: day.icon,
      highTemp: day.highTemp,
      description: day.description,
      line: `${city}: ${day.icon} ${day.highTemp}`,
    };
    snapshotCache.set(key, { data, fetchedAt: Date.now() });
    return data;
  }

  const fallback: CityWeatherSnapshot = { icon: "🌤", highTemp: "--", line: `${city}: 🌤 --°` };

  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      cache: "force-cache",
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { weather?: WttrDay[] };
    const dayIdx = pickDailyIndex(dateKey);
    const wDay = json.weather?.[dayIdx] ?? json.weather?.[0];
    if (!wDay) return fallback;
    const parsed = parseForecastDay(wDay, dateKey);
    const data: CityWeatherSnapshot = {
      icon: parsed.icon,
      highTemp: parsed.highTemp,
      description: parsed.description,
      line: `${city}: ${parsed.icon} ${parsed.highTemp}`,
    };
    snapshotCache.set(key, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return fallback;
  }
}

export async function fetchCityWeatherSimple(city: string): Promise<string> {
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`, {
      cache: "force-cache",
    });
    if (!res.ok) return `${city}: 🌤 --°`;
    const text = (await res.text()).trim();
    return text || `${city}: 🌤 --°`;
  } catch {
    return `${city}: 🌤 --°`;
  }
}
