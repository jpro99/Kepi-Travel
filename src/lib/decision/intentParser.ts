import type { TripIntent, TripStop } from "@/lib/decision/types";

const DESTINATION_MAP: Record<string, { city: string; iata: string; region: string }> = {
  italy: { city: "Italy", iata: "FCO", region: "Italy" },
  rome: { city: "Rome", iata: "FCO", region: "Italy" },
  venice: { city: "Venice", iata: "VCE", region: "Italy" },
  dolomites: { city: "Dolomites", iata: "VCE", region: "Italy" },
  puglia: { city: "Puglia", iata: "BRI", region: "Italy" },
  florence: { city: "Florence", iata: "FLR", region: "Italy" },
  milan: { city: "Milan", iata: "MXP", region: "Italy" },
  paris: { city: "Paris", iata: "CDG", region: "France" },
  tokyo: { city: "Tokyo", iata: "NRT", region: "Japan" },
  london: { city: "London", iata: "LHR", region: "United Kingdom" },
  honolulu: { city: "Honolulu", iata: "HNL", region: "Hawaii" },
  hawaii: { city: "Honolulu", iata: "HNL", region: "Hawaii" },
  hnl: { city: "Honolulu", iata: "HNL", region: "Hawaii" },
  seattle: { city: "Seattle", iata: "SEA", region: "Washington" },
  "los angeles": { city: "Los Angeles", iata: "LAX", region: "California" },
};

const STOP_ALIASES: Record<string, keyof typeof DESTINATION_MAP> = {
  venice: "venice",
  venezia: "venice",
  dolomite: "dolomites",
  dolomites: "dolomites",
  puglia: "puglia",
  apulia: "puglia",
  rome: "rome",
  roma: "rome",
  florence: "florence",
  milan: "milan",
};

const ORIGIN_MAP: Record<string, { city: string; region: string; airports: string[] }> = {
  beaumont: { city: "Beaumont, CA", region: "California", airports: ["ONT", "LAX", "SNA"] },
  "los angeles": { city: "Los Angeles", region: "California", airports: ["LAX", "ONT", "SNA"] },
  orange: { city: "Orange County", region: "California", airports: ["SNA", "ONT", "LAX"] },
  seattle: { city: "Seattle", region: "Washington", airports: ["SEA", "BFI"] },
  "san francisco": { city: "San Francisco", region: "California", airports: ["SFO", "OAK", "SJC"] },
  california: { city: "Southern California", region: "California", airports: ["LAX", "ONT", "SNA"] },
  "west coast": { city: "West Coast", region: "California", airports: ["LAX", "ONT", "SNA", "SEA", "SFO"] },
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

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
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

function parseDayToken(token: string): number | null {
  const lower = token.toLowerCase().trim();
  if (WORD_NUMBERS[lower] !== undefined) return WORD_NUMBERS[lower];
  const match = lower.match(/^(\d{1,2})/);
  if (!match) return null;
  const day = Number.parseInt(match[1]!, 10);
  return day >= 1 && day <= 31 ? day : null;
}

function parseMonthFromText(lower: string): { monthIndex: number; monthLabel: string } | null {
  for (const [token, idx] of Object.entries(MONTHS)) {
    if (lower.includes(token)) {
      const monthLabel =
        token.length <= 3
          ? new Date(2026, idx, 1).toLocaleString("en-US", { month: "long" })
          : token.charAt(0).toUpperCase() + token.slice(1);
      return { monthIndex: idx, monthLabel };
    }
  }
  return null;
}

function parseFlightDates(
  lower: string,
  monthIndex: number,
  year: number,
): { startDate: string; endDate: string; nights: number } | null {
  const departPatterns = [
    /fly(?:\s+out|\s+from)?\s+(?:on|around)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i,
    /leave(?:\s+on|\s+around)?\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i,
    /depart(?:\s+on|\s+around)?\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i,
    /(?:out|leave)\s+(?:on|around)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i,
  ];
  const returnPatterns = [
    /fly(?:\s+back|\s+home)?\s+(?:on|around)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i,
    /return(?:\s+on|\s+around)?\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i,
    /back\s+(?:on|around)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i,
  ];

  let departDay: number | null = null;
  let returnDay: number | null = null;

  for (const pattern of departPatterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      departDay = parseDayToken(match[1]);
      if (departDay) break;
    }
  }
  for (const pattern of returnPatterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      returnDay = parseDayToken(match[1]);
      if (returnDay) break;
    }
  }

  if (departDay === null && returnDay === null) return null;

  const startDay = departDay ?? 1;
  let endDay = returnDay ?? startDay + 20;
  if (endDay <= startDay) {
    endDay = startDay + 20;
  }

  const startDate = formatIso(new Date(year, monthIndex, startDay));
  const endDate = formatIso(new Date(year, monthIndex, endDay));
  const nights = Math.max(1, Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000));

  return { startDate, endDate, nights };
}

