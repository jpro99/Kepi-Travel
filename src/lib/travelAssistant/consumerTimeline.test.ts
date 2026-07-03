import test from "node:test";
import assert from "node:assert/strict";
import {
  filterConsumerTimelineReservations,
  isConsumerTimelineReservation,
  isOnboardingSetupPlaceholder,
} from "@/lib/travelAssistant/consumerTimeline";

test("isOnboardingSetupPlaceholder detects demo rows", () => {
  assert.equal(
    isOnboardingSetupPlaceholder({ type: "flight", provider: "Onboarding Setup", notes: "" }),
    true,
  );
  assert.equal(
    isOnboardingSetupPlaceholder({ type: "hotel", provider: "Hyatt", notes: "Created during onboarding" }),
    true,
  );
  assert.equal(isOnboardingSetupPlaceholder({ type: "flight", provider: "Delta", notes: "" }), false);
});

test("isConsumerTimelineReservation hides planning placeholders and keeps confirmed bookings", () => {
  assert.equal(
    isConsumerTimelineReservation({
      type: "flight",
      confirmationCode: "PLANNED",
      plannedOnly: true,
      provider: "United",
    }),
    false,
  );
  assert.equal(
    isConsumerTimelineReservation({
      type: "hotel",
      confirmationCode: "PENDING",
      provider: "Hyatt",
    }),
    false,
  );
  assert.equal(
    isConsumerTimelineReservation({
      type: "flight",
      confirmationCode: "AS832",
      provider: "Alaska",
    }),
    true,
  );
  assert.equal(
    isConsumerTimelineReservation({
      type: "train",
      confirmationCode: "PENDING",
      provider: "Amtrak",
    }),
    true,
  );
});

test("filterConsumerTimelineReservations returns only bookable consumer rows", () => {
  const filtered = filterConsumerTimelineReservations([
    { type: "flight", confirmationCode: "PLANNED", plannedOnly: true, provider: "Delta" },
    { type: "hotel", confirmationCode: "SELECTED", provider: "Marriott" },
    { type: "flight", confirmationCode: "UA1234", provider: "United" },
    { type: "dinner", confirmationCode: "OPENTABLE", provider: "Nobu" },
    { type: "flight", provider: "Onboarding Setup", notes: "created during onboarding" },
  ]);
  assert.deepEqual(
    filtered.map((reservation) => reservation.confirmationCode),
    ["UA1234", "OPENTABLE"],
  );
});
