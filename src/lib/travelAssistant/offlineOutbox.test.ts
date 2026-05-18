import assert from "node:assert/strict";
import test from "node:test";
import {
  appendOfflineOutboxEvent,
  countPendingOfflineOutboxEntries,
  createOfflineOutboxSnapshot,
  replayOfflineOutbox,
} from "@/lib/travelAssistant/offlineOutbox";

test("appendOfflineOutboxEvent suppresses duplicates in dedupe window", () => {
  const first = appendOfflineOutboxEvent({
    snapshot: createOfflineOutboxSnapshot(),
    nowIso: "2026-06-21T10:00:00.000Z",
    event: { key: "reservation-update", message: "Reservation updated", reservationId: "res-1" },
    dedupeWindowMs: 120_000,
  });
  assert.equal(first.duplicateSuppressed, false);
  assert.equal(first.snapshot.entries.length, 1);

  const second = appendOfflineOutboxEvent({
    snapshot: first.snapshot,
    nowIso: "2026-06-21T10:00:45.000Z",
    event: { key: "reservation-update", message: "Reservation updated", reservationId: "res-1" },
    dedupeWindowMs: 120_000,
  });
  assert.equal(second.duplicateSuppressed, true);
  assert.equal(second.snapshot.entries.length, 1);
});

test("replayOfflineOutbox processes oldest pending events first", () => {
  const initial = createOfflineOutboxSnapshot();
  const first = appendOfflineOutboxEvent({
    snapshot: initial,
    nowIso: "2026-06-21T10:00:00.000Z",
    event: { key: "a", message: "first" },
    dedupeWindowMs: 0,
  }).snapshot;
  const second = appendOfflineOutboxEvent({
    snapshot: first,
    nowIso: "2026-06-21T10:01:00.000Z",
    event: { key: "b", message: "second" },
    dedupeWindowMs: 0,
  }).snapshot;

  const delivered: string[] = [];
  const replay = replayOfflineOutbox({
    snapshot: second,
    nowIso: "2026-06-21T10:02:00.000Z",
    maxBatch: 2,
    deliver: (entry) => {
      delivered.push(entry.message);
      return { ok: true };
    },
  });
  assert.equal(replay.replayed, 2);
  assert.deepEqual(delivered, ["first", "second"]);
  assert.equal(countPendingOfflineOutboxEntries(replay.snapshot), 0);
});

test("replayOfflineOutbox applies retry backoff on delivery failures", () => {
  const seeded = appendOfflineOutboxEvent({
    snapshot: createOfflineOutboxSnapshot(),
    nowIso: "2026-06-21T10:00:00.000Z",
    event: { key: "retry", message: "will-fail" },
    dedupeWindowMs: 0,
  }).snapshot;

  const firstAttempt = replayOfflineOutbox({
    snapshot: seeded,
    nowIso: "2026-06-21T10:01:00.000Z",
    backoffBaseMs: 1_000,
    backoffCapMs: 8_000,
    deliver: () => ({ ok: false, error: "network" }),
  });
  assert.equal(firstAttempt.failed, 1);
  const failedEntry = firstAttempt.snapshot.entries[0];
  assert.equal(failedEntry?.status, "failed");
  assert.equal(failedEntry?.attempts, 1);
  assert.equal(failedEntry?.nextAttemptAt, "2026-06-21T10:01:01.000Z");

  const earlyRetry = replayOfflineOutbox({
    snapshot: firstAttempt.snapshot,
    nowIso: "2026-06-21T10:01:00.500Z",
    deliver: () => ({ ok: true }),
  });
  assert.equal(earlyRetry.replayed, 0);
  assert.equal(earlyRetry.failed, 0);

  const secondAttempt = replayOfflineOutbox({
    snapshot: earlyRetry.snapshot,
    nowIso: "2026-06-21T10:01:01.100Z",
    deliver: () => ({ ok: true }),
  });
  assert.equal(secondAttempt.replayed, 1);
  assert.equal(secondAttempt.snapshot.entries[0]?.status, "synced");
});
