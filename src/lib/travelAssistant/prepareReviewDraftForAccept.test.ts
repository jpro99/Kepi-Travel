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

test("prepareReviewDraftForAccept keeps scanned localTime when departure time has stale date", () => {
  const prepared = prepareReviewDraftForAccept({
    type: "flight",
    title: "Bari to Venice via Rome",
    provider: "ITA Airways",
    localTime: "2026-09-12 15:20",
    timezone: "Etc/UTC",
    location: "",
    confirmationCode: "234542",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "VCE",
    flightNumber: "AZ1616",
    flightDate: "2026-09-12",
    flightDepartureTime: "2026-05-29 21:20",
  });
  assert.equal(prepared.localTime, "2026-09-12 15:20");
  assert.equal(prepared.flightDepartureTime, "2026-09-12 15:20");
  assert.equal(prepared.location, "BRI -> VCE");
  assert.equal(prepared.timezone, "Europe/Rome");
});
