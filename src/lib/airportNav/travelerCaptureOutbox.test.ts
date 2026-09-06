import assert from "node:assert/strict";
import test from "node:test";
import {
  countPendingOutboxCaptures,
  peekOutboxCapturesSync,
  upsertOutboxCapture,
  writeOutboxCaptures,
} from "@/lib/airportNav/travelerCaptureOutbox";
import { TRAVELER_CAPTURE_PROVENANCE } from "@/lib/airportNav/travelerCaptureTypes";

function sampleRecord(id: string, syncStatus: "pending" | "synced" | "failed" = "pending") {
  return {
    id,
    provenance: TRAVELER_CAPTURE_PROVENANCE,
    tripId: "trip-1",
    iata: "FCO",
    gateString: "E12",
    capturedAt: "2026-09-06T10:00:00.000Z",
    syncStatus,
    syncedAt: null,
    lastError: null,
  };
}

test("traveler capture outbox: idempotent upsert by op id", async () => {
  await writeOutboxCaptures([]);
  await upsertOutboxCapture(sampleRecord("cap-1"));
  await upsertOutboxCapture({ ...sampleRecord("cap-1"), gateString: "B22" });
  const records = peekOutboxCapturesSync();
  assert.equal(records.length, 1);
  assert.equal(records[0]?.gateString, "B22");
});

test("traveler capture outbox: pending count is honest", async () => {
  await writeOutboxCaptures([
    sampleRecord("a", "pending"),
    sampleRecord("b", "synced"),
    sampleRecord("c", "failed"),
  ]);
  assert.equal(countPendingOutboxCaptures(peekOutboxCapturesSync()), 2);
});
