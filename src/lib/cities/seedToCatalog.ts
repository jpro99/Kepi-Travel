// @ts-nocheck
import type { CityCatalog } from "@/data/cities/types";
import type { Chain, TransitMode } from "@/lib/search/types";

/** JSON seed row (checked into repo or generated). */
export interface CitySeedJson {
  id: string;
  label: string;
  countryCode: string;
  lat: number;
  lng: number;
  zoom?: number;
  /** Half-width of map bounds in degrees (default ~0.09). */
  boundsPad?: number;
  /** Optional explicit bounds [[west,south],[east,north]] */
  maxBounds?: [[number, number], [number, number]];
  transit: {
    id: string;
    name: string;
    mode: TransitMode;
    lat: number;
    lng: number;
  }[];
  touristAnchors: { id: string; label: string; lat: number; lng: number }[];
  hotels?: {
    id: string;
    chain: Chain;
    name: string;
    lat: number;
    lng: number;
    bookUrl: string;
  }[];
}

function chainSearchUrls(cityName: string, countryCode: string) {
  const cityEnc = encodeURIComponent(cityName);
  const cc = countryCode.toUpperCase();
  return {
    marriott: `https://www.marriott.com/search/findHotels.mi?searchType=InCity&destinationAddress.city=${cityEnc}&destinationAddress.country=${cc}`,
    hilton: `https://www.hilton.com/en/search/?query=${cityEnc}`,
    hyatt: `https://www.hyatt.com/search?term=${cityEnc}`,
  };
}

function defaultHotels(
  cityName: string,
  countryCode: string,
  lat: number,
  lng: number,
): CitySeedJson["hotels"] {
  const urls = chainSearchUrls(cityName, countryCode);
  const short = cityName.split(",")[0]?.trim() ?? cityName;
  return [
    {
      id: `${short.toLowerCase().replace(/\s+/g, "-")}-marriott-search`,
      chain: "marriott",
      name: `Marriott (${short} search)`,
      lat: lat + 0.003,
      lng: lng + 0.002,
      bookUrl: urls.marriott,
    },
    {
      id: `${short.toLowerCase().replace(/\s+/g, "-")}-hilton-search`,
      chain: "hilton",
      name: `Hilton (${short} search)`,
      lat: lat - 0.002,
      lng: lng + 0.003,
      bookUrl: urls.hilton,
    },
    {
      id: `${short.toLowerCase().replace(/\s+/g, "-")}-hyatt-search`,
      chain: "hyatt",
      name: `Hyatt (${short} search)`,
      lat: lat + 0.002,
      lng: lng - 0.003,
      bookUrl: urls.hyatt,
    },
  ];
}

export function seedJsonToCatalog(seed: CitySeedJson): CityCatalog {
  const pad = seed.boundsPad ?? 0.09;
  const maxBounds =
    seed.maxBounds ??
    ([
      [seed.lng - pad * 1.4, seed.lat - pad],
      [seed.lng + pad * 1.4, seed.lat + pad],
    ] as [[number, number], [number, number]]);

  const cityOnly = seed.label.split(",")[0]?.trim() ?? seed.id;
  const hotels =
    seed.hotels && seed.hotels.length > 0
      ? seed.hotels
      : defaultHotels(cityOnly, seed.countryCode, seed.lat, seed.lng)!;

  return {
    id: seed.id,
    label: seed.label,
    map: {
      center: { lng: seed.lng, lat: seed.lat },
      zoom: seed.zoom ?? 12,
      maxBounds,
    },
    hotels,
    transit: seed.transit,
    touristAnchors: seed.touristAnchors,
  };
}

export function seedsFileToCatalogs(data: { cities: CitySeedJson[] }) {
  const out: Record<string, CityCatalog> = {};
  for (const s of data.cities) {
    out[s.id] = seedJsonToCatalog(s);
  }
  return out;
}
