/**
 * Living registry of discrepancy triggers that route parses to human review.
 * Keep in sync with forwardedReservationGate + reservationPlausibility.
 */
export const PARSE_DISCREPANCY_TRIGGERS = [
  "Low parsing confidence (<40/100)",
  "Parser flagged fields that need your input",
  "Missing departure airport, arrival airport, or departure time (flights)",
  "Missing check-in time or location (hotels)",
  "Invalid or unknown IATA airport code",
  "Departure time implausible vs check-in/checkout window",
  "Quoted price out of plausible range",
  "Flight date in implausible year",
] as const;

export type ParseDiscrepancyTrigger = (typeof PARSE_DISCREPANCY_TRIGGERS)[number];
