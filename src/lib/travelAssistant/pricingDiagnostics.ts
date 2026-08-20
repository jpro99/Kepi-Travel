import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { PDF_ATTACHMENT_MARKER, sourceTextHasPricingSignal } from "@/lib/travelAssistant/emailSourceText";
import { resolveReservationCashUsd } from "@/lib/travelAssistant/parseReservationCashUsd";
import { resolveReservationMiles } from "@/lib/travelAssistant/parseReservationMiles";
import { reservationMissingPrice } from "@/lib/travelAssistant/tripSpendSummary";
import { isPlaceholderConfirmation } from "@/lib/travelAssistant/placeholderReservations";

/** Confirmation codes still missing a price — the codes worth hunting for. */
export function unpricedConfirmationCodes(reservations: SessionReservation[]): string[] {
  const codes = new Set<string>();
  for (const reservation of reservations) {
    if (!reservationMissingPrice(reservation, reservations)) continue;
    const code = reservation.confirmationCode?.trim().toUpperCase();
    if (!code || code.length < 5) continue;
    if (isPlaceholderConfirmation(code)) continue;
    codes.add(code);
  }
  return [...codes];
}

export type PricingBlockReason =
  | "priced"
  | "no-email-stored"
  | "email-has-no-fare"
  | "fare-text-not-parsed";

export interface PricingDiagnostic {
  confirmationCode: string;
  legCount: number;
  reason: PricingBlockReason;
  storedTextChars: number;
  hasPdfSection: boolean;
  hasPricingSignal: boolean;
  hasSourceEmailId: boolean;
}

function reasonForGroup(legs: SessionReservation[]): PricingBlockReason {
  const combinedText = legs
    .map((leg) => leg.originalEmailText?.trim() ?? "")
    .sort((a, b) => b.length - a.length)[0] ?? "";

  if (!combinedText) return "no-email-stored";
  if (!sourceTextHasPricingSignal(combinedText)) return "email-has-no-fare";
  return "fare-text-not-parsed";
}

/** Explain, per confirmation, why a fare is still missing — never fail silently (G40). */
export function buildPricingDiagnostics(reservations: SessionReservation[]): PricingDiagnostic[] {
  const groups = new Map<string, SessionReservation[]>();

  for (const reservation of reservations) {
    if (!reservationMissingPrice(reservation, reservations)) continue;
    const code = reservation.confirmationCode?.trim().toUpperCase();
    if (!code || isPlaceholderConfirmation(code)) continue;
    const list = groups.get(code) ?? [];
    list.push(reservation);
    groups.set(code, list);
  }

  const diagnostics: PricingDiagnostic[] = [];
  for (const [code, legs] of groups) {
    const longestText = legs
      .map((leg) => leg.originalEmailText?.trim() ?? "")
      .sort((a, b) => b.length - a.length)[0] ?? "";
    const cash = resolveReservationCashUsd({ originalEmailText: longestText, confirmationCode: code });
    const miles = resolveReservationMiles({ originalEmailText: longestText, confirmationCode: code });
    const priced = (cash != null && cash > 0) || (miles.milesSpent != null && miles.milesSpent > 0);

    diagnostics.push({
      confirmationCode: code,
      legCount: legs.length,
      reason: priced ? "priced" : reasonForGroup(legs),
      storedTextChars: longestText.length,
      hasPdfSection: longestText.includes(PDF_ATTACHMENT_MARKER),
      hasPricingSignal: sourceTextHasPricingSignal(longestText),
      hasSourceEmailId: legs.some((leg) => Boolean(leg.sourceEmailId?.trim())),
    });
  }

  return diagnostics.sort((a, b) => b.legCount - a.legCount);
}

/** Calm, specific copy for the traveler — says what Kepi will do next. */
export function describePricingDiagnostic(diagnostic: PricingDiagnostic): string {
  const legs = `${diagnostic.legCount} flight${diagnostic.legCount === 1 ? "" : "s"}`;
  switch (diagnostic.reason) {
    case "no-email-stored":
      return `${diagnostic.confirmationCode} (${legs}) — no confirmation email saved yet. Forward the receipt once and Kepi will price every leg.`;
    case "email-has-no-fare":
      return `${diagnostic.confirmationCode} (${legs}) — the saved email is an itinerary with no fare. Forward the receipt that shows the ticket total.`;
    case "fare-text-not-parsed":
      return `${diagnostic.confirmationCode} (${legs}) — a total is in the email but Kepi could not read it. This is a parser gap, not your fault.`;
    default:
      return `${diagnostic.confirmationCode} (${legs}) — priced.`;
  }
}
