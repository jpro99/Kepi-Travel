import { resolveHotelDestinationSync } from "@/lib/hotels/resolveDestination";
import { getAirportByIata } from "@/lib/travelAssistant/airportGeo";

export type TransportModeSuggestion = "car" | "train" | "bus" | "taxi";

export interface TransportModeEstimate {
  mode: TransportModeSuggestion;
  label: string;
  emoji: string;
  minutesMin: number;
  minutesMax: number;
  costMinUsd: number;
  costMaxUsd: number;
  summary: string;
  recommended: boolean;
}

export interface InterCityRouteSuggestion {
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  distanceMi: number;
  modes: TransportModeEstimate[];
  hint: string;
  hideFlights: boolean;
  mapsUrl: string;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolvePoint(label: string, iata?: string): { lat: number; lon: number; label: string } | null {
  const code = iata?.trim().toUpperCase();
  if (code && code.length === 3) {
    const airport = getAirportByIata(code);
    if (airport) return { lat: airport.lat, lon: airport.lon, label: airport.name || label };
  }
  const dest = resolveHotelDestinationSync(label);
  if (dest) return { lat: dest.lat, lon: dest.lng, label: dest.displayName || label };
  return null;
}

function buildMapsUrl(from: { lat: number; lon: number }, to: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=driving`;
}

/** Guesstimated inter-city options — labeled as estimates, not live fares. */
export function suggestInterCityRoute(
  fromLabel: string,
  toLabel: string,
  fromIata = "",
  toIata = "",
): InterCityRouteSuggestion | null {
  const from = resolvePoint(fromLabel, fromIata);
  const to = resolvePoint(toLabel, toIata);
  if (!from || !to) return null;

  const distanceKm = Math.round(haversineKm(from.lat, from.lon, to.lat, to.lon));
  const distanceMi = Math.round(distanceKm * 0.621);
  const shortHop = distanceKm < 120;
  const localHop = distanceKm < 40;

  const carMin = Math.max(10, Math.round(distanceKm * 1.1));
  const carMax = Math.max(carMin + 10, Math.round(distanceKm * 1.8));
  const trainMin = Math.max(15, Math.round(distanceKm * 1.4));
  const trainMax = Math.max(trainMin + 15, Math.round(distanceKm * 2.2));
  const busMin = Math.max(20, Math.round(distanceKm * 1.6));
  const busMax = Math.max(busMin + 20, Math.round(distanceKm * 2.8));
  const taxiMin = carMin;
  const taxiMax = Math.max(carMax, Math.round(distanceKm * 2.5));

  const carCostMin = localHop ? 8 : shortHop ? 25 : 45;
  const carCostMax = localHop ? 35 : shortHop ? 80 : 140;
  const trainCostMin = localHop ? 3 : 12;
  const trainCostMax = localHop ? 12 : shortHop ? 45 : 95;
  const busCostMin = localHop ? 2 : 8;
  const busCostMax = localHop ? 8 : shortHop ? 25 : 55;
  const taxiCostMin = localHop ? 15 : 35;
  const taxiCostMax = localHop ? 45 : shortHop ? 90 : 180;

  const recommendCar = distanceKm >= 25 && distanceKm <= 180;
  const recommendTrain = distanceKm < 25 || (distanceKm >= 40 && distanceKm <= 350);

  const modes: TransportModeEstimate[] = [
    {
      mode: "car",
      label: "Car / rental",
      emoji: "🚗",
      minutesMin: carMin,
      minutesMax: carMax,
      costMinUsd: carCostMin,
      costMaxUsd: carCostMax,
      summary: `~${carMin}–${carMax} min · ~$${carCostMin}–$${carCostMax}`,
      recommended: recommendCar,
    },
    {
      mode: "train",
      label: "Train",
      emoji: "🚆",
      minutesMin: trainMin,
      minutesMax: trainMax,
      costMinUsd: trainCostMin,
      costMaxUsd: trainCostMax,
      summary: `~${trainMin}–${trainMax} min · ~$${trainCostMin}–$${trainCostMax}`,
      recommended: recommendTrain && !recommendCar,
    },
    {
      mode: "bus",
      label: "Bus",
      emoji: "🚌",
      minutesMin: busMin,
      minutesMax: busMax,
      costMinUsd: busCostMin,
      costMaxUsd: busCostMax,
      summary: `~${busMin}–${busMax} min · ~$${busCostMin}–$${busCostMax}`,
      recommended: false,
    },
    {
      mode: "taxi",
      label: "Taxi / Uber",
      emoji: "🚕",
      minutesMin: taxiMin,
      minutesMax: taxiMax,
      costMinUsd: taxiCostMin,
      costMaxUsd: taxiCostMax,
      summary: `~${taxiMin}–${taxiMax} min · ~$${taxiCostMin}–$${taxiCostMax}`,
      recommended: localHop,
    },
  ];

  const hint = localHop
    ? "Short hop — most travelers drive, take a regional train, or taxi."
    : shortHop
      ? "Regional trip — train or car are both common; compare time vs flexibility."
      : "Longer leg — train or flight may compete; estimates only.";

  return {
    fromLabel: from.label,
    toLabel: to.label,
    distanceKm,
    distanceMi,
    modes,
    hint,
    hideFlights: distanceKm < 100,
    mapsUrl: buildMapsUrl(from, to),
  };
}
