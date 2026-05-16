import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendTravelOpsAlertAuditEntry,
  readTravelOpsAlertAuditSnapshot,
} from "@/lib/travelAssistant/opsAlertAuditStore";

test("ops alert audit store persists and reads sweeps", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "travel-ops-alert-audit-test-"));
  const path = join(tempDir, "alert-audit.json");

  try {
    await appendTravelOpsAlertAuditEntry({
      evaluatedAt: "2026-06-21T10:00:00.000Z",
      trigger: "test",
      totalAlerts: 2,
      sentAlerts: 1,
      suppressedAlerts: 1,
      deliveryErrors: 0,
      alerts: [
        {
          key: "worker-unhealthy",
          severity: "critical",
          title: "Worker unhealthy",
          message: "Worker unhealthy",
          createdAt: "2026-06-21T10:00:00.000Z",
          trigger: "test",
        },
      ],
      storagePath: path,
    });

    const snapshot = await readTravelOpsAlertAuditSnapshot({
      storagePath: path,
      limit: 5,
    });
    assert.equal(snapshot.recentSweeps.length, 1);
    assert.equal(snapshot.recentSweeps[0]?.trigger, "test");
    assert.equal(snapshot.recentSweeps[0]?.totalAlerts, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
