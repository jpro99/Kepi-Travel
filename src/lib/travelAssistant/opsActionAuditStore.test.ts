import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  appendTravelOpsActionAuditEntry,
  findTravelOpsActionReplay,
  readTravelOpsActionAuditSnapshot,
} from "@/lib/travelAssistant/opsActionAuditStore";

test("records ops control actions and returns recent snapshots", async () => {
  const auditPath = `tests/ops-audit/${randomUUID()}`;
  await appendTravelOpsActionAuditEntry({
    action: "reset-circuits",
    actor: "qa-operator",
    result: "success",
    requestSummary: "reset all",
    responseSummary: "circuits cleared",
    responsePayload: { ok: true },
    statusCode: 200,
    idempotencyKey: "reset-1",
    replayed: false,
    storagePath: auditPath,
  });

  const snapshot = await readTravelOpsActionAuditSnapshot({
    storagePath: auditPath,
    limit: 5,
  });
  assert.equal(snapshot.recentActions.length, 1);
  assert.equal(snapshot.recentActions[0]?.action, "reset-circuits");
  assert.equal(snapshot.recentActions[0]?.actor, "qa-operator");
});

test("supports idempotency replay lookup by action and key", async () => {
  const auditPath = `tests/ops-audit/${randomUUID()}`;
  const created = await appendTravelOpsActionAuditEntry({
    action: "run-background-once",
    actor: "qa-operator",
    result: "success",
    requestSummary: "background run",
    responseSummary: "completed",
    responsePayload: { ok: true, action: "run-background-once" },
    statusCode: 200,
    idempotencyKey: "run-1",
    replayed: false,
    storagePath: auditPath,
  });

  const replay = await findTravelOpsActionReplay({
    action: "run-background-once",
    idempotencyKey: "run-1",
    storagePath: auditPath,
  });
  assert.notEqual(replay, null);
  assert.equal(replay?.id, created.id);

  const miss = await findTravelOpsActionReplay({
    action: "reset-circuits",
    idempotencyKey: "run-1",
    storagePath: auditPath,
  });
  assert.equal(miss, null);
});
