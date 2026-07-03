import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_BOOKING_WIZARD,
  advanceBookingWizard,
  normalizeBookingWizard,
} from "./bookingWizard";

describe("bookingWizard", () => {
  it("normalizes invalid payloads to setup phase", () => {
    const normalized = normalizeBookingWizard({ phase: "bogus", flightsDone: "yes" });
    assert.equal(normalized.phase, "setup");
    assert.equal(normalized.flightsDone, true);
    assert.equal(typeof normalized.updatedAt, "string");
  });

  it("advances setup → flights → hotels → excursions → complete", () => {
    let progress = { ...EMPTY_BOOKING_WIZARD, updatedAt: "2026-01-01T00:00:00.000Z" };

    progress = advanceBookingWizard(progress, "complete-setup");
    assert.equal(progress.phase, "flights");
    assert.equal(progress.flightsDone, false);

    progress = advanceBookingWizard(progress, "done-flights");
    assert.equal(progress.phase, "hotels");
    assert.equal(progress.flightsDone, true);

    progress = advanceBookingWizard(progress, "done-hotels");
    assert.equal(progress.phase, "excursions");
    assert.equal(progress.hotelsDone, true);

    progress = advanceBookingWizard(progress, "done-excursions");
    assert.equal(progress.phase, "complete");
    assert.equal(progress.excursionsDone, true);
  });

  it("returns to setup on adjust without clearing done flags", () => {
    const progress = advanceBookingWizard(
      {
        phase: "hotels",
        flightsDone: true,
        hotelsDone: false,
        excursionsDone: false,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      "adjust",
    );
    assert.equal(progress.phase, "setup");
    assert.equal(progress.flightsDone, true);
  });
});
