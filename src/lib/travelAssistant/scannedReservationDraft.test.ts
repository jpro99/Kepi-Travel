import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScannedReservationDraft,
  isConfirmationScanUpload,
  normalizeScannedDate,
  normalizeScannedReservationType,
  parseScannedReservationsJson,
} from "./scannedReservationDraft";
import { resolveConfirmationScanKind } from "./confirmationDocumentText";

test("normalizeScannedReservationType maps excursion and tour to dinner", () => {
  assert.equal(normalizeScannedReservationType("excursion"), "dinner");
  assert.equal(normalizeScannedReservationType("tour"), "dinner");
  assert.equal(normalizeScannedReservationType("activity"), "dinner");
});

test("isConfirmationScanUpload accepts pdf, images, html, and text", () => {
  assert.equal(isConfirmationScanUpload(new File(["x"], "ticket.pdf", { type: "application/pdf" })), true);
  assert.equal(isConfirmationScanUpload(new File(["x"], "photo.jpg", { type: "image/jpeg" })), true);
  assert.equal(isConfirmationScanUpload(new File(["x"], "confirm.html", { type: "text/html" })), true);
  assert.equal(isConfirmationScanUpload(new File(["x"], "itinerary.txt", { type: "text/plain" })), true);
  assert.equal(isConfirmationScanUpload(new File(["x"], "app.exe", { type: "application/octet-stream" })), false);
});

test("resolveConfirmationScanKind detects pdf by extension only when bytes match", () => {
  assert.equal(
    resolveConfirmationScanKind(new File(["%PDF-1.4"], "confirm.PDF", { type: "application/octet-stream" }), Buffer.from("%PDF-1.4")),
    "pdf",
  );
  assert.equal(
    resolveConfirmationScanKind(
      new File(["<!doctype html>"], "confirm.PDF", { type: "application/pdf" }),
      Buffer.from("<!doctype html><html><body>Flight</body></html>"),
    ),
    "html",
  );
});

test("buildScannedReservationDraft maps flight airports", () => {
  const draft = buildScannedReservationDraft({
    type: "flight",
    provider: "ITA Airways",
    date: "2026-09-12",
    time: "09:40",
    departureAirport: "BRI",
    arrivalAirport: "VCE",
    flightOrTrainNumber: "AZ1234",
    confirmationCode: "ABC123",
  });
  assert.equal(draft.type, "flight");
  assert.equal(draft.flightDepartureAirport, "BRI");
  assert.equal(draft.flightArrivalAirport, "VCE");
  assert.equal(draft.localTime, "2026-09-12 09:40");
});

test("normalizeScannedDate parses slash dates", () => {
  assert.equal(normalizeScannedDate("9/12/2026"), "2026-09-12");
});

test("parseScannedReservationsJson extracts every leg from multi-flight PDF response", () => {
  const json = JSON.stringify({
    reservations: [
      {
        type: "flight",
        provider: "Alaska Airlines",
        flightNumber: "AS123",
        departureAirport: "ONT",
        arrivalAirport: "FCO",
        localTime: "2026-09-01 18:00",
        timezone: "America/Los_Angeles",
      },
      {
        type: "flight",
        provider: "Garuda Indonesia",
        flightNumber: "GA875",
        departureAirport: "MUC",
        arrivalAirport: "CGK",
        localTime: "2026-09-25 11:20",
        timezone: "Europe/Berlin",
      },
      {
        type: "hotel",
        provider: "Hyatt Centric",
        title: "Hyatt Centric Monopoli",
        localTime: "2026-09-09 15:00",
        checkOutDate: "2026-09-12",
        timezone: "Europe/Rome",
        location: "Monopoli, Italy",
      },
    ],
  });
  const drafts = parseScannedReservationsJson(json);
  assert.equal(drafts.length, 3);
  assert.equal(drafts[0]?.flightArrivalAirport, "FCO");
  assert.equal(drafts[1]?.flightArrivalAirport, "CGK");
  assert.equal(drafts[2]?.type, "hotel");
  assert.equal(drafts[2]?.checkOutDate, "2026-09-12");
});

test("parseScannedReservationsJson reads flights[] alias from model output", () => {
  const json = JSON.stringify({
    flights: [
      {
        type: "flight",
        flightNumber: "AZ1607",
        departureAirport: "BRI",
        arrivalAirport: "FCO",
        localTime: "2026-09-12 09:40",
      },
      {
        type: "flight",
        flightNumber: "AZ1608",
        departureAirport: "FCO",
        arrivalAirport: "BRI",
        localTime: "2026-09-19 18:15",
      },
    ],
  });
  assert.equal(parseScannedReservationsJson(json).length, 2);
});

test("parseScannedReservationsJson supports legacy single reservation shape", () => {
  const json = JSON.stringify({
    reservation: {
      type: "flight",
      provider: "ITA Airways",
      date: "2026-09-12",
      time: "09:40",
      departureAirport: "BRI",
      arrivalAirport: "VCE",
      flightOrTrainNumber: "AZ1234",
    },
  });
  const drafts = parseScannedReservationsJson(json);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.localTime, "2026-09-12 09:40");
});
