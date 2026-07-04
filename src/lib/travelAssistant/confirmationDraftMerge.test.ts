import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { mergeConfirmationDrafts } from "./confirmationDraftMerge";
import { preparePdfTextForParsing } from "./pdfTextExtract";
import { parseScannedReservationsJson } from "./scannedReservationDraft";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const baliFixtureText = readFileSync(join(fixtureDir, "__fixtures__", "baliVacationFlights.txt"), "utf8");

test("mergeConfirmationDrafts extracts all Bali vacation legs from PDF plain text", () => {
  const prepared = preparePdfTextForParsing(baliFixtureText);
  const merged = mergeConfirmationDrafts([], prepared);
  assert.ok(merged.length >= 5, `expected at least 5 legs, got ${merged.length}`);
  const flightNumbers = merged.map((draft) => draft.flightNumber.replace(/\s+/gu, ""));
  assert.ok(flightNumbers.includes("AS865"));
  assert.ok(flightNumbers.includes("AS6422"));
  assert.ok(flightNumbers.includes("AZ1607"));
  assert.ok(flightNumbers.includes("SQ948"));
  assert.ok(flightNumbers.includes("GA875"));
});

test("mergeConfirmationDrafts adds missing regex legs when AI returns only the first flight", () => {
  const aiOnlyFirst = parseScannedReservationsJson(
    JSON.stringify({
      reservations: [
        {
          type: "flight",
          provider: "Alaska Airlines",
          flightNumber: "AS865",
          departureAirport: "ONT",
          arrivalAirport: "SEA",
          localTime: "2025-09-12 06:00",
          confirmationCode: "ABCDEF",
        },
      ],
    }),
  );
  const merged = mergeConfirmationDrafts(aiOnlyFirst, preparePdfTextForParsing(baliFixtureText));
  assert.ok(merged.length >= 5);
  assert.ok(merged.every((draft) => draft.type === "flight"));
  assert.ok(merged.some((draft) => draft.flightNumber.replace(/\s+/gu, "") === "AZ1607"));
  assert.ok(merged.some((draft) => draft.flightNumber.replace(/\s+/gu, "") === "SQ948"));
});

test("parseScannedReservationsJson recovers truncated multi-leg JSON", () => {
  const truncated = `{
  "reservations": [
    {
      "type": "flight",
      "flightNumber": "AS865",
      "departureAirport": "ONT",
      "arrivalAirport": "SEA",
      "localTime": "2025-09-12 06:00"
    },
    {
      "type": "flight",
      "flightNumber": "AS6422",
      "departureAirport": "SEA",
      "arrivalAirport": "FCO",
      "localTime": "2025-09-12 11:30"
    },
    {
      "type": "flight",
      "flightNumber": "SQ948",
      "departureAirport": "SIN",
      "arrivalAirport": "DPS",
      "localTime": "2025-09-25 14:15"
    }`;
  const drafts = parseScannedReservationsJson(truncated);
  assert.equal(drafts.length, 3);
  assert.equal(drafts[2]?.flightArrivalAirport, "DPS");
});
