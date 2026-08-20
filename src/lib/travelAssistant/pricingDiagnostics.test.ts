import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPricingDiagnostics,
  describePricingDiagnostic,
} from "@/lib/travelAssistant/pricingDiagnostics";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";

function leg(overrides: Partial<SessionReservation>): SessionReservation {
  return {
    id: "f1",
    type: "flight",
    title: "ONT-SEA",
    provider: "Alaska Airlines",
    localTime: "2026-09-01T12:00",
    location: "ONT",
    assignedTo: [],
    notes: "",
    confirmationCode: "DPNNWG",
    source: "imported",
    ...overrides,
  } as SessionReservation;
}

test("G40: diagnostics say when no confirmation email was ever saved", () => {
  const reservations = [leg({ id: "f1" }), leg({ id: "f2" })];
  const [diagnostic] = buildPricingDiagnostics(reservations);
  assert.equal(diagnostic?.confirmationCode, "DPNNWG");
  assert.equal(diagnostic?.legCount, 2);
  assert.equal(diagnostic?.reason, "no-email-stored");
  assert.match(describePricingDiagnostic(diagnostic!), /no confirmation email saved/u);
});

test("G40: diagnostics distinguish an itinerary with no fare", () => {
  const reservations = [
    leg({
      id: "f1",
      originalEmailText:
        "Your trip AS654 ONT to SEA. Confirmation code: DPNNWG. Check in 24 hours before departure.",
    }),
    leg({ id: "f2" }),
  ];
  const [diagnostic] = buildPricingDiagnostics(reservations);
  assert.equal(diagnostic?.reason, "email-has-no-fare");
  assert.equal(diagnostic?.hasPricingSignal, false);
  assert.match(describePricingDiagnostic(diagnostic!), /itinerary with no fare/u);
});

test("G40: a priced confirmation is not reported as blocked", () => {
  const reservations = [
    leg({
      id: "f1",
      originalEmailText: "Confirmation DPNNWG New Ticket Value: $1,386.43 Total charges USD $0.00",
    }),
    leg({ id: "f2" }),
  ];
  assert.deepEqual(buildPricingDiagnostics(reservations), []);
});
