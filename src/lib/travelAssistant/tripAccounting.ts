/**
 * Cross-trip spend accounting — per-trip ledgers and lifetime totals for family records / taxes.
 */

import { formatTripDateRange, formatTripListTitle } from "@/lib/travelAssistant/tripListDisplay";
import { reservationDisplayLabel } from "@/lib/travelAssistant/reservationDisplayLabel";
import { dateOnly } from "@/lib/travelAssistant/tripWindow";
import {
  buildTripSpendLineItems,
  computeTripSpend,
  type TripSpendLineItem,
  type TripSpendReservation,
  type TripSpendSummary,
} from "@/lib/travelAssistant/tripSpendSummary";

export interface TripAccountingTripInput {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  reservations: TripSpendReservation[];
}

export interface TripAccountingRow {
  tripId: string;
  tripLabel: string;
  tripDates: string;
  destination: string;
  summary: TripSpendSummary;
  lineItems: TripSpendLineItem[];
  isPast: boolean;
  isActive: boolean;
}

export interface LifetimeAccountingSummary {
  cashTotalUsd: number;
  pointsTotal: number;
  tripCount: number;
  tripsWithSpendCount: number;
  missingPriceCount: number;
  trips: TripAccountingRow[];
}

export const EMPTY_LIFETIME_ACCOUNTING: LifetimeAccountingSummary = {
  cashTotalUsd: 0,
  pointsTotal: 0,
  tripCount: 0,
  tripsWithSpendCount: 0,
  missingPriceCount: 0,
  trips: [],
};

export function formatLedgerLineLabel(reservation: TripSpendReservation): string {
  if ((reservation.type ?? "").toLowerCase() === "flight") {
    const fn = reservation.flightNumber?.trim();
    const route = [reservation.flightDepartureAirport, reservation.flightArrivalAirport]
      .filter(Boolean)
      .join(" → ");
    if (fn && route) return `${fn} · ${route}`;
    if (route) return route;
    if (fn) return fn;
  }
  return reservationDisplayLabel({
    type: reservation.type ?? "other",
    title: reservation.title,
    provider: undefined,
    location: undefined,
    notes: reservation.notes,
    flightDepartureAirport: reservation.flightDepartureAirport,
    flightArrivalAirport: reservation.flightArrivalAirport,
  });
}

export function enrichTripSpendLineItems(reservations: TripSpendReservation[]): TripSpendLineItem[] {
  return buildTripSpendLineItems(reservations).map((item) => {
    const reservation = reservations.find((r) => r.id === item.id);
    return {
      ...item,
      label: reservation ? formatLedgerLineLabel(reservation) : item.title,
      confirmationCode: reservation?.confirmationCode?.trim() || undefined,
    };
  });
}

function tripEndMs(endDate: string): number {
  const day = dateOnly(endDate);
  if (!day) return Number.NaN;
  return Date.parse(`${day}T23:59:59Z`);
}

export function computeTripAccountingRow(
  trip: TripAccountingTripInput,
  options?: { activeTripId?: string | null; nowMs?: number },
): TripAccountingRow {
  const nowMs = options?.nowMs ?? Date.now();
  const endMs = tripEndMs(trip.endDate);
  const isPast = Number.isFinite(endMs) ? endMs < nowMs - 24 * 60 * 60_000 : false;
  const summary = computeTripSpend(trip.reservations);
  return {
    tripId: trip.id,
    tripLabel: formatTripListTitle(trip),
    tripDates: formatTripDateRange(trip.startDate, trip.endDate),
    destination: trip.destination?.trim() || "",
    summary,
    lineItems: enrichTripSpendLineItems(trip.reservations),
    isPast,
    isActive: trip.id === options?.activeTripId,
  };
}

export function computeLifetimeAccounting(
  trips: TripAccountingTripInput[],
  activeTripId: string | null,
  nowMs = Date.now(),
): LifetimeAccountingSummary {
  const rows = trips
    .filter((trip) => trip.reservations.length > 0)
    .map((trip) => computeTripAccountingRow(trip, { activeTripId, nowMs }))
    .sort((a, b) => {
      const aEnd = dateOnly(trips.find((t) => t.id === a.tripId)?.endDate ?? "") ?? "";
      const bEnd = dateOnly(trips.find((t) => t.id === b.tripId)?.endDate ?? "") ?? "";
      return bEnd.localeCompare(aEnd) || a.tripLabel.localeCompare(b.tripLabel);
    });

  let cashTotalUsd = 0;
  let pointsTotal = 0;
  let tripsWithSpendCount = 0;
  let missingPriceCount = 0;

  for (const row of rows) {
    cashTotalUsd += row.summary.cashTotalUsd;
    pointsTotal += row.summary.pointsTotal;
    if (row.summary.cashTotalUsd > 0 || row.summary.pointsTotal > 0) {
      tripsWithSpendCount += 1;
    }
    missingPriceCount += row.summary.missingPriceCount;
  }

  return {
    cashTotalUsd,
    pointsTotal,
    tripCount: rows.length,
    tripsWithSpendCount,
    missingPriceCount,
    trips: rows,
  };
}

const LEDGER_TYPE_ORDER = ["flight", "hotel", "train", "ride", "dinner", "other"];

export function groupLedgerLineItems(items: TripSpendLineItem[]): Array<{ type: string; label: string; items: TripSpendLineItem[] }> {
  const buckets = new Map<string, TripSpendLineItem[]>();
  for (const item of items) {
    const type = (item.type ?? "other").toLowerCase();
    const list = buckets.get(type) ?? [];
    list.push(item);
    buckets.set(type, list);
  }

  return LEDGER_TYPE_ORDER.filter((type) => buckets.has(type)).map((type) => ({
    type,
    label: ledgerSectionLabel(type),
    items: buckets.get(type) ?? [],
  }));
}

function ledgerSectionLabel(type: string): string {
  if (type === "flight") return "Flights";
  if (type === "hotel") return "Stays";
  if (type === "train") return "Trains";
  if (type === "ride") return "Rides";
  if (type === "dinner") return "Activities";
  return "Other";
}

/** CSV export for tax / family accounting records. */
export function buildTripLedgerCsv(accounting: LifetimeAccountingSummary): string {
  const lines: string[] = [
    "Trip,Destination,Dates,Category,Item,Confirmation,Cash USD,Points,Needs Price",
  ];

  for (const trip of accounting.trips) {
    for (const item of trip.lineItems) {
      const label = "label" in item && typeof item.label === "string" ? item.label : item.title;
      const confirmation =
        "confirmationCode" in item && typeof item.confirmationCode === "string" ? item.confirmationCode : "";
      lines.push(
        [
          csvCell(trip.tripLabel),
          csvCell(trip.destination),
          csvCell(trip.tripDates),
          csvCell(item.type),
          csvCell(label),
          csvCell(confirmation),
          item.cashUsd != null ? String(item.cashUsd) : "",
          item.points != null ? String(item.points) : "",
          item.needsPrice ? "yes" : "no",
        ].join(","),
      );
    }
  }

  lines.push("");
  lines.push(
    [
      "LIFETIME TOTAL",
      "",
      "",
      "",
      "",
      "",
      String(accounting.cashTotalUsd),
      String(accounting.pointsTotal),
      accounting.missingPriceCount > 0 ? `${accounting.missingPriceCount} items need price` : "",
    ].join(","),
  );

  return lines.join("\n");
}

function csvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
