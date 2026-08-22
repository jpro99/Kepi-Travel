/**
 * Connection playbook lite — step list from booked facts (G47).
 * Not Flighty-grade gate prediction; honest checklist for same-airport connections.
 */

import { resolveAirport } from "@/lib/airports/lookup";
import { isInternationalArrivalFlight } from "@/lib/travelAssistant/airportDayCoach";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import { buildTripTransportRoute } from "@/lib/travelAssistant/tripTransportRoute";

type ConnectionFlightReservation = TransportRouteReservation & {
  flightDepartureGate?: string;
  flightArrivalTerminal?: string;
  flightDepartureTerminal?: string;
};

export type ConnectionRisk = "relaxed" | "normal" | "tight" | "impossible";

export interface ConnectionPlaybookStep {
  id: string;
  icon: string;
  text: string;
  detail?: string;
}

export interface ConnectionPlaybook {
  hubIata: string;
  inboundFlight: string | null;
  outboundFlight: string | null;
  risk: ConnectionRisk;
  gapMinutes: number | null;
  steps: ConnectionPlaybookStep[];
  issueLine: string | null;
}


function classifyRisk(gapMinutes: number | null, issueLine: string | null): ConnectionRisk {
  if (issueLine?.includes("Can't make")) return "impossible";
  if (gapMinutes == null || !Number.isFinite(gapMinutes)) return "normal";
  if (gapMinutes < 0) return "impossible";
  if (gapMinutes < 60) return "tight";
  if (gapMinutes >= 120) return "relaxed";
  return "normal";
}

function isDomesticFlight(depIata: string, arrIata: string): boolean {
  const dep = resolveAirport(depIata);
  const arr = resolveAirport(arrIata);
  if (!dep?.country || !arr?.country) return false;
  return dep.country.toUpperCase() === arr.country.toUpperCase();
}

/** Build connection steps when inbound lands and outbound departs same IATA. */
export function buildConnectionPlaybook(
  reservations: ConnectionFlightReservation[],
  nowMs = Date.now(),
): ConnectionPlaybook | null {
  const route = buildTripTransportRoute(reservations);
  const flights = route.segments.filter((s) => s.kind === "flight" && s.booked);
  if (flights.length < 2) return null;

  for (let i = 0; i < flights.length - 1; i++) {
    const inbound = flights[i]!;
    const outbound = flights[i + 1]!;
    if (inbound.toCode !== outbound.fromCode) continue;
    if (inbound.toCode === "???" || outbound.fromCode === "???") continue;

    const hub = inbound.toCode;
    const arriveMs = inbound.arriveMs;
    const departMs = outbound.departMs;
    const gapMinutes =
      arriveMs != null && departMs != null && Number.isFinite(arriveMs) && Number.isFinite(departMs)
        ? (departMs - arriveMs) / 60_000
        : null;

    const issueLine = outbound.connectionIssue ?? null;
    const risk = classifyRisk(gapMinutes, issueLine);

    const inboundRes = reservations.find((r) => r.id === inbound.reservationId);
    const outboundRes = reservations.find((r) => r.id === outbound.reservationId);
    const inboundDep = inboundRes?.flightDepartureAirport?.trim().toUpperCase() ?? "";
    const outboundArr = outboundRes?.flightArrivalAirport?.trim().toUpperCase() ?? "";

    const intlInbound = isInternationalArrivalFlight(inboundDep, hub);
    const intlOutbound = !isDomesticFlight(hub, outboundArr) && outboundArr.length === 3;
    const samePnr =
      Boolean(inboundRes?.confirmationCode?.trim()) &&
      inboundRes?.confirmationCode?.trim() === outboundRes?.confirmationCode?.trim();

    const steps: ConnectionPlaybookStep[] = [
      {
        id: "deplane",
        icon: "🛬",
        text: "Leave aircraft → follow Connections signs",
        detail: outboundRes?.flightDepartureGate
          ? `Next flight gate ${outboundRes.flightDepartureGate} when posted`
          : undefined,
      },
    ];

    if (intlInbound) {
      steps.push({
        id: "immigration",
        icon: "🛂",
        text: "Immigration / passport control",
        detail: "Have passport ready — use e-gates if eligible for your nationality.",
      });
    }

    if (intlInbound || (intlInbound && !samePnr)) {
      steps.push({
        id: "bags",
        icon: "🧳",
        text: samePnr ? "Confirm bags are checked through" : "Claim and re-check bags",
        detail: samePnr
          ? "Same ticket — bags usually transfer; confirm on the baggage tag."
          : "Separate tickets — you must collect and re-check before security.",
      });
    }

    if (intlInbound || !samePnr) {
      steps.push({
        id: "security",
        icon: "🛡",
        text: "Security screening again",
        detail: "Allow time for the checkpoint — follow airport signs.",
      });
    }

    const inboundTerm = inboundRes?.flightArrivalTerminal?.trim();
    const outboundTerm = outboundRes?.flightDepartureTerminal?.trim();
    if (inboundTerm && outboundTerm && inboundTerm !== outboundTerm) {
      steps.push({
        id: "transfer",
        icon: "🚶",
        text: `Transfer Terminal ${inboundTerm} → Terminal ${outboundTerm}`,
        detail: "Use the airport's official map for the walk or shuttle.",
      });
    } else if (intlOutbound) {
      steps.push({
        id: "transfer",
        icon: "🚶",
        text: "Walk to your departure gate area",
        detail: "Follow gate boards — connection time includes the walk.",
      });
    }

    steps.push({
      id: "gate",
      icon: "🚪",
      text: outboundRes?.flightDepartureGate
        ? `Gate ${outboundRes.flightDepartureGate} · ${outboundRes.flightNumber ?? "next flight"}`
        : `Board ${outboundRes?.flightNumber ?? "your connecting flight"}`,
      detail: outboundRes?.flightDepartureTime
        ? `Departs ${outboundRes.flightDepartureTime.slice(11, 16)}`
        : undefined,
    });

    const connectionActive =
      gapMinutes != null &&
      Number.isFinite(gapMinutes) &&
      arriveMs != null &&
      nowMs >= arriveMs - 30 * 60_000 &&
      (departMs == null || nowMs <= departMs + 60 * 60_000);

    if (!connectionActive && risk !== "impossible" && risk !== "tight") {
      continue;
    }

    return {
      hubIata: hub,
      inboundFlight: inboundRes?.flightNumber ?? null,
      outboundFlight: outboundRes?.flightNumber ?? null,
      risk,
      gapMinutes,
      steps,
      issueLine,
    };
  }

  return null;
}

