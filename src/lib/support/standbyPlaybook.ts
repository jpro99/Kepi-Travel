/**
 * Curated standby / denied-boarding guidance for Kepi Support (G68).
 * Sources: EU Reg 261/2004 (EUR-Lex CELEX 32004R0261); ENAC passenger-rights page
 * (enac.gov.it, accessed 2026-09-02); EC interpretative guidelines 2024 (EUR-Lex 52024XC05687).
 */

export type StandbyPlaybookReservation = {
  id: string;
  type: string;
  title?: string;
  provider?: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightStatus?: string;
  flightOnTime?: boolean;
  flightDelayMinutes?: number;
};

/** Major Italy commercial airports — IATA verified against trip fixtures + ENAC network. */
export const ITALY_AIRPORT_IATAS = new Set([
  "AHO",
  "AOI",
  "BDS",
  "BGY",
  "BLQ",
  "BRI",
  "CAG",
  "CTA",
  "FCO",
  "FLR",
  "GOA",
  "LIN",
  "MXP",
  "NAP",
  "OLB",
  "PMO",
  "PSA",
  "SUF",
  "TRN",
  "TSF",
  "VCE",
  "VRN",
]);

const DISRUPTION_STATUS_PATTERN =
  /\b(stand\s*-?\s*by|standby|cancel|cancelled|canceled|denied|bump|overbook|no\s+seat|rebook|delay|delayed)\b/iu;

export function reservationTouchesItaly(reservation: StandbyPlaybookReservation): boolean {
  if (reservation.type !== "flight") return false;
  const dep = reservation.flightDepartureAirport?.trim().toUpperCase() ?? "";
  const arr = reservation.flightArrivalAirport?.trim().toUpperCase() ?? "";
  return ITALY_AIRPORT_IATAS.has(dep) || ITALY_AIRPORT_IATAS.has(arr);
}

export function tripTouchesItaly(reservations: readonly StandbyPlaybookReservation[]): boolean {
  return reservations.some((reservation) => reservationTouchesItaly(reservation));
}

export function reservationLooksDisrupted(reservation: StandbyPlaybookReservation): boolean {
  if (reservation.type !== "flight") return false;
  if (reservation.flightOnTime === false) return true;
  if (typeof reservation.flightDelayMinutes === "number" && reservation.flightDelayMinutes > 0) {
    return true;
  }
  const status = reservation.flightStatus?.trim() ?? "";
  return status.length > 0 && DISRUPTION_STATUS_PATTERN.test(status);
}

export function tripHasFlightDisruption(reservations: readonly StandbyPlaybookReservation[]): boolean {
  return reservations.some((reservation) => reservationLooksDisrupted(reservation));
}

export function shouldAttachStandbyPlaybook(reservations: readonly StandbyPlaybookReservation[]): boolean {
  return tripTouchesItaly(reservations) || tripHasFlightDisruption(reservations);
}

function formatImpactedFlights(reservations: readonly StandbyPlaybookReservation[]): string[] {
  return reservations
    .filter((reservation) => reservation.type === "flight")
    .filter(
      (reservation) => reservationTouchesItaly(reservation) || reservationLooksDisrupted(reservation),
    )
    .slice(0, 6)
    .map((reservation) => {
      const route = `${reservation.flightDepartureAirport ?? "?"}→${reservation.flightArrivalAirport ?? "?"}`;
      const status = reservation.flightStatus?.trim();
      const delay =
        typeof reservation.flightDelayMinutes === "number" && reservation.flightDelayMinutes > 0
          ? `${reservation.flightDelayMinutes}m late`
          : null;
      return [
        reservation.flightNumber ?? reservation.title ?? "Flight",
        route,
        reservation.confirmationCode ? `PNR ${reservation.confirmationCode}` : null,
        status ? `status=${status}` : null,
        delay,
      ]
        .filter(Boolean)
        .join(" | ");
    });
}

