import { getActiveTrip } from "@/lib/travelAssistant/tripStore";
import { detectTripGaps } from "@/lib/travelAssistant/gapDetectionService";
import {
  buildTripCompleteness,
  buildTripNightCoverage,
  formatStayGapContextLabel,
} from "@/lib/travelAssistant/tripNightCoverage";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import { resolveHubConnection } from "@/lib/airportNav/connectionClock";
import { buildStandbySupportPlaybook } from "@/lib/support/standbyPlaybook";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function buildAirportTravelHints(reservations: TransportRouteReservation[]): string[] {
  const hints: string[] = [];
  const iatas = new Set<string>();
  for (const reservation of reservations) {
    if (reservation.type !== "flight") continue;
    const dep = reservation.flightDepartureAirport?.trim().toUpperCase();
    const arr = reservation.flightArrivalAirport?.trim().toUpperCase();
    if (dep) iatas.add(dep);
    if (arr) iatas.add(arr);
  }

  for (const iata of iatas) {
    const nav = getAirportNav(iata);
    if (!nav) continue;
    const baggage = nav.arrivalInfo?.baggageCarousels?.[0]?.carouselNote;
    const transport =
      nav.arrivalInfo?.rideStepTitle?.trim()
      || nav.arrivalInfo?.transportOptions?.find((o) => o.isDefault)?.label
      || nav.arrivalInfo?.groundTransport;
    if (baggage) {
      hints.push(`${iata} baggage claim: ${truncate(baggage, 220)}`);
    }
    if (transport) {
      hints.push(`${iata} ground transport: ${truncate(transport, 220)}`);
    }
  }
  return hints;
}

function buildConnectionHints(reservations: TransportRouteReservation[]): string[] {
  const hints: string[] = [];
  const flights = reservations.filter((r) => r.type === "flight");
  for (const outbound of flights) {
    const hub = outbound.flightDepartureAirport?.trim().toUpperCase();
    if (!hub) continue;
    const ctx = resolveHubConnection(reservations, hub, outbound.id);
    if (!ctx) continue;
    const selfTransfer = !ctx.bagsCheckedThrough;
    const line = selfTransfer
      ? `${hub} self-transfer: ${ctx.inbound.flightNumber ?? "inbound"} → ${ctx.outbound.flightNumber ?? "outbound"} — claim bags, ${ctx.outbound.airline ?? "outbound airline"} check-in counter, then security.`
      : `${hub} connection: ${ctx.inbound.flightNumber ?? "inbound"} → ${ctx.outbound.flightNumber ?? "outbound"} — bags usually checked through on same ticket.`;
    hints.push(line);
  }
  return [...new Set(hints)].slice(0, 6);
}

export async function buildSupportContext(userId: string): Promise<string> {
  const trip = await getActiveTrip(userId);
  if (!trip) {
    return "No active trip is currently selected.";
  }

  const reservations = trip.reservations ?? [];
  const stayDecisions = trip.stayDecisions ?? {};
  const completeness = buildTripCompleteness({
    reservations,
    stayDecisions,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
  });
  const nightCoverage = buildTripNightCoverage({
    reservations,
    stayDecisions,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
  });
  const gaps = detectTripGaps(reservations, Date.now(), {
    stayDecisions,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
  });

  const gapLines = gaps.slice(0, 8).map((gap, index) => {
    return `${index + 1}. [${gap.severity}] ${gap.title} — ${truncate(gap.detail, 160)}`;
  });

  const stayHoleLines = nightCoverage.uncoveredRanges.slice(0, 5).map((range, index) => {
    return `${index + 1}. ${range.nightCount} night(s) ${range.startNight}–${range.endNight} (${formatStayGapContextLabel(range)})`;
  });

  const reservationLines = reservations.slice(0, 20).map((reservation, index) => {
    return [
      `${index + 1}. ${reservation.type.toUpperCase()} - ${truncate(reservation.title, 90)}`,
      reservation.provider ? `provider=${truncate(reservation.provider, 60)}` : null,
      reservation.localTime ? `time=${reservation.localTime}` : null,
      reservation.timezone ? `tz=${reservation.timezone}` : null,
      reservation.location ? `location=${truncate(reservation.location, 90)}` : null,
      reservation.confirmationCode ? `confirmation=${reservation.confirmationCode}` : null,
      reservation.type === "flight"
        ? [
            `route=${reservation.flightDepartureAirport ?? "?"}→${reservation.flightArrivalAirport ?? "?"}`,
            reservation.flightNumber ? `flight=${reservation.flightNumber}` : null,
            reservation.flightDepartureTime ? `dep=${reservation.flightDepartureTime}` : null,
            reservation.flightArrivalTime ? `arr=${reservation.flightArrivalTime}` : null,
            reservation.flightStatus ? `status=${reservation.flightStatus}` : null,
            reservation.flightOnTime === false ? "onTime=false" : null,
            typeof reservation.flightDelayMinutes === "number" && reservation.flightDelayMinutes > 0
              ? `delayMin=${reservation.flightDelayMinutes}`
              : null,
          ].filter(Boolean).join(" ")
        : null,
      reservation.type === "train"
        ? `train=${reservation.title}`
        : null,
      reservation.type === "hotel" && reservation.checkOutDate
        ? `checkout=${reservation.checkOutDate}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");
  });

  const airportHints = buildAirportTravelHints(reservations);
  const connectionHints = buildConnectionHints(reservations);
  const standbyPlaybook = buildStandbySupportPlaybook(reservations);

  return [
    "Current trip context:",
    `- Trip: ${trip.name}`,
    `- Destination: ${trip.destination}`,
    `- Dates: ${trip.startDate} to ${trip.endDate}`,
    `- Stage: ${trip.stage}`,
    `- Status: ${trip.tripStatus ?? "unknown"}`,
    `- Active scenario: ${trip.activeScenario ?? "none"}`,
    `- Completeness: flights=${completeness.flights} (${completeness.flightsLabel}); hotels=${completeness.hotels} (${completeness.hotelsLabel}); overall=${completeness.overall}`,
    `- Stay holes (authoritative — do NOT say everything is covered if any exist):`,
    stayHoleLines.length > 0 ? stayHoleLines.join("\n") : "None — every destination night is covered or skipped.",
    `- Planning gaps:`,
    gapLines.length > 0 ? gapLines.join("\n") : "No open planning gaps.",
    `- Reservations (${reservations.length}):`,
    reservationLines.length > 0 ? reservationLines.join("\n") : "No reservations on this trip yet.",
    `- Airport / baggage / train hints (curated — do not invent carousel numbers):`,
    airportHints.length > 0 ? airportHints.join("\n") : "None for airports on this trip.",
    `- Connection / self-transfer hints:`,
    connectionHints.length > 0 ? connectionHints.join("\n") : "No same-airport connections detected.",
    standbyPlaybook ? `- Standby / denied boarding / no-flight playbook:\n${standbyPlaybook}` : null,
    "RULE: Never claim accommodations are complete if stay holes are listed above.",
    "RULE: Answer baggage, train, and airport wayfinding from hints + reservations — be specific.",
    "RULE: For standby, denied boarding, or airline has no seats — use the standby playbook; explain EU261 rights calmly.",
  ]
    .filter(Boolean)
    .join("\n");
}
