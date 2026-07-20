/**
 * Friend-share day-plan PDF — narrative layout like Jeff's Puglia Word doc (not the logistics table).
 */

import type { ItineraryPlansData } from "@/lib/travelAssistant/itineraryDayPlan";
import { reservationPropertyName } from "@/lib/travelAssistant/reservationDisplayLabel";
import { sanitizeTravelerNotes } from "@/lib/travelAssistant/sanitizeTravelerNotes";
import {
  canonicalFlightDepartureDay,
  dateOnly,
  reservationPrimaryDate,
} from "@/lib/travelAssistant/tripWindow";

export interface NarrativeHotelStay {
  type?: string;
  title?: string;
  provider?: string;
  localTime?: string;
  checkOutDate?: string;
  location?: string;
  confirmationCode?: string;
  notes?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightDate?: string;
  flightAirline?: string;
}

export interface NarrativeDaySection {
  dateKey: string;
  dayNumber: number | null;
  prettyDate: string;
  heading: string;
  location: string;
  hotelLine: string | null;
  bullets: string[];
  bookingLines: string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function listNarrativeDayKeys(
  tripStart: string | null | undefined,
  tripEnd: string | null | undefined,
): string[] {
  const start = dateOnly(tripStart);
  const end = dateOnly(tripEnd);
  if (!start || !end || start > end) return [];
  const keys: string[] = [];
  let cursor = Date.parse(`${start}T12:00:00Z`);
  const endMs = Date.parse(`${end}T12:00:00Z`);
  while (cursor <= endMs) {
    keys.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return keys;
}

export function formatNarrativePrettyDate(dateKey: string): string {
  const ms = Date.parse(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(ms)) return dateKey;
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function narrativeTripDayNumber(
  dateKey: string,
  tripStart: string | null | undefined,
): number | null {
  const start = dateOnly(tripStart);
  if (!start) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const dayMs = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(dayMs)) return null;
  return Math.floor((dayMs - startMs) / 86_400_000) + 1;
}

export function notesToBullets(notes: string): string[] {
  return sanitizeTravelerNotes(notes)
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*[•\-\*]\s*/u, "").trim())
    .filter(Boolean)
    .filter((line) => !/^stay in /iu.test(line) && !/^hotel:/iu.test(line));
}

export function bulletsToDayNotes(bullets: string[]): string {
  return bullets
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => (b.startsWith("•") ? b : `• ${b}`))
    .join("\n");
}

function bookingLineForReservation(reservation: NarrativeHotelStay): string | null {
  if (reservation.type === "flight") {
    const fn = reservation.flightNumber?.trim() || reservation.title?.trim() || "Flight";
    const dep = reservation.flightDepartureAirport?.trim() || "?";
    const arr = reservation.flightArrivalAirport?.trim() || "?";
    const time = (reservation.flightDepartureTime || reservation.localTime || "").trim().slice(11, 16);
    return `✈ ${fn} · ${dep} → ${arr}${time ? ` · ${time}` : ""}`;
  }
  if (reservation.type === "hotel") {
    const name = reservationPropertyName({
      type: "hotel",
      title: reservation.title,
      provider: reservation.provider,
      location: reservation.location,
      notes: reservation.notes,
    });
    return `🏨 ${name}`;
  }
  if (reservation.type === "train") {
    return `🚆 ${reservation.title || reservation.provider || "Train"}`;
  }
  if (reservation.type === "ride") {
    return `🚗 ${reservation.title || reservation.provider || "Ride"}`;
  }
  return null;
}

function reservationTouchesDay(reservation: NarrativeHotelStay, dateKey: string): boolean {
  if (reservation.type === "hotel") {
    const start = dateOnly(reservation.localTime);
    const end = dateOnly(reservation.checkOutDate) || start;
    if (!start) return false;
    return start <= dateKey && dateKey <= end;
  }
  if (reservation.type === "flight") {
    return canonicalFlightDepartureDay(reservation) === dateKey;
  }
  return reservationPrimaryDate(reservation) === dateKey;
}

export function buildNarrativeDaySections(input: {
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  itineraryPlans?: ItineraryPlansData | null;
  dayNotes?: Record<string, string>;
  reservations?: NarrativeHotelStay[];
}): NarrativeDaySection[] {
  const start = dateOnly(input.tripStartDate);
  const dayKeysFromWindow = listNarrativeDayKeys(input.tripStartDate, input.tripEndDate);
  const planKeys = Object.keys(input.itineraryPlans?.dayPlans ?? {});
  const noteKeys = Object.keys(input.dayNotes ?? {}).filter((k) => (input.dayNotes?.[k] ?? "").trim());
  const allKeys = [...new Set([...dayKeysFromWindow, ...planKeys, ...noteKeys])].sort();
  const reservations = input.reservations ?? [];

  return allKeys.map((dateKey) => {
    const plan = input.itineraryPlans?.dayPlans[dateKey];
    const rawNote =
      (plan?.notes ? plan.notes : "") ||
      (input.dayNotes?.[dateKey] ?? "").trim();
    const bullets = notesToBullets(rawNote);
    const location = plan?.location?.trim() || "";
    const dayNumber = narrativeTripDayNumber(dateKey, start);
    const prettyDate = formatNarrativePrettyDate(dateKey);
    const heading = [dayNumber ? `Day ${dayNumber}` : null, prettyDate, location || null]
      .filter(Boolean)
      .join(" · ");
    const hotelLine =
      plan?.hotelBooked && plan.hotelName.trim()
        ? `Hotel: ${plan.hotelName.trim()}${
            plan.hotelConfirmation ? ` (${plan.hotelConfirmation})` : ""
          }`
        : null;
    const bookingLines = reservations
      .filter((r) => reservationTouchesDay(r, dateKey))
      .map((r) => bookingLineForReservation(r))
      .filter((line): line is string => Boolean(line));

    return {
      dateKey,
      dayNumber,
      prettyDate,
      heading,
      location,
      hotelLine,
      bullets,
      bookingLines,
    };
  });
}

