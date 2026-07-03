export interface HotelStayDistrict {
  id: string;
  name: string;
  headline: string;
  whyStay: string;
  popularPick: string;
  center: { lat: number; lng: number };
  radiusKm: number;
  color: string;
}

function circleRing(lat: number, lng: number, radiusKm: number, steps = 48): GeoJSON.Position[] {
  const ring: GeoJSON.Position[] = [];
  const latRad = (lat * Math.PI) / 180;
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos(latRad);
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    ring.push([
      lng + (Math.cos(angle) * radiusKm) / kmPerDegLng,
      lat + (Math.sin(angle) * radiusKm) / kmPerDegLat,
    ]);
  }
  return ring;
}

const DISTRICTS: Record<string, HotelStayDistrict[]> = {
  lecce: [
    {
      id: "lecce-historic",
      name: "Historic center (Baroque)",
      headline: "Walk-everywhere old town",
      whyStay: "Best for first-time visitors — cafés, churches, and evening passeggiata on foot.",
      popularPick: "Most travelers pick here for atmosphere and restaurants.",
      center: { lat: 40.3529, lng: 18.172 },
      radiusKm: 0.75,
      color: "#7c3aed",
    },
    {
      id: "lecce-stazione",
      name: "Near Stazione Centrale",
      headline: "Train connections & day trips",
      whyStay: "Easier rail to coast and Salento towns; slightly quieter than the core.",
      popularPick: "Good if you plan day trips by train and want lower hotel prices.",
      center: { lat: 40.345, lng: 18.166 },
      radiusKm: 0.55,
      color: "#2563eb",
    },
  ],
  rome: [
    {
      id: "rome-historic",
      name: "Historic center",
      headline: "Ancient Rome on foot",
      whyStay: "Colosseum, Forum, Trevi — walkable but busy and premium priced.",
      popularPick: "First-time Rome visitors often stay here 2–3 nights.",
      center: { lat: 41.8933, lng: 12.4828 },
      radiusKm: 1.1,
      color: "#b45309",
    },
    {
      id: "rome-trastevere",
      name: "Trastevere",
      headline: "Evening dining & local feel",
      whyStay: "Cobbled lanes, trattorias, still central via taxi or tram.",
      popularPick: "Popular for couples and food-focused stays.",
      center: { lat: 41.8897, lng: 12.4697 },
      radiusKm: 0.8,
      color: "#059669",
    },
  ],
  venice: [
    {
      id: "venice-san-marco",
      name: "San Marco",
      headline: "Iconic canals & landmarks",
      whyStay: "Short walks to St. Mark's; highest prices, heavy crowds.",
      popularPick: "Splurge zone — book early for peak season.",
      center: { lat: 45.434, lng: 12.338 },
      radiusKm: 0.7,
      color: "#0369a1",
    },
    {
      id: "venice-cannaregio",
      name: "Cannaregio",
      headline: "Local Venice, still central",
      whyStay: "Quieter canals, better value, easy vaporetto to sights.",
      popularPick: "Smart pick when you want Venice feel without San Marco prices.",
      center: { lat: 45.445, lng: 12.325 },
      radiusKm: 0.85,
      color: "#7c3aed",
    },
  ],
  munich: [
    {
      id: "munich-altstadt",
      name: "Altstadt (Old Town)",
      headline: "Marienplatz & museums",
      whyStay: "Central for sightseeing; walk to beer halls and shopping.",
      popularPick: "Default for short city breaks and Oktoberfest overflow.",
      center: { lat: 48.137, lng: 11.575 },
      radiusKm: 1.0,
      color: "#1d4ed8",
    },
    {
      id: "munich-schwabing",
      name: "Schwabing",
      headline: "Upscale dining & parks",
      whyStay: "Near English Garden; calmer than the core, good U-Bahn links.",
      popularPick: "Families and longer stays often choose here.",
      center: { lat: 48.158, lng: 11.586 },
      radiusKm: 0.9,
      color: "#059669",
    },
  ],
  florence: [
    {
      id: "florence-duomo",
      name: "Duomo & historic core",
      headline: "Renaissance heart",
      whyStay: "Uffizi, Duomo, Ponte Vecchio within 15 minutes on foot.",
      popularPick: "Most first visits stay in this radius.",
      center: { lat: 43.773, lng: 11.256 },
      radiusKm: 0.75,
      color: "#b45309",
    },
  ],
  monopoli: [
    {
      id: "monopoli-old-town",
      name: "Old town & port",
      headline: "Seafront Puglia base",
      whyStay: "Walled centro storico, beaches, trains to Bari and Lecce.",
      popularPick: "Top pick for Puglia coast without big-resort feel.",
      center: { lat: 40.953, lng: 17.297 },
      radiusKm: 0.65,
      color: "#0284c7",
    },
  ],
  bari: [
    {
      id: "bari-vecchia",
      name: "Bari Vecchia",
      headline: "Old town & port",
      whyStay: "Authentic lanes, seafood, ferries to Greece and coast.",
      popularPick: "Stay here for character; business hotels cluster near the station.",
      center: { lat: 41.129, lng: 16.871 },
      radiusKm: 0.8,
      color: "#7c3aed",
    },
  ],
};

function normalizeCityKey(city: string): string {
  const stem = city.toLowerCase().split(",")[0]?.trim() ?? city.toLowerCase();
  if (stem.includes("lecce")) return "lecce";
  if (stem.includes("rome") || stem.includes("roma")) return "rome";
  if (stem.includes("venice") || stem.includes("venezia")) return "venice";
  if (stem.includes("munich") || stem.includes("münchen")) return "munich";
  if (stem.includes("florence") || stem.includes("firenze")) return "florence";
  if (stem.includes("monopoli")) return "monopoli";
  if (stem.includes("bari")) return "bari";
  return stem.replace(/[^a-z0-9]/g, "");
}

export function resolveHotelStayDistricts(city: string): HotelStayDistrict[] {
  const key = normalizeCityKey(city);
  return DISTRICTS[key] ?? [];
}

export function buildHotelStayDistrictGeoJson(districts: HotelStayDistrict[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: districts.map((district) => ({
      type: "Feature",
      id: district.id,
      properties: {
        id: district.id,
        name: district.name,
        headline: district.headline,
        whyStay: district.whyStay,
        popularPick: district.popularPick,
        color: district.color,
      },
      geometry: {
        type: "Polygon",
        coordinates: [circleRing(district.center.lat, district.center.lng, district.radiusKm)],
      },
    })),
  };
}
