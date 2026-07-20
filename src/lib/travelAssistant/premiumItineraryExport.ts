/**
 * Premium static itinerary HTML / CSV for Print + PDF.
 * Day column (not Owner), no timezone, chronological order, type colors, dense print.
 */

import { reservationPropertyName } from "@/lib/travelAssistant/reservationDisplayLabel";
import {
  canonicalFlightDepartureLocalTime,
  dateOnly,
  reservationPrimaryDate,
} from "@/lib/travelAssistant/tripWindow";

export interface PremiumExportReservation {
  type: string;
  title: string;
  provider: string;
  localTime: string;
  location?: string;
  confirmationCode?: string;
  notes?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  checkOutDate?: string;
}

export interface PremiumExportRow {
  dayLabel: string;
  dayNumber: number | null;
  dateKey: string;
  itemType: string;
  typeKey: string;
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmation: string;
  notes: string;
  sortKey: string;
}

const TYPE_LABEL: Record<string, string> = {
  flight: "Flight",
  hotel: "Hotel",
  train: "Train",
  ride: "Ride",
  dinner: "Activity",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function parseLocalSortKey(reservation: PremiumExportReservation): string {
  if (reservation.type === "flight") {
    const canonical = canonicalFlightDepartureLocalTime(reservation);
    if (canonical) return canonical.slice(0, 16);
  }
  const local = reservation.localTime?.trim().replace("T", " ") ?? "";
  if (/^\d{4}-\d{2}-\d{2}/u.test(local)) {
    return local.length >= 16 ? local.slice(0, 16) : `${local.slice(0, 10)} 12:00`;
  }
  return "9999-12-31 23:59";
}

/** Days between trip start and event date (1-based). Negative/zero when before trip start. */
export function tripDayNumber(dateKey: string, tripStartDate: string | null | undefined): number | null {
  const start = dateOnly(tripStartDate);
  const day = dateOnly(dateKey);
  if (!start || !day) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const dayMs = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(dayMs)) return null;
  return Math.floor((dayMs - startMs) / 86_400_000) + 1;
}

export function formatTripDayLabel(dateKey: string, tripStartDate: string | null | undefined): string {
  const day = dateOnly(dateKey);
  if (!day) return "—";
  const parsed = Date.parse(`${day}T12:00:00Z`);
  const pretty = Number.isNaN(parsed)
    ? day
    : new Date(parsed).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
  const n = tripDayNumber(day, tripStartDate);
  if (n === null) return pretty;
  if (n < 1) return `${pretty} · before Day 1`;
  return `Day ${n} · ${pretty}`;
}

/**
 * Drop obvious junk dates (e.g. 2018 voucher bleed) when the trip window is known.
 * Keeps items from 14 days before start through 3 days after end.
 */
export function isWithinTripExportWindow(
  dateKey: string,
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
): boolean {
  const day = dateOnly(dateKey);
  if (!day) return true;
  const start = dateOnly(tripStartDate);
  const end = dateOnly(tripEndDate);
  if (!start && !end) return true;
  const dayMs = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(dayMs)) return true;
  if (start) {
    const startMs = Date.parse(`${start}T00:00:00Z`);
    if (!Number.isNaN(startMs) && dayMs < startMs - 14 * 86_400_000) return false;
  }
  if (end) {
    const endMs = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isNaN(endMs) && dayMs > endMs + 3 * 86_400_000) return false;
  }
  return true;
}

