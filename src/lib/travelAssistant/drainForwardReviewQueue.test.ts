import assert from "node:assert/strict";
import test from "node:test";
import { drainForwardReviewQueue } from "./drainForwardReviewQueue";

test("drainForwardReviewQueue imports email-forward items and clears stale May dates", () => {
  const result = drainForwardReviewQueue(
    [],
    [
      {
        id: "review-1",
        sourceChannel: "email-forward",
        sourceEmailSubject: "Fwd: itinerary",
        draft: {
          type: "flight",
          title: "HND to ONT",
          provider: "OR Airlines",
          localTime: "2026-09-12 09:40",
          timezone: "Etc/UTC",
          location: "",
          confirmationCode: "",
          flightNumber: "OR101",
          flightDepartureAirport: "HND",
          flightArrivalAirport: "ONT",
          flightDate: "2026-05-29",
          flightDepartureTime: "2026-05-29 21:20",
        },
      },
    ],
    () => "res-test-1",
  );

  assert.equal(result.changed, true);
  assert.equal(result.reviewQueue.length, 0);
  assert.equal(result.reservations.length, 1);
  assert.equal(result.reservations[0]?.localTime, "2026-09-12 09:40");
  assert.equal(result.reservations[0]?.flightDate, "2026-09-12");
  assert.equal(result.reservations[0]?.flightDepartureTime, "2026-09-12 09:40");
  assert.equal(result.reservations[0]?.source, "imported");
});

test("drainForwardReviewQueue keeps manual review items", () => {
  const manualItem = {
    id: "review-manual",
    sourceChannel: "manual" as const,
    draft: {
      type: "flight",
      title: "Manual add",
      provider: "Test Air",
      localTime: "2026-09-01 08:00",
      timezone: "Etc/UTC",
      location: "LAX -> JFK",
      confirmationCode: "ABC",
    },
  };
  const result = drainForwardReviewQueue([], [manualItem], () => "res-x");
  assert.equal(result.changed, false);
  assert.equal(result.reviewQueue.length, 1);
  assert.equal(result.reservations.length, 0);
});

test("drainForwardReviewQueue never auto-promotes items with explicit gate reasons", () => {
  const gatedItem = {
    id: "review-gated",
    sourceChannel: "email-forward" as const,
    sourceEmailSubject: "Fwd: itinerary",
    reasons: ["Low parsing confidence (22/100).", "Missing departure airport, arrival airport, or departure time."],
    draft: {
      type: "flight",
      title: "Unclear itinerary",
      provider: "",
      localTime: "",
      timezone: "Etc/UTC",
      location: "",
      confirmationCode: "",
    },
  };
  const result = drainForwardReviewQueue([], [gatedItem], () => "res-gated");
  assert.equal(result.changed, false);
  assert.equal(result.reviewQueue.length, 1);
  assert.equal(result.reservations.length, 0);
});

test("I35: drainForwardReviewQueue preserves hotel checkOutDate", () => {
  const result = drainForwardReviewQueue(
    [],
    [
      {
        id: "review-hotel",
        sourceChannel: "email-forward",
        sourceEmailSubject: "Fwd: Booking.com confirmation NEREA",
        draft: {
          type: "hotel",
          title: "NEREA Monopoli",
          provider: "Booking.com",
          localTime: "2026-09-05 15:00",
          timezone: "Europe/Rome",
          location: "Monopoli",
          confirmationCode: "ABC123",
          checkOutDate: "2026-09-08",
        },
      },
    ],
    () => "res-hotel-1",
  );
  assert.equal(result.changed, true);
  assert.equal(result.reservations.length, 1);
  assert.equal(result.reservations[0]?.type, "hotel");
  assert.equal(result.reservations[0]?.checkOutDate, "2026-09-08");
  assert.equal(result.reservations[0]?.localTime.slice(0, 10), "2026-09-05");
});

test("drainForwardReviewQueue skips duplicates already on timeline", () => {
  const existing = {
    id: "res-existing",
    type: "flight",
    title: "HND -> ONT",
    provider: "OR Airlines",
    localTime: "2026-09-12 09:40",
    timezone: "Asia/Tokyo",
    location: "HND -> ONT",
    confirmationCode: "XYZ123",
    flightNumber: "OR101",
    flightDepartureAirport: "HND",
    flightArrivalAirport: "ONT",
  };
  const result = drainForwardReviewQueue(
    [existing],
    [
      {
        id: "review-dup",
        sourceChannel: "email-forward",
        sourceEmailSubject: "Fwd: itinerary",
        draft: {
          type: "flight",
          title: "HND to ONT",
          provider: "OR Airlines",
          localTime: "2026-09-12 09:40",
          timezone: "Etc/UTC",
          location: "HND -> ONT",
          confirmationCode: "XYZ123",
          flightNumber: "OR101",
          flightDepartureAirport: "HND",
          flightArrivalAirport: "ONT",
        },
      },
    ],
    () => "res-new",
  );
  assert.equal(result.changed, true);
  assert.equal(result.reviewQueue.length, 0);
  assert.equal(result.reservations.length, 1);
});