function parseTripDurationNights(lower: string): number | null {
  const weekMatch = lower.match(/(\d+|one|two|three|four|five)\s*-?\s*week/i);
  if (weekMatch?.[1]) {
    const weeks = parseDayToken(weekMatch[1]) ?? 3;
    return weeks * 7;
  }
  const nightMatch = lower.match(/(\d+)\s*-?\s*night/i);
  if (nightMatch?.[1]) return Number.parseInt(nightMatch[1]!, 10);
  return null;
}

function parseOrigin(lower: string): { city: string; region: string; airports: string[] } | null {
  const fromMatch = lower.match(/from\s+([a-z\s,]+?)(?:\s+to|\s+and|\s*,|\s+\.|$)/i);
  const candidates = [fromMatch?.[1]?.trim(), lower].filter(Boolean) as string[];

  for (const candidate of candidates) {
    for (const [key, value] of Object.entries(ORIGIN_MAP)) {
      if (candidate.includes(key)) return value;
    }
  }
  return null;
}

function parseStopNights(lower: string, stopKey: string): { nights?: number; nightsLabel?: string } {
  const num = `(\\d+|${Object.keys(WORD_NUMBERS).join("|")})`;
  const patterns = [
    new RegExp(`${num}\\s*(?:or|to|-)\\s*${num}?\\s*days?\\s*(?:in|at|around|near)?\\s*${stopKey}`, "i"),
    new RegExp(`${num}\\s*days?\\s*(?:in|at|around|near)?\\s*${stopKey}`, "i"),
    new RegExp(`${stopKey}[^.]{0,40}?${num}\\s*(?:or|to|-)\\s*${num}?\\s*days?`, "i"),
    new RegExp(`(?:spend|staying)\\s*${num}\\s*(?:or|to|-)\\s*${num}?\\s*days?[^.]{0,30}?${stopKey}`, "i"),
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (!match) continue;
    const low = parseDayToken(match[1] ?? "");
    const high = match[2] ? parseDayToken(match[2]) : null;
    if (low === null) continue;
    if (high !== null && high !== low) {
      return { nights: Math.round((low + high) / 2), nightsLabel: `${low}–${high} days` };
    }
    return { nights: low, nightsLabel: `${low} days` };
  }
  return {};
}

function parseStops(lower: string): TripStop[] {
  const found: Array<{ key: string; index: number }> = [];
  for (const [alias, mapKey] of Object.entries(STOP_ALIASES)) {
    const index = lower.indexOf(alias);
    if (index >= 0) found.push({ key: mapKey, index });
  }
  found.sort((a, b) => a.index - b.index);

  const uniqueKeys: string[] = [];
  for (const item of found) {
    if (!uniqueKeys.includes(item.key)) uniqueKeys.push(item.key);
  }

  return uniqueKeys.map((key) => {
    const dest = DESTINATION_MAP[key]!;
    const alias = Object.entries(STOP_ALIASES).find(([, v]) => v === key)?.[0] ?? key;
    const duration = parseStopNights(lower, alias);
    return {
      name: dest.city,
      region: dest.region,
      iata: dest.iata,
      ...duration,
    };
  });
}

function parseLoyalty(lower: string): { programs: string[]; airlines: string[] } {
  const programs: string[] = [];
  const airlines: string[] = [];

  if (/globalist/.test(lower) && /hyatt/.test(lower)) {
    programs.push("Hyatt Globalist");
  } else if (/hyatt/.test(lower)) {
    programs.push("Hyatt");
  }

  if (/alaska\s*(?:mvp\s*)?gold|mvp\s*gold|as\s*gold/.test(lower)) {
    programs.push("Alaska MVP Gold");
    airlines.push("Alaska");
  } else if (/alaska/.test(lower)) {
    airlines.push("Alaska");
  }

  if (/united\s*(?:gold|platinum|1k)/.test(lower)) programs.push("United elite");
  if (/marriott/.test(lower)) programs.push("Marriott");
  if (/hilton/.test(lower)) programs.push("Hilton");

  return { programs, airlines };
}

function parseBudgetHint(lower: string): string | undefined {
  const rangeMatch = lower.match(/\$\s*([\d,]+)\s*(?:to|-)\s*\$\s*([\d,]+)/);
  if (rangeMatch) {
    return `$${rangeMatch[1]}–$${rangeMatch[2]}`;
  }
  const singleMatch = lower.match(/(?:budget|spend|spending)\s*(?:of|around|about)?\s*\$?\s*([\d,]+)\s*(k)?/i);
  if (singleMatch) {
    const raw = singleMatch[1]!.replace(/,/g, "");
    const amount = singleMatch[2] ? Number.parseInt(raw, 10) * 1000 : Number.parseInt(raw, 10);
    if (Number.isFinite(amount)) return `$${amount.toLocaleString()}`;
  }
  return undefined;
}

