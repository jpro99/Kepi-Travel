import { prepareReviewDraftForAccept, type ReviewDraftFlightFields } from "@/lib/travelAssistant/prepareReviewDraftForAccept";
import { correctReservationTravelDates } from "@/lib/travelAssistant/travelDateCorrection";

export interface AutoImportReservationFields extends ReviewDraftFlightFields {
  type: string;
  notes?: string;
  checkOutDate?: string;
}

function defaultLocalTime(raw: string, fallbackDate?: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/u.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(trimmed)) {
    return trimmed.slice(0, 16);
  }
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    return `${trimmed} 12:00`;
  }
  const date = fallbackDate?.trim().slice(0, 10) ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return `${date} 12:00`;
  }
  return `${new Date().toISOString().slice(0, 10)} 12:00`;
}

function normalizeTimezone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "UTC" || trimmed === "GMT") {
    return "Etc/UTC";
  }
  return trimmed;
}

function defaultProvider(type: string): string {
  if (type === "hotel") return "Hotel";
  if (type === "flight") return "Airline";
  if (type === "train") return "Rail";
  if (type === "ride") return "Ride";
  return "Imported";
}

function defaultTitle(input: AutoImportReservationFields): string {
  const dep = (input.flightDepartureAirport ?? "").trim();
  const arr = (input.flightArrivalAirport ?? "").trim();
  if (input.type === "flight" && dep && arr) {
    return `${dep} → ${arr}`;
  }
  if (input.flightNumber?.trim()) {
    return `${input.provider.trim() || defaultProvider(input.type)} ${input.flightNumber.trim()}`.trim();
  }
  if (input.location.trim()) {
    return input.location.trim();
  }
  if (input.type === "hotel") {
    return "Hotel stay";
  }
  return `${input.provider.trim() || defaultProvider(input.type)} ${input.type}`.trim();
}

function defaultLocation(input: AutoImportReservationFields): string {
  const dep = (input.flightDepartureAirport ?? "").trim();
  const arr = (input.flightArrivalAirport ?? "").trim();
  if (input.type === "flight" && dep && arr) {
    return `${dep} -> ${arr}`;
  }
  if (input.title.trim()) {
    return input.title.trim();
  }
  if (input.type === "hotel") {
    return "Hotel stay";
  }
  return "TBD";
}

/** Fill missing reservation fields so imports can go live without a review step. */
export function enrichReservationForAutoImport<T extends AutoImportReservationFields>(input: T): T {
  const hasFlightSignals =
    input.type === "flight" ||
    Boolean(input.flightDepartureAirport?.trim()) ||
    Boolean(input.flightArrivalAirport?.trim()) ||
    Boolean(input.flightNumber?.trim());

  const next: T = hasFlightSignals ? prepareReviewDraftForAccept({ ...input }) : { ...input };

  if (!next.provider.trim()) {
    next.provider = defaultProvider(next.type);
  }
  if (!next.title.trim()) {
    next.title = defaultTitle(next);
  }
  if (!next.location.trim()) {
    next.location = defaultLocation(next);
  }
  next.localTime = defaultLocalTime(next.localTime, next.flightDate);
  next.timezone = normalizeTimezone(next.timezone);

  if (next.type === "flight") {
    if (!next.flightDate?.trim() && next.localTime.slice(0, 10)) {
      next.flightDate = next.localTime.slice(0, 10);
    }
    if (!next.flightDepartureTime?.trim() && next.localTime.trim()) {
      next.flightDepartureTime = next.localTime.trim();
    }
    if (!next.flightAirline?.trim() && next.provider.trim()) {
      next.flightAirline = next.provider.trim();
    }
  }

  return correctReservationTravelDates(next);
}
