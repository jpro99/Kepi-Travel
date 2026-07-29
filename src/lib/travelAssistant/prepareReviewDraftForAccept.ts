import type { ReservationIntegrityIssue } from "@/lib/travelAssistant/reservationIntegrity";

export interface ReviewDraftFlightFields {
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  notes?: string;
  checkOutDate?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
}

const ITALIAN_AIRPORTS = new Set(["BRI", "FCO", "MXP", "VCE", "LIN", "NAP", "PSA", "BGY", "TRN", "FLR", "CTA", "PMO"]);

function normalizeLocalTimeValue(raw: string, flightDate?: string, flightDepartureTime?: string): string {
  const trimmed = raw.trim();
  const date = flightDate?.trim().slice(0, 10) ?? "";
  const departureTime = flightDepartureTime?.trim() ?? "";

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(trimmed)) {
    return trimmed.slice(0, 16);
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/u.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(departureTime)) {
    const normalizedDeparture = departureTime.slice(0, 16);
    if (!date || normalizedDeparture.slice(0, 10) === date) {
      return normalizedDeparture;
    }
    return `${date} ${normalizedDeparture.slice(11, 16)}`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/u.test(departureTime)) {
    if (!date || departureTime.slice(0, 10) === date) {
      return departureTime;
    }
    return `${date} ${departureTime.slice(11, 16)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    return `${trimmed} 12:00`;
  }
  if (date && /^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    const timeMatch = /(\d{2}:\d{2})/u.exec(departureTime);
    return `${date} ${timeMatch?.[1] ?? "12:00"}`;
  }
  return trimmed;
}

function normalizeTimezoneValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "UTC" || trimmed === "GMT") {
    return "Etc/UTC";
  }
  return trimmed;
}

function extractAirportRoute(text: string): { dep: string; arr: string } | null {
  const match = /\b([A-Z]{3})\s*(?:->|→|—|-)\s*([A-Z]{3})\b/u.exec(text.toUpperCase());
  if (!match) {
    return null;
  }
  return { dep: match[1] ?? "", arr: match[2] ?? "" };
}

function inferTimezoneForFlight(dep: string, arr: string, current: string): string {
  const normalized = normalizeTimezoneValue(current);
  if (ITALIAN_AIRPORTS.has(dep) || ITALIAN_AIRPORTS.has(arr)) {
    return "Europe/Rome";
  }
  if (normalized && normalized !== "Etc/UTC") {
    return normalized;
  }
  return "Etc/UTC";
}

export function prepareReviewDraftForAccept<T extends ReviewDraftFlightFields>(draft: T): T {
  const next = { ...draft };
  const hasFlightSignals =
    next.type === "flight" ||
    Boolean(next.flightDepartureAirport?.trim()) ||
    Boolean(next.flightArrivalAirport?.trim()) ||
    Boolean(next.flightNumber?.trim());
  if (hasFlightSignals && next.type !== "flight") {
    next.type = "flight" as T["type"];
  }
  if (next.type !== "flight") {
    return next;
  }

  const dep = (next.flightDepartureAirport ?? "").trim().toUpperCase().slice(0, 4);
  const arr = (next.flightArrivalAirport ?? "").trim().toUpperCase().slice(0, 4);
  const routeFromText = extractAirportRoute(next.location) ?? extractAirportRoute(next.title);
  if (!dep && routeFromText?.dep) next.flightDepartureAirport = routeFromText.dep;
  if (!arr && routeFromText?.arr) next.flightArrivalAirport = routeFromText.arr;
  const resolvedDep = (next.flightDepartureAirport ?? "").trim().toUpperCase().slice(0, 4);
  const resolvedArr = (next.flightArrivalAirport ?? "").trim().toUpperCase().slice(0, 4);
  if (resolvedDep) next.flightDepartureAirport = resolvedDep;
  if (resolvedArr) next.flightArrivalAirport = resolvedArr;

  if (!next.flightAirline?.trim() && next.provider.trim()) {
    next.flightAirline = next.provider.trim();
  }
  if (!next.provider.trim() && next.flightAirline?.trim()) {
    next.provider = next.flightAirline.trim();
  }
  if (!next.title.trim()) {
    if (resolvedDep && resolvedArr) next.title = `${resolvedDep} → ${resolvedArr}`;
    else if (next.flightNumber?.trim()) next.title = next.flightNumber.trim();
    else if (next.provider.trim()) next.title = `${next.provider.trim()} flight`;
  }
  if (!next.location.trim() && resolvedDep && resolvedArr) {
    next.location = `${resolvedDep} -> ${resolvedArr}`;
  }
  if (!next.location.trim() && next.title.trim() && /\b(to|->|→|via)\b/iu.test(next.title)) {
    next.location = next.title.replace(/\s*→\s*/gu, " -> ").trim();
  }

  next.localTime = normalizeLocalTimeValue(next.localTime, next.flightDate, next.flightDepartureTime);

  const localDay = next.localTime.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(localDay)) {
    const flightDay = next.flightDate?.trim().slice(0, 10) ?? "";
    if (flightDay && flightDay !== localDay) {
      next.flightDate = localDay;
    }
    const departureDay = next.flightDepartureTime?.trim().slice(0, 10) ?? "";
    if (departureDay && departureDay !== localDay) {
      next.flightDepartureTime = next.localTime.trim();
    }
  }

  if (next.flightDate?.trim() && next.flightDepartureTime?.trim()) {
    const flightDay = next.flightDate.trim().slice(0, 10);
    if (next.flightDepartureTime.trim().slice(0, 10) !== flightDay) {
      next.flightDepartureTime = next.localTime.trim();
    }
  }
  if (!next.flightDate?.trim() && next.localTime.slice(0, 10)) {
    next.flightDate = next.localTime.slice(0, 10);
  }
  if (!next.flightDepartureTime?.trim() && next.localTime.trim()) {
    next.flightDepartureTime = next.localTime.trim();
  }
  next.timezone = inferTimezoneForFlight(resolvedDep, resolvedArr, next.timezone);

  return next;
}

export function summarizeIntegrityBlockers(issues: ReservationIntegrityIssue[]): string {
  return issues
    .filter((issue) =>
      issue.code === "missing-title" ||
      issue.code === "missing-provider" ||
      issue.code === "missing-location" ||
      issue.code === "invalid-timezone" ||
      issue.code === "invalid-local-time",
    )
    .map((issue) => issue.message)
    .join(" ");
}