export function buildPremiumExportRows(
  reservations: PremiumExportReservation[],
  options: {
    tripStartDate?: string | null;
    tripEndDate?: string | null;
    /** When true (default), drop dates far outside the trip window. */
    filterOutsideTripWindow?: boolean;
  } = {},
): PremiumExportRow[] {
  const tripStart = options.tripStartDate ?? null;
  const tripEnd = options.tripEndDate ?? null;
  const filterWindow = options.filterOutsideTripWindow !== false;

  const rows: PremiumExportRow[] = [];
  for (const reservation of reservations) {
    const sortKey = parseLocalSortKey(reservation);
    const dateKey = reservationPrimaryDate(reservation) || dateOnly(sortKey);
    if (filterWindow && !isWithinTripExportWindow(dateKey, tripStart, tripEnd)) {
      continue;
    }
    const typeKey = reservation.type.trim().toLowerCase() || "other";
    const title =
      typeKey === "hotel"
        ? reservationPropertyName({
            type: "hotel",
            title: reservation.title,
            provider: reservation.provider,
            location: reservation.location,
            notes: reservation.notes,
          })
        : reservation.title?.trim() || reservation.provider || "Reservation";

    rows.push({
      dayLabel: formatTripDayLabel(dateKey, tripStart),
      dayNumber: tripDayNumber(dateKey, tripStart),
      dateKey,
      itemType: TYPE_LABEL[typeKey] ?? reservation.type,
      typeKey,
      title,
      provider: reservation.provider?.trim() || "",
      localTime: sortKey === "9999-12-31 23:59" ? reservation.localTime?.trim() || "" : sortKey,
      location: reservation.location?.trim() || "",
      confirmation: reservation.confirmationCode?.trim() || "",
      notes: reservation.notes?.trim() || "",
      sortKey,
    });
  }

  rows.sort((a, b) => {
    if (a.sortKey === b.sortKey) return a.title.localeCompare(b.title);
    return a.sortKey.localeCompare(b.sortKey);
  });
  return rows;
}