/** Spotlight index during an active connection — time-based, same rules as arrival coach. */
export function resolveConnectionSpotlightIndex(
  playbook: ConnectionPlaybook,
  input: { locationStatus?: string; minutesSinceLanding?: number | null },
): number {
  const { steps } = playbook;
  if (steps.length === 0) return 0;
  const idx = (id: string) => steps.findIndex((s) => s.id === id);
  const landed = input.minutesSinceLanding ?? 0;

  if (idx("gate") >= 0 && (input.locationStatus === "in-terminal" || landed >= 20)) {
    return idx("gate");
  }
  if (idx("security") >= 0 && landed >= 12) return idx("security");
  if (idx("bags") >= 0 && landed >= 8) return idx("bags");
  if (idx("immigration") >= 0 && landed >= 3) return idx("immigration");
  return 0;
}

/** Find connection playbook when the given reservation is the outbound leg at a hub. */
export function connectionPlaybookForFlight(
  reservations: ConnectionFlightReservation[],
  outboundFlightReservationId: string | null | undefined,
  nowMs = Date.now(),
): ConnectionPlaybook | null {
  if (!outboundFlightReservationId) return null;
  const route = buildTripTransportRoute(reservations);
  for (let i = 0; i < route.segments.length - 1; i++) {
    const inbound = route.segments[i]!;
    const outbound = route.segments[i + 1]!;
    if (outbound.reservationId !== outboundFlightReservationId) continue;
    if (inbound.toCode !== outbound.fromCode) continue;
    const playbook = buildConnectionPlaybook(reservations, nowMs);
    if (playbook && playbook.hubIata === outbound.fromCode) return playbook;
  }
  return null;
}

export function connectionRiskLabel(risk: ConnectionRisk): string {
  switch (risk) {
    case "impossible":
      return "Connection at risk";
    case "tight":
      return "Tight connection";
    case "relaxed":
      return "Comfortable connection";
    default:
      return "Connection";
  }
}
