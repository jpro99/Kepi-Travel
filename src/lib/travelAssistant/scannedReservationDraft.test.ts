import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScannedReservationDraft,
  confirmationScanKind,
  isConfirmationScanUpload,
  normalizeScannedDate,
  parseScannedReservationsJson,
} from "./scannedReservationDraft";

test("isConfirmationScanUpload accepts pdf and images", () => {
  assert.equal(isConfirmationScanUpload(new File(["x"], "ticket.pdf", { type: "application/pdf" })), true);
  assert.equal(isConfirmationScanUpload(new File(["x"], "photo.jpg", { type: "image/jpeg" })), true);
  assert.equal(isConfirmationScanUpload(new File(["x"], "doc.txt", { type: "text/plain" })), false);
});

test("confirmationScanKind detects pdf by extension", () => {
  assert.equal(
    confirmationScanKind(new File(["x"], "confirm.PDF", { type: "application/octet-stream" })),
    "pdf",
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
