import { getActiveTrip } from "@/lib/travelAssistant/tripStore";

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

  const reservationLines = trip.reservations.slice(0, 20).map((reservation, index) => {
    return [
      `${index + 1}. ${reservation.type.toUpperCase()} - ${truncate(reservation.title, 90)}`,
      reservation.provider ? `provider=${truncate(reservation.provider, 60)}` : null,
      reservation.localTime ? `time=${reservation.localTime}` : null,
      reservation.timezone ? `tz=${reservation.timezone}` : null,
      reservation.location ? `location=${truncate(reservation.location, 90)}` : null,
      reservation.confirmationCode ? `confirmation=${reservation.confirmationCode}` : null,
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
    `- Reservations (${trip.reservations.length}):`,
    reservationLines.length > 0 ? reservationLines.join("\n") : "No reservations on this trip yet.",
  ].join("\n");
}