function hotelBlockHtml(hotels: NarrativeHotelStay[]): string {
  const stays = hotels.filter((h) => (h.type ?? "hotel") === "hotel");
  if (stays.length === 0) return "";
  const parts = stays.map((hotel) => {
    const name = reservationPropertyName({
      type: "hotel",
      title: hotel.title,
      provider: hotel.provider,
      location: hotel.location,
      notes: hotel.notes,
    });
    const checkIn = dateOnly(hotel.localTime);
    const checkOut = dateOnly(hotel.checkOutDate);
    const lines = [
      `<p class="stay-name">${escapeHtml(name)}</p>`,
      hotel.location ? `<p>${escapeHtml(hotel.location)}</p>` : "",
      checkIn || checkOut
        ? `<p>Check-in ${escapeHtml(checkIn || "—")} · Check-out ${escapeHtml(checkOut || "—")}</p>`
        : "",
      hotel.confirmationCode
        ? `<p>Confirmation ${escapeHtml(hotel.confirmationCode)}${
            hotel.provider && /booking|expedia|airbnb/i.test(hotel.provider)
              ? ` · via ${escapeHtml(hotel.provider)}`
              : ""
          }</p>`
        : "",
    ];
    return `<div class="stay">${lines.filter(Boolean).join("")}</div>`;
  });
  return `<section class="stay-section"><h2>Where you're staying</h2>${parts.join("")}</section>`;
}

export function buildNarrativeItineraryHtml(input: {
  tripName: string;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  destination?: string;
  itineraryPlans?: ItineraryPlansData | null;
  dayNotes?: Record<string, string>;
  hotels?: NarrativeHotelStay[];
  generatedAt?: string;
}): string {
  const start = dateOnly(input.tripStartDate);
  const end = dateOnly(input.tripEndDate);
  const sections = buildNarrativeDaySections({
    tripStartDate: input.tripStartDate,
    tripEndDate: input.tripEndDate,
    itineraryPlans: input.itineraryPlans,
    dayNotes: input.dayNotes,
    reservations: input.hotels,
  }).filter((section) => section.bullets.length > 0 || section.bookingLines.length > 0 || section.location);

  const daySections = sections
    .map((section) => {
      const hotelLine = section.hotelLine
        ? `<p class="day-hotel">${escapeHtml(section.hotelLine)}</p>`
        : "";
      const bookings =
        section.bookingLines.length > 0
          ? `<ul class="bookings">${section.bookingLines
              .map((b) => `<li>${escapeHtml(b)}</li>`)
              .join("")}</ul>`
          : "";
      const list =
        section.bullets.length > 0
          ? `<ul>${section.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
          : `<p class="empty">Open day — add plans in Kepi.</p>`;

      return `<section class="day"><h2>${escapeHtml(section.heading)}</h2>${hotelLine}${bookings}${list}</section>`;
    })
    .join("");

  const rangeLabel =
    start && end
      ? `${formatNarrativePrettyDate(start)} – ${formatNarrativePrettyDate(end)}`
      : "Trip dates";

  return [
    "<!DOCTYPE html><html><head><meta charset='utf-8'><title>",
    escapeHtml(input.tripName || "Trip itinerary"),
    "</title><style>",
    "@page { size: letter portrait; margin: 0.65in; }",
    "body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; margin: 0; background: #fff; line-height: 1.45; }",
    ".wrap { max-width: 720px; margin: 0 auto; padding: 8px 4px 32px; }",
    "h1 { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 26px; margin: 0 0 6px; color: #1d4ed8; }",
    ".sub { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #475569; margin: 0 0 18px; }",
    ".stay-section { border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 12px 0; margin-bottom: 18px; }",
    ".stay-section h2, .day h2 { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; margin: 0 0 8px; color: #0f172a; }",
    ".stay-name { font-weight: 700; margin: 0 0 4px; }",
    ".stay p { margin: 2px 0; font-size: 13px; }",
    ".day { margin: 0 0 18px; page-break-inside: avoid; }",
    ".day-hotel { font-size: 12px; color: #64748b; margin: 0 0 6px; }",
    "ul { margin: 0; padding-left: 1.15rem; }",
    "li { margin: 0 0 4px; font-size: 14px; }",
    ".empty { font-size: 13px; color: #94a3b8; font-style: italic; }",
    ".footer { margin-top: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 10px; color: #94a3b8; }",
    "@media print { body { background: #fff; } }",
    "</style></head><body><div class='wrap'>",
    `<h1>${escapeHtml(input.tripName || "Trip itinerary")}</h1>`,
    `<p class="sub">${escapeHtml(rangeLabel)}${
      input.destination ? ` · ${escapeHtml(input.destination)}` : ""
    }</p>`,
    hotelBlockHtml(input.hotels ?? []),
    daySections || "<p class='empty'>No day plans yet — forward a Word itinerary or add notes on Plan.</p>",
    `<p class="footer">Shared from Kepi Travel${
      input.generatedAt ? ` · ${escapeHtml(input.generatedAt)}` : ""
    }. Re-check the live trip before travel day.</p>`,
    "</div></body></html>",
  ].join("");
}
