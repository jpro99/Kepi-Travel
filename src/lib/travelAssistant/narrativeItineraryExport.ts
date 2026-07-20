/**
 * Friend-share day-plan PDF — narrative layout like Jeff's Puglia Word doc (not the logistics table).
 */

import { dayPlanToNote, type ItineraryPlansData } from "@/lib/travelAssistant/itineraryDayPlan";
import { reservationPropertyName } from "@/lib/travelAssistant/reservationDisplayLabel";
import { dateOnly } from "@/lib/travelAssistant/tripWindow";

export interface NarrativeHotelStay {
  type?: string;
  title?: string;
  provider?: string;
  localTime?: string;
  checkOutDate?: string;
  location?: string;
  confirmationCode?: string;
  notes?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function listDayKeys(tripStart: string | null | undefined, tripEnd: string | null | undefined): string[] {
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

function formatPrettyDate(dateKey: string): string {
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

function tripDayNumber(dateKey: string, tripStart: string | null | undefined): number | null {
  const start = dateOnly(tripStart);
  if (!start) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const dayMs = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(dayMs)) return null;
  return Math.floor((dayMs - startMs) / 86_400_000) + 1;
}

function notesToBullets(notes: string): string[] {
  return notes
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*[•\-\*]\s*/u, "").trim())
    .filter(Boolean);
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
  const dayKeysFromWindow = listDayKeys(start, end);
  const planKeys = Object.keys(input.itineraryPlans?.dayPlans ?? {});
  const noteKeys = Object.keys(input.dayNotes ?? {}).filter((k) => (input.dayNotes?.[k] ?? "").trim());
  const allKeys = [...new Set([...dayKeysFromWindow, ...planKeys, ...noteKeys])].sort();

  const daySections = allKeys
    .map((dateKey) => {
      const plan = input.itineraryPlans?.dayPlans[dateKey];
      const note =
        (plan ? dayPlanToNote(plan) : "") ||
        (input.dayNotes?.[dateKey] ?? "").trim();
      if (!note && !plan?.location) return "";
      const bullets = notesToBullets(plan?.notes || note.replace(/^Stay in .+$/imu, "").trim());
      const location = plan?.location?.trim() || "";
      const dayNum = tripDayNumber(dateKey, start);
      const heading = [
        dayNum ? `Day ${dayNum}` : null,
        formatPrettyDate(dateKey),
        location || null,
      ]
        .filter(Boolean)
        .join(" · ");

      const hotelLine =
        plan?.hotelBooked && plan.hotelName.trim()
          ? `<p class="day-hotel">Hotel: ${escapeHtml(plan.hotelName.trim())}${
              plan.hotelConfirmation ? ` (${escapeHtml(plan.hotelConfirmation)})` : ""
            }</p>`
          : "";

      const list =
        bullets.length > 0
          ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
          : `<p class="empty">Open day — add plans in Kepi.</p>`;

      return `<section class="day"><h2>${escapeHtml(heading)}</h2>${hotelLine}${list}</section>`;
    })
    .filter(Boolean)
    .join("");

  const rangeLabel =
    start && end
      ? `${formatPrettyDate(start)} – ${formatPrettyDate(end)}`
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