/**
 * Plain-text playbook block for support system context.
 * Honest: does not invent airline offers or exact compensation for this passenger.
 */
export function buildStandbySupportPlaybook(
  reservations: readonly StandbyPlaybookReservation[],
): string {
  if (!shouldAttachStandbyPlaybook(reservations)) {
    return "";
  }

  const italyTrip = tripTouchesItaly(reservations);
  const disrupted = tripHasFlightDisruption(reservations);
  const impacted = formatImpactedFlights(reservations);

  const lines = [
    "STANDBY / NO-SEAT / CANCELLED FLIGHT PLAYBOOK (curated — EU261 + Italy ENAC, 2026-09-02):",
    italyTrip
      ? "This trip touches Italy — EU Regulation 261/2004 applies to departures from Italian/EU airports and to EU carriers flying into the EU."
      : "EU Regulation 261/2004 may apply if the disrupted leg departs the EU or is on an EU carrier into the EU.",
    disrupted
      ? "At least one flight on this trip shows delay/cancel/standby-style status in Kepi — treat as an active disruption."
      : "Passenger may be on standby even if status is not synced yet — use their message as ground truth.",
    impacted.length > 0 ? `Impacted / Italy flights in trip:\n${impacted.map((line) => `  - ${line}`).join("\n")}` : null,
    "",
    "WHAT STANDBY MEANS:",
    "- Standby = you do NOT have a confirmed seat on that flight yet. You wait for an empty seat at the gate or transfer desk.",
    "- Voluntary standby (you agreed to give up your seat for benefits) is different from involuntary denied boarding — rights differ.",
    "",
    "RIGHT NOW AT THE AIRPORT (Italy / EU):",
    "1. Stay at the airline transfer desk or gate desk — do not walk away without written confirmation of your status.",
    "2. Ask clearly: 'Am I confirmed, standby, or denied boarding?' Get it in writing (email, printout, or airline app screenshot).",
    "3. If they have NO seats on their airline today, ask for EU261 re-routing (Article 8): earliest alternative to your final destination — including another airline if needed.",
    "4. Ask for 'care' while you wait (Article 9): meals, hotel if overnight, airport↔hotel transport, and two communications (calls/email).",
    "5. If boarding was denied against your will (not voluntary), ask about EU261 cash compensation (Article 7) — amounts depend on distance; airline must state your options.",
    "6. Your legal choices when the flight is cancelled or you are denied boarding (Article 8): (a) full refund within 7 days, OR (b) re-routing at earliest opportunity, OR (c) re-routing at a later date you choose.",
    "",
    "IF THE AIRLINE SAYS THEY HAVE ZERO FLIGHTS:",
    "- They still owe re-routing or refund — you are not stranded without options under EU261.",
    "- Push for written confirmation that no seats exist and what re-routing they will provide.",
    "- Same-day options may include partner airlines; next-day hotel + meals should be covered while you wait (care).",
    "- Kepi does NOT invent replacement flights — only repeat options the airline has actually offered unless user asks for search ideas.",
    "",
    "ITALY COMPLAINTS (after you talk to the airline):",
    "- First contact the airline that issued the ticket (or tour operator on packages).",
    "- For Italy departures / Italy enforcement: ENAC is the National Enforcement Body — Passenger Rights Protection app on enac.gov.it.",
    "- EU standard air-passenger complaint form is accepted; keep boarding pass, booking ref, and all airline messages.",
    "",
    "WHOLE-TRIP (Kepi concierge):",
    "- Missed connections, hotels, and trains are separate bookings — note what must move if you arrive a day late.",
    "- Bags: do not leave the airport without airline instructions if bags were checked.",
    "- Calm tone — never say 'illegal' or 'rebook immediately'; explain rights and the next desk to visit.",
    "",
    "RULE: Never invent a specific alternate flight, voucher amount, or compensation € figure for this user without airline confirmation.",
  ];

  return lines.filter((line) => line !== null).join("\n");
}
