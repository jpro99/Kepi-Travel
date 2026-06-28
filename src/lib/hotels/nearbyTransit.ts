export type TransitKind = "metro" | "train" | "tram" | "bus";

export interface TransitStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: TransitKind;
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function dedupeStops(stops: TransitStop[], minMeters = 80): TransitStop[] {
  const kept: TransitStop[] = [];
  for (const stop of stops) {
    const tooClose = kept.some((other) => {
      if (other.kind !== stop.kind) return false;
      const dLat = (other.lat - stop.lat) * 111_000;
      const dLng = (other.lng - stop.lng) * 111_000 * Math.cos((stop.lat * Math.PI) / 180);
      return Math.hypot(dLat, dLng) < minMeters;
    });
    if (!tooClose) kept.push(stop);
  }
  return kept;
}

function parseOverpassElements(
  elements: Array<{ id: number; lat?: number; lon?: number; tags?: Record<string, string> }>,
  kind: TransitKind,
): TransitStop[] {
  const stops: TransitStop[] = [];
  for (const element of elements) {
    if (element.lat == null || element.lon == null) continue;
    const name =
      element.tags?.name ??
      element.tags?.["name:en"] ??
      (kind === "metro"
        ? "Metro station"
        : kind === "train"
          ? "Train station"
          : kind === "tram"
            ? "Tram stop"
            : "Bus stop");
    stops.push({
      id: `${kind}-${element.id}`,
      name,
      lat: element.lat,
      lng: element.lon,
      kind,
    });
  }
  return dedupeStops(stops);
}

async function runOverpass(
  query: string,
): Promise<Array<{ id: number; lat?: number; lon?: number; tags?: Record<string, string> }>> {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    elements?: Array<{ id: number; lat?: number; lon?: number; tags?: Record<string, string> }>;
  };
  return payload.elements ?? [];
}

/** Fetch metro/subway/light-rail stops near a hotel search center. */
export async function fetchMetroStopsNear(lat: number, lng: number, radiusM = 8000): Promise<TransitStop[]> {
  const query = `
[out:json][timeout:14];
(
  node(around:${radiusM},${lat},${lng})["railway"="subway_entrance"];
  node(around:${radiusM},${lat},${lng})["station"="subway"];
  node(around:${radiusM},${lat},${lng})["railway"="station"]["station"="subway"];
  node(around:${radiusM},${lat},${lng})["railway"="station"]["subway"="yes"];
  node(around:${radiusM},${lat},${lng})["public_transport"="stop_position"]["subway"="yes"];
  node(around:${radiusM},${lat},${lng})["railway"="station"]["light_rail"="yes"];
  node(around:${radiusM},${lat},${lng})["railway"="tram_stop"];
  node(around:${radiusM},${lat},${lng})["public_transport"="platform"]["tram"="yes"];
);
out body 40;
`;
  const elements = await runOverpass(query);
  const metro = parseOverpassElements(
    elements.filter((element) => element.tags?.railway !== "tram_stop" && element.tags?.tram !== "yes"),
    "metro",
  );
  const tram = parseOverpassElements(
    elements.filter((element) => element.tags?.railway === "tram_stop" || element.tags?.tram === "yes"),
    "tram",
  );
  return dedupeStops([...metro, ...tram], 120).slice(0, 24);
}

/** Regional and commuter rail stations — important in towns without subway. */
export async function fetchTrainStopsNear(lat: number, lng: number, radiusM = 12000): Promise<TransitStop[]> {
  const query = `
[out:json][timeout:14];
(
  node(around:${radiusM},${lat},${lng})["railway"="station"];
  node(around:${radiusM},${lat},${lng})["railway"="halt"];
  node(around:${radiusM},${lat},${lng})["public_transport"="station"]["train"="yes"];
  node(around:${radiusM},${lat},${lng})["public_transport"="stop_position"]["train"="yes"];
);
out body 45;
`;
  const elements = await runOverpass(query);
  const trains = parseOverpassElements(elements, "train");
  return dedupeStops(
    trains.filter((stop) => !/subway|metro|tram|light_rail/i.test(stop.name)),
    150,
  ).slice(0, 20);
}

/** Fetch bus stops near center — optional layer on the hotel map. */
export async function fetchBusStopsNear(lat: number, lng: number, radiusM = 6500): Promise<TransitStop[]> {
  const query = `
[out:json][timeout:12];
(
  node(around:${radiusM},${lat},${lng})["highway"="bus_stop"];
  node(around:${radiusM},${lat},${lng})["public_transport"="platform"]["bus"="yes"];
  node(around:${radiusM},${lat},${lng})["amenity"="bus_station"];
);
out body 45;
`;
  const elements = await runOverpass(query);
  return dedupeStops(parseOverpassElements(elements, "bus"), 60).slice(0, 40);
}

export async function fetchNearbyTransit(
  lat: number,
  lng: number,
  kinds: Array<TransitKind>,
): Promise<TransitStop[]> {
  const results: TransitStop[] = [];
  if (kinds.includes("metro") || kinds.includes("tram")) {
    results.push(...(await fetchMetroStopsNear(lat, lng)));
  }
  if (kinds.includes("train")) {
    results.push(...(await fetchTrainStopsNear(lat, lng)));
  }
  if (kinds.includes("bus")) {
    results.push(...(await fetchBusStopsNear(lat, lng)));
  }
  return dedupeStops(results, 100);
}
