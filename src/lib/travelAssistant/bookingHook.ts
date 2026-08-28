/**
 * Station 0 — factory Booking Hook (paid bookings only).
 * POST one IATA or one official station per event; sequential queue.
 * Env: BOOKING_HOOK_URL + BOOKING_HOOK_SENDER_KEY (header X-Booking-Hook-Sender-Key).
 */

import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { isPlannedReservation } from "@/lib/travelAssistant/plannedReservationMatch";
import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";
import { logger } from "@/lib/logger";

/** Header name for BOOKING_HOOK_SENDER_KEY — document in .env.example. */
export const BOOKING_HOOK_SENDER_HEADER = "X-Booking-Hook-Sender-Key";

/** KAC/factory packages already compiled — no compile restart. */
const SIGNED_IATAS = new Set(["ONT", "SEA", "FCO", "BRI"]);

/** Rail stations already compiled — no compile restart. */
const SIGNED_STATION_KEYS = new Set([
  "leonardo express",
  "fiumicino aeroporto",
  "roma termini",
]);

const OFFICIAL_IATA_RE = /^[A-Z]{3}$/u;
const LOCATION_IATA_ARROW_RE = /\b([A-Z]{3})\s*→\s*([A-Z]{3})\b/u;
const STATION_ARROW_RE = /^(.+?)\s*(?:→|->|—|–)\s*(.+)$/u;
const BUS_LEG_RE = /\b(?:bus|autobus|replacement\s+bus|coach\s+service)\b/iu;

export interface BookingHookPayload {
  paid: true;
  iata?: string;
  station?: string;
  booking_id: string;
  timestamp: string;
}

export function isPaidBookingReservation(reservation: SessionReservation): boolean {
  if (reservation.plannedOnly === true) return false;
  if (isPlannedReservation(reservation)) return false;
  const code = reservation.confirmationCode?.trim() ?? "";
  if (!code || isPlaceholderConfirmation(code)) return false;
  return reservation.type === "flight" || reservation.type === "train";
}

export function isBusLegReservation(reservation: SessionReservation): boolean {
  const text = [
    reservation.title,
    reservation.provider,
    reservation.location,
    reservation.notes,
  ]
    .filter(Boolean)
    .join(" ");
  return BUS_LEG_RE.test(text);
}

function normalizeStationKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isSignedStationName(name: string): boolean {
  const key = normalizeStationKey(name);
  if (!key) return false;
  if (SIGNED_STATION_KEYS.has(key)) return true;
  for (const signed of SIGNED_STATION_KEYS) {
    if (key.includes(signed) || signed.includes(key)) return true;
  }
  return false;
}

export function isSignedIata(iata: string): boolean {
  return SIGNED_IATAS.has(iata.trim().toUpperCase());
}

function collectStationNamesFromText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const arrow = trimmed.match(STATION_ARROW_RE);
  if (arrow?.[1] && arrow[2]) {
    return [arrow[1].trim(), arrow[2].trim()].filter((name) => name.length >= 3);
  }
  if (trimmed.length >= 3) return [trimmed];
  return [];
}

export function extractOfficialIatasFromReservation(reservation: SessionReservation): string[] {
  if (reservation.type !== "flight") return [];
  const codes = new Set<string>();
  const dep = reservation.flightDepartureAirport?.trim().toUpperCase() ?? "";
  const arr = reservation.flightArrivalAirport?.trim().toUpperCase() ?? "";
  if (OFFICIAL_IATA_RE.test(dep)) codes.add(dep);
  if (OFFICIAL_IATA_RE.test(arr)) codes.add(arr);
  const locMatch = reservation.location?.match(LOCATION_IATA_ARROW_RE);
  if (locMatch?.[1] && OFFICIAL_IATA_RE.test(locMatch[1])) codes.add(locMatch[1]);
  if (locMatch?.[2] && OFFICIAL_IATA_RE.test(locMatch[2])) codes.add(locMatch[2]);
  return [...codes];
}

export function extractOfficialStationsFromReservation(reservation: SessionReservation): string[] {
  if (reservation.type !== "train") return [];
  const names = new Set<string>();
  for (const text of [reservation.location, reservation.title]) {
    for (const name of collectStationNamesFromText(text ?? "")) {
      names.add(name);
    }
  }
  return [...names];
}

export function buildBookingHookEvents(reservation: SessionReservation): BookingHookPayload[] {
  if (!isPaidBookingReservation(reservation)) return [];
  if (isBusLegReservation(reservation)) return [];

  const timestamp = new Date().toISOString();
  const booking_id = reservation.id;
  const events: BookingHookPayload[] = [];

  for (const iata of extractOfficialIatasFromReservation(reservation)) {
    if (isSignedIata(iata)) continue;
    events.push({ paid: true, iata, booking_id, timestamp });
  }

  for (const station of extractOfficialStationsFromReservation(reservation)) {
    if (isSignedStationName(station)) continue;
    events.push({ paid: true, station, booking_id, timestamp });
  }

  return events;
}

export function detectNewlyPaidReservations(
  before: SessionReservation[],
  after: SessionReservation[],
): SessionReservation[] {
  const beforeById = new Map(before.map((reservation) => [reservation.id, reservation]));
  const newlyPaid: SessionReservation[] = [];

  for (const afterRes of after) {
    if (!isPaidBookingReservation(afterRes)) continue;
    const beforeRes = beforeById.get(afterRes.id);
    if (beforeRes && isPaidBookingReservation(beforeRes)) continue;
    newlyPaid.push(afterRes);
  }

  return newlyPaid;
}

export async function postBookingHookEvent(payload: BookingHookPayload): Promise<void> {
  const url = process.env.BOOKING_HOOK_URL?.trim();
  const senderKey = process.env.BOOKING_HOOK_SENDER_KEY?.trim();
  if (!url || !senderKey) {
    logger.info("Booking hook skip — BOOKING_HOOK_URL or BOOKING_HOOK_SENDER_KEY not configured.", {
      scope: "travelAssistant/bookingHook",
      booking_id: payload.booking_id,
    });
    return;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [BOOKING_HOOK_SENDER_HEADER]: senderKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    logger.warn("Booking hook POST failed.", {
      scope: "travelAssistant/bookingHook",
      status: response.status,
      booking_id: payload.booking_id,
    });
  }
}

export async function dispatchBookingHookForNewlyPaid(
  before: SessionReservation[],
  after: SessionReservation[],
): Promise<void> {
  const newlyPaid = detectNewlyPaidReservations(before, after);
  for (const reservation of newlyPaid) {
    const events = buildBookingHookEvents(reservation);
    for (const event of events) {
      await postBookingHookEvent(event);
    }
  }
}

/** Fire-and-forget wrapper — never blocks trip persist. */
export function queueBookingHookDispatch(before: SessionReservation[], after: SessionReservation[]): void {
  void dispatchBookingHookForNewlyPaid(before, after).catch((error) => {
    logger.warn("Booking hook dispatch failed.", {
      scope: "travelAssistant/bookingHook",
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
