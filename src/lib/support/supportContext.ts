import { getActiveTrip } from "@/lib/travelAssistant/tripStore";
import { detectTripGaps } from "@/lib/travelAssistant/gapDetectionService";
import { buildTripCompleteness, buildTripNightCoverage } from "@/lib/travelAssistant/tripNightCoverage";

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
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
    return `${index + 1}. ${range.nightCount} night(s) ${range.startNight}–${range.endNight} (${range.suggestedCity})`;
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
        ? `route=${reservation.flightDepartureAirport ?? "?"}→${reservation.flightArrivalAirport ?? "?"}`
        : null,
      reservation.type === "hotel" && reservation.checkOutDate
        ? `checkout=${reservation.checkOutDate}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");
  });

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
    "RULE: Never claim accommodations are complete if stay holes are listed above.",
  ].join("\n");
}
