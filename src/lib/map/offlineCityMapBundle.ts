/**
 * Offline city map bundles — pilot uses self-contained GeoJSON + bounds (no raster tiles).
 * MapLibre renders these as inline GeoJSON layers when network tiles are unavailable.
 * CSP-safe: style objects are built in code, not fetched as external style JSON with remote sources.
 */

export interface OfflineCityMapPoint {
  id: string;
  label: string;
  lon: number;
  lat: number;
  kind: "hotel" | "airport" | "landmark";
}

export interface OfflineCityMapBundle {
  cityKey: string;
  label: string;
  bounds: [[number, number], [number, number]];
  center: [number, number];
  defaultZoom: number;
  outline: GeoJSON.FeatureCollection;
  points: OfflineCityMapPoint[];
  savedAt: string;
}

const PILOT_BUNDLES: Record<string, Omit<OfflineCityMapBundle, "savedAt">> = {
  "munich-de": {
    cityKey: "munich-de",
    label: "Munich",
    bounds: [
      [11.36, 48.06],
      [11.72, 48.25],
    ],
    center: [11.582, 48.1351],
    defaultZoom: 11.5,
    outline: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Munich region" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [11.36, 48.06],
                [11.72, 48.06],
                [11.72, 48.25],
                [11.36, 48.25],
                [11.36, 48.06],
              ],
            ],
          },
        },
      ],
    },
    points: [
      { id: "muc-airport", label: "MUC Airport", lon: 11.7861, lat: 48.3538, kind: "airport" },
      { id: "marienplatz", label: "Marienplatz", lon: 11.5755, lat: 48.1372, kind: "landmark" },
    ],
  },
  "puglia-it": {
    cityKey: "puglia-it",
    label: "Puglia",
    bounds: [
      [16.8, 40.5],
      [18.6, 41.2],
    ],
    center: [17.24, 40.95],
    defaultZoom: 9,
    outline: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Puglia coast" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [16.8, 40.5],
                [18.6, 40.5],
                [18.6, 41.2],
                [16.8, 41.2],
                [16.8, 40.5],
              ],
            ],
          },
        },
      ],
    },
    points: [
      { id: "bri-airport", label: "BRI Bari", lon: 16.7606, lat: 41.1389, kind: "airport" },
      { id: "monopoli", label: "Monopoli", lon: 17.297, lat: 40.95, kind: "landmark" },
      { id: "polignano", label: "Polignano a Mare", lon: 17.228, lat: 40.995, kind: "landmark" },
    ],
  },
  "rome-it": {
    cityKey: "rome-it",
    label: "Rome",
    bounds: [
      [12.35, 41.8],
      [12.65, 42.05],
    ],
    center: [12.4964, 41.9028],
    defaultZoom: 11,
    outline: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Rome metro" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [12.35, 41.8],
                [12.65, 41.8],
                [12.65, 42.05],
                [12.35, 42.05],
                [12.35, 41.8],
              ],
            ],
          },
        },
      ],
    },
    points: [
      { id: "fco-airport", label: "FCO Fiumicino", lon: 12.2389, lat: 41.8003, kind: "airport" },
    ],
  },
};

export function listOfflineCityMapKeys(): string[] {
  return Object.keys(PILOT_BUNDLES);
}

export async function getOfflineCityMapBundle(cityKey: string): Promise<OfflineCityMapBundle | null> {
  const pilot = PILOT_BUNDLES[cityKey.trim().toLowerCase()];
  if (!pilot) return null;
  return {
    ...pilot,
    savedAt: new Date().toISOString(),
  };
}

export function buildOfflineCityMapStyle(
  bundle: OfflineCityMapBundle,
): Record<string, unknown> {
  const pointsGeoJson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: bundle.points.map((point) => ({
      type: "Feature",
      properties: { label: point.label, kind: point.kind },
      geometry: { type: "Point", coordinates: [point.lon, point.lat] },
    })),
  };

  return {
    version: 8,
    sources: {
      "city-outline": { type: "geojson", data: bundle.outline },
      "city-points": { type: "geojson", data: pointsGeoJson },
    },
    layers: [
      {
        id: "city-fill",
        type: "fill",
        source: "city-outline",
        paint: { "fill-color": "#dbeafe", "fill-opacity": 0.35 },
      },
      {
        id: "city-line",
        type: "line",
        source: "city-outline",
        paint: { "line-color": "#2563eb", "line-width": 2 },
      },
      {
        id: "city-points",
        type: "circle",
        source: "city-points",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match",
            ["get", "kind"],
            "airport",
            "#0b1f3a",
            "hotel",
            "#f4c95d",
            "#2563eb",
          ],
        },
      },
    ],
  };
}
