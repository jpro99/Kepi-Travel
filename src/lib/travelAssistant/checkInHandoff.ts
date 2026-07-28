/**
 * Check-in window detection and honest airline / wallet handoff URLs.
 * Kepi does not render scannable boarding passes — it routes to the airline or Wallet.
 */

import { canonicalFlightDepartureLocalTime } from "@/lib/travelAssistant/tripWindow";
import {
  resolveBoardingPassUrl,
  type ReservationSourceLink,
} from "@/lib/travelAssistant/reservationLinks";

export const CHECKIN_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CheckInHandoffFlight {
  id: string;
  flightNumber?: string;
  flightAirline?: string;
  provider?: string;
  confirmationCode?: string;
  flightDepartureAirport?: string;
  departureUtcMs: number | null;
  boardingPassUrl?: string;
}

export interface CheckInHandoffContent {
  flightId: string;
  headline: string;
  detail: string;
  checkInOpen: boolean;
  primaryActionLabel: string;
  primaryActionUrl: string;
  secondaryActionLabel?: string;
  secondaryActionUrl?: string;
  holdsBoardingPass: boolean;
  honestyNote: string;
}

const AIRLINE_CHECKIN_BY_PREFIX: Record<string, string> = {
  AS: "https://www.alaskaair.com/check-in",
  HA: "https://www.hawaiianairlines.com/check-in",
  UA: "https://www.united.com/en/us/checkin",
  DL: "https://www.delta.com/check-in",
  AA: "https://www.aa.com/check-in",
  WN: "https://www.southwest.com/air/check-in/",
  B6: "https://www.jetblue.com/check-in",
  NK: "https://www.spirit.com/check-in",
  F9: "https://www.flyfrontier.com/travel/my-trips/check-in",
  AC: "https://www.aircanada.com/ca/en/aco/home/check-in.html",
  BA: "https://www.britishairways.com/travel/managebooking/public/en_us",
  LH: "https://www.lufthansa.com/us/en/online-check-in",
  AF: "https://wwws.airfrance.us/check-in",
  KL: "https://www.klm.us/check-in",
  AZ: "https://www.ita-airways.com/en_us/check-in.html",
  EK: "https://www.emirates.com/us/english/manage-booking/",
  QR: "https://www.qatarairways.com/en/manage-booking.html",
};

function extractAirlinePrefix(flightNumber: string | undefined): string | null {
  const match = /^([A-Z0-9]{2})/u.exec((flightNumber ?? "").replace(/\s+/gu, "").toUpperCase());
  return match?.[1] ?? null;
}

export function computeCheckInOpenUtcMs(departureUtcMs: number): number {
  return departureUtcMs - CHECKIN_WINDOW_MS;
}

export function isCheckInWindowOpen(departureUtcMs: number, nowMs = Date.now()): boolean {
  if (!Number.isFinite(departureUtcMs)) return false;
  return nowMs >= computeCheckInOpenUtcMs(departureUtcMs) && nowMs < departureUtcMs;
}

export function resolveAirlineCheckInUrl(input: {
  flightNumber?: string;
  airlineName?: string;
  confirmationCode?: string;
}): string | null {
  const prefix = extractAirlinePrefix(input.flightNumber);
  if (prefix && AIRLINE_CHECKIN_BY_PREFIX[prefix]) {
    return AIRLINE_CHECKIN_BY_PREFIX[prefix];
  }
  const airline = (input.airlineName ?? "").trim().toLowerCase();
  if (airline.includes("alaska")) return AIRLINE_CHECKIN_BY_PREFIX.AS;
  if (airline.includes("hawaiian")) return AIRLINE_CHECKIN_BY_PREFIX.HA;
  if (airline.includes("united")) return AIRLINE_CHECKIN_BY_PREFIX.UA;
  if (airline.includes("delta")) return AIRLINE_CHECKIN_BY_PREFIX.DL;
  if (airline.includes("american")) return AIRLINE_CHECKIN_BY_PREFIX.AA;
  if (airline.includes("southwest")) return AIRLINE_CHECKIN_BY_PREFIX.WN;
  if (airline.includes("jetblue")) return AIRLINE_CHECKIN_BY_PREFIX.B6;
  if (airline.includes("ita")) return AIRLINE_CHECKIN_BY_PREFIX.AZ;
  return null;
}

export function isWalletPassUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return (
    normalized.endsWith(".pkpass") ||
    normalized.includes("wallet") ||
    normalized.includes("passbook") ||
    normalized.includes("pay.google.com/gp/v/save/")
  );
}