export function buildPremiumItineraryCsv(rows: PremiumExportRow[]): string {
  const header = [
    "Day",
    "Type",
    "Title",
    "Provider",
    "Local Time",
    "Location",
    "Confirmation",
    "Notes",
  ];
  const body = rows.map((row) =>
    [
      row.dayLabel,
      row.itemType,
      row.title,
      row.provider,
      row.localTime,
      row.location,
      row.confirmation,
      row.notes,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...body].join("\n");
}

export function buildPremiumItineraryHtml({
  rows,
  generatedAt,
  stageLabel,
  statusLabel,
  confidenceScore,
  scopeLabel,
}: {
  rows: PremiumExportRow[];
  generatedAt: string;
  stageLabel: string;
  statusLabel: string;
  confidenceScore: number | null;
  scopeLabel: string;
}): string {
  const tableRows = rows
    .map((row) => {
      return `<tr class="type-${escapeHtml(row.typeKey)}">
        <td class="day">${escapeHtml(row.dayLabel)}</td>
        <td class="type"><span class="type-pill type-pill-${escapeHtml(row.typeKey)}">${escapeHtml(row.itemType)}</span></td>
        <td>${escapeHtml(row.title)}</td>
        <td>${escapeHtml(row.provider)}</td>
        <td class="time">${escapeHtml(row.localTime)}</td>
        <td>${escapeHtml(row.location)}</td>
        <td class="conf">${escapeHtml(row.confirmation)}</td>
        <td class="notes">${escapeHtml(row.notes)}</td>
      </tr>`;
    })
    .join("");

  const confidenceMarkup =
    confidenceScore === null
      ? ""
      : `<span class="chip">Confidence score: ${Math.round(confidenceScore)}</span>`;

  return [
    "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Travel Itinerary</title>",
    "<style>",
    "@page { size: letter landscape; margin: 0.4in; }",
    "*, *::before, *::after { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; }",
    "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; background: #0F1923; -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
    ".wrap { padding: 16px; background: #0F1923; min-height: 100vh; }",
    ".hero { border-radius: 14px; background: linear-gradient(135deg, #0F1923 0%, #1a2a3a 55%, #0F1923 100%); color: #e2e8f0; padding: 14px 16px; border: 1px solid rgba(244,201,93,0.35); }",
    ".hero h1 { margin: 0 0 4px; font-size: 18px; font-weight: 800; color: #fff; }",
    ".hero p { margin: 0; font-size: 11px; color: #94a3b8; }",
    ".chips { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }",
    ".chip { display: inline-block; font-size: 10px; background: rgba(244,201,93,0.12); border: 1px solid rgba(244,201,93,0.35); border-radius: 999px; padding: 3px 8px; color: #f4c95d; }",
    ".section { margin-top: 12px; border-radius: 12px; background: #ffffff; padding: 12px; }",
    ".section h2 { margin: 0 0 4px; font-size: 12px; color: #0f172a; }",
    ".meta { margin: 0 0 8px; font-size: 10px; color: #64748b; line-height: 1.35; }",
    "table { width: 100%; border-collapse: collapse; table-layout: fixed; }",
    "th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; font-size: 10px; vertical-align: top; line-height: 1.3; word-wrap: break-word; overflow-wrap: anywhere; }",
    "th { background: #0F1923; color: #f4c95d; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }",
    "td.day { width: 12%; font-weight: 700; color: #0F1923; white-space: normal; }",
    "td.type { width: 7%; }",
    "td.time { width: 11%; font-variant-numeric: tabular-nums; white-space: nowrap; }",
    "td.conf { width: 9%; font-family: ui-monospace, monospace; font-size: 9px; }",
    "td.notes { width: 22%; font-size: 9px; color: #334155; }",
    ".type-pill { display: inline-block; border-radius: 999px; padding: 2px 7px; font-size: 9px; font-weight: 800; }",
    ".type-pill-flight { background: #dbeafe; color: #1d4ed8; }",
    ".type-pill-hotel { background: #fef3c7; color: #b45309; }",
    ".type-pill-train { background: #ede9fe; color: #6d28d9; }",
    ".type-pill-ride { background: #d1fae5; color: #047857; }",
    ".type-pill-dinner, .type-pill-activity { background: #ffe4e6; color: #be123c; }",
    "tr.type-flight td { background: #eff6ff; }",
    "tr.type-hotel td { background: #fffbeb; }",
    "tr.type-train td { background: #f5f3ff; }",
    "tr.type-ride td { background: #ecfdf5; }",
    "tr.type-dinner td, tr.type-activity td { background: #fff1f2; }",
    "tfoot td { font-size: 9px; color: #64748b; background: #f8fafc; }",
    "@media print {",
    "  body, .wrap { background: #fff !important; }",
    "  .wrap { padding: 0; }",
    "  .hero { border-radius: 8px; padding: 10px 12px; }",
    "  .hero h1 { font-size: 16px; }",
    "  .section { margin-top: 8px; padding: 8px; border: 1px solid #e2e8f0; }",
    "  th, td { padding: 3px 4px; font-size: 9px; }",
    "  td.notes { font-size: 8px; }",
    "  .type-pill { font-size: 8px; padding: 1px 5px; }",
    "  tr.type-flight td, tr.type-hotel td, tr.type-train td, tr.type-ride td, tr.type-dinner td, th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
    "}",
    "</style></head><body>",
    "<div class='wrap'>",
    "<div class='hero'>",
    "<h1>Adaptive Travel Assistant</h1>",
    "<p>Trip itinerary — day-by-day logistics snapshot.</p>",
    "<div class='chips'>",
    `<span class='chip'>Generated: ${escapeHtml(generatedAt)}</span>`,
    `<span class='chip'>Stage: ${escapeHtml(stageLabel)}</span>`,
    `<span class='chip'>Status: ${escapeHtml(statusLabel)}</span>`,
    `<span class='chip'>Scope: ${escapeHtml(scopeLabel)}</span>`,
    confidenceMarkup,
    "</div></div>",
    "<div class='section'>",
    "<h2>How to read this</h2>",
    "<p class='meta'>Rows are chronological. Blue = flight, amber = hotel, purple = train, green = ride. Day numbers count from your trip start. Re-check the live app before check-in, gate changes, and transfers.</p>",
    "<table>",
    "<thead><tr><th>Day</th><th>Type</th><th>Title</th><th>Provider</th><th>Local Time</th><th>Location</th><th>Confirmation</th><th>Notes</th></tr></thead>",
    `<tbody>${tableRows}</tbody>`,
    `<tfoot><tr><td colspan='8'>${rows.length} items · flights and hotels color-coded · timezone omitted for readability</td></tr></tfoot>`,
    "</table></div></div></body></html>",
  ].join("");
}
