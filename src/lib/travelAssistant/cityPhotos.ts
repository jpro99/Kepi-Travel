/** Curated Unsplash photo IDs — stable URLs, no live random source API. */
const CITY_PHOTO_IDS: Record<string, string> = {
  rome: "photo-1552832230-c0197dd311b5",
  bari: "photo-1578662996442-48f60103fc96",
  munich: "photo-1595867818082-083863f3d630",
  venice: "photo-1514890547357-a9ee17272827",
  vce: "photo-1514890547357-a9ee17272827",
  florence: "photo-1523906834658-6e24ef2386f9",
  milan: "photo-1513581166391-887a96ddeafd",
  naples: "photo-1534445867742-887a96ddeafd",
  amalfi: "photo-1534113418500-7fe993f40d67",
  positano: "photo-1534113418500-7fe993f40d67",
  dolomites: "photo-1506905925346-21bda4d32df4",
  paris: "photo-1502602898657-3e91760cbb34",
  london: "photo-1513635269975-59663e0ac1ad",
  tokyo: "photo-1540959733332-eab4deabeeaf",
  hnd: "photo-1540959733332-eab4deabeeaf",
  honolulu: "photo-1549696450-5ec4a83d8d46",
  hnl: "photo-1549696450-5ec4a83d8d46",
  seattle: "photo-1502177859279-1584590210155",
  sea: "photo-1502177859279-1584590210155",
  barcelona: "photo-1583422409516-2895a77efded",
  madrid: "photo-1539037116277-4db20889f2d3",
  lisbon: "photo-1555881400-74d7aca8bb84",
  athens: "photo-1555993537-0d7115e023c0",
  istanbul: "photo-1524231757912-21a4dc3a369f",
  dubai: "photo-1512453979798-5ea266f8880c",
  sydney: "photo-1506973035872-a4ec16b8e8d9",
  monopoli: "photo-1565008576549-57569a49371d",
  polignano: "photo-1565008576549-57569a49371d",
};

const DEFAULT_PHOTO_ID = "photo-1488646953014-85cb44e25828";

function normalizeCityKey(city: string): string {
  return city
    .split("(")[0]!
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gu, "")
    .replace(/\s+/gu, " ");
}

export function cityPhotoUrl(city: string | null | undefined, width = 800): string {
  if (!city?.trim()) {
    return `https://images.unsplash.com/${DEFAULT_PHOTO_ID}?w=${width}&q=80&auto=format&fit=crop`;
  }
  const key = normalizeCityKey(city);
  const words = key.split(/\s+/u);
  for (const word of [key, ...words]) {
    const id = CITY_PHOTO_IDS[word];
    if (id) return `https://images.unsplash.com/${id}?w=${width}&q=80&auto=format&fit=crop`;
  }
  for (const [name, id] of Object.entries(CITY_PHOTO_IDS)) {
    if (key.includes(name) || name.includes(key.split(" ")[0] ?? "")) {
      return `https://images.unsplash.com/${id}?w=${width}&q=80&auto=format&fit=crop`;
    }
  }
  return `https://images.unsplash.com/${DEFAULT_PHOTO_ID}?w=${width}&q=80&auto=format&fit=crop`;
}

/**
 * Destination header photos — curated Unsplash IDs only.
 * Never use source.unsplash.com or picsum random seeds (inappropriate / nonsense images).
 */
export function cityPhotoSourceUrl(city: string): string {
  return cityPhotoUrl(city, 800);
}

/** Same curated set — no random fallback. */
export function cityPhotoPicsumUrl(city: string): string {
  return cityPhotoUrl(city, 800);
}
