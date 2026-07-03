import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScannedReservationDraft,
  confirmationScanKind,
  isConfirmationScanUpload,
  normalizeScannedDate,
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
