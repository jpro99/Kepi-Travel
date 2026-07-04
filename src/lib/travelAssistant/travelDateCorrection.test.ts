import assert from "node:assert/strict";
import test from "node:test";
import {
  correctPastTravelIsoDate,
  correctPastTravelLocalTime,
  correctReservationTravelDates,
} from "./travelDateCorrection";

const JUNE_2026 = new Date("2026-06-15T12:00:00Z");

test("correctPastTravelIsoDate rolls 2025 dates forward when reference is 2026", () => {
  assert.equal(correctPastTravelIsoDate("2025-09-12", JUNE_2026), "2026-09-12");
  assert.equal(correctPastTravelIsoDate("2025-10-06", JUNE_2026), "2026-10-06");
});

test("correctPastTravelIsoDate leaves upcoming dates unchanged", () => {
  assert.equal(correctPastTravelIsoDate("2026-09-12", JUNE_2026), "2026-09-12");
  assert.equal(correctPastTravelIsoDate("2027-01-15", JUNE_2026), "2027-01-15");
});

test("correctPastTravelLocalTime preserves time suffix", () => {
  assert.equal(
    correctPastTravelLocalTime("2025-09-12 06:00", JUNE_2026),
    "2026-09-12 06:00",
  );
});

test("correctReservationTravelDates aligns flight fields", () => {
  const corrected = correctReservationTravelDates(
    {
      localTime: "2025-09-12 06:00",
      flightDate: "2025-09-12",
      flightDepartureTime: "2025-09-12 06:00",
    },
    JUNE_2026,
  );
  assert.equal(corrected.localTime, "2026-09-12 06:00");
  assert.equal(corrected.flightDate, "2026-09-12");
  assert.equal(corrected.flightDepartureTime, "2026-09-12 06:00");
});
