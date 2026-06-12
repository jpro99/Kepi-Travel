import type { TripIntent } from "@/lib/decision/types";

const DESTINATION_MAP: Record<string, { city: string; iata: string; region: string }> = {
  italy: { city: "Rome", iata: "FCO", region: "Italy" },
  rome: { city: "Rome", iata: "FCO", region: "Italy" },
  florence: { city: "Florence", iata: "FLR", region: "Italy" },
  milan: { city: "Milan", iata: "MXP", region: "Italy" },
  paris: { city: "Paris", iata: "CDG", region: "France" },
  tokyo: { city: "Tokyo", iata: "NRT", region: "Japan" },
  london: { city: "London", iata: "LHR", region: "United Kingdom" },
};

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function inferYearForMonth(monthIndex: number, reference: Date): number {
  const year = reference.getFullYear();
  const candidate = new Date(year, monthIndex, 8);
  if (candidate.getTime() < reference.getTime()) {
    return year + 1;
  }
  return year;
}

function formatIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseTripIntent(rawPrompt: string, referenceDate = new Date()): TripIntent {
  const lower = rawPrompt.toLowerCase().trim();

  let destinationKey = "italy";
  for (const key of Object.keys(DESTINATION_MAP)) {
    if (lower.includes(key)) {
      destinationKey = key;
      break;
    }
  }

  const dest = DESTINATION_MAP[destinationKey] ?? DESTINATION_MAP.italy;

  let monthIndex = 8;
  let monthLabel = "September";
  for (const [token, idx] of Object.entries(MONTHS)) {
    if (lower.includes(token)) {
      monthIndex = idx;
      monthLabel = token.charAt(0).toUpperCase() + token.slice(1);
      if (monthLabel.length <= 3) {
        monthLabel = new Date(2026, idx, 1).toLocaleString("en-US", { month: "long" });
      }
      break;
    }
  }

  const year = inferYearForMonth(monthIndex, referenceDate);
  const startDate = formatIso(new Date(year, monthIndex, 8));
  const endDate = formatIso(new Date(year, monthIndex, 18));
  const nights = 10;

  const seasonNote =
    monthIndex >= 5 && monthIndex <= 8
      ? "Peak season — book early for award space."
      : "Shoulder season — strong cash and award value.";

  return {
    rawPrompt,
    destination: dest.city,
    destinationIata: dest.iata,
    region: dest.region,
    monthLabel,
    startDate,
    endDate,
    nights,
    seasonNote,
  };
}

export function buildInferredSummary(intent: TripIntent, searchAirports: string[]): string {
  const airportList = searchAirports.slice(0, 5).join(" · ");
  return `${intent.destination}, ${intent.monthLabel} ${intent.startDate.slice(0, 4)} · ${intent.nights} nights · Searching ${airportList}`;
}
