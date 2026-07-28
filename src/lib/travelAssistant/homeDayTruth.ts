/**
 * Home “single voice” helpers — calm connection status + travel-day gates.
 * Never invent arrival clocks (F3); incomplete schedules stay quiet.
 */

import { buildTripTransportRoute, type TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";

/** Show terminal explore promo only within this window of departure. */
export const TERMINAL_EXPLORE_WINDOW_MS = 48 * 60 * 60 * 1000;

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
      line: n === 1 ? "One connection needs a quick look." : `${n} connections need a quick look.`,
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

    const gapMins = Math.round((next.departMs - prev.arriveMs) / 60_000);
    if (gapMins < 0) {
      return { kind: "conflict", line: "One connection needs a quick look." };
    }
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
