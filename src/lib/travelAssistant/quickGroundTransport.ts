import { citiesLikelySame } from "@/lib/hotels/hotelReservationCity";
import { getAirportByIata } from "@/lib/travelAssistant/airportGeo";
import type { InterCityTransportGap } from "@/lib/travelAssistant/interCityTransport";
import type { FlightLegPlan } from "@/lib/decision/types";

export type QuickGroundMode = "uber" | "taxi" | "metro" | "train";

export interface TripGroundTransportInput {
  id: string;
  type: string;
  location?: string;
  title?: string;
  provider?: string;
  confirmationCode?: string | null;
  plannedOnly?: boolean;
  localTime?: string;
}

export interface QuickGroundTransportDraft {
  type: "ride" | "train";
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode: string;
  notes: string;
  trainNumber?: string;
}

const MODE_PROVIDER: Record<QuickGroundMode, string> = {
  uber: "Uber",
  taxi: "Taxi",
  metro: "Metro / transit",
  train: "Train",
};

function normalizeIata(code: string | undefined): string {
  return code?.trim().toUpperCase() ?? "";
}

function parseRouteEndpoints(value: string): { from: string; to: string } {
  const parts = value
    .split(/→|->| to /iu)
    .map((part) => part.trim())
    .filter(Boolean);
  return { from: parts[0] ?? "", to: parts[1] ?? "" };
}

function labelForLegEndpoint(iata: string, fallback: string): string {
  const code = normalizeIata(iata);
  if (code.length === 3) {
    const airport = getAirportByIata(code);
    if (airport?.name?.trim()) return airport.name.trim();
  }
  return fallback.trim() || iata;
}

function endpointsMatchLeg(
  leg: Pick<FlightLegPlan, "fromIata" | "toIata" | "fromLabel" | "toLabel">,
  fromLabel: string,
  toLabel: string,
): boolean {
  const legFrom = normalizeIata(leg.fromIata);
  const legTo = normalizeIata(leg.toIata);
  const iataRoute = parseAirportsFromLocationString(`${fromLabel} → ${toLabel}`);
  if (iataRoute.dep && iataRoute.arr && legFrom && legTo) {
    if (iataRoute.dep === legFrom && iataRoute.arr === legTo) return true;
  }

  const { from, to } = parseRouteEndpoints(`${fromLabel} → ${toLabel}`);
  if (!from || !to) return false;
  return citiesLikelySame(leg.fromLabel, from) && citiesLikelySame(leg.toLabel, to);
}

function parseAirportsFromLocationString(location: string): { dep?: string; arr?: string } {
  const match = location.match(/\b([A-Z]{3})\s*→\s*([A-Z]{3})\b/);
  if (!match) return {};
  return { dep: match[1], arr: match[2] };
}

/** True when a saved ride/train covers this planned hop (city or airport endpoints). */
export function legCoveredByGroundTransport(
  leg: FlightLegPlan,
  transports: TripGroundTransportInput[],
): { covered: boolean; summary?: string; reservationId?: string } {
  for (const transport of transports) {
    if (transport.type !== "ride" && transport.type !== "train") continue;
    if (transport.plannedOnly) continue;
    const code = transport.confirmationCode?.trim().toUpperCase() ?? "";
    if (code === "PLANNED") continue;

    const routeText = transport.location?.trim() || transport.title?.trim() || "";
    if (!routeText) continue;
    const { from, to } = parseRouteEndpoints(routeText);
    if (!endpointsMatchLeg(leg, from, to)) continue;

    const provider = transport.provider?.trim() || (transport.type === "train" ? "Train" : "Ride");
    return {
      covered: true,
      summary: provider,
      reservationId: transport.id,
    };
  }
  return { covered: false };
}

/** One-tap ground transport — no form, no confirmation number required. */
export function buildQuickGroundTransportReservation(
  gap: InterCityTransportGap,
  mode: QuickGroundMode,
): QuickGroundTransportDraft {
  const fromLabel = labelForLegEndpoint(gap.fromIata, gap.fromLabel);
  const toLabel = labelForLegEndpoint(gap.toIata, gap.toLabel);
  const provider = MODE_PROVIDER[mode];
  const type: "ride" | "train" = mode === "train" || mode === "metro" ? "train" : "ride";
  const date = gap.departureDate?.slice(0, 10) ?? "";
  const localTime = date ? `${date} 09:00` : "";
  const location =
    gap.fromIata && gap.toIata && gap.fromIata.length === 3 && gap.toIata.length === 3
      ? `${gap.fromIata} → ${gap.toIata}`
      : `${fromLabel} → ${toLabel}`;

  const title =
    mode === "metro"
      ? `Metro · ${fromLabel} → ${toLabel}`
      : `${provider} · ${fromLabel} → ${toLabel}`;

  return {
    type,
    title,
    provider,
    localTime,
    location,
    confirmationCode: "LOCAL",
    notes: `Quick plan: ${provider} for this leg — book on the day.`,
    trainNumber: type === "train" && mode === "train" ? "Local" : undefined,
  };
}

export function quickGroundModeEmoji(mode: QuickGroundMode): string {
  if (mode === "uber") return "🚗";
  if (mode === "taxi") return "🚕";
  if (mode === "metro") return "🚇";
  return "🚆";
}
