export interface CityWeatherSnapshot {
  icon: string;
  highTemp: string;
  line: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { data: CityWeatherSnapshot; fetchedAt: number }>();

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

export async function fetchCityWeather(city: string, dateKey: string): Promise<CityWeatherSnapshot> {
  const key = cacheKey(city, dateKey);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  const fallback: CityWeatherSnapshot = { icon: "🌤", highTemp: "--", line: `${city}: 🌤 --°` };

  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      cache: "force-cache",
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as {
      weather?: Array<{ hourly?: Array<{ weatherCode?: string; tempF?: string }> }>;
    };
    const dayIdx = pickDailyIndex(dateKey);
    const hourly = json.weather?.[dayIdx]?.hourly ?? json.weather?.[0]?.hourly ?? [];
    const noon = hourly[Math.min(4, hourly.length - 1)] ?? hourly[0];
    const icon = weatherCodeToEmoji(noon?.weatherCode);
    const tempF = noon?.tempF ? Math.round(Number(noon.tempF)) : null;
    const highTemp = tempF !== null && !Number.isNaN(tempF) ? `${tempF}°F` : "--";
    const data: CityWeatherSnapshot = {
      icon,
      highTemp,
      line: `${city}: ${icon} ${highTemp}`,
    };
    cache.set(key, { data, fetchedAt: Date.now() });
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
