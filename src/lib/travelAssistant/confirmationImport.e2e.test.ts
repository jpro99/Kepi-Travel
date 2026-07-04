import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  detectMisleadingDownloadPage,
  hasTravelConfirmationSignals,
  validateConfirmationPlainText,
} from "./confirmationDocumentValidation";
import { extractConfirmationDocument } from "./extractConfirmationDocument";
import { inferImportedTripMeta } from "./persistImportToTrip";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

test("validateConfirmationPlainText rejects Google Drive login HTML", () => {
  const googleLogin = `<!doctype html><html><body>Google Drive: Sign-in Sign in to continue to Google Drive Email or phone Forgot email? Create account</body></html>`;
  const result = validateConfirmationPlainText(googleLogin);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /google drive/i);
  }
});

test("hasTravelConfirmationSignals accepts Bali itinerary text", () => {
  const text = readFileSync(join(fixtureDir, "baliVacationFlights.txt"), "utf8");
  assert.equal(hasTravelConfirmationSignals(text), true);
});

test("extractConfirmationDocument imports Bali fixture without AI", async () => {
  const text = readFileSync(join(fixtureDir, "baliVacationFlights.txt"), "utf8");
  const html = `<!doctype html><html><body>${text
    .split("\n")
    .map((line) => `<p>${line}</p>`)
    .join("")}</body></html>`;
  const file = new File([html], "bali-itinerary.pdf", { type: "application/pdf" });
  const drafts = await extractConfirmationDocument(file, "");
  assert.ok(drafts.length >= 4, `expected multiple legs, got ${drafts.length}`);
  const flightNumbers = drafts.map((draft) => draft.flightNumber.replace(/\s+/gu, ""));
  assert.ok(flightNumbers.some((value) => value.includes("865")));
  assert.ok(flightNumbers.some((value) => value.includes("875")));
});

test("inferImportedTripMeta builds trip shell from imported flights", () => {
  const meta = inferImportedTripMeta([
    {
      type: "flight",
      localTime: "2025-09-12 06:00",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
    },
    {
      type: "flight",
      localTime: "2025-10-06 08:20",
      flightDepartureAirport: "CGK",
      flightArrivalAirport: "SIN",
    },
  ]);
  assert.equal(meta.destination, "SIN");
  assert.equal(meta.startDate, "2025-09-12");
  assert.equal(meta.endDate, "2025-10-06");
});

test("detectMisleadingDownloadPage returns null for real itinerary", () => {
  const text = readFileSync(join(fixtureDir, "baliVacationFlights.txt"), "utf8");
  assert.equal(detectMisleadingDownloadPage(text), null);
});