export function parseTripIntent(rawPrompt: string, referenceDate = new Date()): TripIntent {
  const lower = rawPrompt.toLowerCase().trim();
  const stops = parseStops(lower);
  const origin = parseOrigin(lower);
  const loyalty = parseLoyalty(lower);
  const budgetHint = parseBudgetHint(lower);

  let destinationKey = "italy";
  if (stops.length > 0) {
    const last = stops[stops.length - 1]!;
    destinationKey =
      Object.entries(DESTINATION_MAP).find(([, d]) => d.city === last.name)?.[0] ?? "italy";
  } else {
    for (const key of Object.keys(DESTINATION_MAP)) {
      if (lower.includes(key)) {
        destinationKey = key;
        break;
      }
    }
  }

  const dest = DESTINATION_MAP[destinationKey] ?? DESTINATION_MAP.italy!;

  const parsedMonth = parseMonthFromText(lower);
  let monthIndex = parsedMonth?.monthIndex ?? 8;
  let monthLabel = parsedMonth?.monthLabel ?? "September";

  const year = inferYearForMonth(monthIndex, referenceDate);

  const explicitDates = parseFlightDates(lower, monthIndex, year);
  const durationNights = parseTripDurationNights(lower);

  let startDate: string;
  let endDate: string;
  let nights: number;

  if (explicitDates) {
    startDate = explicitDates.startDate;
    endDate = explicitDates.endDate;
    nights = explicitDates.nights;
  } else if (durationNights) {
    startDate = formatIso(new Date(year, monthIndex, 8));
    const end = new Date(year, monthIndex, 8);
    end.setDate(end.getDate() + durationNights);
    endDate = formatIso(end);
    nights = durationNights;
  } else {
    startDate = formatIso(new Date(year, monthIndex, 8));
    endDate = formatIso(new Date(year, monthIndex, 18));
    nights = 10;
  }

  const seasonNote =
    monthIndex >= 5 && monthIndex <= 8
      ? "Peak season — book early for award space."
      : "Shoulder season — strong cash and award value.";

  const primaryDestination = stops.length > 0 ? stops[0]! : dest;

  return {
    rawPrompt,
    destination: stops.length > 1 ? `${primaryDestination.name} + ${stops.length - 1} more` : primaryDestination.name,
    destinationIata: primaryDestination.iata ?? dest.iata,
    region: primaryDestination.region ?? dest.region,
    monthLabel,
    startDate,
    endDate,
    nights,
    seasonNote,
    originCity: origin?.city,
    originRegion: origin?.region,
    originAirports: origin?.airports,
    stops: stops.length > 0 ? stops : undefined,
    loyaltyPrograms: loyalty.programs.length > 0 ? loyalty.programs : undefined,
    preferredAirlines: loyalty.airlines.length > 0 ? loyalty.airlines : undefined,
    budgetHint,
    isMultiCity: stops.length > 1,
  };
}

export function buildInferredSummary(intent: TripIntent, searchAirports: string[]): string {
  const airportList = searchAirports.slice(0, 5).join(" · ");
  const originPart = intent.originCity ? `${intent.originCity} → ` : "";
  const datePart = `${intent.startDate.slice(5)} – ${intent.endDate.slice(5)}, ${intent.startDate.slice(0, 4)}`;

  if (intent.stops && intent.stops.length > 0) {
    const legs = intent.stops
      .map((stop) => {
        const duration = stop.nightsLabel ?? (stop.nights ? `${stop.nights}n` : null);
        return duration ? `${stop.name} (${duration})` : stop.name;
      })
      .join(" → ");
    const loyaltyPart =
      intent.loyaltyPrograms?.length || intent.preferredAirlines?.length
        ? ` · ${[...(intent.loyaltyPrograms ?? []), ...(intent.preferredAirlines ?? [])].join(", ")}`
        : "";
    const budgetPart = intent.budgetHint ? ` · Budget ${intent.budgetHint}` : "";
    return `${originPart}${legs} · ${datePart} · ${intent.nights} nights · via ${airportList}${loyaltyPart}${budgetPart}`;
  }

  return `${originPart}${intent.destination}, ${intent.monthLabel} ${intent.startDate.slice(0, 4)} · ${intent.nights} nights · Searching ${airportList}`;
}

export const RECORD_TRIP_EXAMPLE = `I want to go from Beaumont, California to Italy — Venice for 3 days, then 5–7 days in the Dolomites, then the rest in Puglia (2–3 towns). Three-week trip: fly out around the 1st, fly home around the 25th from the West Coast. I'm Hyatt Globalist and Alaska MVP Gold — use Alaska if we can.`;
