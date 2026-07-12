import assert from "node:assert/strict";
import test from "node:test";
import { hotelDefaultsSignature } from "./useHotelSearchFields";

test("hotelDefaultsSignature is stable for identical defaults", () => {
  const a = hotelDefaultsSignature("Rome (FCO)", "FCO", "2026-09-01", "2026-09-05");
  const b = hotelDefaultsSignature("Rome (FCO)", "FCO", "2026-09-01", "2026-09-05");
  assert.equal(a, b);
});

test("hotelDefaultsSignature changes when city changes", () => {
  const ont = hotelDefaultsSignature("Ontario, CA (ONT)", "ONT", "2026-09-01", "2026-09-05");
  const rome = hotelDefaultsSignature("Rome (FCO)", "FCO", "2026-09-01", "2026-09-05");
  assert.notEqual(ont, rome);
});
