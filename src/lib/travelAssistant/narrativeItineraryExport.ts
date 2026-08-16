/**
 * Friend-share day-plan PDF — narrative layout like Jeff's Puglia Word doc (not the logistics table).
 */

import { dedupeDayPlanBullets } from "@/lib/travelAssistant/dayPlanBulletGroups";
import type { ItineraryPlansData } from "@/lib/travelAssistant/itineraryDayPlan";
import {
  formatLetterDayHeading,
  isLetterActivityType,
  letterActivityFactsForDay,
  letterStayFactsForDay,
  splitLetterStayAndActivities,
} from "@/lib/travelAssistant/letterDayPlan";
import { preferDayActivityNote } from "@/lib/travelAssistant/planDayEdit";
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
  stayLines: string[];
  stayFacts: string[];
  activityFacts: string[];
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

/** Split day notes into lines without dedupe (used to detect stale duplicate imports). */
export function parseDayPlanBulletLines(notes: string): string[] {
  return sanitizeTravelerNotes(notes)
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*[•\-\*]\s*/u, "").trim())
    .filter(Boolean)
    .filter((line) => !/^stay in /iu.test(line) && !/^hotel:/iu.test(line));
}

export function notesToBullets(notes: string): string[] {
  return dedupeDayPlanBullets(parseDayPlanBulletLines(notes));
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
  if (reservation.type === "hotel" || isLetterActivityType(reservation.type)) {
    return null;
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
    const noteFromDays = (input.dayNotes?.[dateKey] ?? "").trim();
    const noteFromPlan = (plan?.notes ?? "").trim();
    const rawNote = preferDayActivityNote(noteFromPlan, noteFromDays);
    const rawBullets = notesToBullets(rawNote);
    const split = splitLetterStayAndActivities(rawBullets);
    const bullets = split.activityLines.filter(
      (line) => line.trim().toLowerCase() !== (plan?.dayHeading ?? "").trim().toLowerCase(),
    );
    const location = plan?.location?.trim() || "";
    const dayNumber = narrativeTripDayNumber(dateKey, start);
    const prettyDate = formatNarrativePrettyDate(dateKey);
    const heading = formatLetterDayHeading(dateKey, plan?.dayHeading);
    const hotelLine =
      plan?.hotelBooked && plan.hotelName.trim()
        ? `Hotel: ${plan.hotelName.trim()}${
            plan.hotelConfirmation ? ` (${plan.hotelConfirmation})` : ""
          }`
        : null;
    const bookingLines = reservations
      .filter((r) => (r.type ?? "") !== "hotel" && reservationTouchesDay(r, dateKey))
      .map((r) => bookingLineForReservation(r))
      .filter((line): line is string => Boolean(line));
    const stayFacts = letterStayFactsForDay(dateKey, reservations, input.itineraryPlans?.letterHeader);
    const activityFacts = letterActivityFactsForDay(dateKey, reservations);

    return {
      dateKey,
      dayNumber,
      prettyDate,
      heading,
      location,
      hotelLine,
      bullets,
      stayLines: split.stayLines,
      stayFacts,
      activityFacts,
      bookingLines,
    };
  });
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
  }).filter(
    (section) =>
      section.bullets.length > 0 ||
      section.bookingLines.length > 0 ||
      section.stayFacts.length > 0 ||
      section.activityFacts.length > 0 ||
      section.location,
  );

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
      const stayFacts =
        section.stayFacts.length > 0
          ? `<ul class="stay-facts">${section.stayFacts
              .map((line) => `<li>${escapeHtml(line)}</li>`)
              .join("")}</ul>`
          : "";
      const activityFacts =
        section.activityFacts.length > 0
          ? `<ul class="activity-facts">${section.activityFacts
              .map((line) => `<li>${escapeHtml(line)}</li>`)
              .join("")}</ul>`
          : "";
      const list =
        section.bullets.length > 0
          ? `<ul>${section.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
          : stayFacts || activityFacts || bookings
            ? ""
            : `<p class="empty">Open day — add plans in Kepi.</p>`;

      return `<section class="day"><h2>${escapeHtml(section.heading)}</h2>${hotelLine}${stayFacts}${bookings}${activityFacts}${list}</section>`;
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
    daySections || "<p class='empty'>No day plans yet — forward a Word itinerary or add notes on Plan.</p>",
    `<p class="footer">Shared from Kepi Travel${
      input.generatedAt ? ` · ${escapeHtml(input.generatedAt)}` : ""
    }. Re-check the live trip before travel day.</p>`,
    "</div></body></html>",
  ].join("");
}
