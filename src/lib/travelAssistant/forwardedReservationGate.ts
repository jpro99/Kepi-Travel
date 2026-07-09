import {
  checkReservationPlausibility,
  type ReservationPlausibilityInput,
} from "@/lib/travelAssistant/reservationPlausibility";

/**
 * Decides whether a parsed forwarded reservation is trustworthy enough to auto-import
 * as live trip fact, or whether it must stop in the review queue for a human to confirm.
 *
 * Before this gate existed, every parsed draft — regardless of confidence — was written
 * straight into the trip with only a soft note in `notes`. This made low-confidence and
 * implausible parses indistinguishable from verified bookings in the UI.
 */

const LOW_CONFIDENCE_THRESHOLD = 40;

export interface ForwardedReservationGateInput extends ReservationPlausibilityInput {
  confidenceScore: number;
  parsingStatus: "auto-parsed" | "needs-review" | "needs-user-input";
  missingFields?: string[];
  location?: string;
}

export interface ForwardedReservationGateResult {
  needsReview: boolean;
  reasons: string[];
}

export function evaluateForwardedReservationGate(
  input: ForwardedReservationGateInput,
): ForwardedReservationGateResult {
  const reasons: string[] = [];

  if (input.confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
    reasons.push(`Low parsing confidence (${input.confidenceScore}/100).`);
  }

  if (input.parsingStatus === "needs-user-input") {
    reasons.push("Parser flagged fields that need your input.");
  }

  if (
    input.type === "flight" &&
    (!input.flightDepartureAirport?.trim() ||
      !input.flightArrivalAirport?.trim() ||
      !input.localTime.trim())
  ) {
    reasons.push("Missing departure airport, arrival airport, or departure time.");
  }

  if (input.type === "hotel" && (!input.localTime.trim() || !input.location?.trim())) {
    reasons.push("Missing check-in time or location.");
  }

  const plausibility = checkReservationPlausibility(input);
  if (!plausibility.plausible) {
    reasons.push(...plausibility.issues);
  }

  return { needsReview: reasons.length > 0, reasons };
}
