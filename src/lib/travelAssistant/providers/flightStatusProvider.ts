/**
 * Flight status provider — AeroDataBox primary, optional FlightAware AeroAPI secondary.
 * Background polling uses merged snapshots; discrepancies are logged for calibration.
 */

import type { TravelUpdateProvider, TravelUpdateEvent, UpdatableReservation } from "@/lib/travelAssistant/travelUpdateTypes";
import { fetchMergedFlightStatusSnapshot, snapshotToUpdateKind } from "@/lib/travelAssistant/flightStatusLookup";
import { resolveAeroDataBoxApiKey } from "@/lib/travelAssistant/flightStatusSources/aeroDataBoxSource";
import type { MergedFlightStatusSnapshot } from "@/lib/travelAssistant/flightStatusMerge";

function flightDate(reservation: UpdatableReservation): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(reservation.localTime?.trim() ?? "");
  return m?.[1] ?? new Date().toISOString().slice(0, 10);
}

function extractFlightNumber(reservation: UpdatableReservation): string | null {
  const r = reservation as unknown as Record<string, unknown>;
  const fn = (r.flightNumber ?? r.flight_number ?? r.flightIata ?? "") as string;
  if (fn?.trim()) return fn.trim().replace(/\s+/g, "").toUpperCase();
  const m = /\b([A-Z]{2}\d{3,4})\b/.exec(reservation.title?.toUpperCase() ?? "");
  return m?.[1] ?? null;
}

function toEvent(reservation: UpdatableReservation, snapshot: MergedFlightStatusSnapshot): TravelUpdateEvent {
  const kind = snapshotToUpdateKind(snapshot);
  const effectiveDelay = snapshot.delayMinutes ?? (kind === "delay" ? 30 : 0);
  const gateNote = snapshot.departureGate
    ? ` · Gate ${snapshot.departureGate}${snapshot.departureTerminal ? `, Terminal ${snapshot.departureTerminal}` : ""}`
    : "";
  const route =
    snapshot.departureAirport && snapshot.arrivalAirport
      ? `${snapshot.departureAirport}→${snapshot.arrivalAirport}`
      : "";

  if (kind === "cancellation") {
    return {
      provider: "flight-status-provider",
      kind: "cancellation",
      severity: "critical",
      summary: `${reservation.title} cancelled`,
      detail: `Live flight data reports cancellation. ${route}${gateNote}. Contact airline immediately.`,
      target: { reservationType: "flight", confirmationCode: reservation.confirmationCode, titleHint: reservation.title },
    };
  }

  if (kind === "delay" || effectiveDelay >= 15) {
    const severity = effectiveDelay >= 45 ? "critical" : "warning";
    return {
      provider: "flight-status-provider",
      kind: "delay",
      severity,
      summary: `${reservation.title} delayed ${effectiveDelay} min`,
      detail: `Live flight data reports ${effectiveDelay}-minute delay. ${route}${gateNote}.`,
      target: { reservationType: "flight", confirmationCode: reservation.confirmationCode, titleHint: reservation.title },
      delayMinutes: effectiveDelay,
    };
  }

  return {
    provider: "flight-status-provider",
    kind: "on-time",
    severity: "info",
    summary: `${reservation.title} on time${snapshot.departureGate ? ` · Gate ${snapshot.departureGate}` : ""}`,
    detail: `Live flight data: on time. ${route}${gateNote}.`,
    target: { reservationType: "flight", confirmationCode: reservation.confirmationCode, titleHint: reservation.title },
    ...(snapshot.departureGate
      ? {
          updatedLocation: [
            snapshot.departureTerminal ? `Terminal ${snapshot.departureTerminal}` : "",
            `Gate ${snapshot.departureGate}`,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : {}),
  };
}

function mockUpdate(reservation: UpdatableReservation): TravelUpdateEvent {
  return {
    provider: "flight-status-provider",
    kind: "on-time",
    severity: "info",
    summary: `${reservation.title} — status unavailable (no API key)`,
    detail: "Set AERODATABOX_API_KEY in Vercel environment variables to enable live flight alerts.",
    target: { reservationType: "flight", confirmationCode: reservation.confirmationCode, titleHint: reservation.title },
  };
}

export function createFlightStatusProviderFromEnv(): TravelUpdateProvider {
  return {
    name: "flight-status-provider",
    async fetchUpdates(args) {
      const flights = args.reservations.filter((reservation) => reservation.type === "flight");
      if (flights.length === 0) return [];

      if (!resolveAeroDataBoxApiKey()) {
        return flights.map(mockUpdate);
      }

      const updates: TravelUpdateEvent[] = [];
      const nowMs = Date.parse(args.nowIso);

      for (const reservation of flights) {
        const flightNum = extractFlightNumber(reservation);
        if (!flightNum) continue;

        try {
          const merged = await fetchMergedFlightStatusSnapshot({
            flightNumber: flightNum,
            flightDate: flightDate(reservation),
            nowMs: Number.isNaN(nowMs) ? Date.now() : nowMs,
          });
          if (merged) {
            updates.push(toEvent(reservation, merged));
          }
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `[flightStatusProvider] ${flightNum} lookup failed:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }

      return updates;
    },
  };
}
