import type { ReservationIntegrityIssue } from "@/lib/travelAssistant/reservationIntegrity";

export interface ReviewDraftFlightFields {
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
}

const ITALIAN_AIRPORTS = new Set(["BRI", "FCO", "MXP", "VCE", "LIN", "NAP", "PSA", "BGY", "TRN", "FLR", "CTA", "PMO"]);

function normalizeLocalTimeValue(raw: string, flightDate?: string, flightDepartureTime?: string): string {
  const departureTime = flightDepartureTime?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/u.test(departureTime)) {
    return departureTime;
  }
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/u.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    return `${trimmed} 12:00`;
  }
  const date = flightDate?.trim().slice(0, 10) ?? "";
  if (date && /^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    const timeMatch = /(\d{2}:\d{2})/u.exec(departureTime);
    return `${date} ${timeMatch?.[1] ?? "12:00"}`;
  }
  return trimmed;
}

function inferTimezoneForFlight(dep: string, arr: string, current: string): string {
  if (current.trim() && current.trim() !== "Etc/UTC") {
    return current.trim();
  }
  if (ITALIAN_AIRPORTS.has(dep) || ITALIAN_AIRPORTS.has(arr)) {
    return "Europe/Rome";
  }
  return current.trim() || "Etc/UTC";
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
  if (dep) next.flightDepartureAirport = dep;
  if (arr) next.flightArrivalAirport = arr;

  if (!next.flightAirline?.trim() && next.provider.trim()) {
    next.flightAirline = next.provider.trim();
  }
  if (!next.provider.trim() && next.flightAirline?.trim()) {
    next.provider = next.flightAirline.trim();
  }
  if (!next.title.trim()) {
    if (dep && arr) next.title = `${dep} → ${arr}`;
    else if (next.flightNumber?.trim()) next.title = next.flightNumber.trim();
    else if (next.provider.trim()) next.title = `${next.provider.trim()} flight`;
  }
  if (!next.location.trim() && dep && arr) {
    next.location = `${dep} -> ${arr}`;
  }

  next.localTime = normalizeLocalTimeValue(next.localTime, next.flightDate, next.flightDepartureTime);
  if (!next.flightDate?.trim() && next.localTime.slice(0, 10)) {
    next.flightDate = next.localTime.slice(0, 10);
  }
  if (!next.flightDepartureTime?.trim() && next.localTime.trim()) {
    next.flightDepartureTime = next.localTime.trim();
  }
  next.timezone = inferTimezoneForFlight(dep, arr, next.timezone);

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
