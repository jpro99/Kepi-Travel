import assert from "node:assert/strict";
import test from "node:test";
import { prepareReviewDraftForAccept } from "./prepareReviewDraftForAccept";

test("prepareReviewDraftForAccept fills flight route and normalizes date-only time", () => {
  const prepared = prepareReviewDraftForAccept({
    type: "flight",
    title: "",
    provider: "ITA Airways",
    localTime: "2026-09-12",
    timezone: "Etc/UTC",
    location: "",
    confirmationCode: "",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "VCE",
    flightNumber: "AZ1234",
    flightDate: "2026-09-12",
  });
  assert.equal(prepared.location, "BRI -> VCE");
  assert.equal(prepared.localTime, "2026-09-12 12:00");
  assert.equal(prepared.timezone, "Europe/Rome");
  assert.match(prepared.title, /BRI/);
});

test("prepareReviewDraftForAccept infers flight type from airport codes", () => {
  const prepared = prepareReviewDraftForAccept({
    type: "ride",
    title: "",
    provider: "ITA Airways",
    localTime: "2026-09-12",
    timezone: "Etc/UTC",
    location: "",
    confirmationCode: "",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "VCE",
  });
  assert.equal(prepared.type, "flight");
  assert.equal(prepared.location, "BRI -> VCE");
});