export function parseDepartureUtcMs(localTime: string, timezone?: string): number | null {
  const normalized = localTime.trim().replace("T", " ").slice(0, 16);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/u.exec(normalized);
  if (!match) return null;
  const [, year, month, day, hour = "12", minute = "0"] = match;
  const approxUtcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (!timezone?.trim()) return approxUtcMs;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(approxUtcMs));
    const read = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((part) => part.type === type)?.value ?? "0");
    const tzAsUtcMs = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"));
    return approxUtcMs - (tzAsUtcMs - approxUtcMs);
  } catch {
    return approxUtcMs;
  }
}

export function buildCheckInHandoffContent(
  flight: CheckInHandoffFlight,
  nowMs = Date.now(),
): CheckInHandoffContent | null {
  if (flight.departureUtcMs === null || !Number.isFinite(flight.departureUtcMs)) {
    return null;
  }
  const checkInOpen = isCheckInWindowOpen(flight.departureUtcMs, nowMs);
  const boardingPassUrl = flight.boardingPassUrl?.trim() ?? "";
  const holdsBoardingPass = Boolean(boardingPassUrl);
  const airlineCheckInUrl = resolveAirlineCheckInUrl({
    flightNumber: flight.flightNumber,
    airlineName: flight.flightAirline ?? flight.provider,
    confirmationCode: flight.confirmationCode,
  });

  if (!checkInOpen && !holdsBoardingPass) {
    return null;
  }

  const flightLabel =
    flight.flightNumber?.trim() ||
    [flight.flightAirline, flight.flightDepartureAirport].filter(Boolean).join(" ") ||
    "your flight";

  if (holdsBoardingPass) {
    return {
      flightId: flight.id,
      headline: "Boarding pass ready",
      detail: `Open your pass for ${flightLabel}. Kepi stores the link — the scannable barcode lives in Wallet or your airline app.`,
      checkInOpen: true,
      primaryActionLabel: isWalletPassUrl(boardingPassUrl) ? "Open boarding pass" : "Open pass link",
      primaryActionUrl: boardingPassUrl,
      secondaryActionLabel: airlineCheckInUrl ? "Airline check-in" : undefined,
      secondaryActionUrl: airlineCheckInUrl ?? undefined,
      holdsBoardingPass: true,
      honestyNote: "Kepi does not store the barcode itself — it opens your airline or Wallet pass.",
    };
  }

  if (!checkInOpen) return null;

  const primaryActionUrl = airlineCheckInUrl ?? "https://www.google.com/search?q=airline+online+check+in";
  return {
    flightId: flight.id,
    headline: "Check-in is open",
    detail: `Online check-in is open for ${flightLabel}. Check in now, then add your boarding pass to Apple Wallet or Google Wallet from the airline.`,
    checkInOpen: true,
    primaryActionLabel: airlineCheckInUrl ? "Check in now" : "Find airline check-in",
    primaryActionUrl,
    holdsBoardingPass: false,
    honestyNote: "Kepi opens your airline check-in — your boarding pass stays in Wallet or the airline app.",
  };
}

export interface CheckInSourceReservation {
  id: string;
  type?: string;
  plannedOnly?: boolean;
  localTime?: string;
  timezone?: string;
  flightNumber?: string;
  flightAirline?: string;
  provider?: string;
  confirmationCode?: string;
  flightDepartureAirport?: string;
  flightDepartureTime?: string;
  flightDate?: string;
  boardingPassUrl?: string;
  sourceLinks?: ReservationSourceLink[];
  originalEmailText?: string;
}

/** Next upcoming flight with check-in open or a stored pass link — for Home. */
export function resolveNextCheckInHandoff(
  reservations: CheckInSourceReservation[],
  nowMs = Date.now(),
): CheckInHandoffContent | null {
  const flights = reservations
    .filter((r) => (r.type ?? "").toLowerCase() === "flight" && !r.plannedOnly)
    .map((flight) => {
      const departureUtcMs = parseDepartureUtcMs(
        canonicalFlightDepartureLocalTime(flight),
        flight.timezone,
      );
      return { flight, departureUtcMs };
    })
    .filter((row) => row.departureUtcMs != null && row.departureUtcMs > nowMs - 60 * 60_000)
    .sort((a, b) => (a.departureUtcMs ?? 0) - (b.departureUtcMs ?? 0));

  for (const row of flights) {
    const content = buildCheckInHandoffContent({
      id: row.flight.id,
      flightNumber: row.flight.flightNumber,
      flightAirline: row.flight.flightAirline,
      provider: row.flight.provider,
      confirmationCode: row.flight.confirmationCode,
      flightDepartureAirport: row.flight.flightDepartureAirport,
      departureUtcMs: row.departureUtcMs,
      boardingPassUrl: resolveBoardingPassUrl({
        boardingPassUrl: row.flight.boardingPassUrl,
        sourceLinks: row.flight.sourceLinks,
        originalEmailText: row.flight.originalEmailText,
      }) ?? undefined,
    }, nowMs);
    if (content) return content;
  }
  return null;
}
