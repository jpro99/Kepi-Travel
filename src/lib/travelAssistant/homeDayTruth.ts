/**
 * Home “single voice” helpers — calm connection status + travel-day gates.
 * Never invent arrival clocks (F3); incomplete schedules stay quiet.
 */

import { buildTripTransportRoute, type TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import { connectionConflictCalmLine } from "@/lib/travelAssistant/disruptionCalm";
import { buildEntryGuidanceItems } from "@/lib/travelAssistant/tripOrchestration";

/** Show terminal explore promo only within this window of departure. */
export const TERMINAL_EXPLORE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Same-airport hops longer than this are not “connections” — hide calm OK line. */
export const MAX_CONNECTION_CALM_MS = 8 * 60 * 60 * 1000;

export function shouldShowTerminalExplorePromo(
  departureUtcMs: number | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (departureUtcMs == null || !Number.isFinite(departureUtcMs)) return false;
  const until = departureUtcMs - nowMs;
  return until >= -2 * 60 * 60 * 1000 && until <= TERMINAL_EXPLORE_WINDOW_MS;
}

export type ConnectionCalmKind = "ok" | "conflict" | "incomplete" | "none";

export interface ConnectionCalmStatus {
  kind: ConnectionCalmKind;
  line: string | null;
}

/**
 * Plain-English connection status for Home.
 * Conflicts only when both sides have real times; blank arrival → incomplete, not panic.
 */
export function buildConnectionCalmStatus(
  reservations: TransportRouteReservation[],
  nowMs = Date.now(),
): ConnectionCalmStatus {
  const transport = reservations.filter((r) =>
    ["flight", "train", "ride"].includes((r.type ?? "").toLowerCase()),
  );
  if (transport.length < 2) {
    return { kind: "none", line: null };
  }

  const route = buildTripTransportRoute(transport);
  if (route.summary.conflicts > 0) {
    const n = route.summary.conflicts;
    return {
      kind: "conflict",
      line: connectionConflictCalmLine(n),
    };
  }

  const booked = route.segments
    .filter((s) => s.booked && s.fromCode !== "???" && s.toCode !== "???")
    .sort((a, b) => (a.departMs ?? 0) - (b.departMs ?? 0));

  for (let i = 0; i < booked.length - 1; i += 1) {
    const prev = booked[i]!;
    const next = booked[i + 1]!;
    if (prev.toCode !== next.fromCode) continue;
    if (next.departMs != null && next.departMs < nowMs - 60 * 60_000) continue;

    if (prev.arriveMs == null || next.departMs == null) {
      return {
        kind: "incomplete",
        line: `${prev.toCode} connection — add arrival time to confirm the layover.`,
      };
    }

    const gapMs = next.departMs - prev.arriveMs;
    const gapMins = Math.round(gapMs / 60_000);
    if (gapMins < 0) {
      return { kind: "conflict", line: connectionConflictCalmLine(1) };
    }
    // Multi-day same-airport hops (e.g. ~136h) are not connections — stay quiet.
    if (gapMs > MAX_CONNECTION_CALM_MS) continue;
    const hours = Math.floor(gapMins / 60);
    const mins = gapMins % 60;
    const gapLabel =
      hours > 0 ? (mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`) : `~${mins}m`;
    return {
      kind: "ok",
      line: `${prev.toCode} connection looks fine (${gapLabel}).`,
    };
  }

  return { kind: "none", line: null };
}

/** True when Home should lead with travel-day / in-journey chrome. */
export function isTravelDayTakeover(phase: JourneyPhase, openAirportMode: boolean): boolean {
  if (phase.kind === "airborne" || phase.kind === "just-landed") return true;
  return openAirportMode;
}

/** Hide connection / next-flight “today” chrome when trip is still weeks out (I43). */
export const PREP_MODE_MIN_DAYS = 14;

export type HomePrepBand = "far" | "getting_ready" | "final_week" | "travel_window";

export function resolveHomePrepBand(daysUntilDeparture: number | null | undefined): HomePrepBand {
  if (daysUntilDeparture == null || !Number.isFinite(daysUntilDeparture)) return "travel_window";
  if (daysUntilDeparture > 30) return "far";
  if (daysUntilDeparture > PREP_MODE_MIN_DAYS) return "getting_ready";
  if (daysUntilDeparture > 6) return "final_week";
  return "travel_window";
}

export function shouldShowTravelOpsChrome(daysUntilDeparture: number | null | undefined): boolean {
  return resolveHomePrepBand(daysUntilDeparture) === "travel_window";
}

export interface HomePrepWatchItem {
  id: string;
  title: string;
  detail: string;
  href?: string;
}

/**
 * Prep-mode Watch items when departure is still weeks away.
 * Visa/entry is guidance with an official link — never invented legal advice.
 */
export function buildHomePrepWatchItems(input: {
  daysUntilDeparture: number | null | undefined;
  destination?: string | null;
  hotelCities?: string[];
  staysComplete?: boolean;
  missingPriceCount?: number;
  passportComplete?: boolean;
}): HomePrepWatchItem[] {
  const band = resolveHomePrepBand(input.daysUntilDeparture);
  if (band === "travel_window") return [];

  const days = input.daysUntilDeparture ?? 0;
  const items: HomePrepWatchItem[] = [];

  if (band === "far" || band === "getting_ready") {
    items.push({
      id: "prep-countdown",
      title:
        days > 30
          ? `Trip in about ${Math.round(days / 7)} weeks — prep mode`
          : `${days} days until departure — getting ready`,
      detail: "Not travel day yet. Focus on documents and trip completeness, not gates or connections.",
    });
  } else if (band === "final_week") {
    items.push({
      id: "prep-final-week",
      title: `Final week · ${days} day${days === 1 ? "" : "s"} out`,
      detail: "Confirm stays, transfers, and offline apps. Flight connection checks move here soon.",
    });
  }

  for (const entry of buildEntryGuidanceItems({
    destination: input.destination,
    hotelCities: input.hotelCities,
    daysUntilDeparture: input.daysUntilDeparture,
    passportComplete: input.passportComplete,
  })) {
    items.push({
      id: entry.id,
      title: entry.title,
      detail: entry.detail,
      href: entry.href,
    });
  }

  if (input.staysComplete) {
    items.push({
      id: "prep-stays-set",
      title: "Flights and stays look set",
      detail: "Nice — keep forwarding anything new so the timeline stays accurate.",
    });
  }

  if ((input.missingPriceCount ?? 0) > 0) {
    items.push({
      id: "prep-pricing",
      title: `${input.missingPriceCount} booking${input.missingPriceCount === 1 ? "" : "s"} still need a price logged`,
      detail: "Tap the spend badge to see which ones and fill cash or miles.",
    });
  }

  return items.slice(0, 5);
}
