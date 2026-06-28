import { getAirportByIata } from "@/lib/travelAssistant/airportGeo";
import { isPlannedReservation, parseAirportsFromLocation } from "@/lib/travelAssistant/plannedReservationMatch";
import type { PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";

export type TransportKind = "flight" | "train" | "ride";
export type TransportSegmentStatus = "unbooked" | "booked" | "conflict";

export interface TransportRouteReservation {
  id: string;
  type: string;
  title?: string;
  provider?: string;
  localTime?: string;
  timezone?: string;
  location?: string;
  confirmationCode?: string | null;
  plannedOnly?: boolean;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  trainNumber?: string;
}

export interface TripTransportSegment {
  id: string;
  kind: TransportKind;
  status: TransportSegmentStatus;
  booked: boolean;
  fromCode: string;
  toCode: string;
  fromLabel: string;
  toLabel: string;
  departMs: number | null;
  arriveMs: number | null;
  departDisplay: string;
  arriveDisplay: string;
  dateDisplay: string;
  headline: string;
  subline: string;
  reservationId?: string;
  connectionIssue?: string;
  sortKey: string;
  lat?: number;
  lon?: number;
  toLat?: number;
  toLon?: number;
}

export interface TripTransportRoute {
  segments: TripTransportSegment[];
  summary: {
    total: number;
    booked: number;
    unbooked: number;
    conflicts: number;
    allSet: boolean;
  };
}

function toUtcMs(localTime: string, timezone?: string): number {
  const local = localTime?.trim() ?? "";
  const tz = timezone?.trim() || "Etc/UTC";
  if (!local) return Number.NaN;
  try {
    const [datePart = "", timePart = "00:00"] = local.split(/[ T]/);
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    if (!year || !month || !day) return Number.NaN;
    const approxUtcMs = Date.UTC(year, month - 1, day, hour ?? 0, minute ?? 0);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(formatter.formatToParts(approxUtcMs).map((p) => [p.type, p.value]));
    const tzAsUtcMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    const offsetMs = tzAsUtcMs - approxUtcMs;
    return approxUtcMs - offsetMs;
  } catch {
    const normalized = local.slice(0, 16).replace(" ", "T");
    return Date.parse(normalized.includes("T") ? normalized : `${normalized}T12:00:00`);
  }
}

function fmtTime12(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDateShort(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtSchedulePoint(ms: number | null, airportCode: string): string | null {
  if (ms == null || !Number.isFinite(ms) || !airportCode || airportCode === "???") return null;
  return `${fmtDateShort(ms)} ${fmtTime12(ms)} ${airportCode}`;
}

function hasConfirmedSchedule(ms: number | null): boolean {
  return ms != null && Number.isFinite(ms);
}

function normalizeIata(code: string | undefined): string {
  return code?.trim().toUpperCase() ?? "";
}

function departSortKey(reservation: TransportRouteReservation): string {
  const date =
    reservation.flightDate?.slice(0, 10) ??
    reservation.flightDepartureTime?.slice(0, 10) ??
    reservation.localTime?.trim().slice(0, 10) ??
    "9999-99-99";
  const timeRaw =
    reservation.flightDepartureTime?.includes("T")
      ? reservation.flightDepartureTime.slice(11, 16)
      : reservation.localTime?.split(/[ T]/)[1]?.slice(0, 5) ?? "00:00";
  return `${date}T${timeRaw}`;
}

function endpointsForReservation(reservation: TransportRouteReservation): {
  fromCode: string;
  toCode: string;
  fromLabel: string;
  toLabel: string;
} {
  const route = parseAirportsFromLocation(reservation.location ?? "");
  if (reservation.type === "flight") {
    const fromCode = normalizeIata(reservation.flightDepartureAirport ?? route.dep);
    const toCode = normalizeIata(reservation.flightArrivalAirport ?? route.arr);
    const fromAirport = getAirportByIata(fromCode);
    const toAirport = getAirportByIata(toCode);
    return {
      fromCode: fromCode || "???",
      toCode: toCode || "???",
      fromLabel: fromAirport?.name ?? (fromCode || "Depart"),
      toLabel: toAirport?.name ?? (toCode || "Arrive"),
    };
  }

  const parts = (reservation.location ?? reservation.title ?? "")
    .split(/→|->| to /iu)
    .map((part) => part.trim())
    .filter(Boolean);
  const fromLabel = parts[0] ?? reservation.title ?? "Start";
  const toLabel = parts[1] ?? "End";
  return {
    fromCode: fromLabel.slice(0, 3).toUpperCase(),
    toCode: toLabel.slice(0, 3).toUpperCase(),
    fromLabel,
    toLabel,
  };
}

function parseLocalHour(timeStr: string): number | null {
  const match = /T(\d{2}):/u.exec(timeStr) ?? /\s(\d{2}):/u.exec(timeStr);
  if (!match?.[1]) return null;
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? hour : null;
}

/** Tickets often label 12:10 AM long-hauls on the prior calendar date (Sep 1 → actually Sep 2 00:10). */
function rollEarlyMorningDepartureMs(ms: number, timeStr: string): number {
  const hour = parseLocalHour(timeStr);
  if (hour == null || hour >= 3) return ms;
  return ms + 86_400_000;
}

function departMsForReservation(reservation: TransportRouteReservation): number {
  if (reservation.type === "flight") {
    const dep = reservation.flightDepartureTime ?? reservation.localTime ?? "";
    const ms = toUtcMs(dep, reservation.timezone);
    if (Number.isFinite(ms)) return rollEarlyMorningDepartureMs(ms, dep);
  }
  return toUtcMs(reservation.localTime ?? "", reservation.timezone);
}

function arriveMsForReservation(reservation: TransportRouteReservation): number {
  if (reservation.type === "flight") {
    const arr = reservation.flightArrivalTime ?? "";
    if (arr.trim()) {
      const ms = toUtcMs(arr, reservation.timezone);
      if (Number.isFinite(ms)) return rollEarlyMorningDepartureMs(ms, arr);
    }
    const depMs = departMsForReservation(reservation);
    if (Number.isFinite(depMs)) return depMs + 3 * 3_600_000;
  }
  const depMs = departMsForReservation(reservation);
  if (Number.isFinite(depMs)) return depMs + 2 * 3_600_000;
  return Number.NaN;
}

function isBookedTransport(reservation: TransportRouteReservation): boolean {
  return !isPlannedReservation(reservation);
}

function segmentFromReservation(reservation: TransportRouteReservation): TripTransportSegment | null {
  const kind = reservation.type;
  if (kind !== "flight" && kind !== "train" && kind !== "ride") return null;

  const { fromCode, toCode, fromLabel, toLabel } = endpointsForReservation(reservation);
  const departMs = departMsForReservation(reservation);
  const arriveMs = arriveMsForReservation(reservation);
  const booked = isBookedTransport(reservation);
  const fromAirport = getAirportByIata(fromCode);
  const toAirport = getAirportByIata(toCode);

  const airline = reservation.flightAirline?.trim() || reservation.provider?.trim() || "";
  const flightNo = reservation.flightNumber?.trim() || "";
  const trainNo = reservation.trainNumber?.trim() || "";

  let headline = reservation.title?.trim() || `${fromCode} → ${toCode}`;
  let subline = "";
  if (kind === "flight") {
    headline = [airline, flightNo].filter(Boolean).join(" ") || headline;
    subline = booked ? "Booked flight" : "Flight not booked yet";
  } else if (kind === "train") {
    headline = [reservation.provider?.trim(), trainNo].filter(Boolean).join(" ") || headline;
    subline = booked ? "Booked train" : "Train not booked yet";
  } else {
    headline = reservation.provider?.trim() || reservation.title?.trim() || "Ground transfer";
    subline = booked ? "Booked ride" : "Ride not booked yet";
  }

  return {
    id: reservation.id,
    kind,
    status: booked ? "booked" : "unbooked",
    booked,
    fromCode,
    toCode,
    fromLabel,
    toLabel,
    departMs: Number.isFinite(departMs) ? departMs : null,
    arriveMs: Number.isFinite(arriveMs) ? arriveMs : null,
    departDisplay: Number.isFinite(departMs) ? fmtTime12(departMs) : "TBD",
    arriveDisplay: Number.isFinite(arriveMs) ? fmtTime12(arriveMs) : "",
    dateDisplay: Number.isFinite(departMs) ? fmtDateShort(departMs) : "",
    headline,
    subline,
    reservationId: reservation.id,
    sortKey: departSortKey(reservation),
    lat: fromAirport?.lat,
    lon: fromAirport?.lon,
    toLat: toAirport?.lat,
    toLon: toAirport?.lon,
  };
}

function segmentFromPlannedLeg(leg: PlannedFlightLeg): TripTransportSegment {
  const fromCode = normalizeIata(leg.fromIata) || leg.fromLabel.slice(0, 3).toUpperCase();
  const toCode = normalizeIata(leg.toIata) || leg.toLabel.slice(0, 3).toUpperCase();
  const fromAirport = getAirportByIata(fromCode);
  const toAirport = getAirportByIata(toCode);

  return {
    id: `planned-${leg.id}`,
    kind: "flight",
    status: leg.status === "booked" ? "booked" : "unbooked",
    booked: leg.status === "booked",
    fromCode,
    toCode,
    fromLabel: leg.fromLabel,
    toLabel: leg.toLabel,
    departMs: null,
    arriveMs: null,
    departDisplay: "TBD",
    arriveDisplay: "",
    dateDisplay: leg.departureDate
      ? new Date(`${leg.departureDate}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : "",
    headline: `${fromCode} → ${toCode}`,
    subline: leg.status === "booked" ? (leg.bookedSummary ?? "Booked") : "Planned — not booked yet",
    reservationId: leg.reservationId,
    sortKey: `${leg.departureDate}T09:00`,
    lat: fromAirport?.lat,
    lon: fromAirport?.lon,
    toLat: toAirport?.lat,
    toLon: toAirport?.lon,
  };
}

function legMatchesSegment(leg: PlannedFlightLeg, segment: TripTransportSegment): boolean {
  const legFrom = normalizeIata(leg.fromIata) || leg.fromLabel.slice(0, 3).toUpperCase();
  const legTo = normalizeIata(leg.toIata) || leg.toLabel.slice(0, 3).toUpperCase();
  return legFrom === segment.fromCode && legTo === segment.toCode;
}

/** After-evening arrivals often pair with departures stored on the wrong calendar day (12:10 AM). */
function normalizeOvernightConnections(segments: TripTransportSegment[]): TripTransportSegment[] {
  const out = segments.map((segment) => ({ ...segment }));

  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    const next = out[i];
    if (prev.toCode !== next.fromCode || prev.arriveMs == null || next.departMs == null) continue;
    if (next.departMs >= prev.arriveMs) continue;

    const backwardsGapMs = prev.arriveMs - next.departMs;
    // Only roll when the departure is on the wrong calendar day (12+ hours "before" arrival).
    if (backwardsGapMs < 12 * 3_600_000) continue;

    const rolledDepart = next.departMs + 86_400_000;
    const rolledArrive = next.arriveMs != null ? next.arriveMs + 86_400_000 : null;
    if (rolledDepart <= prev.arriveMs) continue;

    out[i] = {
      ...next,
      departMs: rolledDepart,
      arriveMs: rolledArrive,
      departDisplay: fmtTime12(rolledDepart),
      arriveDisplay: rolledArrive != null ? fmtTime12(rolledArrive) : next.arriveDisplay,
      dateDisplay: fmtDateShort(rolledDepart),
    };
  }

  return out;
}

function shouldEvaluateConnection(prev: TripTransportSegment, next: TripTransportSegment): boolean {
  if (!hasConfirmedSchedule(prev.arriveMs) || !hasConfirmedSchedule(next.departMs)) return false;
  if (prev.toCode !== next.fromCode) return false;
  if (prev.toCode === "???" || next.fromCode === "???") return false;
  return true;
}

function evaluateConnection(prev: TripTransportSegment, next: TripTransportSegment): string | null {
  if (!shouldEvaluateConnection(prev, next)) return null;
  if (prev.arriveMs == null || next.departMs == null) return null;

  const landing = fmtSchedulePoint(prev.arriveMs, prev.toCode);
  const departure = fmtSchedulePoint(next.departMs, next.fromCode);
  if (!landing || !departure) return null;

  if (next.departMs < prev.arriveMs) {
    return `Can't make this connection: land at ${landing}, but your next flight departs ${departure}.`;
  }

  if (prev.kind === "flight" && next.kind === "flight") {
    const gapMins = (next.departMs - prev.arriveMs) / 60_000;
    const minConnection = prev.toCode === "HNL" ? 150 : 75;
    if (gapMins > 0 && gapMins < minConnection) {
      return `Tight connection: only ${Math.round(gapMins)} min between landing at ${landing} and departing ${departure}.`;
    }
  }

  return null;
}

export function buildTripTransportRoute(
  reservations: TransportRouteReservation[],
  plannedFlightLegs: PlannedFlightLeg[] = [],
): TripTransportRoute {
  const transport = reservations.filter(
    (r) => r.type === "flight" || r.type === "train" || r.type === "ride",
  );

  let segments = transport
    .map(segmentFromReservation)
    .filter((segment): segment is TripTransportSegment => segment !== null)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey) || (a.departMs ?? 0) - (b.departMs ?? 0));

  for (const leg of plannedFlightLegs) {
    if (leg.status === "booked") continue;
    const alreadyCovered = segments.some((segment) => legMatchesSegment(leg, segment) && segment.booked);
    if (!alreadyCovered) {
      segments.push(segmentFromPlannedLeg(leg));
    }
  }

  segments = segments.sort(
    (a, b) => a.sortKey.localeCompare(b.sortKey) || (a.departMs ?? 0) - (b.departMs ?? 0),
  );

  segments = normalizeOvernightConnections(segments);
  segments = segments.sort(
    (a, b) => a.sortKey.localeCompare(b.sortKey) || (a.departMs ?? 0) - (b.departMs ?? 0),
  );

  for (let i = 0; i < segments.length; i++) {
    const next = segments[i + 1];
    if (!next) continue;
    const issue = evaluateConnection(segments[i], next);
    if (issue) {
      next.status = "conflict";
      next.connectionIssue = issue;
    }
  }

  const booked = segments.filter((s) => s.booked).length;
  const unbooked = segments.filter((s) => !s.booked).length;
  const conflicts = segments.filter((s) => s.status === "conflict").length;

  return {
    segments,
    summary: {
      total: segments.length,
      booked,
      unbooked,
      conflicts,
      allSet: segments.length > 0 && unbooked === 0 && conflicts === 0,
    },
  };
}

export function segmentStrokeColor(segment: TripTransportSegment): string {
  if (segment.status === "conflict") return "#ef4444";
  if (!segment.booked) return "#64748b";
  if (segment.kind === "train") return "#14b8a6";
  if (segment.kind === "ride") return "#f59e0b";
  return "#22c55e";
}

export function segmentKindEmoji(kind: TransportKind): string {
  if (kind === "train") return "🚆";
  if (kind === "ride") return "🚗";
  return "✈️";
}
